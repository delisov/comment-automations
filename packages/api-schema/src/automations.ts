import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { DefinitionSchema } from './definition.js';
import { AccountIdSchema, AutomationIdSchema, VersionIdSchema } from './ids.js';
import { NullableTimestamp, Platform, Timestamp } from './platform.js';

export const AutomationState = Type.Union([
  Type.Literal('draft'),
  Type.Literal('live'),
  Type.Literal('archived'),
]);

export type AutomationState = Static<typeof AutomationState>;

export const AutomationStats = Type.Object({
  runs24h: Type.Integer({ minimum: 0 }),
  succeeded24h: Type.Integer({ minimum: 0 }),
  failed24h: Type.Integer({ minimum: 0 }),
  lastRunAt: NullableTimestamp,
});

export type AutomationStats = Static<typeof AutomationStats>;

export const AutomationSummary = Type.Object({
  id: AutomationIdSchema,
  name: Type.String(),
  accountId: AccountIdSchema,
  platform: Platform,
  state: AutomationState,
  activeVersionNumber: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  triggerSummary: Type.String(),
  stats: AutomationStats,
});

export type AutomationSummary = Static<typeof AutomationSummary>;

export const VersionSummary = Type.Object({
  id: VersionIdSchema,
  number: Type.Integer({ minimum: 1 }),
  note: Type.String(),
  publishedAt: Timestamp,
  isActive: Type.Boolean(),
  definition: DefinitionSchema,
});

export type VersionSummary = Static<typeof VersionSummary>;

export const AutomationDetail = Type.Object({
  ...AutomationSummary.properties,
  draft: Type.Union([DefinitionSchema, Type.Null()]),
  versions: Type.Array(VersionSummary),
});

export type AutomationDetail = Static<typeof AutomationDetail>;

export const AutomationsResponse = Type.Object({
  automations: Type.Array(AutomationSummary),
});

export type AutomationsResponse = Static<typeof AutomationsResponse>;

export const CreateAutomationRequest = Type.Object({
  accountId: AccountIdSchema,
  name: Type.String({ minLength: 1, maxLength: 120 }),
});

export type CreateAutomationRequest = Static<typeof CreateAutomationRequest>;

export const UpdateDraftRequest = Type.Object({
  definition: DefinitionSchema,
  note: Type.Optional(Type.String({ maxLength: 1000 })),
});

export type UpdateDraftRequest = Static<typeof UpdateDraftRequest>;

export const PublishResponse = Type.Object({
  version: VersionSummary,
});

export type PublishResponse = Static<typeof PublishResponse>;

export const ActivateVersionRequest = Type.Object({
  versionId: VersionIdSchema,
});

export type ActivateVersionRequest = Static<typeof ActivateVersionRequest>;
