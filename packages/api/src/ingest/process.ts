import type {
  IngestResponse,
  InboundEvent,
  MessageEvent,
} from '@comment-automations/gateway-contract';
import { commentId, conversationId, postId } from '@comment-automations/shared';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database, RunContext } from '../db/types.js';
import { json } from '../db/types.js';
import type { Deps } from '../executor/send.js';
import { selectForComment, selectForMessage } from '../runs/match.js';
import { resumeWaitingRun } from '../runs/resume.js';
import { liveAutomations, startRun } from '../runs/start.js';
import { loadRun, logRun } from '../runs/store.js';

type Outcome = 'accepted' | 'duplicate';

const TEXT_LIMIT = 10_000;

const firstCodeUnits = (text: string): string => {
  const cut = text.slice(0, TEXT_LIMIT);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
};

const capped = (event: InboundEvent): InboundEvent =>
  event.kind === 'comment'
    ? {
        ...event,
        authorHandle: firstCodeUnits(event.authorHandle),
        text: firstCodeUnits(event.text),
      }
    : {
        ...event,
        senderHandle: firstCodeUnits(event.senderHandle),
        text: firstCodeUnits(event.text),
      };

const logRedeliveredMessage = async (
  trx: Transaction<Database>,
  event: MessageEvent,
  now: Date,
): Promise<void> => {
  const original = await trx
    .selectFrom('events')
    .select('id')
    .where('platform', '=', event.platform)
    .where('message_id', '=', event.messageId)
    .where('external_event_id', '!=', event.eventId)
    .executeTakeFirst();
  if (original === undefined) {
    return;
  }
  const handled = await trx
    .selectFrom('runs')
    .select('id')
    .where((eb) =>
      eb.or([
        eb('trigger_event_id', '=', original.id),
        sql<boolean>`runs.context->'consumedEventIds' @> to_jsonb(${original.id}::text)`,
      ]),
    )
    .execute();
  for (const { id } of handled) {
    await logRun(trx, id, now, {
      stepIndex: null,
      message: 'Ignored a redelivered message: this run already handled it',
      context: { eventId: event.eventId },
    });
  }
};

const processEvent = async (
  deps: Deps,
  trx: Transaction<Database>,
  received: InboundEvent,
): Promise<Outcome> => {
  const now = deps.clock.now();
  const event = capped(received);
  const inserted = await trx
    .insertInto('events')
    .values({
      platform: event.platform,
      account_id: event.accountId,
      external_event_id: event.eventId,
      kind: event.kind,
      message_id: event.kind === 'message' ? event.messageId : null,
      payload: json(event),
      received_at: now,
    })
    .onConflict((conflict) => conflict.doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted === undefined) {
    if (event.kind === 'message') {
      await logRedeliveredMessage(trx, event, now);
    }
    return 'duplicate';
  }
  const account = await trx
    .selectFrom('accounts')
    .select(['id', 'external_id'])
    .where('platform', '=', event.platform)
    .where('external_id', '=', event.accountId)
    .executeTakeFirst();
  const author =
    event.kind === 'comment'
      ? { id: event.authorId, handle: event.authorHandle }
      : { id: event.senderId, handle: event.senderHandle };
  if (account === undefined || author.id === account.external_id) {
    return 'accepted';
  }
  const contact = await trx
    .insertInto('contacts')
    .values({
      platform: event.platform,
      account_id: account.id,
      external_id: author.id,
      handle: author.handle,
      updated_at: now,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['platform', 'account_id', 'external_id'])
        .doUpdateSet({ handle: author.handle, updated_at: now }),
    )
    .returning('id')
    .executeTakeFirstOrThrow();

  if (event.kind === 'comment') {
    const context: RunContext = {
      commentId: commentId(event.commentId),
      postId: postId(event.postId),
      captured: {},
      replied: false,
    };
    for (const automation of selectForComment(event, await liveAutomations(trx, account.id))) {
      await startRun(trx, {
        automation,
        accountId: account.id,
        contactId: contact.id,
        triggerEventId: inserted.id,
        context,
        startedFrom: 'comment',
        now,
      });
    }
    return 'accepted';
  }

  const waiting = await trx
    .selectFrom('runs')
    .select('id')
    .where('account_id', '=', account.id)
    .where('contact_id', '=', contact.id)
    .where('status', '=', 'waiting')
    .orderBy('started_at')
    .forUpdate()
    .execute();
  let resumed = false;
  for (const { id } of waiting) {
    const loaded = await loadRun(trx, id);
    if (
      loaded !== undefined &&
      (await resumeWaitingRun(deps, trx, loaded, [{ eventId: inserted.id, event }]))
    ) {
      resumed = true;
    }
  }
  if (resumed) {
    return 'accepted';
  }
  const context: RunContext = {
    conversationId: conversationId(event.conversationId),
    lastInboundAt: event.createdAt,
    captured: {},
    replied: false,
  };
  for (const automation of selectForMessage(event, await liveAutomations(trx, account.id))) {
    await startRun(trx, {
      automation,
      accountId: account.id,
      contactId: contact.id,
      triggerEventId: inserted.id,
      context,
      startedFrom: 'message',
      now,
    });
  }
  return 'accepted';
};

export const ingestEvents = async (deps: Deps, events: InboundEvent[]): Promise<IngestResponse> => {
  const response: IngestResponse = { accepted: 0, duplicates: 0 };
  for (const event of events) {
    const outcome = await deps.db.transaction().execute((trx) => processEvent(deps, trx, event));
    if (outcome === 'duplicate') {
      response.duplicates += 1;
    } else {
      response.accepted += 1;
    }
  }
  return response;
};
