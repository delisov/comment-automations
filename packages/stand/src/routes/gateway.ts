import { timingSafeEqual } from 'node:crypto';
import type {
  GatewayError,
  GatewayErrorCode,
  MessageRequest as MessageRequestType,
  ReplyRequest as ReplyRequestType,
} from '@comment-automations/gateway-contract';
import {
  GATEWAY_ERROR_STATUS,
  MessageRequest,
  PostsQuery,
  ReplyRequest,
} from '@comment-automations/gateway-contract';
import type { AccountId } from '@comment-automations/shared';
import { accountId, commentId, conversationId, userId } from '@comment-automations/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyReply } from 'fastify';
import type { Context } from '../context.js';
import type { Db } from '../db/database.js';
import { newId } from '../ids.js';
import {
  accountMessagesSinceUser,
  addMessage,
  commentEvent,
  findConversation,
  logEvent,
  messageEvent,
  openConversation,
} from '../store.js';
import { worlds } from '../worlds/index.js';
import { refuseMessage, refuseReply } from '../worlds/rules.js';

type Outcome = { status: number; code: GatewayErrorCode | 'OK'; body: unknown };

const REFUSAL_MESSAGES: Record<GatewayErrorCode, string> = {
  ALREADY_REPLIED: 'This comment already received a private reply',
  REPLY_WINDOW_CLOSED: 'The private reply window for this comment has closed',
  MESSAGING_WINDOW_CLOSED: 'The messaging window for this conversation has closed',
  RECIPIENT_UNREACHABLE: 'The account may not message this user',
  MESSAGE_TOO_LONG: 'The text exceeds the platform limit',
  BUTTONS_NOT_SUPPORTED: 'The platform does not allow this many buttons',
  RATE_LIMITED: 'Too many requests',
  ACCOUNT_DISCONNECTED: 'The account is disconnected',
  NOT_FOUND: 'No such account, post, comment, conversation or user',
  UNSUPPORTED: 'The platform does not support this operation',
};

const ok = (body: unknown): Outcome => ({ status: 200, code: 'OK', body });

const refusal = (code: GatewayErrorCode): Outcome => {
  const body: GatewayError = {
    code,
    message: REFUSAL_MESSAGES[code],
    retryable: code === 'RATE_LIMITED',
  };
  return { status: GATEWAY_ERROR_STATUS[code], code, body };
};

const tokenMatches = (header: unknown, token: string): boolean =>
  typeof header === 'string' &&
  header.length === token.length &&
  timingSafeEqual(Buffer.from(header), Buffer.from(token));

const takeBurst = async (db: Db): Promise<boolean> => {
  const row = await db
    .updateTable('settings')
    .set((eb) => ({ burst429: eb('burst429', '-', 1) }))
    .where('id', '=', 1)
    .where('burst429', '>', 0)
    .returning('burst429')
    .executeTakeFirst();
  return row !== undefined;
};

const loadAccount = (db: Db, id: AccountId) =>
  db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirst();

