import type { VersionAnalytics } from '@comment-automations/api-schema';
import { versionId } from '@comment-automations/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Version } from '../api/client.js';
import { bestValue, ComparisonTable } from './ComparisonTable.js';

afterEach(cleanup);

const v3: VersionAnalytics = {
  versionId: versionId('v_3'),
  number: 3,
  started: 294,
  replied: 206,
  replyRate: 0.7,
  completed: 251,
  completionRate: 0.85,
  emailsCaptured: 171,
  emailRate: 0.58,
  failed: 8,
  medianSecondsToEmail: 130,
};

const v4: VersionAnalytics = {
  versionId: versionId('v_4'),
  number: 4,
  started: 38,
  replied: 30,
  replyRate: 0.79,
  completed: 29,
  completionRate: 0.76,
  emailsCaptured: 24,
  emailRate: 0.63,
  failed: 1,
  medianSecondsToEmail: 41,
};

const versions: Version[] = [
  {
    id: versionId('v_3'),
    number: 3,
    note: '',
    publishedAt: '2026-09-30T14:22:00Z',
    isActive: false,
  },
  {
    id: versionId('v_4'),
    number: 4,
    note: '',
    publishedAt: '2026-10-04T10:00:00Z',
    isActive: true,
  },
];

describe('comparison table', () => {
  it('shades the better rate and the shorter time to email', () => {
    render(<ComparisonTable rows={[v3, v4]} versions={versions} hasMessageStep={true} />);
    const [rowV4, rowV3] = screen.getAllByRole('row').slice(1) as HTMLElement[];
    const best = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .filter((cell) => cell.classList.contains('best'))
        .map((cell) => cell.textContent);
    expect(best(rowV4 as HTMLElement)).toEqual(['79%', '63%', '41 s']);
    expect(best(rowV3 as HTMLElement)).toEqual(['85%']);
  });

  it('hides the reply columns when the definition has no message step', () => {
    render(<ComparisonTable rows={[v3, v4]} versions={versions} hasMessageStep={false} />);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Version',
      'Published',
      'Started',
      'Completed',
      'Completion',
      'Emails captured',
      'Email rate',
      'Failed',
      'Median time to email',
    ]);
  });

  it('marks no cell when the values tie or only one version has a value', () => {
    expect(
      bestValue([v3, { ...v4, completionRate: 0.85 }], {
        value: (r) => r.completionRate,
        better: 'higher',
      }),
    ).toBeNull();
    expect(
      bestValue([v3, { ...v4, medianSecondsToEmail: null }], {
        value: (r) => r.medianSecondsToEmail,
        better: 'lower',
      }),
    ).toBeNull();
    expect(bestValue([v3, v4], { value: (r) => r.failed, better: 'none' })).toBeNull();
  });
});
