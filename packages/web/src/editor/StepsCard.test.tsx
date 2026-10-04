import type { ValidationIssue } from '@comment-automations/api-schema';
import type { Step, Trigger } from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
import { StepsCard } from './StepsCard.js';

afterEach(cleanup);

const commentsTrigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
  onRepeatWhileWaiting: 'supersede',
};

const privateReplyLine = 'Sent as a private reply to the comment · text only';

const renderSteps = (
  platform: 'instagram' | 'bluesky',
  steps: Step[],
  issues: ValidationIssue[] = [],
) => {
  render(
    <StepsCard
      steps={steps}
      trigger={commentsTrigger}
      caps={deriveCapabilities(capabilities[platform])}
      issues={issues}
      readOnly={false}
      onChange={vi.fn()}
    />,
  );
  return screen
    .getAllByText(/^Send a message$/)
    .map((title) => title.closest('.step') as HTMLElement);
};

describe('steps card', () => {
  it('offers no buttons on the Instagram message that goes out as the private reply', () => {
    const [first] = renderSteps('instagram', [{ kind: 'send_message', text: 'Hey', buttons: [] }]);
    expect(within(first!).queryByText('+ Add a button')).toBeNull();
    expect(within(first!).getByText(privateReplyLine)).not.toBeNull();
  });

  it('offers buttons again on the Instagram message that follows a wait for a reply', () => {
    const [first, second] = renderSteps('instagram', [
      { kind: 'send_message', text: 'Hey', buttons: [] },
      {
        kind: 'wait_for_reply',
        expect: 'email',
        giveUpHours: 72,
        nudge: { text: '', then: 'wait' },
      },
      { kind: 'send_message', text: 'Thanks', buttons: [] },
    ]);
    expect(within(first!).queryByText('+ Add a button')).toBeNull();
    expect(within(second!).getByText('+ Add a button')).not.toBeNull();
    expect(within(second!).queryByText(privateReplyLine)).toBeNull();
  });

  it('keeps showing buttons an older draft put on the private reply so they can be removed', () => {
    const [first] = renderSteps('instagram', [
      { kind: 'send_message', text: 'Hey', buttons: [{ title: 'Pricing', url: 'https://x.y' }] },
    ]);
    expect(within(first!).getByLabelText('Button 1 title')).not.toBeNull();
    expect(within(first!).getByText('Remove')).not.toBeNull();
    expect(within(first!).queryByText('+ Add a button')).toBeNull();
  });

  it('treats the first Bluesky message as a direct message', () => {
    const [first] = renderSteps('bluesky', [{ kind: 'send_message', text: 'Hey', buttons: [] }]);
    expect(within(first!).queryByText(privateReplyLine)).toBeNull();
  });

  it('writes the issue on a step kind under the step header', () => {
    const [, second] = renderSteps(
      'instagram',
      [
        { kind: 'send_message', text: 'Hey', buttons: [] },
        { kind: 'send_message', text: 'And again', buttons: [] },
      ],
      [
        {
          path: 'steps.1.kind',
          code: 'STEP_NOT_ALLOWED_HERE',
          message: 'Instagram allows at most 1 messages in a row before the contact replies',
        },
      ],
    );
    expect(second!.className).toBe('step err');
    expect(
      within(second!).getByText(
        'Instagram allows at most 1 messages in a row before the contact replies',
      ),
    ).not.toBeNull();
  });

  it('writes the issue on the unreachable choice under the choice', () => {
    const [first] = renderSteps(
      'bluesky',
      [{ kind: 'send_message', text: 'Hey', buttons: [], onUnreachable: 'skip' }],
      [
        {
          path: 'steps.0.onUnreachable',
          code: 'UNREACHABLE_CHOICE_REQUIRED',
          message: 'Bluesky lets recipients refuse messages; choose what happens',
        },
      ],
    );
    expect(
      within(first!).getByText('Bluesky lets recipients refuse messages; choose what happens'),
    ).not.toBeNull();
  });

  it('writes the issue on a button title under the button and any other step path once', () => {
    const [first] = renderSteps(
      'bluesky',
      [
        {
          kind: 'send_message',
          text: 'Hey',
          buttons: [{ title: '', url: 'https://x.y' }],
          onUnreachable: 'skip',
        },
      ],
      [
        {
          path: 'steps.0.buttons.0.title',
          code: 'BUTTON_TITLE_REQUIRED',
          message: 'Name the button',
        },
        { path: 'steps.0.rule.new', code: 'NEW_RULE', message: 'A rule the editor never heard of' },
      ],
    );
    expect(within(first!).getAllByText('Name the button')).toHaveLength(1);
    expect(within(first!).getAllByText('A rule the editor never heard of')).toHaveLength(1);
  });
});
