import { runId } from '@comment-automations/shared';
import { expect, it } from 'vitest';
import { idempotencyKey } from './idempotency.js';

it('builds the key from the run, the step and the purpose', () => {
  expect(idempotencyKey(runId('run_1'), 2, 'nudge')).toBe('run_1:2:nudge');
  expect(idempotencyKey(runId('run_1'), 0, 'reply')).not.toBe(
    idempotencyKey(runId('run_1'), 0, 'message'),
  );
});
