import type {
  RunDetail,
  RunSummary,
  RunsQuery,
  RunsResponse,
} from '@comment-automations/api-schema';
import { RunDetail as RunDetailSchema } from '@comment-automations/api-schema';
import type { AutomationId, RunId } from '@comment-automations/shared';
import { sql } from 'kysely';
import type { Db } from '../db/types.js';
import { finishRun } from '../runs/store.js';
import type { App, AppDeps } from './types.js';
import { ErrorResponse, IdParams, iso } from './types.js';

const runRows = (db: Db) =>
  db
    .selectFrom('runs')
    .innerJoin('contacts', 'contacts.id', 'runs.contact_id')
    .innerJoin('automation_versions', 'automation_versions.id', 'runs.version_id')
    .select([
      'runs.id',
      'runs.status',
      'runs.step_index',
      'runs.started_at',
      'runs.finished_at',
      'runs.error',
      'runs.context',
      'contacts.handle as contact_handle',
      'automation_versions.number as version_number',
      sql<number>`jsonb_array_length(automation_versions.definition->'steps')`.as('step_count'),
    ]);

type RunRow = Awaited<ReturnType<ReturnType<typeof runRows>['execute']>>[number];

const summarize = (row: RunRow): RunSummary => ({
  id: row.id,
  contactHandle: row.contact_handle,
  status: row.status,
  stepIndex: row.step_index,
  stepCount: row.step_count,
  versionNumber: row.version_number,
  startedAt: iso(row.started_at),
  finishedAt: row.finished_at === null ? null : iso(row.finished_at),
  ...(row.error === null ? {} : { error: row.error }),
});

const encodeCursor = (row: RunRow): string => `${iso(row.started_at)}|${row.id}`;

const decodeCursor = (cursor: string): { startedAt: Date; id: RunId } | undefined => {
  const [startedAt, id] = cursor.split('|');
  if (startedAt === undefined || id === undefined || Number.isNaN(Date.parse(startedAt))) {
    return undefined;
  }
  return { startedAt: new Date(startedAt), id: id as RunId };
};

export const listRuns = async (
  db: Db,
  automationId: AutomationId,
  query: RunsQuery,
): Promise<RunsResponse> => {
  const limit = query.limit ?? 50;
  let rows = runRows(db)
    .where('runs.automation_id', '=', automationId)
    .orderBy('runs.started_at', 'desc')
    .orderBy('runs.id', 'desc')
    .limit(limit + 1);
  if (query.status !== undefined && query.status.length > 0) {
    rows = rows.where('runs.status', 'in', query.status);
  }
  if (query.versionIds !== undefined && query.versionIds.length > 0) {
    rows = rows.where('runs.version_id', 'in', query.versionIds);
  }
  if (query.contact !== undefined && query.contact !== '') {
    rows = rows.where('contacts.handle', 'ilike', `%${query.contact.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
  if (cursor !== undefined) {
    rows = rows.where((eb) =>
      eb.or([
        eb('runs.started_at', '<', cursor.startedAt),
        eb.and([eb('runs.started_at', '=', cursor.startedAt), eb('runs.id', '<', cursor.id)]),
      ]),
    );
  }
  const page = await rows.execute();
  const hasMore = page.length > limit;
  const visible = hasMore ? page.slice(0, limit) : page;
  const last = visible[visible.length - 1];
  return {
    runs: visible.map(summarize),
    nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
  };
};

export const runDetail = async (db: Db, id: RunId): Promise<RunDetail | undefined> => {
  const row = await runRows(db).where('runs.id', '=', id).executeTakeFirst();
  if (row === undefined) {
    return undefined;
  }
  const logs = await db
    .selectFrom('run_logs')
    .select(['step_index', 'level', 'message', 'context', 'at'])
    .where('run_id', '=', id)
    .orderBy('at')
    .orderBy('id')
    .execute();
  return {
    ...summarize(row),
    timeline: logs.map((log) => ({
      stepIndex: log.step_index,
      level: log.level,
      message: log.message,
      context: log.context,
      at: iso(log.at),
    })),
    context: row.context,
  };
};

export const registerRunRoutes = (app: App, deps: AppDeps): void => {
  const { db } = deps;

  app.get(
    '/runs/:id',
    { schema: { params: IdParams, response: { 200: RunDetailSchema, 404: ErrorResponse } } },
    async (request, reply) => {
      const detail = await runDetail(db, request.params.id as RunId);
      return detail === undefined ? reply.status(404).send({ error: 'Run not found' }) : detail;
    },
  );

  app.post(
    '/runs/:id/stop',
    {
      schema: {
        params: IdParams,
        response: { 200: RunDetailSchema, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as RunId;
      const run = await db
        .selectFrom('runs')
        .select(['status', 'step_index'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (run === undefined) {
        return reply.status(404).send({ error: 'Run not found' });
      }
      if (run.status !== 'running' && run.status !== 'waiting') {
        return reply.status(409).send({ error: `A ${run.status} run cannot be stopped` });
      }
      const stopped = await finishRun(db, id, 'expired', deps.clock.now(), {
        stepIndex: run.step_index,
        message: 'Stopped by the user',
      });
      if (!stopped) {
        return reply.status(409).send({ error: 'The run had already finished' });
      }
      return runDetail(db, id);
    },
  );
};
