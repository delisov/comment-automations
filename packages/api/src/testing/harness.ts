import type { InboundEvent, IngestResponse } from '@comment-automations/gateway-contract';
import type {
  AccountId,
  AutomationId,
  ControlledClock,
  Definition,
  Platform,
  VersionId,
} from '@comment-automations/shared';
import { controlledClock } from '@comment-automations/shared';
import type { AutomationDetail, PublishResponse, RunDetail } from '@comment-automations/api-schema';
import type { Kysely } from 'kysely';
import { describe } from 'vitest';
import type { AppDeps } from '../app.js';
import { buildApp } from '../app.js';
import { createDb } from '../db/client.js';
import { migrateToLatest } from '../db/migrate.js';
import type { Database } from '../db/types.js';
import type { FakeGateway } from '../gateway/fake.js';
import { fakeGateway } from '../gateway/fake.js';
import { tick } from '../worker/worker.js';

export const TOKEN = 'test-service-token';

export const START = new Date('2026-10-04T10:00:00.000Z');

export const withDatabase = describe.skipIf(process.env.DATABASE_URL === undefined);

export type WebhookCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type Harness = {
  app: ReturnType<typeof buildApp>;
  db: Kysely<Database>;
  deps: AppDeps;
  clock: ControlledClock;
  gateway: FakeGateway;
  webhookCalls: WebhookCall[];
  webhookStatus: { value: number };
  reset(): Promise<void>;
  seedAccount(platform: Platform, externalId: string, handle?: string): Promise<AccountId>;
  createLive(
    accountId: AccountId,
    definition: Definition,
    name?: string,
  ): Promise<{ automationId: AutomationId; versionId: VersionId }>;
  ingest(events: InboundEvent[]): Promise<IngestResponse>;
  tick(): Promise<number>;
  drain(): Promise<void>;
  run(id: string): Promise<RunDetail>;
  runsOf(automationId: AutomationId): Promise<RunDetail[]>;
  close(): Promise<void>;
};

export const createHarness = async (): Promise<Harness> => {
  const db = createDb(process.env.DATABASE_URL ?? '');
  await migrateToLatest(db);
  const clock = controlledClock(START);
  const gateway = fakeGateway();
  const webhookCalls: WebhookCall[] = [];
  const webhookStatus = { value: 200 };
  const fetchFn = (async (url, init) => {
    webhookCalls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    return new Response('', { status: webhookStatus.value });
  }) as typeof fetch;
  const deps: AppDeps = {
    sha: 'test',
    db,
    gateway,
    clock,
    fetch: fetchFn,
    serviceToken: TOKEN,
    testMode: true,
    publicDir: 'does-not-exist',
  };
  const app = buildApp(deps);
  await app.ready();

  const expectStatus = (response: { statusCode: number; body: string }, expected: number) => {
    if (response.statusCode !== expected) {
      throw new Error(`Expected ${expected}, got ${response.statusCode}: ${response.body}`);
    }
  };

  const harness: Harness = {
    app,
    db,
    deps,
    clock,
    gateway,
    webhookCalls,
    webhookStatus,
    reset: async () => {
      expectStatus(await app.inject({ method: 'POST', url: '/test/reset' }), 200);
      clock.set(START);
      gateway.calls.length = 0;
      webhookCalls.length = 0;
      webhookStatus.value = 200;
    },
    seedAccount: async (platform, externalId, handle = `${platform}_account`) => {
      const { id } = await db
        .insertInto('accounts')
        .values({
          platform,
          external_id: externalId,
          handle,
          display_name: handle,
          status: 'connected',
          synced_at: clock.now(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return id;
    },
    createLive: async (accountId, definition, name = 'Pricing guide') => {
      const created = await app.inject({
        method: 'POST',
        url: '/automations',
        payload: { accountId, name },
      });
      expectStatus(created, 201);
      const automation = created.json<AutomationDetail>();
      const drafted = await app.inject({
        method: 'PUT',
        url: `/automations/${automation.id}/draft`,
        payload: { definition },
      });
      expectStatus(drafted, 200);
      const published = await app.inject({
        method: 'POST',
        url: `/automations/${automation.id}/publish`,
        payload: { note: 'first' },
      });
      expectStatus(published, 200);
      return {
        automationId: automation.id,
        versionId: published.json<PublishResponse>().version.id,
      };
    },
    ingest: async (events) => {
      const response = await app.inject({
        method: 'POST',
        url: '/ingest/events',
        headers: { 'x-service-token': TOKEN },
        payload: { events },
      });
      expectStatus(response, 202);
      return response.json<IngestResponse>();
    },
    tick: () => tick(deps),
    drain: async () => {
      while ((await tick(deps)) > 0) {
        continue;
      }
    },
    run: async (id) => {
      const response = await app.inject({ method: 'GET', url: `/runs/${id}` });
      expectStatus(response, 200);
      return response.json<RunDetail>();
    },
    runsOf: async (automationId) => {
      const rows = await db
        .selectFrom('runs')
        .select('id')
        .where('automation_id', '=', automationId)
        .orderBy('started_at')
        .orderBy('id')
        .execute();
      return Promise.all(rows.map((row) => harness.run(row.id)));
    },
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
  return harness;
};

export const comment = (
  overrides: Partial<Extract<InboundEvent, { kind: 'comment' }>> = {},
): Extract<InboundEvent, { kind: 'comment' }> => ({
  kind: 'comment',
  platform: 'instagram',
  accountId: 'ig_acc',
  eventId: 'evt_comment_1',
  commentId: 'c_1',
  postId: 'p_1',
  authorId: 'u_jane',
  authorHandle: 'jane',
  text: 'What is the pricing?',
  createdAt: START.toISOString(),
  ...overrides,
});

export const message = (
  overrides: Partial<Extract<InboundEvent, { kind: 'message' }>> = {},
): Extract<InboundEvent, { kind: 'message' }> => ({
  kind: 'message',
  platform: 'instagram',
  accountId: 'ig_acc',
  eventId: 'evt_message_1',
  conversationId: 'conv_c_1',
  messageId: 'm_1',
  senderId: 'u_jane',
  senderHandle: 'jane',
  text: 'sure, jane@example.com',
  createdAt: START.toISOString(),
  ...overrides,
});
