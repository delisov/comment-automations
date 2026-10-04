import type { Rules } from './rules.js';

export const rules: Rules = {
  comments: true,
  publicReply: true,
  privateReply: null,
  messaging: { kind: 'dmSetting' },
  limits: { replyMaxChars: 300, messageMaxChars: 10000, maxButtons: 0 },
  ownActivityEcho: false,
};
