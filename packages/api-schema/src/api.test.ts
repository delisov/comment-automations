import {
  accountId,
  allowedStepKinds,
  allowedTriggers,
  automationId,
  canRemindBeforeReply,
  capabilities,
  commentId,
  postId,
  requiresUnreachableChoice,
  runId,
  versionId,
} from '@comment-automations/shared';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import type {
  AccountSummary,
  ActivateVersionRequest,
  AnalyticsQuery,
  AnalyticsResponse,
  AutomationDetail,
  AutomationSummary,
  CreateAutomationRequest,
  PublishResponse,
  RunDetail,
  RunSummary,
  RunsQuery,
  UpdateDraftRequest,
} from './index.js';
import * as schema from './index.js';

const account: AccountSummary = {
  id: accountId('acc_1'),
  platform: 'instagram',
  handle: 'boltato',
  displayName: 'Boltato',
  status: 'connected',
  capabilities: {
    record: capabilities.instagram,
    allowedTriggers: allowedTriggers(capabilities.instagram),
    allowedStepKinds: allowedStepKinds(capabilities.instagram),
    requiresUnreachableChoice: requiresUnreachableChoice(capabilities.instagram),
    canRemindBeforeReply: canRemindBeforeReply(capabilities.instagram),
  },
};

const summary: AutomationSummary = {
  id: automationId('auto_1'),
  name: 'Pricing guide',
  accountId: accountId('acc_1'),
  platform: 'instagram',
  state: 'live',
  activeVersionNumber: 2,
  triggerSummary: 'Comment · pricing',
  stats: { runs24h: 12, succeeded24h: 9, failed24h: 1, lastRunAt: '2026-10-04T09:00:00Z' },
};

const definition = {
  trigger: {
    comments: { posts: { kind: 'any' as const }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede' as const,
  },
  steps: [{ kind: 'reply_to_comment' as const, text: 'Sent you a DM!' }],
};

const detail: AutomationDetail = {
  ...summary,
  draft: definition,
  versions: [
    {
      id: versionId('v_1'),
      number: 1,
      note: 'first',
      publishedAt: '2026-10-01T09:00:00Z',
      isActive: false,
      definition,
    },
    {
      id: versionId('v_2'),
      number: 2,
      note: '',
      publishedAt: '2026-10-03T09:00:00Z',
      isActive: true,
      definition,
    },
  ],
};

const createRequest: CreateAutomationRequest = { accountId: accountId('acc_1'), name: 'Pricing' };

const updateDraft: UpdateDraftRequest = {
  definition: {
    trigger: { messages: { keywords: [] }, onRepeatWhileWaiting: 'ignore' },
    steps: [],
  },
};

const publishResponse: PublishResponse = { version: detail.versions[1]! };

const activateRequest: ActivateVersionRequest = { versionId: versionId('v_1') };

const run: RunSummary = {
  id: runId('run_1'),
  contactHandle: 'jane',
  status: 'failed',
  stepIndex: 1,
  stepCount: 5,
  versionNumber: 2,
  startedAt: '2026-10-04T09:00:00Z',
  finishedAt: '2026-10-04T09:00:05Z',
  error: { code: 'RECIPIENT_UNREACHABLE', message: 'Recipient does not accept messages' },
};

const runDetail: RunDetail = {
  ...run,
  timeline: [
    {
      stepIndex: 0,
      level: 'info',
      message: 'Replied to comment',
      context: { replyId: 'r_1' },
      at: '2026-10-04T09:00:01Z',
    },
    {
      stepIndex: null,
      level: 'error',
      message: 'Run failed',
      context: {},
      at: '2026-10-04T09:00:05Z',
    },
  ],
  context: { commentId: commentId('c_1'), postId: postId('p_1'), captured: {}, replied: false },
};

const runsQuery: RunsQuery = {
  status: ['failed', 'expired'],
  versionIds: [versionId('v_2')],
  limit: 20,
};

const analyticsQuery: AnalyticsQuery = { versionIds: [versionId('v_1'), versionId('v_2')] };

const analytics: AnalyticsResponse = {
  perVersion: [
    {
      versionId: versionId('v_2'),
      number: 2,
      started: 40,
      replied: 25,
      replyRate: 0.625,
      completed: 20,
      completionRate: 0.5,
      emailsCaptured: 18,
      emailRate: 0.45,
      failed: 3,
      medianSecondsToEmail: 310,
    },
  ],
  perDay: [{ day: '2026-10-04', started: 12, emailsCaptured: 5 }],
};

describe('product API schemas', () => {
  it.each([
    ['AccountSummary', schema.AccountSummary, account],
    ['AutomationSummary', schema.AutomationSummary, summary],
    ['AutomationDetail', schema.AutomationDetail, detail],
    ['CreateAutomationRequest', schema.CreateAutomationRequest, createRequest],
    ['UpdateDraftRequest', schema.UpdateDraftRequest, updateDraft],
    ['PublishResponse', schema.PublishResponse, publishResponse],
    ['ActivateVersionRequest', schema.ActivateVersionRequest, activateRequest],
    ['RunSummary', schema.RunSummary, run],
    ['RunDetail', schema.RunDetail, runDetail],
    ['RunsQuery', schema.RunsQuery, runsQuery],
    ['AnalyticsQuery', schema.AnalyticsQuery, analyticsQuery],
    ['AnalyticsResponse', schema.AnalyticsResponse, analytics],
  ] as const)('%s accepts its example payload', (_name, s, payload) => {
    expect([...Value.Errors(s, payload)]).toEqual([]);
    expect(Value.Check(s, payload)).toBe(true);
  });

  it('rejects an automation in an unknown state and a run with an unknown status', () => {
    expect(Value.Check(schema.AutomationSummary, { ...summary, state: 'paused' })).toBe(false);
    expect(Value.Check(schema.RunSummary, { ...run, status: 'done' })).toBe(false);
  });

  it('rejects an empty automation name and a draft that is not a definition', () => {
    expect(Value.Check(schema.CreateAutomationRequest, { ...createRequest, name: '' })).toBe(false);
    expect(Value.Check(schema.AutomationDetail, { ...detail, draft: { steps: [] } })).toBe(false);
  });
});
