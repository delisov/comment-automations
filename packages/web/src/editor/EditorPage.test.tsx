import type { AutomationDetail } from '@comment-automations/api-schema';
import { accountId, automationId, versionId } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from './EditorPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

const liveVersion = {
  id: versionId('v_1'),
  number: 1,
  note: '',
  publishedAt: '2026-10-04T10:00:00Z',
  isActive: true,
  definition: detail.draft!,
};

const liveDetail: AutomationDetail = {
  ...detail,
  state: 'live',
  activeVersionNumber: 1,
  draft: null,
  versions: [liveVersion],
};

const whatsappDetail: AutomationDetail = {
  ...detail,
  accountId: accountId('acc_wa'),
  platform: 'whatsapp',
  draft: { ...detail.draft!, steps: [] },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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
      {
        id: 'acc_wa',
        platform: 'whatsapp',
        handle: '+1 555 0100',
        displayName: 'Oqtastore',
        status: 'connected',
      },
    ],
  },
  '/automations/a_1': detail,
  '/automations/a_1/versions': { versions: [] },
  '/automations/a_1/runs?status=running&status=waiting&limit=200': { runs: [], nextCursor: null },
};

type Call = { url: string; method: string; headers: unknown; body: unknown };

const mockFetch = (overrides: Record<string, () => Response | Promise<Response>> = {}) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const override = overrides[url];
      if (override !== undefined) {
        return override();
      }
      if (url === '/automations/a_1/draft') {
        return json(detail);
      }
      if (url === '/automations/a_1/publish') {
        return json({ version: { ...liveVersion, definition: undefined } });
      }
      const body = routes[url];
      return body === undefined ? json({ message: 'not found' }, 404) : json(body);
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
    mockFetch({
      '/automations/a_1/draft': () =>
        json(
          {
            issues: [
              { path: 'steps.0.text', code: 'TEXT_REQUIRED', message: 'Text must not be empty' },
            ],
          },
          422,
        ),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Save draft'));
    await screen.findByText('Write the text to send.');
  });

  it('shows the API message when a save is rejected with 400', async () => {
    mockFetch({
      '/automations/a_1/draft': () =>
        json(
          {
            statusCode: 400,
            error: 'Bad Request',
            message:
              'body/definition/trigger/comments/keywords/0 must NOT have more than 100 characters',
          },
          400,
        ),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Save draft'));
    await screen.findByText(
      'body/definition/trigger/comments/keywords/0 must NOT have more than 100 characters',
    );
  });

  it('blames the connection only when the request never reached the API', async () => {
    mockFetch({
      '/automations/a_1/draft': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Save draft'));
    await screen.findByText('Couldn’t save. Check your connection and try again.');
  });

  it('moves a live automation to draft without a JSON content type and refreshes it', async () => {
    const calls = mockFetch({
      '/automations/a_1': () => json(liveDetail),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
      '/automations/a_1/pause': () => json({ ...liveDetail, state: 'draft' }),
    });
    renderEditor();
    fireEvent.click(await screen.findByText('Move to draft'));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Move to draft' }),
    );
    await screen.findByText('Moved to draft. New comments and messages are not answered.');
    expect(screen.getByText('Save draft')).not.toBeNull();
    expect(calls.find((call) => call.url === '/automations/a_1/pause')).toEqual({
      url: '/automations/a_1/pause',
      method: 'POST',
      headers: { accept: 'application/json' },
      body: undefined,
    });
  });

  it('shows the API message when moving to draft is rejected', async () => {
    mockFetch({
      '/automations/a_1': () => json(liveDetail),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
      '/automations/a_1/pause': () =>
        json({ statusCode: 400, error: 'Bad Request', message: 'body must be object' }, 400),
    });
    renderEditor();
    fireEvent.click(await screen.findByText('Move to draft'));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Move to draft' }),
    );
    await screen.findByText('body must be object');
  });

  it('drops the comments trigger WhatsApp does not allow and saves the fix', async () => {
    const calls = mockFetch({
      '/automations/a_1': () => json(whatsappDetail),
      '/automations/a_1/draft': () => json(whatsappDetail),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'sends a message',
    ]);
    expect(screen.queryByText('Any post')).toBeNull();
    expect(screen.queryByText('Choose a post')).toBeNull();

    fireEvent.click(screen.getByText('DM automations'));
    await screen.findByText('Leave without saving?');
    fireEvent.click(screen.getByText('Keep editing'));

    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() =>
      expect(calls.find((call) => call.url === '/automations/a_1/draft')?.body).toEqual({
        definition: { trigger: { onRepeatWhileWaiting: 'supersede' }, steps: [] },
      }),
    );
  });
});
