import type { CapabilitiesResponse, ValidationIssue } from '@comment-automations/api-schema';
import type {
  CallWebhookStep,
  ReplyToCommentStep,
  SendMessageStep,
  Step,
  StepKind,
  WebhookMethod,
} from '@comment-automations/shared';
import { WEBHOOK_METHODS } from '@comment-automations/shared';
import { byteCount, charCount, formatCount } from '../format.js';
import { platformLabel } from '../ui.js';
import { ErrorText, issueAt } from './issues.js';

export type StepProps<S extends Step> = {
  step: S;
  caps: CapabilitiesResponse;
  issues: ValidationIssue[];
  path: string;
  readOnly: boolean;
  onChange: (step: S) => void;
};

export const stepTitle = (step: Step): string => {
  switch (step.kind) {
    case 'reply_to_comment':
      return 'Reply to the comment';
    case 'send_message':
      return 'Send a message';
    case 'wait_for_reply':
      return step.expect === 'email' ? 'Wait for an email address' : 'Wait for a reply';
    case 'call_webhook':
      return 'Send to a webhook';
  }
};

export const paletteEntry = (
  kind: StepKind,
  caps: CapabilitiesResponse,
): { title: string; subtitle: string } => {
  switch (kind) {
    case 'reply_to_comment':
      return { title: 'Reply to the comment', subtitle: 'Public reply in the thread' };
    case 'send_message': {
      const buttons = caps.record.messageLimits.buttons;
      return {
        title: 'Send a message',
        subtitle:
          buttons > 0
            ? `Direct message with text and up to ${buttons} buttons`
            : 'Direct message with text',
      };
    }
    case 'wait_for_reply':
      return {
        title: 'Wait for a reply',
        subtitle: 'Continue when they answer, optionally capture an email',
      };
    case 'call_webhook':
      return { title: 'Send to a webhook', subtitle: 'Post what was collected to your CRM' };
  }
};

export const newStep = (kind: StepKind, caps: CapabilitiesResponse): Step => {
  switch (kind) {
    case 'reply_to_comment':
      return { kind, text: '' };
    case 'send_message':
      return caps.requiresUnreachableChoice
        ? { kind, text: '', buttons: [], onUnreachable: 'publicReplyInstead', fallbackText: '' }
        : { kind, text: '', buttons: [] };
    case 'wait_for_reply':
      return { kind, expect: 'email', giveUpHours: 72, nudge: { text: '', then: 'wait' } };
    case 'call_webhook':
      return { kind, method: 'POST', url: '', headers: {} };
  }
};

export const Counter = ({
  text,
  limits,
}: {
  text: string;
  limits: { maxChars: number; maxBytes?: number };
}) => {
  const chars = charCount(text);
  const bytes = byteCount(text);
  const overBytes = limits.maxBytes !== undefined && bytes > limits.maxBytes;
  const over = chars > limits.maxChars || overBytes;
  return (
    <div className="counter" style={over ? { color: '#b91c1c' } : undefined}>
      {overBytes && limits.maxBytes !== undefined
        ? `${formatCount(bytes)} / ${formatCount(limits.maxBytes)} bytes`
        : `${formatCount(chars)} / ${formatCount(limits.maxChars)}${over ? ' characters' : ''}`}
    </div>
  );
};

export const TextBox = ({
  value,
  placeholder,
  error,
  readOnly,
  onChange,
  label,
}: {
  value: string;
  placeholder: string;
  error: string | null;
  readOnly: boolean;
  onChange: (value: string) => void;
  label: string;
}) => (
  <textarea
    className={error === null ? 'msg' : 'msg input err'}
    aria-label={label}
    value={value}
    placeholder={placeholder}
    readOnly={readOnly}
    onChange={(event) => onChange(event.target.value)}
  />
);

export const ReplyStep = ({
  step,
  caps,
  issues,
  path,
  readOnly,
  onChange,
}: StepProps<ReplyToCommentStep>) => {
  const error = issueAt(issues, `${path}.text`);
  return (
    <>
      <TextBox
        label="Reply text"
        value={step.text}
        placeholder="Sent you a DM! 📩"
        error={error}
        readOnly={readOnly}
        onChange={(text) => onChange({ ...step, text })}
      />
      <ErrorText text={error} />
      <Counter text={step.text} limits={caps.record.replyLimits} />
    </>
  );
};

const unreachableChoices: {
  value: NonNullable<SendMessageStep['onUnreachable']>;
  label: string;
}[] = [
  { value: 'publicReplyInstead', label: 'Reply to the comment instead' },
  { value: 'skip', label: 'Skip this step' },
  { value: 'fail', label: 'Stop the run' },
];

