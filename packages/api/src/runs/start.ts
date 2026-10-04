import type { AccountId, ContactId, EventId, RunId } from '@comment-automations/shared';
import { sql } from 'kysely';
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
  for (;;) {
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
        status: 'running',
        step_index: 0,
        context: json(input.context),
        error: null,
        started_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict
          .columns(['automation_id', 'contact_id'])
          .where(sql<boolean>`status in ('running', 'waiting')`)
          .doNothing(),
      )
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
