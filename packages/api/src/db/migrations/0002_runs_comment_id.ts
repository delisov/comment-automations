import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const up = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.alterTable('runs').addColumn('comment_id', 'text').execute();
  await db.schema
    .createIndex('runs_one_per_comment_idx')
    .unique()
    .on('runs')
    .columns(['automation_id', 'comment_id'])
    .where(sql.ref('comment_id'), 'is not', null)
    .execute();
};

export const down = async (db: Kysely<unknown>): Promise<void> => {
  await db.schema.dropIndex('runs_one_per_comment_idx').execute();
  await db.schema.alterTable('runs').dropColumn('comment_id').execute();
};
