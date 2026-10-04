import type {
  AnalyticsResponse,
  AutomationDetail,
  AutomationsResponse,
  PublishResponse,
  RunDetail,
  RunsResponse,
} from '@comment-automations/api-schema';
import type { Definition } from '@comment-automations/shared';
import { postId } from '@comment-automations/shared';
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
      'stopped',
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

  it('accepts an empty JSON body as an empty object and still refuses malformed JSON', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, definition);
    await h.ingest([comment()]);
    await h.drain();
    const [run] = await h.runsOf(automationId);
    const emptyJson = (method: 'POST' | 'DELETE', url: string) =>
      h.app.inject({ method, url, headers: { 'content-type': 'application/json' }, body: '' });

    const stopped = await emptyJson('POST', `/runs/${run!.id}/stop`);
    const paused = await emptyJson('POST', `/automations/${automationId}/pause`);
    const published = await emptyJson('POST', `/automations/${automationId}/publish`);
    const archived = await emptyJson('DELETE', `/automations/${automationId}`);
    const malformed = await h.app.inject({
      method: 'POST',
      url: `/automations/${automationId}/publish`,
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });

    expect([stopped, paused, published, archived].map((response) => response.statusCode)).toEqual([
      200, 200, 200, 204,
    ]);
    expect([malformed.statusCode, malformed.json<{ code: string }>().code]).toEqual([
      400,
      'FST_ERR_CTP_INVALID_JSON_BODY',
    ]);
  });

  it('keeps the draft when a draft save overlaps a publish', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    for (let round = 0; round < 30; round += 1) {
      const created = await h.app.inject({
        method: 'POST',
        url: '/automations',
        payload: { accountId: account, name: `Race ${round}` },
      });
      const url = `/automations/${created.json<AutomationDetail>().id}`;
      await h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition } });

      const [saved, published] = await Promise.all([
        h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition: second } }),
        h.app.inject({ method: 'POST', url: `${url}/publish`, payload: {} }),
      ]);

      expect([saved.statusCode, published.statusCode]).toEqual([200, 200]);
      const detail = (await h.app.inject({ method: 'GET', url })).json<AutomationDetail>();
      const active = detail.versions.find((version) => version.isActive)!.definition;
      expect(detail.draft ?? active).toEqual(second);
    }
  });

  it('publishes once and answers 409 to the other when two publishes overlap', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    for (let round = 0; round < 10; round += 1) {
      const created = await h.app.inject({
        method: 'POST',
        url: '/automations',
        payload: { accountId: account, name: `Race ${round}` },
      });
      const url = `/automations/${created.json<AutomationDetail>().id}`;
      await h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition } });

      const responses = await Promise.all([
        h.app.inject({ method: 'POST', url: `${url}/publish`, payload: {} }),
        h.app.inject({ method: 'POST', url: `${url}/publish`, payload: {} }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      const versions = (await h.app.inject({ method: 'GET', url: `${url}/versions` })).json<{
        versions: unknown[];
      }>().versions;
      expect(versions).toHaveLength(1);
    }
  });

  it('reports a run stopped by the user as stopped and stops active runs when archiving', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, definition);
    await h.ingest([
      comment(),
      comment({ eventId: 'evt_2', commentId: 'c_2', authorId: 'u_joe', authorHandle: 'joe' }),
    ]);
    await h.drain();
    const runs = await h.runsOf(automationId);
    const jane = runs.find((run) => run.contactHandle === 'jane')!;
    const joe = runs.find((run) => run.contactHandle === 'joe')!;

    const stopped = await h.app.inject({ method: 'POST', url: `/runs/${jane.id}/stop` });
    const listed = await h.app.inject({
      method: 'GET',
      url: `/automations/${automationId}/runs?status=stopped`,
    });
    h.clock.advance(HOUR);
    const archived = await h.app.inject({ method: 'DELETE', url: `/automations/${automationId}` });
    const joeAfter = await h.run(joe.id);
    const analytics = await h.app.inject({
      method: 'GET',
      url: `/automations/${automationId}/analytics`,
    });

    expect([stopped.statusCode, stopped.json<RunDetail>().status]).toEqual([200, 'stopped']);
    expect(listed.json<RunsResponse>().runs.map((run) => run.id)).toEqual([jane.id]);
    expect(archived.statusCode).toBe(204);
    expect([joeAfter.status, joeAfter.finishedAt, joeAfter.timeline.at(-1)?.message]).toEqual([
      'stopped',
      h.clock.now().toISOString(),
      'Stopped because the automation was archived',
    ]);
    expect(analytics.json<AnalyticsResponse>().perVersion[0]).toEqual(
      expect.objectContaining({ started: 2, completed: 0, failed: 0 }),
    );
    expect(
      await h.db.selectFrom('jobs').select('id').where('status', '=', 'pending').execute(),
    ).toEqual([]);
  });

  it('creates the first draft with a messages trigger where the platform delivers no comments', async () => {
    const account = await h.seedAccount('whatsapp', 'wa_acc');

    const created = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: 'WhatsApp guide' },
    });

    expect(created.statusCode).toBe(201);
    const automation = created.json<AutomationDetail>();
    expect([automation.draft, automation.triggerSummary]).toEqual([
      { trigger: { messages: { keywords: [] }, onRepeatWhileWaiting: 'supersede' }, steps: [] },
      'Message · any',
    ]);
  });

  it('refuses to publish a trigger naming a post the account does not have', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const created = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: 'Launch post' },
    });
    const url = `/automations/${created.json<AutomationDetail>().id}`;
    const specific: Definition = {
      ...definition,
      trigger: {
        comments: { posts: { kind: 'specific', postId: postId('p_404') }, keywords: [] },
        onRepeatWhileWaiting: 'supersede',
      },
    };
    const drafted = await h.app.inject({
      method: 'PUT',
      url: `${url}/draft`,
      payload: { definition: specific },
    });
    const post = { caption: 'Launch', publishedAt: '2026-10-01T00:00:00Z' };

    h.gateway.answer('listPosts', { ok: true, value: [{ postId: 'p_1', ...post }] });
    const refused = await h.app.inject({ method: 'POST', url: `${url}/publish` });
    h.gateway.answer('listPosts', { ok: true, value: [{ postId: 'p_404', ...post }] });
    const published = await h.app.inject({ method: 'POST', url: `${url}/publish` });

    expect(drafted.statusCode).toBe(200);
    expect([refused.statusCode, refused.json()]).toEqual([
      422,
      {
        issues: [
          {
            path: 'trigger.comments.posts.postId',
            code: 'POST_NOT_FOUND',
            message: 'This post is not on the account',
          },
        ],
      },
    ]);
    expect(published.statusCode).toBe(200);
    expect(h.gateway.calls).toEqual([
      { operation: 'listPosts', request: { accountId: 'ig_acc' } },
      { operation: 'listPosts', request: { accountId: 'ig_acc' } },
    ]);
  });

  it('saves a name and a draft with the NUL character removed', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const created = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: 'Pricing\u0000 guide' },
    });
    expect([created.statusCode, created.json<AutomationDetail>().name]).toEqual([
      201,
      'Pricing guide',
    ]);

    const drafted = await h.app.inject({
      method: 'PUT',
      url: `/automations/${created.json<AutomationDetail>().id}/draft`,
      payload: {
        definition: {
          ...definition,
          steps: [{ kind: 'reply_to_comment', text: 'Sent\u0000 you a DM!' }],
        },
      },
    });
    expect([drafted.statusCode, drafted.json<AutomationDetail>().draft?.steps]).toEqual([
      200,
      [{ kind: 'reply_to_comment', text: 'Sent you a DM!' }],
    ]);
  });

  it('answers 400 when an analytics bound does not parse as a date', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, definition);
    const url = `/automations/${automationId}/analytics`;

    const leapSecond = await h.app.inject({
      method: 'GET',
      url: `${url}?since=2026-12-31T23:59:60Z`,
    });
    const garbage = await h.app.inject({ method: 'GET', url: `${url}?until=yesterday` });

    expect([leapSecond.statusCode, leapSecond.json<{ message: string }>().message]).toEqual([
      400,
      'since is not a valid date-time',
    ]);
    expect([garbage.statusCode, garbage.json<{ message: string }>().message]).toEqual([
      400,
      'until is not valid',
    ]);
  });

  it('refuses to change an archived automation', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId, versionId } = await h.createLive(account, definition);
    const url = `/automations/${automationId}`;
    expect((await h.app.inject({ method: 'DELETE', url })).statusCode).toBe(204);

    const attempts = [
      await h.app.inject({ method: 'PUT', url: `${url}/draft`, payload: { definition } }),
      await h.app.inject({ method: 'POST', url: `${url}/activate`, payload: { versionId } }),
      await h.app.inject({
        method: 'POST',
        url: `${url}/draft-from-version`,
        payload: { versionId },
      }),
      await h.app.inject({ method: 'POST', url: `${url}/pause` }),
    ];

    expect(attempts.map((response) => [response.statusCode, response.json()])).toEqual(
      Array.from({ length: 4 }, () => [409, { error: 'An archived automation cannot be changed' }]),
    );
    const detail = (await h.app.inject({ method: 'GET', url })).json<AutomationDetail>();
    expect([detail.state, detail.draft]).toEqual(['archived', null]);
  });

  it('reports a body that fails the schema as issues on the draft route and plainly elsewhere', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const created = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: 'Pricing guide' },
    });
    const url = `/automations/${created.json<AutomationDetail>().id}/draft`;

    const longKeyword = await h.app.inject({
      method: 'PUT',
      url,
      payload: {
        definition: {
          ...definition,
          trigger: {
            comments: { posts: { kind: 'any' }, keywords: ['a', 'b', 'c', 'x'.repeat(101)] },
            onRepeatWhileWaiting: 'supersede',
          },
        },
      },
    });
    const longText = await h.app.inject({
      method: 'PUT',
      url,
      payload: {
        definition: {
          ...definition,
          steps: [{ kind: 'send_message', text: 'x'.repeat(10_001), buttons: [] }],
        },
      },
    });
    const unnamed = await h.app.inject({
      method: 'POST',
      url: '/automations',
      payload: { accountId: account, name: '' },
    });

    expect([longKeyword.statusCode, longKeyword.json()]).toEqual([
      422,
      {
        issues: [
          {
            path: 'trigger.comments.keywords.3',
            code: 'TOO_LONG',
            message: 'is longer than 100 characters',
          },
        ],
      },
    ]);
    expect([longText.statusCode, longText.json()]).toEqual([
      422,
      {
        issues: [
          { path: 'steps.0.text', code: 'TOO_LONG', message: 'is longer than 10000 characters' },
        ],
      },
    ]);
    expect([unnamed.statusCode, unnamed.json<{ message: string }>().message]).toEqual([
      400,
      'name must not be empty',
    ]);
  });
});
