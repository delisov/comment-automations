import type { CapabilityRecord } from '../capabilities.js';
import { daysToMs, hoursToMs } from '../durations.js';

export const facebook: CapabilityRecord = {
  platform: 'facebook',
  commentEvents: 'push',
  publicReply: true,
  privateReply: { oncePerComment: true, windowFromCommentMs: daysToMs(7) },
  conversationWindow: { openedBy: 'contactMessage', durationMs: hoursToMs(24) },
  dmInitiation: 'never',
  commenterIsMessageable: 'viaPrivateReplyOnly',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 2000, buttons: 3, linksInText: true },
  replyLimits: { maxChars: 2000 },
  handleMaxChars: 51,
  ownActivityEcho: true,
  access: 'appReview',
};
