import type {
  GatewayAccount,
  GatewayError,
  GatewayPost,
  MessageRequest,
  MessageResponse,
  ReplyRequest,
  ReplyResponse,
} from '@comment-automations/gateway-contract';

export type { GatewayError };

export type GatewayResult<T> = { ok: true; value: T } | { ok: false; error: GatewayError };

export type Gateway = {
  replyToComment(request: ReplyRequest): Promise<GatewayResult<ReplyResponse>>;
  sendMessage(request: MessageRequest): Promise<GatewayResult<MessageResponse>>;
  listAccounts(): Promise<GatewayResult<GatewayAccount[]>>;
  listPosts(accountId: string): Promise<GatewayResult<GatewayPost[]>>;
};

export type GatewayOperation = keyof Gateway;

export const gatewayFailure = (error: GatewayError): GatewayResult<never> => ({ ok: false, error });
