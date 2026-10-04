import type { Definition } from '@comment-automations/shared';
import type { Cycle } from './runner.js';
import {
  GUIDE_URL,
  PRICING_URL,
  blueskyPublicFallback,
  blueskyReminder,
  instagramAskForEmail,
  instagramFullFlow,
  instagramReplyOnKeyword,
  instagramReplyOnly,
  tiktokElevenMessages,
  whatsappPricing,
  youtubeReplyOnly,
} from './definitions.js';
import { expectEqual, expectNear, waitFor } from './stack.js';
import type { World } from './world.js';
import {
  DAY,
  HOUR,
  conversationMessages,
  gatewayCalls,
  repliesInThread,
  seeded,
  timelineOf,
} from './world.js';

const COMMENT = 'What is the pricing?';

const PRIVATE_REPLY_CLOSED =
  "Couldn't send: the 7-day private-reply window closed before this step ran";

const RATE_LIMITED = 'The platform rate-limited this account';

const GIVES_UP_PREFIX = 'Waiting for a reply · gives up at ';

const NEAR_MS = 2000;

const givesUpAt = (world: World): string =>
  new Date(world.clock.now().getTime() + 72 * HOUR).toISOString();

type WebhookBody = {
  automation: { name: string };
  version: { number: number };
  contact: { handle: string; externalId: string; email: string | null };
  captured: { email?: string };
};

const A1: Cycle = {
  id: 'A1',
  title: 'instagram full flow',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    const expectedGivesUpAt = givesUpAt(world);
    await world.stand.message({
      accountId: ig.account,
      userId: ig.jane,
      text: 'sure, jane@example.com',
    });
    const run = await world.waitForRun(automationId, 'completed');

    const timeline = timelineOf(run);
    const waitingLine = timeline[3]?.[1] ?? '';
    expectNear(
      'gives up at',
      waitingLine.startsWith(GIVES_UP_PREFIX)
        ? waitingLine.slice(GIVES_UP_PREFIX.length)
        : waitingLine,
      expectedGivesUpAt,
      NEAR_MS,
    );

    expectEqual('run timeline', timeline, [
      ['info', 'Started from a comment'],
      ['info', 'Replied to the comment'],
      ['info', 'Sent the message asking for a reply'],
      ['info', waitingLine],
      ['info', 'Reply received with an email'],
      ['info', 'Sent the message'],
      ['info', 'Webhook delivered (200)'],
      ['info', 'Completed'],
    ]);
    expectEqual('captured values', run.context.captured, { email: 'jane@example.com' });
    const state = await world.stand.state('instagram');
    expectEqual('public replies in the thread', repliesInThread(state, ig.post), [
      'Sent you a DM, @jane.doe!',
    ]);
    expectEqual('conversation', conversationMessages(state), [
      ['account', 'Hi @jane.doe, what is your email?'],
      ['user', 'sure, jane@example.com'],
      ['account', 'Here is the link, sent to jane@example.com.'],
    ]);
    expectEqual('link buttons', state.conversations[0]?.messages[2]?.buttons, [
      { title: 'Open the guide', url: GUIDE_URL },
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'reply:public:OK',
      'reply:private:OK',
      'message:OK',
    ]);
    expectEqual(
      'webhook deliveries',
      world.webhook.calls.map((call) => {
        const body = call.body as WebhookBody;
        return {
          method: call.method,
          path: call.path,
          authorization: call.authorization,
          automation: body.automation.name,
          version: body.version.number,
          contact: {
            handle: body.contact.handle,
            externalId: body.contact.externalId,
            email: body.contact.email,
          },
          captured: body.captured,
        };
      }),
      [
        {
          method: 'POST',
          path: '/hooks/leads',
          authorization: 'Bearer token',
          automation: 'Pricing guide',
          version: 1,
          contact: { handle: '@jane.doe', externalId: ig.jane, email: 'jane@example.com' },
          captured: { email: 'jane@example.com' },
        },
      ],
    );
  },
};

