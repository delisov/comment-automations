import type { CommentEvent, MessageEvent } from '@comment-automations/gateway-contract';
import type { Definition } from '@comment-automations/shared';
import { automationId, postId, versionId } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import type { LiveAutomation } from './match.js';
import { selectForComment, selectForMessage } from './match.js';

const live = (name: string, trigger: Definition['trigger']): LiveAutomation => ({
  id: automationId(name),
  versionId: versionId(`${name}_v1`),
  definition: { trigger, steps: [] },
});

const comment: CommentEvent = {
  kind: 'comment',
  platform: 'instagram',
  accountId: 'acc_1',
  eventId: 'evt_1',
  commentId: 'c_1',
  postId: 'p_1',
  authorId: 'u_1',
  authorHandle: 'jane',
  text: 'What is the PRICING?',
  createdAt: '2026-10-04T10:00:00Z',
};

const message: MessageEvent = {
  kind: 'message',
  platform: 'bluesky',
  accountId: 'acc_2',
  eventId: 'evt_2',
  conversationId: 'conv_1',
  messageId: 'm_1',
  senderId: 'u_2',
  senderHandle: 'joe',
  text: 'send me the guide please',
  createdAt: '2026-10-04T10:00:00Z',
};

describe('selectForComment', () => {
  it('keeps automations whose comment trigger matches the post and a keyword, in order', () => {
    const anyPost = live('any', {
      comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
      onRepeatWhileWaiting: 'supersede',
    });
    const thisPost = live('this', {
      comments: { posts: { kind: 'specific', postId: postId('p_1') }, keywords: [] },
      onRepeatWhileWaiting: 'supersede',
    });
    const otherPost = live('other', {
      comments: { posts: { kind: 'specific', postId: postId('p_2') }, keywords: ['pricing'] },
      onRepeatWhileWaiting: 'supersede',
    });
    const otherWord = live('word', {
      comments: { posts: { kind: 'any' }, keywords: ['price'] },
      onRepeatWhileWaiting: 'supersede',
    });
    const messagesOnly = live('messages', {
      messages: { keywords: [] },
      onRepeatWhileWaiting: 'supersede',
    });

    expect(
      selectForComment(comment, [anyPost, thisPost, otherPost, otherWord, messagesOnly]),
    ).toEqual([anyPost, thisPost]);
  });
});

describe('selectForMessage', () => {
  it('keeps automations whose message trigger matches a keyword', () => {
    const guide = live('guide', {
      messages: { keywords: ['guide'] },
      onRepeatWhileWaiting: 'ignore',
    });
    const pricing = live('pricing', {
      messages: { keywords: ['pricing'] },
      onRepeatWhileWaiting: 'ignore',
    });
    const commentsOnly = live('comments', {
      comments: { posts: { kind: 'any' }, keywords: [] },
      onRepeatWhileWaiting: 'ignore',
    });

    expect(selectForMessage(message, [guide, pricing, commentsOnly])).toEqual([guide]);
  });
});
