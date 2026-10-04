import type { CapabilitiesResponse } from '@comment-automations/api-schema';
import type { Step, StepKind, Trigger } from '@comment-automations/shared';
import { useState } from 'react';
import { nextAllowedStepKinds } from './stepRules.js';
import { paletteEntry } from './steps.js';

export const StepPalette = ({
  caps,
  trigger,
  steps,
  onPick,
}: {
  caps: CapabilitiesResponse;
  trigger: Trigger;
  steps: Step[];
  onPick: (kind: StepKind) => void;
}) => {
  const [open, setOpen] = useState(false);
  const kinds = nextAllowedStepKinds(caps.record, trigger, steps);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="addstep"
        style={{ width: '100%' }}
        onClick={() => setOpen((value) => !value)}
      >
        + Add step
      </button>
      {open ? (
        <div className="menu" role="menu">
          {kinds.map((kind) => {
            const entry = paletteEntry(kind, caps);
            return (
              <div
                key={kind}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(kind);
                }}
              >
                <b>{entry.title}</b>
                <small>{entry.subtitle}</small>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
