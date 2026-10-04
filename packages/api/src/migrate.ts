import { createDb } from './db/client.js';
import { migrateToLatest } from './db/migrate.js';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required');
}
const db = createDb(databaseUrl);
await migrateToLatest(db);
await db.destroy();
