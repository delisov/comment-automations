import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import {
  CommentIdSchema,
  ConversationIdSchema,
  PostIdSchema,
  RunIdSchema,
  VersionIdSchema,
} from './ids.js';
import { NullableTimestamp, Timestamp } from './platform.js';

export const RunStatus = Type.Union([
  Type.Literal('running'),
  Type.Literal('waiting'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('expired'),
  Type.Literal('superseded'),
  Type.Literal('stopped'),
]);

export type RunStatus = Static<typeof RunStatus>;

export const RunError = Type.Object({
  code: Type.String(),
  message: Type.String(),
});

export type RunError = Static<typeof RunError>;

export const RunSummary = Type.Object({
  id: RunIdSchema,
  contactHandle: Type.String(),
  status: RunStatus,
  stepIndex: Type.Integer({ minimum: 0 }),
  stepCount: Type.Integer({ minimum: 0 }),
  versionNumber: Type.Integer({ minimum: 1 }),
  startedAt: Timestamp,
  finishedAt: NullableTimestamp,
  error: Type.Optional(RunError),
});

export type RunSummary = Static<typeof RunSummary>;

export const RunLogEntry = Type.Object({
  stepIndex: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  level: Type.Union([Type.Literal('info'), Type.Literal('warn'), Type.Literal('error')]),
  message: Type.String(),
  context: Type.Record(Type.String(), Type.Unknown()),
  at: Timestamp,
});

export type RunLogEntry = Static<typeof RunLogEntry>;

export const RunContext = Type.Object({
  commentId: Type.Optional(CommentIdSchema),
  postId: Type.Optional(PostIdSchema),
  conversationId: Type.Optional(ConversationIdSchema),
  lastInboundAt: Type.Optional(Timestamp),
  captured: Type.Object({ email: Type.Optional(Type.String()) }),
  replied: Type.Boolean(),
});

export type RunContext = Static<typeof RunContext>;

export const RunDetail = Type.Object({
  ...RunSummary.properties,
  timeline: Type.Array(RunLogEntry),
  context: RunContext,
});

export type RunDetail = Static<typeof RunDetail>;

export const RunsQuery = Type.Object({
  status: Type.Optional(Type.Array(RunStatus)),
  versionIds: Type.Optional(Type.Array(VersionIdSchema)),
  contact: Type.Optional(Type.String({ maxLength: 120 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  cursor: Type.Optional(Type.String()),
});

export type RunsQuery = Static<typeof RunsQuery>;

export const RunsResponse = Type.Object({
  runs: Type.Array(RunSummary),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});

export type RunsResponse = Static<typeof RunsResponse>;
