import type { Clock } from '@comment-automations/shared';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { Gateway } from '../gateway/port.js';
import { tokenMatches } from '../ingest/token.js';

export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export type AppDeps = {
  sha: string;
  db: Kysely<Database>;
  gateway: Gateway;
  clock: Clock;
  fetch: typeof fetch;
  serviceToken: string;
  testMode: boolean;
  webhookAllowPrivate: boolean;
  publicDir: string;
};

export const ErrorResponse = Type.Object({ error: Type.String() });

export const IdParams = Type.Object({ id: Type.String({ minLength: 1 }) });

export const iso = (date: Date): string => date.toISOString();

export const requireServiceToken =
  (deps: AppDeps) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const presented = request.headers['x-service-token'];
    if (!tokenMatches(typeof presented === 'string' ? presented : undefined, deps.serviceToken)) {
      return reply.status(401).send({ error: 'Invalid service token' });
    }
    return undefined;
  };
