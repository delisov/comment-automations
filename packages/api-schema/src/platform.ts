import { PLATFORMS } from '@comment-automations/shared';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const Platform = Type.Union(PLATFORMS.map((platform) => Type.Literal(platform)));

export type Platform = Static<typeof Platform>;

export const Timestamp = Type.String({ minLength: 1 });

export const NullableTimestamp = Type.Union([Timestamp, Type.Null()]);
