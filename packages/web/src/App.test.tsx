import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from './App.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const detail = {
  id: 'a_1',
  name: 'Pricing lead capture',
  accountId: 'acc_ig',
  platform: 'instagram',
  state: 'draft',
  activeVersionNumber: null,
  triggerSummary: '',
  stats: { runs24h: 0, succeeded24h: 0, failed24h: 0, lastRunAt: null },
  draft: null,
  versions: [],
};

const responses: Record<string, unknown> = {
  '/health': { status: 'ok', sha: 'abc1234' },
  '/accounts': { accounts: [] },
  '/automations/a_1': detail,
  '/automations/a_1/versions': { versions: [] },
  '/automations/a_1/runs?status=running&status=waiting&limit=200': { runs: [], nextCursor: null },
};

const renderAt = (path: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = responses[url];
      return body === undefined
        ? new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe('app routes', () => {
  it('shows a not-found page inside the shell for an unknown path', async () => {
    renderAt('/nonexistent');
    await screen.findByText('Page not found');
    expect(screen.getByText('Boltato')).not.toBeNull();
  });

  it('redirects an unknown automation tab to the editor', async () => {
    const router = renderAt('/automations/a_1/bogustab');
    await waitFor(() => expect(router.state.location.pathname).toBe('/automations/a_1'));
    await screen.findByText('Not published yet');
  });
});
