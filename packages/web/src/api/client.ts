import type {
  AccountSummary,
  AnalyticsResponse,
  AutomationDetail,
  AutomationsResponse,
  CapabilitiesResponse,
  CreateAutomationRequest,
  DefinitionSchema,
  HealthResponse,
  PublishResponse,
  RunDetail,
  RunStatus,
  RunsResponse,
  ValidationIssue,
  VersionSummary,
} from '@comment-automations/api-schema';
import type {
  AccountId,
  AutomationId,
  PostId,
  RunId,
  VersionId,
} from '@comment-automations/shared';

export type Account = AccountSummary & { capabilities?: CapabilitiesResponse };

export type Post = { postId: PostId; caption: string; publishedAt: string };

export type Version = VersionSummary & { definition?: DefinitionSchema };

export type ClockResponse = { now: string };

export type RunsFilter = {
  status?: RunStatus[];
  versionIds?: VersionId[];
  contact?: string;
  limit?: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(status: number, message: string, issues: ValidationIssue[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

const parseIssues = (body: unknown): ValidationIssue[] => {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const issues = (body as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as ValidationIssue[]) : [];
};

const parseMessage = (body: unknown, fallback: string): string => {
  if (typeof body === 'object' && body !== null) {
    const { message, error } = body as { message?: unknown; error?: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (typeof error === 'string') {
      return error;
    }
  }
  return fallback;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const body: unknown = text === '' ? null : JSON.parse(text);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      parseMessage(body, `${response.status} ${response.statusText}`),
      parseIssues(body),
    );
  }
  return body as T;
};

const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const query = (params: Record<string, string | string[] | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [String(value)]) {
      search.append(key, item);
    }
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
};

const unwrap = <T>(body: unknown, key: string): T[] => {
  if (Array.isArray(body)) {
    return body as T[];
  }
  const items = (body as Record<string, unknown>)[key];
  return Array.isArray(items) ? (items as T[]) : [];
};

export const api = {
  health: () => request<HealthResponse>('/health'),
  clock: () => request<ClockResponse>('/test/clock'),
  accounts: async () => (await request<{ accounts: Account[] }>('/accounts')).accounts,
  posts: async (accountId: AccountId) =>
    unwrap<Post>(await request<unknown>(`/accounts/${accountId}/posts`), 'posts'),
  automations: async () => (await request<AutomationsResponse>('/automations')).automations,
  automation: (id: AutomationId) => request<AutomationDetail>(`/automations/${id}`),
  createAutomation: (body: CreateAutomationRequest) => post<AutomationDetail>('/automations', body),
  saveDraft: (id: AutomationId, definition: DefinitionSchema) =>
    request<AutomationDetail>(`/automations/${id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ definition }),
    }),
  publish: (id: AutomationId, note: string) =>
    post<PublishResponse>(`/automations/${id}/publish`, { note }),
  activate: (id: AutomationId, versionId: VersionId) =>
    post<AutomationDetail>(`/automations/${id}/activate`, { versionId }),
  draftFromVersion: (id: AutomationId, versionId: VersionId) =>
    post<AutomationDetail>(`/automations/${id}/draft-from-version`, { versionId }),
  pause: (id: AutomationId) => post<AutomationDetail>(`/automations/${id}/pause`),
  versions: async (id: AutomationId) =>
    unwrap<Version>(await request<unknown>(`/automations/${id}/versions`), 'versions'),
  runs: (id: AutomationId, filter: RunsFilter) =>
    request<RunsResponse>(`/automations/${id}/runs${query(filter)}`),
  run: (id: RunId) => request<RunDetail>(`/runs/${id}`),
  stopRun: (id: RunId) => post<RunDetail>(`/runs/${id}/stop`),
  analytics: (id: AutomationId, versionIds: VersionId[]) =>
    request<AnalyticsResponse>(
      `/automations/${id}/analytics${query({ versionIds: versionIds.length === 0 ? undefined : versionIds })}`,
    ),
};
