import type { Rules } from './rules.js';

export const rules: Rules = {
  comments: false,
  publicReply: false,
  privateReply: null,
  messaging: { kind: 'none' },
  limits: { replyMaxChars: 0, messageMaxChars: 0, maxButtons: 0 },
  ownActivityEcho: false,
};