const A2: Cycle = {
  id: 'A2',
  title: 'duplicate delivery starts one run and one reply',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    await world.stand.settings({ duplicatePercent: 100 });
    const comment = await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await waitFor('both copies of the comment to be delivered', async () => {
      const attempts = (await world.stand.deliveries()).filter(
        (delivery) => delivery.event_id === `evt_${comment.id}` && delivery.status === 'delivered',
      );
      return attempts.length === 2 ? attempts : undefined;
    });
    await world.waitForRun(automationId, 'waiting');

    expectEqual(
      'delivery marks for the comment',
      (await world.stand.eventLog())
        .filter(
          (entry) => entry.direction === 'to_service' && entry.payload.commentId === comment.id,
        )
        .map((entry) => entry.result_code),
      ['DUPLICATED'],
    );
    expectEqual(
      'runs',
      (await world.api.runs(automationId)).map((run) => run.status),
      ['waiting'],
    );
    const state = await world.stand.state('instagram');
    expectEqual('public replies in the thread', repliesInThread(state, ig.post), [
      'Sent you a DM, @jane.doe!',
    ]);
    expectEqual('conversation', conversationMessages(state), [
      ['account', 'Hi @jane.doe, what is your email?'],
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'reply:public:OK',
      'reply:private:OK',
    ]);
  },
};

const A3: Cycle = {
  id: 'A3',
  title: 'same user comments twice while waiting supersedes the first run',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    await world.clock.advance(HOUR);
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: 'pricing again?' });
    await world.waitForRun(automationId, 'waiting', 1);

    const runs = await world.api.runs(automationId);
    expectEqual(
      'runs in start order',
      runs.map((run) => [run.status, run.contactHandle]),
      [
        ['superseded', '@jane.doe'],
        ['waiting', '@jane.doe'],
      ],
    );
    const first = await world.api.run(runs[0]!.id);
    expectEqual('end of the first run', timelineOf(first).at(-1), [
      'info',
      'Stopped: a newer run took over this conversation',
    ]);
    const state = await world.stand.state('instagram');
    expectEqual('public replies in the thread', repliesInThread(state, ig.post), [
      'Sent you a DM, @jane.doe!',
      'Sent you a DM, @jane.doe!',
    ]);
    expectEqual('one conversation continues', conversationMessages(state), [
      ['account', 'Hi @jane.doe, what is your email?'],
      ['account', 'Hi @jane.doe, what is your email?'],
    ]);
    expectEqual('conversations', state.conversations.length, 1);
  },
};

const A4: Cycle = {
  id: 'A4',
  title: 'comment 8 days old fails the private reply without a message',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramAskForEmail,
    );
    await world.stand.settings({ delayMs: 5_000 });
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.clock.advance(8 * DAY);
    await world.stand.settings({ delayMs: 0 });
    const run = await world.waitForRun(automationId, 'failed');

    expectEqual('run error', run.error, {
      code: 'REPLY_WINDOW_CLOSED',
      message: PRIVATE_REPLY_CLOSED,
    });
    expectEqual('run timeline', timelineOf(run), [
      ['info', 'Started from a comment'],
      ['error', PRIVATE_REPLY_CLOSED],
    ]);
    const state = await world.stand.state('instagram');
    expectEqual('conversations', conversationMessages(state), []);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), []);
  },
};

const A5: Cycle = {
  id: 'A5',
  title: 'no reply for 72 h expires the run',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramAskForEmail,
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    await world.clock.advance(73 * HOUR);
    const run = await world.waitForRun(automationId, 'expired');

    expectEqual('end of the run', timelineOf(run).at(-1), ['info', 'Gave up waiting for a reply']);
    expectNear('finished at', String(run.finishedAt), world.clock.now().toISOString(), NEAR_MS);
    const state = await world.stand.state('instagram');
    expectEqual('conversation', conversationMessages(state), [['account', 'What is your email?']]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), ['reply:private:OK']);
  },
};

