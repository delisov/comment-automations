import { describe, expect, it } from 'vitest';
import type { Comment, Delivery, LogEntry, Message } from '../api.js';
import { annotate, annotateMessage, deliveryLogLine } from './annotate.js';

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

const attempt = (number: number, status: Delivery['status'], event_id = 'evt_1'): Delivery => ({
  id: number,
  event_id,
  attempt: number,
  status,
  at: '2026-10-04T10:00:00.500Z',
});

const delivered = attempt(1, 'delivered');

const gaveUp = (eventId: string, attempts: number): LogEntry => ({
  id: 9,
  direction: 'to_service',
  kind: 'comment',
  payload: { eventId, attempts },
  result_code: 'GAVE_UP',
  at: '2026-10-04T10:30:00.000Z',
});

const serviceError = (eventId: string, number: number, status: number | null): LogEntry => ({
  id: 30 + number,
  direction: 'to_service',
  kind: 'comment',
  payload: { eventId, attempt: number, status, retryInMs: 1000 },
  result_code: 'SERVICE_ERROR',
  at: '2026-10-04T10:00:01.000Z',
});

const networkDrop = (eventId: string, number: number): LogEntry => ({
  id: 10 + number,
  direction: 'to_service',
  kind: 'comment',
  payload: { eventId, attempt: number, shape: 'response lost', retryInMs: 5000 },
  result_code: 'NETWORK_DROP',
  at: '2026-10-04T10:00:01.000Z',
});

