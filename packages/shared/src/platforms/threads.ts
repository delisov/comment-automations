import type { CapabilityRecord } from '../capabilities.js';

export const threads: CapabilityRecord = {
  platform: 'threads',
  commentEvents: 'push',
  publicReply: true,
  privateReply: null,
  conversationWindow: null,
  dmInitiation: 'never',
  commenterIsMessageable: 'no',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 0, buttons: 0, linksInText: false },
  replyLimits: { maxChars: 500 },
  handleMaxChars: 31,
  ownActivityEcho: true,
  access: 'appReview',
};
