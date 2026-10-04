import { capabilities } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
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

const instagramAccount = {
  id: 'acc_ig',
  platform: 'instagram',
  handle: '@oqtastore',
  displayName: 'Oqtastore',
  status: 'connected',
  capabilities: deriveCapabilities(capabilities.instagram),
};

const secondInstagramAccount = {
  ...instagramAccount,
  id: 'acc_ig2',
  handle: '@oqtalab',
  displayName: 'Oqtalab',
};

const whatsappAccount = {
  id: 'acc_wa',
  platform: 'whatsapp',
  handle: '+1 415 555 0100',
  displayName: 'Oqtastore WhatsApp',
  status: 'connected',
  capabilities: deriveCapabilities(capabilities.whatsapp),
};

const pinterestAccount = {
  id: 'acc_pi',
  platform: 'pinterest',
  handle: '@oqtapins',
  displayName: 'Oqtapins',
  status: 'connected',
  capabilities: deriveCapabilities(capabilities.pinterest),
};

const withAccounts = {
  '/automations': { automations: [automation] },
  '/accounts': {
    accounts: [instagramAccount, secondInstagramAccount, pinterestAccount, whatsappAccount],
  },
};

const pickAccount = async (value: string) => {
  const filter = await screen.findByLabelText('Filter by account');
  await screen.findByText('Pricing lead capture');
  fireEvent.change(filter, { target: { value } });
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

  it('invites creating the first automation for a selected account that has none', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_ig2');
    await screen.findByText('No automations for @oqtalab on Instagram yet');
    expect(
      screen.getByText(
        'Reply to comments and send DMs on Instagram automatically. Set up the first one in a minute.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it('words the invite for a message-only platform without mentioning comments', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_wa');
    await screen.findByText('No automations for +1 415 555 0100 on WhatsApp yet');
    expect(
      screen.getByText(
        'Answer messages on WhatsApp automatically. Set up the first one in a minute.',
      ),
    ).toBeTruthy();
  });

  it('opens the new automation modal with the selected account already chosen', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_ig2');
    fireEvent.click(await screen.findByRole('button', { name: 'Create one for @oqtalab' }));
    const dialog = screen.getByRole('dialog', { name: 'New automation' });
    expect(within(dialog).getByText('@oqtalab')).toBeTruthy();
    expect(within(dialog).queryByText('Select a connected account')).toBeNull();
  });

  it('shows the empty state for the selected account whatever the search text', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_ig2');
    fireEvent.change(screen.getByLabelText('Search automations'), { target: { value: 'zzz' } });
    await screen.findByText('No automations for @oqtalab on Instagram yet');
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it('says why a selected account that cannot run automations has none, without a create button', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_pi');
    await screen.findByText('No comment or message automations on Pinterest');
    expect(screen.queryByRole('button', { name: /Create one for/ })).toBeNull();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it('reports a search with no results and clears it', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_ig');
    fireEvent.change(screen.getByLabelText('Search automations'), { target: { value: 'webinar' } });
    await screen.findByText('Nothing matches "webinar"');
    fireEvent.click(screen.getByText('Clear search'));
    await screen.findByText('Pricing lead capture');
    expect((screen.getByLabelText('Search automations') as HTMLInputElement).value).toBe('');
  });

  it('never renders Nothing matches for an empty search', async () => {
    renderOverview(withAccounts);
    await pickAccount('acc_ig2');
    await screen.findByText('No automations for @oqtalab on Instagram yet');
    fireEvent.change(screen.getByLabelText('Search automations'), { target: { value: '  ' } });
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });
});
