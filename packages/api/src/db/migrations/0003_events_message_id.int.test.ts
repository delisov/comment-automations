import type { EventId } from '@comment-automations/shared';
import { sql } from 'kysely';
import { afterAll, expect, it } from 'vitest';
import { START, message, withDatabase } from '../../testing/harness.js';
import { SCHEMA, createDb } from '../client.js';
import { migrateTo, migrateToLatest } from '../migrate.js';
import { json } from '../types.js';

const MINUTE = 60 * 1000;

const MESSAGE_ID = 'msg_93aed3be';

const indexNames = async (db: ReturnType<typeof createDb>): Promise<{ indexname: string }[]> =>
  (
    await sql<{ indexname: string }>`
      select indexname from pg_indexes
      where schemaname = ${SCHEMA} and tablename = 'events' and indexname = 'events_one_per_message_idx'
    `.execute(db)
  ).rows;

withDatabase('migration 0003 on a database that already holds duplicate message events', () => {
  const db = createDb(process.env.DATABASE_URL ?? '');

  afterAll(async () => {
    await db.destroy();
  });

  const storeMessageEvent = async (ordinal: number): Promise<EventId> => {
    const externalEventId = `evt_dup_${ordinal}`;
    const { id } = await db
      .insertInto('events')
      .values({
        platform: 'whatsapp',
        account_id: 'wa_acc',
        external_event_id: externalEventId,
        kind: 'message',
        payload: json(
          message({
            platform: 'whatsapp',
            accountId: 'wa_acc',
            eventId: externalEventId,
            messageId: MESSAGE_ID,
          }),
        ),
        received_at: new Date(START.getTime() + ordinal * MINUTE),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return id;
  };

  it('keeps the earliest event and a later run trigger, deletes the other duplicate, and creates the index', async () => {
    await db.schema.dropSchema(SCHEMA).ifExists().cascade().execute();
    await migrateTo(db, '0002_runs_comment_id');

    const { id: accountId } = await db
      .insertInto('accounts')
      .values({
        platform: 'whatsapp',
        external_id: 'wa_acc',
        handle: 'shop',
        display_name: 'shop',
        status: 'connected',
        synced_at: START,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: automationId } = await db
      .insertInto('automations')
      .values({
        account_id: accountId,
        name: 'Pricing guide',
        state: 'live',
        active_version_id: null,
        draft: null,
        created_at: START,
        updated_at: START,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: versionId } = await db
      .insertInto('automation_versions')
      .values({
        automation_id: automationId,
        number: 1,
        definition: json({
          trigger: {
            comments: { posts: { kind: 'any' }, keywords: [] },
            onRepeatWhileWaiting: 'ignore',
          },
          steps: [{ kind: 'send_message', text: 'Hi', buttons: [] }],
        }),
        note: 'first',
        published_at: START,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: contactId } = await db
      .insertInto('contacts')
      .values({
        platform: 'whatsapp',
        account_id: accountId,
        external_id: 'u_jane',
        handle: 'jane',
        email: null,
        updated_at: START,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const earliest = await storeMessageEvent(0);
    const laterTrigger = await storeMessageEvent(1);
    const laterUnreferenced = await storeMessageEvent(2);

    const { id: runId } = await db
      .insertInto('runs')
      .values({
        automation_id: automationId,
        version_id: versionId,
        account_id: accountId,
        contact_id: contactId,
        trigger_event_id: laterTrigger,
        comment_id: null,
        status: 'completed',
        step_index: 1,
        context: json({ captured: {}, replied: false }),
        wait_until: null,
        reminder_at: null,
        error: null,
        started_at: START,
        finished_at: START,
        updated_at: START,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await migrateToLatest(db);

    const events = await db
      .selectFrom('events')
      .select(['id', 'message_id'])
      .orderBy('received_at')
      .execute();
    expect(events).toEqual([
      { id: earliest, message_id: MESSAGE_ID },
      { id: laterTrigger, message_id: null },
    ]);
    expect(events.map((event) => event.id)).not.toContain(laterUnreferenced);

    const runs = await db.selectFrom('runs').select(['id', 'trigger_event_id']).execute();
    expect(runs).toEqual([{ id: runId, trigger_event_id: laterTrigger }]);

    expect(await indexNames(db)).toEqual([{ indexname: 'events_one_per_message_idx' }]);
  });

  it('migrates a fresh database to latest and stays there on a second run', async () => {
    await db.schema.dropSchema(SCHEMA).ifExists().cascade().execute();
    await migrateToLatest(db);
    await migrateToLatest(db);

    expect(await indexNames(db)).toEqual([{ indexname: 'events_one_per_message_idx' }]);
    expect(await db.selectFrom('events').select('id').execute()).toEqual([]);
  });
});