const A6: Cycle = {
  id: 'A6',
  title: 'reply without an email is nudged once',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramAskForEmail,
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    await world.stand.message({
      accountId: ig.account,
      userId: ig.jane,
      text: 'what do you need it for?',
    });
    await world.waitForTimeline(automationId, 'Asked once more');
    await world.stand.message({ accountId: ig.account, userId: ig.jane, text: 'still why?' });
    const run = await world.waitForTimeline(
      automationId,
      'Reply received without an email · still waiting',
    );

    expectEqual('run status', run.status, 'waiting');
    expectEqual(
      'nudges in the timeline',
      run.timeline.filter((entry) => entry.message === 'Asked once more').length,
      1,
    );
    const state = await world.stand.state('instagram');
    expectEqual('conversation', conversationMessages(state), [
      ['account', 'What is your email?'],
      ['user', 'what do you need it for?'],
      ['account', 'Could you send the email once more?'],
      ['user', 'still why?'],
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'reply:private:OK',
      'message:OK',
    ]);
  },
};

const A7: Cycle = {
  id: 'A7',
  title: 'reminder on bluesky after the configured hours',
  run: async (world) => {
    const bsky = seeded('bluesky');
    const account = await world.account('bluesky');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      blueskyReminder,
    );
    await world.stand.comment({ postId: bsky.post, userId: bsky.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    await world.clock.advance(24 * HOUR);
    const run = await world.waitForTimeline(automationId, 'Reminder sent');

    expectEqual('run status', run.status, 'waiting');
    expectEqual('end of the timeline', timelineOf(run).at(-1), ['info', 'Reminder sent']);
    const state = await world.stand.state('bluesky');
    expectEqual('conversation', conversationMessages(state), [
      ['account', 'What is your email?'],
      ['account', 'Still there, @jane.doe?'],
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'message:OK',
      'message:OK',
    ]);
  },
};

const B1: Cycle = {
  id: 'B1',
  title: 'bluesky user with closed DMs gets the public reply instead',
  run: async (world) => {
    const bsky = seeded('bluesky');
    const account = await world.account('bluesky');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      blueskyPublicFallback,
    );
    await world.stand.comment({ postId: bsky.post, userId: bsky.sam, text: COMMENT });
    const run = await world.waitForRun(automationId, 'completed');

    expectEqual('run timeline', timelineOf(run), [
      ['info', 'Started from a comment'],
      ['info', "Replied publicly instead: the contact doesn't accept messages from this account"],
      ['info', 'Completed'],
    ]);
    const state = await world.stand.state('bluesky');
    expectEqual('public replies in the thread', repliesInThread(state, bsky.post), [
      'Your DMs are closed, @spammy_sam; find the guide in our bio.',
    ]);
    expectEqual('conversations', conversationMessages(state), []);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'message:RECIPIENT_UNREACHABLE',
      'reply:public:OK',
    ]);
  },
};

const C1: Cycle = {
  id: 'C1',
  title: 'youtube reply-only flow',
  run: async (world) => {
    const yt = seeded('youtube');
    const account = await world.account('youtube');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      youtubeReplyOnly,
    );
    await world.stand.comment({ postId: yt.post, userId: yt.jane, text: COMMENT });
    const run = await world.waitForRun(automationId, 'completed');

    expectEqual('run timeline', timelineOf(run), [
      ['info', 'Started from a comment'],
      ['info', 'Replied to the comment'],
      ['info', 'Completed'],
    ]);
    const state = await world.stand.state('youtube');
    expectEqual('public replies in the thread', repliesInThread(state, yt.post), [
      'Thanks @jane.doe, the pricing is pinned in the description.',
    ]);
    expectEqual('conversations', conversationMessages(state), []);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), ['reply:public:OK']);
  },
};

const E1: Cycle = {
  id: 'E1',
  title: 'whatsapp message trigger',
  run: async (world) => {
    const wa = seeded('whatsapp');
    const account = await world.account('whatsapp');
    const { automationId } = await world.api.createLive(account.id, 'Pricing', whatsappPricing);
    await world.stand.message({
      accountId: wa.account,
      userId: wa.jane,
      text: 'What is your pricing?',
    });
    const run = await world.waitForRun(automationId, 'completed');

    expectEqual('run timeline', timelineOf(run), [
      ['info', 'Started from a message'],
      ['info', 'Sent the message'],
      ['info', 'Completed'],
    ]);
    const state = await world.stand.state('whatsapp');
    expectEqual('conversation', conversationMessages(state), [
      ['user', 'What is your pricing?'],
      ['account', 'Hi @jane.doe, here is our pricing.'],
    ]);
    expectEqual('button', state.conversations[0]?.messages[1]?.buttons, [
      { title: 'Open pricing', url: PRICING_URL },
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), ['message:OK']);
  },
};

