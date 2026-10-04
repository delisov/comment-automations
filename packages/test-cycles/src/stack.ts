import { isDeepStrictEqual } from 'node:util';
import type {
  AccountSummary,
  AccountsResponse,
  AutomationDetail,
  HealthResponse,
  PublishResponse,
  RunDetail,
  RunSummary,
  RunsResponse,
} from '@comment-automations/api-schema';
import type {
  AccountId,
  AutomationId,
  CommentId,
  ConversationId,
  Definition,
  Platform,
  PostId,
  UserId,
  VersionId,
} from '@comment-automations/shared';

const request = async <T>(
  base: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(path.startsWith('/test/')
        ? { 'x-service-token': process.env.SERVICE_TOKEN ?? 'dev-token' }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${base}${path} answered ${response.status}: ${text}`);
  }
  return (text === '' ? null : JSON.parse(text)) as T;
};

export type Live = { automationId: AutomationId; versionId: VersionId };

export type Api = {
  url: string;
  health(): Promise<HealthResponse>;
  reset(): Promise<void>;
  accounts(): Promise<AccountSummary[]>;
  createLive(accountId: AccountId, name: string, definition: Definition): Promise<Live>;
  runs(automationId: AutomationId): Promise<RunSummary[]>;
  run(id: RunSummary['id']): Promise<RunDetail>;
};

const byStart = (a: RunSummary, b: RunSummary): number =>
  a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);

export const apiClient = (url: string): Api => ({
  url,
  health: () => request(url, 'GET', '/health'),
  reset: async () => {
    await request(url, 'POST', '/test/reset');
  },
  accounts: async () => (await request<AccountsResponse>(url, 'GET', '/accounts')).accounts,
  createLive: async (accountId, name, definition) => {
    const created = await request<AutomationDetail>(url, 'POST', '/automations', {
      accountId,
      name,
    });
    await request(url, 'PUT', `/automations/${created.id}/draft`, { definition });
    const published = await request<PublishResponse>(
      url,
      'POST',
      `/automations/${created.id}/publish`,
      { note: 'first' },
    );
    return { automationId: created.id, versionId: published.version.id };
  },
  runs: async (automationId) =>
    (await request<RunsResponse>(url, 'GET', `/automations/${automationId}/runs`)).runs.sort(
      byStart,
    ),
  run: (id) => request(url, 'GET', `/runs/${id}`),
});

export type StandMessage = {
  from: 'account' | 'user';
  text: string;
  buttons: { title: string; url: string }[];
};

export type StandComment = {
  id: CommentId;
  post_id: PostId;
  author_account_id: AccountId | null;
  parent_id: CommentId | null;
  text: string;
};

export type StandState = {
  posts: { id: PostId; comments: StandComment[] }[];
  conversations: { id: ConversationId; messages: StandMessage[] }[];
};

export type StandLogEntry = {
  direction: 'to_service' | 'from_service';
  kind: string;
  payload: { commentId?: string; request?: { visibility?: string } };
  result_code: string | null;
};

export type StandDelivery = { event_id: string; attempt: number; status: string };

export type StandSettings = {
  duplicatePercent: number;
  reorderWindowMs: number;
  delayMs: number;
  dropPercent: number;
  burst429: number;
};

export type ClockAnswer = {
  now: string;
  service: { status: number; body: unknown } | { error: string };
};

export type Stand = {
  url: string;
  health(): Promise<HealthResponse>;
  seed(): Promise<void>;
  settings(patch: Partial<StandSettings>): Promise<StandSettings>;
  setClock(now: Date): Promise<ClockAnswer>;
  comment(body: { postId: PostId; userId: UserId; text: string }): Promise<StandComment>;
  message(body: { accountId: AccountId; userId: UserId; text: string }): Promise<StandMessage>;
  state(platform: Platform): Promise<StandState>;
  eventLog(): Promise<StandLogEntry[]>;
  deliveries(): Promise<StandDelivery[]>;
};

export const standClient = (url: string): Stand => ({
  url,
  health: () => request(url, 'GET', '/health'),
  seed: async () => {
    await request(url, 'POST', '/scenario/seed');
  },
  settings: (patch) => request(url, 'PUT', '/scenario/settings', patch),
  setClock: (now) => request(url, 'POST', '/test/clock', { now: now.toISOString() }),
  comment: (body) => request(url, 'POST', '/scenario/comments', body),
  message: (body) => request(url, 'POST', '/scenario/messages', body),
  state: (platform) => request(url, 'GET', `/scenario/state?platform=${platform}`),
  eventLog: async () =>
    (await request<StandLogEntry[]>(url, 'GET', '/scenario/event-log?limit=1000')).reverse(),
  deliveries: () => request(url, 'GET', '/scenario/deliveries'),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async <T>(
  what: string,
  probe: () => Promise<T | undefined>,
  timeoutMs = 20_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs / 1000} s waiting for ${what}`);
    }
    await sleep(200);
  }
};

export const waitForHealth = (api: Api, stand: Stand): Promise<true> =>
  waitFor(
    `${api.url}/health and ${stand.url}/health`,
    async () => {
      try {
        await api.health();
        await stand.health();
        return true as const;
      } catch {
        return undefined;
      }
    },
    90_000,
  );

export const expectEqual = <T>(what: string, actual: T, expected: T): void => {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

export const expectNear = (
  what: string,
  actual: string,
  expected: string,
  toleranceMs: number,
): void => {
  const difference = Math.abs(Date.parse(actual) - Date.parse(expected));
  if (!(difference <= toleranceMs)) {
    throw new Error(`${what}: expected ${expected} within ${toleranceMs}ms, got ${actual}`);
  }
};
