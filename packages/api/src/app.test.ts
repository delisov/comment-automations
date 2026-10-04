import { systemClock } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { fakeGateway } from './gateway/fake.js';

const build = (testMode: boolean) =>
  buildApp({
    sha: 'abc123',
    db: createDb('postgres://nobody:nobody@localhost:1/none'),
    gateway: fakeGateway(),
    clock: systemClock,
    fetch,
    serviceToken: 'secret',
    testMode,
    publicDir: 'does-not-exist',
  });

describe('buildApp', () => {
  it('GET /health answers 200 with status ok and the build sha', async () => {
    const app = build(false);
    const response = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', sha: 'abc123' });
  });

  it('exposes /test/clock only in test mode', async () => {
    const real = build(false);
    const test = build(true);
    const hidden = await real.inject({ method: 'GET', url: '/test/clock' });
    const shown = await test.inject({ method: 'GET', url: '/test/clock' });
    const setOnSystemClock = await test.inject({
      method: 'POST',
      url: '/test/clock',
      payload: { now: '2026-10-04T10:00:00Z' },
    });
    await real.close();
    await test.close();

    expect(hidden.statusCode).toBe(404);
    expect(shown.statusCode).toBe(200);
    expect(setOnSystemClock.statusCode).toBe(409);
  });

  it('rejects ingestion without the service token before touching the database', async () => {
    const app = build(false);
    const response = await app.inject({
      method: 'POST',
      url: '/ingest/events',
      headers: { 'x-service-token': 'wrong' },
      payload: { events: [] },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid service token' });
  });

  it('answers 404 as JSON for unknown API paths when there is no web build', async () => {
    const app = build(false);
    const api = await app.inject({ method: 'GET', url: '/automations/nope/unknown' });
    const page = await app.inject({ method: 'GET', url: '/some/page' });
    await app.close();

    expect(api.statusCode).toBe(404);
    expect(page.statusCode).toBe(404);
  });
});
