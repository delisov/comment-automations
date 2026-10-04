import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import type {
  AccountsResponse,
  ClockRequest,
  ClockResponse,
  GatewayError,
  GatewayErrorCode,
  IngestRequest,
  IngestResponse,
  MessageRequest,
  MessageResponse,
  PostsResponse,
  ReplyRequest,
  ReplyResponse,
} from './index.js';
import * as contract from './index.js';

const ingestRequest: IngestRequest = {
  events: [
    {
      kind: 'comment',
      platform: 'instagram',
      accountId: 'acc_1',
      eventId: 'evt_1',
      commentId: 'c_1',
      postId: 'p_1',
      authorId: 'u_1',
      authorHandle: 'jane',
      text: 'pricing?',
      createdAt: '2026-10-04T10:00:00Z',
    },
    {
      kind: 'message',
      platform: 'bluesky',
      accountId: 'acc_2',
      eventId: 'evt_2',
      conversationId: 'conv_1',
      messageId: 'm_1',
      senderId: 'did:plc:jane',
      senderHandle: 'jane.bsky.social',
      text: 'jane@example.com',
      createdAt: '2026-10-04T10:05:00Z',
    },
  ],
};

const ingestResponse: IngestResponse = { accepted: 2, duplicates: 0 };

const replyRequest: ReplyRequest = {
  accountId: 'acc_1',
  commentId: 'c_1',
  text: 'Sent you a DM!',
  visibility: 'private',
  idempotencyKey: 'run_1:0:reply',
};

const replyResponse: ReplyResponse = { conversationId: 'conv_9' };

const messageRequest: MessageRequest = {
  accountId: 'acc_1',
  recipient: { conversationId: 'conv_9' },
  text: 'Here is the link',
  buttons: [{ title: 'Open', url: 'https://example.com/guide' }],
  idempotencyKey: 'run_1:3:message',
};

const messageResponse: MessageResponse = { messageId: 'm_2', conversationId: 'conv_9' };

const accountsResponse: AccountsResponse = {
  accounts: [
    {
      accountId: 'acc_1',
      platform: 'instagram',
      handle: 'boltato',
      displayName: 'Boltato',
      status: 'connected',
    },
  ],
};

const postsResponse: PostsResponse = {
  posts: [{ postId: 'p_1', caption: 'New guide out now', publishedAt: '2026-10-01T09:00:00Z' }],
};

const gatewayError: GatewayError = {
  code: 'RATE_LIMITED',
  message: 'Too many requests',
  retryable: true,
};

const clockRequest: ClockRequest = { now: '2026-10-04T10:00:00Z' };
const clockResponse: ClockResponse = { now: '2026-10-04T10:00:00Z' };

describe('gateway contract schemas', () => {
  it.each([
    ['IngestRequest', contract.IngestRequest, ingestRequest],
    ['IngestResponse', contract.IngestResponse, ingestResponse],
    ['ReplyRequest', contract.ReplyRequest, replyRequest],
    ['ReplyResponse', contract.ReplyResponse, replyResponse],
    ['MessageRequest', contract.MessageRequest, messageRequest],
    ['MessageResponse', contract.MessageResponse, messageResponse],
    ['AccountsResponse', contract.AccountsResponse, accountsResponse],
    ['PostsResponse', contract.PostsResponse, postsResponse],
    ['GatewayError', contract.GatewayError, gatewayError],
    ['ClockRequest', contract.ClockRequest, clockRequest],
    ['ClockResponse', contract.ClockResponse, clockResponse],
  ] as const)('%s accepts its example payload', (_name, schema, payload) => {
    expect([...Value.Errors(schema, payload)]).toEqual([]);
    expect(Value.Check(schema, payload)).toBe(true);
  });

  it('rejects an event of an unknown kind and a reply with an unknown visibility', () => {
    expect(
      Value.Check(contract.IngestRequest, {
        events: [{ ...ingestRequest.events[0], kind: 'like' }],
      }),
    ).toBe(false);
    expect(Value.Check(contract.ReplyRequest, { ...replyRequest, visibility: 'hidden' })).toBe(
      false,
    );
  });

  it('accepts a user recipient and rejects a recipient with neither reference', () => {
    expect(
      Value.Check(contract.MessageRequest, { ...messageRequest, recipient: { userId: 'u_1' } }),
    ).toBe(true);
    expect(Value.Check(contract.MessageRequest, { ...messageRequest, recipient: {} })).toBe(false);
  });

  it('rejects an unknown error code', () => {
    expect(Value.Check(contract.GatewayError, { ...gatewayError, code: 'TEAPOT' })).toBe(false);
  });
});

describe('gateway error codes', () => {
  it('maps each of the eleven codes to its HTTP status', () => {
    const expected: Record<GatewayErrorCode, number> = {
      ALREADY_REPLIED: 409,
      REPLY_WINDOW_CLOSED: 403,
      MESSAGING_WINDOW_CLOSED: 403,
      MESSAGE_CAP_REACHED: 409,
      RECIPIENT_UNREACHABLE: 403,
      MESSAGE_TOO_LONG: 422,
      BUTTONS_NOT_SUPPORTED: 422,
      RATE_LIMITED: 429,
      ACCOUNT_DISCONNECTED: 403,
      NOT_FOUND: 404,
      UNSUPPORTED: 422,
    };
    expect(contract.GATEWAY_ERROR_STATUS).toEqual(expected);
    expect(contract.GATEWAY_ERROR_CODES).toEqual(Object.keys(expected));
  });
});
