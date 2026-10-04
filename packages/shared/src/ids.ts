import type { Brand } from './brand.js';

const brandedId =
  <B extends string>(name: B) =>
  (value: string): Brand<string, B> => {
    if (value === '') {
      throw new Error(`${name} must not be empty`);
    }
    return value as Brand<string, B>;
  };

export type AccountId = Brand<string, 'AccountId'>;
export type AutomationId = Brand<string, 'AutomationId'>;
export type VersionId = Brand<string, 'VersionId'>;
export type RunId = Brand<string, 'RunId'>;
export type ContactId = Brand<string, 'ContactId'>;
export type EventId = Brand<string, 'EventId'>;
export type UserId = Brand<string, 'UserId'>;
export type PostId = Brand<string, 'PostId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type JobId = Brand<string, 'JobId'>;

export const accountId = brandedId('AccountId');
export const automationId = brandedId('AutomationId');
export const versionId = brandedId('VersionId');
export const runId = brandedId('RunId');
export const contactId = brandedId('ContactId');
export const eventId = brandedId('EventId');
export const userId = brandedId('UserId');
export const postId = brandedId('PostId');
export const commentId = brandedId('CommentId');
export const conversationId = brandedId('ConversationId');
export const jobId = brandedId('JobId');
