import type { IngestResponse, InboundEvent } from '@comment-automations/gateway-contract';
import { commentId, conversationId, postId } from '@comment-automations/shared';
import type { Transaction } from 'kysely';
import type { Database, RunContext } from '../db/types.js';
import { json } from '../db/types.js';
import type { Deps } from '../executor/send.js';
import { selectForComment, selectForMessage } from '../runs/match.js';
import { resumeWaitingRun } from '../runs/resume.js';
import { liveAutomations, startRun } from '../runs/start.js';
import { loadRun } from '../runs/store.js';

type Outcome = 'accepted' | 'duplicate';

const withoutNul = <T>(value: T): T => {
  if (typeof value === 'string') {
    return value.replaceAll('\u0000', '') as T;
  }
  if (Array.isArray(value)) {
    return value.map(withoutNul) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withoutNul(entry)]),
    ) as T;
  }
  return value;
};

const processEvent = async (
  deps: Deps,
  trx: Transaction<Database>,
  received: InboundEvent,
): Promise<Outcome> => {
  const now = deps.clock.now();
  const event = withoutNul(received);
  const inserted = await trx
    .insertInto('events')
    .values({
      platform: event.platform,
      account_id: event.accountId,
      external_event_id: event.eventId,
      kind: event.kind,
      payload: json(event),
      received_at: now,
    })
    .onConflict((conflict) => conflict.columns(['platform', 'external_event_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted === undefined) {
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
    if (loaded !== undefined && (await resumeWaitingRun(deps, trx, loaded, event))) {
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
