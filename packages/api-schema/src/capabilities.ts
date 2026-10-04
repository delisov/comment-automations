import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { StepKindSchema } from './definition.js';
import { Platform } from './platform.js';

export const CapabilityRecord = Type.Object({
  platform: Platform,
  commentEvents: Type.Union([
    Type.Literal('push'),
    Type.Literal('pull'),
    Type.Literal('stream'),
    Type.Literal('none'),
  ]),
  publicReply: Type.Boolean(),
  privateReply: Type.Union([
    Type.Null(),
    Type.Object({ oncePerComment: Type.Literal(true), windowFromCommentMs: Type.Number() }),
  ]),
  conversationWindow: Type.Union([
    Type.Null(),
    Type.Object({ openedBy: Type.Literal('contactMessage'), durationMs: Type.Number() }),
  ]),
  dmInitiation: Type.Union([
    Type.Literal('never'),
    Type.Literal('recipientSetting'),
    Type.Literal('mutualFollow'),
    Type.Literal('contactFirst'),
    Type.Literal('always'),
  ]),
  commenterIsMessageable: Type.Union([
    Type.Literal('yes'),
    Type.Literal('viaPrivateReplyOnly'),
    Type.Literal('no'),
  ]),
  reminderBeforeReply: Type.Boolean(),
  messageLimits: Type.Object({
    maxChars: Type.Number(),
    maxBytes: Type.Optional(Type.Number()),
    buttons: Type.Number(),
    linksInText: Type.Boolean(),
  }),
  replyLimits: Type.Object({ maxChars: Type.Number() }),
  handleMaxChars: Type.Number(),
  maxConsecutiveMessages: Type.Optional(Type.Number()),
  ownActivityEcho: Type.Boolean(),
  access: Type.Union([
    Type.Literal('selfServe'),
    Type.Literal('appReview'),
    Type.Literal('partnerOnly'),
    Type.Literal('paidTier'),
  ]),
});

export type CapabilityRecord = Static<typeof CapabilityRecord>;

export const CapabilitiesResponse = Type.Object({
  record: CapabilityRecord,
  allowedTriggers: Type.Object({ comments: Type.Boolean(), messages: Type.Boolean() }),
  allowedStepKinds: Type.Array(StepKindSchema),
  requiresUnreachableChoice: Type.Boolean(),
  canRemindBeforeReply: Type.Boolean(),
});

export type CapabilitiesResponse = Static<typeof CapabilitiesResponse>;
