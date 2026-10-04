import type { RunId, SendMessageStep, Step, WaitForReplyStep } from '@comment-automations/shared';
import { canRemindBeforeReply } from '@comment-automations/shared';
import type { Db, RunContext, RunError } from '../db/types.js';
import { json } from '../db/types.js';
import type { LoadedRun } from '../runs/store.js';
import {
  enqueueJob,
  failRun,
  finishRun,
  inTransaction,
  loadRun,
  logMovedOn,
  logRun,
  saveContext,
} from '../runs/store.js';
import type { Deps, StepFailure } from './send.js';
import { gatewayFailure, lastInboundOf, replyPublicly, sendToContact } from './send.js';
import { hoursToMs } from './windows.js';
import { callWebhook } from './webhook.js';

export type JobOutcome = { kind: 'done' } | { kind: 'retry'; error: RunError };

type StepOutcome =
  | { kind: 'next'; context?: RunContext }
  | { kind: 'wait' }
  | { kind: 'fail'; error: RunError }
  | { kind: 'retry'; error: RunError };

const STARTED_FROM_MESSAGE = 'Skipped: this run started from a message, not a comment';

const failure = (outcome: StepFailure): StepOutcome =>
  outcome.retryable
    ? { kind: 'retry', error: outcome.error }
    : { kind: 'fail', error: outcome.error };

const replyToComment = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  text: string,
): Promise<StepOutcome> => {
  const stepIndex = loaded.run.step_index;
  if (loaded.run.context.commentId === undefined) {
    await logRun(db, loaded.run.id, deps.clock.now(), { stepIndex, message: STARTED_FROM_MESSAGE });
    return { kind: 'next' };
  }
  if (!loaded.record.publicReply) {
    return {
      kind: 'fail',
      error: {
        code: 'UNSUPPORTED',
        message: "Couldn't reply: this platform has no public replies to comments",
      },
    };
  }
  const result = await replyPublicly(deps, db, loaded, stepIndex, 'reply', text);
  if (!result.ok) {
    return failure(gatewayFailure(result.error, loaded, lastInboundOf(loaded.run.context)));
  }
  await logRun(db, loaded.run.id, deps.clock.now(), {
    stepIndex,
    message: 'Replied to the comment',
    context: { replyId: result.value.replyId },
  });
  return { kind: 'next' };
};

const sendMessage = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  step: SendMessageStep,
): Promise<StepOutcome> => {
  const stepIndex = loaded.run.step_index;
  const runId = loaded.run.id;
  const sent = await sendToContact(deps, db, loaded, stepIndex, 'message', step.text, step.buttons);
  if (sent.ok) {
    const next = loaded.definition.steps[stepIndex + 1];
    await logRun(db, runId, deps.clock.now(), {
      stepIndex,
      message:
        next?.kind === 'wait_for_reply'
          ? 'Sent the message asking for a reply'
          : 'Sent the message',
      context: { via: sent.via, ...(sent.response as Record<string, unknown>) },
    });
    return { kind: 'next', context: sent.context };
  }
  if (sent.error.code !== 'RECIPIENT_UNREACHABLE') {
    return failure(sent);
  }
  switch (step.onUnreachable) {
    case 'skip':
      await logRun(db, runId, deps.clock.now(), {
        stepIndex,
        level: 'warn',
        message: "Skipped the message: the contact doesn't accept messages from this account",
      });
      return { kind: 'next' };
    case 'publicReplyInstead': {
      if (loaded.run.context.commentId === undefined) {
        await logRun(db, runId, deps.clock.now(), { stepIndex, message: STARTED_FROM_MESSAGE });
        return { kind: 'next' };
      }
      const reply = await replyPublicly(
        deps,
        db,
        loaded,
        stepIndex,
        'fallback',
        step.fallbackText ?? '',
      );
      if (!reply.ok) {
        return failure(gatewayFailure(reply.error, loaded, lastInboundOf(loaded.run.context)));
      }
      await logRun(db, runId, deps.clock.now(), {
        stepIndex,
        message: "Replied publicly instead: the contact doesn't accept messages from this account",
        context: { replyId: reply.value.replyId },
      });
      return { kind: 'next' };
    }
    default:
      return failure(sent);
  }
};

const waitForReply = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  step: WaitForReplyStep,
): Promise<StepOutcome> => {
  const now = deps.clock.now();
  const runId = loaded.run.id;
  const waitUntil = new Date(now.getTime() + hoursToMs(step.giveUpHours));
  const reminderAt =
    step.reminder !== undefined && canRemindBeforeReply(loaded.record)
      ? new Date(now.getTime() + hoursToMs(step.reminder.afterHours))
      : null;
  await inTransaction(db, async (trx) => {
    const result = await trx
      .updateTable('runs')
      .set({
        status: 'waiting',
        wait_until: waitUntil,
        reminder_at: reminderAt,
        reminder_sent: false,
        nudged: false,
        updated_at: now,
      })
      .where('id', '=', runId)
      .where('status', '=', 'running')
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      await logMovedOn(trx, runId, now, loaded.run.step_index, 'waiting');
      return;
    }
    await enqueueJob(trx, 'give_up', runId, waitUntil);
    if (reminderAt !== null) {
      await enqueueJob(trx, 'reminder', runId, reminderAt);
    }
    await logRun(trx, runId, now, {
      stepIndex: loaded.run.step_index,
      message: `Waiting for a reply · gives up at ${waitUntil.toISOString()}`,
      context: {
        waitUntil: waitUntil.toISOString(),
        reminderAt: reminderAt?.toISOString() ?? null,
      },
    });
  });
  return { kind: 'wait' };
};

const executeStep = (deps: Deps, db: Db, loaded: LoadedRun, step: Step): Promise<StepOutcome> => {
  switch (step.kind) {
    case 'reply_to_comment':
      return replyToComment(deps, db, loaded, step.text);
    case 'send_message':
      return sendMessage(deps, db, loaded, step);
    case 'wait_for_reply':
      return waitForReply(deps, db, loaded, step);
    case 'call_webhook':
      return callWebhook(deps, db, loaded, step);
  }
};

export const advance = async (deps: Deps, runId: RunId): Promise<JobOutcome> => {
  for (;;) {
    const loaded = await loadRun(deps.db, runId);
    if (loaded === undefined || loaded.run.status !== 'running') {
      return { kind: 'done' };
    }
    const step = loaded.definition.steps[loaded.run.step_index];
    if (step === undefined) {
      await finishRun(
        deps.db,
        runId,
        'completed',
        deps.clock.now(),
        { stepIndex: null, message: 'Completed' },
        null,
        ['running'],
      );
      return { kind: 'done' };
    }
    const outcome = await executeStep(deps, deps.db, loaded, step);
    switch (outcome.kind) {
      case 'next': {
        const now = deps.clock.now();
        const saved = await saveContext(
          deps.db,
          runId,
          outcome.context ?? loaded.run.context,
          now,
          'running',
          { step_index: loaded.run.step_index + 1 },
        );
        if (!saved) {
          await logMovedOn(deps.db, runId, now, loaded.run.step_index, 'next step');
          return { kind: 'done' };
        }
        break;
      }
      case 'wait':
        return { kind: 'done' };
      case 'fail':
        await failRun(deps.db, loaded, outcome.error, deps.clock.now());
        return { kind: 'done' };
      case 'retry':
        return outcome;
    }
  }
};

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
