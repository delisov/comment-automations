import { IngestRequest, IngestResponse } from '@comment-automations/gateway-contract';
import { ingestEvents } from '../ingest/process.js';
import { tokenMatches } from '../ingest/token.js';
import type { App, AppDeps } from './types.js';
import { ErrorResponse } from './types.js';

export const registerIngestRoutes = (app: App, deps: AppDeps): void => {
  app.post(
    '/ingest/events',
    { schema: { body: IngestRequest, response: { 202: IngestResponse, 401: ErrorResponse } } },
    async (request, reply) => {
      const presented = request.headers['x-service-token'];
      if (!tokenMatches(typeof presented === 'string' ? presented : undefined, deps.serviceToken)) {
        return reply.status(401).send({ error: 'Invalid service token' });
      }
      const response = await ingestEvents(deps, request.body.events);
      return reply.status(202).send(response);
    },
  );
};
