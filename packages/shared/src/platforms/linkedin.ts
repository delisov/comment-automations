import type { CapabilityRecord } from '../capabilities.js';

export const linkedin: CapabilityRecord = {
  platform: 'linkedin',
  commentEvents: 'push',
  publicReply: true,
  privateReply: null,
  conversationWindow: null,
  dmInitiation: 'never',
  commenterIsMessageable: 'no',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 0, buttons: 0, linksInText: false },
  replyLimits: { maxChars: 1250 },
  ownActivityEcho: true,
  access: 'partnerOnly',
};
