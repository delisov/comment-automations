import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  const schema = db.withSchema('stand').schema;

  await schema
    .createTable('accounts')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('platform', 'text', (c) => c.notNull())
    .addColumn('handle', 'text', (c) => c.notNull())
    .addColumn('display_name', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .execute();

  await schema
    .createTable('users')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('platform', 'text', (c) => c.notNull())
    .addColumn('handle', 'text', (c) => c.notNull())
    .addColumn('display_name', 'text', (c) => c.notNull())
    .addColumn('dm_setting', 'text', (c) => c.notNull())
    .addColumn('follows_account_ids', sql`text[]`, (c) => c.notNull())
    .execute();

  await schema
    .createTable('posts')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('account_id', 'text', (c) =>
      c.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('caption', 'text', (c) => c.notNull())
    .addColumn('published_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await schema
    .createTable('comments')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('post_id', 'text', (c) => c.notNull().references('posts.id').onDelete('cascade'))
    .addColumn('author_user_id', 'text')
    .addColumn('author_account_id', 'text')
    .addColumn('parent_id', 'text')
    .addColumn('text', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .addColumn('private_reply_sent', 'boolean', (c) => c.notNull().defaultTo(false))
    .execute();

  await schema
    .createTable('conversations')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('account_id', 'text', (c) =>
      c.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'text', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('opened_by', 'text', (c) => c.notNull())
    .addColumn('last_user_message_at', 'timestamptz')
    .addUniqueConstraint('conversations_account_user', ['account_id', 'user_id'])
    .execute();

  await schema
    .createTable('messages')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('seq', 'bigserial', (c) => c.notNull())
    .addColumn('conversation_id', 'text', (c) =>
      c.notNull().references('conversations.id').onDelete('cascade'),
    )
    .addColumn('from', 'text', (c) => c.notNull())
    .addColumn('text', 'text', (c) => c.notNull())
    .addColumn('buttons', 'jsonb', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .execute();

  await schema
    .createTable('event_log')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('payload', 'jsonb', (c) => c.notNull())
    .addColumn('result_code', 'text')
    .addColumn('at', 'timestamptz', (c) => c.notNull())
    .execute();

  await schema
    .createTable('deliveries')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('event_id', 'text', (c) => c.notNull())
    .addColumn('attempt', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('at', 'timestamptz', (c) => c.notNull())
    .execute();

  await schema
    .createTable('idempotency')
    .addColumn('account_id', 'text', (c) => c.notNull())
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('response', 'jsonb', (c) => c.notNull())
    .addPrimaryKeyConstraint('idempotency_pk', ['account_id', 'key'])
    .execute();

  await schema
    .createTable('settings')
    .addColumn('id', 'integer', (c) => c.primaryKey().check(sql`id = 1`))
    .addColumn('duplicate_percent', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('reorder_window_ms', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('delay_ms', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('drop_percent', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('burst429', 'integer', (c) => c.notNull().defaultTo(0))
    .execute();

  await sql`insert into stand.settings (id) values (1)`.execute(db);
};

export const down = async (db: Kysely<unknown>): Promise<void> => {
  const schema = db.withSchema('stand').schema;
  for (const table of [
    'settings',
    'idempotency',
    'deliveries',
    'event_log',
    'messages',
    'conversations',
    'comments',
    'posts',
    'users',
    'accounts',
  ]) {
    await schema.dropTable(table).execute();
  }
};
