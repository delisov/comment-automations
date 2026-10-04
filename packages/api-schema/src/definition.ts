import { MAX_WAIT_HOURS } from '@comment-automations/shared';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { PostIdSchema } from './ids.js';

const Text = Type.String({ maxLength: 10_000 });

const Hours = Type.Integer({ minimum: 1, maximum: MAX_WAIT_HOURS });

const Url = Type.String({ maxLength: 2048 });

export const ButtonSchema = Type.Object({
  title: Type.String({ maxLength: 120 }),
  url: Url,
});

export const PostSelectionSchema = Type.Union([
  Type.Object({ kind: Type.Literal('any') }),
  Type.Object({ kind: Type.Literal('specific'), postId: PostIdSchema }),
]);

const Keywords = Type.Array(Type.String({ maxLength: 100 }), { maxItems: 50 });

export const CommentsTriggerSchema = Type.Object({
  posts: PostSelectionSchema,
  keywords: Keywords,
});

export const MessagesTriggerSchema = Type.Object({
  keywords: Keywords,
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
  text: Text,
});

export const SendMessageStepSchema = Type.Object({
  kind: Type.Literal('send_message'),
  text: Text,
  buttons: Type.Array(ButtonSchema, { maxItems: 3 }),
  onUnreachable: Type.Optional(
    Type.Union([Type.Literal('fail'), Type.Literal('skip'), Type.Literal('publicReplyInstead')]),
  ),
  fallbackText: Type.Optional(Text),
});

export const WaitForReplyStepSchema = Type.Object({
  kind: Type.Literal('wait_for_reply'),
  expect: Type.Union([Type.Literal('email'), Type.Literal('any')]),
  giveUpHours: Hours,
  reminder: Type.Optional(Type.Object({ afterHours: Hours, text: Text })),
  nudge: Type.Optional(
    Type.Object({
      text: Text,
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
  url: Url,
  headers: Type.Record(Type.String(), Type.String({ maxLength: 4096 }), { maxProperties: 10 }),
});

export const StepSchema = Type.Union([
  ReplyToCommentStepSchema,
  SendMessageStepSchema,
  WaitForReplyStepSchema,
  CallWebhookStepSchema,
]);

export const DefinitionSchema = Type.Object({
  trigger: TriggerSchema,
  steps: Type.Array(StepSchema, { maxItems: 20 }),
});

export type DefinitionSchema = Static<typeof DefinitionSchema>;

export const ValidationIssue = Type.Object({
  path: Type.String(),
  code: Type.String(),
  message: Type.String(),
});

export type ValidationIssue = Static<typeof ValidationIssue>;
