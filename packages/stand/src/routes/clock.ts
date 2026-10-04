import type { ClockRequest as ClockRequestType } from '@comment-automations/gateway-contract';
import { ClockRequest } from '@comment-automations/gateway-contract';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { Context } from '../context.js';

type ServiceAnswer = { status: number; body: unknown } | { error: string };

const forwardClock = async (ctx: Context, body: ClockRequestType): Promise<ServiceAnswer> => {
  try {
    const response = await fetch(`${ctx.serviceUrl}/test/clock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-token': ctx.serviceToken },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

export const clockRoutes: FastifyPluginAsyncTypebox<{ ctx: Context }> = async (app, { ctx }) => {
  app.get('/clock', async () => ({ now: ctx.clock.now().toISOString() }));

  app.post('/clock', { schema: { body: ClockRequest } }, async (request, reply) => {
    const now = new Date(request.body.now);
    if (Number.isNaN(now.getTime())) {
      return reply
        .code(400)
        .send({ code: 'INVALID_TIMESTAMP', message: `${request.body.now} is not a timestamp` });
    }
    ctx.clock.set(now);
    const service = await forwardClock(ctx, { now: now.toISOString() });
    return { now: now.toISOString(), service };
  });
};
