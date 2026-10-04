import type { WaitForReplyStep } from '@comment-automations/shared';
import { ErrorText, issueAt } from './issues.js';
import type { StepProps } from './steps.js';
import { Counter, platformName, TextBox } from './steps.js';

const HOURS = [1, 2, 4, 6, 12, 24, 48, 72, 96, 168];

const HoursSelect = ({
  value,
  label,
  readOnly,
  onChange,
}: {
  value: number;
  label: string;
  readOnly: boolean;
  onChange: (hours: number) => void;
}) => (
  <select
    className="select"
    style={{ width: 130 }}
    aria-label={label}
    value={value}
    disabled={readOnly}
    onChange={(event) => onChange(Number(event.target.value))}
  >
    {(HOURS.includes(value) ? HOURS : [...HOURS, value].sort((a, b) => a - b)).map((hours) => (
      <option key={hours} value={hours}>
        {hours} hours
      </option>
    ))}
  </select>
);

export const WaitStep = ({
  step,
  caps,
  issues,
  path,
  readOnly,
  stepsAfter,
  onChange,
}: StepProps<WaitForReplyStep> & { stepsAfter: number }) => {
  const limits = caps.record.messageLimits;
  const noun = step.expect === 'email' ? 'an email' : 'an answer';
  const reminderError = issueAt(issues, `${path}.reminder.text`);
  const reminderDelayError = issueAt(issues, `${path}.reminder.afterHours`);
  const nudgeError = issueAt(issues, `${path}.nudge.text`);
  const giveUpError = issueAt(issues, `${path}.giveUpHours`);
  const success = step.expect === 'email' ? 'When the email arrives' : 'When they reply';
  return (
    <>
      <div className="field" style={{ margin: '0 0 14px' }}>
        <label style={{ fontWeight: 600, fontSize: 13 }}>Waiting for</label>
        <span className="seg">
          {(['email', 'any'] as const).map((expect) => (
            <span
              key={expect}
              className={step.expect === expect ? 'on' : readOnly ? 'dim' : ''}
              onClick={() => {
                if (!readOnly) {
                  onChange({ ...step, expect });
                }
              }}
            >
              {expect === 'email' ? 'An email address' : 'Any reply'}
            </span>
          ))}
        </span>
      </div>
      <div className="field" style={{ margin: '0 0 14px' }}>
        <label style={{ fontWeight: 600, fontSize: 13 }}>If they don’t reply at all</label>
        {caps.canRemindBeforeReply ? (
          <>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span>after</span>
              <HoursSelect
                label="Reminder after"
                value={step.reminder?.afterHours ?? 12}
                readOnly={readOnly || step.reminder === undefined}
                onChange={(afterHours) =>
                  onChange({ ...step, reminder: { text: step.reminder?.text ?? '', afterHours } })
                }
              />
              <select
                className="select"
                style={{ width: 200 }}
                aria-label="Reminder"
                value={step.reminder === undefined ? 'none' : 'once'}
                disabled={readOnly}
                onChange={(event) =>
                  onChange({
                    ...step,
                    reminder:
                      event.target.value === 'once' ? { afterHours: 12, text: '' } : undefined,
                  })
                }
              >
                <option value="once">send a reminder once</option>
                <option value="none">send nothing</option>
              </select>
            </div>
            <ErrorText text={reminderDelayError} />
            {step.reminder === undefined ? null : (
              <div style={{ marginTop: 8 }}>
                <TextBox
                  label="Reminder text"
                  value={step.reminder.text}
                  placeholder="Still want the pricing sheet? Reply with your email and I’ll send it right over."
                  error={reminderError}
                  readOnly={readOnly}
                  onChange={(text) => onChange({ ...step, reminder: { ...step.reminder!, text } })}
                />
                <ErrorText text={reminderError} />
                <Counter text={step.reminder.text} limits={limits} />
              </div>
            )}
          </>
        ) : (
          <div className="hint">
            Wait for their first reply. {platformName(caps)} lets you message again only after they
            write back.
          </div>
        )}
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <span>Give up after</span>
          <HoursSelect
            label="Give up after"
            value={step.giveUpHours}
            readOnly={readOnly}
            onChange={(giveUpHours) => onChange({ ...step, giveUpHours })}
          />
          <span className="hint">· the run ends as expired</span>
        </div>
        <ErrorText text={giveUpError} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label style={{ fontWeight: 600, fontSize: 13 }}>If they reply without {noun}</label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <select
            className="select"
            style={{ width: 150 }}
            aria-label="If they reply without the expected content"
            value={step.nudge === undefined ? 'none' : 'ask'}
            disabled={readOnly}
            onChange={(event) =>
              onChange({
                ...step,
                nudge: event.target.value === 'ask' ? { text: '', then: 'wait' } : undefined,
              })
            }
          >
            <option value="ask">Ask once more</option>
            <option value="none">Keep waiting</option>
          </select>
          {step.nudge === undefined ? null : (
            <>
              <span>then</span>
              <select
                className="select"
                style={{ width: 170 }}
                aria-label="After asking once more"
                value={step.nudge.then}
                disabled={readOnly}
                onChange={(event) =>
                  onChange({
                    ...step,
                    nudge: { ...step.nudge!, then: event.target.value as 'wait' | 'end' },
                  })
                }
              >
                <option value="wait">keep waiting</option>
                <option value="end">end the run</option>
              </select>
            </>
          )}
        </div>
        {step.nudge === undefined ? null : (
          <div style={{ marginTop: 8 }}>
            <TextBox
              label="Ask once more text"
              value={step.nudge.text}
              placeholder="No worries! Just the email address is enough, e.g. name@example.com"
              error={nudgeError}
              readOnly={readOnly}
              onChange={(text) => onChange({ ...step, nudge: { ...step.nudge!, text } })}
            />
            <ErrorText text={nudgeError} />
            <Counter text={step.nudge.text} limits={limits} />
          </div>
        )}
      </div>
      <div className="field" style={{ margin: '14px 0 0' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ok)' }}>
          {stepsAfter === 0
            ? `${success}, the run ends. Add a step below to answer them.`
            : `${success}, the ${stepsAfter === 1 ? 'next step runs' : 'next steps run'}.`}
        </div>
      </div>
    </>
  );
};
