import type { CapabilitiesResponse } from '@comment-automations/api-schema';
import type { Step, StepKind, Trigger } from '@comment-automations/shared';
import { deliveredAsPrivateReply } from '@comment-automations/shared';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const [upward, setUpward] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || buttonRef.current === null || menuRef.current === null) {
      return;
    }
    const button = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const below = window.innerHeight - button.bottom;
    const above = button.top;
    const opensUpward = below < menuHeight && above > below;
    setUpward(opensUpward);
    if (!opensUpward) {
      menuRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open]);
  const kinds = nextAllowedStepKinds(caps.record, trigger, steps);
  const privateReply = deliveredAsPrivateReply(caps.record, trigger, steps);
  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        className="addstep"
        style={{ width: '100%' }}
        onClick={() => setOpen((value) => !value)}
      >
        + Add step
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          style={upward ? { top: 'auto', bottom: 'calc(100% + 6px)' } : undefined}
        >
          {kinds.map((kind) => {
            const entry = paletteEntry(kind, caps, privateReply);
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
