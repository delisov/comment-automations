import type { Definition } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import { triggerSummary } from './trigger-summary.js';

const withTrigger = (trigger: Definition['trigger']): Definition => ({ trigger, steps: [] });

describe('triggerSummary', () => {
  it('names the trigger kind and its keywords', () => {
    expect(
      triggerSummary(
        withTrigger({
          comments: { posts: { kind: 'any' }, keywords: ['pricing', 'price', 'how much'] },
          onRepeatWhileWaiting: 'supersede',
        }),
      ),
    ).toBe('Comment · pricing, price, how much');
    expect(
      triggerSummary(
        withTrigger({ messages: { keywords: ['catalog'] }, onRepeatWhileWaiting: 'supersede' }),
      ),
    ).toBe('Message · catalog');
    expect(
      triggerSummary(
        withTrigger({
          comments: { posts: { kind: 'any' }, keywords: [] },
          onRepeatWhileWaiting: 'supersede',
        }),
      ),
    ).toBe('Comment · any');
    expect(
      triggerSummary(
        withTrigger({
          comments: { posts: { kind: 'any' }, keywords: ['guide'] },
          messages: { keywords: ['guide'] },
          onRepeatWhileWaiting: 'supersede',
        }),
      ),
    ).toBe('Comment or message · guide');
  });

  it('says so when nothing triggers the automation yet', () => {
    expect(triggerSummary(null)).toBe('No trigger yet');
    expect(triggerSummary(withTrigger({ onRepeatWhileWaiting: 'supersede' }))).toBe(
      'No trigger yet',
    );
  });
});
