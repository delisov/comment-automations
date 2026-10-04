import { describe, expect, it } from 'vitest';
import type { Cycle } from './runner.js';
import { formatResult, formatSummary, runCycles, selectCycles } from './runner.js';
import type { World } from './world.js';

const world = { prepare: async () => undefined } as unknown as World;

const cycle = (id: string, run: () => Promise<void>): Cycle => ({ id, title: `cycle ${id}`, run });

describe('the cycle runner', () => {
  it('prints one line per cycle with pass or fail and a one-line reason, then a summary', async () => {
    const lines: string[] = [];
    const results = await runCycles(
      [
        cycle('A1', async () => undefined),
        cycle('A2', async () => {
          throw new Error('timeline: expected\n  ["Completed"], got\n  ["Started"]');
        }),
      ],
      world,
      (line) => lines.push(line),
    );
    expect(results.map((result) => [result.id, result.outcome, result.reason])).toEqual([
      ['A1', 'pass', null],
      ['A2', 'fail', 'timeline: expected ["Completed"], got ["Started"]'],
    ]);
    expect(lines.map((line) => line.replace(/\(\d+\.\d s\)/, '(t)'))).toEqual([
      'PASS A1 cycle A1 (t)',
      'FAIL A2 cycle A2 (t): timeline: expected ["Completed"], got ["Started"]',
      '2 cycles, 1 passed, 1 failed',
    ]);
  });

  it('counts a failing prepare as a failed cycle', async () => {
    const broken = {
      prepare: async () => {
        throw new Error('POST /test/reset answered 500');
      },
    } as unknown as World;
    const lines: string[] = [];
    await runCycles([cycle('X1', async () => undefined)], broken, (line) => lines.push(line));
    expect(lines[0]).toMatch(/^FAIL X1 cycle X1 \(\d+\.\d s\): POST \/test\/reset answered 500$/);
  });

  it('formats results and summaries', () => {
    expect(
      formatResult({
        id: 'B1',
        title: 'fallback',
        outcome: 'pass',
        reason: null,
        durationMs: 1234,
      }),
    ).toBe('PASS B1 fallback (1.2 s)');
    expect(formatSummary([])).toBe('0 cycles, 0 passed, 0 failed');
  });

  it('selects cycles by a comma-separated list of ids, or all when none is given', () => {
    const all = [cycle('A1', async () => undefined), cycle('B1', async () => undefined)];
    expect(selectCycles(all, undefined)).toEqual(all);
    expect(selectCycles(all, '')).toEqual(all);
    expect(selectCycles(all, 'b1, A9').map((item) => item.id)).toEqual(['B1']);
  });
});
