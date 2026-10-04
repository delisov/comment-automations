import { describe, expect, it } from 'vitest';
import type { ClockReading } from './api.js';
import { shiftClock } from './clockControl.js';

const HOUR = 60 * 60 * 1000;

describe('clock control', () => {
  it('moves the stand and service one hour past the service reading when the service is ahead of the stand', async () => {
    const reading: ClockReading = {
      now: '2026-10-04T12:00:00.000Z',
      standNow: '2026-10-04T10:00:00.000Z',
      source: 'service',
    };
    const posted: string[] = [];
    const target = await shiftClock(
      { clock: async () => reading, setClock: async (now) => void posted.push(now) },
      HOUR,
    );
    expect(posted).toEqual(['2026-10-04T13:00:00.000Z']);
    expect(target).toBe('2026-10-04T13:00:00.000Z');
  });
});
