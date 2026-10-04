import type { AutomationDetail } from '@comment-automations/api-schema';
import { accountId, automationId } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from './EditorPage.js';

afterEach(cleanup);

const detail: AutomationDetail = {
  id: automationId('a_1'),
  name: 'Pricing lead capture',
  accountId: accountId('acc_ig'),
  platform: 'instagram',
  state: 'draft',
  activeVersionNumber: null,
  triggerSummary: 'Comments on any post · pricing',
  stats: { runs24h: 0, succeeded24h: 0, failed24h: 0, lastRunAt: null },
  draft: {
    trigger: {
      comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
      onRepeatWhileWaiting: 'supersede',
    },
    steps: [{ kind: 'reply_to_comment', text: 'Sent you a DM!' }],
  },
  versions: [],
};

const routes: Record<string, unknown> = {
  '/health': { status: 'ok', sha: 'abc1234' },
  '/accounts': {
    accounts: [
      {
        id: 'acc_ig',
        platform: 'instagram',
        handle: '@oqtastore',
        displayName: 'Oqtastore',
        status: 'connected',
      },
    ],
  },
  '/automations/a_1': detail,
  '/automations/a_1/versions': { versions: [] },
  '/automations/a_1/runs?status=running&status=waiting&limit=200': { runs: [], nextCursor: null },
};

const mockFetch = (draftResponse?: Response) => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (url === '/automations/a_1/draft') {
        return draftResponse ?? new Response(JSON.stringify(detail), { status: 200 });
      }
      if (url === '/automations/a_1/publish') {
        return new Response(
          JSON.stringify({
            version: {
              id: 'v_1',
              number: 1,
              note: '',
              publishedAt: '2026-10-04T10:00:00Z',
              isActive: true,
            },
          }),
          { status: 200 },
        );
      }
      const body = routes[url];
      return body === undefined
        ? new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
};

const renderEditor = () => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>overview</div> },
      { path: '/automations/:id', element: <EditorPage tab="editor" /> },
    ],
    { initialEntries: ['/automations/a_1'] },
  );
  render(<RouterProvider router={router} />);
};

describe('editor page', () => {
  it('renders the draft from the API and publishes it as version 1', async () => {
    const calls = mockFetch();
    renderEditor();
    await screen.findByText('Not published yet');
    expect((screen.getByLabelText('Reply text') as HTMLTextAreaElement).value).toBe(
      'Sent you a DM!',
    );
    expect(screen.getByText('pricing')).not.toBeNull();

    fireEvent.click(screen.getByText('+ Add step'));
    fireEvent.click(screen.getByText('Send a message'));
    expect(screen.getByLabelText('Message text')).not.toBeNull();

    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    await screen.findByText('✓ Published as version 1.');
    await waitFor(() =>
      expect(calls.some((call) => call.url === '/automations/a_1/publish')).toBe(true),
    );

    const save = calls.find((call) => call.url === '/automations/a_1/draft');
    expect(save?.method).toBe('PUT');
    expect((save?.body as { definition: AutomationDetail['draft'] }).definition?.steps).toEqual([
      { kind: 'reply_to_comment', text: 'Sent you a DM!' },
      { kind: 'send_message', text: '', buttons: [] },
    ]);
  });

  it('shows the API validation issues inline', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          issues: [
            { path: 'steps.0.text', code: 'TEXT_REQUIRED', message: 'Text must not be empty' },
          ],
        }),
        { status: 422 },
      ),
    );
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Save draft'));
    await screen.findByText('Write the text to send.');
  });
});
