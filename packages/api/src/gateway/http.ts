import {
  AccountsResponse,
  GATEWAY_ERROR_CODES,
  MessageResponse,
  PostsResponse,
  ReplyResponse,
} from '@comment-automations/gateway-contract';
import type { GatewayError as ContractError } from '@comment-automations/gateway-contract';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { Gateway, GatewayError, GatewayResult } from './port.js';

type Fetch = typeof fetch;

export const GATEWAY_TIMEOUT_MS = 10_000;

export const MALFORMED_RESPONSE: GatewayError = {
  code: 'MALFORMED_RESPONSE',
  message: 'The gateway answered outside the contract',
  retryable: false,
};

const isGatewayError = (body: unknown): body is ContractError =>
  typeof body === 'object' &&
  body !== null &&
  GATEWAY_ERROR_CODES.includes((body as ContractError).code) &&
  typeof (body as ContractError).retryable === 'boolean';

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const httpGateway = (baseUrl: string, token: string, fetchFn: Fetch): Gateway => {
  const call = async <S extends TSchema>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<GatewayResult<Static<S>>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    let response: Response;
    let parsed: unknown;
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-service-token': token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      parsed = await readBody(response);
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) {
      return Value.Check(schema, parsed)
        ? { ok: true, value: parsed }
        : { ok: false, error: MALFORMED_RESPONSE };
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
    replyToComment: (request) => call('POST', '/gateway/replies', ReplyResponse, request),
    sendMessage: (request) => call('POST', '/gateway/messages', MessageResponse, request),
    listAccounts: async () => {
      const result = await call('GET', '/gateway/accounts', AccountsResponse);
      return result.ok ? { ok: true, value: result.value.accounts } : result;
    },
    listPosts: async (accountId) => {
      const query = new URLSearchParams({ accountId });
      const result = await call('GET', `/gateway/posts?${query}`, PostsResponse);
      return result.ok ? { ok: true, value: result.value.posts } : result;
    },
  };
};
