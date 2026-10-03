import { afterEach, expect, it } from 'vitest';
import { buildApp } from './app.js';

const app = buildApp({ sha: 'abc123' });

afterEach(async () => {
  await app.close();
});

it('GET /health answers 200 with status ok and the build sha', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok', sha: 'abc123' });
});
