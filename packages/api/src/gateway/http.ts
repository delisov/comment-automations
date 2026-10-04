import type {
  AccountsResponse,
  PostsResponse,
  GatewayError,
} from '@comment-automations/gateway-contract';
import { GATEWAY_ERROR_CODES } from '@comment-automations/gateway-contract';
import type { Gateway, GatewayResult } from './port.js';

type Fetch = typeof fetch;

const isGatewayError = (body: unknown): body is GatewayError =>
  typeof body === 'object' &&
  body !== null &&
  GATEWAY_ERROR_CODES.includes((body as GatewayError).code) &&
  typeof (body as GatewayError).retryable === 'boolean';

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const httpGateway = (baseUrl: string, token: string, fetchFn: Fetch): Gateway => {
  const call = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<GatewayResult<T>> => {
    const response = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-service-token': token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await readBody(response);
    if (response.ok) {
      return { ok: true, value: parsed as T };
    }
    if (isGatewayError(parsed)) {
      return {
        ok: false,
        error: { code: parsed.code, message: parsed.message, retryable: parsed.retryable },
      };
    }
    throw new Error(`Gateway answered ${response.status} to ${method} ${path}`);
  };

  return {
    replyToComment: (request) => call('POST', '/gateway/replies', request),
    sendMessage: (request) => call('POST', '/gateway/messages', request),
    listAccounts: async () => {
      const result = await call<AccountsResponse>('GET', '/gateway/accounts');
      return result.ok ? { ok: true, value: result.value.accounts } : result;
    },
    listPosts: async (accountId) => {
      const query = new URLSearchParams({ accountId });
      const result = await call<PostsResponse>('GET', `/gateway/posts?${query}`);
      return result.ok ? { ok: true, value: result.value.posts } : result;
    },
  };
};
