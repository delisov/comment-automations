import { accountId, capabilities } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../api/client.js';
import { deriveCapabilities } from '../capabilities.js';
import { NewAutomationModal } from './NewAutomationModal.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const account: Account = {
  id: accountId('acc_ig'),
  platform: 'instagram',
  handle: '@oqtastore',
  displayName: 'Oqtastore',
  status: 'connected',
  capabilities: deriveCapabilities(capabilities.instagram),
};

const renderModal = () => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      return new Response(
        JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'body/name is empty' }),
        { status: 400 },
      );
    }),
  );
  render(<NewAutomationModal accounts={[account]} onClose={vi.fn()} onCreated={vi.fn()} />);
  fireEvent.click(screen.getByText('Select a connected account'));
  fireEvent.click(screen.getByText('@oqtastore'));
  return calls;
};

describe('new automation modal', () => {
  it('does not create an automation from a whitespace-only name', () => {
    const calls = renderModal();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    expect(calls).toEqual([]);
  });

  it('sends the trimmed name and shows the API message when it still refuses', async () => {
    const calls = renderModal();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Pricing  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('body/name is empty');
    expect(calls).toEqual([
      { url: '/automations', body: { accountId: 'acc_ig', name: 'Pricing' } },
    ]);
  });
});
