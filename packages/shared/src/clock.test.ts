import { describe, expect, it } from 'vitest';
import { controlledClock, systemClock } from './clock.js';

describe('systemClock', () => {
  it('reports the wall clock', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('controlledClock', () => {
  it('starts at the given instant and does not move on its own', () => {
    const clock = controlledClock(new Date('2026-10-04T10:00:00Z'));
    expect(clock.now()).toEqual(new Date('2026-10-04T10:00:00Z'));
    expect(clock.now()).toEqual(new Date('2026-10-04T10:00:00Z'));
  });

  it('advances by milliseconds', () => {
    const clock = controlledClock(new Date('2026-10-04T10:00:00Z'));
    clock.advance(24 * 60 * 60 * 1000);
    expect(clock.now()).toEqual(new Date('2026-10-05T10:00:00Z'));
  });

  it('jumps to a set instant', () => {
    const clock = controlledClock(new Date('2026-10-04T10:00:00Z'));
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('hands out independent Date instances', () => {
    const clock = controlledClock(new Date('2026-10-04T10:00:00Z'));
    clock.now().setFullYear(1999);
    expect(clock.now()).toEqual(new Date('2026-10-04T10:00:00Z'));
  });
});
