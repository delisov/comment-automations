import type { Rules } from './rules.js';
import { days, hours } from './rules.js';

export const rules: Rules = {
  comments: true,
  publicReply: true,
  privateReply: { windowMs: days(7) },
  messaging: { kind: 'window', durationMs: hours(24), maxConsecutiveAccountMessages: null },
  limits: { replyMaxChars: 1000, messageMaxChars: 1000, maxButtons: 3 },
  ownActivityEcho: true,
};
