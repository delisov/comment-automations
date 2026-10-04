import type { Step, StepKind, Trigger } from './definition.js';
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

const canReply = (record: CapabilityRecord): boolean =>
  record.publicReply || record.privateReply !== null;

const canMessage = (record: CapabilityRecord): boolean =>
  record.commenterIsMessageable !== 'no' || record.conversationWindow !== null;

export const allowedTriggers = (record: CapabilityRecord): AllowedTriggers => ({
  comments: record.commentEvents !== 'none',
  messages: record.conversationWindow !== null || record.commenterIsMessageable === 'yes',
});

export const allowedStepKinds = (record: CapabilityRecord): StepKind[] => {
  const kinds: StepKind[] = [];
  if (canReply(record)) {
    kinds.push('reply_to_comment');
  }
  if (canMessage(record)) {
    kinds.push('send_message', 'wait_for_reply');
  }
  kinds.push('call_webhook');
  return kinds;
};

const stepsSinceLastMessage = (stepsSoFar: Step[]): Step[] | null => {
  const lastMessage = stepsSoFar.map((step) => step.kind).lastIndexOf('send_message');
  return lastMessage === -1 ? null : stepsSoFar.slice(lastMessage + 1);
};

const messagesSinceLastWait = (stepsSoFar: Step[]): number => {
  const lastWait = stepsSoFar.map((step) => step.kind).lastIndexOf('wait_for_reply');
  return stepsSoFar.slice(lastWait + 1).filter((step) => step.kind === 'send_message').length;
};

export const consecutiveMessageCapReached = (
  record: CapabilityRecord,
  stepsSoFar: Step[],
): boolean =>
  record.maxConsecutiveMessages !== undefined &&
  messagesSinceLastWait(stepsSoFar) >= record.maxConsecutiveMessages;

export const deliveredAsPrivateReply = (
  record: CapabilityRecord,
  trigger: Trigger,
  stepsSoFar: Step[],
): boolean =>
  record.commenterIsMessageable === 'viaPrivateReplyOnly' &&
  trigger.comments !== undefined &&
  !stepsSoFar.some((step) => step.kind === 'wait_for_reply');

export const nextAllowedStepKinds = (
  record: CapabilityRecord,
  trigger: Trigger,
  stepsSoFar: Step[],
): StepKind[] => {
  const sinceMessage = stepsSinceLastMessage(stepsSoFar);
  const waitedSinceMessage =
    sinceMessage !== null && sinceMessage.some((step) => step.kind === 'wait_for_reply');
  const kinds: StepKind[] = [];
  if (canReply(record) && trigger.comments !== undefined) {
    kinds.push('reply_to_comment');
  }
  if (canMessage(record)) {
    if (
      (record.commenterIsMessageable !== 'viaPrivateReplyOnly' ||
        sinceMessage === null ||
        waitedSinceMessage) &&
      !consecutiveMessageCapReached(record, stepsSoFar)
    ) {
      kinds.push('send_message');
    }
    if (sinceMessage !== null && !waitedSinceMessage) {
      kinds.push('wait_for_reply');
    }
  }
  kinds.push('call_webhook');
  return kinds;
};

export const requiresUnreachableChoice = (record: CapabilityRecord): boolean =>
  record.dmInitiation === 'recipientSetting' || record.dmInitiation === 'mutualFollow';

export const canRemindBeforeReply = (record: CapabilityRecord): boolean =>
  record.reminderBeforeReply;
