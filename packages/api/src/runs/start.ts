import type { AccountId, ContactId, EventId, RunId } from '@comment-automations/shared';
import type { Db, RunContext } from '../db/types.js';
import { json } from '../db/types.js';
import type { LiveAutomation } from './match.js';
import { ACTIVE_STATUSES, enqueueJob, finishRun, logRun } from './store.js';

export type StartRunInput = {
  automation: LiveAutomation;
  accountId: AccountId;
  contactId: ContactId;
  triggerEventId: EventId;
  context: RunContext;
  startedFrom: 'comment' | 'message';
  now: Date;
};

export const liveAutomations = async (db: Db, accountId: AccountId): Promise<LiveAutomation[]> => {
  const rows = await db
    .selectFrom('automations')
    .innerJoin('automation_versions', 'automation_versions.id', 'automations.active_version_id')
    .select([
      'automations.id',
      'automation_versions.id as versionId',
      'automation_versions.definition',
    ])
    .where('automations.account_id', '=', accountId)
    .where('automations.state', '=', 'live')
    .orderBy('automations.created_at')
    .execute();
  return rows.map((row) => ({ id: row.id, versionId: row.versionId, definition: row.definition }));
};

export const startRun = async (db: Db, input: StartRunInput): Promise<RunId | undefined> => {
  const { automation, now } = input;
  const commentId = input.context.commentId ?? null;
  for (;;) {
    if (commentId !== null) {
      const handled = await db
        .selectFrom('runs')
        .select('id')
        .where('automation_id', '=', automation.id)
        .where('comment_id', '=', commentId)
        .executeTakeFirst();
      if (handled !== undefined) {
        await logRun(db, handled.id, now, {
          stepIndex: null,
          message: 'Ignored a redelivered comment: this run already handles it',
          context: { triggerEventId: input.triggerEventId },
        });
        return undefined;
      }
    }
    const active = await db
      .selectFrom('runs')
      .select(['id', 'step_index'])
      .where('automation_id', '=', automation.id)
      .where('contact_id', '=', input.contactId)
      .where('status', 'in', ACTIVE_STATUSES)
      .forUpdate()
      .executeTakeFirst();
    if (active !== undefined) {
      if (automation.definition.trigger.onRepeatWhileWaiting === 'ignore') {
        return undefined;
      }
      await finishRun(db, active.id, 'superseded', now, {
        stepIndex: active.step_index,
        message: 'Stopped: a newer run took over this conversation',
      });
    }
    const inserted = await db
      .insertInto('runs')
      .values({
        automation_id: automation.id,
        version_id: automation.versionId,
        account_id: input.accountId,
        contact_id: input.contactId,
        trigger_event_id: input.triggerEventId,
        comment_id: commentId,
        status: 'running',
        step_index: 0,
        context: json(input.context),
        error: null,
        started_at: now,
        updated_at: now,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted === undefined) {
      continue;
    }
    await logRun(db, inserted.id, now, {
      stepIndex: null,
      message:
        input.startedFrom === 'comment' ? 'Started from a comment' : 'Started from a message',
      context: { supersededRunId: active?.id ?? null },
    });
    await enqueueJob(db, 'advance', inserted.id, now);
    return inserted.id;
  }
};
