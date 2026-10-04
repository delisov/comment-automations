import type { VersionAnalytics } from '@comment-automations/api-schema';
import type { Version } from '../api/client.js';
import { formatDate, formatDuration, formatPercent } from '../format.js';
import { Pill } from '../ui.js';

type Column = {
  title: string;
  value: (row: VersionAnalytics) => number | null;
  render: (row: VersionAnalytics) => string;
  better: 'higher' | 'lower' | 'none';
};

const columns = (hasMessage: boolean): Column[] =>
  [
    { title: 'Started', value: (r) => r.started, render: (r) => String(r.started), better: 'none' },
    ...(hasMessage
      ? ([
          {
            title: 'Replied',
            value: (r) => r.replied,
            render: (r) => String(r.replied),
            better: 'none',
          },
          {
            title: 'Reply rate',
            value: (r) => r.replyRate,
            render: (r) => formatPercent(r.replyRate),
            better: 'higher',
          },
        ] satisfies Column[])
      : []),
    {
      title: 'Completed',
      value: (r) => r.completed,
      render: (r) => String(r.completed),
      better: 'none',
    },
    {
      title: 'Completion',
      value: (r) => r.completionRate,
      render: (r) => formatPercent(r.completionRate),
      better: 'higher',
    },
    {
      title: 'Emails captured',
      value: (r) => r.emailsCaptured,
      render: (r) => String(r.emailsCaptured),
      better: 'none',
    },
    {
      title: 'Email rate',
      value: (r) => r.emailRate,
      render: (r) => formatPercent(r.emailRate),
      better: 'higher',
    },
    { title: 'Failed', value: (r) => r.failed, render: (r) => String(r.failed), better: 'none' },
    {
      title: 'Median time to email',
      value: (r) => r.medianSecondsToEmail,
      render: (r) =>
        r.medianSecondsToEmail === null ? '—' : formatDuration(r.medianSecondsToEmail),
      better: 'lower',
    },
  ] satisfies Column[];

export const bestValue = (
  rows: VersionAnalytics[],
  column: Pick<Column, 'value' | 'better'>,
): number | null => {
  if (column.better === 'none') {
    return null;
  }
  const values = rows.map(column.value).filter((value): value is number => value !== null);
  if (values.length < 2) {
    return null;
  }
  const best = column.better === 'higher' ? Math.max(...values) : Math.min(...values);
  return values.filter((value) => value === best).length === 1 ? best : null;
};

export const ComparisonTable = ({
  rows,
  versions,
  hasMessageStep,
}: {
  rows: VersionAnalytics[];
  versions: Version[];
  hasMessageStep: boolean;
}) => {
  const sorted = [...rows].sort((a, b) => b.number - a.number);
  const cols = columns(hasMessageStep);
  return (
    <div className="tbl cmp" style={{ marginBottom: 18 }}>
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Published</th>
            {cols.map((column) => (
              <th key={column.title}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const version = versions.find((item) => item.id === row.versionId);
            return (
              <tr key={row.versionId}>
                <td>
                  <b>v{row.number}</b> {version?.isActive ? <Pill tone="ok">active</Pill> : null}
                </td>
                <td className="mono">
                  {version === undefined ? '—' : formatDate(version.publishedAt)}
                </td>
                {cols.map((column) => {
                  const best = bestValue(sorted, column);
                  const value = column.value(row);
                  return (
                    <td
                      key={column.title}
                      className={best !== null && value === best ? 'best' : undefined}
                    >
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
