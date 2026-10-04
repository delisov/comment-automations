import { describe, expect, it } from 'vitest';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  deliveredAsPrivateReply,
  nextAllowedStepKinds,
  requiresUnreachableChoice,
} from './capabilities.js';
import type { Step, Trigger } from './definition.js';
import { PLATFORMS } from './platform.js';
import { capabilities } from './platforms/index.js';

const commentsTrigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
  onRepeatWhileWaiting: 'supersede',
};
const messagesTrigger: Trigger = { messages: { keywords: [] }, onRepeatWhileWaiting: 'supersede' };
const bothTriggers: Trigger = { ...commentsTrigger, ...messagesTrigger };

const reply: Step = { kind: 'reply_to_comment', text: 'Check your inbox' };
const send: Step = { kind: 'send_message', text: 'What is your email?', buttons: [] };
const wait: Step = { kind: 'wait_for_reply', expect: 'email', giveUpHours: 72 };
const webhook: Step = {
  kind: 'call_webhook',
  method: 'POST',
  url: 'https://crm.example.com/hook',
  headers: {},
};

describe('capability records', () => {
  it('declares one record per platform, each naming its own platform', () => {
    expect(Object.keys(capabilities).sort()).toEqual([...PLATFORMS].sort());
    for (const platform of PLATFORMS) {
      expect(capabilities[platform].platform).toBe(platform);
    }
  });

  it('carries the Instagram rules: private reply once within 7 days, 24 h window, 1000 bytes', () => {
    expect(capabilities.instagram).toEqual({
      platform: 'instagram',
      commentEvents: 'push',
      publicReply: true,
      privateReply: { oncePerComment: true, windowFromCommentMs: 7 * 24 * 60 * 60 * 1000 },
      conversationWindow: { openedBy: 'contactMessage', durationMs: 24 * 60 * 60 * 1000 },
      dmInitiation: 'never',
      commenterIsMessageable: 'viaPrivateReplyOnly',
      reminderBeforeReply: false,
      messageLimits: { maxChars: 1000, maxBytes: 1000, buttons: 3, linksInText: true },
      replyLimits: { maxChars: 1000 },
      ownActivityEcho: true,
      access: 'appReview',
    });
  });

  it('caps TikTok at 10 consecutive messages inside a 48 h window', () => {
    expect(capabilities.tiktok.conversationWindow).toEqual({
      openedBy: 'contactMessage',
      durationMs: 48 * 60 * 60 * 1000,
    });
    expect(capabilities.tiktok.maxConsecutiveMessages).toBe(10);
  });

  it('lets a WhatsApp message carry one URL button', () => {
    expect(capabilities.whatsapp.messageLimits).toEqual({
      maxChars: 4096,
      buttons: 1,
      linksInText: true,
    });
  });

  it('expects the account’s own replies to come back as events on every network with comments', () => {
    const echoing = PLATFORMS.filter((platform) => capabilities[platform].ownActivityEcho);
    expect(echoing).toEqual([
      'instagram',
      'facebook',
      'threads',
      'x',
      'bluesky',
      'youtube',
      'linkedin',
    ]);
  });
});

describe('allowedTriggers', () => {
  it('derives comment and message triggers from the record', () => {
    const perPlatform = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, allowedTriggers(capabilities[platform])]),
    );
    expect(perPlatform).toEqual({
      instagram: { comments: true, messages: true },
      facebook: { comments: true, messages: true },
      threads: { comments: true, messages: false },
      x: { comments: true, messages: true },
      bluesky: { comments: true, messages: true },
      youtube: { comments: true, messages: false },
      linkedin: { comments: true, messages: false },
      whatsapp: { comments: false, messages: true },
      tiktok: { comments: false, messages: true },
      pinterest: { comments: false, messages: false },
    });
  });
});

describe('allowedStepKinds', () => {
  it('offers each platform only the steps it can execute', () => {
    const perPlatform = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, allowedStepKinds(capabilities[platform])]),
    );
    expect(perPlatform).toEqual({
      instagram: ['reply_to_comment', 'send_message', 'wait_for_reply', 'call_webhook'],
      facebook: ['reply_to_comment', 'send_message', 'wait_for_reply', 'call_webhook'],
      threads: ['reply_to_comment', 'call_webhook'],
      x: ['reply_to_comment', 'send_message', 'wait_for_reply', 'call_webhook'],
      bluesky: ['reply_to_comment', 'send_message', 'wait_for_reply', 'call_webhook'],
      youtube: ['reply_to_comment', 'call_webhook'],
      linkedin: ['reply_to_comment', 'call_webhook'],
      whatsapp: ['send_message', 'wait_for_reply', 'call_webhook'],
      tiktok: ['send_message', 'wait_for_reply', 'call_webhook'],
      pinterest: ['call_webhook'],
    });
  });
});

