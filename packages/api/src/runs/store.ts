import type { InboundEvent } from '@comment-automations/gateway-contract';
import type {
  AccountId,
  AutomationId,
  CapabilityRecord,
  ContactId,
  Definition,
  Platform,
  RunId,
  VersionId,
} from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import type { Selectable } from 'kysely';
import type {
  Db,
  JobKind,
  LogLevel,
  RunContext,
  RunError,
  RunStatus,
  RunsTable,
} from '../db/types.js';
import { json } from '../db/types.js';

export type LoadedRun = {
  run: Selectable<RunsTable>;
  definition: Definition;
  record: CapabilityRecord;
  automation: { id: AutomationId; name: string };
  version: { id: VersionId; number: number };
  account: { id: AccountId; platform: Platform; externalId: string };
  contact: { id: ContactId; externalId: string; handle: string; email: string | null };
  commentCreatedAt: Date | undefined;
};

export type LogEntry = {
  stepIndex: number | null;
  level?: LogLevel;
  message: string;
  context?: Record<string, unknown>;
};

export const ACTIVE_STATUSES: RunStatus[] = ['running', 'waiting'];

export const inTransaction = <T>(db: Db, work: (trx: Db) => Promise<T>): Promise<T> =>
  db.isTransaction ? work(db) : db.transaction().execute(work);

export const logRun = async (db: Db, runId: RunId, at: Date, entry: LogEntry): Promise<void> => {
  await db
    .insertInto('run_logs')
    .values({
      run_id: runId,
      step_index: entry.stepIndex,
      level: entry.level ?? 'info',
      message: entry.message,
      context: json(entry.context ?? {}),
      at,
    })
    .execute();
};

export const logMovedOn = (
  db: Db,
  runId: RunId,
  at: Date,
  stepIndex: number | null,
  attempted: string,
): Promise<void> =>
  logRun(db, runId, at, {
    stepIndex,
    level: 'warn',
    message: 'Ignored a late update: the run had already moved on',
    context: { attempted },
  });

export const enqueueJob = async (
  db: Db,
  kind: JobKind,
  runId: RunId,
  runAt: Date,
): Promise<void> => {
  await db.insertInto('jobs').values({ kind, run_id: runId, run_at: runAt }).execute();
};

export const cancelTimers = async (db: Db, runId: RunId): Promise<void> => {
  await db
    .updateTable('jobs')
    .set({ status: 'done' })
    .where('run_id', '=', runId)
    .where('status', '=', 'pending')
    .where('kind', 'in', ['reminder', 'give_up', 'nudge'])
    .execute();
};

export const lockRun = (
  db: Db,
  runId: RunId,
): Promise<Pick<Selectable<RunsTable>, 'status' | 'step_index' | 'wait_until'> | undefined> =>
  db
    .selectFrom('runs')
    .select(['status', 'step_index', 'wait_until'])
    .where('id', '=', runId)
    .forUpdate()
    .executeTakeFirst();

export const loadRun = async (db: Db, runId: RunId): Promise<LoadedRun | undefined> => {
  const row = await db
    .selectFrom('runs')
    .innerJoin('automations', 'automations.id', 'runs.automation_id')
    .innerJoin('automation_versions', 'automation_versions.id', 'runs.version_id')
    .innerJoin('accounts', 'accounts.id', 'runs.account_id')
    .innerJoin('contacts', 'contacts.id', 'runs.contact_id')
    .innerJoin('events', 'events.id', 'runs.trigger_event_id')
    .selectAll('runs')
    .select([
      'automations.name as automation_name',
      'automation_versions.number as version_number',
      'automation_versions.definition as definition',
      'accounts.platform as account_platform',
      'accounts.external_id as account_external_id',
      'contacts.external_id as contact_external_id',
      'contacts.handle as contact_handle',
      'contacts.email as contact_email',
      'events.payload as trigger_payload',
    ])
    .where('runs.id', '=', runId)
    .executeTakeFirst();
  if (row === undefined) {
    return undefined;
  }
  const {
    automation_name,
    version_number,
    definition,
    account_platform,
    account_external_id,
    contact_external_id,
    contact_handle,
    contact_email,
    trigger_payload,
    ...run
  } = row;
  const trigger: InboundEvent = trigger_payload;
  return {
    run,
    definition,
    record: capabilities[account_platform],
    automation: { id: run.automation_id, name: automation_name },
    version: { id: run.version_id, number: version_number },
    account: { id: run.account_id, platform: account_platform, externalId: account_external_id },
    contact: {
      id: run.contact_id,
      externalId: contact_external_id,
      handle: contact_handle,
      email: contact_email,
    },
    commentCreatedAt: trigger.kind === 'comment' ? new Date(trigger.createdAt) : undefined,
  };
};

export const saveContext = async (
  db: Db,
  runId: RunId,
  context: RunContext,
  now: Date,
  expected: RunStatus,
  patch: Partial<Pick<Selectable<RunsTable>, 'step_index' | 'nudged' | 'reminder_sent'>> = {},
): Promise<boolean> => {
  const result = await db
    .updateTable('runs')
    .set({ ...patch, context: json(context), updated_at: now })
    .where('id', '=', runId)
    .where('status', '=', expected)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
};

export const finishRun = (
  db: Db,
  runId: RunId,
  status: 'completed' | 'failed' | 'expired' | 'superseded' | 'stopped',
  now: Date,
  entry: LogEntry,
  error: RunError | null = null,
  from: RunStatus[] = ACTIVE_STATUSES,
): Promise<boolean> =>
  inTransaction(db, async (trx) => {
    const result = await trx
      .updateTable('runs')
      .set({
        status,
        error: error === null ? null : json(error),
        finished_at: now,
        updated_at: now,
      })
      .where('id', '=', runId)
      .where('status', 'in', from)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      await logMovedOn(trx, runId, now, entry.stepIndex, status);
      return false;
    }
    await cancelTimers(trx, runId);
    await logRun(trx, runId, now, entry);
    return true;
  });

export const failRun = (db: Db, loaded: LoadedRun, error: RunError, now: Date): Promise<boolean> =>
  finishRun(
    db,
    loaded.run.id,
    'failed',
    now,
    {
      stepIndex: loaded.run.step_index,
      level: 'error',
      message: error.message,
      context: { code: error.code },
    },
    error,
  );
