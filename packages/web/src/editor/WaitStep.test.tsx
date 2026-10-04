import type { WaitForReplyStep } from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
import { WaitStep } from './WaitStep.js';

afterEach(cleanup);

const step: WaitForReplyStep = {
  kind: 'wait_for_reply',
  expect: 'email',
  giveUpHours: 72,
  nudge: { text: 'Just the email is enough', then: 'wait' },
};

const renderWait = (platform: 'instagram' | 'bluesky') =>
  render(
    <WaitStep
      step={step}
      caps={deriveCapabilities(capabilities[platform])}
      issues={[]}
      path="steps.2"
      readOnly={false}
      onChange={vi.fn()}
    />,
  );

describe('wait step', () => {
  it('hides the reminder controls and explains why when the network cannot remind', () => {
    renderWait('instagram');
    expect(screen.queryByLabelText('Reminder')).toBeNull();
    expect(screen.queryByLabelText('Reminder after')).toBeNull();
    expect(
      screen.getByText(
        'Wait for their first reply. Instagram lets you message again only after they write back.',
      ),
    ).not.toBeNull();
  });

  it('shows the reminder controls when the network allows a reminder', () => {
    renderWait('bluesky');
    expect(screen.getByLabelText('Reminder')).not.toBeNull();
    expect(screen.getByLabelText('Reminder after')).not.toBeNull();
    expect(screen.queryByText(/lets you message again only after/)).toBeNull();
  });

  it('shows both branches with the give-up time and the ask-once-more text', () => {
    renderWait('instagram');
    expect(screen.getByText('If they don’t reply at all')).not.toBeNull();
    expect(screen.getByText('If they reply without an email')).not.toBeNull();
    expect((screen.getByLabelText('Give up after') as HTMLSelectElement).value).toBe('72');
    expect((screen.getByLabelText('Ask once more text') as HTMLTextAreaElement).value).toBe(
      'Just the email is enough',
    );
  });
});
