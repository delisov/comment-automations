import type { Gateway, GatewayOperation, GatewayResult } from './port.js';

type Results = {
  replyToComment: Awaited<ReturnType<Gateway['replyToComment']>>;
  sendMessage: Awaited<ReturnType<Gateway['sendMessage']>>;
  listAccounts: Awaited<ReturnType<Gateway['listAccounts']>>;
  listPosts: Awaited<ReturnType<Gateway['listPosts']>>;
};

export type RecordedCall = { operation: GatewayOperation; request: unknown };

export type FakeGateway = Gateway & {
  calls: RecordedCall[];
  answer<O extends GatewayOperation>(operation: O, result: Results[O]): void;
};

export const fakeGateway = (): FakeGateway => {
  const calls: RecordedCall[] = [];
  const queued: { [O in GatewayOperation]: Results[O][] } = {
    replyToComment: [],
    sendMessage: [],
    listAccounts: [],
    listPosts: [],
  };
  let sequence = 0;

  const next = <O extends GatewayOperation>(
    operation: O,
    request: unknown,
    fallback: () => Results[O],
  ): Results[O] => {
    calls.push({ operation, request });
    const configured = queued[operation].shift() as Results[O] | undefined;
    return configured ?? fallback();
  };

  const ok = <T>(value: T): GatewayResult<T> => ({ ok: true, value });

  return {
    calls,
    answer: (operation, result) => {
      queued[operation].push(result);
    },
    replyToComment: async (request) =>
      next('replyToComment', request, () => {
        sequence += 1;
        return ok(
          request.visibility === 'private'
            ? { replyId: `reply_${sequence}`, conversationId: `conv_${request.commentId}` }
            : { replyId: `reply_${sequence}` },
        );
      }),
    sendMessage: async (request) =>
      next('sendMessage', request, () => {
        sequence += 1;
        const conversationId =
          'conversationId' in request.recipient
            ? request.recipient.conversationId
            : `conv_${request.recipient.userId}`;
        return ok({ messageId: `msg_${sequence}`, conversationId });
      }),
    listAccounts: async () => next('listAccounts', undefined, () => ok([])),
    listPosts: async (accountId) => next('listPosts', { accountId }, () => ok([])),
  };
};
