import type {
  AnalyticsResponse,
  AutomationDetail,
  AutomationsResponse,
  PublishResponse,
  RunDetail,
  RunsResponse,
} from '@comment-automations/api-schema';
import type { Definition } from '@comment-automations/shared';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { Harness } from '../testing/harness.js';
import { START, TOKEN, comment, createHarness, message, withDatabase } from '../testing/harness.js';

const HOUR = 60 * 60 * 1000;

const definition: Definition = {
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [
    { kind: 'reply_to_comment', text: 'Sent you a DM!' },
    { kind: 'send_message', text: 'What is your email?', buttons: [] },
    { kind: 'wait_for_reply', expect: 'email', giveUpHours: 72 },
    { kind: 'send_message', text: 'Sent to {{email}}', buttons: [] },
  ],
};

const second: Definition = {
  ...definition,
  steps: [{ kind: 'reply_to_comment', text: 'Check your inbox' }, ...definition.steps.slice(1)],
};

withDatabase('the automations API on a real database', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it('syncs accounts from the gateway and returns them with capabilities', async () => {
    h.gateway.answer('listAccounts', {
      ok: true,
      value: [
        {
          accountId: 'ig_acc',
          platform: 'instagram',
          handle: 'boltato',
          displayName: 'Boltato',
          status: 'connected',
        },
      ],
    });
    h.gateway.answer('listPosts', {
      ok: true,
      value: [{ postId: 'p_1', caption: 'Launch', publishedAt: '2026-10-01T00:00:00Z' }],
    });

    const accounts = await h.app.inject({ method: 'GET', url: '/accounts' });
    const body = accounts.json<{ accounts: Array<Record<string, unknown>> }>();
    const id = body.accounts[0]!.id as string;
    const posts = await h.app.inject({ method: 'GET', url: `/accounts/${id}/posts` });
    const missing = await h.app.inject({
      method: 'GET',
      url: '/accounts/00000000-0000-0000-0000-000000000000/posts',
    });

    expect(accounts.statusCode).toBe(200);
    expect(body.accounts).toEqual([
      {
        id,
        platform: 'instagram',
        handle: 'boltato',
        displayName: 'Boltato',
        status: 'connected',
        capabilities: {
          record: expect.objectContaining({ platform: 'instagram' }),
          allowedTriggers: { comments: true, messages: true },
          allowedStepKinds: ['reply_to_comment', 'send_message', 'wait_for_reply', 'call_webhook'],
          requiresUnreachableChoice: false,
          canRemindBeforeReply: false,
        },
      },
    ]);
    expect(posts.json()).toEqual({
      posts: [{ postId: 'p_1', caption: 'Launch', publishedAt: '2026-10-01T00:00:00Z' }],
    });
    expect(missing.statusCode).toBe(404);
    expect(h.gateway.calls.map((call) => call.operation)).toEqual(['listAccounts', 'listPosts']);
  });

  it('creates a draft, refuses an invalid draft unless forced, and publishes versions', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const created = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: 'Pricing guide' },
    });
    const automation = created.json<AutomationDetail>();
    expect(created.statusCode).toBe(201);
    expect(automation).toEqual({
      id: expect.any(String),
      name: 'Pricing guide',
      accountId: account,
      platform: 'instagram',
      state: 'draft',
      activeVersionNumber: null,
      triggerSummary: 'Comment · any',
      stats: { runs24h: 0, succeeded24h: 0, failed24h: 0, lastRunAt: null },
      draft: {
        trigger: {
          comments: { posts: { kind: 'any' }, keywords: [] },
          onRepeatWhileWaiting: 'supersede',
        },
        steps: [],
      },
      versions: [],
    });
    const url = `/automations/${automation.id}`;

    const invalid: Definition = {
      ...definition,
      steps: [{ kind: 'send_message', text: '', buttons: [] }],
    };
    const rejected = await h.app.inject({
      method: 'PUT',
      url: `${url}/draft`,
      payload: { definition: invalid },
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json()).toEqual({
      issues: [{ path: 'steps.0.text', code: 'TEXT_REQUIRED', message: 'Text must not be empty' }],
    });
    const forced = await h.app.inject({
      method: 'PUT',
      url: `${url}/draft?force=true`,
      payload: { definition: invalid },
    });
    expect(forced.statusCode).toBe(200);
    expect(forced.json<AutomationDetail>().draft).toEqual(invalid);
    const unpublishable = await h.app.inject({ method: 'POST', url: `${url}/publish` });
    expect(unpublishable.statusCode).toBe(422);

    await h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition } });
    const v1 = await h.app.inject({
      method: 'POST',
      url: `${url}/publish`,
      payload: { note: 'first' },
    });
    expect(v1.statusCode).toBe(200);
    expect(v1.json<PublishResponse>()).toEqual({
      version: {
        id: expect.any(String),
        number: 1,
        note: 'first',
        publishedAt: START.toISOString(),
        isActive: true,
        definition,
      },
    });

    await h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition: second } });
    const v2 = await h.app.inject({
      method: 'POST',
      url: `${url}/publish`,
      payload: { note: 'second' },
    });
    expect(v2.json<PublishResponse>().version.number).toBe(2);
    const live = (await h.app.inject({ method: 'GET', url })).json<AutomationDetail>();
    expect([live.state, live.activeVersionNumber, live.draft, live.triggerSummary]).toEqual([
      'live',
      2,
      null,
      'Comment · pricing',
    ]);

    const v1Id = v1.json<PublishResponse>().version.id;
    const activated = await h.app.inject({
      method: 'POST',
      url: `${url}/activate`,
      payload: { versionId: v1Id },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json<AutomationDetail>().versions).toEqual([
      {
        id: v1Id,
        number: 1,
        note: 'first',
        publishedAt: START.toISOString(),
        isActive: true,
        definition,
      },
      {
        id: v2.json<PublishResponse>().version.id,
        number: 2,
        note: 'second',
        publishedAt: START.toISOString(),
        isActive: false,
        definition: second,
      },
    ]);
    expect(activated.json<AutomationDetail>().activeVersionNumber).toBe(1);

    const fromV2 = await h.app.inject({
      method: 'POST',
      url: `${url}/draft-from-version`,
      payload: { versionId: v2.json<PublishResponse>().version.id },
    });
    expect(fromV2.json<AutomationDetail>().draft).toEqual(second);
    const republished = await h.app.inject({ method: 'POST', url: `${url}/publish`, payload: {} });
    expect(republished.json<PublishResponse>().version.number).toBe(3);
    expect((await h.app.inject({ method: 'GET', url: `${url}/versions` })).json()).toEqual({
      versions: [
        expect.objectContaining({ number: 1, isActive: false }),
        expect.objectContaining({ number: 2, isActive: false }),
        expect.objectContaining({ number: 3, isActive: true, note: '' }),
      ],
    });

    const paused = await h.app.inject({ method: 'POST', url: `${url}/pause` });
    expect([
      paused.json<AutomationDetail>().state,
      paused.json<AutomationDetail>().activeVersionNumber,
    ]).toEqual(['draft', 3]);
    const resumed = await h.app.inject({ method: 'POST', url: `${url}/publish` });
    expect(resumed.json<PublishResponse>().version.number).toBe(3);
    expect((await h.app.inject({ method: 'GET', url })).json<AutomationDetail>().state).toBe(
      'live',
    );

    const archived = await h.app.inject({ method: 'DELETE', url });
    expect(archived.statusCode).toBe(204);
    expect((await h.app.inject({ method: 'GET', url: '/automations' })).json()).toEqual({
      automations: [],
    });
    expect((await h.app.inject({ method: 'GET', url })).json<AutomationDetail>().state).toBe(
      'archived',
    );
    expect((await h.app.inject({ method: 'POST', url: `${url}/publish` })).statusCode).toBe(409);
    expect((await h.app.inject({ method: 'GET', url: '/automations/nope' })).statusCode).toBe(404);
  });

  it('reports analytics per version and per day from SQL', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId, versionId } = await h.createLive(account, definition);

    await h.ingest([
      comment(),
      comment({ eventId: 'evt_2', commentId: 'c_2', authorId: 'u_joe', authorHandle: 'joe' }),
    ]);
    await h.drain();
    h.clock.advance(HOUR);
    await h.ingest([message({ createdAt: h.clock.now().toISOString() })]);
    await h.drain();

    const response = await h.app.inject({
      method: 'GET',
      url: `/automations/${automationId}/analytics`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<AnalyticsResponse>()).toEqual({
      perVersion: [
        {
          versionId,
          number: 1,
          started: 2,
          replied: 1,
          replyRate: 0.5,
          completed: 1,
          completionRate: 0.5,
          emailsCaptured: 1,
          emailRate: 0.5,
          failed: 0,
          medianSecondsToEmail: 3600,
        },
      ],
      perDay: [{ day: '2026-10-04', started: 2, emailsCaptured: 1 }],
    });

    const filtered = await h.app.inject({
      method: 'GET',
      url: `/automations/${automationId}/analytics?versionIds=00000000-0000-0000-0000-000000000000`,
    });
    expect(filtered.json()).toEqual({ perVersion: [], perDay: [] });

    const list = await h.app.inject({ method: 'GET', url: '/automations' });
    expect(list.json<AutomationsResponse>().automations[0]?.stats).toEqual({
      runs24h: 2,
      succeeded24h: 1,
      failed24h: 0,
      lastRunAt: START.toISOString(),
    });
  });

  it('lists runs newest first with filters and a cursor, and stops a run on request', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId, versionId } = await h.createLive(account, definition);
    await h.ingest([comment()]);
    h.clock.advance(HOUR);
    await h.ingest([
      comment({ eventId: 'evt_2', commentId: 'c_2', authorId: 'u_joe', authorHandle: 'joe' }),
    ]);
    await h.drain();
    const base = `/automations/${automationId}/runs`;

    const page1 = (
      await h.app.inject({ method: 'GET', url: `${base}?limit=1` })
    ).json<RunsResponse>();
    expect(page1.runs.map((run) => run.contactHandle)).toEqual(['joe']);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = (
      await h.app.inject({
        method: 'GET',
        url: `${base}?limit=1&cursor=${encodeURIComponent(page1.nextCursor!)}`,
      })
    ).json<RunsResponse>();
    expect(page2).toEqual({
      runs: [
        {
          id: expect.any(String),
          contactHandle: 'jane',
          status: 'waiting',
          stepIndex: 2,
          stepCount: 4,
          versionNumber: 1,
          startedAt: START.toISOString(),
          finishedAt: null,
        },
      ],
      nextCursor: null,
    });

    const byContact = (
      await h.app.inject({ method: 'GET', url: `${base}?contact=JO` })
    ).json<RunsResponse>();
    expect(byContact.runs.map((run) => run.contactHandle)).toEqual(['joe']);
    const byWildcard = (
      await h.app.inject({ method: 'GET', url: `${base}?contact=${encodeURIComponent('_')}` })
    ).json<RunsResponse>();
    expect(byWildcard).toEqual({ runs: [], nextCursor: null });
    const byVersion = (
      await h.app.inject({ method: 'GET', url: `${base}?versionIds=${versionId}&status=waiting` })
    ).json<RunsResponse>();
    expect(byVersion.runs).toHaveLength(2);
    const none = (
      await h.app.inject({ method: 'GET', url: `${base}?status=failed` })
    ).json<RunsResponse>();
    expect(none).toEqual({ runs: [], nextCursor: null });

    const janeId = page2.runs[0]!.id;
    const stopped = await h.app.inject({ method: 'POST', url: `/runs/${janeId}/stop` });
    expect(stopped.statusCode).toBe(200);
    const detail = stopped.json<RunDetail>();
    expect([detail.status, detail.finishedAt, detail.timeline.at(-1)?.message]).toEqual([
      'expired',
      h.clock.now().toISOString(),
      'Stopped by the user',
    ]);
    expect((await h.app.inject({ method: 'POST', url: `/runs/${janeId}/stop` })).statusCode).toBe(
      409,
    );
    expect(
      (await h.app.inject({ method: 'GET', url: '/runs/00000000-0000-0000-0000-000000000000' }))
        .statusCode,
    ).toBe(404);
  });

  it('sets and reads the controlled clock through the test routes', async () => {
    const set = await h.app.inject({
      method: 'POST',
      url: '/test/clock',
      headers: { 'x-service-token': TOKEN },
      payload: { now: '2026-12-01T00:00:00Z' },
    });
    const read = await h.app.inject({ method: 'GET', url: '/test/clock' });

    expect(set.json()).toEqual({ now: '2026-12-01T00:00:00.000Z' });
    expect(read.json()).toEqual({ now: '2026-12-01T00:00:00.000Z' });
    expect(h.clock.now().toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('serves the web page to a browser on an API path and the API answer to a JSON client', async () => {
    const publicDir = mkdtempSync(path.join(tmpdir(), 'public-'));
    writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>Automations</title>');
    const app = buildApp({ ...h.deps, publicDir });
    const page = await app.inject({
      method: 'GET',
      url: '/automations/abc',
      headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    const nested = await app.inject({
      method: 'GET',
      url: '/automations/abc/runs',
      headers: { accept: 'text/html' },
    });
    const api = await app.inject({
      method: 'GET',
      url: '/automations/abc',
      headers: { accept: 'application/json' },
    });
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { accept: 'text/html' },
    });
    await app.close();

    expect([page.statusCode, page.headers['content-type'], page.body]).toEqual([
      200,
      'text/html; charset=utf-8',
      '<!doctype html><title>Automations</title>',
    ]);
    expect([nested.statusCode, nested.body]).toEqual([
      200,
      '<!doctype html><title>Automations</title>',
    ]);
    expect([api.statusCode, api.json()]).toEqual([404, { error: 'Not found' }]);
    expect([health.statusCode, health.json()]).toEqual([200, { status: 'ok', sha: 'test' }]);
  });
});
