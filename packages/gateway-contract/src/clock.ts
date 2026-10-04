import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Timestamp } from './platform.js';

export const ClockRequest = Type.Object({
  now: Timestamp,
});

export type ClockRequest = Static<typeof ClockRequest>;

export const ClockResponse = Type.Object({
  now: Timestamp,
});

export type ClockResponse = Static<typeof ClockResponse>;