describe('annotate', () => {
  it('shows "private reply used" once when both the comment flag and the log say so', () => {
    const tags = annotate(
      comment({ private_reply_sent: true }),
      [ingested, reply('private')],
      [delivered],
    );
    expect(tags).toEqual([
      { text: 'private reply used', tone: 'ok' },
      { text: 'delivered on attempt 1', tone: 'ok' },
    ]);
  });

  it('shows the attempt a comment was delivered on after network drops', () => {
    expect(
      annotate(
        comment(),
        [ingested, networkDrop('evt_1', 1), networkDrop('evt_1', 2)],
        [attempt(3, 'delivered'), attempt(2, 'failed'), attempt(1, 'failed')],
      ),
    ).toEqual([{ text: 'delivered on attempt 3', tone: 'ok' }]);
  });

  it('shows a comment as retrying after the latest network drop', () => {
    expect(
      annotate(
        comment(),
        [ingested, networkDrop('evt_1', 1), networkDrop('evt_1', 2)],
        [attempt(2, 'failed'), attempt(1, 'failed')],
      ),
    ).toEqual([{ text: 'network drop on attempt 2, retrying', tone: 'warn' }]);
  });

  it('shows the status the service answered while retrying, not a network drop', () => {
    expect(
      annotate(comment(), [ingested, serviceError('evt_1', 1, 500)], [attempt(1, 'failed')]),
    ).toEqual([{ text: 'service answered 500, retrying', tone: 'warn' }]);
    expect(
      annotate(
        comment(),
        [ingested, serviceError('evt_1', 1, 500)],
        [attempt(2, 'delivered'), attempt(1, 'failed')],
      ),
    ).toEqual([{ text: 'delivered on attempt 2', tone: 'ok' }]);
    expect(
      annotate(comment(), [ingested, serviceError('evt_1', 1, null)], [attempt(1, 'failed')]),
    ).toEqual([{ text: 'service unreachable, retrying', tone: 'warn' }]);
  });

  it('follows the latest failed attempt when a network drop follows a service error', () => {
    expect(
      annotate(
        comment(),
        [ingested, serviceError('evt_1', 1, 503), networkDrop('evt_1', 2)],
        [attempt(2, 'failed'), attempt(1, 'failed')],
      ),
    ).toEqual([{ text: 'network drop on attempt 2, retrying', tone: 'warn' }]);
  });

  it('shows a comment the network gave up on with the attempt count', () => {
    const failures = Array.from({ length: 20 }, (_, index) => attempt(20 - index, 'failed'));
    expect(annotate(comment(), [ingested, gaveUp('evt_1', 20)], failures)).toEqual([
      { text: 'gave up after 20 attempts', tone: 'danger' },
    ]);
  });

  it('shows a comment still waiting for its first attempt as delivering', () => {
    expect(annotate(comment(), [ingested], [])).toEqual([{ text: 'delivering…', tone: 'muted' }]);
  });

  it('ignores another event giving up', () => {
    expect(annotate(comment(), [ingested, gaveUp('evt_2', 20)], [delivered])).toEqual([
      { text: 'delivered on attempt 1', tone: 'ok' },
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

describe('annotateMessage', () => {
  const message = (overrides: Partial<Message> = {}): Message => ({
    id: 'm_1',
    conversation_id: 'conv_1',
    from: 'user',
    text: 'hi',
    buttons: [],
    created_at: '2026-10-04T10:00:00.000Z',
    ...overrides,
  });

  const sent: LogEntry = {
    id: 1,
    direction: 'to_service',
    kind: 'message',
    payload: { messageId: 'm_1', eventId: 'evt_m_1' },
    result_code: null,
    at: '2026-10-04T10:00:00.000Z',
  };

  it('shows each delivery state of a user message', () => {
    expect(annotateMessage(message(), [sent], [attempt(2, 'delivered', 'evt_m_1')])).toEqual([
      { text: 'delivered on attempt 2', tone: 'ok' },
    ]);
    expect(annotateMessage(message(), [sent], [attempt(1, 'failed', 'evt_m_1')])).toEqual([
      { text: 'attempt 1 failed, retrying', tone: 'warn' },
    ]);
    expect(
      annotateMessage(
        message(),
        [sent, { ...networkDrop('evt_m_1', 1), kind: 'message' }],
        [attempt(1, 'failed', 'evt_m_1')],
      ),
    ).toEqual([{ text: 'network drop on attempt 1, retrying', tone: 'warn' }]);
    expect(
      annotateMessage(message(), [sent, gaveUp('evt_m_1', 20)], [attempt(20, 'failed', 'evt_m_1')]),
    ).toEqual([{ text: 'gave up after 20 attempts', tone: 'danger' }]);
  });

  it('tags nothing on a message no event was sent for', () => {
    expect(annotateMessage(message({ id: 'm_2' }), [sent], [])).toEqual([]);
  });
});

describe('deliveryLogLine', () => {
  it('names the failed attempt and when the next one runs', () => {
    expect(deliveryLogLine(networkDrop('evt_1', 2))).toEqual(
      'attempt 2 failed: network drop, response lost; attempt 3 at 2026-10-04T10:00:06.000Z (in 5 s)',
    );
    expect(deliveryLogLine(serviceError('evt_1', 1, 500))).toEqual(
      'attempt 1 failed: service answered 500; attempt 2 at 2026-10-04T10:00:02.000Z (in 1 s)',
    );
    expect(deliveryLogLine(serviceError('evt_1', 1, null))).toEqual(
      'attempt 1 failed: service unreachable; attempt 2 at 2026-10-04T10:00:02.000Z (in 1 s)',
    );
  });

  it('says no attempt follows the last one and reports giving up', () => {
    const last: LogEntry = {
      ...networkDrop('evt_1', 20),
      payload: { eventId: 'evt_1', attempt: 20, shape: 'not received', retryInMs: null },
    };
    expect(deliveryLogLine(last)).toEqual(
      'attempt 20 failed: network drop, not received; no further attempt',
    );
    expect(deliveryLogLine(gaveUp('evt_1', 20))).toEqual('gave up after 20 attempts');
  });

  it('has no delivery line for an ordinary event entry', () => {
    expect(deliveryLogLine(ingested)).toEqual(null);
  });
});
