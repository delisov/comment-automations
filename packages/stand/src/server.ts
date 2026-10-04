import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlledClock } from '@comment-automations/shared';
import { buildApp } from './app.js';
import { createDb } from './db/database.js';
import { migrate } from './db/migrate.js';
import { requireEnv } from './env.js';

const db = createDb(requireEnv('DATABASE_URL'));
await migrate(db);

const app = buildApp({
  db,
  clock: controlledClock(),
  sha: process.env.GIT_SHA ?? 'dev',
  serviceUrl: requireEnv('SERVICE_URL'),
  serviceToken: requireEnv('SERVICE_TOKEN'),
  publicDir: join(dirname(fileURLToPath(import.meta.url)), '..', 'public'),
});

await app.listen({
  port: Number(process.env.PORT ?? 3100),
  host: process.env.HOST ?? '0.0.0.0',
});
