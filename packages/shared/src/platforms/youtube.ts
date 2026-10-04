import type { CapabilityRecord } from '../capabilities.js';

export const youtube: CapabilityRecord = {
  platform: 'youtube',
  commentEvents: 'pull',
  publicReply: true,
  privateReply: null,
  conversationWindow: null,
  dmInitiation: 'never',
  commenterIsMessageable: 'no',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 0, buttons: 0, linksInText: false },
  replyLimits: { maxChars: 10000 },
  ownActivityEcho: true,
  access: 'appReview',
};