const applyReply = async (ctx: Context, body: ReplyRequestType): Promise<Outcome> => {
  const { db } = ctx;
  const account = await loadAccount(db, accountId(body.accountId));
  if (!account) {
    return refusal('NOT_FOUND');
  }
  if (account.status === 'disconnected') {
    return refusal('ACCOUNT_DISCONNECTED');
  }
  const rules = worlds[account.platform];
  const comment = await db
    .selectFrom('comments')
    .innerJoin('posts', 'posts.id', 'comments.post_id')
    .selectAll('comments')
    .where('comments.id', '=', commentId(body.commentId))
    .where('posts.account_id', '=', account.id)
    .executeTakeFirst();
  if (!comment) {
    return refusal('NOT_FOUND');
  }
  const now = ctx.clock.now();
  const code = refuseReply(rules, {
    visibility: body.visibility,
    text: body.text,
    commentCreatedAt: comment.created_at,
    privateReplySent: comment.private_reply_sent,
    now,
  });
  if (code) {
    return refusal(code);
  }
  const self = { id: account.id, handle: account.handle };
  if (body.visibility === 'public') {
    const replyRow = await db
      .insertInto('comments')
      .values({
        id: newId(commentId, 'c'),
        post_id: comment.post_id,
        author_user_id: null,
        author_account_id: account.id,
        parent_id: comment.id,
        text: body.text,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (rules.ownActivityEcho) {
      ctx.delivery.send(commentEvent(account.platform, account.id, replyRow, self));
    }
    return ok({ replyId: replyRow.id });
  }
  if (comment.author_user_id === null) {
    return refusal('RECIPIENT_UNREACHABLE');
  }
  await db
    .updateTable('comments')
    .set({ private_reply_sent: true })
    .where('id', '=', comment.id)
    .execute();
  const conversation =
    (await findConversation(db, account.id, comment.author_user_id)) ??
    (await openConversation(db, account.id, comment.author_user_id, 'privateReply', null));
  const message = await addMessage(db, {
    conversationId: conversation.id,
    from: 'account',
    text: body.text,
    buttons: [],
    at: now,
  });
  if (rules.ownActivityEcho) {
    ctx.delivery.send(messageEvent(account.platform, account.id, message, self));
  }
  return ok({ conversationId: conversation.id });
};

const applyMessage = async (ctx: Context, body: MessageRequestType): Promise<Outcome> => {
  const { db } = ctx;
  const account = await loadAccount(db, accountId(body.accountId));
  if (!account) {
    return refusal('NOT_FOUND');
  }
  if (account.status === 'disconnected') {
    return refusal('ACCOUNT_DISCONNECTED');
  }
  const rules = worlds[account.platform];
  const existing =
    'conversationId' in body.recipient
      ? await db
          .selectFrom('conversations')
          .selectAll()
          .where('id', '=', conversationId(body.recipient.conversationId))
          .where('account_id', '=', account.id)
          .executeTakeFirst()
      : await findConversation(db, account.id, userId(body.recipient.userId));
  if ('conversationId' in body.recipient && !existing) {
    return refusal('NOT_FOUND');
  }
  const recipientUserId =
    'userId' in body.recipient ? userId(body.recipient.userId) : existing!.user_id;
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', recipientUserId)
    .where('platform', '=', account.platform)
    .executeTakeFirst();
  if (!user) {
    return refusal('NOT_FOUND');
  }
  const now = ctx.clock.now();
  const code = refuseMessage(rules, {
    text: body.text,
    buttons: body.buttons?.length ?? 0,
    now,
    recipient: {
      dmSetting: user.dm_setting,
      followsAccount: user.follows_account_ids.includes(account.id),
    },
    conversation: existing
      ? {
          lastUserMessageAt: existing.last_user_message_at,
          accountMessagesSinceUser: await accountMessagesSinceUser(db, existing),
        }
      : null,
  });
  if (code) {
    return refusal(code);
  }
  const conversation =
    existing ?? (await openConversation(db, account.id, user.id, 'account', null));
  const message = await addMessage(db, {
    conversationId: conversation.id,
    from: 'account',
    text: body.text,
    buttons: body.buttons ?? [],
    at: now,
  });
  if (rules.ownActivityEcho) {
    ctx.delivery.send(
      messageEvent(account.platform, account.id, message, {
        id: account.id,
        handle: account.handle,
      }),
    );
  }
  return ok({ messageId: message.id, conversationId: conversation.id });
};

type Idempotency = { accountId: AccountId; key: string } | null;

const answer = async (
  ctx: Context,
  reply: FastifyReply,
  kind: string,
  request: object,
  idempotency: Idempotency,
  compute: () => Promise<Outcome>,
) => {
  const { db } = ctx;
  if (idempotency) {
    const stored = await db
      .selectFrom('idempotency')
      .select('response')
      .where('account_id', '=', idempotency.accountId)
      .where('key', '=', idempotency.key)
      .executeTakeFirst();
    if (stored) {
      await logEvent(db, {
        direction: 'from_service',
        kind,
        payload: { request, response: stored.response.body, replayed: true },
        resultCode: stored.response.code,
        at: ctx.clock.now(),
      });
      return reply.code(stored.response.status).send(stored.response.body);
    }
  }
  const outcome = (await takeBurst(db)) ? refusal('RATE_LIMITED') : await compute();
  if (idempotency && outcome.code !== 'RATE_LIMITED') {
    await db
      .insertInto('idempotency')
      .values({
        account_id: idempotency.accountId,
        key: idempotency.key,
        response: JSON.stringify(outcome),
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  await logEvent(db, {
    direction: 'from_service',
    kind,
    payload: { request, response: outcome.body },
    resultCode: outcome.code,
    at: ctx.clock.now(),
  });
  return reply.code(outcome.status).send(outcome.body);
};

export const gatewayRoutes: FastifyPluginAsyncTypebox<{ ctx: Context }> = async (app, { ctx }) => {
  app.addHook('onRequest', async (request, reply) => {
    if (!tokenMatches(request.headers['x-service-token'], ctx.serviceToken)) {
      return reply.code(401).send({ error: 'invalid service token' });
    }
  });

  app.post('/replies', { schema: { body: ReplyRequest } }, async (request, reply) =>
    answer(
      ctx,
      reply,
      'reply',
      request.body,
      { accountId: accountId(request.body.accountId), key: request.body.idempotencyKey },
      () => applyReply(ctx, request.body),
    ),
  );

  app.post('/messages', { schema: { body: MessageRequest } }, async (request, reply) =>
    answer(
      ctx,
      reply,
      'message',
      request.body,
      { accountId: accountId(request.body.accountId), key: request.body.idempotencyKey },
      () => applyMessage(ctx, request.body),
    ),
  );

  app.get('/accounts', async (_request, reply) =>
    answer(ctx, reply, 'accounts', {}, null, async () => {
      const accounts = await ctx.db.selectFrom('accounts').selectAll().orderBy('id').execute();
      return ok({
        accounts: accounts.map((account) => ({
          accountId: account.id,
          platform: account.platform,
          handle: account.handle,
          displayName: account.display_name,
          status: account.status,
        })),
      });
    }),
  );

  app.get('/posts', { schema: { querystring: PostsQuery } }, async (request, reply) =>
    answer(ctx, reply, 'posts', request.query, null, async () => {
      const account = await loadAccount(ctx.db, accountId(request.query.accountId));
      if (!account) {
        return refusal('NOT_FOUND');
      }
      const posts = await ctx.db
        .selectFrom('posts')
        .selectAll()
        .where('account_id', '=', account.id)
        .orderBy('published_at', 'desc')
        .execute();
      return ok({
        posts: posts.map((post) => ({
          postId: post.id,
          caption: post.caption,
          publishedAt: post.published_at.toISOString(),
        })),
      });
    }),
  );
};
