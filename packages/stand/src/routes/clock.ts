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

const readServiceClock = async (ctx: Context): Promise<Date | null> => {
  try {
    const response = await fetch(`${ctx.serviceUrl}/test/clock`, {
      headers: { 'x-service-token': ctx.serviceToken },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { now?: unknown };
    const now = new Date(String(body.now));
    return Number.isNaN(now.getTime()) ? null : now;
  } catch {
    return null;
  }
};

export const clockRoutes: FastifyPluginAsyncTypebox<{ ctx: Context }> = async (app, { ctx }) => {
  app.get('/clock', async () => {
    const service = await readServiceClock(ctx);
    if (service === null) {
      const now = ctx.clock.now().toISOString();
      return { now, standNow: now, source: 'stand' as const };
    }
    return {
      now: service.toISOString(),
      standNow: ctx.clock.now().toISOString(),
      source: 'service' as const,
    };
  });

  app.post('/clock', { schema: { body: ClockRequest } }, async (request, reply) => {
    const now = new Date(request.body.now);
    if (Number.isNaN(now.getTime())) {
      return reply
        .code(400)
        .send({ code: 'INVALID_TIMESTAMP', message: `${request.body.now} is not a timestamp` });
    }
    ctx.clock.set(now);
    const service = await forwardClock(ctx, { now: now.toISOString() });
    request.log.info({ now: now.toISOString(), service }, 'stand and service clocks set');
    return { now: now.toISOString(), service };
  });
};
