import type { AutomationDetail, RunStatus } from '@comment-automations/api-schema';
import type { RunId, VersionId } from '@comment-automations/shared';
import { useState } from 'react';
import type { Version } from '../api/client.js';
import { api } from '../api/client.js';
import { formatDateTime, listWords } from '../format.js';
import { Button, Callout, Empty, Pill, Skeleton } from '../ui.js';
import { useAsync } from '../useAsync.js';
import { RunDrawer, statusLabel, statusTone } from './RunDrawer.js';
import { VersionFilter } from './VersionFilter.js';

const STATUSES: RunStatus[] = [
  'running',
  'waiting',
  'completed',
  'failed',
  'expired',
  'superseded',
  'stopped',
];

export const RunsTab = ({
  automation,
  versions,
  keywords,
  handle,
  stepTitles,
  onOpenWiki,
}: {
  automation: AutomationDetail;
  versions: Version[];
  keywords: string[];
  handle: string;
  stepTitles: string[];
  onOpenWiki: () => void;
}) => {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<VersionId[]>([]);
  const [contact, setContact] = useState('');
  const [openRun, setOpenRun] = useState<RunId | null>(null);
  const filter = {
    status: status === null ? undefined : [status],
    versionIds: selectedVersions.length === 0 ? undefined : selectedVersions,
    contact: contact.trim() === '' ? undefined : contact.trim(),
    limit: 200,
  };
  const runs = useAsync(
    () => api.runs(automation.id, filter),
    [automation.id, status, selectedVersions.join(','), contact.trim()],
  );
  const allRuns = useAsync(() => api.runs(automation.id, { limit: 200 }), [automation.id]);
  const counts = new Map<number, number>();
  for (const run of allRuns.data?.runs ?? []) {
    counts.set(run.versionNumber, (counts.get(run.versionNumber) ?? 0) + 1);
  }
  const unfiltered = status === null && selectedVersions.length === 0 && contact.trim() === '';
  const list = runs.data?.runs ?? [];
  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={status === null ? 'pill info btnpill' : 'pill btnpill'}
          style={{ fontWeight: 500 }}
          onClick={() => setStatus(null)}
        >
          All
        </button>
        {STATUSES.map((item) => (
          <button
            key={item}
            type="button"
            className={status === item ? 'pill info btnpill' : 'pill btnpill'}
            style={{ fontWeight: 500 }}
            onClick={() => setStatus(item)}
          >
            {statusLabel[item].replace(' for a reply', '')}
          </button>
        ))}
        {versions.length > 0 ? (
          <span style={{ marginLeft: 6 }}>
            <VersionFilter
              versions={versions}
              selected={selectedVersions}
              counts={allRuns.data === undefined ? null : counts}
              onChange={setSelectedVersions}
            />
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <input
          className="input"
          style={{ maxWidth: 220, padding: '7px 10px', fontSize: 13 }}
          placeholder="Search by person"
          aria-label="Search by person"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        />
      </div>
      {runs.status === 'error' ? (
        <Callout tone="bad" title="Couldn’t load the runs" className="outage">
          {runs.error.message}
        </Callout>
      ) : null}
      {runs.status === 'loading' && runs.data === undefined ? (
        <Skeleton rows={4} />
      ) : list.length === 0 ? (
        unfiltered ? (
          <Empty
            title="No runs yet"
            text={
              keywords.length === 0
                ? `Runs appear here the moment someone writes to ${handle}.`
                : `Runs appear here the moment someone comments ${listWords(
                    keywords.map((word) => `"${word}"`),
                  )} on a post of ${handle}.`
            }
            action={
              <Button kind="sec" onClick={onOpenWiki}>
                How to test it
              </Button>
            }
          />
        ) : (
          <Empty title="No runs match" text="Change the filters or clear the search." />
        )
      ) : (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Started</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((run) => (
                <tr key={run.id} className="link" onClick={() => setOpenRun(run.id)}>
                  <td>
                    <b>{run.contactHandle}</b>
                  </td>
                  <td className="mono">{formatDateTime(run.startedAt)}</td>
                  <td>
                    <Pill tone={statusTone[run.status]}>{statusLabel[run.status]}</Pill>
                  </td>
                  <td>
                    {run.status === 'completed'
                      ? `${run.stepCount} of ${run.stepCount}`
                      : `${Math.min(run.stepIndex + 1, run.stepCount)} of ${run.stepCount}`}
                    {run.error === undefined ? '' : ` · ${run.error.message}`}
                  </td>
                  <td className="mono">v{run.versionNumber}</td>
                  <td style={{ color: '#9ca3af' }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openRun === null ? null : (
        <RunDrawer
          runId={openRun}
          stepTitles={stepTitles}
          onClose={() => setOpenRun(null)}
          onChanged={runs.reload}
        />
      )}
    </>
  );
};
