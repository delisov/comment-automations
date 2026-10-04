import { HealthResponse } from '@comment-automations/api-schema';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';

export const buildApp = (deps: { sha: string }) => {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();

  app.get('/health', { schema: { response: { 200: HealthResponse } } }, async () => ({
    status: 'ok' as const,
    sha: deps.sha,
  }));

  return app;
};
