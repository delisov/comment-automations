import type { Rules } from './rules.js';
import { hours } from './rules.js';

export const rules: Rules = {
  comments: false,
  publicReply: false,
  privateReply: null,
  messaging: { kind: 'window', durationMs: hours(24), maxConsecutiveAccountMessages: null },
  limits: { replyMaxChars: 0, messageMaxChars: 4096, maxButtons: 3 },
  ownActivityEcho: false,
};
