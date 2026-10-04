import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { SCHEMA } from '../client.js';

const events = sql.table(`${SCHEMA}.events`);

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.alterTable('events').addColumn('message_id', 'text').execute();
  await sql`update ${events} set message_id = payload->>'messageId' where kind = 'message'`.execute(
    db,
  );
  await db.schema
    .createIndex('events_one_per_message_idx')
    .unique()
    .on('events')
    .columns(['platform', 'message_id'])
    .where(sql.ref('message_id'), 'is not', null)
    .execute();
};

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropIndex('events_one_per_message_idx').execute();
  await db.schema.alterTable('events').dropColumn('message_id').execute();
};
