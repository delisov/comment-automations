import { Kysely, PostgresDialect, WithSchemaPlugin } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

export const SCHEMA = 'app';

export const createDb = (databaseUrl: string): Kysely<Database> =>
  new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl }) }),
    plugins: [new WithSchemaPlugin(SCHEMA)],
  });
