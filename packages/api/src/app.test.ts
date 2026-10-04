import { expect, it } from 'vitest';
import { buildApp } from './app.js';

it('GET /health answers 200 with status ok and the build sha', async () => {
  const app = buildApp({ sha: 'abc123' });
  const response = await app.inject({ method: 'GET', url: '/health' });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok', sha: 'abc123' });
});
