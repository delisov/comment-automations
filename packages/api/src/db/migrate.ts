import type { Kysely } from 'kysely';
import type { MigrationResultSet } from 'kysely/migration';
import { Migrator } from 'kysely/migration';
import { SCHEMA } from './client.js';
import { migrations } from './migrations/index.js';
import type { Database } from './types.js';

const createMigrator = (db: Kysely<Database>): Migrator =>
  new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableSchema: SCHEMA,
  });

const throwOnError = ({ error }: MigrationResultSet): void => {
  if (error !== undefined) {
    throw error;
  }
};

export const migrateToLatest = async (db: Kysely<Database>): Promise<void> =>
  throwOnError(await createMigrator(db).migrateToLatest());

export const migrateTo = async (db: Kysely<Database>, target: string): Promise<void> =>
  throwOnError(await createMigrator(db).migrateTo(target));
