import type { CapabilityRecord } from '../capabilities.js';
import { daysToMs, hoursToMs } from '../durations.js';

export const instagram: CapabilityRecord = {
  platform: 'instagram',
  commentEvents: 'push',
  publicReply: true,
  privateReply: { oncePerComment: true, windowFromCommentMs: daysToMs(7) },
  conversationWindow: { openedBy: 'contactMessage', durationMs: hoursToMs(24) },
  dmInitiation: 'never',
  commenterIsMessageable: 'viaPrivateReplyOnly',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 1000, maxBytes: 1000, buttons: 3, linksInText: true },
  replyLimits: { maxChars: 1000 },
  handleMaxChars: 31,
  ownActivityEcho: true,
  access: 'appReview',
};
