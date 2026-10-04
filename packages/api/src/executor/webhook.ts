import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { CallWebhookStep } from '@comment-automations/shared';
import type { Db, RunError } from '../db/types.js';
import { json } from '../db/types.js';
import type { LoadedRun } from '../runs/store.js';
import { logRun } from '../runs/store.js';
import type { Deps } from './send.js';

const TIMEOUT_MS = 10_000;

type Failure = 'private_address' | 'timeout' | 'unreachable';

type Delivery = { status: number } | { failure: Failure };

const FAILURE_REASONS: Record<Failure, string> = {
  private_address: 'private address',
  timeout: 'timed out',
  unreachable: 'unreachable',
};

const privateV4 = (address: string): boolean => {
  const [a = 0, b = 0] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const v6Groups = (address: string): number[] | undefined => {
  const [head = '', tail] = address.split('::');
  const expand = (part: string): number[] =>
    part === ''
      ? []
      : part.split(':').flatMap((group) => {
          if (group.includes('.')) {
            const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);
            return [(a << 8) | b, (c << 8) | d];
          }
          return [parseInt(group, 16)];
        });
  const left = expand(head);
  const right = tail === undefined ? [] : expand(tail);
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) {
    return undefined;
  }
  return [...left, ...new Array<number>(missing).fill(0), ...right];
};

const privateV6 = (address: string): boolean => {
  const groups = v6Groups(address);
  if (groups === undefined) {
    return true;
  }
  const [first = 0, , , , , fifth = 0, sixth = 0, seventh = 0] = groups;
  const leadingZero = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZero && fifth === 0xffff) {
    return privateV4(`${sixth >> 8}.${sixth & 0xff}.${seventh >> 8}.${seventh & 0xff}`);
  }
  if (leadingZero && fifth === 0 && sixth === 0 && seventh <= 1) {
    return true;
  }
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
};

export const isPrivateAddress = (address: string): boolean =>
  isIP(address) === 4 ? privateV4(address) : privateV6(address);

const resolvesToPrivate = async (url: string): Promise<boolean> => {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) !== 0) {
    return isPrivateAddress(hostname);
  }
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some((entry) => isPrivateAddress(entry.address));
  } catch {
    return false;
  }
};

const attempt = async (deps: Deps, step: CallWebhookStep, body: string): Promise<Delivery> => {
  try {
    if (!deps.webhookAllowPrivate && (await resolvesToPrivate(step.url))) {
      return { failure: 'private_address' };
    }
    const response = await deps.fetch(step.url, {
      method: step.method,
      headers: { 'content-type': 'application/json', ...step.headers },
      body: step.method === 'GET' ? undefined : body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status };
  } catch (error) {
    return {
      failure: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable',
    };
  }
};

const delivered = (delivery: Delivery): boolean =>
  'status' in delivery && delivery.status >= 200 && delivery.status < 300;

const refused = (delivery: Delivery): boolean =>
  'failure' in delivery && delivery.failure === 'private_address';

const reason = (delivery: Delivery): string =>
  'failure' in delivery ? FAILURE_REASONS[delivery.failure] : String(delivery.status);

export const callWebhook = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  step: CallWebhookStep,
): Promise<{ kind: 'next' } | { kind: 'retry'; error: RunError }> => {
  const { run, automation, version, contact } = loaded;
  const payload = {
    automation: { id: automation.id, name: automation.name },
    version: { id: version.id, number: version.number },
    run: { id: run.id, startedAt: run.started_at.toISOString() },
    contact: {
      id: contact.id,
      handle: contact.handle,
      externalId: contact.externalId,
      email: contact.email,
    },
    captured: run.context.captured,
  };
  const body = json(payload);
  const delivery = await attempt(deps, step, body);
  const now = deps.clock.now();
  await db
    .insertInto('outbound_calls')
    .values({
      run_id: run.id,
      idempotency_key: `${run.id}:${run.step_index}:webhook`,
      kind: 'webhook',
      request: json({ method: step.method, url: step.url, body: payload }),
      response: json(delivery),
      status: delivered(delivery) ? 'ok' : 'failed',
      at: now,
    })
    .onConflict((conflict) =>
      conflict.column('idempotency_key').doUpdateSet({ response: json(delivery), at: now }),
    )
    .execute();
  if (!delivered(delivery) && !refused(delivery)) {
    return {
      kind: 'retry',
      error: {
        code: 'WEBHOOK_FAILED',
        message: `Webhook failed (${reason(delivery)}): check the webhook receiver; the run's data was not delivered`,
      },
    };
  }
  await logRun(db, run.id, now, {
    stepIndex: run.step_index,
    level: delivered(delivery) ? 'info' : 'warn',
    message: delivered(delivery)
      ? `Webhook delivered (${reason(delivery)})`
      : 'Webhook refused: the address is private',
    context: { url: step.url, ...delivery },
  });
  return { kind: 'next' };
};
