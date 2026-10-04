import { ClockRequest, ClockResponse } from '@comment-automations/gateway-contract';
import type { ControlledClock } from '@comment-automations/shared';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import { SCHEMA } from '../db/client.js';
import type { App, AppDeps } from './types.js';
import { ErrorResponse, iso, requireServiceToken } from './types.js';

const isControlled = (clock: AppDeps['clock']): clock is ControlledClock => 'set' in clock;

const TABLES = [
  'jobs',
  'outbound_calls',
  'run_logs',
  'runs',
  'contacts',
  'events',
  'automation_versions',
  'automations',
  'accounts',
].map((table) => sql.table(`${SCHEMA}.${table}`));

export const registerTestRoutes = (app: App, deps: AppDeps): void => {
  const preValidation = requireServiceToken(deps);

  app.get('/test/clock', { schema: { response: { 200: ClockResponse } } }, async () => ({
    now: iso(deps.clock.now()),
  }));

  app.post(
    '/test/clock',
    {
      preValidation,
      schema: {
        body: ClockRequest,
        response: { 200: ClockResponse, 401: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      if (!isControlled(deps.clock)) {
        return reply.status(409).send({ error: 'The clock is not controlled in this mode' });
      }
      const now = new Date(request.body.now);
      if (Number.isNaN(now.getTime())) {
        return reply.status(409).send({ error: 'now must be an ISO 8601 timestamp' });
      }
      deps.clock.set(now);
      return { now: iso(now) };
    },
  );

  app.post(
    '/test/reset',
    { preValidation, schema: { response: { 200: Type.Object({}), 401: ErrorResponse } } },
    async () => {
      await sql`truncate table ${sql.join(TABLES)} cascade`.execute(deps.db);
      return {};
    },
  );
};
