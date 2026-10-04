import type { Selectable } from 'kysely';
import { sql } from 'kysely';
import type { JobsTable, RunError } from '../db/types.js';
import type { JobOutcome } from '../executor/advance.js';
import { advance } from '../executor/advance.js';
import type { Deps } from '../executor/send.js';
import { giveUp, nudge, reminder } from '../executor/timers.js';
import { failRun, loadRun, logRun } from '../runs/store.js';

export const BACKOFF_MS: readonly number[] = [1_000, 5_000, 25_000, 120_000];

export const LOCK_MS = 60_000;

const RENEW_MS = 20_000;

const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

const INTERRUPTED: RunError = {
  code: 'INTERNAL',
  message: 'The step was interrupted too many times',
};

const CRASHED: RunError = { code: 'INTERNAL', message: 'The step failed unexpectedly' };

const EXHAUSTED_COURTESY = {
  reminder: 'Reminder could not be sent',
  nudge: 'Could not ask once more',
} as const;

const dispatch = (deps: Deps, job: Selectable<JobsTable>): Promise<JobOutcome> => {
  switch (job.kind) {
    case 'advance':
      return advance(deps, job.run_id);
    case 'reminder':
      return reminder(deps, job.run_id);
    case 'nudge':
      return nudge(deps, job.run_id);
    case 'give_up':
      return giveUp(deps, job.run_id);
  }
};

export const claimJob = (deps: Deps, now: Date): Promise<Selectable<JobsTable> | undefined> =>
  deps.db
    .updateTable('jobs')
    .set({ locked_until: new Date(now.getTime() + LOCK_MS), attempts: sql`attempts + 1` })
    .where('id', 'in', (qb) =>
      qb
        .selectFrom('jobs')
        .select('id')
        .where('status', '=', 'pending')
        .where('run_at', '<=', now)
        .where((eb) => eb.or([eb('locked_until', 'is', null), eb('locked_until', '<', now)]))
        .orderBy('run_at')
        .limit(1)
        .forUpdate()
        .skipLocked(),
    )
    .returningAll()
    .executeTakeFirst();

const renewLock = (deps: Deps, job: Selectable<JobsTable>): Promise<unknown> =>
  deps.db
    .updateTable('jobs')
    .set({ locked_until: new Date(deps.clock.now().getTime() + LOCK_MS) })
    .where('id', '=', job.id)
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
  const backoff = BACKOFF_MS[job.attempts - 1];
  if (backoff === undefined) {
    const loaded = await loadRun(deps.db, job.run_id);
    if (loaded !== undefined) {
      if (job.kind === 'reminder' || job.kind === 'nudge') {
        await logRun(deps.db, job.run_id, now, {
          stepIndex: loaded.run.step_index,
          level: 'warn',
          message: EXHAUSTED_COURTESY[job.kind],
          context: { code: outcome.error.code },
        });
      } else {
        await failRun(deps.db, loaded, outcome.error, now);
      }
    }
    await deps.db
      .updateTable('jobs')
      .set({ status: 'failed', locked_until: null })
      .where('id', '=', job.id)
      .execute();
    return;
  }
  await deps.db
    .updateTable('jobs')
    .set({ run_at: new Date(now.getTime() + backoff), locked_until: null })
    .where('id', '=', job.id)
    .execute();
  await logRun(deps.db, job.run_id, now, {
    stepIndex: null,
    level: 'warn',
    message: `${outcome.error.message} · retrying in ${backoff / 1000} s`,
    context: { code: outcome.error.code, attempt: job.attempts },
  });
};

const runJob = async (deps: Deps, job: Selectable<JobsTable>): Promise<void> => {
  if (job.attempts > MAX_ATTEMPTS) {
    await settle(deps, job, { kind: 'retry', error: INTERRUPTED });
    return;
  }
  const renewal = setInterval(() => {
    renewLock(deps, job).catch(() => undefined);
  }, RENEW_MS);
  let outcome: JobOutcome;
  try {
    outcome = await dispatch(deps, job);
  } catch (error) {
    console.error(error);
    outcome = { kind: 'retry', error: CRASHED };
  } finally {
    clearInterval(renewal);
  }
  await settle(deps, job, outcome);
};

export const tick = async (deps: Deps, limit = 10): Promise<number> => {
  let processed = 0;
  while (processed < limit) {
    const job = await claimJob(deps, deps.clock.now());
    if (job === undefined) {
      break;
    }
    processed += 1;
    await runJob(deps, job);
  }
  return processed;
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
