import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { SCHEMA } from './client.js';
import { migrations } from './migrations/index.js';
import type { Database } from './types.js';

export const migrateToLatest = async (db: Kysely<Database>): Promise<void> => {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableSchema: SCHEMA,
  });
  const { error } = await migrator.migrateToLatest();
  if (error !== undefined) {
    throw error;
  }
};
