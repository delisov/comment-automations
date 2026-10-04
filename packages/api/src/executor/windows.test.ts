import { capabilities } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import {
  conversationOpen,
  conversationWindowClosed,
  describeWindow,
  privateReplyOpen,
  privateReplyWindowClosed,
} from './windows.js';

const at = (iso: string): Date => new Date(iso);

describe('privateReplyOpen', () => {
  it('is open on Instagram up to 7 days after the comment and closed on day 8', () => {
    const created = at('2026-10-01T10:00:00Z');
    expect(privateReplyOpen(capabilities.instagram, created, at('2026-10-08T10:00:00Z'))).toBe(
      true,
    );
    expect(privateReplyOpen(capabilities.instagram, created, at('2026-10-08T10:00:01Z'))).toBe(
      false,
    );
    expect(privateReplyOpen(capabilities.instagram, created, at('2026-10-09T10:00:00Z'))).toBe(
      false,
    );
  });

  it('never opens on a platform without private replies', () => {
    expect(
      privateReplyOpen(
        capabilities.bluesky,
        at('2026-10-01T10:00:00Z'),
        at('2026-10-01T10:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('conversationOpen', () => {
  it('needs a contact message within 24 hours on Instagram', () => {
    const inbound = at('2026-10-04T10:00:00Z');
    expect(conversationOpen(capabilities.instagram, undefined, inbound)).toBe(false);
    expect(conversationOpen(capabilities.instagram, inbound, at('2026-10-05T10:00:00Z'))).toBe(
      true,
    );
    expect(conversationOpen(capabilities.instagram, inbound, at('2026-10-05T10:00:01Z'))).toBe(
      false,
    );
  });

  it('is always open where the record has no conversation window', () => {
    expect(conversationOpen(capabilities.bluesky, undefined, at('2026-10-04T10:00:00Z'))).toBe(
      true,
    );
  });
});

describe('window errors', () => {
  it('describe the window in days or hours', () => {
    expect(describeWindow(7 * 24 * 60 * 60 * 1000)).toBe('7-day');
    expect(describeWindow(24 * 60 * 60 * 1000)).toBe('24-hour');
    expect(describeWindow(48 * 60 * 60 * 1000)).toBe('48-hour');
    expect(describeWindow(23 * 60 * 60 * 1000)).toBe('23-hour');
  });

  it('name the closed window in the run error', () => {
    expect(privateReplyWindowClosed(capabilities.instagram)).toEqual({
      code: 'REPLY_WINDOW_CLOSED',
      message: "Couldn't send: the 7-day private-reply window closed before this step ran",
    });
    expect(conversationWindowClosed(capabilities.instagram, at('2026-10-04T10:00:00Z'))).toEqual({
      code: 'MESSAGING_WINDOW_CLOSED',
      message: "Couldn't send: the 24-hour messaging window closed before this step ran",
    });
    expect(conversationWindowClosed(capabilities.instagram, undefined)).toEqual({
      code: 'MESSAGING_WINDOW_CLOSED',
      message: "Couldn't send: the contact hasn't messaged yet, so no messaging window is open",
    });
  });
});