describe('nextAllowedStepKinds', () => {
  it('on Instagram offers a second message only once a wait for the reply follows the first', () => {
    const next = (steps: Step[]) =>
      nextAllowedStepKinds(capabilities.instagram, commentsTrigger, steps);
    expect(next([])).toEqual(['reply_to_comment', 'send_message', 'call_webhook']);
    expect(next([reply])).toEqual(['reply_to_comment', 'send_message', 'call_webhook']);
    expect(next([reply, send])).toEqual(['reply_to_comment', 'wait_for_reply', 'call_webhook']);
    expect(next([reply, send, webhook])).toEqual([
      'reply_to_comment',
      'wait_for_reply',
      'call_webhook',
    ]);
    expect(next([reply, send, wait])).toEqual(['reply_to_comment', 'send_message', 'call_webhook']);
    expect(next([reply, send, wait, webhook])).toEqual([
      'reply_to_comment',
      'send_message',
      'call_webhook',
    ]);
    expect(next([send, wait, send])).toEqual([
      'reply_to_comment',
      'wait_for_reply',
      'call_webhook',
    ]);
  });

  it('on Bluesky offers a second message right away, and a wait only right after a message', () => {
    const next = (steps: Step[]) =>
      nextAllowedStepKinds(capabilities.bluesky, commentsTrigger, steps);
    expect(next([])).toEqual(['reply_to_comment', 'send_message', 'call_webhook']);
    expect(next([send])).toEqual([
      'reply_to_comment',
      'send_message',
      'wait_for_reply',
      'call_webhook',
    ]);
    expect(next([send, wait])).toEqual(['reply_to_comment', 'send_message', 'call_webhook']);
    expect(next([send, webhook])).toEqual([
      'reply_to_comment',
      'send_message',
      'wait_for_reply',
      'call_webhook',
    ]);
  });

  it('offers the comment reply only when the trigger includes comments', () => {
    expect(nextAllowedStepKinds(capabilities.instagram, messagesTrigger, [])).toEqual([
      'send_message',
      'call_webhook',
    ]);
    expect(nextAllowedStepKinds(capabilities.instagram, bothTriggers, [])).toEqual([
      'reply_to_comment',
      'send_message',
      'call_webhook',
    ]);
    expect(nextAllowedStepKinds(capabilities.whatsapp, messagesTrigger, [])).toEqual([
      'send_message',
      'call_webhook',
    ]);
    expect(nextAllowedStepKinds(capabilities.youtube, commentsTrigger, [])).toEqual([
      'reply_to_comment',
      'call_webhook',
    ]);
  });

  it('taken over every position adds up to allowedStepKinds on every platform', () => {
    for (const platform of PLATFORMS) {
      const record = capabilities[platform];
      const union = new Set(
        [[], [send], [send, wait]].flatMap((steps) =>
          nextAllowedStepKinds(record, bothTriggers, steps),
        ),
      );
      expect([...union].sort()).toEqual([...allowedStepKinds(record)].sort());
    }
  });
});

describe('requiresUnreachableChoice', () => {
  it('is required exactly where the recipient decides who may message them', () => {
    const required = PLATFORMS.filter((platform) =>
      requiresUnreachableChoice(capabilities[platform]),
    );
    expect(required).toEqual(['x', 'bluesky']);
  });

  it('is required for mutual-follow platforms too', () => {
    expect(
      requiresUnreachableChoice({ ...capabilities.bluesky, dmInitiation: 'mutualFollow' }),
    ).toBe(true);
  });
});

describe('canRemindBeforeReply', () => {
  it('is false on Instagram and Facebook, true where a second message may go out first', () => {
    const canRemind = PLATFORMS.filter((platform) => canRemindBeforeReply(capabilities[platform]));
    expect(canRemind).toEqual(['x', 'bluesky', 'whatsapp', 'tiktok']);
  });
});

describe('nextAllowedStepKinds consecutive messages', () => {
  it('on TikTok withholds the eleventh message in a row until a wait for the reply', () => {
    const next = (steps: Step[]) =>
      nextAllowedStepKinds(capabilities.tiktok, messagesTrigger, steps);
    const ten = Array.from({ length: 10 }, () => send);
    expect(next(ten.slice(0, 9))).toEqual(['send_message', 'wait_for_reply', 'call_webhook']);
    expect(next(ten)).toEqual(['wait_for_reply', 'call_webhook']);
    expect(next([...ten, wait])).toEqual(['send_message', 'call_webhook']);
    expect(nextAllowedStepKinds(capabilities.whatsapp, messagesTrigger, ten)).toEqual([
      'send_message',
      'wait_for_reply',
      'call_webhook',
    ]);
  });
});

describe('deliveredAsPrivateReply', () => {
  it('is true only on private-reply networks, with a comments trigger, before any wait for the reply', () => {
    expect(deliveredAsPrivateReply(capabilities.instagram, commentsTrigger, [])).toBe(true);
    expect(deliveredAsPrivateReply(capabilities.facebook, bothTriggers, [reply])).toBe(true);
    expect(deliveredAsPrivateReply(capabilities.instagram, commentsTrigger, [send, wait])).toBe(
      false,
    );
    expect(deliveredAsPrivateReply(capabilities.instagram, messagesTrigger, [])).toBe(false);
    expect(deliveredAsPrivateReply(capabilities.bluesky, commentsTrigger, [])).toBe(false);
  });
});
