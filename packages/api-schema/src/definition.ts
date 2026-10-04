import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { PostIdSchema } from './ids.js';

export const ButtonSchema = Type.Object({
  title: Type.String(),
  url: Type.String(),
});

export const PostSelectionSchema = Type.Union([
  Type.Object({ kind: Type.Literal('any') }),
  Type.Object({ kind: Type.Literal('specific'), postId: PostIdSchema }),
]);

export const CommentsTriggerSchema = Type.Object({
  posts: PostSelectionSchema,
  keywords: Type.Array(Type.String()),
});

export const MessagesTriggerSchema = Type.Object({
  keywords: Type.Array(Type.String()),
});

export const TriggerSchema = Type.Object({
  comments: Type.Optional(CommentsTriggerSchema),
  messages: Type.Optional(MessagesTriggerSchema),
  onRepeatWhileWaiting: Type.Union([Type.Literal('supersede'), Type.Literal('ignore')]),
});

export const StepKindSchema = Type.Union([
  Type.Literal('reply_to_comment'),
  Type.Literal('send_message'),
  Type.Literal('wait_for_reply'),
  Type.Literal('call_webhook'),
]);

export const ReplyToCommentStepSchema = Type.Object({
  kind: Type.Literal('reply_to_comment'),
  text: Type.String(),
});

export const SendMessageStepSchema = Type.Object({
  kind: Type.Literal('send_message'),
  text: Type.String(),
  buttons: Type.Array(ButtonSchema),
  onUnreachable: Type.Optional(
    Type.Union([Type.Literal('fail'), Type.Literal('skip'), Type.Literal('publicReplyInstead')]),
  ),
  fallbackText: Type.Optional(Type.String()),
});

export const WaitForReplyStepSchema = Type.Object({
  kind: Type.Literal('wait_for_reply'),
  expect: Type.Union([Type.Literal('email'), Type.Literal('any')]),
  giveUpHours: Type.Number(),
  reminder: Type.Optional(Type.Object({ afterHours: Type.Number(), text: Type.String() })),
  nudge: Type.Optional(
    Type.Object({
      text: Type.String(),
      then: Type.Union([Type.Literal('wait'), Type.Literal('end')]),
    }),
  ),
});

export const CallWebhookStepSchema = Type.Object({
  kind: Type.Literal('call_webhook'),
  method: Type.Union([
    Type.Literal('GET'),
    Type.Literal('POST'),
    Type.Literal('PUT'),
    Type.Literal('PATCH'),
    Type.Literal('DELETE'),
  ]),
  url: Type.String(),
  headers: Type.Record(Type.String(), Type.String()),
});

export const StepSchema = Type.Union([
  ReplyToCommentStepSchema,
  SendMessageStepSchema,
  WaitForReplyStepSchema,
  CallWebhookStepSchema,
]);

export const DefinitionSchema = Type.Object({
  trigger: TriggerSchema,
  steps: Type.Array(StepSchema),
});

export type DefinitionSchema = Static<typeof DefinitionSchema>;

export const ValidationIssue = Type.Object({
  path: Type.String(),
  code: Type.String(),
  message: Type.String(),
});

export type ValidationIssue = Static<typeof ValidationIssue>;
