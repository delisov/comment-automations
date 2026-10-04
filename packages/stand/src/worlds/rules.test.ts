import { describe, expect, it } from 'vitest';
import { worlds } from './index.js';
import type { MessageAttempt, ReplyAttempt } from './rules.js';
import { days, hours, refuseMessage, refuseReply } from './rules.js';

const t0 = new Date('2026-10-04T10:00:00Z');
const at = (offsetMs: number) => new Date(t0.getTime() + offsetMs);

const reply = (overrides: Partial<ReplyAttempt> = {}): ReplyAttempt => ({
  visibility: 'private',
  text: 'hello',
  commentCreatedAt: t0,
  privateReplySent: false,
  now: t0,
  ...overrides,
});

const message = (overrides: Partial<MessageAttempt> = {}): MessageAttempt => ({
  text: 'hello',
  buttons: 0,
  now: t0,
  recipient: { dmSetting: 'all', followsAccount: false },
  conversation: { lastUserMessageAt: t0, accountMessagesSinceUser: 0 },
  ...overrides,
});

describe.each(['instagram', 'facebook'] as const)('%s world', (platform) => {
  const rules = worlds[platform];
  const maxChars = platform === 'instagram' ? 1000 : 2000;

  it('allows a public reply and a first private reply inside 7 days', () => {
    expect(refuseReply(rules, reply({ visibility: 'public' }))).toBeNull();
    expect(refuseReply(rules, reply({ now: at(days(7)) }))).toBeNull();
  });

  it('refuses a second private reply to the same comment', () => {
    expect(refuseReply(rules, reply({ privateReplySent: true }))).toBe('ALREADY_REPLIED');
  });

  it('refuses a private reply after 7 days', () => {
    expect(refuseReply(rules, reply({ now: at(days(7) + 1) }))).toBe('REPLY_WINDOW_CLOSED');
  });

  it(`refuses text over ${maxChars} chars and more than 3 buttons`, () => {
    const long = 'x'.repeat(maxChars + 1);
    expect(refuseReply(rules, reply({ text: 'x'.repeat(maxChars) }))).toBeNull();
    expect(refuseReply(rules, reply({ text: long }))).toBe('MESSAGE_TOO_LONG');
    expect(refuseReply(rules, reply({ text: long, visibility: 'public' }))).toBe(
      'MESSAGE_TOO_LONG',
    );
    expect(refuseMessage(rules, message({ text: long }))).toBe('MESSAGE_TOO_LONG');
    expect(refuseMessage(rules, message({ buttons: 3 }))).toBeNull();
    expect(refuseMessage(rules, message({ buttons: 4 }))).toBe('BUTTONS_NOT_SUPPORTED');
  });

  it('allows a message within 24 h of the last user message and refuses after', () => {
    const window = (sinceUser: number) =>
      message({
        now: at(sinceUser),
        conversation: { lastUserMessageAt: t0, accountMessagesSinceUser: 1 },
      });
    expect(refuseMessage(rules, window(hours(24)))).toBeNull();
    expect(refuseMessage(rules, window(hours(24) + 1))).toBe('MESSAGING_WINDOW_CLOSED');
  });

  it('treats a conversation opened by a private reply as a closed window until the user writes', () => {
    expect(
      refuseMessage(
        rules,
        message({ conversation: { lastUserMessageAt: null, accountMessagesSinceUser: 1 } }),
      ),
    ).toBe('MESSAGING_WINDOW_CLOSED');
  });

  it('refuses to message a user who never wrote', () => {
    expect(refuseMessage(rules, message({ conversation: null }))).toBe('RECIPIENT_UNREACHABLE');
  });

  it('echoes the account activity', () => {
    expect(rules.ownActivityEcho).toBe(true);
  });
});

describe.each([
  ['threads', 500],
  ['youtube', 10000],
  ['linkedin', 1250],
] as const)('%s world', (platform, maxChars) => {
  const rules = worlds[platform];

  it(`allows public replies up to ${maxChars} chars only`, () => {
    expect(
      refuseReply(rules, reply({ visibility: 'public', text: 'x'.repeat(maxChars) })),
    ).toBeNull();
    expect(
      refuseReply(rules, reply({ visibility: 'public', text: 'x'.repeat(maxChars + 1) })),
    ).toBe('MESSAGE_TOO_LONG');
  });

  it('has no private replies and no conversations', () => {
    expect(refuseReply(rules, reply())).toBe('UNSUPPORTED');
    expect(refuseMessage(rules, message())).toBe('UNSUPPORTED');
  });
});

