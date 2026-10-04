import type { CapabilitiesResponse, ValidationIssue } from '@comment-automations/api-schema';
import type { Step, Trigger, WaitForReplyStep } from '@comment-automations/shared';
import { deliveredAsPrivateReply } from '@comment-automations/shared';
import { useState } from 'react';
import { IssueTexts, issuesUnder } from './issues.js';
import { waitBeforeMessage } from './stepRules.js';
import { StepPalette } from './StepPalette.js';
import {
  fieldIssuePaths,
  MessageStep,
  newStep,
  ReplyStep,
  stepTitle,
  WebhookStep,
} from './steps.js';
import { WaitStep } from './WaitStep.js';

const StepMenu = ({
  index,
  count,
  onMove,
  onDuplicate,
  onDelete,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="act">
      <button
        type="button"
        aria-label={`Step ${index + 1} actions`}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮
      </button>
      {open ? (
        <div className="stepmenu" role="menu" onClick={() => setOpen(false)}>
          <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>
            Move up
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            Move down
          </button>
          <button type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
    </span>
  );
};

const StepBody = ({
  step,
  caps,
  issues,
  path,
  readOnly,
  privateReply,
  afterWait,
  stepsAfter,
  onChange,
}: {
  step: Step;
  caps: CapabilitiesResponse;
  issues: ValidationIssue[];
  path: string;
  readOnly: boolean;
  privateReply: boolean;
  afterWait: WaitForReplyStep['expect'] | null;
  stepsAfter: number;
  onChange: (step: Step) => void;
}) => {
  const common = { caps, issues, path, readOnly };
  switch (step.kind) {
    case 'reply_to_comment':
      return <ReplyStep {...common} step={step} onChange={onChange} />;
    case 'send_message':
      return (
        <MessageStep
          {...common}
          step={step}
          privateReply={privateReply}
          afterWait={afterWait}
          onChange={onChange}
        />
      );
    case 'wait_for_reply':
      return <WaitStep {...common} step={step} stepsAfter={stepsAfter} onChange={onChange} />;
    case 'call_webhook':
      return <WebhookStep {...common} step={step} onChange={onChange} />;
  }
};

export const StepsCard = ({
  steps,
  trigger,
  caps,
  issues,
  readOnly,
  onChange,
}: {
  steps: Step[];
  trigger: Trigger;
  caps: CapabilitiesResponse;
  issues: ValidationIssue[];
  readOnly: boolean;
  onChange: (steps: Step[]) => void;
}) => {
  const move = (from: number, to: number) => {
    const next = [...steps];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step as Step);
    onChange(next);
  };
  const listIssues = issues.filter((issue) => issue.path === 'steps');
  return (
    <div className={listIssues.length > 0 ? 'card err' : 'card'}>
      <h3>Then…</h3>
      <IssueTexts issues={listIssues} />
      <div className="steps">
        {steps.map((step, index) => {
          const path = `steps.${index}`;
          const stepIssues = issuesUnder(issues, path);
          const fieldPaths = fieldIssuePaths(step).map((field) => `${path}.${field}`);
          const headerIssues = stepIssues.filter((issue) => !fieldPaths.includes(issue.path));
          const orphanReply = step.kind === 'reply_to_comment' && trigger.comments === undefined;
          return (
            <div key={index}>
              {index === 0 ? null : <div className="connector" />}
              <div className={stepIssues.length > 0 || orphanReply ? 'step err' : 'step'}>
                <div className="t">
                  <span>
                    <span className="n">{index + 1}</span>
                    <b>{stepTitle(step)}</b>
                  </span>
                  {readOnly ? null : (
                    <StepMenu
                      index={index}
                      count={steps.length}
                      onMove={(to) => move(index, to)}
                      onDuplicate={() => {
                        const next = [...steps];
                        next.splice(index + 1, 0, structuredClone(step));
                        onChange(next);
                      }}
                      onDelete={() => onChange(steps.filter((_, i) => i !== index))}
                    />
                  )}
                </div>
                {orphanReply ? (
                  <div className="errtext" style={{ marginBottom: 8 }}>
                    Needs the comments trigger
                  </div>
                ) : null}
                {headerIssues.length === 0 ? null : (
                  <div style={{ marginBottom: 8 }}>
                    <IssueTexts issues={headerIssues} />
                  </div>
                )}
                <StepBody
                  step={step}
                  caps={caps}
                  issues={stepIssues}
                  path={path}
                  readOnly={readOnly}
                  privateReply={deliveredAsPrivateReply(
                    caps.record,
                    trigger,
                    steps.slice(0, index),
                  )}
                  afterWait={waitBeforeMessage(steps.slice(0, index))?.expect ?? null}
                  stepsAfter={steps.length - index - 1}
                  onChange={(changed) => onChange(steps.map((s, i) => (i === index ? changed : s)))}
                />
              </div>
            </div>
          );
        })}
        {readOnly ? null : (
          <>
            {steps.length === 0 ? null : <div className="connector" />}
            <StepPalette
              caps={caps}
              trigger={trigger}
              steps={steps}
              onPick={(kind) => onChange([...steps, newStep(kind, caps)])}
            />
          </>
        )}
      </div>
    </div>
  );
};
