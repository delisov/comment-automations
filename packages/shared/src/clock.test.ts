import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlledClock, systemClock } from './clock.js';

const WALL = new Date('2026-10-04T10:00:00Z');
const MINUTE = 60 * 1000;

describe('systemClock', () => {
  it('reports the wall clock', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('controlledClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(WALL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows the wall clock when no instant is given', () => {
    const clock = controlledClock();
    expect(clock.now()).toEqual(WALL);
    vi.setSystemTime(new Date(WALL.getTime() + MINUTE));
    expect(clock.now()).toEqual(new Date('2026-10-04T10:01:00Z'));
  });

  it('starts at the given instant and keeps moving with the wall clock', () => {
    const clock = controlledClock(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00Z'));
    vi.setSystemTime(new Date(WALL.getTime() + MINUTE));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:01:00Z'));
  });

  it('advances by milliseconds on top of the wall clock', () => {
    const clock = controlledClock();
    clock.advance(24 * 60 * MINUTE);
    vi.setSystemTime(new Date(WALL.getTime() + MINUTE));
    expect(clock.now()).toEqual(new Date('2026-10-05T10:01:00Z'));
  });

  it('jumps to a set instant and keeps moving from there', () => {
    const clock = controlledClock();
    clock.advance(MINUTE);
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00Z'));
    vi.setSystemTime(new Date(WALL.getTime() + MINUTE));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:01:00Z'));
  });

  it('hands out independent Date instances', () => {
    const clock = controlledClock();
    clock.now().setFullYear(1999);
    expect(clock.now()).toEqual(WALL);
  });
});
