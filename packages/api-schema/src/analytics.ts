import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { VersionIdSchema } from './ids.js';

const DateTime = Type.String({ format: 'date-time' });

export const AnalyticsQuery = Type.Object({
  versionIds: Type.Optional(Type.Array(VersionIdSchema)),
  since: Type.Optional(DateTime),
  until: Type.Optional(DateTime),
});

export type AnalyticsQuery = Static<typeof AnalyticsQuery>;

const count = Type.Integer({ minimum: 0 });

const rate = Type.Number({ minimum: 0, maximum: 1 });

export const VersionAnalytics = Type.Object({
  versionId: VersionIdSchema,
  number: Type.Integer({ minimum: 1 }),
  started: count,
  replied: count,
  replyRate: rate,
  completed: count,
  completionRate: rate,
  emailsCaptured: count,
  emailRate: rate,
  failed: count,
  medianSecondsToEmail: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
});

export type VersionAnalytics = Static<typeof VersionAnalytics>;

export const DayAnalytics = Type.Object({
  day: Type.String({ minLength: 1 }),
  started: count,
  emailsCaptured: count,
});

export type DayAnalytics = Static<typeof DayAnalytics>;

export const AnalyticsResponse = Type.Object({
  perVersion: Type.Array(VersionAnalytics),
  perDay: Type.Array(DayAnalytics),
});

export type AnalyticsResponse = Static<typeof AnalyticsResponse>;
