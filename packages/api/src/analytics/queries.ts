import type {
  AnalyticsResponse,
  AutomationStats,
  DayAnalytics,
  VersionAnalytics,
} from '@comment-automations/api-schema';
import type { AutomationId, VersionId } from '@comment-automations/shared';
import { sql } from 'kysely';
import type { Db } from '../db/types.js';

export const rate = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

export type AnalyticsFilter = {
  automationId: AutomationId;
  versionIds?: VersionId[];
  since?: Date;
  until?: Date;
};

const count = (condition: string) =>
  sql<number>`count(r.id) filter (where ${sql.raw(condition)})::int`;

const emailCaptured = "r.context->'captured'->>'email' is not null";

export const perVersionAnalytics = async (
  db: Db,
  filter: AnalyticsFilter,
): Promise<VersionAnalytics[]> => {
  let query = db
    .selectFrom('automation_versions as v')
    .leftJoin('runs as r', (join) => {
      let on = join.onRef('r.version_id', '=', 'v.id');
      if (filter.since !== undefined) {
        on = on.on('r.started_at', '>=', filter.since);
      }
      if (filter.until !== undefined) {
        on = on.on('r.started_at', '<', filter.until);
      }
      return on;
    })
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('run_logs as l')
          .select(sql<Date | null>`min(l.at)`.as('at'))
          .whereRef('l.run_id', '=', 'r.id')
          .where(sql`l.context->>'email'`, 'is not', null)
          .as('e'),
      (join) => join.onTrue(),
    )
    .select([
      'v.id as versionId',
      'v.number as number',
      sql<number>`count(r.id)::int`.as('started'),
      count("(r.context->>'replied')::boolean").as('replied'),
      count("r.status = 'completed'").as('completed'),
      count(emailCaptured).as('emailsCaptured'),
      count("r.status = 'failed'").as('failed'),
      sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from (e.at - r.started_at)))`.as(
        'medianSecondsToEmail',
      ),
    ])
    .where('v.automation_id', '=', filter.automationId)
    .groupBy(['v.id', 'v.number'])
    .orderBy('v.number');
  if (filter.versionIds !== undefined && filter.versionIds.length > 0) {
    query = query.where('v.id', 'in', filter.versionIds);
  }
  const rows = await query.execute();
  return rows.map((row) => ({
    versionId: row.versionId,
    number: row.number,
    started: row.started,
    replied: row.replied,
    replyRate: rate(row.replied, row.started),
    completed: row.completed,
    completionRate: rate(row.completed, row.started),
    emailsCaptured: row.emailsCaptured,
    emailRate: rate(row.emailsCaptured, row.started),
    failed: row.failed,
    medianSecondsToEmail:
      row.medianSecondsToEmail === null ? null : Number(row.medianSecondsToEmail),
  }));
};

export const perDayAnalytics = async (db: Db, filter: AnalyticsFilter): Promise<DayAnalytics[]> => {
  const day = sql<string>`to_char(r.started_at at time zone 'UTC', 'YYYY-MM-DD')`;
  let query = db
    .selectFrom('runs as r')
    .select([
      day.as('day'),
      sql<number>`count(r.id)::int`.as('started'),
      count(emailCaptured).as('emailsCaptured'),
    ])
    .where('r.automation_id', '=', filter.automationId)
    .groupBy(day)
    .orderBy(day);
  if (filter.versionIds !== undefined && filter.versionIds.length > 0) {
    query = query.where('r.version_id', 'in', filter.versionIds);
  }
  if (filter.since !== undefined) {
    query = query.where('r.started_at', '>=', filter.since);
  }
  if (filter.until !== undefined) {
    query = query.where('r.started_at', '<', filter.until);
  }
  return query.execute();
};

export const analytics = async (db: Db, filter: AnalyticsFilter): Promise<AnalyticsResponse> => ({
  perVersion: await perVersionAnalytics(db, filter),
  perDay: await perDayAnalytics(db, filter),
});

const EMPTY_STATS: AutomationStats = { runs24h: 0, succeeded24h: 0, failed24h: 0, lastRunAt: null };

export const automationStats = async (
  db: Db,
  automationIds: AutomationId[],
  now: Date,
): Promise<Map<AutomationId, AutomationStats>> => {
  const stats = new Map<AutomationId, AutomationStats>(
    automationIds.map((id) => [id, EMPTY_STATS]),
  );
  if (automationIds.length === 0) {
    return stats;
  }
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db
    .selectFrom('runs as r')
    .select([
      'r.automation_id',
      sql<number>`count(r.id) filter (where r.started_at >= ${since})::int`.as('runs24h'),
      sql<number>`count(r.id) filter (where r.started_at >= ${since} and r.status = 'completed')::int`.as(
        'succeeded24h',
      ),
      sql<number>`count(r.id) filter (where r.started_at >= ${since} and r.status = 'failed')::int`.as(
        'failed24h',
      ),
      sql<Date | null>`max(r.started_at)`.as('lastRunAt'),
    ])
    .where('r.automation_id', 'in', automationIds)
    .groupBy('r.automation_id')
    .execute();
  for (const row of rows) {
    stats.set(row.automation_id, {
      runs24h: row.runs24h,
      succeeded24h: row.succeeded24h,
      failed24h: row.failed24h,
      lastRunAt: row.lastRunAt === null ? null : new Date(row.lastRunAt).toISOString(),
    });
  }
  return stats;
};
