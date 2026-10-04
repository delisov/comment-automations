import type { RunId } from '@comment-automations/shared';

export type OutboundPurpose = 'reply' | 'message' | 'reminder' | 'nudge' | 'fallback' | 'webhook';

export const idempotencyKey = (runId: RunId, stepIndex: number, purpose: OutboundPurpose): string =>
  `${runId}:${stepIndex}:${purpose}`;
