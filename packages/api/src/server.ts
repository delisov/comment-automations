import path from 'node:path';
import { controlledClock, systemClock } from '@comment-automations/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { migrateToLatest } from './db/migrate.js';
import { httpGateway } from './gateway/http.js';
import { startWorker } from './worker/worker.js';

const config = loadConfig(process.env);
const db = createDb(config.databaseUrl);
await migrateToLatest(db);

const deps = {
  sha: config.gitSha,
  db,
  gateway: httpGateway(config.gatewayUrl, config.serviceToken, fetch),
  clock: config.clockMode === 'controlled' ? controlledClock(systemClock.now()) : systemClock,
  fetch,
  serviceToken: config.serviceToken,
  testMode: config.gatewayMode === 'test',
  publicDir: path.resolve(import.meta.dirname, '../public'),
};

const app = buildApp(deps);
await app.listen({ port: config.port, host: process.env.HOST ?? '0.0.0.0' });
const stopWorker = startWorker(deps, config.workerPollMs);

const shutdown = async (): Promise<void> => {
  stopWorker();
  await app.close();
  await db.destroy();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