const X1: Cycle = {
  id: 'X1',
  title: 'burst of 429s is retried until the run completes',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramReplyOnly,
    );
    await world.stand.settings({ burst429: 2 });
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForTimeline(automationId, `${RATE_LIMITED} · retrying in 1 s`);
    await world.clock.advance(1_000);
    await world.waitForTimeline(automationId, `${RATE_LIMITED} · retrying in 5 s`);
    await world.clock.advance(5_000);
    const run = await world.waitForRun(automationId, 'completed');

    expectEqual('run timeline', timelineOf(run), [
      ['info', 'Started from a comment'],
      ['warn', `${RATE_LIMITED} · retrying in 1 s`],
      ['warn', `${RATE_LIMITED} · retrying in 5 s`],
      ['info', 'Replied to the comment'],
      ['info', 'Completed'],
    ]);
    const state = await world.stand.state('instagram');
    expectEqual('public replies in the thread', repliesInThread(state, ig.post), [
      'Thanks for asking, @jane.doe!',
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'reply:public:RATE_LIMITED',
      'reply:public:RATE_LIMITED',
      'reply:public:OK',
    ]);
  },
};

const REDELIVERED = 'Ignored a redelivered comment: this run already handles it';

const WEBHOOK_FAILED_500 =
  "Webhook failed (500): check the webhook receiver; the run's data was not delivered";

const EMAIL_REPLY = 'sure, jane@example.com';

const R1: Cycle = {
  id: 'R1',
  title: 'redelivered comment with a new event id does not start a second run',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    const comment = await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    const ingested = await world.api.ingest([
      {
        kind: 'comment',
        platform: 'instagram',
        accountId: ig.account,
        eventId: `evt_${comment.id}_redelivered`,
        commentId: comment.id,
        postId: ig.post,
        authorId: ig.jane,
        authorHandle: '@jane.doe',
        text: COMMENT,
        createdAt: world.clock.now().toISOString(),
      },
    ]);
    const run = await world.waitForTimeline(automationId, REDELIVERED);

    expectEqual('ingest answer', ingested, { accepted: 1, duplicates: 0 });
    expectEqual(
      'runs',
      (await world.api.runs(automationId)).map((candidate) => candidate.status),
      ['waiting'],
    );
    expectEqual('end of the timeline', timelineOf(run).at(-1), ['info', REDELIVERED]);
    const state = await world.stand.state('instagram');
    expectEqual('public replies in the thread', repliesInThread(state, ig.post), [
      'Sent you a DM, @jane.doe!',
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), [
      'reply:public:OK',
      'reply:private:OK',
    ]);
  },
};

const R2: Cycle = {
  id: 'R2',
  title: 'reply that lands before the wait step is picked up when the wait starts',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    await world.stand.settings({ burst429: 1 });
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.stand.message({ accountId: ig.account, userId: ig.jane, text: EMAIL_REPLY });
    await world.waitForTimeline(automationId, `${RATE_LIMITED} · retrying in 1 s`);
    await world.stand.settings({ burst429: 0 });
    await world.clock.advance(30_000);
    const run = await world.waitForRun(automationId, 'completed');

    expectEqual('captured values', run.context.captured, { email: 'jane@example.com' });
    expectEqual(
      'run timeline',
      timelineOf(run).filter(([, message]) => !message.startsWith(GIVES_UP_PREFIX)),
      [
        ['info', 'Started from a comment'],
        ['warn', `${RATE_LIMITED} · retrying in 1 s`],
        ['info', 'Replied to the comment'],
        ['info', 'Sent the message asking for a reply'],
        ['info', 'Reply received with an email'],
        ['info', 'Sent the message'],
        ['info', 'Webhook delivered (200)'],
        ['info', 'Completed'],
      ],
    );
    const state = await world.stand.state('instagram');
    expectEqual('conversation', conversationMessages(state), [
      ['user', EMAIL_REPLY],
      ['account', 'Hi @jane.doe, what is your email?'],
      ['account', 'Here is the link, sent to jane@example.com.'],
    ]);
    expectEqual('webhook deliveries', world.webhook.calls.length, 1);
  },
};

