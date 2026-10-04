import { describe, expect, it } from 'vitest';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  requiresUnreachableChoice,
} from './capabilities.js';
import { PLATFORMS } from './platform.js';
import { capabilities } from './platforms/index.js';

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
