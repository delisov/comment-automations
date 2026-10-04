import type { Definition } from '@comment-automations/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { json } from './db/types.js';
import type { Harness } from './testing/harness.js';
import { START, comment, createHarness, message, withDatabase } from './testing/harness.js';

const HOUR = 60 * 60 * 1000;

const DAY = 24 * HOUR;

const instagramFlow: Definition = {
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [
    { kind: 'reply_to_comment', text: 'Sent you a DM, {{contact.handle}}!' },
    { kind: 'send_message', text: 'Hi {{contact.handle}}, what is your email?', buttons: [] },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      nudge: { text: 'I could not spot an email address, could you send it again?', then: 'wait' },
    },
    {
      kind: 'send_message',
      text: 'Here is the link, sent to {{email}}.',
      buttons: [{ title: 'Open the guide', url: 'https://example.com/guide' }],
    },
    {
      kind: 'call_webhook',
      method: 'POST',
      url: 'https://crm.example.com/hooks/leads',
      headers: { Authorization: 'Bearer token' },
    },
  ],
};

const messageThenWait = (nudgeThen: 'wait' | 'end'): Definition => ({
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [
    { kind: 'send_message', text: 'What is your email?', buttons: [] },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      nudge: { text: 'Could you send the email once more?', then: nudgeThen },
    },
  ],
});

