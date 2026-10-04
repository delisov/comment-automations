import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id, Platform, Timestamp } from './platform.js';

export const ReplyRequest = Type.Object({
  accountId: Id,
  commentId: Id,
  text: Type.String({ minLength: 1 }),
  visibility: Type.Union([Type.Literal('public'), Type.Literal('private')]),
  idempotencyKey: Type.String({ minLength: 1 }),
});

export type ReplyRequest = Static<typeof ReplyRequest>;

export const ReplyResponse = Type.Object({
  replyId: Type.Optional(Id),
  conversationId: Type.Optional(Id),
});

export type ReplyResponse = Static<typeof ReplyResponse>;

export const MessageButton = Type.Object({
  title: Type.String({ minLength: 1 }),
  url: Type.String({ minLength: 1 }),
});

export type MessageButton = Static<typeof MessageButton>;

export const MessageRecipient = Type.Union([
  Type.Object({ conversationId: Id }),
  Type.Object({ userId: Id }),
]);

export type MessageRecipient = Static<typeof MessageRecipient>;

export const MessageRequest = Type.Object({
  accountId: Id,
  recipient: MessageRecipient,
  text: Type.String({ minLength: 1 }),
  buttons: Type.Optional(Type.Array(MessageButton)),
  idempotencyKey: Type.String({ minLength: 1 }),
});

export type MessageRequest = Static<typeof MessageRequest>;

export const MessageResponse = Type.Object({
  messageId: Id,
  conversationId: Id,
});

export type MessageResponse = Static<typeof MessageResponse>;

export const GatewayAccount = Type.Object({
  accountId: Id,
  platform: Platform,
  handle: Type.String(),
  displayName: Type.String(),
  status: Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
});

export type GatewayAccount = Static<typeof GatewayAccount>;

export const AccountsResponse = Type.Object({
  accounts: Type.Array(GatewayAccount),
});

export type AccountsResponse = Static<typeof AccountsResponse>;

export const GatewayPost = Type.Object({
  postId: Id,
  caption: Type.String(),
  publishedAt: Timestamp,
});

export type GatewayPost = Static<typeof GatewayPost>;

export const PostsQuery = Type.Object({
  accountId: Id,
});

export type PostsQuery = Static<typeof PostsQuery>;

export const PostsResponse = Type.Object({
  posts: Type.Array(GatewayPost),
});

export type PostsResponse = Static<typeof PostsResponse>;
