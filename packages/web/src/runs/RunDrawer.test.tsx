import type { RunDetail } from '@comment-automations/api-schema';
import { runId } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    render(<RunDrawer runId={run.id} stepTitles={[]} onClose={vi.fn()} onChanged={onChanged} />);
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
    render(<RunDrawer runId={run.id} stepTitles={[]} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByText('Stop this run'));
    await screen.findByText('body must be object');
    expect(screen.getByText('Stop this run')).not.toBeNull();
  });
});
