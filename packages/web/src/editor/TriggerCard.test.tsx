import type { ValidationIssue } from '@comment-automations/api-schema';
import type { Trigger } from '@comment-automations/shared';
import { accountId, capabilities } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
import { TriggerCard } from './TriggerCard.js';

afterEach(cleanup);

const trigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing', '!!!'] },
  onRepeatWhileWaiting: 'supersede',
};

const Harness = ({ onChange }: { onChange: (trigger: Trigger) => void }) => {
  const [value, setValue] = useState(trigger);
  return (
    <TriggerCard
      trigger={value}
      caps={deriveCapabilities(capabilities.instagram)}
      accountId={accountId('acc_ig')}
      issues={[]}
      readOnly={false}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

const renderCard = (issues: ValidationIssue[] = []) => {
  const onChange = vi.fn();
  render(
    <TriggerCard
      trigger={trigger}
      caps={deriveCapabilities(capabilities.instagram)}
      accountId={accountId('acc_ig')}
      issues={issues}
      readOnly={false}
      onChange={onChange}
    />,
  );
  return onChange;
};

const chips = () =>
  Array.from(document.querySelectorAll('.kw > span'))
    .filter((chip) => !chip.classList.contains('kwph'))
    .map((chip) => chip.textContent?.replace('×', ''));

describe('trigger card', () => {
  it('marks the keyword the API cannot match and says why', () => {
    renderCard([
      {
        path: 'trigger.comments.keywords.1',
        code: 'KEYWORD_UNMATCHABLE',
        message: 'A keyword needs at least one letter, number or emoji',
      },
    ]);
    expect(screen.getByText('A keyword needs at least one letter, number or emoji')).not.toBeNull();
    expect(screen.getByText('!!!').className).toBe('err');
    expect(screen.getByText('pricing').className).toBe('');
  });

  it('shows any other issue under the trigger', () => {
    renderCard([
      { path: 'trigger.comments.posts.postId', code: 'POST_NOT_FOUND', message: 'Post is gone' },
      { path: 'trigger.messages.keywords', code: 'NEW_RULE', message: 'Something about keywords' },
    ]);
    expect(screen.getByText('Post is gone')).not.toBeNull();
    expect(screen.getByText('Something about keywords')).not.toBeNull();
  });

  it('treats keywords that differ only by case as the same keyword', () => {
    const onChange = renderCard();
    const input = screen.getByLabelText('Keyword');
    fireEvent.change(input, { target: { value: 'PRICING' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Price' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({
      ...trigger,
      comments: { posts: { kind: 'any' }, keywords: ['pricing', '!!!', 'Price'] },
    });
  });

  it('keeps the keywords when the only trigger is unticked and ticked again', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const comments = screen.getByRole('checkbox', { name: 'comments' });
    fireEvent.click(comments);
    expect(chips()).toEqual(['pricing', '!!!']);
    fireEvent.click(comments);
    expect(chips()).toEqual(['pricing', '!!!']);
    expect(onChange).toHaveBeenLastCalledWith(trigger);
  });
});
