import type { Rules } from './rules.js';
import { days, hours } from './rules.js';

export const rules: Rules = {
  comments: true,
  publicReply: true,
  privateReply: { windowMs: days(7) },
  messaging: { kind: 'window', durationMs: hours(24), maxConsecutiveAccountMessages: null },
  limits: { replyMaxChars: 2000, messageMaxChars: 2000, maxButtons: 3 },
  ownActivityEcho: true,
};
