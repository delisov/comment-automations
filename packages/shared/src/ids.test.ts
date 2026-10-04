import { describe, expect, it } from 'vitest';
import {
  accountId,
  automationId,
  commentId,
  contactId,
  conversationId,
  eventId,
  jobId,
  postId,
  runId,
  userId,
  versionId,
} from './ids.js';

const constructors = [
  ['AccountId', accountId],
  ['AutomationId', automationId],
  ['VersionId', versionId],
  ['RunId', runId],
  ['ContactId', contactId],
  ['EventId', eventId],
  ['UserId', userId],
  ['PostId', postId],
  ['CommentId', commentId],
  ['ConversationId', conversationId],
  ['JobId', jobId],
] as const;

describe.each(constructors)('%s', (name, construct) => {
  it('rejects the empty string', () => {
    expect(() => construct('')).toThrow(`${name} must not be empty`);
  });

  it('round-trips a non-empty value', () => {
    expect(construct('id_42')).toBe('id_42');
  });
});
