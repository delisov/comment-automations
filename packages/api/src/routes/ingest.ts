import { InboundEvent, IngestResponse } from '@comment-automations/gateway-contract';
import { Type } from '@sinclair/typebox';
import { ingestEvents } from '../ingest/process.js';
import type { App, AppDeps } from './types.js';
import { ErrorResponse, requireServiceToken } from './types.js';

const IngestBody = Type.Object({
  events: Type.Array(InboundEvent, { minItems: 1, maxItems: 500 }),
});

export const registerIngestRoutes = (app: App, deps: AppDeps): void => {
  app.post(
    '/ingest/events',
    {
      preValidation: requireServiceToken(deps),
      schema: { body: IngestBody, response: { 202: IngestResponse, 401: ErrorResponse } },
    },
    async (request, reply) => {
      const response = await ingestEvents(deps, request.body.events);
      return reply.status(202).send(response);
    },
  );
};
