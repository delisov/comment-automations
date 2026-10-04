import type { Selectable } from 'kysely';
import type { JobsTable } from '../db/types.js';
import type { JobOutcome } from '../executor/advance.js';
import { advance } from '../executor/advance.js';
import type { Deps } from '../executor/send.js';
import { giveUp, reminder } from '../executor/timers.js';
import { failRun, loadRun, logRun } from '../runs/store.js';

export const BACKOFF_MS: readonly number[] = [1_000, 5_000, 25_000, 120_000];

const LOCK_MS = 60_000;

const dispatch = (deps: Deps, job: Selectable<JobsTable>): Promise<JobOutcome> => {
  switch (job.kind) {
    case 'advance':
    case 'webhook':
      return advance(deps, job.run_id);
    case 'reminder':
      return reminder(deps, job.run_id);
    case 'give_up':
      return giveUp(deps, job.run_id);
  }
};

const claimJobs = (deps: Deps, now: Date, limit: number): Promise<Selectable<JobsTable>[]> =>
  deps.db
    .updateTable('jobs')
    .set({ locked_until: new Date(now.getTime() + LOCK_MS) })
    .where('id', 'in', (qb) =>
      qb
        .selectFrom('jobs')
        .select('id')
        .where('status', '=', 'pending')
        .where('run_at', '<=', now)
        .where((eb) => eb.or([eb('locked_until', 'is', null), eb('locked_until', '<', now)]))
        .orderBy('run_at')
        .limit(limit)
        .forUpdate()
        .skipLocked(),
    )
    .returningAll()
    .execute();

const settle = async (
  deps: Deps,
  job: Selectable<JobsTable>,
  outcome: JobOutcome,
): Promise<void> => {
  const now = deps.clock.now();
  if (outcome.kind === 'done') {
    await deps.db
      .updateTable('jobs')
      .set({ status: 'done', locked_until: null })
      .where('id', '=', job.id)
      .execute();
    return;
  }
  const attempts = job.attempts + 1;
  const backoff = BACKOFF_MS[attempts - 1];
  if (backoff === undefined) {
    const loaded = await loadRun(deps.db, job.run_id);
    if (loaded !== undefined) {
      await failRun(deps.db, loaded, outcome.error, now);
    }
    await deps.db
      .updateTable('jobs')
      .set({ status: 'failed', attempts, locked_until: null })
      .where('id', '=', job.id)
      .execute();
    return;
  }
  await deps.db
    .updateTable('jobs')
    .set({ attempts, run_at: new Date(now.getTime() + backoff), locked_until: null })
    .where('id', '=', job.id)
    .execute();
  await logRun(deps.db, job.run_id, now, {
    stepIndex: null,
    level: 'warn',
    message: `${outcome.error.message} · retrying in ${backoff / 1000} s`,
    context: { code: outcome.error.code, attempt: attempts },
  });
};

export const tick = async (deps: Deps, limit = 10): Promise<number> => {
  const jobs = await claimJobs(deps, deps.clock.now(), limit);
  for (const job of jobs) {
    let outcome: JobOutcome;
    try {
      outcome = await dispatch(deps, job);
    } catch (error) {
      outcome = {
        kind: 'retry',
        error: {
          code: 'INTERNAL',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    await settle(deps, job, outcome);
  }
  return jobs.length;
};

export const startWorker = (deps: Deps, pollMs: number): (() => void) => {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const loop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    let processed = 0;
    try {
      processed = await tick(deps);
    } catch {
      processed = 0;
    }
    if (!stopped) {
      timer = setTimeout(loop, processed > 0 ? 0 : pollMs);
    }
  };
  timer = setTimeout(loop, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};
