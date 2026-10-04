import type { InboundEvent } from '@comment-automations/gateway-contract';
import type { Clock } from '@comment-automations/shared';
import { eventId } from '@comment-automations/shared';
import type { Db } from './db/database.js';
import { logEvent, readSettings } from './store.js';

export type DeliveryDeps = {
  db: Db;
  clock: Clock;
  serviceUrl: string;
  serviceToken: string;
  retryDelaysMs: number[];
  random: () => number;
};

export const RETRY_DELAYS_MS = [1000, 5000, 15000, 30000, 60000, 120000];
const MAX_ATTEMPTS = 20;
const GIVE_UP_AFTER_MS = 36 * 60 * 60 * 1000;

type NetworkDrop = 'not received' | 'response lost';

export type Delivery = {
  send(event: InboundEvent): void;
  close(): void;
};

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
};

export const createDelivery = (deps: DeliveryDeps): Delivery => {
  const { db, clock, retryDelaysMs, random } = deps;
  const timers = new Set<NodeJS.Timeout>();
  let held: InboundEvent[] = [];
  let flushScheduled = false;

  const later = (ms: number, task: () => Promise<void>) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      void task();
    }, ms);
    timers.add(timer);
  };

  const record = (event: InboundEvent, attempt: number, status: 'delivered' | 'failed') =>
    db
      .insertInto('deliveries')
      .values({ event_id: eventId(event.eventId), attempt, status, at: clock.now() })
      .execute();

  const post = async (event: InboundEvent): Promise<number | null> => {
    try {
      const response = await fetch(`${deps.serviceUrl}/ingest/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-token': deps.serviceToken },
        body: JSON.stringify({ events: [event] }),
      });
      return response.status;
    } catch {
      return null;
    }
  };

  const networkDrop = async (): Promise<NetworkDrop | null> => {
    const settings = await readSettings(db);
    if (random() * 100 >= settings.drop_percent) {
      return null;
    }
    return random() < 0.5 ? 'not received' : 'response lost';
  };

  const attempt = async (event: InboundEvent, number: number, firstAt: Date): Promise<void> => {
    const drop = await networkDrop();
    const status = drop === 'not received' ? null : await post(event);
    const delivered = drop === null && status !== null && status >= 200 && status < 300;
    await record(event, number, delivered ? 'delivered' : 'failed');
    if (delivered) {
      return;
    }
    const backoff = retryDelaysMs[Math.min(number, retryDelaysMs.length) - 1];
    const exhausted =
      backoff === undefined ||
      number >= MAX_ATTEMPTS ||
      clock.now().getTime() - firstAt.getTime() >= GIVE_UP_AFTER_MS;
    const retryInMs = exhausted ? null : backoff;
    await logEvent(db, {
      direction: 'to_service',
      kind: event.kind,
      payload:
        drop === null
          ? { eventId: event.eventId, attempt: number, status, retryInMs }
          : { eventId: event.eventId, attempt: number, shape: drop, retryInMs },
      resultCode: drop === null ? 'SERVICE_ERROR' : 'NETWORK_DROP',
      at: clock.now(),
    });
    if (retryInMs === null) {
      await logEvent(db, {
        direction: 'to_service',
        kind: event.kind,
        payload: { eventId: event.eventId, attempts: number },
        resultCode: 'GAVE_UP',
        at: clock.now(),
      });
      return;
    }
    later(retryInMs, () => attempt(event, number + 1, firstAt));
  };

  const first = (event: InboundEvent) => attempt(event, 1, clock.now());

  const flush = async () => {
    const batch = shuffle(held, random);
    held = [];
    flushScheduled = false;
    for (const event of batch) {
      await first(event);
    }
  };

  const hold = async (event: InboundEvent, reorderWindowMs: number) => {
    if (reorderWindowMs <= 0) {
      return first(event);
    }
    held.push(event);
    if (!flushScheduled) {
      flushScheduled = true;
      later(reorderWindowMs, flush);
    }
  };

  const dispatch = async (event: InboundEvent) => {
    const settings = await readSettings(db);
    const duplicated = random() * 100 < settings.duplicate_percent;
    await logEvent(db, {
      direction: 'to_service',
      kind: event.kind,
      payload: event,
      resultCode: duplicated ? 'DUPLICATED' : null,
      at: clock.now(),
    });
    for (let copy = 0; copy < (duplicated ? 2 : 1); copy += 1) {
      later(settings.delay_ms, () => hold(event, settings.reorder_window_ms));
    }
  };

  return {
    send: (event) => {
      void dispatch(event);
    },
    close: () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
};
