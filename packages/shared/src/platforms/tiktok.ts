import type { CapabilityRecord } from '../capabilities.js';
import { hoursToMs } from '../durations.js';

export const tiktok: CapabilityRecord = {
  platform: 'tiktok',
  commentEvents: 'none',
  publicReply: false,
  privateReply: null,
  conversationWindow: { openedBy: 'contactMessage', durationMs: hoursToMs(48) },
  dmInitiation: 'contactFirst',
  commenterIsMessageable: 'no',
  reminderBeforeReply: true,
  messageLimits: { maxChars: 1000, buttons: 0, linksInText: true },
  replyLimits: { maxChars: 0 },
  maxConsecutiveMessages: 10,
  ownActivityEcho: false,
  access: 'partnerOnly',
};
