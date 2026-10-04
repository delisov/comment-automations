import type { MessageEvent } from '@comment-automations/gateway-contract';
import { conversationId, extractEmail } from '@comment-automations/shared';
import type { Db, RunContext } from '../db/types.js';
import { resumeFromWait } from '../executor/advance.js';
import type { Deps } from '../executor/send.js';
import { sendToContact } from '../executor/send.js';
import type { LoadedRun } from './store.js';
import { finishRun, logRun, saveContext } from './store.js';

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
    await saveContext(db, run.id, context, now);
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
  if (step.nudge !== undefined && !run.nudged) {
    const withContext: LoadedRun = { ...loaded, run: { ...run, context } };
    const sent = await sendToContact(
      deps,
      db,
      withContext,
      stepIndex,
      'nudge',
      step.nudge.text,
      [],
    );
    await saveContext(db, run.id, sent.ok ? sent.context : context, now, { nudged: true });
    await logRun(db, run.id, now, {
      stepIndex,
      level: sent.ok ? 'info' : 'warn',
      message: sent.ok ? 'Asked once more' : `Couldn't ask once more: ${sent.error.message}`,
      context: sent.ok ? (sent.response as Record<string, unknown>) : { code: sent.error.code },
    });
    return;
  }
  if (step.nudge?.then === 'end') {
    await saveContext(db, run.id, context, now);
    await finishRun(db, run.id, 'expired', now, {
      stepIndex,
      message: 'Reply received without an email · stopped',
    });
    return;
  }
  await saveContext(db, run.id, context, now);
  await logRun(db, run.id, now, {
    stepIndex,
    message: 'Reply received without an email · still waiting',
  });
};
