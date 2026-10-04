import type { World } from './world.js';

export type Cycle = {
  id: string;
  title: string;
  run(world: World): Promise<void>;
};

export type CycleResult = {
  id: string;
  title: string;
  outcome: 'pass' | 'fail';
  reason: string | null;
  durationMs: number;
};

export const formatResult = (result: CycleResult): string => {
  const seconds = (result.durationMs / 1000).toFixed(1);
  const head = `${result.outcome === 'pass' ? 'PASS' : 'FAIL'} ${result.id} ${result.title}`;
  return result.reason === null
    ? `${head} (${seconds} s)`
    : `${head} (${seconds} s): ${result.reason}`;
};

export const formatSummary = (results: CycleResult[]): string => {
  const failed = results.filter((result) => result.outcome === 'fail').length;
  return `${results.length} cycles, ${results.length - failed} passed, ${failed} failed`;
};

export const selectCycles = (cycles: Cycle[], wanted: string | undefined): Cycle[] => {
  if (wanted === undefined || wanted.trim() === '') {
    return cycles;
  }
  const ids = new Set(wanted.split(',').map((id) => id.trim().toUpperCase()));
  return cycles.filter((cycle) => ids.has(cycle.id));
};

const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');

export const runCycle = async (cycle: Cycle, world: World): Promise<CycleResult> => {
  const started = Date.now();
  try {
    await world.prepare();
    await cycle.run(world);
    return {
      id: cycle.id,
      title: cycle.title,
      outcome: 'pass',
      reason: null,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      id: cycle.id,
      title: cycle.title,
      outcome: 'fail',
      reason: reasonOf(error),
      durationMs: Date.now() - started,
    };
  }
};

export const runCycles = async (
  cycles: Cycle[],
  world: World,
  report: (line: string) => void,
): Promise<CycleResult[]> => {
  const results: CycleResult[] = [];
  for (const cycle of cycles) {
    const result = await runCycle(cycle, world);
    results.push(result);
    report(formatResult(result));
  }
  report(formatSummary(results));
  return results;
};
