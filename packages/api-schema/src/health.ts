import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  sha: Type.String(),
});

export type HealthResponse = Static<typeof HealthResponse>;
