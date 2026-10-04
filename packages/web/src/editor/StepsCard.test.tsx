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

const firstPlaceholder = 'Hey! Reply with your email and I’ll send you the pricing sheet.';
const afterEmailPlaceholder =
  'Thanks! Here’s the pricing sheet: https://example.com/pricing — {{email}} is filled in with their address';
const afterReplyPlaceholder = 'Thanks for the reply! Here’s the link: https://example.com/pricing';

const message: Step = { kind: 'send_message', text: '', buttons: [] };
const waitFor = (expect: 'email' | 'any'): Step => ({
  kind: 'wait_for_reply',
  expect,
  giveUpHours: 72,
  nudge: { text: '', then: 'wait' },
});
const webhook: Step = { kind: 'call_webhook', method: 'POST', url: 'https://x.y', headers: {} };

const messageView = (card: HTMLElement) => ({
  caption: card.querySelector('.t + .meta')?.textContent ?? null,
  placeholder: (within(card).getByLabelText('Message text') as HTMLTextAreaElement).placeholder,
});

const waitCard = (title: string) => screen.getByText(title).closest('.step') as HTMLElement;

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

  it('keeps the opening placeholder and no caption on the first message', () => {
    const [first] = renderSteps('bluesky', [message]);
    expect(messageView(first!)).toEqual({ caption: null, placeholder: firstPlaceholder });
  });

  it('marks the message after an email wait as the answer to the email', () => {
    const [first, second] = renderSteps('instagram', [message, waitFor('email'), message]);
    expect(messageView(first!)).toEqual({ caption: null, placeholder: firstPlaceholder });
    expect(messageView(second!)).toEqual({
      caption: 'Sent when the email arrives',
      placeholder: afterEmailPlaceholder,
    });
    expect(
      within(waitCard('Wait for an email address')).getByText(
        'When the email arrives, the next step runs.',
      ),
    ).not.toBeNull();
  });

  it('marks the message after an any-reply wait as the answer to the reply', () => {
    const [, second] = renderSteps('instagram', [message, waitFor('any'), message]);
    expect(messageView(second!)).toEqual({
      caption: 'Sent when they reply',
      placeholder: afterReplyPlaceholder,
    });
  });

  it('still marks the message as the answer when webhooks sit between it and the wait', () => {
    const [, second] = renderSteps('instagram', [message, waitFor('any'), webhook, message]);
    expect(messageView(second!)).toEqual({
      caption: 'Sent when they reply',
      placeholder: afterReplyPlaceholder,
    });
    expect(
      within(waitCard('Wait for a reply')).getByText('When they reply, the next steps run.'),
    ).not.toBeNull();
  });

  it('treats a message right after another message as a fresh message', () => {
    const [, , third] = renderSteps('bluesky', [message, waitFor('email'), message, message]);
    expect(messageView(third!)).toEqual({ caption: null, placeholder: firstPlaceholder });
  });

  it('tells the wait that ends the automation to add an answer below it', () => {
    renderSteps('instagram', [message, waitFor('email')]);
    expect(
      within(waitCard('Wait for an email address')).getByText(
        'When the email arrives, the run ends. Add a step below to answer them.',
      ),
    ).not.toBeNull();
  });
});
