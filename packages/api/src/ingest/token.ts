import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export const tokenMatches = (presented: string | undefined, expected: string): boolean =>
  presented !== undefined && timingSafeEqual(digest(presented), digest(expected));
