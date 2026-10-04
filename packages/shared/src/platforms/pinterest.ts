import type { CapabilityRecord } from '../capabilities.js';

export const pinterest: CapabilityRecord = {
  platform: 'pinterest',
  commentEvents: 'none',
  publicReply: false,
  privateReply: null,
  conversationWindow: null,
  dmInitiation: 'never',
  commenterIsMessageable: 'no',
  reminderBeforeReply: false,
  messageLimits: { maxChars: 0, buttons: 0, linksInText: false },
  replyLimits: { maxChars: 0 },
  handleMaxChars: 31,
  ownActivityEcho: false,
  access: 'selfServe',
};
