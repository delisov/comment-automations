import type { RunDetail } from '@comment-automations/api-schema';
import { runId } from '@comment-automations/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client.js';
import { RunDrawer } from './RunDrawer.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stoppedRun: RunDetail = {
  id: runId('run_1'),
  contactHandle: '@maya',
  status: 'stopped',
  stepIndex: 1,
  stepCount: 3,
  versionNumber: 1,
  startedAt: '2026-10-01T10:00:00Z',
  finishedAt: '2026-10-01T10:05:00Z',
  timeline: [],
  context: { captured: {}, replied: false },
};

describe('run drawer', () => {
  it('labels a stopped run as Stopped', async () => {
    vi.spyOn(api, 'run').mockResolvedValue(stoppedRun);
    render(
      <RunDrawer
        runId={stoppedRun.id}
        stepTitles={['A', 'B', 'C']}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(await screen.findByText('Stopped')).not.toBeNull();
  });
});