withDatabase('the engine on a real database', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it('runs the full Instagram flow: comment, public reply, private reply, email, link, webhook', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, instagramFlow);

    expect(await h.ingest([comment()])).toEqual({ accepted: 1, duplicates: 0 });
    await h.drain();
    const [waiting] = await h.runsOf(automationId);
    expect(waiting?.status).toBe('waiting');

    h.clock.advance(HOUR);
    const repliedAt = h.clock.now().toISOString();
    expect(await h.ingest([message({ createdAt: repliedAt })])).toEqual({
      accepted: 1,
      duplicates: 0,
    });
    await h.drain();

    const runs = await h.runsOf(automationId);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.status).toBe('completed');
    expect(run.context).toEqual({
      commentId: 'c_1',
      postId: 'p_1',
      conversationId: 'conv_c_1',
      lastInboundAt: repliedAt,
      captured: { email: 'jane@example.com' },
      replied: true,
    });
    expect(run.timeline.map((entry) => [entry.stepIndex, entry.level, entry.message])).toEqual([
      [null, 'info', 'Started from a comment'],
      [0, 'info', 'Replied to the comment'],
      [1, 'info', 'Sent the message asking for a reply'],
      [2, 'info', 'Waiting for a reply · gives up at 2026-10-07T10:00:00.000Z'],
      [2, 'info', 'Reply received with an email'],
      [3, 'info', 'Sent the message'],
      [4, 'info', 'Webhook delivered (200)'],
      [null, 'info', 'Completed'],
    ]);
    expect(h.gateway.calls).toEqual([
      {
        operation: 'replyToComment',
        request: {
          accountId: 'ig_acc',
          commentId: 'c_1',
          text: 'Sent you a DM, jane!',
          visibility: 'public',
          idempotencyKey: `${run.id}:0:reply`,
        },
      },
      {
        operation: 'replyToComment',
        request: {
          accountId: 'ig_acc',
          commentId: 'c_1',
          text: 'Hi jane, what is your email?',
          visibility: 'private',
          idempotencyKey: `${run.id}:1:message`,
        },
      },
      {
        operation: 'sendMessage',
        request: {
          accountId: 'ig_acc',
          recipient: { conversationId: 'conv_c_1' },
          text: 'Here is the link, sent to jane@example.com.',
          buttons: [{ title: 'Open the guide', url: 'https://example.com/guide' }],
          idempotencyKey: `${run.id}:3:message`,
        },
      },
    ]);
    expect(h.webhookCalls).toEqual([
      {
        url: 'https://crm.example.com/hooks/leads',
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer token' },
        body: {
          automation: { id: automationId, name: 'Pricing guide' },
          version: { id: expect.any(String), number: 1 },
          run: { id: run.id, startedAt: START.toISOString() },
          contact: {
            id: expect.any(String),
            handle: 'jane',
            externalId: 'u_jane',
            email: 'jane@example.com',
          },
          captured: { email: 'jane@example.com' },
        },
      },
    ]);
    const outbound = await h.db
      .selectFrom('outbound_calls')
      .select(['idempotency_key', 'kind', 'status'])
      .orderBy('at')
      .orderBy('idempotency_key')
      .execute();
    expect(outbound).toEqual([
      { idempotency_key: `${run.id}:0:reply`, kind: 'reply', status: 'ok' },
      { idempotency_key: `${run.id}:1:message`, kind: 'reply', status: 'ok' },
      { idempotency_key: `${run.id}:3:message`, kind: 'message', status: 'ok' },
      { idempotency_key: `${run.id}:4:webhook`, kind: 'webhook', status: 'ok' },
    ]);
    const contact = await h.db.selectFrom('contacts').select('email').executeTakeFirstOrThrow();
    expect(contact).toEqual({ email: 'jane@example.com' });
  });

  it('counts a redelivered event as a duplicate and starts one run', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, instagramFlow);

    expect(await h.ingest([comment(), comment()])).toEqual({ accepted: 1, duplicates: 1 });
    expect(await h.ingest([comment()])).toEqual({ accepted: 0, duplicates: 1 });
    await h.drain();

    const runs = await h.runsOf(automationId);
    expect(runs.map((run) => run.status)).toEqual(['waiting']);
    expect(h.gateway.calls).toHaveLength(2);
  });

  it('supersedes the waiting run when the same contact comments again', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, instagramFlow);

    await h.ingest([comment()]);
    await h.drain();
    h.clock.advance(HOUR);
    await h.ingest([
      comment({ eventId: 'evt_comment_2', commentId: 'c_2', text: 'pricing again?' }),
    ]);
    await h.drain();

    const runs = await h.runsOf(automationId);
    expect(runs.map((run) => [run.status, run.contactHandle])).toEqual([
      ['superseded', 'jane'],
      ['waiting', 'jane'],
    ]);
    expect(runs[0]!.timeline.at(-1)).toEqual({
      stepIndex: 2,
      level: 'info',
      message: 'Stopped: a newer run took over this conversation',
      context: {},
      at: h.clock.now().toISOString(),
    });
    expect(h.gateway.calls.map((call) => call.operation)).toEqual([
      'replyToComment',
      'replyToComment',
      'replyToComment',
      'replyToComment',
    ]);
  });

  it('ignores a repeat comment while waiting when the trigger says so', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, {
      ...instagramFlow,
      trigger: { ...instagramFlow.trigger, onRepeatWhileWaiting: 'ignore' },
    });

    await h.ingest([comment()]);
    await h.drain();
    await h.ingest([comment({ eventId: 'evt_comment_2', commentId: 'c_2' })]);
    await h.drain();

    expect((await h.runsOf(automationId)).map((run) => run.status)).toEqual(['waiting']);
  });

  it('fails an 8-day-old comment on the private reply without calling the gateway', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, messageThenWait('wait'));

    await h.ingest([comment({ createdAt: new Date(START.getTime() - 8 * DAY).toISOString() })]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('failed');
    expect(run?.error).toEqual({
      code: 'REPLY_WINDOW_CLOSED',
      message: "Couldn't send: the 7-day private-reply window closed before this step ran",
    });
    expect(run?.timeline.map((entry) => [entry.level, entry.message])).toEqual([
      ['info', 'Started from a comment'],
      ['error', "Couldn't send: the 7-day private-reply window closed before this step ran"],
    ]);
    expect(h.gateway.calls).toEqual([]);
  });

  it('treats the gateway refusing a closed window as the same failure', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, messageThenWait('wait'));
    h.gateway.answer('replyToComment', {
      ok: false,
      error: { code: 'REPLY_WINDOW_CLOSED', message: 'closed', retryable: false },
    });

    await h.ingest([comment()]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect([run?.status, run?.error]).toEqual([
      'failed',
      {
        code: 'REPLY_WINDOW_CLOSED',
        message: "Couldn't send: the 7-day private-reply window closed before this step ran",
      },
    ]);
  });

  it('sends no reminder on Instagram and gives up after 72 hours without a reply', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId, versionId } = await h.createLive(account, messageThenWait('wait'));
    const withReminder: Definition = {
      ...messageThenWait('wait'),
      steps: [
        messageThenWait('wait').steps[0]!,
        {
          kind: 'wait_for_reply',
          expect: 'email',
          giveUpHours: 72,
          reminder: { afterHours: 24, text: 'Still there?' },
        },
      ],
    };
    await h.db
      .updateTable('automation_versions')
      .set({ definition: json(withReminder) })
      .where('id', '=', versionId)
      .execute();

    await h.ingest([comment()]);
    await h.drain();
    const jobs = await h.db
      .selectFrom('jobs')
      .select(['kind', 'status'])
      .orderBy('run_at')
      .execute();
    expect(jobs).toEqual([
      { kind: 'advance', status: 'done' },
      { kind: 'give_up', status: 'pending' },
    ]);

    h.clock.advance(25 * HOUR);
    expect(await h.tick()).toBe(0);
    expect((await h.runsOf(automationId))[0]?.status).toBe('waiting');

    h.clock.advance(47 * HOUR);
    expect(await h.tick()).toBe(1);
    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('expired');
    expect(run?.finishedAt).toBe(h.clock.now().toISOString());
    expect(run?.timeline.at(-1)?.message).toBe('Gave up waiting for a reply');
    expect(h.gateway.calls.map((call) => call.operation)).toEqual(['replyToComment']);
  });

  it('sends the reminder where the platform allows one before the reply', async () => {
    const account = await h.seedAccount('bluesky', 'bsky_acc');
    const { automationId } = await h.createLive(account, {
      trigger: {
        comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
        onRepeatWhileWaiting: 'supersede',
      },
      steps: [
        { kind: 'send_message', text: 'What is your email?', buttons: [], onUnreachable: 'fail' },
        {
          kind: 'wait_for_reply',
          expect: 'email',
          giveUpHours: 72,
          reminder: { afterHours: 24, text: 'Still there, {{contact.handle}}?' },
        },
      ],
    });

    await h.ingest([comment({ platform: 'bluesky', accountId: 'bsky_acc' })]);
    await h.drain();
    h.clock.advance(24 * HOUR);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('waiting');
    expect(run?.timeline.at(-1)?.message).toBe('Reminder sent');
    expect(h.gateway.calls.map((call) => call.request)).toEqual([
      {
        accountId: 'bsky_acc',
        recipient: { userId: 'u_jane' },
        text: 'What is your email?',
        idempotencyKey: `${run!.id}:0:message`,
      },
      {
        accountId: 'bsky_acc',
        recipient: { conversationId: 'conv_u_jane' },
        text: 'Still there, jane?',
        idempotencyKey: `${run!.id}:1:reminder`,
      },
    ]);
  });

  it('replies publicly instead when a Bluesky contact is unreachable', async () => {
    const account = await h.seedAccount('bluesky', 'bsky_acc');
    const { automationId } = await h.createLive(account, {
      trigger: {
        comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
        onRepeatWhileWaiting: 'supersede',
      },
      steps: [
        {
          kind: 'send_message',
          text: 'Here is the pricing guide',
          buttons: [],
          onUnreachable: 'publicReplyInstead',
          fallbackText: 'Your DMs are closed, {{contact.handle}}; find the guide in our bio.',
        },
      ],
    });
    h.gateway.answer('sendMessage', {
      ok: false,
      error: { code: 'RECIPIENT_UNREACHABLE', message: 'closed DMs', retryable: false },
    });

    await h.ingest([comment({ platform: 'bluesky', accountId: 'bsky_acc' })]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('completed');
    expect(run?.timeline.map((entry) => entry.message)).toEqual([
      'Started from a comment',
      "Replied publicly instead: the contact doesn't accept messages from this account",
      'Completed',
    ]);
    expect(h.gateway.calls).toEqual([
      {
        operation: 'sendMessage',
        request: {
          accountId: 'bsky_acc',
          recipient: { userId: 'u_jane' },
          text: 'Here is the pricing guide',
          idempotencyKey: `${run!.id}:0:message`,
        },
      },
      {
        operation: 'replyToComment',
        request: {
          accountId: 'bsky_acc',
          commentId: 'c_1',
          text: 'Your DMs are closed, jane; find the guide in our bio.',
          visibility: 'public',
          idempotencyKey: `${run!.id}:0:fallback`,
        },
      },
    ]);
  });

  it('skips or fails an unreachable contact as the step says', async () => {
    const account = await h.seedAccount('bluesky', 'bsky_acc');
    const unreachable = () =>
      h.gateway.answer('sendMessage', {
        ok: false,
        error: { code: 'RECIPIENT_UNREACHABLE', message: 'closed DMs', retryable: false },
      });
    const definition = (onUnreachable: 'skip' | 'fail'): Definition => ({
      trigger: {
        comments: { posts: { kind: 'any' }, keywords: [onUnreachable] },
        onRepeatWhileWaiting: 'supersede',
      },
      steps: [{ kind: 'send_message', text: 'Guide', buttons: [], onUnreachable }],
    });
    const skip = await h.createLive(account, definition('skip'), 'skip');
    const fail = await h.createLive(account, definition('fail'), 'fail');

    unreachable();
    await h.ingest([comment({ platform: 'bluesky', accountId: 'bsky_acc', text: 'skip' })]);
    await h.drain();
    unreachable();
    await h.ingest([
      comment({
        platform: 'bluesky',
        accountId: 'bsky_acc',
        text: 'fail',
        eventId: 'evt_2',
        commentId: 'c_2',
      }),
    ]);
    await h.drain();

    const [skipped] = await h.runsOf(skip.automationId);
    const [failed] = await h.runsOf(fail.automationId);
    expect([skipped?.status, skipped?.timeline[1]?.message]).toEqual([
      'completed',
      "Skipped the message: the contact doesn't accept messages from this account",
    ]);
    expect([failed?.status, failed?.error]).toEqual([
      'failed',
      {
        code: 'RECIPIENT_UNREACHABLE',
        message: "Couldn't send: the contact doesn't accept messages from this account",
      },
    ]);
  });

  it('asks once more after a reply without an email, then ends on the second one', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, messageThenWait('end'));

    await h.ingest([comment()]);
    await h.drain();
    h.clock.advance(HOUR);
    await h.ingest([message({ text: 'what do you need it for?' })]);
    await h.drain();
    const [nudged] = await h.runsOf(automationId);
    expect([nudged?.status, nudged?.timeline.at(-1)?.message]).toEqual([
      'waiting',
      'Asked once more',
    ]);

    h.clock.advance(HOUR);
    await h.ingest([message({ eventId: 'evt_message_2', messageId: 'm_2', text: 'no thanks' })]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('expired');
    expect(run?.timeline.map((entry) => entry.message)).toEqual([
      'Started from a comment',
      'Sent the message asking for a reply',
      'Waiting for a reply · gives up at 2026-10-07T10:00:00.000Z',
      'Asked once more',
      'Reply received without an email · stopped',
    ]);
    expect(h.gateway.calls.map((call) => call.request)).toEqual([
      {
        accountId: 'ig_acc',
        commentId: 'c_1',
        text: 'What is your email?',
        visibility: 'private',
        idempotencyKey: `${run!.id}:0:message`,
      },
      {
        accountId: 'ig_acc',
        recipient: { conversationId: 'conv_c_1' },
        text: 'Could you send the email once more?',
        idempotencyKey: `${run!.id}:1:nudge`,
      },
    ]);
    expect(run?.context.replied).toBe(true);
    expect(run?.context.captured).toEqual({});
  });

  it('keeps waiting after the nudge when the step says so', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, messageThenWait('wait'));

    await h.ingest([comment()]);
    await h.drain();
    await h.ingest([message({ text: 'why?' })]);
    await h.ingest([message({ eventId: 'evt_message_2', messageId: 'm_2', text: 'still why?' })]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect([run?.status, run?.timeline.at(-1)?.message]).toEqual([
      'waiting',
      'Reply received without an email · still waiting',
    ]);
    expect(h.gateway.calls).toHaveLength(2);
  });

  it('ignores comments and messages written by the account itself', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, {
      ...instagramFlow,
      trigger: { ...instagramFlow.trigger, messages: { keywords: ['pricing'] } },
    });

    expect(
      await h.ingest([
        comment({ authorId: 'ig_acc', authorHandle: 'me' }),
        message({ eventId: 'evt_own', senderId: 'ig_acc', senderHandle: 'me', text: 'pricing' }),
      ]),
    ).toEqual({ accepted: 2, duplicates: 0 });
    await h.drain();

    expect(await h.runsOf(automationId)).toEqual([]);
    expect(await h.db.selectFrom('contacts').selectAll().execute()).toEqual([]);
    expect(h.gateway.calls).toEqual([]);
  });

  it('skips reply steps on a run that started from a message', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, {
      trigger: {
        comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
        messages: { keywords: ['pricing'] },
        onRepeatWhileWaiting: 'supersede',
      },
      steps: [
        { kind: 'reply_to_comment', text: 'Sent you a DM!' },
        { kind: 'send_message', text: 'Here is the pricing, {{contact.handle}}', buttons: [] },
      ],
    });

    await h.ingest([message({ text: 'pricing please' })]);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect(run?.status).toBe('completed');
    expect(run?.timeline.map((entry) => [entry.stepIndex, entry.message])).toEqual([
      [null, 'Started from a message'],
      [0, 'Skipped: this run started from a message, not a comment'],
      [1, 'Sent the message'],
      [null, 'Completed'],
    ]);
    expect(h.gateway.calls).toEqual([
      {
        operation: 'sendMessage',
        request: {
          accountId: 'ig_acc',
          recipient: { conversationId: 'conv_c_1' },
          text: 'Here is the pricing, jane',
          idempotencyKey: `${run!.id}:1:message`,
        },
      },
    ]);
  });

  it('retries a rate-limited call with backoff and gives up after four retries', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, instagramFlow);
    const rateLimited = () =>
      h.gateway.answer('replyToComment', {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'slow down', retryable: true },
      });

    rateLimited();
    await h.ingest([comment()]);
    expect(await h.tick()).toBe(1);
    const [running] = await h.runsOf(automationId);
    expect([running?.status, running?.timeline.at(-1)?.message]).toEqual([
      'running',
      'The platform rate-limited this account · retrying in 1 s',
    ]);
    expect(await h.tick()).toBe(0);

    h.clock.advance(1_000);
    expect(await h.tick()).toBe(1);
    const [waiting] = await h.runsOf(automationId);
    expect(waiting?.status).toBe('waiting');
    expect(h.gateway.calls.map((call) => call.operation)).toEqual([
      'replyToComment',
      'replyToComment',
      'replyToComment',
    ]);

    await h.reset();
    const again = await h.seedAccount('instagram', 'ig_acc');
    const second = await h.createLive(again, instagramFlow);
    for (let i = 0; i < 5; i += 1) {
      rateLimited();
    }
    await h.ingest([comment()]);
    for (const wait of [0, 1_000, 5_000, 25_000, 120_000]) {
      h.clock.advance(wait);
      expect(await h.tick()).toBe(1);
    }
    const [failed] = await h.runsOf(second.automationId);
    expect([failed?.status, failed?.error]).toEqual([
      'failed',
      { code: 'RATE_LIMITED', message: 'The platform rate-limited this account' },
    ]);
    expect(h.gateway.calls).toHaveLength(5);
  });

  it('expects a 24-hour window before messaging a conversation again', async () => {
    const account = await h.seedAccount('instagram', 'ig_acc');
    const { automationId } = await h.createLive(account, {
      ...instagramFlow,
      steps: [
        instagramFlow.steps[1]!,
        { kind: 'wait_for_reply', expect: 'any', giveUpHours: 96 },
        { kind: 'send_message', text: 'Late follow-up', buttons: [] },
      ],
    });

    await h.ingest([comment()]);
    await h.drain();
    h.clock.advance(HOUR);
    await h.ingest([message({ text: 'hi', createdAt: h.clock.now().toISOString() })]);
    h.clock.advance(25 * HOUR);
    await h.drain();

    const [run] = await h.runsOf(automationId);
    expect([run?.status, run?.error]).toEqual([
      'failed',
      {
        code: 'MESSAGING_WINDOW_CLOSED',
        message: "Couldn't send: the 24-hour messaging window closed before this step ran",
      },
    ]);
    expect(h.gateway.calls).toHaveLength(1);
  });
});
