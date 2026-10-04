import * as shared from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import type { Step, Trigger } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import { nextAllowedStepKinds, waitBeforeMessage } from './stepRules.js';

const commentsTrigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
  onRepeatWhileWaiting: 'supersede',
};

const messagesTrigger: Trigger = { messages: { keywords: [] }, onRepeatWhileWaiting: 'supersede' };

const message: Step = { kind: 'send_message', text: 'Hey', buttons: [] };
const wait: Step = { kind: 'wait_for_reply', expect: 'email', giveUpHours: 72 };
const webhook: Step = { kind: 'call_webhook', method: 'POST', url: 'https://x.y', headers: {} };

describe('nextAllowedStepKinds', () => {
  it('nextAllowedStepKinds is exported from @comment-automations/shared', () => {
    expect(typeof (shared as Record<string, unknown>).nextAllowedStepKinds).toBe('function');
  });

  it('offers a reply only while the comments trigger is on', () => {
    expect(nextAllowedStepKinds(capabilities.instagram, commentsTrigger, [])).toEqual([
      'reply_to_comment',
      'send_message',
      'call_webhook',
    ]);
    expect(nextAllowedStepKinds(capabilities.instagram, messagesTrigger, [])).toEqual([
      'send_message',
      'call_webhook',
    ]);
  });

  it('on Instagram a second message needs a wait for a reply before it', () => {
    expect(nextAllowedStepKinds(capabilities.instagram, commentsTrigger, [message])).toEqual([
      'reply_to_comment',
      'wait_for_reply',
      'call_webhook',
    ]);
    expect(nextAllowedStepKinds(capabilities.instagram, commentsTrigger, [message, wait])).toEqual([
      'reply_to_comment',
      'send_message',
      'call_webhook',
    ]);
  });

  it('on Bluesky a second message may follow the first directly', () => {
    expect(nextAllowedStepKinds(capabilities.bluesky, commentsTrigger, [message])).toEqual([
      'reply_to_comment',
      'send_message',
      'wait_for_reply',
      'call_webhook',
    ]);
  });

  it('a wait needs a message right before it', () => {
    expect(nextAllowedStepKinds(capabilities.bluesky, commentsTrigger, [message, wait])).toEqual([
      'reply_to_comment',
      'send_message',
      'call_webhook',
    ]);
  });

  it('YouTube offers replies and webhooks only', () => {
    expect(nextAllowedStepKinds(capabilities.youtube, commentsTrigger, [])).toEqual([
      'reply_to_comment',
      'call_webhook',
    ]);
  });
});

describe('waitBeforeMessage', () => {
  it('finds no wait before the first message', () => {
    expect(waitBeforeMessage([])).toEqual(null);
    expect(waitBeforeMessage([webhook])).toEqual(null);
  });

  it('finds no wait when a message came straight before', () => {
    expect(waitBeforeMessage([message])).toEqual(null);
    expect(waitBeforeMessage([message, wait, message])).toEqual(null);
  });

  it('finds the wait the message answers', () => {
    expect(waitBeforeMessage([message, wait])).toEqual(wait);
  });

  it('looks past webhooks between the wait and the message', () => {
    expect(waitBeforeMessage([message, wait, webhook, webhook])).toEqual(wait);
  });
});
