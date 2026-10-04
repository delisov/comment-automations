import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('platform', 'text', (col) => col.notNull())
    .addColumn('external_id', 'text', (col) => col.notNull())
    .addColumn('handle', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('synced_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('accounts_platform_external_id_key', ['platform', 'external_id'])
    .execute();

  await db.schema
    .createTable('automations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('state', 'text', (col) => col.notNull())
    .addColumn('active_version_id', 'uuid')
    .addColumn('draft', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('automation_versions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('automation_id', 'uuid', (col) => col.notNull().references('automations.id'))
    .addColumn('number', 'integer', (col) => col.notNull())
    .addColumn('definition', 'jsonb', (col) => col.notNull())
    .addColumn('note', 'text', (col) => col.notNull())
    .addColumn('published_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('automation_versions_automation_id_number_key', [
      'automation_id',
      'number',
    ])
    .execute();

  await db.schema
    .alterTable('automations')
    .addForeignKeyConstraint(
      'automations_active_version_id_fkey',
      ['active_version_id'],
      'automation_versions',
      ['id'],
    )
    .execute();

  await db.schema
    .createTable('events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('platform', 'text', (col) => col.notNull())
    .addColumn('account_id', 'text', (col) => col.notNull())
    .addColumn('external_event_id', 'text', (col) => col.notNull())
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('received_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('events_platform_external_event_id_key', ['platform', 'external_event_id'])
    .execute();

  await db.schema
    .createTable('contacts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('platform', 'text', (col) => col.notNull())
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id'))
    .addColumn('external_id', 'text', (col) => col.notNull())
    .addColumn('handle', 'text', (col) => col.notNull())
    .addColumn('email', 'text')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addUniqueConstraint('contacts_platform_account_id_external_id_key', [
      'platform',
      'account_id',
      'external_id',
    ])
    .execute();

  await db.schema
    .createTable('runs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('automation_id', 'uuid', (col) => col.notNull().references('automations.id'))
    .addColumn('version_id', 'uuid', (col) => col.notNull().references('automation_versions.id'))
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id'))
    .addColumn('contact_id', 'uuid', (col) => col.notNull().references('contacts.id'))
    .addColumn('trigger_event_id', 'uuid', (col) => col.notNull().references('events.id'))
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('step_index', 'integer', (col) => col.notNull())
    .addColumn('context', 'jsonb', (col) => col.notNull())
    .addColumn('wait_until', 'timestamptz')
    .addColumn('reminder_at', 'timestamptz')
    .addColumn('reminder_sent', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('nudged', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('error', 'jsonb')
    .addColumn('started_at', 'timestamptz', (col) => col.notNull())
    .addColumn('finished_at', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('runs_one_active_per_contact_idx')
    .unique()
    .on('runs')
    .columns(['automation_id', 'contact_id'])
    .where(sql.ref('status'), 'in', ['running', 'waiting'])
    .execute();

  await db.schema
    .createIndex('runs_automation_id_started_at_idx')
    .on('runs')
    .columns(['automation_id', 'started_at desc', 'id desc'])
    .execute();

  await db.schema
    .createIndex('runs_waiting_contact_idx')
    .on('runs')
    .columns(['account_id', 'contact_id'])
    .where(sql.ref('status'), '=', 'waiting')
    .execute();

  await db.schema
    .createTable('run_logs')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('run_id', 'uuid', (col) => col.notNull().references('runs.id'))
    .addColumn('step_index', 'integer')
    .addColumn('level', 'text', (col) => col.notNull())
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('context', 'jsonb', (col) => col.notNull())
    .addColumn('at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('run_logs_run_id_at_idx')
    .on('run_logs')
    .columns(['run_id', 'at'])
    .execute();

  await db.schema
    .createTable('outbound_calls')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('run_id', 'uuid', (col) => col.notNull().references('runs.id'))
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('request', 'jsonb', (col) => col.notNull())
    .addColumn('response', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('at', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('run_id', 'uuid', (col) => col.notNull().references('runs.id'))
    .addColumn('run_at', 'timestamptz', (col) => col.notNull())
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('locked_until', 'timestamptz')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .execute();

  await db.schema
    .createIndex('jobs_pending_run_at_idx')
    .on('jobs')
    .columns(['run_at'])
    .where(sql.ref('status'), '=', 'pending')
    .execute();
};

export const down = async (db: Kysely<unknown>): Promise<void> => {
  for (const table of [
    'jobs',
    'outbound_calls',
    'run_logs',
    'runs',
    'contacts',
    'events',
    'automation_versions',
    'automations',
    'accounts',
  ]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
};
