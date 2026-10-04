import { HealthResponse } from '@comment-automations/api-schema';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerAutomationRoutes } from './routes/automations.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerStatic } from './routes/static.js';
import { registerTestRoutes } from './routes/test.js';
import type { App, AppDeps } from './routes/types.js';

export type { AppDeps } from './routes/types.js';

export const buildApp = (deps: AppDeps): App => {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();

  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') {
      done(null, {});
      return;
    }
    parseJson(request, String(body), done);
  });

  app.get('/health', { schema: { response: { 200: HealthResponse } } }, async () => ({
    status: 'ok' as const,
    sha: deps.sha,
  }));

  app.setErrorHandler((error, _request, reply) => {
    if ((error as { code?: string }).code === '22P02') {
      return reply.status(404).send({ error: 'Not found' });
    }
    if (((error as { statusCode?: number }).statusCode ?? 500) >= 500) {
      console.error(error);
      return reply.status(500).send({ error: 'Internal error' });
    }
    return reply.send(error);
  });

  registerStatic(app, deps.publicDir);
  registerAccountRoutes(app, deps);
  registerAutomationRoutes(app, deps);
  registerRunRoutes(app, deps);
  registerIngestRoutes(app, deps);
  if (deps.testMode) {
    registerTestRoutes(app, deps);
  }

  return app;
};
