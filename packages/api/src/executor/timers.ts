import type { RunId } from '@comment-automations/shared';
import { finishRun, loadRun, logRun, saveContext } from '../runs/store.js';
import type { JobOutcome } from './advance.js';
import type { Deps } from './send.js';
import { sendToContact } from './send.js';

export const reminder = async (deps: Deps, runId: RunId): Promise<JobOutcome> => {
  const loaded = await loadRun(deps.db, runId);
  if (loaded === undefined || loaded.run.status !== 'waiting' || loaded.run.reminder_sent) {
    return { kind: 'done' };
  }
  const { run } = loaded;
  const step = loaded.definition.steps[run.step_index];
  if (run.context.replied || step?.kind !== 'wait_for_reply' || step.reminder === undefined) {
    return { kind: 'done' };
  }
  const sent = await sendToContact(
    deps,
    deps.db,
    loaded,
    run.step_index,
    'reminder',
    step.reminder.text,
    [],
  );
  if (!sent.ok && sent.retryable) {
    return { kind: 'retry', error: sent.error };
  }
  await saveContext(deps.db, runId, sent.ok ? sent.context : run.context, deps.clock.now(), {
    reminder_sent: true,
  });
  await logRun(deps.db, runId, deps.clock.now(), {
    stepIndex: run.step_index,
    level: sent.ok ? 'info' : 'warn',
    message: sent.ok ? 'Reminder sent' : `Couldn't send the reminder: ${sent.error.message}`,
    context: sent.ok ? (sent.response as Record<string, unknown>) : { code: sent.error.code },
  });
  return { kind: 'done' };
};

export const giveUp = async (deps: Deps, runId: RunId): Promise<JobOutcome> => {
  const loaded = await loadRun(deps.db, runId);
  const now = deps.clock.now();
  if (
    loaded === undefined ||
    loaded.run.status !== 'waiting' ||
    loaded.run.wait_until === null ||
    loaded.run.wait_until.getTime() > now.getTime()
  ) {
    return { kind: 'done' };
  }
  await finishRun(deps.db, runId, 'expired', now, {
    stepIndex: loaded.run.step_index,
    message: 'Gave up waiting for a reply',
  });
  return { kind: 'done' };
};
