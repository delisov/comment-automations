import type { MessageEvent } from '@comment-automations/gateway-contract';
import { conversationId, extractEmail } from '@comment-automations/shared';
import type { Db, RunContext } from '../db/types.js';
import { resumeFromWait } from '../executor/advance.js';
import type { Deps } from '../executor/send.js';
import type { LoadedRun } from './store.js';
import { enqueueJob, finishRun, logRun, saveContext } from './store.js';

const nudgePending = async (db: Db, loaded: LoadedRun): Promise<boolean> =>
  (await db
    .selectFrom('jobs')
    .select('id')
    .where('run_id', '=', loaded.run.id)
    .where('kind', '=', 'nudge')
    .where('status', '=', 'pending')
    .executeTakeFirst()) !== undefined;

export const resumeWaitingRun = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  event: MessageEvent,
): Promise<void> => {
  const now = deps.clock.now();
  const { run } = loaded;
  const stepIndex = run.step_index;
  const step = loaded.definition.steps[stepIndex];
  const context: RunContext = {
    ...run.context,
    conversationId: conversationId(event.conversationId),
    lastInboundAt: event.createdAt,
    replied: true,
  };
  if (step?.kind !== 'wait_for_reply') {
    await saveContext(db, run.id, context, now, 'waiting');
    return;
  }
  if (step.expect === 'any') {
    await logRun(db, run.id, now, { stepIndex, message: 'Reply received' });
    await resumeFromWait(db, loaded, context, now);
    return;
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
    return;
  }
  await saveContext(db, run.id, context, now, 'waiting');
  if (step.nudge !== undefined && !run.nudged) {
    if (!(await nudgePending(db, loaded))) {
      await enqueueJob(db, 'nudge', run.id, now);
      return;
    }
  } else if (step.nudge?.then === 'end') {
    await finishRun(db, run.id, 'expired', now, {
      stepIndex,
      message: 'Reply received without an email · stopped',
    });
    return;
  }
  await logRun(db, run.id, now, {
    stepIndex,
    message: 'Reply received without an email · still waiting',
  });
};
