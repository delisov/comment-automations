import { versionId } from '@comment-automations/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Version } from '../api/client.js';
import { VersionsWindow, versionState } from './VersionsWindow.js';

afterEach(cleanup);

const version = (number: number, isActive: boolean): Version => ({
  id: versionId(`v_${number}`),
  number,
  note: `Change ${number}`,
  publishedAt: `2026-10-0${number}T10:00:00Z`,
  isActive,
});

const versions = [version(1, false), version(2, false), version(3, true), version(4, false)];

describe('versions window', () => {
  it('marks versions above the active one as newer and below as previous', () => {
    render(
      <VersionsWindow
        name="Pricing lead capture"
        versions={versions}
        hasDraft={false}
        inProgress={new Map([[4, 2]])}
        onClose={vi.fn()}
        onView={vi.fn()}
        onMakeActive={vi.fn()}
        onEditAsNew={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    const states = rows.map((row) => within(row).getAllByRole('cell')[4]?.textContent);
    expect(states).toEqual(['Newer, not active', 'Active', 'Previous', 'Previous']);
    expect(within(rows[0] as HTMLElement).getByText('2 in progress')).not.toBeNull();
    expect(within(rows[1] as HTMLElement).queryByText('Make active')).toBeNull();
    expect(within(rows[0] as HTMLElement).getByText('Make active')).not.toBeNull();
  });

  it('adds a draft row on top when a draft exists', () => {
    render(
      <VersionsWindow
        name="Pricing lead capture"
        versions={versions}
        hasDraft={true}
        inProgress={new Map()}
        onClose={vi.fn()}
        onView={vi.fn()}
        onMakeActive={vi.fn()}
        onEditAsNew={vi.fn()}
      />,
    );
    const first = screen.getAllByRole('row')[1] as HTMLElement;
    expect(
      within(first)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Draft',
      'unpublished',
      'Edits on top of v3',
      '—',
      'Not published',
      'Continue editing',
    ]);
  });

  it('computes the state from the active number', () => {
    expect(versionState(version(5, false), 3)).toBe('Newer, not active');
    expect(versionState(version(2, false), 3)).toBe('Previous');
    expect(versionState(version(3, true), 3)).toBe('Active');
  });
});