describe.each([
  ['x', 280],
  ['bluesky', 300],
] as const)('%s world', (platform, replyMax) => {
  const rules = worlds[platform];

  it(`allows public replies up to ${replyMax} chars and refuses private ones`, () => {
    expect(
      refuseReply(rules, reply({ visibility: 'public', text: 'x'.repeat(replyMax) })),
    ).toBeNull();
    expect(
      refuseReply(rules, reply({ visibility: 'public', text: 'x'.repeat(replyMax + 1) })),
    ).toBe('MESSAGE_TOO_LONG');
    expect(refuseReply(rules, reply())).toBe('UNSUPPORTED');
  });

  it('messages a user by dm setting, with no window', () => {
    const dm = (dmSetting: 'all' | 'following' | 'none', followsAccount: boolean) =>
      refuseMessage(
        rules,
        message({
          now: at(days(30)),
          recipient: { dmSetting, followsAccount },
          conversation: null,
        }),
      );
    expect(dm('all', false)).toBeNull();
    expect(dm('following', true)).toBeNull();
    expect(dm('following', false)).toBe('RECIPIENT_UNREACHABLE');
    expect(dm('none', true)).toBe('RECIPIENT_UNREACHABLE');
  });

  it('allows 10000 chars and no buttons in messages', () => {
    expect(refuseMessage(rules, message({ text: 'x'.repeat(10000) }))).toBeNull();
    expect(refuseMessage(rules, message({ text: 'x'.repeat(10001) }))).toBe('MESSAGE_TOO_LONG');
    expect(refuseMessage(rules, message({ buttons: 1 }))).toBe('BUTTONS_NOT_SUPPORTED');
  });
});

describe.each([
  ['whatsapp', hours(24), null],
  ['tiktok', hours(48), 10],
] as const)('%s world', (platform, windowMs, cap) => {
  const rules = worlds[platform];

  it('has no posts or comments', () => {
    expect(refuseReply(rules, reply({ visibility: 'public' }))).toBe('UNSUPPORTED');
    expect(refuseReply(rules, reply())).toBe('UNSUPPORTED');
  });

  it(`messages only inside the ${windowMs / hours(1)} h window opened by the user`, () => {
    const after = (ms: number) => refuseMessage(rules, message({ now: at(ms) }));
    expect(after(windowMs)).toBeNull();
    expect(after(windowMs + 1)).toBe('MESSAGING_WINDOW_CLOSED');
    expect(refuseMessage(rules, message({ conversation: null }))).toBe('RECIPIENT_UNREACHABLE');
  });

  it('allows 4096 chars and 3 buttons', () => {
    expect(refuseMessage(rules, message({ text: 'x'.repeat(4096), buttons: 3 }))).toBeNull();
    expect(refuseMessage(rules, message({ text: 'x'.repeat(4097) }))).toBe('MESSAGE_TOO_LONG');
    expect(refuseMessage(rules, message({ buttons: 4 }))).toBe('BUTTONS_NOT_SUPPORTED');
  });

  it(
    cap === null ? 'has no consecutive cap' : `caps consecutive account messages at ${cap}`,
    () => {
      const consecutive = (count: number) =>
        refuseMessage(
          rules,
          message({ conversation: { lastUserMessageAt: t0, accountMessagesSinceUser: count } }),
        );
      expect(consecutive(50)).toBe(cap === null ? null : 'MESSAGING_WINDOW_CLOSED');
      if (cap !== null) {
        expect(consecutive(cap - 1)).toBeNull();
        expect(consecutive(cap)).toBe('MESSAGING_WINDOW_CLOSED');
      }
    },
  );
});

describe('pinterest world', () => {
  it('supports nothing', () => {
    const rules = worlds.pinterest;
    expect(refuseReply(rules, reply({ visibility: 'public' }))).toBe('UNSUPPORTED');
    expect(refuseReply(rules, reply())).toBe('UNSUPPORTED');
    expect(refuseMessage(rules, message())).toBe('UNSUPPORTED');
  });
});
