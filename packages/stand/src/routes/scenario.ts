import { Platform } from '@comment-automations/gateway-contract';
import { accountId, commentId, postId, userId } from '@comment-automations/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { FastifyReply } from 'fastify';
import type { Context } from '../context.js';
import type { Database } from '../db/database.js';
import { newId } from '../ids.js';
import { resetWorlds, seedWorlds } from '../seed.js';
import { forwardClock } from './clock.js';
import {
  addMessage,
  commentEvent,
  messageEvent,
  openConversation,
  readSettings,
} from '../store.js';
import { worlds } from '../worlds/index.js';

const DmSetting = Type.Union([
  Type.Literal('all'),
  Type.Literal('following'),
  Type.Literal('none'),
]);
const Id = Type.String({ minLength: 1 });
const PlatformQuery = Type.Object({ platform: Platform });

const SettingsBody = Type.Object({
  duplicatePercent: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  reorderWindowMs: Type.Optional(Type.Integer({ minimum: 0 })),
  delayMs: Type.Optional(Type.Integer({ minimum: 0 })),
  dropPercent: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  burst429: Type.Optional(Type.Integer({ minimum: 0 })),
});

const toSettings = (row: Awaited<ReturnType<typeof readSettings>>) => ({
  duplicatePercent: row.duplicate_percent,
  reorderWindowMs: row.reorder_window_ms,
  delayMs: row.delay_ms,
  dropPercent: row.drop_percent,
  burst429: row.burst429,
});

const fail = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ code, message });

const notFound = (reply: FastifyReply, what: string) =>
  fail(reply, 404, 'NOT_FOUND', `${what} not found`);

const unsupported = (reply: FastifyReply, what: string) =>
  fail(reply, 422, 'UNSUPPORTED', `${what} do not exist on this platform`);

