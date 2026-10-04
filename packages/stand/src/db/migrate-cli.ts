import { requireEnv } from '../env.js';
import { createDb } from './database.js';
import { migrate } from './migrate.js';

const db = createDb(requireEnv('DATABASE_URL'));
const results = await migrate(db);
for (const result of results) {
  console.log(`${result.migrationName}: ${result.status}`);
}
await db.destroy();