const R3: Cycle = {
  id: 'R3',
  title: 'stopping a waiting run reports it as stopped by the user',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramAskForEmail,
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    const waiting = await world.waitForRun(automationId, 'waiting');
    const stopped = await world.api.stopRun(waiting.id);
    const stoppedAt = world.clock.now().toISOString();
    await world.clock.advance(73 * HOUR);
    const afterGiveUp = await world.api.run(waiting.id);

    expectEqual(
      'stop answer',
      [stopped.status, timelineOf(stopped).at(-1)],
      ['stopped', ['info', 'Stopped by the user']],
    );
    expectNear('finished at', String(stopped.finishedAt), stoppedAt, NEAR_MS);
    expectEqual(
      'run after the give-up time',
      [afterGiveUp.status, timelineOf(afterGiveUp).at(-1)],
      ['stopped', ['info', 'Stopped by the user']],
    );
    expectEqual(
      'runs',
      (await world.api.runs(automationId)).map((candidate) => candidate.status),
      ['stopped'],
    );
  },
};

const R4: Cycle = {
  id: 'R4',
  title: 'archiving the automation stops its waiting run',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramAskForEmail,
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    const waiting = await world.waitForRun(automationId, 'waiting');
    await world.api.archive(automationId);
    const run = await world.api.run(waiting.id);

    expectEqual('automation state', (await world.api.automation(automationId)).state, 'archived');
    expectEqual(
      'run after archiving',
      [run.status, timelineOf(run).at(-1)],
      ['stopped', ['info', 'Stopped because the automation was archived']],
    );
    expectNear('finished at', String(run.finishedAt), world.clock.now().toISOString(), NEAR_MS);
  },
};

const R5: Cycle = {
  id: 'R5',
  title: 'webhook answering 500 fails the run after the retry budget',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    world.webhook.status = 500;
    const { automationId } = await world.api.createLive(
      account.id,
      'Pricing guide',
      instagramFullFlow(world.webhook.url),
    );
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    await world.waitForRun(automationId, 'waiting');
    await world.stand.message({ accountId: ig.account, userId: ig.jane, text: EMAIL_REPLY });
    for (const seconds of [1, 5, 25, 120]) {
      await world.waitForTimeline(automationId, `${WEBHOOK_FAILED_500} · retrying in ${seconds} s`);
      await world.clock.advance(seconds * 1000);
    }
    const run = await world.waitForRun(automationId, 'failed');

    expectEqual('run error', run.error, { code: 'WEBHOOK_FAILED', message: WEBHOOK_FAILED_500 });
    expectEqual('end of the timeline', timelineOf(run).slice(-6), [
      ['info', 'Sent the message'],
      ['warn', `${WEBHOOK_FAILED_500} · retrying in 1 s`],
      ['warn', `${WEBHOOK_FAILED_500} · retrying in 5 s`],
      ['warn', `${WEBHOOK_FAILED_500} · retrying in 25 s`],
      ['warn', `${WEBHOOK_FAILED_500} · retrying in 120 s`],
      ['error', WEBHOOK_FAILED_500],
    ]);
    expectEqual('webhook attempts', world.webhook.calls.length, 5);
  },
};

const R6: Cycle = {
  id: 'R6',
  title: 'reply after the give-up time expires the run instead of completing it',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const shortWait: Definition = {
      ...instagramAskForEmail,
      steps: instagramAskForEmail.steps.map((step) =>
        step.kind === 'wait_for_reply' ? { ...step, giveUpHours: 2 } : step,
      ),
    };
    const { automationId } = await world.api.createLive(account.id, 'Pricing guide', shortWait);
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: COMMENT });
    const waiting = await world.waitForRun(automationId, 'waiting');
    const waitUntil = waiting.timeline.find((entry) => entry.message.startsWith(GIVES_UP_PREFIX))
      ?.context.waitUntil;
    if (typeof waitUntil !== 'string') {
      throw new Error(`the waiting line carries no waitUntil: ${JSON.stringify(waiting.timeline)}`);
    }
    expectNear(
      'wait until',
      waitUntil,
      new Date(world.clock.now().getTime() + 2 * HOUR).toISOString(),
      NEAR_MS,
    );
    await world.clock.set(new Date(Date.parse(waitUntil) + 60_000));
    await world.stand.message({ accountId: ig.account, userId: ig.jane, text: EMAIL_REPLY });
    const run = await world.waitForRun(automationId, 'expired');

    expectEqual('end of the timeline', timelineOf(run).at(-1), [
      'info',
      'Gave up waiting for a reply',
    ]);
    expectEqual('captured values', run.context.captured, {});
    const state = await world.stand.state('instagram');
    expectEqual('conversation', conversationMessages(state), [
      ['account', 'What is your email?'],
      ['user', EMAIL_REPLY],
    ]);
    expectEqual('gateway calls', gatewayCalls(await world.stand.eventLog()), ['reply:private:OK']);
  },
};

