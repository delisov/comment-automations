import type { StepKind } from './definition.js';
import type { Platform } from './platform.js';

export type CommentEvents = 'push' | 'pull' | 'stream' | 'none';
export type DmInitiation =
  'never' | 'recipientSetting' | 'mutualFollow' | 'contactFirst' | 'always';
export type CommenterIsMessageable = 'yes' | 'viaPrivateReplyOnly' | 'no';
export type Access = 'selfServe' | 'appReview' | 'partnerOnly' | 'paidTier';

export type MessageLimits = {
  maxChars: number;
  maxBytes?: number;
  buttons: number;
  linksInText: boolean;
};

export type ReplyLimits = { maxChars: number };

export type CapabilityRecord = {
  platform: Platform;
  commentEvents: CommentEvents;
  publicReply: boolean;
  privateReply: null | { oncePerComment: true; windowFromCommentMs: number };
  conversationWindow: null | { openedBy: 'contactMessage'; durationMs: number };
  dmInitiation: DmInitiation;
  commenterIsMessageable: CommenterIsMessageable;
  reminderBeforeReply: boolean;
  messageLimits: MessageLimits;
  replyLimits: ReplyLimits;
  maxConsecutiveMessages?: number;
  ownActivityEcho: boolean;
  access: Access;
};

export type AllowedTriggers = { comments: boolean; messages: boolean };

const canMessage = (record: CapabilityRecord): boolean =>
  record.commenterIsMessageable !== 'no' || record.conversationWindow !== null;

export const allowedTriggers = (record: CapabilityRecord): AllowedTriggers => ({
  comments: record.commentEvents !== 'none',
  messages: record.conversationWindow !== null || record.commenterIsMessageable === 'yes',
});

export const allowedStepKinds = (record: CapabilityRecord): StepKind[] => {
  const kinds: StepKind[] = [];
  if (record.publicReply || record.privateReply !== null) {
    kinds.push('reply_to_comment');
  }
  if (canMessage(record)) {
    kinds.push('send_message', 'wait_for_reply');
  }
  kinds.push('call_webhook');
  return kinds;
};

export const requiresUnreachableChoice = (record: CapabilityRecord): boolean =>
  record.dmInitiation === 'recipientSetting' || record.dmInitiation === 'mutualFollow';

export const canRemindBeforeReply = (record: CapabilityRecord): boolean =>
  record.reminderBeforeReply;
