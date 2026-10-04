import { automationId } from '@comment-automations/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client.js';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends the JSON content type only when the request has a body', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await api.pause(automationId('a_1'));
    await api.publish(automationId('a_1'), 'First published');
    expect(fetchMock.mock.calls.map(([, init]) => init?.headers)).toEqual([
      { accept: 'application/json' },
      { accept: 'application/json', 'content-type': 'application/json' },
    ]);
  });

  it('reports the error field of a 4xx answer that has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })),
    );
    await expect(api.automation(automationId('a_1'))).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });
});
