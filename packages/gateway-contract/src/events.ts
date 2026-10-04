import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id, Platform, Timestamp } from './platform.js';

export const CommentEvent = Type.Object({
  kind: Type.Literal('comment'),
  platform: Platform,
  accountId: Id,
  eventId: Id,
  commentId: Id,
  postId: Id,
  parentCommentId: Type.Optional(Id),
  authorId: Id,
  authorHandle: Type.String(),
  text: Type.String(),
  createdAt: Timestamp,
});

export type CommentEvent = Static<typeof CommentEvent>;

export const MessageEvent = Type.Object({
  kind: Type.Literal('message'),
  platform: Platform,
  accountId: Id,
  eventId: Id,
  conversationId: Id,
  messageId: Id,
  senderId: Id,
  senderHandle: Type.String(),
  text: Type.String(),
  createdAt: Timestamp,
});

export type MessageEvent = Static<typeof MessageEvent>;

export const InboundEvent = Type.Union([CommentEvent, MessageEvent]);

export type InboundEvent = Static<typeof InboundEvent>;

export const IngestRequest = Type.Object({
  events: Type.Array(InboundEvent),
});

export type IngestRequest = Static<typeof IngestRequest>;

export const IngestResponse = Type.Object({
  accepted: Type.Integer({ minimum: 0 }),
  duplicates: Type.Integer({ minimum: 0 }),
});

export type IngestResponse = Static<typeof IngestResponse>;
