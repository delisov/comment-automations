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

const renderWait = (
  platform: 'instagram' | 'bluesky',
  waitFor: WaitForReplyStep['expect'] = 'email',
  stepsAfter = 1,
) =>
  render(
    <WaitStep
      step={{ ...step, expect: waitFor }}
      caps={deriveCapabilities(capabilities[platform])}
      issues={[]}
      path="steps.2"
      readOnly={false}
      stepsAfter={stepsAfter}
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

  it.each([
    ['email', 1, 'When the email arrives, the next step runs.'],
    ['email', 2, 'When the email arrives, the next steps run.'],
    ['any', 1, 'When they reply, the next step runs.'],
    ['any', 3, 'When they reply, the next steps run.'],
    ['email', 0, 'When the email arrives, the run ends. Add a step below to answer them.'],
    ['any', 0, 'When they reply, the run ends. Add a step below to answer them.'],
  ] as const)(
    'ends the card with what happens on success (expect %s, %i steps after)',
    (waitFor, stepsAfter, line) => {
      const { container } = renderWait('instagram', waitFor, stepsAfter);
      expect(container.lastElementChild?.textContent).toEqual(line);
    },
  );
});
