import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ControlledClock } from '@comment-automations/shared';
import { controlledClock } from '@comment-automations/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { Db } from './db/database.js';
import { createDb } from './db/database.js';
import { migrate } from './db/migrate.js';
import { platforms } from './worlds/index.js';

const databaseUrl = process.env.DATABASE_URL;
const token = 'test-token';
const t0 = new Date('2026-10-04T10:00:00Z');
const hours = (n: number) => n * 60 * 60 * 1000;
const days = (n: number) => hours(24 * n);

type Received = { url: string | undefined; token: string | string[] | undefined; body: unknown };

const waitFor = async (condition: () => Promise<boolean> | boolean): Promise<void> => {
  const deadline = performance.now() + 3000;
  while (!(await condition())) {
    if (performance.now() > deadline) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe.skipIf(!databaseUrl)('stand against a real database', () => {
  let db: Db;
  let app: FastifyInstance;
  let stub: http.Server;
  let clock: ControlledClock;
  const received: Received[] = [];
  const answers: unknown[] = [];
  const ingested = new Set<string>();
  let serviceErrors = 0;
  let serviceNow = t0;

  const gateway = (method: 'GET' | 'POST', url: string, body?: unknown) =>
    app.inject({
      method,
      url,
      headers: { 'x-service-token': token },
      ...(body ? { payload: body } : {}),
    });

  const scenario = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, body?: unknown) =>
    app.inject({ method, url, ...(body ? { payload: body } : {}) });

  const deliveries = async () => (await scenario('GET', '/scenario/deliveries')).json<unknown[]>();

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(t0);
    db = createDb(databaseUrl!);
    await migrate(db);
    stub = http.createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/test/clock') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ now: serviceNow.toISOString() }));
        return;
      }
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const parsed = JSON.parse(body) as { events?: { eventId: string }[] };
        received.push({
          url: request.url,
          token: request.headers['x-service-token'],
          body: parsed,
        });
        if (request.url === '/ingest/events' && serviceErrors > 0) {
          serviceErrors -= 1;
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ code: 'INTERNAL', message: 'boom' }));
          return;
        }
        if (request.url !== '/ingest/events') {
          response.writeHead(202, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ accepted: 1, duplicates: 0 }));
          return;
        }
        const events = parsed.events ?? [];
        const fresh = events.filter((event) => !ingested.has(event.eventId));
        for (const event of fresh) {
          ingested.add(event.eventId);
        }
        const answer = { accepted: fresh.length, duplicates: events.length - fresh.length };
        answers.push(answer);
        response.writeHead(202, { 'content-type': 'application/json' });
        response.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    clock = controlledClock(t0);
    app = buildApp({
      db,
      clock,
      sha: 'test-sha',
      serviceUrl: `http://127.0.0.1:${port}`,
      serviceToken: token,
      retryDelaysMs: [],
    });
    await app.ready();
  });

  beforeEach(async () => {
    vi.setSystemTime(t0);
    clock.set(t0);
    received.length = 0;
    answers.length = 0;
    serviceErrors = 0;
    serviceNow = t0;
    await scenario('PUT', '/scenario/settings', {
      burst429: 0,
      dropPercent: 0,
      duplicatePercent: 0,
    });
    expect((await scenario('POST', '/scenario/seed')).statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => stub.close(resolve));
    await db.destroy();
    vi.useRealTimers();
  });

  it('GET /health answers with the build sha', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', sha: 'test-sha' });
  });

  it('refuses gateway calls without the service token', async () => {
    const response = await app.inject({ method: 'GET', url: '/gateway/accounts' });
    expect(response.statusCode).toBe(401);
  });

  it('seeds one account per platform and posts only where comments exist', async () => {
    const response = await gateway('GET', '/gateway/accounts');
    const { accounts } = response.json<{ accounts: { accountId: string; platform: string }[] }>();
    expect(accounts.map((account) => account.platform).sort()).toEqual(
      [
        'bluesky',
        'facebook',
        'instagram',
        'linkedin',
        'pinterest',
        'threads',
        'tiktok',
        'whatsapp',
        'x',
        'youtube',
      ].sort(),
    );
    const instagramPosts = await gateway('GET', '/gateway/posts?accountId=instagram_oqtastore');
    expect(instagramPosts.json()).toEqual({
      posts: [
        {
          postId: 'instagram_post_1',
          caption: 'New guide out now',
          publishedAt: '2026-10-03T10:00:00.000Z',
        },
        {
          postId: 'instagram_post_2',
          caption: 'Autumn pricing is live',
          publishedAt: '2026-10-02T10:00:00.000Z',
        },
      ],
    });
    const whatsappPosts = await gateway('GET', '/gateway/posts?accountId=whatsapp_oqtastore');
    expect(whatsappPosts.json()).toEqual({ posts: [] });
    const whatsappPost = await scenario('POST', '/scenario/posts', {
      accountId: 'whatsapp_oqtastore',
      caption: 'no',
    });
    expect(whatsappPost.statusCode).toBe(422);
    expect(whatsappPost.json().code).toBe('UNSUPPORTED');
  });

  it('a comment by a user is delivered to the service with the token and recorded', async () => {
    const response = await scenario('POST', '/scenario/comments', {
      postId: 'instagram_post_1',
      userId: 'instagram_jane.doe',
      text: 'pricing?',
    });
    expect(response.statusCode).toBe(200);
    const comment = response.json<{ id: string }>();

    await waitFor(() => received.length === 1);
    expect(received).toEqual([
      {
        url: '/ingest/events',
        token,
        body: {
          events: [
            {
              kind: 'comment',
              platform: 'instagram',
              accountId: 'instagram_oqtastore',
              eventId: `evt_${comment.id}`,
              commentId: comment.id,
              postId: 'instagram_post_1',
              authorId: 'instagram_jane.doe',
              authorHandle: '@jane.doe',
              text: 'pricing?',
              createdAt: '2026-10-04T10:00:00.000Z',
            },
          ],
        },
      },
    ]);

    await waitFor(async () => (await deliveries()).length === 1);
    expect(await deliveries()).toEqual([
      {
        id: expect.any(Number),
        event_id: `evt_${comment.id}`,
        attempt: 1,
        status: 'delivered',
        at: '2026-10-04T10:00:00.000Z',
      },
    ]);
    const log = (await scenario('GET', '/scenario/event-log')).json<
      { direction: string; kind: string }[]
    >();
    expect(log.map((entry) => [entry.direction, entry.kind])).toEqual([['to_service', 'comment']]);
  });

  it('a second private reply to the same comment returns ALREADY_REPLIED', async () => {
    const comment = (
      await scenario('POST', '/scenario/comments', {
        postId: 'instagram_post_1',
        userId: 'instagram_jane.doe',
        text: 'pricing?',
      })
    ).json<{ id: string }>();
    const first = await gateway('POST', '/gateway/replies', {
      accountId: 'instagram_oqtastore',
      commentId: comment.id,
      text: 'Sent you a DM',
      visibility: 'private',
      idempotencyKey: 'run_1:0:reply',
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ conversationId: expect.any(String) });

    const second = await gateway('POST', '/gateway/replies', {
      accountId: 'instagram_oqtastore',
      commentId: comment.id,
      text: 'Again',
      visibility: 'private',
      idempotencyKey: 'run_1:1:reply',
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      code: 'ALREADY_REPLIED',
      message: expect.any(String),
      retryable: false,
    });

    const state = (await scenario('GET', '/scenario/state?platform=instagram')).json<{
      conversations: {
        opened_by: string;
        last_user_message_at: string | null;
        messages: unknown[];
      }[];
    }>();
    expect(state.conversations).toEqual([
      expect.objectContaining({
        opened_by: 'privateReply',
        last_user_message_at: null,
        messages: [expect.objectContaining({ from: 'account', text: 'Sent you a DM' })],
      }),
    ]);
  });

  it('two simultaneous first messages from a new user share one conversation', async () => {
    const fresh = (
      await scenario('POST', '/scenario/users', { platform: 'instagram', handle: 'racer' })
    ).json<{ id: string }>();
    const send = (text: string) =>
      scenario('POST', '/scenario/messages', {
        accountId: 'instagram_oqtastore',
        userId: fresh.id,
        text,
      });

    const [first, second] = await Promise.all([send('one'), send('two')]);

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    const state = (await scenario('GET', '/scenario/state?platform=instagram')).json<{
      conversations: { user_id: string; messages: { text: string }[] }[];
    }>();
    const mine = state.conversations.filter((conversation) => conversation.user_id === fresh.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.messages.map((message) => message.text).sort()).toEqual(['one', 'two']);
  });

  it('GET /test/clock returns the service clock reading and the stand reading unchanged when the service is ahead', async () => {
    serviceNow = new Date(t0.getTime() + hours(3));
    const response = await scenario('GET', '/test/clock');
    expect(response.json()).toEqual({
      now: serviceNow.toISOString(),
      standNow: t0.toISOString(),
      source: 'service',
    });
    expect(clock.now()).toEqual(t0);
  });

  it('GET /test/clock keeps the stand clock and reports it as the source when the service is behind', async () => {
    serviceNow = new Date(t0.getTime() - hours(3));
    const response = await scenario('GET', '/test/clock');
    expect(response.json()).toEqual({
      now: serviceNow.toISOString(),
      standNow: t0.toISOString(),
      source: 'service',
    });
  });

  it('a private reply 8 days after the comment returns REPLY_WINDOW_CLOSED', async () => {
    const comment = (
      await scenario('POST', '/scenario/comments', {
        postId: 'facebook_post_1',
        userId: 'facebook_bob',
        text: 'pricing?',
      })
    ).json<{ id: string }>();

    const later = new Date(t0.getTime() + days(8)).toISOString();
    const clockResponse = await scenario('POST', '/test/clock', { now: later });
    expect(clockResponse.json()).toEqual({
      now: later,
      service: { status: 202, body: { accepted: 1, duplicates: 0 } },
    });

    const response = await gateway('POST', '/gateway/replies', {
      accountId: 'facebook_oqtastore',
      commentId: comment.id,
      text: 'Too late',
      visibility: 'private',
      idempotencyKey: 'run_2:0:reply',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('REPLY_WINDOW_CLOSED');
  });

  it('a message 25 h after the user last wrote returns MESSAGING_WINDOW_CLOSED', async () => {
    const userMessage = (
      await scenario('POST', '/scenario/messages', {
        accountId: 'instagram_oqtastore',
        userId: 'instagram_jane.doe',
        text: 'hello?',
      })
    ).json<{ conversation_id: string }>();
    await waitFor(() => received.length === 1);

    clock.set(new Date(t0.getTime() + hours(23)));
    const inside = await gateway('POST', '/gateway/messages', {
      accountId: 'instagram_oqtastore',
      recipient: { conversationId: userMessage.conversation_id },
      text: 'Here is the link',
      idempotencyKey: 'run_3:1:message',
    });
    expect(inside.statusCode).toBe(200);
    expect(inside.json()).toEqual({
      messageId: expect.any(String),
      conversationId: userMessage.conversation_id,
    });

    clock.set(new Date(t0.getTime() + hours(25)));
    const outside = await gateway('POST', '/gateway/messages', {
      accountId: 'instagram_oqtastore',
      recipient: { conversationId: userMessage.conversation_id },
      text: 'Still there?',
      idempotencyKey: 'run_3:2:message',
    });
    expect(outside.statusCode).toBe(403);
    expect(outside.json().code).toBe('MESSAGING_WINDOW_CLOSED');
  });

  it('a message to a dm_setting=none user on bluesky returns RECIPIENT_UNREACHABLE', async () => {
    const response = await gateway('POST', '/gateway/messages', {
      accountId: 'bluesky_oqtastore',
      recipient: { userId: 'bluesky_spammy_sam' },
      text: 'hi',
      idempotencyKey: 'run_4:0:message',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('RECIPIENT_UNREACHABLE');

    const patched = await scenario('PATCH', '/scenario/users/bluesky_spammy_sam', {
      dmSetting: 'all',
    });
    expect(patched.json()).toEqual(expect.objectContaining({ dm_setting: 'all' }));
    const retry = await gateway('POST', '/gateway/messages', {
      accountId: 'bluesky_oqtastore',
      recipient: { userId: 'bluesky_spammy_sam' },
      text: 'hi',
      idempotencyKey: 'run_4:1:message',
    });
    expect(retry.statusCode).toBe(200);
  });

  it('the same idempotency key twice returns the same response and creates one message', async () => {
    const body = {
      accountId: 'bluesky_oqtastore',
      recipient: { userId: 'bluesky_jane.doe' },
      text: 'Welcome',
      idempotencyKey: 'run_5:0:message',
    };
    const first = await gateway('POST', '/gateway/messages', body);
    const second = await gateway('POST', '/gateway/messages', body);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const state = (await scenario('GET', '/scenario/state?platform=bluesky')).json<{
      conversations: { messages: unknown[] }[];
    }>();
    expect(state.conversations.map((conversation) => conversation.messages.length)).toEqual([1]);
  });

  it('the 11th consecutive account message on tiktok is refused until the user writes', async () => {
    const userMessage = (
      await scenario('POST', '/scenario/messages', {
        accountId: 'tiktok_oqtastore',
        userId: 'tiktok_desktop_dan',
        text: 'hi',
      })
    ).json<{ conversation_id: string }>();
    const send = (n: number) =>
      gateway('POST', '/gateway/messages', {
        accountId: 'tiktok_oqtastore',
        recipient: { conversationId: userMessage.conversation_id },
        text: `message ${n}`,
        idempotencyKey: `run_6:${n}:message`,
      });
    for (let n = 1; n <= 10; n += 1) {
      expect((await send(n)).statusCode).toBe(200);
    }
    const eleventh = await send(11);
    expect(eleventh.statusCode).toBe(409);
    expect(eleventh.json().code).toBe('MESSAGE_CAP_REACHED');

    await scenario('POST', '/scenario/messages', {
      accountId: 'tiktok_oqtastore',
      userId: 'tiktok_desktop_dan',
      text: 'ok',
    });
    expect((await send(12)).statusCode).toBe(200);
  });

  it('lists conversation messages in the order they were sent even after the clock moved back', async () => {
    const userMessage = (
      await scenario('POST', '/scenario/messages', {
        accountId: 'tiktok_oqtastore',
        userId: 'tiktok_desktop_dan',
        text: 'hi',
      })
    ).json<{ conversation_id: string }>();
    clock.set(new Date(t0.getTime() - hours(1)));
    expect(
      (
        await gateway('POST', '/gateway/messages', {
          accountId: 'tiktok_oqtastore',
          recipient: { conversationId: userMessage.conversation_id },
          text: 'Welcome back',
          idempotencyKey: 'run_7:0:message',
        })
      ).statusCode,
    ).toBe(200);

    const state = (await scenario('GET', '/scenario/state?platform=tiktok')).json<{
      conversations: { id: string; messages: { from: string; text: string }[] }[];
    }>();
    const conversation = state.conversations.find((c) => c.id === userMessage.conversation_id);
    expect(conversation?.messages.map(({ from, text }) => ({ from, text }))).toEqual([
      { from: 'user', text: 'hi' },
      { from: 'account', text: 'Welcome back' },
    ]);
  });

  it('a burst makes the next gateway calls answer RATE_LIMITED and then recovers', async () => {
    await scenario('PUT', '/scenario/settings', { burst429: 2 });
    const first = await gateway('GET', '/gateway/accounts');
    const second = await gateway('GET', '/gateway/accounts');
    const third = await gateway('GET', '/gateway/accounts');
    expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([429, 429, 200]);
    expect(first.json()).toEqual({
      code: 'RATE_LIMITED',
      message: expect.any(String),
      retryable: true,
    });
  });

  it('a public reply on instagram appears in the thread and is echoed to the service', async () => {
    const comment = (
      await scenario('POST', '/scenario/comments', {
        postId: 'instagram_post_2',
        userId: 'instagram_bob',
        text: 'how much?',
      })
    ).json<{ id: string }>();
    const response = await gateway('POST', '/gateway/replies', {
      accountId: 'instagram_oqtastore',
      commentId: comment.id,
      text: 'Check your DMs',
      visibility: 'public',
      idempotencyKey: 'run_7:0:reply',
    });
    expect(response.json()).toEqual({ replyId: expect.any(String) });

    await waitFor(() => received.length === 2);
    const echoed = received.map(
      (entry) => (entry.body as { events: { authorId: string }[] }).events[0]!.authorId,
    );
    expect(echoed).toEqual(['instagram_bob', 'instagram_oqtastore']);

    const state = (await scenario('GET', '/scenario/state?platform=instagram')).json<{
      posts: {
        id: string;
        comments: { parent_id: string | null; author_account_id: string | null }[];
      }[];
    }>();
    const post = state.posts.find((candidate) => candidate.id === 'instagram_post_2')!;
    expect(post.comments).toEqual([
      expect.objectContaining({ id: comment.id, parent_id: null, author_user_id: 'instagram_bob' }),
      expect.objectContaining({ parent_id: comment.id, author_account_id: 'instagram_oqtastore' }),
    ]);
  });

  const worldState = async () =>
    Promise.all(
      platforms.map(async (platform) =>
        (await scenario('GET', `/scenario/state?platform=${platform}`)).json(),
      ),
    );

  it('POST /scenario/restore returns the seeded world and sets both clocks to now without resetting the service', async () => {
    const seeded = await worldState();
    const account = (
      await scenario('POST', '/scenario/accounts', { platform: 'instagram', handle: '@extra' })
    ).json<{ id: string }>();
    await scenario('POST', '/scenario/posts', { accountId: account.id, caption: 'extra post' });
    await scenario('POST', '/scenario/users', { platform: 'bluesky', handle: 'extra.user' });
    clock.set(new Date(t0.getTime() + days(3)));
    expect(await worldState()).not.toEqual(seeded);

    const response = await scenario('POST', '/scenario/restore');

    expect(response.json()).toEqual({ ok: true, service: { status: 202 } });
    expect(await worldState()).toEqual(seeded);
    expect(clock.now()).toEqual(t0);
    expect(received).toEqual([{ url: '/test/clock', token, body: { now: t0.toISOString() } }]);
  });

  it('POST /scenario/restore still restores the world when the service is unreachable', async () => {
    const seeded = await worldState();
    await scenario('POST', '/scenario/accounts', { platform: 'x', handle: '@extra' });
    const unreachable = buildApp({
      db,
      clock,
      sha: 'test-sha',
      serviceUrl: 'http://127.0.0.1:1',
      serviceToken: token,
      retryDelaysMs: [],
    });
    try {
      const response = await unreachable.inject({ method: 'POST', url: '/scenario/restore' });
      expect(response.json()).toEqual({ ok: true, service: { error: expect.any(String) } });
      expect(await worldState()).toEqual(seeded);
    } finally {
      await unreachable.close();
    }
  });

  describe('network failures per attempt', () => {
    const ingests = () => received.filter((entry) => entry.url === '/ingest/events');

    const withDropApp = async (
      options: { retryDelaysMs: number[]; random: () => number },
      run: (drop: FastifyInstance) => Promise<void>,
    ) => {
      const { port } = stub.address() as AddressInfo;
      const drop = buildApp({
        db,
        clock,
        sha: 'test-sha',
        serviceUrl: `http://127.0.0.1:${port}`,
        serviceToken: token,
        ...options,
      });
      await drop.ready();
      try {
        await run(drop);
      } finally {
        await drop.close();
      }
    };

    const commentThrough = async (drop: FastifyInstance) =>
      (
        await drop.inject({
          method: 'POST',
          url: '/scenario/comments',
          payload: { postId: 'instagram_post_1', userId: 'instagram_jane.doe', text: 'pricing?' },
        })
      ).json<{ id: string }>();

    const attemptsOf = async (eventId: string) =>
      (await deliveries())
        .map((row) => row as { event_id: string; attempt: number; status: string })
        .filter((row) => row.event_id === eventId)
        .map((row) => [row.attempt, row.status])
        .reverse();

    const deliveryLog = async (eventId: string) =>
      (await scenario('GET', '/scenario/event-log'))
        .json<{ result_code: string | null; payload: Record<string, unknown> }[]>()
        .filter(
          (entry) =>
            entry.payload.eventId === eventId &&
            ['NETWORK_DROP', 'SERVICE_ERROR', 'GAVE_UP'].includes(entry.result_code ?? ''),
        )
        .map((entry) => [entry.result_code, entry.payload])
        .reverse();

    const gaveUp = async (eventId: string) =>
      (await deliveryLog(eventId)).some(([code]) => code === 'GAVE_UP');

    it('retries a request lost on the way in and the service sees the event once', async () => {
      await scenario('PUT', '/scenario/settings', { dropPercent: 100 });
      await withDropApp({ retryDelaysMs: [400], random: () => 0.1 }, async (drop) => {
        const comment = await commentThrough(drop);
        const eventId = `evt_${comment.id}`;
        await waitFor(async () => (await attemptsOf(eventId)).length === 1);
        await scenario('PUT', '/scenario/settings', { dropPercent: 0 });
        await waitFor(async () => (await attemptsOf(eventId)).length === 2);

        expect(await attemptsOf(eventId)).toEqual([
          [1, 'failed'],
          [2, 'delivered'],
        ]);
        expect(ingests().map((entry) => entry.body)).toEqual([
          { events: [expect.objectContaining({ eventId })] },
        ]);
        expect(answers).toEqual([{ accepted: 1, duplicates: 0 }]);
        expect(await deliveryLog(eventId)).toEqual([
          ['NETWORK_DROP', { eventId, attempt: 1, shape: 'not received', retryInMs: 400 }],
        ]);
      });
    });

    it('retries after a lost response and the service counts the second copy as a duplicate', async () => {
      await scenario('PUT', '/scenario/settings', { dropPercent: 100 });
      await withDropApp({ retryDelaysMs: [400], random: () => 0.9 }, async (drop) => {
        const comment = await commentThrough(drop);
        const eventId = `evt_${comment.id}`;
        await waitFor(async () => (await attemptsOf(eventId)).length === 1);
        await scenario('PUT', '/scenario/settings', { dropPercent: 0 });
        await waitFor(async () => (await attemptsOf(eventId)).length === 2);

        expect(await attemptsOf(eventId)).toEqual([
          [1, 'failed'],
          [2, 'delivered'],
        ]);
        expect(ingests().map((entry) => entry.body)).toEqual([
          { events: [expect.objectContaining({ eventId })] },
          { events: [expect.objectContaining({ eventId })] },
        ]);
        expect(answers).toEqual([
          { accepted: 1, duplicates: 0 },
          { accepted: 0, duplicates: 1 },
        ]);
        expect(await deliveryLog(eventId)).toEqual([
          ['NETWORK_DROP', { eventId, attempt: 1, shape: 'response lost', retryInMs: 400 }],
        ]);
      });
    });

    it('gives up after twenty failed attempts and never marks the event dropped', async () => {
      await scenario('PUT', '/scenario/settings', { dropPercent: 100 });
      await withDropApp({ retryDelaysMs: [1, 2], random: () => 0.1 }, async (drop) => {
        const comment = await commentThrough(drop);
        const eventId = `evt_${comment.id}`;
        await waitFor(() => gaveUp(eventId));

        expect(await attemptsOf(eventId)).toEqual(
          Array.from({ length: 20 }, (_, index) => [index + 1, 'failed']),
        );
        expect(await deliveryLog(eventId)).toEqual([
          ...Array.from({ length: 20 }, (_, index) => [
            'NETWORK_DROP',
            {
              eventId,
              attempt: index + 1,
              shape: 'not received',
              retryInMs: index === 0 ? 1 : index === 19 ? null : 2,
            },
          ]),
          ['GAVE_UP', { eventId, attempts: 20 }],
        ]);
        expect(ingests()).toEqual([]);
        const codes = (await scenario('GET', '/scenario/event-log'))
          .json<{ result_code: string | null }[]>()
          .map((entry) => entry.result_code);
        expect(codes).not.toContain('DROPPED');
      });
    });

    it('logs a 500 from the service as a service error, not a network drop, and retries', async () => {
      serviceErrors = 1;
      await withDropApp({ retryDelaysMs: [50], random: () => 0.1 }, async (drop) => {
        const comment = await commentThrough(drop);
        const eventId = `evt_${comment.id}`;
        await waitFor(async () => (await attemptsOf(eventId)).length === 2);

        expect(await attemptsOf(eventId)).toEqual([
          [1, 'failed'],
          [2, 'delivered'],
        ]);
        expect(await deliveryLog(eventId)).toEqual([
          ['SERVICE_ERROR', { eventId, attempt: 1, status: 500, retryInMs: 50 }],
        ]);
        expect(answers).toEqual([{ accepted: 1, duplicates: 0 }]);
      });
    });

    it('gives up once 36 hours of stand time have passed since the first attempt', async () => {
      await scenario('PUT', '/scenario/settings', { dropPercent: 100 });
      await withDropApp({ retryDelaysMs: [400], random: () => 0.1 }, async (drop) => {
        const comment = await commentThrough(drop);
        const eventId = `evt_${comment.id}`;
        await waitFor(async () => (await attemptsOf(eventId)).length === 1);
        clock.set(new Date(t0.getTime() + hours(36)));
        await waitFor(() => gaveUp(eventId));

        expect(await deliveryLog(eventId)).toEqual([
          ['NETWORK_DROP', { eventId, attempt: 1, shape: 'not received', retryInMs: 400 }],
          ['NETWORK_DROP', { eventId, attempt: 2, shape: 'not received', retryInMs: null }],
          ['GAVE_UP', { eventId, attempts: 2 }],
        ]);
      });
    });
  });
});
