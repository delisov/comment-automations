export type Clock = { now(): Date };

export type ControlledClock = Clock & {
  set(now: Date): void;
  advance(ms: number): void;
};

export const systemClock: Clock = { now: () => new Date() };

export const controlledClock = (initial: Date): ControlledClock => {
  let current = initial.getTime();
  return {
    now: () => new Date(current),
    set: (now) => {
      current = now.getTime();
    },
    advance: (ms) => {
      current += ms;
    },
  };
};
