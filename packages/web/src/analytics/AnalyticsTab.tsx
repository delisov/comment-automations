import type { AutomationDetail, DayAnalytics } from '@comment-automations/api-schema';
import type { VersionId } from '@comment-automations/shared';
import { useState } from 'react';
import type { Version } from '../api/client.js';
import { api } from '../api/client.js';
import { formatCount, formatDate, formatPercent } from '../format.js';
import { VersionFilter } from '../runs/VersionFilter.js';
import { Callout, Empty, Skeleton } from '../ui.js';
import { useAsync } from '../useAsync.js';
import { ComparisonTable } from './ComparisonTable.js';

const Chart = ({ days, twoSeries }: { days: DayAnalytics[]; twoSeries: boolean }) => {
  const max = Math.max(1, ...days.map((day) => day.started));
  const width = 1000;
  const height = 112;
  const slot = width / Math.max(1, days.length);
  const gap = Math.min(6, slot * 0.15);
  const barWidth = twoSeries ? (slot - gap) / 2 : slot - gap;
  return (
    <div className="chart" role="img" aria-label="Runs per day">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {days.map((day, index) => {
          const x = index * slot;
          const startedHeight = (day.started / max) * height;
          const emailsHeight = (day.emailsCaptured / max) * height;
          return (
            <g key={day.day}>
              <title>
                {formatDate(day.day)}: {day.started} started, {day.emailsCaptured} emails
              </title>
              <rect
                x={x}
                y={height - startedHeight}
                width={barWidth}
                height={startedHeight}
                rx={3}
                fill="#c4b5fd"
              />
              {twoSeries ? (
                <rect
                  x={x + barWidth}
                  y={height - emailsHeight}
                  width={barWidth}
                  height={emailsHeight}
                  rx={3}
                  fill="#7c3aed"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="stat">
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

export const AnalyticsTab = ({
  automation,
  versions,
  hasMessageStep,
}: {
  automation: AutomationDetail;
  versions: Version[];
  hasMessageStep: boolean;
}) => {
  const [selected, setSelected] = useState<VersionId[]>([]);
  const analytics = useAsync(
    () => api.analytics(automation.id, selected),
    [automation.id, selected.join(',')],
  );
  const rows = analytics.data?.perVersion ?? [];
  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const started = sum((row) => row.started);
  const replied = sum((row) => row.replied);
  const completed = sum((row) => row.completed);
  const emails = sum((row) => row.emailsCaptured);
  const failed = sum((row) => row.failed);
  const rate = (part: number) => (started === 0 ? '0%' : formatPercent(part / started));
  const comparing = rows.length >= 2 && selected.length >= 2;
  const scope =
    selected.length === 0
      ? 'all versions'
      : versions
          .filter((version) => selected.includes(version.id))
          .sort((a, b) => b.number - a.number)
          .map((version) => `v${version.number}`)
          .join(', ');
  return (
    <>
      {versions.length > 0 ? (
        <div className="row" style={{ marginBottom: 14 }}>
          <VersionFilter
            versions={versions}
            selected={selected}
            counts={null}
            onChange={setSelected}
          />
        </div>
      ) : null}
      {analytics.status === 'error' ? (
        <Callout tone="bad" title="Couldn’t load the analytics" className="outage">
          {analytics.error.message}
        </Callout>
      ) : analytics.status === 'loading' && analytics.data === undefined ? (
        <Skeleton rows={3} />
      ) : versions.length === 0 ? (
        <Empty title="No data yet" text="Publish the automation to start collecting numbers." />
      ) : started === 0 ? (
        <Empty title="No data yet" text="Numbers appear here after the first run." />
      ) : (
        <>
          {comparing ? (
            <ComparisonTable rows={rows} versions={versions} hasMessageStep={hasMessageStep} />
          ) : (
            <div
              className="stats"
              style={{ gridTemplateColumns: `repeat(${hasMessageStep ? 5 : 4},1fr)` }}
            >
              <Stat value={formatCount(started)} label={`Started · ${scope}`} />
              {hasMessageStep ? (
                <Stat
                  value={rate(replied)}
                  label={`Reply rate · ${formatCount(replied)} replied to the first message`}
                />
              ) : null}
              <Stat value={formatCount(completed)} label={`Completed · ${rate(completed)}`} />
              <Stat value={formatCount(emails)} label={`Emails captured · ${rate(emails)}`} />
              <Stat value={formatCount(failed)} label="Failed" />
            </div>
          )}
          <Chart days={analytics.data?.perDay ?? []} twoSeries={comparing} />
          {comparing ? (
            <div className="legend">
              <span>
                <i style={{ background: '#c4b5fd' }} />
                Started
              </span>
              <span>
                <i style={{ background: '#7c3aed' }} />
                Emails captured
              </span>
              <span style={{ marginLeft: 'auto' }}>
                Per day, selected versions combined. Green cells mark the better value.
              </span>
            </div>
          ) : (
            <div className="hint" style={{ marginTop: 8 }}>
              Runs per day.{' '}
              {hasMessageStep
                ? 'Reply rate is the share of started runs where the person answered the first message. '
                : ''}
              Expired and superseded runs count as started, not as completed or failed.
            </div>
          )}
        </>
      )}
    </>
  );
};
