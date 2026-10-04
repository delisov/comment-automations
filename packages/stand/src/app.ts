import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ControlledClock } from '@comment-automations/shared';
import fastifyStatic from '@fastify/static';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { Context } from './context.js';
import type { Db } from './db/database.js';
import { createDelivery, RETRY_DELAYS_MS } from './delivery.js';
import { clockRoutes } from './routes/clock.js';
import { gatewayRoutes } from './routes/gateway.js';
import { scenarioRoutes } from './routes/scenario.js';

export type AppDeps = {
  db: Db;
  clock: ControlledClock;
  sha: string;
  serviceUrl: string;
  serviceToken: string;
  retryDelaysMs?: number[];
  random?: () => number;
  publicDir?: string;
};

const API_PREFIXES = ['/gateway', '/scenario', '/test', '/health'];

export const buildApp = (deps: AppDeps) => {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();
  const delivery = createDelivery({
    db: deps.db,
    clock: deps.clock,
    serviceUrl: deps.serviceUrl,
    serviceToken: deps.serviceToken,
    retryDelaysMs: deps.retryDelaysMs ?? RETRY_DELAYS_MS,
    random: deps.random ?? Math.random,
  });
  const ctx: Context = {
    db: deps.db,
    clock: deps.clock,
    serviceUrl: deps.serviceUrl,
    serviceToken: deps.serviceToken,
    delivery,
  };

  app.addHook('onClose', async () => {
    delivery.close();
  });

  app.get('/health', async () => ({ status: 'ok' as const, sha: deps.sha }));
  app.register(gatewayRoutes, { prefix: '/gateway', ctx });
  app.register(scenarioRoutes, { prefix: '/scenario', ctx });
  app.register(clockRoutes, { prefix: '/test', ctx });

  if (deps.publicDir && existsSync(join(deps.publicDir, 'index.html'))) {
    app.register(fastifyStatic, { root: deps.publicDir });
    app.setNotFoundHandler((request, reply) => {
      const isApi = API_PREFIXES.some((prefix) => request.url.startsWith(prefix));
      if (request.method === 'GET' && !isApi) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ code: 'NOT_FOUND', message: `${request.url} not found` });
    });
  }

  return app;
};
