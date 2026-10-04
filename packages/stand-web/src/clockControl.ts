import type { ClockReading } from './api.js';

type ClockApi = {
  clock: () => Promise<ClockReading>;
  setClock: (now: string) => Promise<unknown>;
};

export const shiftClock = async (clockApi: ClockApi, ms: number): Promise<string> => {
  const reading = await clockApi.clock();
  const target = new Date(Date.parse(reading.now) + ms).toISOString();
  await clockApi.setClock(target);
  return target;
};
