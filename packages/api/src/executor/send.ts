import type { MessageButton } from '@comment-automations/gateway-contract';
import type { Clock } from '@comment-automations/shared';
import { conversationId, renderTemplate } from '@comment-automations/shared';
import type { Kysely } from 'kysely';
import type { Database, Db, RunContext, RunError } from '../db/types.js';
import { json } from '../db/types.js';
import type { Gateway, GatewayError, GatewayResult } from '../gateway/port.js';
import type { LoadedRun } from '../runs/store.js';
import type { OutboundPurpose } from './idempotency.js';
import { idempotencyKey } from './idempotency.js';
import {
  conversationOpen,
  conversationWindowClosed,
  privateReplyOpen,
  privateReplyWindowClosed,
} from './windows.js';

export type Deps = {
  db: Kysely<Database>;
  gateway: Gateway;
  clock: Clock;
  fetch: typeof fetch;
  webhookAllowPrivate: boolean;
};

export type StepFailure = { error: RunError; retryable: boolean };

export type SendOutcome =
  | { ok: true; context: RunContext; via: 'privateReply' | 'message'; response: unknown }
  | ({ ok: false } & StepFailure);

export const recordedCall = async <T>(
  db: Db,
  loaded: LoadedRun,
  key: string,
  kind: string,
  request: unknown,
  now: Date,
  call: () => Promise<GatewayResult<T>>,
): Promise<GatewayResult<T>> => {
  const existing = await db
    .selectFrom('outbound_calls')
    .select(['status', 'response'])
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  if (existing !== undefined && existing.status === 'ok') {
    return { ok: true, value: existing.response as T };
  }
  const result = await call();
  const recorded = {
    response: json(result.ok ? result.value : result.error),
    status: result.ok ? 'ok' : result.error.code,
    at: now,
  };
  await db
    .insertInto('outbound_calls')
    .values({
      run_id: loaded.run.id,
      idempotency_key: key,
      kind,
      request: json(request),
      ...recorded,
    })
    .onConflict((conflict) => conflict.column('idempotency_key').doUpdateSet(recorded))
    .execute();
  return result;
};

export const gatewayFailure = (
  error: GatewayError,
  loaded: LoadedRun,
  lastInboundAt: Date | undefined,
): StepFailure => {
  const messages: Partial<Record<GatewayError['code'], string>> = {
    ALREADY_REPLIED: "Couldn't reply: this comment was already replied to",
    REPLY_WINDOW_CLOSED: privateReplyWindowClosed(loaded.record).message,
    MESSAGING_WINDOW_CLOSED: conversationWindowClosed(loaded.record, lastInboundAt).message,
    MESSAGE_CAP_REACHED:
      "Couldn't send: the platform caps messages in a row; the contact has to reply before the next one",
    RECIPIENT_UNREACHABLE: "Couldn't send: the contact doesn't accept messages from this account",
    ACCOUNT_DISCONNECTED: "Couldn't send: the account is disconnected",
    RATE_LIMITED: 'The platform rate-limited this account',
    MALFORMED_RESPONSE: 'The gateway answered outside the contract',
  };
  return {
    error: { code: error.code, message: messages[error.code] ?? `Couldn't send: ${error.message}` },
    retryable: error.retryable,
  };
};

export const renderFor = (loaded: LoadedRun, text: string): string =>
  renderTemplate(text, {
    email: loaded.run.context.captured.email,
    contactHandle: loaded.contact.handle,
  });

export const lastInboundOf = (context: RunContext): Date | undefined =>
  context.lastInboundAt === undefined ? undefined : new Date(context.lastInboundAt);

export const replyPublicly = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  stepIndex: number,
  purpose: OutboundPurpose,
  text: string,
): Promise<GatewayResult<{ replyId?: string; conversationId?: string }>> => {
  const request = {
    accountId: loaded.account.externalId,
    commentId: loaded.run.context.commentId ?? '',
    text: renderFor(loaded, text),
    visibility: 'public' as const,
    idempotencyKey: idempotencyKey(loaded.run.id, stepIndex, purpose),
  };
  return recordedCall(db, loaded, request.idempotencyKey, 'reply', request, deps.clock.now(), () =>
    deps.gateway.replyToComment(request),
  );
};

export const sendToContact = async (
  deps: Deps,
  db: Db,
  loaded: LoadedRun,
  stepIndex: number,
  purpose: OutboundPurpose,
  text: string,
  buttons: MessageButton[],
): Promise<SendOutcome> => {
  const now = deps.clock.now();
  const { record, account, contact } = loaded;
  const context = loaded.run.context;
  const rendered = renderFor(loaded, text);
  const key = idempotencyKey(loaded.run.id, stepIndex, purpose);
  const lastInboundAt = lastInboundOf(context);

  if (
    context.conversationId === undefined &&
    record.commenterIsMessageable === 'viaPrivateReplyOnly'
  ) {
    if (context.commentId === undefined || loaded.commentCreatedAt === undefined) {
      return {
        ok: false,
        retryable: false,
        error: {
          code: 'UNSUPPORTED',
          message: "Couldn't send: no comment to reply to and no open conversation",
        },
      };
    }
    if (!privateReplyOpen(record, loaded.commentCreatedAt, now)) {
      return { ok: false, retryable: false, error: privateReplyWindowClosed(record) };
    }
    const request = {
      accountId: account.externalId,
      commentId: context.commentId,
      text: rendered,
      visibility: 'private' as const,
      idempotencyKey: key,
    };
    const result = await recordedCall(db, loaded, key, 'reply', request, now, () =>
      deps.gateway.replyToComment(request),
    );
    if (!result.ok) {
      return { ok: false, ...gatewayFailure(result.error, loaded, lastInboundAt) };
    }
    return {
      ok: true,
      via: 'privateReply',
      response: result.value,
      context: {
        ...context,
        conversationId:
          result.value.conversationId === undefined
            ? context.conversationId
            : conversationId(result.value.conversationId),
      },
    };
  }

  if (!conversationOpen(record, lastInboundAt, now)) {
    return { ok: false, retryable: false, error: conversationWindowClosed(record, lastInboundAt) };
  }
  const request = {
    accountId: account.externalId,
    recipient:
      context.conversationId === undefined
        ? { userId: contact.externalId }
        : { conversationId: context.conversationId },
    text: rendered,
    buttons: buttons.length === 0 ? undefined : buttons,
    idempotencyKey: key,
  };
  const result = await recordedCall(db, loaded, key, 'message', request, now, () =>
    deps.gateway.sendMessage(request),
  );
  if (!result.ok) {
    return { ok: false, ...gatewayFailure(result.error, loaded, lastInboundAt) };
  }
  return {
    ok: true,
    via: 'message',
    response: result.value,
    context: { ...context, conversationId: conversationId(result.value.conversationId) },
  };
};
