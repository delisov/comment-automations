import type { AccountSummary, RunDetail, RunStatus } from '@comment-automations/api-schema';
import type { AutomationId, Platform } from '@comment-automations/shared';
import { accountId, postId, userId } from '@comment-automations/shared';
import type { Api, Stand, StandLogEntry, StandState } from './stack.js';
import { apiClient, standClient, waitFor } from './stack.js';
import type { WebhookReceiver } from './webhook.js';
import { startWebhookReceiver } from './webhook.js';

export const HOUR = 60 * 60 * 1000;

export const DAY = 24 * HOUR;

export type CycleClock = {
  now(): Date;
  set(now: Date): Promise<void>;
  advance(ms: number): Promise<void>;
};

export type World = {
  api: Api;
  stand: Stand;
  clock: CycleClock;
  webhook: WebhookReceiver;
  account(platform: Platform): Promise<AccountSummary>;
  waitForRun(automationId: AutomationId, status: RunStatus, index?: number): Promise<RunDetail>;
  waitForTimeline(automationId: AutomationId, message: string): Promise<RunDetail>;
  prepare(): Promise<void>;
  close(): Promise<void>;
};

export type WorldOptions = {
  apiUrl: string;
  standUrl: string;
  webhookHost: string;
  webhookPort: number;
};

const TERMINAL: RunStatus[] = ['completed', 'failed', 'expired', 'superseded'];

const describeEnd = (run: RunDetail): string =>
  run.error === undefined ? run.status : `${run.status} (${run.error.code}: ${run.error.message})`;

const createClock = (stand: Stand): CycleClock => {
  let current = new Date();
  const set = async (now: Date): Promise<void> => {
    const answer = await stand.setClock(now);
    if (!('status' in answer.service) || answer.service.status !== 200) {
      throw new Error(
        `the stand could not forward the clock to the api: ${JSON.stringify(answer.service)}`,
      );
    }
    current = now;
  };
  return {
    now: () => current,
    set,
    advance: (ms) => set(new Date(current.getTime() + ms)),
  };
};

export const createWorld = async (options: WorldOptions): Promise<World> => {
  const api = apiClient(options.apiUrl);
  const stand = standClient(options.standUrl);
  const clock = createClock(stand);
  const webhook = await startWebhookReceiver(options.webhookHost, options.webhookPort);

  const firstRun = async (automationId: AutomationId, index: number) => {
    const summaries = await api.runs(automationId);
    const summary = summaries[index];
    return summary === undefined ? undefined : api.run(summary.id);
  };

  return {
    api,
    stand,
    clock,
    webhook,
    account: async (platform) => {
      const account = (await api.accounts()).find((candidate) => candidate.platform === platform);
      if (account === undefined) {
        throw new Error(`the api lists no ${platform} account; run npm run seed first`);
      }
      return account;
    },
    waitForRun: (automationId, status, index = 0) =>
      waitFor(`run ${index + 1} to be ${status}`, async () => {
        const run = await firstRun(automationId, index);
        if (run === undefined) {
          return undefined;
        }
        if (run.status === status) {
          return run;
        }
        if (TERMINAL.includes(run.status)) {
          throw new Error(`run ${index + 1} ended ${describeEnd(run)} while waiting for ${status}`);
        }
        return undefined;
      }),
    waitForTimeline: (automationId, message) =>
      waitFor(`"${message}" in the run timeline`, async () => {
        const run = await firstRun(automationId, 0);
        if (run === undefined) {
          return undefined;
        }
        if (run.timeline.some((entry) => entry.message === message)) {
          return run;
        }
        if (TERMINAL.includes(run.status)) {
          throw new Error(`run ended ${describeEnd(run)} without "${message}"`);
        }
        return undefined;
      }),
    prepare: async () => {
      await stand.settings({
        duplicatePercent: 0,
        reorderWindowMs: 0,
        delayMs: 0,
        dropPercent: 0,
        burst429: 0,
      });
      await clock.set(new Date(Math.floor(Date.now() / 1000) * 1000));
      await stand.seed();
      await api.reset();
      webhook.calls.length = 0;
    },
    close: () => webhook.close(),
  };
};

export const seeded = (platform: Platform) => ({
  account: accountId(`${platform}_oqtastore`),
  post: postId(`${platform}_post_1`),
  jane: userId(`${platform}_jane.doe`),
  sam: userId(`${platform}_spammy_sam`),
});

export const timelineOf = (run: RunDetail): [string, string][] =>
  run.timeline.map((entry) => [entry.level, entry.message]);

export const repliesInThread = (state: StandState, post: ReturnType<typeof seeded>['post']) =>
  (state.posts.find((candidate) => candidate.id === post)?.comments ?? [])
    .filter((comment) => comment.author_account_id !== null)
    .map((comment) => comment.text);

export const conversationMessages = (state: StandState): [string, string][] =>
  state.conversations.flatMap((conversation) =>
    conversation.messages.map((message): [string, string] => [message.from, message.text]),
  );

export const gatewayCalls = (log: StandLogEntry[]): string[] =>
  log
    .filter((entry) => entry.direction === 'from_service' && entry.kind !== 'accounts')
    .map((entry) =>
      [entry.kind, entry.payload.request?.visibility, entry.result_code]
        .filter((part) => part !== undefined)
        .join(':'),
    );
