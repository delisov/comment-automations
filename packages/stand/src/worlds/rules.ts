import type { GatewayErrorCode } from '@comment-automations/gateway-contract';

export type DmSetting = 'all' | 'following' | 'none';

export type Messaging =
  | { kind: 'none' }
  | { kind: 'window'; durationMs: number; maxConsecutiveAccountMessages: number | null }
  | { kind: 'dmSetting' };

export type Rules = {
  comments: boolean;
  publicReply: boolean;
  privateReply: { windowMs: number } | null;
  messaging: Messaging;
  limits: { replyMaxChars: number; messageMaxChars: number; maxButtons: number };
  ownActivityEcho: boolean;
};

export const hours = (count: number): number => count * 60 * 60 * 1000;

export const days = (count: number): number => hours(count * 24);

export type ReplyAttempt = {
  visibility: 'public' | 'private';
  text: string;
  commentCreatedAt: Date;
  privateReplySent: boolean;
  now: Date;
};

export const refuseReply = (rules: Rules, attempt: ReplyAttempt): GatewayErrorCode | null => {
  if (!rules.comments) {
    return 'UNSUPPORTED';
  }
  if (attempt.visibility === 'public') {
    if (!rules.publicReply) {
      return 'UNSUPPORTED';
    }
    return attempt.text.length > rules.limits.replyMaxChars ? 'MESSAGE_TOO_LONG' : null;
  }
  if (!rules.privateReply) {
    return 'UNSUPPORTED';
  }
  if (attempt.privateReplySent) {
    return 'ALREADY_REPLIED';
  }
  if (attempt.now.getTime() - attempt.commentCreatedAt.getTime() > rules.privateReply.windowMs) {
    return 'REPLY_WINDOW_CLOSED';
  }
  return attempt.text.length > rules.limits.messageMaxChars ? 'MESSAGE_TOO_LONG' : null;
};

export type MessageAttempt = {
  text: string;
  buttons: number;
  now: Date;
  recipient: { dmSetting: DmSetting; followsAccount: boolean };
  conversation: { lastUserMessageAt: Date | null; accountMessagesSinceUser: number } | null;
};

export const refuseMessage = (rules: Rules, attempt: MessageAttempt): GatewayErrorCode | null => {
  if (rules.messaging.kind === 'none') {
    return 'UNSUPPORTED';
  }
  if (attempt.text.length > rules.limits.messageMaxChars) {
    return 'MESSAGE_TOO_LONG';
  }
  if (attempt.buttons > rules.limits.maxButtons) {
    return 'BUTTONS_NOT_SUPPORTED';
  }
  if (rules.messaging.kind === 'dmSetting') {
    const { dmSetting, followsAccount } = attempt.recipient;
    const reachable = dmSetting === 'all' || (dmSetting === 'following' && followsAccount);
    return reachable ? null : 'RECIPIENT_UNREACHABLE';
  }
  if (!attempt.conversation) {
    return 'RECIPIENT_UNREACHABLE';
  }
  const { lastUserMessageAt, accountMessagesSinceUser } = attempt.conversation;
  if (
    lastUserMessageAt === null ||
    attempt.now.getTime() - lastUserMessageAt.getTime() > rules.messaging.durationMs
  ) {
    return 'MESSAGING_WINDOW_CLOSED';
  }
  const cap = rules.messaging.maxConsecutiveAccountMessages;
  if (cap !== null && accountMessagesSinceUser >= cap) {
    return 'MESSAGE_CAP_REACHED';
  }
  return null;
};
