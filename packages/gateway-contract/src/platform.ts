import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const Platform = Type.Union([
  Type.Literal('instagram'),
  Type.Literal('facebook'),
  Type.Literal('threads'),
  Type.Literal('x'),
  Type.Literal('bluesky'),
  Type.Literal('youtube'),
  Type.Literal('linkedin'),
  Type.Literal('whatsapp'),
  Type.Literal('tiktok'),
  Type.Literal('pinterest'),
]);

export type Platform = Static<typeof Platform>;

export const Id = Type.String({ minLength: 1 });

export const Timestamp = Type.String({ minLength: 1 });
