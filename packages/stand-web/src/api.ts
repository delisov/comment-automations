import type { Platform } from '@comment-automations/gateway-contract';

export const PLATFORMS: Platform[] = [
  'instagram',
  'facebook',
  'threads',
  'x',
  'bluesky',
  'youtube',
  'linkedin',
  'whatsapp',
  'tiktok',
  'pinterest',
];

export type DmSetting = 'all' | 'following' | 'none';

export type Account = {
  id: string;
  platform: Platform;
  handle: string;
  display_name: string;
  status: 'connected' | 'disconnected';
};

export type User = {
  id: string;
  platform: Platform;
  handle: string;
  display_name: string;
  dm_setting: DmSetting;
  follows_account_ids: string[];
};

export type Comment = {
  id: string;
  post_id: string;
  author_user_id: string | null;
  author_account_id: string | null;
  parent_id: string | null;
  text: string;
  created_at: string;
  private_reply_sent: boolean;
};

export type Post = {
  id: string;
  account_id: string;
  caption: string;
  published_at: string;
  comments: Comment[];
};

export type Message = {
  id: string;
  conversation_id: string;
  from: 'account' | 'user';
  text: string;
  buttons: { title: string; url: string }[];
  created_at: string;
};

export type Conversation = {
  id: string;
  account_id: string;
  user_id: string;
  opened_by: 'privateReply' | 'user' | 'account';
  last_user_message_at: string | null;
  messages: Message[];
};

export type State = {
  accounts: Account[];
  users: User[];
  posts: Post[];
  conversations: Conversation[];
};

export type LogEntry = {
  id: number;
  direction: 'to_service' | 'from_service';
  kind: string;
  payload: Record<string, unknown>;
  result_code: string | null;
  at: string;
};

export type Delivery = {
  id: number;
  event_id: string;
  attempt: number;
  status: 'delivered' | 'failed' | 'dropped';
  at: string;
};

export type Settings = {
  duplicatePercent: number;
  reorderWindowMs: number;
  delayMs: number;
  dropPercent: number;
  burst429: number;
};

export type Rules = {
  comments: boolean;
  publicReply: boolean;
  privateReply: { windowMs: number } | null;
  messaging:
    | { kind: 'none' }
    | { kind: 'window'; durationMs: number; maxConsecutiveAccountMessages: number | null }
    | { kind: 'dmSetting' };
  limits: { replyMaxChars: number; messageMaxChars: number; maxButtons: number };
  ownActivityEcho: boolean;
};

export type ClockAnswer = {
  now: string;
  service?: { status: number; body: unknown } | { error: string };
};

const request = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(json?.message ?? `${method} ${url} failed with ${response.status}`);
  }
  return json as T;
};

export const api = {
  clock: () => request<ClockAnswer>('GET', '/test/clock'),
  setClock: (now: string) => request<ClockAnswer>('POST', '/test/clock', { now }),
  state: (platform: Platform) => request<State>('GET', `/scenario/state?platform=${platform}`),
  rules: (platform: Platform) => request<Rules>('GET', `/scenario/rules?platform=${platform}`),
  eventLog: () => request<LogEntry[]>('GET', '/scenario/event-log?limit=500'),
  deliveries: () => request<Delivery[]>('GET', '/scenario/deliveries'),
  settings: () => request<Settings>('GET', '/scenario/settings'),
  putSettings: (patch: Partial<Settings>) => request<Settings>('PUT', '/scenario/settings', patch),
  reset: () => request<{ ok: true }>('POST', '/scenario/reset'),
  seed: () => request<{ ok: true }>('POST', '/scenario/seed'),
  comment: (body: { postId: string; userId: string; text: string; parentId?: string }) =>
    request<Comment>('POST', '/scenario/comments', body),
  message: (body: { accountId: string; userId: string; text: string }) =>
    request<Message>('POST', '/scenario/messages', body),
  patchUser: (id: string, patch: { dmSetting?: DmSetting; follows?: string[] }) =>
    request<User>('PATCH', `/scenario/users/${encodeURIComponent(id)}`, patch),
};
