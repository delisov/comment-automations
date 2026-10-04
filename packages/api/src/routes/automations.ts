import type {
  AutomationDetail,
  AutomationSummary,
  VersionSummary,
} from '@comment-automations/api-schema';
import {
  ActivateVersionRequest,
  AnalyticsQuery,
  AnalyticsResponse,
  AutomationDetail as AutomationDetailSchema,
  AutomationsResponse,
  CreateAutomationRequest,
  PublishResponse,
  RunsQuery,
  RunsResponse,
  UpdateDraftRequest,
  ValidationIssue,
  VersionSummary as VersionSummarySchema,
} from '@comment-automations/api-schema';
import type { AutomationId, Definition, Platform } from '@comment-automations/shared';
import { allowedTriggers, capabilities, validateDefinition } from '@comment-automations/shared';
import { Type } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';
import { analytics, automationStats } from '../analytics/queries.js';
import type { Db } from '../db/types.js';
import { json } from '../db/types.js';
import { ACTIVE_STATUSES, finishRun } from '../runs/store.js';
import { listRuns } from './runs.js';
import { triggerSummary } from './trigger-summary.js';
import type { App, AppDeps } from './types.js';
import { ErrorResponse, IdParams, iso } from './types.js';

const initialDefinition = (platform: Platform): Definition => ({
  trigger: {
    ...(allowedTriggers(capabilities[platform]).comments
      ? { comments: { posts: { kind: 'any' }, keywords: [] } }
      : { messages: { keywords: [] } }),
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [],
});

const NOTHING_TO_PUBLISH: ValidationIssue = {
  path: '',
  code: 'NOTHING_TO_PUBLISH',
  message: 'There is no draft to publish',
};

const POST_NOT_FOUND: ValidationIssue = {
  path: 'trigger.comments.posts.postId',
  code: 'POST_NOT_FOUND',
  message: 'This post is not on the account',
};

const IssuesResponse = Type.Object({ issues: Type.Array(ValidationIssue) });

const VersionsResponse = Type.Object({ versions: Type.Array(VersionSummarySchema) });

const ForceQuery = Type.Object({ force: Type.Optional(Type.Boolean()) });

const automationRows = (db: Db) =>
  db
    .selectFrom('automations')
    .innerJoin('accounts', 'accounts.id', 'automations.account_id')
    .leftJoin('automation_versions as active', 'active.id', 'automations.active_version_id')
    .select([
      'automations.id',
      'automations.name',
      'automations.account_id',
      'automations.state',
      'automations.active_version_id',
      'automations.draft',
      'accounts.platform',
      'accounts.external_id as account_external_id',
      'active.number as active_number',
      'active.definition as active_definition',
    ]);

type AutomationRow = Awaited<ReturnType<ReturnType<typeof automationRows>['execute']>>[number];

const lockAutomation = async (trx: Db, id: AutomationId): Promise<AutomationRow | undefined> => {
  await trx.selectFrom('automations').select('id').where('id', '=', id).forUpdate().execute();
  return automationRows(trx).where('automations.id', '=', id).executeTakeFirst();
};

type PublishOutcome =
  | { status: 404 | 409 | 502; error: string }
  | { status: 422; issues: ValidationIssue[] }
  | { status: 200; version: VersionSummary };

const versionsOf = async (db: Db, automation: AutomationRow): Promise<VersionSummary[]> => {
  const rows = await db
    .selectFrom('automation_versions')
    .select(['id', 'number', 'note', 'published_at', 'definition'])
    .where('automation_id', '=', automation.id)
    .orderBy('number')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    note: row.note,
    publishedAt: iso(row.published_at),
    isActive: row.id === automation.active_version_id,
    definition: row.definition,
  }));
};

const summarize = (
  row: AutomationRow,
  stats: Awaited<ReturnType<typeof automationStats>>,
): AutomationSummary => ({
  id: row.id,
  name: row.name,
  accountId: row.account_id,
  platform: row.platform,
  state: row.state,
  activeVersionNumber: row.active_number,
  triggerSummary: triggerSummary(row.active_definition ?? row.draft),
  stats: stats.get(row.id) ?? { runs24h: 0, succeeded24h: 0, failed24h: 0, lastRunAt: null },
});

const detailOf = async (
  db: Db,
  id: AutomationId,
  now: Date,
): Promise<AutomationDetail | undefined> => {
  const row = await automationRows(db).where('automations.id', '=', id).executeTakeFirst();
  if (row === undefined) {
    return undefined;
  }
  const stats = await automationStats(db, [row.id], now);
  return { ...summarize(row, stats), draft: row.draft, versions: await versionsOf(db, row) };
};

const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'Automation not found' });

