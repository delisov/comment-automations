import type { MessageEvent } from '@comment-automations/gateway-contract';
import type { EventId } from '@comment-automations/shared';
import { conversationId, extractEmail } from '@comment-automations/shared';
import { sql } from 'kysely';
import type { Db, RunContext } from '../db/types.js';
import { json } from '../db/types.js';
import type { Deps } from '../executor/send.js';
import type { LoadedRun } from './store.js';
import { enqueueJob, finishRun, logRun, saveContext } from './store.js';

export type InboundReply = { eventId: EventId; event: MessageEvent };

const nudgePending = async (db: Db, loaded: LoadedRun): Promise<boolean> =>
  (await db
    .selectFrom('jobs')
    .select('id')
    .where('run_id', '=', loaded.run.id)
    .where('kind', '=', 'nudge')
    .where('status', '=', 'pending')
    .executeTakeFirst()) !== undefined;

export const resumeFromWait = async (
  db: Db,
  loaded: LoadedRun,
  context: RunContext,
  now: Date,
): Promise<void> => {
  await db
    .updateTable('runs')
    .set({
      status: 'running',
      step_index: loaded.run.step_index + 1,
      context: json(context),
      wait_until: null,
      reminder_at: null,
      updated_at: now,
    })
    .where('id', '=', loaded.run.id)
    .where('status', '=', 'waiting')
    .execute();
  await db
    .updateTable('jobs')
    .set({ status: 'done' })
    .where('run_id', '=', loaded.run.id)
    .where('status', '=', 'pending')
    .execute();
  await enqueueJob(db, 'advance', loaded.run.id, now);
};

export const pendingReplies = async (db: Db, loaded: LoadedRun): Promise<InboundReply[]> => {
  const { lastInboundAt, consumedEventIds = [] } = loaded.run.context;
  const since =
    lastInboundAt === undefined
      ? loaded.triggerCreatedAt
      : new Date(Math.max(loaded.triggerCreatedAt.getTime(), Date.parse(lastInboundAt)));
  const createdAt = sql`(payload->>'createdAt')::timestamptz`;
  let query = db
    .selectFrom('events')
    .select(['id', 'payload'])
    .where('platform', '=', loaded.account.platform)
    .where('account_id', '=', loaded.account.externalId)
    .where('kind', '=', 'message')
    .where(sql`payload->>'senderId'`, '=', loaded.contact.externalId)
    .where(createdAt, '>=', since)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(selectFrom('runs').select('id').whereRef('runs.trigger_event_id', '=', 'events.id')),
      ),
    )
    .orderBy(createdAt)
    .orderBy('received_at')
    .orderBy('id');
  if (consumedEventIds.length > 0) {
    query = query.where('id', 'not in', consumedEventIds);
  }
  const rows = await query.execute();
  return rows.flatMap((row) =>
    row.payload.kind === 'message' ? [{ eventId: row.id, event: row.payload }] : [],
  );
};

export const repliesToProcess = (
  replies: InboundReply[],
  expect: 'email' | 'any',
): InboundReply[] => {
  if (expect === 'any') {
    return replies.slice(0, 1);
  }
  const withEmail = replies.findIndex(({ event }) => extractEmail(event.text) !== null);
  return withEmail === -1 ? replies : replies.slice(0, withEmail + 1);
};

export const resumeWaitingRun = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  replies: InboundReply[],
): Promise<boolean> => {
  const reply = replies.at(-1);
  if (reply === undefined) {
    return false;
  }
  const { event } = reply;
  const now = deps.clock.now();
  const { run } = loaded;
  const stepIndex = run.step_index;
  if (run.wait_until !== null && run.wait_until.getTime() < now.getTime()) {
    await finishRun(
      db,
      run.id,
      'expired',
      now,
      { stepIndex, message: 'Gave up waiting for a reply' },
      null,
      ['waiting'],
    );
    return false;
  }
  const step = loaded.definition.steps[stepIndex];
  const context: RunContext = {
    ...run.context,
    conversationId: conversationId(event.conversationId),
    lastInboundAt: event.createdAt,
    consumedEventIds: [
      ...(run.context.consumedEventIds ?? []),
      ...replies.map((consumed) => consumed.eventId),
    ],
    replied: true,
  };
  if (step?.kind !== 'wait_for_reply') {
    await saveContext(db, run.id, context, now, 'waiting');
    return true;
  }
  if (step.expect === 'any') {
    await logRun(db, run.id, now, { stepIndex, message: 'Reply received' });
    await resumeFromWait(db, loaded, context, now);
    return true;
  }
  const email = extractEmail(event.text);
  if (email !== null) {
    await db
      .updateTable('contacts')
      .set({ email, updated_at: now })
      .where('id', '=', loaded.contact.id)
      .execute();
    await logRun(db, run.id, now, {
      stepIndex,
      message: 'Reply received with an email',
      context: { email },
    });
    await resumeFromWait(db, loaded, { ...context, captured: { ...context.captured, email } }, now);
    return true;
  }
  await saveContext(db, run.id, context, now, 'waiting');
  if (step.nudge !== undefined && !run.nudged) {
    if (!(await nudgePending(db, loaded))) {
      await enqueueJob(db, 'nudge', run.id, now);
      return true;
    }
  } else if (step.nudge?.then === 'end') {
    await finishRun(db, run.id, 'expired', now, {
      stepIndex,
      message: 'Reply received without an email · stopped',
    });
    return true;
  }
  await logRun(db, run.id, now, {
    stepIndex,
    message: 'Reply received without an email · still waiting',
  });
  return true;
};
