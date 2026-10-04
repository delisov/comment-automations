import type { RunDetail, RunLogEntry, RunStatus } from '@comment-automations/api-schema';
import type { RunId } from '@comment-automations/shared';
import { useCallback, useState } from 'react';
import type { Version } from '../api/client.js';
import { api, ApiError } from '../api/client.js';
import { stepTitle } from '../editor/steps.js';
import { formatDateTime, formatTime } from '../format.js';
import type { PillTone, ToastMessage } from '../ui.js';
import { Button, Callout, Pill, Toast } from '../ui.js';
import { useAsync } from '../useAsync.js';

export const statusLabel: Record<RunStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for a reply',
  completed: 'Completed',
  failed: 'Failed',
  expired: 'Expired',
  superseded: 'Superseded',
  stopped: 'Stopped',
};

export const statusTone: Record<RunStatus, PillTone> = {
  running: 'info',
  waiting: 'wait',
  completed: 'ok',
  failed: 'bad',
  expired: 'plain',
  superseded: 'plain',
  stopped: 'plain',
};

const entryTone = (entry: RunLogEntry, status: RunStatus, last: boolean): string => {
  if (entry.level === 'error') {
    return 'bad';
  }
  if (entry.level === 'warn') {
    return 'wait';
  }
  if (last && (status === 'waiting' || status === 'running')) {
    return 'wait';
  }
  if (last && (status === 'expired' || status === 'superseded' || status === 'stopped')) {
    return 'mute';
  }
  return 'ok';
};

const sameDay = (a: string, b: string): boolean => a.slice(0, 10) === b.slice(0, 10);

export const RunDrawer = ({
  runId,
  versions,
  onClose,
  onChanged,
}: {
  runId: RunId;
  versions: Version[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const run = useAsync(() => api.run(runId), [runId]);
  const stepTitles =
    versions
      .find((version) => version.number === run.data?.versionNumber)
      ?.definition?.steps.map(stepTitle) ?? [];
  const [stopping, setStopping] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const stop = async (detail: RunDetail) => {
    setStopping(true);
    try {
      run.setData(await api.stopRun(detail.id));
      onChanged();
    } catch (failure) {
      setToast({
        tone: 'bad',
        text:
          failure instanceof ApiError
            ? failure.message
            : 'Couldn’t stop the run. Check your connection and try again.',
      });
    } finally {
      setStopping(false);
    }
  };
  return (
    <div className="drawer" role="dialog" aria-label="Run">
      <span className="close" role="button" aria-label="Close" onClick={onClose}>
        ✕
      </span>
      {run.status === 'loading' && run.data === undefined ? (
        <>
          <div className="skel" style={{ width: '40%' }} />
          <div className="skel" style={{ width: '70%' }} />
        </>
      ) : run.status === 'error' ? (
        <Callout tone="bad" title="Couldn’t load the run">
          {run.error.message}
        </Callout>
      ) : run.data === undefined ? null : (
        <>
          <h3>{run.data.contactHandle}</h3>
          <div className="row" style={{ marginTop: 6 }}>
            <Pill tone={statusTone[run.data.status]}>{statusLabel[run.data.status]}</Pill>
            <span className="hint">v{run.data.versionNumber}</span>
          </div>
          <div className="kv">
            <span>Started</span>
            <span>{formatDateTime(run.data.startedAt)}</span>
            {run.data.finishedAt === null ? null : (
              <>
                <span>Finished</span>
                <span>{formatDateTime(run.data.finishedAt)}</span>
              </>
            )}
            <span>Progress</span>
            <span>
              {run.data.status === 'completed'
                ? `${run.data.stepCount} of ${run.data.stepCount}`
                : `Step ${Math.min(run.data.stepIndex + 1, run.data.stepCount)} of ${run.data.stepCount}${
                    stepTitles[run.data.stepIndex] === undefined
                      ? ''
                      : ` · ${stepTitles[run.data.stepIndex]}`
                  }`}
            </span>
            {run.data.context.captured.email === undefined ? null : (
              <>
                <span>Email captured</span>
                <span>{run.data.context.captured.email}</span>
              </>
            )}
            <span>Replied</span>
            <span>{run.data.context.replied ? 'yes' : 'not yet'}</span>
          </div>
          <ul className="tl">
            {run.data.timeline.map((entry, index) => (
              <li
                key={index}
                className={entryTone(
                  entry,
                  run.data!.status,
                  index === run.data!.timeline.length - 1,
                )}
              >
                <time>
                  {sameDay(entry.at, run.data!.startedAt)
                    ? formatTime(entry.at)
                    : formatDateTime(entry.at)}
                </time>
                {entry.message}
              </li>
            ))}
            {stepTitles.slice(run.data.stepIndex + 1).map((title) =>
              run.data!.status === 'running' || run.data!.status === 'waiting' ? (
                <li key={title} className="mute">
                  <time></time>
                  {title}
                </li>
              ) : null,
            )}
          </ul>
          {run.data.error === undefined ? null : (
            <Callout tone="warn" title="What to do" className="outage">
              {run.data.error.message}
            </Callout>
          )}
          {run.data.status === 'waiting' || run.data.status === 'running' ? (
            <div className="row" style={{ marginTop: 16 }}>
              <Button kind="ghost" small disabled={stopping} onClick={() => stop(run.data!)}>
                {stopping ? 'Stopping…' : 'Stop this run'}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
};
