import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { SCHEMA } from '../client.js';

const events = sql.table(`${SCHEMA}.events`);
const runs = sql.table(`${SCHEMA}.runs`);

const laterDuplicates = sql`
  select id from (
    select id, row_number() over (partition by platform, message_id order by received_at, id) as position
    from ${events}
    where message_id is not null
  ) ranked
  where position > 1`;

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.alterTable('events').addColumn('message_id', 'text').execute();
  await sql`update ${events} set message_id = payload->>'messageId' where kind = 'message'`.execute(
    db,
  );
  await sql`
    update ${events} as event set message_id = null
    where event.id in (${laterDuplicates})
      and exists (select 1 from ${runs} as run where run.trigger_event_id = event.id)`.execute(db);
  await sql`delete from ${events} where id in (${laterDuplicates})`.execute(db);
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