const publishNote = (body: unknown): string => {
  const note =
    typeof body === 'object' && body !== null ? (body as { note?: unknown }).note : undefined;
  return typeof note === 'string' ? note : '';
};

export const registerAutomationRoutes = (app: App, deps: AppDeps): void => {
  const { db } = deps;

  app.get('/automations', { schema: { response: { 200: AutomationsResponse } } }, async () => {
    const rows = await automationRows(db)
      .where('automations.state', '!=', 'archived')
      .orderBy('automations.created_at')
      .execute();
    const stats = await automationStats(
      db,
      rows.map((row) => row.id),
      deps.clock.now(),
    );
    return { automations: rows.map((row) => summarize(row, stats)) };
  });

  app.post(
    '/automations',
    {
      schema: {
        body: CreateAutomationRequest,
        response: { 201: AutomationDetailSchema, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const account = await db
        .selectFrom('accounts')
        .select(['id', 'platform'])
        .where('id', '=', request.body.accountId)
        .executeTakeFirst();
      if (account === undefined) {
        return reply.status(404).send({ error: 'Account not found' });
      }
      const now = deps.clock.now();
      const { id } = await db
        .insertInto('automations')
        .values({
          account_id: account.id,
          name: request.body.name,
          state: 'draft',
          active_version_id: null,
          draft: json(initialDefinition(account.platform)),
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const detail = await detailOf(db, id, now);
      return detail === undefined ? notFound(reply) : reply.status(201).send(detail);
    },
  );

  app.get(
    '/automations/:id',
    { schema: { params: IdParams, response: { 200: AutomationDetailSchema, 404: ErrorResponse } } },
    async (request, reply) => {
      const detail = await detailOf(db, request.params.id as AutomationId, deps.clock.now());
      return detail === undefined ? notFound(reply) : detail;
    },
  );

  app.put(
    '/automations/:id/draft',
    {
      schema: {
        params: IdParams,
        querystring: ForceQuery,
        body: UpdateDraftRequest,
        response: { 200: AutomationDetailSchema, 404: ErrorResponse, 422: IssuesResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const row = await automationRows(db).where('automations.id', '=', id).executeTakeFirst();
      if (row === undefined) {
        return notFound(reply);
      }
      const issues = validateDefinition(request.body.definition, capabilities[row.platform]);
      if (issues.length > 0 && request.query.force !== true) {
        return reply.status(422).send({ issues });
      }
      await db
        .updateTable('automations')
        .set({ draft: json(request.body.definition), updated_at: now })
        .where('id', '=', id)
        .execute();
      return detailOf(db, id, now);
    },
  );

  app.post(
    '/automations/:id/publish',
    {
      schema: {
        params: IdParams,
        response: {
          200: PublishResponse,
          404: ErrorResponse,
          409: ErrorResponse,
          422: IssuesResponse,
          502: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const outcome = await db.transaction().execute(async (trx): Promise<PublishOutcome> => {
        const row = await lockAutomation(trx, id);
        if (row === undefined) {
          return { status: 404, error: 'Automation not found' };
        }
        if (row.state === 'archived') {
          return { status: 409, error: 'An archived automation cannot be published' };
        }
        if (row.draft === null) {
          if (row.active_version_id === null) {
            return { status: 422, issues: [NOTHING_TO_PUBLISH] };
          }
          if (row.state === 'live') {
            return {
              status: 409,
              error: 'Nothing to publish: the automation is live without a draft',
            };
          }
          await trx
            .updateTable('automations')
            .set({ state: 'live', updated_at: now })
            .where('id', '=', id)
            .execute();
          const versions = await versionsOf(trx, row);
          return { status: 200, version: versions.find((version) => version.isActive)! };
        }
        const draft = row.draft;
        const issues = validateDefinition(draft, capabilities[row.platform]);
        if (issues.length > 0) {
          return { status: 422, issues };
        }
        const posts = draft.trigger.comments?.posts;
        if (posts?.kind === 'specific') {
          const listed = await deps.gateway.listPosts(row.account_external_id);
          if (!listed.ok) {
            return { status: 502, error: 'The gateway could not list the posts' };
          }
          if (!listed.value.some((post) => post.postId === posts.postId)) {
            return { status: 422, issues: [POST_NOT_FOUND] };
          }
        }
        const { max } = await trx
          .selectFrom('automation_versions')
          .select((eb) => eb.fn.max('number').as('max'))
          .where('automation_id', '=', id)
          .executeTakeFirstOrThrow();
        const inserted = await trx
          .insertInto('automation_versions')
          .values({
            automation_id: id,
            number: (max ?? 0) + 1,
            definition: json(draft),
            note: publishNote(request.body),
            published_at: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('automations')
          .set({ active_version_id: inserted.id, state: 'live', draft: null, updated_at: now })
          .where('id', '=', id)
          .execute();
        return {
          status: 200,
          version: {
            id: inserted.id,
            number: inserted.number,
            note: inserted.note,
            publishedAt: iso(inserted.published_at),
            isActive: true,
            definition: inserted.definition,
          },
        };
      });
      switch (outcome.status) {
        case 200:
          return { version: outcome.version };
        case 404:
          return reply.status(404).send({ error: outcome.error });
        case 409:
          return reply.status(409).send({ error: outcome.error });
        case 422:
          return reply.status(422).send({ issues: outcome.issues });
        case 502:
          return reply.status(502).send({ error: outcome.error });
      }
    },
  );

  app.post(
    '/automations/:id/activate',
    {
      schema: {
        params: IdParams,
        body: ActivateVersionRequest,
        response: { 200: AutomationDetailSchema, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const version = await db
        .selectFrom('automation_versions')
        .select('id')
        .where('id', '=', request.body.versionId)
        .where('automation_id', '=', id)
        .executeTakeFirst();
      if (version === undefined) {
        return reply.status(404).send({ error: 'Version not found' });
      }
      await db
        .updateTable('automations')
        .set({ active_version_id: version.id, updated_at: now })
        .where('id', '=', id)
        .execute();
      return detailOf(db, id, now);
    },
  );

  app.post(
    '/automations/:id/draft-from-version',
    {
      schema: {
        params: IdParams,
        body: ActivateVersionRequest,
        response: { 200: AutomationDetailSchema, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const version = await db
        .selectFrom('automation_versions')
        .select('definition')
        .where('id', '=', request.body.versionId)
        .where('automation_id', '=', id)
        .executeTakeFirst();
      if (version === undefined) {
        return reply.status(404).send({ error: 'Version not found' });
      }
      await db
        .updateTable('automations')
        .set({ draft: json(version.definition), updated_at: now })
        .where('id', '=', id)
        .execute();
      return detailOf(db, id, now);
    },
  );

  app.post(
    '/automations/:id/pause',
    {
      schema: {
        params: IdParams,
        response: { 200: AutomationDetailSchema, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const row = await automationRows(db).where('automations.id', '=', id).executeTakeFirst();
      if (row === undefined) {
        return notFound(reply);
      }
      if (row.state !== 'live') {
        return reply.status(409).send({ error: 'Only a live automation can be paused' });
      }
      await db
        .updateTable('automations')
        .set({ state: 'draft', updated_at: now })
        .where('id', '=', id)
        .execute();
      return detailOf(db, id, now);
    },
  );

  app.delete(
    '/automations/:id',
    { schema: { params: IdParams, response: { 204: Type.Null(), 404: ErrorResponse } } },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const now = deps.clock.now();
      const archived = await db.transaction().execute(async (trx) => {
        const result = await trx
          .updateTable('automations')
          .set({ state: 'archived', updated_at: now })
          .where('id', '=', id)
          .executeTakeFirst();
        const active = await trx
          .selectFrom('runs')
          .select(['id', 'step_index'])
          .where('automation_id', '=', id)
          .where('status', 'in', ACTIVE_STATUSES)
          .forUpdate()
          .execute();
        for (const run of active) {
          await finishRun(trx, run.id, 'stopped', now, {
            stepIndex: run.step_index,
            message: 'Stopped because the automation was archived',
          });
        }
        return result.numUpdatedRows > 0n;
      });
      if (!archived) {
        return notFound(reply);
      }
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/automations/:id/versions',
    { schema: { params: IdParams, response: { 200: VersionsResponse, 404: ErrorResponse } } },
    async (request, reply) => {
      const row = await automationRows(db)
        .where('automations.id', '=', request.params.id as AutomationId)
        .executeTakeFirst();
      if (row === undefined) {
        return notFound(reply);
      }
      return { versions: await versionsOf(db, row) };
    },
  );

  app.get(
    '/automations/:id/runs',
    {
      schema: {
        params: IdParams,
        querystring: RunsQuery,
        response: { 200: RunsResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const exists = await db
        .selectFrom('automations')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (exists === undefined) {
        return notFound(reply);
      }
      return listRuns(db, id, request.query);
    },
  );

  app.get(
    '/automations/:id/analytics',
    {
      schema: {
        params: IdParams,
        querystring: AnalyticsQuery,
        response: { 200: AnalyticsResponse, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const id = request.params.id as AutomationId;
      const exists = await db
        .selectFrom('automations')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (exists === undefined) {
        return notFound(reply);
      }
      const { versionIds, since, until } = request.query;
      return analytics(db, {
        automationId: id,
        versionIds,
        since: since === undefined ? undefined : new Date(since),
        until: until === undefined ? undefined : new Date(until),
      });
    },
  );
};
