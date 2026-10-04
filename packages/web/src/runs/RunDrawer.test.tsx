import type { RunDetail } from '@comment-automations/api-schema';
import type { Step } from '@comment-automations/shared';
import { runId, versionId } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Version } from '../api/client.js';
import { RunDrawer } from './RunDrawer.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run: RunDetail = {
  id: runId('r_1'),
  contactHandle: '@maria',
  status: 'waiting',
  stepIndex: 1,
  stepCount: 2,
  versionNumber: 1,
  startedAt: '2026-10-04T10:00:00Z',
  finishedAt: null,
  timeline: [],
  context: { captured: {}, replied: false },
};

const version = (number: number, steps: Step[], isActive: boolean): Version => ({
  id: versionId(`v_${number}`),
  number,
  note: '',
  publishedAt: `2026-10-0${number}T10:00:00Z`,
  isActive,
  definition: {
    trigger: {
      comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
      onRepeatWhileWaiting: 'supersede',
    },
    steps,
  },
});

const versions: Version[] = [
  version(
    1,
    [
      { kind: 'send_message', text: 'Hey', buttons: [] },
      {
        kind: 'wait_for_reply',
        expect: 'email',
        giveUpHours: 72,
        nudge: { text: '', then: 'wait' },
      },
    ],
    false,
  ),
  version(
    2,
    [
      { kind: 'reply_to_comment', text: 'Sent you a DM!' },
      { kind: 'call_webhook', method: 'POST', url: 'https://x.y', headers: {} },
    ],
    true,
  ),
];

const mockFetch = (stopResponse: () => Response) => {
  const calls: { url: string; headers: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers });
      if (url === '/runs/r_1/stop') {
        return stopResponse();
      }
      return new Response(JSON.stringify(run), { status: 200 });
    }),
  );
  return calls;
};

describe('run drawer', () => {
  it('stops a waiting run without a JSON content type and shows the refreshed run', async () => {
    const calls = mockFetch(
      () =>
        new Response(
          JSON.stringify({ ...run, status: 'expired', finishedAt: '2026-10-04T10:05:00Z' }),
          { status: 200 },
        ),
    );
    const onChanged = vi.fn();
    render(
      <RunDrawer runId={run.id} versions={versions} onClose={vi.fn()} onChanged={onChanged} />,
    );
    fireEvent.click(await screen.findByText('Stop this run'));
    await screen.findByText('Expired');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(calls.find((call) => call.url === '/runs/r_1/stop')?.headers).toEqual({
      accept: 'application/json',
    });
  });

  it('shows the API error when stopping is rejected', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ error: 'Bad Request', message: 'body must be object' }), {
          status: 400,
        }),
    );
    render(<RunDrawer runId={run.id} versions={versions} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByText('Stop this run'));
    await screen.findByText('body must be object');
    expect(screen.getByText('Stop this run')).not.toBeNull();
  });

  it('names the steps from the version the run started on, not the active one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(run), { status: 200 })),
    );
    render(<RunDrawer runId={run.id} versions={versions} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Step 2 of 2 · Wait for an email address')).not.toBeNull();
    expect(screen.queryByText(/Send to a webhook/)).toBeNull();
  });

  it('labels a stopped run as Stopped', async () => {
    const stopped: RunDetail = { ...run, status: 'stopped', finishedAt: '2026-10-04T10:05:00Z' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(stopped), { status: 200 })),
    );
    render(<RunDrawer runId={run.id} versions={versions} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText('Stopped')).not.toBeNull();
  });
});
