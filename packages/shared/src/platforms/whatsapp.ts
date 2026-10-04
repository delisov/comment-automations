import type { CapabilityRecord } from '../capabilities.js';
import { hoursToMs } from '../durations.js';

export const whatsapp: CapabilityRecord = {
  platform: 'whatsapp',
  commentEvents: 'none',
  publicReply: false,
  privateReply: null,
  conversationWindow: { openedBy: 'contactMessage', durationMs: hoursToMs(24) },
  dmInitiation: 'contactFirst',
  commenterIsMessageable: 'no',
  reminderBeforeReply: true,
  messageLimits: { maxChars: 4096, buttons: 1, linksInText: true },
  replyLimits: { maxChars: 0 },
  ownActivityEcho: false,
  access: 'appReview',
};
