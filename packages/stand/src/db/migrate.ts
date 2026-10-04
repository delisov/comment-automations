import type { MigrationResult } from 'kysely';
import { Migrator } from 'kysely';
import type { Db } from './database.js';
import * as init from './migrations/001_init.js';

export const migrate = async (db: Db): Promise<MigrationResult[]> => {
  const migrator = new Migrator({
    db,
    migrationTableSchema: 'stand',
    provider: { getMigrations: async () => ({ '001_init': init }) },
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }
  return results ?? [];
};
