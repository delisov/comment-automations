import type { CapabilityRecord } from '@comment-automations/shared';
import type { RunError } from '../db/types.js';

const HOUR_MS = 60 * 60 * 1000;

export const hoursToMs = (hours: number): number => hours * HOUR_MS;

const DAY_MS = 24 * HOUR_MS;

export const describeWindow = (ms: number): string =>
  ms % DAY_MS === 0 && ms >= 3 * DAY_MS ? `${ms / DAY_MS}-day` : `${Math.round(ms / HOUR_MS)}-hour`;

export const privateReplyOpen = (
  record: CapabilityRecord,
  commentCreatedAt: Date,
  now: Date,
): boolean =>
  record.privateReply !== null &&
  now.getTime() - commentCreatedAt.getTime() <= record.privateReply.windowFromCommentMs;

export const conversationOpen = (
  record: CapabilityRecord,
  lastInboundAt: Date | undefined,
  now: Date,
): boolean =>
  record.conversationWindow === null ||
  (lastInboundAt !== undefined &&
    now.getTime() - lastInboundAt.getTime() <= record.conversationWindow.durationMs);

export const privateReplyWindowClosed = (record: CapabilityRecord): RunError => ({
  code: 'REPLY_WINDOW_CLOSED',
  message:
    record.privateReply === null
      ? "Couldn't send: this platform has no private replies to comments"
      : `Couldn't send: the ${describeWindow(record.privateReply.windowFromCommentMs)} private-reply window closed before this step ran`,
});

export const conversationWindowClosed = (
  record: CapabilityRecord,
  lastInboundAt: Date | undefined,
): RunError => ({
  code: 'MESSAGING_WINDOW_CLOSED',
  message:
    lastInboundAt === undefined
      ? "Couldn't send: the contact hasn't messaged yet, so no messaging window is open"
      : `Couldn't send: the ${describeWindow(record.conversationWindow?.durationMs ?? 0)} messaging window closed before this step ran`,
});
