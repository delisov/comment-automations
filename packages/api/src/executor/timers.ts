import type { RunId } from '@comment-automations/shared';
import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Db, RunsTable } from '../db/types.js';
import { json } from '../db/types.js';
import type { LoadedRun } from '../runs/store.js';
import { finishRun, loadRun, lockRun, logRun } from '../runs/store.js';
import type { JobOutcome } from './advance.js';
import type { Deps } from './send.js';
import { sendToContact } from './send.js';

type Courtesy = {
  purpose: 'reminder' | 'nudge';
  text: string;
  sentMessage: string;
  failedMessage: string;
  onSent: Partial<Pick<Selectable<RunsTable>, 'reminder_sent' | 'nudged'>>;
  onFailed: Partial<Pick<Selectable<RunsTable>, 'reminder_sent' | 'nudged'>>;
};

const lockWaitingRun = async (trx: Db, runId: RunId): Promise<LoadedRun | undefined> => {
  const locked = await lockRun(trx, runId);
  return locked?.status === 'waiting' ? loadRun(trx, runId) : undefined;
};

const sendWhileWaiting = (
  deps: Deps,
  runId: RunId,
  pick: (loaded: LoadedRun) => Courtesy | undefined,
): Promise<JobOutcome> =>
  deps.db.transaction().execute(async (trx) => {
    const loaded = await lockWaitingRun(trx, runId);
    const courtesy = loaded === undefined ? undefined : pick(loaded);
    if (loaded === undefined || courtesy === undefined) {
      return { kind: 'done' };
    }
    const stepIndex = loaded.run.step_index;
    const sent = await sendToContact(
      deps,
      trx,
      loaded,
      stepIndex,
      courtesy.purpose,
      courtesy.text,
      [],
    );
    if (!sent.ok && sent.retryable) {
      return { kind: 'retry', error: sent.error };
    }
    const now = deps.clock.now();
    const merged = sent.ok ? { conversationId: sent.context.conversationId } : {};
    await trx
      .updateTable('runs')
      .set({
        ...(sent.ok ? courtesy.onSent : courtesy.onFailed),
        context: sql`context || ${json(merged)}::jsonb`,
        updated_at: now,
      })
      .where('id', '=', runId)
      .where('status', '=', 'waiting')
      .execute();
    await logRun(trx, runId, now, {
      stepIndex,
      level: sent.ok ? 'info' : 'warn',
      message: sent.ok ? courtesy.sentMessage : `${courtesy.failedMessage}: ${sent.error.message}`,
      context: sent.ok ? (sent.response as Record<string, unknown>) : { code: sent.error.code },
    });
    return { kind: 'done' };
  });

export const reminder = (deps: Deps, runId: RunId): Promise<JobOutcome> =>
  sendWhileWaiting(deps, runId, ({ run, definition }) => {
    const step = definition.steps[run.step_index];
    if (
      run.reminder_sent ||
      run.context.replied ||
      step?.kind !== 'wait_for_reply' ||
      step.reminder === undefined
    ) {
      return undefined;
    }
    return {
      purpose: 'reminder',
      text: step.reminder.text,
      sentMessage: 'Reminder sent',
      failedMessage: "Couldn't send the reminder",
      onSent: { reminder_sent: true },
      onFailed: { reminder_sent: true },
    };
  });

export const nudge = (deps: Deps, runId: RunId): Promise<JobOutcome> =>
  sendWhileWaiting(deps, runId, ({ run, definition }) => {
    const step = definition.steps[run.step_index];
    if (run.nudged || step?.kind !== 'wait_for_reply' || step.nudge === undefined) {
      return undefined;
    }
    return {
      purpose: 'nudge',
      text: step.nudge.text,
      sentMessage: 'Asked once more',
      failedMessage: "Couldn't ask once more",
      onSent: { nudged: true },
      onFailed: {},
    };
  });

export const giveUp = (deps: Deps, runId: RunId): Promise<JobOutcome> =>
  deps.db.transaction().execute(async (trx) => {
    const now = deps.clock.now();
    const locked = await lockRun(trx, runId);
    if (
      locked?.status !== 'waiting' ||
      locked.wait_until === null ||
      locked.wait_until.getTime() > now.getTime()
    ) {
      return { kind: 'done' };
    }
    await finishRun(
      trx,
      runId,
      'expired',
      now,
      { stepIndex: locked.step_index, message: 'Gave up waiting for a reply' },
      null,
      ['waiting'],
    );
    return { kind: 'done' };
  });
