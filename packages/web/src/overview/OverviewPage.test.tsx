import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, it, vi } from 'vitest';
import { OverviewPage } from './OverviewPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const automation = {
  id: 'a_1',
  name: 'Pricing lead capture',
  accountId: 'acc_ig',
  platform: 'instagram',
  state: 'live',
  activeVersionNumber: 1,
  triggerSummary: '',
  stats: { runs24h: 3, succeeded24h: 3, failed24h: 0, lastRunAt: '2026-10-04T10:00:00Z' },
};

const renderOverview = (responses: Record<string, unknown>, state?: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = responses[url];
      return body === undefined
        ? new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <OverviewPage /> }], {
    initialEntries: [{ pathname: '/', state }],
  });
  render(<RouterProvider router={router} />);
};

describe('overview page', () => {
  it('measures the last run against the service clock when it answers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T10:05:00Z'));
    renderOverview({
      '/automations': { automations: [automation] },
      '/accounts': { accounts: [] },
      '/test/clock': { now: '2026-10-06T10:00:00Z' },
    });
    await screen.findByText('2 days ago');
  });

  it('shows the toast the editor hands over after archiving', async () => {
    renderOverview(
      { '/automations': { automations: [] }, '/accounts': { accounts: [] } },
      { toast: { tone: 'ok', text: 'Archived Pricing lead capture' } },
    );
    await screen.findByText('Archived Pricing lead capture');
  });

  it('falls back to the browser clock when the service clock is unavailable', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-04T10:05:00Z'));
    renderOverview({
      '/automations': { automations: [automation] },
      '/accounts': { accounts: [] },
    });
    await screen.findByText('5 min ago');
  });
});
