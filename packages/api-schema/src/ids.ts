import type {
  AccountId,
  AutomationId,
  CommentId,
  ContactId,
  ConversationId,
  PostId,
  RunId,
  VersionId,
} from '@comment-automations/shared';
import { Type } from '@sinclair/typebox';

const id = Type.String({ minLength: 1 });

export const AccountIdSchema = Type.Unsafe<AccountId>(id);
export const AutomationIdSchema = Type.Unsafe<AutomationId>(id);
export const VersionIdSchema = Type.Unsafe<VersionId>(id);
export const RunIdSchema = Type.Unsafe<RunId>(id);
export const ContactIdSchema = Type.Unsafe<ContactId>(id);
export const PostIdSchema = Type.Unsafe<PostId>(id);
export const CommentIdSchema = Type.Unsafe<CommentId>(id);
export const ConversationIdSchema = Type.Unsafe<ConversationId>(id);
