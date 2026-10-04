import { describe, expect, it } from 'vitest';
import type { Comment, Delivery, LogEntry } from '../api.js';
import { annotate } from './annotate.js';

const comment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'c_1',
  post_id: 'p_1',
  author_user_id: 'u_jane',
  author_account_id: null,
  parent_id: null,
  text: 'pricing?',
  created_at: '2026-10-04T10:00:00.000Z',
  private_reply_sent: false,
  ...overrides,
});

const ingested: LogEntry = {
  id: 1,
  direction: 'to_service',
  kind: 'comment',
  payload: { commentId: 'c_1', eventId: 'evt_1' },
  result_code: 'ACCEPTED',
  at: '2026-10-04T10:00:00.000Z',
};

const reply = (visibility: 'private' | 'public', result_code = 'OK'): LogEntry => ({
  id: 2,
  direction: 'from_service',
  kind: 'reply',
  payload: { request: { commentId: 'c_1', visibility, text: 'Sent you a DM' } },
  result_code,
  at: '2026-10-04T10:00:01.000Z',
});

const delivered: Delivery = {
  id: 1,
  event_id: 'evt_1',
  attempt: 1,
  status: 'delivered',
  at: '2026-10-04T10:00:00.500Z',
};

describe('annotate', () => {
  it('shows "private reply used" once when both the comment flag and the log say so', () => {
    const tags = annotate(
      comment({ private_reply_sent: true }),
      [ingested, reply('private')],
      [delivered],
    );
    expect(tags).toEqual([
      { text: 'private reply used', tone: 'ok' },
      { text: 'delivered', tone: 'ok' },
    ]);
  });

  it('shows "private reply used" once when only the log knows about the reply', () => {
    expect(annotate(comment(), [reply('private')], [])).toEqual([
      { text: 'private reply used', tone: 'ok' },
    ]);
  });

  it('shows "private reply used" once when only the comment flag is set', () => {
    expect(annotate(comment({ private_reply_sent: true }), [], [])).toEqual([
      { text: 'private reply used', tone: 'ok' },
    ]);
  });

  it('keeps public replies and refusals as separate chips', () => {
    const tags = annotate(
      comment({ private_reply_sent: true }),
      [reply('public'), reply('private', 'REPLY_WINDOW_CLOSED')],
      [],
    );
    expect(tags).toEqual([
      { text: 'private reply used', tone: 'ok' },
      { text: 'public reply', tone: 'ok' },
      { text: 'refused REPLY_WINDOW_CLOSED', tone: 'danger' },
    ]);
  });

  it('ignores log entries about other comments', () => {
    const other: LogEntry = {
      ...reply('private'),
      payload: { request: { commentId: 'c_2', visibility: 'private' } },
    };
    expect(annotate(comment(), [other], [])).toEqual([]);
  });
});
