import type { CapabilityRecord } from '../capabilities.js';

export const bluesky: CapabilityRecord = {
  platform: 'bluesky',
  commentEvents: 'stream',
  publicReply: true,
  privateReply: null,
  conversationWindow: null,
  dmInitiation: 'recipientSetting',
  commenterIsMessageable: 'yes',
  reminderBeforeReply: true,
  messageLimits: { maxChars: 10000, buttons: 0, linksInText: true },
  replyLimits: { maxChars: 300 },
  handleMaxChars: 64,
  ownActivityEcho: true,
  access: 'selfServe',
};