export const scenarioRoutes: FastifyPluginAsyncTypebox<{ ctx: Context }> = async (app, { ctx }) => {
  const { db, clock } = ctx;

  app.post('/reset', async () => {
    await resetWorlds(db);
    return { ok: true };
  });

  app.post('/seed', async () => {
    await resetWorlds(db);
    await seedWorlds(db, clock.now());
    return { ok: true };
  });

  app.post('/restore', async () => {
    const now = new Date();
    clock.set(now);
    await resetWorlds(db);
    await seedWorlds(db, now);
    const answer = await forwardClock(ctx, { now: now.toISOString() });
    return { ok: true, service: 'error' in answer ? answer : { status: answer.status } };
  });

  app.post(
    '/accounts',
    {
      schema: {
        body: Type.Object({
          platform: Platform,
          handle: Type.String({ minLength: 1 }),
          displayName: Type.Optional(Type.String()),
          status: Type.Optional(
            Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
          ),
        }),
      },
    },
    async (request) =>
      db
        .insertInto('accounts')
        .values({
          id: newId(accountId, 'acc'),
          platform: request.body.platform,
          handle: request.body.handle,
          display_name: request.body.displayName ?? request.body.handle,
          status: request.body.status ?? 'connected',
        })
        .returningAll()
        .executeTakeFirstOrThrow(),
  );

  app.post(
    '/users',
    {
      schema: {
        body: Type.Object({
          platform: Platform,
          handle: Type.String({ minLength: 1 }),
          displayName: Type.Optional(Type.String()),
          dmSetting: Type.Optional(DmSetting),
          follows: Type.Optional(Type.Array(Id)),
        }),
      },
    },
    async (request) =>
      db
        .insertInto('users')
        .values({
          id: newId(userId, 'u'),
          platform: request.body.platform,
          handle: request.body.handle,
          display_name: request.body.displayName ?? request.body.handle,
          dm_setting: request.body.dmSetting ?? 'all',
          follows_account_ids: (request.body.follows ?? []).map(accountId),
        })
        .returningAll()
        .executeTakeFirstOrThrow(),
  );

  app.patch(
    '/users/:id',
    {
      schema: {
        params: Type.Object({ id: Id }),
        body: Type.Object({
          dmSetting: Type.Optional(DmSetting),
          follows: Type.Optional(Type.Array(Id)),
        }),
      },
    },
    async (request, reply) => {
      const patch: Partial<Pick<Database['users'], 'dm_setting' | 'follows_account_ids'>> = {};
      if (request.body.dmSetting) {
        patch.dm_setting = request.body.dmSetting;
      }
      if (request.body.follows) {
        patch.follows_account_ids = request.body.follows.map(accountId);
      }
      const user = await db
        .updateTable('users')
        .set(patch)
        .where('id', '=', userId(request.params.id))
        .returningAll()
        .executeTakeFirst();
      return user ?? notFound(reply, 'user');
    },
  );

  app.post(
    '/posts',
    { schema: { body: Type.Object({ accountId: Id, caption: Type.String() }) } },
    async (request, reply) => {
      const account = await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', accountId(request.body.accountId))
        .executeTakeFirst();
      if (!account) {
        return notFound(reply, 'account');
      }
      if (!worlds[account.platform].comments) {
        return unsupported(reply, 'posts');
      }
      return db
        .insertInto('posts')
        .values({
          id: newId(postId, 'post'),
          account_id: account.id,
          caption: request.body.caption,
          published_at: clock.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },
  );

  app.post(
    '/comments',
    {
      schema: {
        body: Type.Object({
          postId: Id,
          userId: Id,
          text: Type.String({ minLength: 1 }),
          parentId: Type.Optional(Id),
        }),
      },
    },
    async (request, reply) => {
      const post = await db
        .selectFrom('posts')
        .innerJoin('accounts', 'accounts.id', 'posts.account_id')
        .select(['posts.id', 'posts.account_id', 'accounts.platform'])
        .where('posts.id', '=', postId(request.body.postId))
        .executeTakeFirst();
      if (!post) {
        return notFound(reply, 'post');
      }
      if (!worlds[post.platform].comments) {
        return unsupported(reply, 'comments');
      }
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId(request.body.userId))
        .where('platform', '=', post.platform)
        .executeTakeFirst();
      if (!user) {
        return notFound(reply, 'user');
      }
      const parentId =
        request.body.parentId === undefined ? null : commentId(request.body.parentId);
      if (parentId !== null) {
        const parent = await db
          .selectFrom('comments')
          .select('id')
          .where('id', '=', parentId)
          .where('post_id', '=', post.id)
          .executeTakeFirst();
        if (!parent) {
          return notFound(reply, 'parent comment');
        }
      }
      const comment = await db
        .insertInto('comments')
        .values({
          id: newId(commentId, 'c'),
          post_id: post.id,
          author_user_id: user.id,
          author_account_id: null,
          parent_id: parentId,
          text: request.body.text,
          created_at: clock.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      ctx.delivery.send(
        commentEvent(post.platform, post.account_id, comment, { id: user.id, handle: user.handle }),
      );
      return comment;
    },
  );

  app.post(
    '/messages',
    {
      schema: {
        body: Type.Object({ accountId: Id, userId: Id, text: Type.String({ minLength: 1 }) }),
      },
    },
    async (request, reply) => {
      const account = await db
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', accountId(request.body.accountId))
        .executeTakeFirst();
      if (!account) {
        return notFound(reply, 'account');
      }
      if (worlds[account.platform].messaging.kind === 'none') {
        return unsupported(reply, 'conversations');
      }
      const user = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId(request.body.userId))
        .where('platform', '=', account.platform)
        .executeTakeFirst();
      if (!user) {
        return notFound(reply, 'user');
      }
      const now = clock.now();
      const conversation = await openConversation(db, account.id, user.id, 'user', now);
      const message = await addMessage(db, {
        conversationId: conversation.id,
        from: 'user',
        text: request.body.text,
        buttons: [],
        at: now,
      });
      ctx.delivery.send(
        messageEvent(account.platform, account.id, message, { id: user.id, handle: user.handle }),
      );
      return message;
    },
  );

  app.get('/state', { schema: { querystring: PlatformQuery } }, async (request) => {
    const { platform } = request.query;
    const accounts = await db
      .selectFrom('accounts')
      .selectAll()
      .where('platform', '=', platform)
      .orderBy('id')
      .execute();
    const users = await db
      .selectFrom('users')
      .selectAll()
      .where('platform', '=', platform)
      .orderBy('id')
      .execute();
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return { accounts, users, posts: [], conversations: [] };
    }
    const posts = await db
      .selectFrom('posts')
      .selectAll()
      .where('account_id', 'in', accountIds)
      .orderBy('published_at', 'desc')
      .execute();
    const comments =
      posts.length === 0
        ? []
        : await db
            .selectFrom('comments')
            .selectAll()
            .where(
              'post_id',
              'in',
              posts.map((post) => post.id),
            )
            .orderBy('created_at')
            .execute();
    const conversations = await db
      .selectFrom('conversations')
      .selectAll()
      .where('account_id', 'in', accountIds)
      .orderBy('id')
      .execute();
    const messages =
      conversations.length === 0
        ? []
        : await db
            .selectFrom('messages')
            .selectAll()
            .where(
              'conversation_id',
              'in',
              conversations.map((conversation) => conversation.id),
            )
            .orderBy('seq')
            .execute();
    return {
      accounts,
      users,
      posts: posts.map((post) => ({
        ...post,
        comments: comments.filter((comment) => comment.post_id === post.id),
      })),
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messages: messages.filter((message) => message.conversation_id === conversation.id),
      })),
    };
  });

  app.get(
    '/rules',
    { schema: { querystring: PlatformQuery } },
    async (request) => worlds[request.query.platform],
  );

  app.get(
    '/event-log',
    {
      schema: {
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
          since: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      let query = db
        .selectFrom('event_log')
        .selectAll()
        .orderBy('id', 'desc')
        .limit(request.query.limit ?? 200);
      if (request.query.since) {
        query = query.where('at', '>', new Date(request.query.since));
      }
      return query.execute();
    },
  );

  app.get('/deliveries', async () =>
    db.selectFrom('deliveries').selectAll().orderBy('id', 'desc').limit(200).execute(),
  );

  app.get('/settings', async () => toSettings(await readSettings(db)));

  app.put('/settings', { schema: { body: SettingsBody } }, async (request) => {
    const { body } = request;
    const row = await db
      .updateTable('settings')
      .set({
        ...(body.duplicatePercent === undefined
          ? {}
          : { duplicate_percent: body.duplicatePercent }),
        ...(body.reorderWindowMs === undefined ? {} : { reorder_window_ms: body.reorderWindowMs }),
        ...(body.delayMs === undefined ? {} : { delay_ms: body.delayMs }),
        ...(body.dropPercent === undefined ? {} : { drop_percent: body.dropPercent }),
        ...(body.burst429 === undefined ? {} : { burst429: body.burst429 }),
      })
      .where('id', '=', 1)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSettings(row);
  });
};
