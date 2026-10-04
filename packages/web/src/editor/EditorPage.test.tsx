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
  '/automations/a_1/runs?limit=200': { runs: [], nextCursor: null },
};

const waitingRun = {
  id: 'r_1',
  contactHandle: '@maria',
  status: 'waiting',
  stepIndex: 1,
  stepCount: 2,
  versionNumber: 1,
  startedAt: '2026-10-04T10:00:00Z',
  finishedAt: null,
};

const saveUrl = '/automations/a_1/draft?force=true';

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
      const override = overrides[`${init?.method ?? 'GET'} ${url}`] ?? overrides[url];
      if (override !== undefined) {
        return override();
      }
      if (url === saveUrl) {
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

const renderEditor = (path = '/automations/a_1') => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>overview</div> },
      { path: '/automations/:id', element: <EditorPage tab="editor" /> },
      { path: '/automations/:id/runs', element: <EditorPage tab="runs" /> },
      { path: '/automations/:id/versions/:versionId', element: <EditorPage tab="editor" /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
};

const buttonNames = () => screen.getAllByRole('button').map((button) => button.textContent);

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

    const save = calls.find((call) => call.url === saveUrl);
    expect(save?.method).toBe('PUT');
    expect((save?.body as { definition: AutomationDetail['draft'] }).definition?.steps).toEqual([
      { kind: 'reply_to_comment', text: 'Sent you a DM!' },
      { kind: 'send_message', text: '', buttons: [] },
    ]);
  });

  it('saves an unfinished draft without validating it and says so', async () => {
    const unfinished = {
      ...detail,
      draft: {
        ...detail.draft!,
        trigger: { ...detail.draft!.trigger, comments: { posts: { kind: 'any' }, keywords: [] } },
      },
    };
    const calls = mockFetch({
      '/automations/a_1': () => json(unfinished),
      [saveUrl]: () => json(unfinished),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Save draft'));
    await screen.findByText('Draft saved');
    expect(calls.filter((call) => call.method === 'PUT').map((call) => call.url)).toEqual([
      saveUrl,
    ]);
  });

  it('shows the validation issues publishing returns inline', async () => {
    mockFetch({
      '/automations/a_1/publish': () =>
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
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    await screen.findByText('Write the text to send.');
    expect(screen.queryByText('Draft saved')).toBeNull();
  });

  it('shows the missing-steps issue in the Steps card and the toast when publishing without steps', async () => {
    const noSteps = { ...detail, draft: { ...detail.draft!, steps: [] } };
    mockFetch({
      '/automations/a_1': () => json(noSteps),
      '/automations/a_1/publish': () =>
        json(
          { issues: [{ path: 'steps', code: 'STEPS_REQUIRED', message: 'Add at least one step' }] },
          422,
        ),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    const shown = await screen.findAllByText('Add at least one step');
    const card = screen.getByRole('heading', { name: 'Then…' }).closest('.card') as HTMLElement;
    expect(shown.map((node) => node.className)).toEqual(['errtext', 'toast bad']);
    expect(within(card).getByText('Add at least one step').className).toBe('errtext');
    expect(card.className).toBe('card err');
    expect(screen.queryByText('Fix the highlighted fields and try again.')).toBeNull();
  });

  it('lists issues no card renders in a callout above the cards', async () => {
    mockFetch({
      '/automations/a_1/publish': () =>
        json(
          { issues: [{ path: 'name', code: 'NAME_REQUIRED', message: 'Name must not be empty' }] },
          422,
        ),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    const shown = await screen.findAllByText('Name must not be empty');
    expect(shown.map((node) => node.className)).toEqual(['', 'toast bad']);
    expect(shown[0]?.closest('.callout.bad')).not.toBeNull();
  });

  it('counts the issues in the toast when there are several', async () => {
    mockFetch({
      '/automations/a_1/publish': () =>
        json(
          {
            issues: [
              { path: 'steps.0.text', code: 'TEXT_REQUIRED', message: 'Text must not be empty' },
              { path: 'name', code: 'NAME_REQUIRED', message: 'Name must not be empty' },
            ],
          },
          422,
        ),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    await screen.findByText('Fix the 2 issues shown below and try again.');
    expect(screen.getByText('Write the text to send.')).not.toBeNull();
    expect(screen.getByText('Name must not be empty')).not.toBeNull();
  });

  it('shows the API message when a save is rejected with 400', async () => {
    mockFetch({
      [saveUrl]: () =>
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
      [saveUrl]: () => Promise.reject(new TypeError('Failed to fetch')),
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

  it('archives the automation after confirmation and returns to the overview', async () => {
    const calls = mockFetch({
      'DELETE /automations/a_1': () => new Response(null, { status: 204 }),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive "Pricing lead capture"?' });
    expect(dialog.textContent).toContain('stops for good');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await screen.findByText('overview');
    expect(calls.filter((call) => call.method === 'DELETE')).toEqual([
      {
        url: '/automations/a_1',
        method: 'DELETE',
        headers: { accept: 'application/json' },
        body: undefined,
      },
    ]);
  });

  it('sends nothing when archiving is cancelled', async () => {
    const calls = mockFetch();
    renderEditor();
    await screen.findByText('Not published yet');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('opens an archived automation read-only without mutating actions', async () => {
    mockFetch({
      '/automations/a_1': () => json({ ...liveDetail, state: 'archived' }),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
    });
    renderEditor();
    await screen.findByText('Archived');
    expect(buttonNames()).toEqual(['Versions']);
    expect((screen.getByLabelText('Reply text') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByText('+ Add step')).toBeNull();
  });

  it('offers no mutating actions on a version of an archived automation', async () => {
    mockFetch({
      '/automations/a_1': () => json({ ...liveDetail, state: 'archived' }),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
    });
    renderEditor('/automations/a_1/versions/v_1');
    await screen.findByText('You are viewing version 1.');
    expect(screen.getByText('Archived')).not.toBeNull();
    expect(buttonNames()).toEqual(['Versions', 'Back to the editor']);
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    expect(within(screen.getByRole('dialog')).queryByText('Edit as a new version')).toBeNull();
    expect(within(screen.getByRole('dialog')).queryByText('Make active')).toBeNull();
  });

  it('shows the not-found page for a version that is not in the list', async () => {
    mockFetch({
      '/automations/a_1': () => json(liveDetail),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
    });
    renderEditor('/automations/a_1/versions/v_404');
    await screen.findByText('Page not found');
    expect(screen.queryByText('When someone…')).toBeNull();
  });

  it('does not offer the test hint on the runs tab of an archived automation', async () => {
    mockFetch({
      '/automations/a_1': () => json({ ...liveDetail, state: 'archived' }),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
    });
    renderEditor('/automations/a_1/runs');
    await screen.findByText('This automation was archived before it had any runs.');
    expect(screen.queryByText('How to test it')).toBeNull();
  });

  it('words the publish confirmation as sentences with and without runs in progress', async () => {
    mockFetch({
      '/automations/a_1': () => json(liveDetail),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
    });
    renderEditor();
    fireEvent.click(await screen.findByText('Save and publish'));
    expect(screen.getByRole('dialog').querySelector('p')?.textContent).toBe(
      'Version 1 stays in the history unchanged. New comments and messages run version 2.',
    );
    cleanup();

    mockFetch({
      '/automations/a_1': () => json(liveDetail),
      '/automations/a_1/versions': () => json({ versions: [liveVersion] }),
      '/automations/a_1/runs?status=running&status=waiting&limit=200': () =>
        json({ runs: [waitingRun], nextCursor: null }),
    });
    renderEditor();
    fireEvent.click(await screen.findByText('Save and publish'));
    await waitFor(() =>
      expect(screen.getByRole('dialog').querySelector('p')?.textContent).toBe(
        'Version 1 stays in the history unchanged. 1 run in progress on version 1 will finish on it; new comments and messages run version 2.',
      ),
    );
  });

  it('words the test hint for messages on a platform without comments', async () => {
    mockFetch({ '/automations/a_1': () => json(whatsappDetail) });
    renderEditor();
    fireEvent.click(await screen.findByText('Publish'));
    expect(
      screen.getByText(
        'Test it from another account: your own messages never trigger an automation.',
      ),
    ).not.toBeNull();
  });

  it('drops the comments trigger WhatsApp does not allow and saves the fix', async () => {
    const calls = mockFetch({
      '/automations/a_1': () => json(whatsappDetail),
      [saveUrl]: () => json(whatsappDetail),
    });
    renderEditor();
    await screen.findByText('Not published yet');
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
        'sends a message',
      ]),
    );
    expect(screen.queryByText('Any post')).toBeNull();
    expect(screen.queryByText('Choose a post')).toBeNull();

    fireEvent.click(await screen.findByText('DM automations'));
    await screen.findByText('Leave without saving?');
    fireEvent.click(screen.getByText('Keep editing'));
    await waitFor(() => expect(screen.queryByText('Leave without saving?')).toBeNull());

    fireEvent.click(await screen.findByText('Save draft'));
    await waitFor(() => {
      const save = calls.find((call) => call.url === saveUrl);
      expect(save?.method).toBe('PUT');
      expect(save?.body).toEqual({
        definition: { trigger: { onRepeatWhileWaiting: 'supersede' }, steps: [] },
      });
    });
  });
});
