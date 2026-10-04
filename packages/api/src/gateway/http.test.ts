import { describe, expect, it } from 'vitest';
import { httpGateway } from './http.js';

type Call = { url: string; init: RequestInit | undefined };

const fetchAnswering = (status: number, body: unknown, calls: Call[]): typeof fetch =>
  (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

describe('httpGateway', () => {
  it('posts a reply with the service token and returns the gateway answer', async () => {
    const calls: Call[] = [];
    const gateway = httpGateway(
      'http://stand:3100',
      'secret',
      fetchAnswering(200, { replyId: 'r_1', conversationId: 'conv_1' }, calls),
    );
    const request = {
      accountId: 'acc_1',
      commentId: 'c_1',
      text: 'hi',
      visibility: 'private' as const,
      idempotencyKey: 'run:0:message',
    };

    const result = await gateway.replyToComment(request);

    expect(result).toEqual({ ok: true, value: { replyId: 'r_1', conversationId: 'conv_1' } });
    expect(calls).toEqual([
      {
        url: 'http://stand:3100/gateway/replies',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-service-token': 'secret' },
          body: JSON.stringify(request),
        },
      },
    ]);
  });

  it('maps a contract error body to a typed gateway error', async () => {
    const gateway = httpGateway(
      'http://stand:3100',
      'secret',
      fetchAnswering(429, { code: 'RATE_LIMITED', message: 'slow down', retryable: true }, []),
    );

    const result = await gateway.sendMessage({
      accountId: 'acc_1',
      recipient: { conversationId: 'conv_1' },
      text: 'hi',
      idempotencyKey: 'run:1:message',
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'slow down', retryable: true },
    });
  });

  it('throws when the gateway fails outside the contract', async () => {
    const gateway = httpGateway('http://stand:3100', 'secret', fetchAnswering(502, 'bad', []));

    await expect(gateway.listAccounts()).rejects.toThrow(
      'Gateway answered 502 to GET /gateway/accounts',
    );
  });

  it('unwraps account and post listings', async () => {
    const calls: Call[] = [];
    const account = {
      accountId: 'acc_1',
      platform: 'instagram' as const,
      handle: 'boltato',
      displayName: 'Boltato',
      status: 'connected' as const,
    };
    const accounts = httpGateway(
      'http://g',
      't',
      fetchAnswering(200, { accounts: [account] }, calls),
    );
    const post = { postId: 'p_1', caption: 'Launch', publishedAt: '2026-10-01T00:00:00Z' };
    const posts = httpGateway('http://g', 't', fetchAnswering(200, { posts: [post] }, calls));

    expect(await accounts.listAccounts()).toEqual({ ok: true, value: [account] });
    expect(await posts.listPosts('acc 1')).toEqual({ ok: true, value: [post] });
    expect(calls.map((call) => call.url)).toEqual([
      'http://g/gateway/accounts',
      'http://g/gateway/posts?accountId=acc+1',
    ]);
  });
});
