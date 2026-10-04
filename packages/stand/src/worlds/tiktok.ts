import type { Rules } from './rules.js';
import { hours } from './rules.js';

export const rules: Rules = {
  comments: false,
  publicReply: false,
  privateReply: null,
  messaging: { kind: 'window', durationMs: hours(48), maxConsecutiveAccountMessages: 10 },
  limits: { replyMaxChars: 0, messageMaxChars: 4096, maxButtons: 3 },
  ownActivityEcho: false,
};
