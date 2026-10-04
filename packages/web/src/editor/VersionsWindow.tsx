import type { RunSummary } from '@comment-automations/api-schema';
import type { Version } from '../api/client.js';
import { formatDateTime } from '../format.js';
import { Button, Pill } from '../ui.js';

export const versionState = (version: Version, activeNumber: number | null): string => {
  if (version.isActive) {
    return 'Active';
  }
  return activeNumber !== null && version.number > activeNumber ? 'Newer, not active' : 'Previous';
};

export const inProgressByVersion = (runs: RunSummary[]): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'waiting') {
      counts.set(run.versionNumber, (counts.get(run.versionNumber) ?? 0) + 1);
    }
  }
  return counts;
};

export const VersionsWindow = ({
  name,
  versions,
  hasDraft,
  inProgress,
  readOnly,
  onClose,
  onView,
  onMakeActive,
  onEditAsNew,
}: {
  name: string;
  versions: Version[];
  hasDraft: boolean;
  inProgress: Map<number, number>;
  readOnly: boolean;
  onClose: () => void;
  onView: (version: Version) => void;
  onMakeActive: (version: Version) => void;
  onEditAsNew: (version: Version) => void;
}) => {
  const active = versions.find((version) => version.isActive) ?? null;
  const sorted = [...versions].sort((a, b) => b.number - a.number);
  return (
    <div
      className="modal-bg"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="vers" role="dialog" aria-label="Versions">
        <span className="wclose" role="button" aria-label="Close" onClick={onClose}>
          ✕
        </span>
        <h3>Versions · {name}</h3>
        <div className="hint">
          Every publish creates a new version. Making an older version active keeps the newer ones.
          Editing the active version and publishing creates the next number. Runs finish on the
          version they started with.
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Published</th>
                <th>Change</th>
                <th>Runs on it</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hasDraft ? (
                <tr>
                  <td>
                    <b>Draft</b>
                  </td>
                  <td className="mono">unpublished</td>
                  <td>
                    {active === null ? 'Not published yet' : `Edits on top of v${active.number}`}
                  </td>
                  <td>—</td>
                  <td>
                    <Pill>Not published</Pill>
                  </td>
                  <td className="act">
                    <Button kind="sec" small onClick={onClose}>
                      Continue editing
                    </Button>
                  </td>
                </tr>
              ) : null}
              {sorted.map((version) => {
                const state = versionState(version, active?.number ?? null);
                const running = inProgress.get(version.number) ?? 0;
                return (
                  <tr key={version.id}>
                    <td>
                      <b>v{version.number}</b>
                    </td>
                    <td className="mono">{formatDateTime(version.publishedAt)}</td>
                    <td>{version.note === '' ? '—' : version.note}</td>
                    <td>{running > 0 ? `${running} in progress` : '—'}</td>
                    <td>
                      <Pill
                        tone={state === 'Active' ? 'ok' : state === 'Previous' ? 'plain' : 'info'}
                      >
                        {state}
                      </Pill>
                    </td>
                    <td className="act">
                      <Button kind="sec" small onClick={() => onView(version)}>
                        View
                      </Button>
                      {readOnly ? null : version.isActive ? (
                        <Button kind="sec" small onClick={() => onEditAsNew(version)}>
                          Edit as a new version
                        </Button>
                      ) : (
                        <Button small onClick={() => onMakeActive(version)}>
                          Make active
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
