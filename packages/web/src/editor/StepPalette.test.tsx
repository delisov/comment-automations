import type { Step, Trigger } from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
import { StepPalette } from './StepPalette.js';

afterEach(cleanup);

const trigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
  onRepeatWhileWaiting: 'supersede',
};

const firstMessage: Step = { kind: 'send_message', text: 'Hey', buttons: [] };

const wait: Step = {
  kind: 'wait_for_reply',
  expect: 'email',
  giveUpHours: 72,
  nudge: { text: '', then: 'wait' },
};

const openPalette = (platform: 'instagram' | 'youtube' | 'bluesky', steps: Step[]) => {
  const caps = deriveCapabilities(capabilities[platform]);
  render(<StepPalette caps={caps} trigger={trigger} steps={steps} onPick={vi.fn()} />);
  fireEvent.click(screen.getByText('+ Add step'));
  return screen.getAllByRole('menuitem').map((item) => item.querySelector('b')?.textContent);
};

describe('step palette', () => {
  it('offers Instagram a reply, a wait and a webhook after the first message', () => {
    expect(openPalette('instagram', [firstMessage])).toEqual([
      'Reply to the comment',
      'Wait for a reply',
      'Send to a webhook',
    ]);
  });

  it('offers YouTube replies and webhooks only', () => {
    expect(openPalette('youtube', [])).toEqual(['Reply to the comment', 'Send to a webhook']);
  });

  it('offers Bluesky every kind after the first message', () => {
    expect(openPalette('bluesky', [firstMessage])).toEqual([
      'Reply to the comment',
      'Send a message',
      'Wait for a reply',
      'Send to a webhook',
    ]);
  });

  it('describes the message step with the platform button limit', () => {
    openPalette('bluesky', []);
    expect(screen.getByText('Direct message with text')).not.toBeNull();
    cleanup();
    openPalette('instagram', [firstMessage, wait]);
    expect(screen.getByText('Direct message with text and up to 3 buttons')).not.toBeNull();
  });

  it('describes the Instagram message before any wait as the private reply to the comment', () => {
    openPalette('instagram', []);
    expect(screen.getByText('Private reply to the comment with text')).not.toBeNull();
  });
});
