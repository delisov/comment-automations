import { buildApp } from './app.js';

const app = buildApp({ sha: process.env.GIT_SHA ?? 'dev' });

await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
});