const R7: Cycle = {
  id: 'R7',
  title: 'tiktok refuses the eleventh message in a row at publish',
  run: async (world) => {
    const account = await world.account('tiktok');
    const created = await world.api.create(account.id, 'Eleven messages');
    await world.api.saveDraft(created.id, tiktokElevenMessages, true);
    const answer = await world.api.publish(created.id);

    expectEqual('publish answer', answer, {
      status: 422,
      issues: [
        {
          path: 'steps.10.kind',
          code: 'STEP_NOT_ALLOWED_HERE',
          message: 'TikTok allows at most 10 messages in a row before the contact replies',
        },
      ],
    });
    const detail = await world.api.automation(created.id);
    expectEqual('automation after the refusal', [detail.state, detail.versions], ['draft', []]);
  },
};

const R8: Cycle = {
  id: 'R8',
  title: 'keywords match across unicode normalisation forms and variation selectors',
  run: async (world) => {
    const ig = seeded('instagram');
    const account = await world.account('instagram');
    const cafe = await world.api.createLive(
      account.id,
      'Café',
      instagramReplyOnKeyword('café'.normalize('NFC')),
    );
    const heart = await world.api.createLive(account.id, 'Heart', instagramReplyOnKeyword('❤️'));
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: 'CAFÉ'.normalize('NFD') });
    await world.stand.comment({ postId: ig.post, userId: ig.jane, text: '❤' });
    await world.waitForRun(cafe.automationId, 'completed');
    await world.waitForRun(heart.automationId, 'completed');

    expectEqual(
      'runs per automation',
      [
        (await world.api.runs(cafe.automationId)).map((run) => run.status),
        (await world.api.runs(heart.automationId)).map((run) => run.status),
      ],
      [['completed'], ['completed']],
    );
    const state = await world.stand.state('instagram');
    expectEqual(
      'public replies in the thread',
      repliesInThread(state, ig.post).sort(),
      ['Thanks for the café, @jane.doe!', 'Thanks for the ❤️, @jane.doe!'].sort(),
    );
  },
};

const R9: Cycle = {
  id: 'R9',
  title: 'draft save overlapping a publish never loses the newer text',
  run: async (world) => {
    const account = await world.account('instagram');
    const newer: Definition = {
      ...instagramReplyOnly,
      steps: [{ kind: 'reply_to_comment', text: 'Check your inbox, {{contact.handle}}!' }],
    };
    for (let round = 1; round <= 10; round += 1) {
      const created = await world.api.create(account.id, `Race ${round}`);
      await world.api.saveDraft(created.id, instagramReplyOnly);
      const [, published] = await Promise.all([
        world.api.saveDraft(created.id, newer),
        world.api.publish(created.id),
      ]);
      const detail = await world.api.automation(created.id);
      const active = detail.versions.find((version) => version.isActive)?.definition;

      expectEqual(`round ${round} publish status`, published.status, 200);
      expectEqual(
        `round ${round} newer text kept as draft or version`,
        detail.draft ?? active,
        newer,
      );
    }
  },
};

export const cycles: Cycle[] = [
  A1,
  A2,
  A3,
  A4,
  A5,
  A6,
  A7,
  B1,
  C1,
  E1,
  X1,
  R1,
  R2,
  R3,
  R4,
  R5,
  R6,
  R7,
  R8,
  R9,
];