export const MessageStep = ({
  step,
  caps,
  issues,
  path,
  readOnly,
  onChange,
}: StepProps<SendMessageStep>) => {
  const limits = caps.record.messageLimits;
  const error = issueAt(issues, `${path}.text`);
  const fallbackError = issueAt(issues, `${path}.fallbackText`);
  const buttonsError = issueAt(issues, `${path}.buttons`);
  const setButton = (index: number, patch: Partial<SendMessageStep['buttons'][number]>) =>
    onChange({
      ...step,
      buttons: step.buttons.map((button, i) => (i === index ? { ...button, ...patch } : button)),
    });
  return (
    <>
      <TextBox
        label="Message text"
        value={step.text}
        placeholder="Hey! Reply with your email and I’ll send you the pricing sheet."
        error={error}
        readOnly={readOnly}
        onChange={(text) => onChange({ ...step, text })}
      />
      <ErrorText text={error} />
      <Counter text={step.text} limits={limits} />
      {step.buttons.map((button, index) => (
        <div key={index} className="btnrow">
          <span className="btnlike" style={{ margin: 0 }}>
            {button.title === '' ? 'Button' : button.title}
          </span>
          <input
            className={issueAt(issues, `${path}.buttons.${index}.title`) ? 'input err' : 'input'}
            aria-label={`Button ${index + 1} title`}
            placeholder="Title"
            maxLength={20}
            value={button.title}
            readOnly={readOnly}
            onChange={(event) => setButton(index, { title: event.target.value })}
          />
          <input
            className={
              issueAt(issues, `${path}.buttons.${index}.url`) ? 'input url err' : 'input url'
            }
            aria-label={`Button ${index + 1} url`}
            placeholder="https://"
            value={button.url}
            readOnly={readOnly}
            onChange={(event) => setButton(index, { url: event.target.value })}
          />
          {readOnly ? null : (
            <button
              type="button"
              className="addlink"
              onClick={() =>
                onChange({ ...step, buttons: step.buttons.filter((_, i) => i !== index) })
              }
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <ErrorText text={buttonsError} />
      {!readOnly && step.buttons.length < limits.buttons ? (
        <div className="meta">
          <button
            type="button"
            className="addlink"
            onClick={() =>
              onChange({ ...step, buttons: [...step.buttons, { title: '', url: '' }] })
            }
          >
            + Add a button
          </button>
          <span style={{ color: 'var(--faint)' }}> · up to {limits.buttons}, opens a link</span>
        </div>
      ) : null}
      {caps.requiresUnreachableChoice ? (
        <div className="meta" style={{ marginTop: 12 }}>
          <span style={{ display: 'inline-block', width: 220 }}>
            If this person can’t receive messages
          </span>{' '}
          <select
            className="select"
            aria-label="If this person can’t receive messages"
            style={{ display: 'inline-block', width: 300 }}
            value={step.onUnreachable ?? 'publicReplyInstead'}
            disabled={readOnly}
            onChange={(event) => {
              const onUnreachable = event.target.value as SendMessageStep['onUnreachable'];
              onChange({
                ...step,
                onUnreachable,
                fallbackText:
                  onUnreachable === 'publicReplyInstead' ? (step.fallbackText ?? '') : undefined,
              });
            }}
          >
            {unreachableChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          {step.onUnreachable === 'publicReplyInstead' ? (
            <div style={{ marginTop: 8 }}>
              <TextBox
                label="Public reply instead"
                value={step.fallbackText ?? ''}
                placeholder="The public reply to send instead"
                error={fallbackError}
                readOnly={readOnly}
                onChange={(fallbackText) => onChange({ ...step, fallbackText })}
              />
              <ErrorText text={fallbackError} />
              <Counter text={step.fallbackText ?? ''} limits={caps.record.replyLimits} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export const WebhookStep = ({
  step,
  issues,
  path,
  readOnly,
  onChange,
}: StepProps<CallWebhookStep>) => {
  const urlError = issueAt(issues, `${path}.url`);
  const headers = Object.entries(step.headers);
  const setHeaders = (entries: [string, string][]) =>
    onChange({ ...step, headers: Object.fromEntries(entries) });
  return (
    <>
      <div className="row">
        <span className="seg">
          {WEBHOOK_METHODS.map((method) => (
            <span
              key={method}
              className={method === step.method ? 'on' : readOnly ? 'dim' : ''}
              onClick={() => {
                if (!readOnly) {
                  onChange({ ...step, method: method as WebhookMethod });
                }
              }}
            >
              {method}
            </span>
          ))}
        </span>
        <input
          className={urlError === null ? 'input' : 'input err'}
          style={{ maxWidth: 420 }}
          aria-label="Webhook url"
          placeholder="https://hooks.example.com/leads"
          value={step.url}
          readOnly={readOnly}
          onChange={(event) => onChange({ ...step, url: event.target.value })}
        />
      </div>
      <ErrorText text={urlError} />
      {headers.map(([name, value], index) => (
        <div key={index} className="btnrow">
          <input
            className="input"
            aria-label={`Header ${index + 1} name`}
            placeholder="Header"
            value={name}
            readOnly={readOnly}
            onChange={(event) =>
              setHeaders(headers.map((h, i) => (i === index ? [event.target.value, h[1]] : h)))
            }
          />
          <input
            className="input url"
            aria-label={`Header ${index + 1} value`}
            placeholder="Value"
            value={value}
            readOnly={readOnly}
            onChange={(event) =>
              setHeaders(headers.map((h, i) => (i === index ? [h[0], event.target.value] : h)))
            }
          />
          {readOnly ? null : (
            <button
              type="button"
              className="addlink"
              onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="meta">
        Sends the contact, the captured email and the automation name as JSON.{' '}
        {readOnly ? null : (
          <button
            type="button"
            className="addlink"
            onClick={() => setHeaders([...headers, ['', '']])}
          >
            Add a header
          </button>
        )}
      </div>
    </>
  );
};

export const platformName = (caps: CapabilitiesResponse): string =>
  platformLabel(caps.record.platform);
