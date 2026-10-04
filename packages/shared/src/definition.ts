import type { PostId } from './ids.js';

export const DEFAULT_GIVE_UP_HOURS = 72;

export type Button = { title: string; url: string };

export type PostSelection = { kind: 'any' } | { kind: 'specific'; postId: PostId };

export type CommentsTrigger = { posts: PostSelection; keywords: string[] };

export type MessagesTrigger = { keywords: string[] };

export type OnRepeatWhileWaiting = 'supersede' | 'ignore';

export type Trigger = {
  comments?: CommentsTrigger;
  messages?: MessagesTrigger;
  onRepeatWhileWaiting: OnRepeatWhileWaiting;
};

export type OnUnreachable = 'fail' | 'skip' | 'publicReplyInstead';

export type WebhookMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const WEBHOOK_METHODS: readonly WebhookMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export type ReplyToCommentStep = { kind: 'reply_to_comment'; text: string };

export type SendMessageStep = {
  kind: 'send_message';
  text: string;
  buttons: Button[];
  onUnreachable?: OnUnreachable;
  fallbackText?: string;
};

export type WaitForReplyStep = {
  kind: 'wait_for_reply';
  expect: 'email' | 'any';
  giveUpHours: number;
  reminder?: { afterHours: number; text: string };
  nudge?: { text: string; then: 'wait' | 'end' };
};

export type CallWebhookStep = {
  kind: 'call_webhook';
  method: WebhookMethod;
  url: string;
  headers: Record<string, string>;
};

export type Step = ReplyToCommentStep | SendMessageStep | WaitForReplyStep | CallWebhookStep;

export type StepKind = Step['kind'];

export const STEP_KINDS: readonly StepKind[] = [
  'reply_to_comment',
  'send_message',
  'wait_for_reply',
  'call_webhook',
];

export type Definition = { trigger: Trigger; steps: Step[] };
