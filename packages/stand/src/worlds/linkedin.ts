import type { Rules } from './rules.js';

export const rules: Rules = {
  comments: true,
  publicReply: true,
  privateReply: null,
  messaging: { kind: 'none' },
  limits: { replyMaxChars: 1250, messageMaxChars: 0, maxButtons: 0 },
  ownActivityEcho: false,
};
