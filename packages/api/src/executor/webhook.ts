import type { CallWebhookStep } from '@comment-automations/shared';
import type { Db } from '../db/types.js';
import { json } from '../db/types.js';
import type { LoadedRun } from '../runs/store.js';
import { logRun } from '../runs/store.js';
import type { Deps } from './send.js';

const TIMEOUT_MS = 15_000;

type Delivery = { status: number } | { failure: string };

const attempt = async (
  fetchFn: typeof fetch,
  step: CallWebhookStep,
  body: string,
): Promise<Delivery> => {
  try {
    const response = await fetchFn(step.url, {
      method: step.method,
      headers: { 'content-type': 'application/json', ...step.headers },
      body: step.method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
};

const delivered = (delivery: Delivery): boolean =>
  'status' in delivery && delivery.status >= 200 && delivery.status < 300;

export const callWebhook = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  step: CallWebhookStep,
): Promise<{ kind: 'next' }> => {
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
  let delivery = await attempt(deps.fetch, step, body);
  if (!delivered(delivery)) {
    delivery = await attempt(deps.fetch, step, body);
  }
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
  await logRun(db, run.id, now, {
    stepIndex: run.step_index,
    level: delivered(delivery) ? 'info' : 'warn',
    message: delivered(delivery)
      ? `Webhook delivered (${(delivery as { status: number }).status})`
      : 'status' in delivery
        ? `Webhook failed (${delivery.status})`
        : `Webhook failed: ${delivery.failure}`,
    context: { url: step.url, ...delivery },
  });
  return { kind: 'next' };
};
