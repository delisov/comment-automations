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

  const record = (
    event: InboundEvent,
    attempt: number,
    status: 'delivered' | 'failed' | 'dropped',
  ) =>
    db
      .insertInto('deliveries')
      .values({ event_id: eventId(event.eventId), attempt, status, at: clock.now() })
      .execute();

  const post = async (event: InboundEvent): Promise<boolean> => {
    try {
      const response = await fetch(`${deps.serviceUrl}/ingest/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-token': deps.serviceToken },
        body: JSON.stringify({ events: [event] }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const attempt = async (event: InboundEvent, number: number): Promise<void> => {
    const delivered = await post(event);
    await record(event, number, delivered ? 'delivered' : 'failed');
    const backoff = retryDelaysMs[number - 1];
    if (!delivered && backoff !== undefined) {
      later(backoff, () => attempt(event, number + 1));
    }
  };

  const flush = async () => {
    const batch = shuffle(held, random);
    held = [];
    flushScheduled = false;
    for (const event of batch) {
      await attempt(event, 1);
    }
  };

  const hold = async (event: InboundEvent, reorderWindowMs: number) => {
    if (reorderWindowMs <= 0) {
      return attempt(event, 1);
    }
    held.push(event);
    if (!flushScheduled) {
      flushScheduled = true;
      later(reorderWindowMs, flush);
    }
  };

  const dispatch = async (event: InboundEvent) => {
    const settings = await readSettings(db);
    const dropped = random() * 100 < settings.drop_percent;
    const duplicated = !dropped && random() * 100 < settings.duplicate_percent;
    await logEvent(db, {
      direction: 'to_service',
      kind: event.kind,
      payload: event,
      resultCode: dropped ? 'DROPPED' : duplicated ? 'DUPLICATED' : null,
      at: clock.now(),
    });
    if (dropped) {
      await record(event, 0, 'dropped');
      return;
    }
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
