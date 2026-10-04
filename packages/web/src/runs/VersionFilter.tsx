import type { VersionId } from '@comment-automations/shared';
import { useState } from 'react';
import type { Version } from '../api/client.js';

export const VersionFilter = ({
  versions,
  selected,
  counts,
  onChange,
}: {
  versions: Version[];
  selected: VersionId[];
  counts: Map<number, number> | null;
  onChange: (selected: VersionId[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const sorted = [...versions].sort((a, b) => b.number - a.number);
  const all = selected.length === 0 || selected.length === versions.length;
  const label = all
    ? 'All versions'
    : `Versions: ${sorted
        .filter((version) => selected.includes(version.id))
        .map((version) => `v${version.number}`)
        .join(', ')}`;
  const toggle = (id: VersionId) => {
    const base = all ? versions.map((version) => version.id) : selected;
    const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    onChange(next.length === versions.length ? [] : next);
  };
  return (
    <span className="vsel">
      <button
        type="button"
        className={all ? 'trig' : 'trig on'}
        aria-label="Filter by version"
        onClick={() => setOpen((value) => !value)}
      >
        {label} <span>▾</span>
      </button>
      {open ? (
        <div className="dd" role="listbox">
          {sorted.map((version) => {
            const on = all || selected.includes(version.id);
            return (
              <div
                key={version.id}
                role="option"
                aria-selected={on}
                onClick={() => toggle(version.id)}
              >
                <i className={on ? 'on' : ''}>{on ? '✓' : ''}</i>v{version.number}
                {version.isActive ? ' · active' : ''}
                {counts === null ? null : <small>{counts.get(version.number) ?? 0} runs</small>}
              </div>
            );
          })}
          <div className="foot">
            <span onClick={() => onChange([])}>Select all</span>
            <span onClick={() => onChange(sorted.slice(0, 1).map((version) => version.id))}>
              Clear
            </span>
          </div>
        </div>
      ) : null}
    </span>
  );
};
