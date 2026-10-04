export type Clock = { now(): Date };

export type ControlledClock = Clock & {
  set(now: Date): void;
  advance(ms: number): void;
};

export const systemClock: Clock = { now: () => new Date() };

export const controlledClock = (initial?: Date): ControlledClock => {
  let offsetMs = initial === undefined ? 0 : initial.getTime() - Date.now();
  return {
    now: () => new Date(Date.now() + offsetMs),
    set: (now) => {
      offsetMs = now.getTime() - Date.now();
    },
    advance: (ms) => {
      offsetMs += ms;
    },
  };
};
