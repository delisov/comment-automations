import type { CapabilityRecord, MessageLimits } from './capabilities.js';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  requiresUnreachableChoice,
} from './capabilities.js';
import type {
  CallWebhookStep,
  Definition,
  ReplyToCommentStep,
  SendMessageStep,
  Step,
  Trigger,
  WaitForReplyStep,
} from './definition.js';
import { WEBHOOK_METHODS } from './definition.js';
import { PLATFORM_LABELS } from './platform.js';

export type ValidationIssue = { path: string; code: string; message: string };

const charCount = (text: string): number => [...text].length;

const byteCount = (text: string): number => new TextEncoder().encode(text).length;

const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const textIssues = (
  text: string,
  path: string,
  limits: { maxChars: number; maxBytes?: number },
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (text.trim() === '') {
    issues.push({ path, code: 'TEXT_REQUIRED', message: 'Text must not be empty' });
  } else if (charCount(text) > limits.maxChars) {
    issues.push({
      path,
      code: 'TEXT_TOO_LONG',
      message: `Text is ${charCount(text)} characters, the limit is ${limits.maxChars}`,
    });
  }
  if (limits.maxBytes !== undefined && byteCount(text) > limits.maxBytes) {
    issues.push({
      path,
      code: 'TEXT_TOO_MANY_BYTES',
      message: `Text is ${byteCount(text)} bytes in UTF-8, the limit is ${limits.maxBytes}`,
    });
  }
  return issues;
};

const triggerIssues = (trigger: Trigger, record: CapabilityRecord): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const allowed = allowedTriggers(record);
  const label = PLATFORM_LABELS[record.platform];
  if (trigger.comments === undefined && trigger.messages === undefined) {
    issues.push({
      path: 'trigger',
      code: 'TRIGGER_REQUIRED',
      message: 'An automation needs a comments trigger or a messages trigger',
    });
  }
  if (trigger.comments !== undefined) {
    if (!allowed.comments) {
      issues.push({
        path: 'trigger.comments',
        code: 'TRIGGER_NOT_SUPPORTED',
        message: `${label} does not deliver comment events`,
      });
    } else if (
      trigger.comments.keywords.length === 0 &&
      trigger.comments.posts.kind !== 'specific'
    ) {
      issues.push({
        path: 'trigger.comments.keywords',
        code: 'KEYWORDS_REQUIRED',
        message: 'A comments trigger on any post needs at least one keyword',
      });
    }
  }
  if (trigger.messages !== undefined && !allowed.messages) {
    issues.push({
      path: 'trigger.messages',
      code: 'TRIGGER_NOT_SUPPORTED',
      message: `${label} has no conversation window for inbound messages`,
    });
  }
  return issues;
};

const replyIssues = (
  step: ReplyToCommentStep,
  path: string,
  record: CapabilityRecord,
): ValidationIssue[] => textIssues(step.text, `${path}.text`, record.replyLimits);

const buttonIssues = (
  buttons: SendMessageStep['buttons'],
  path: string,
  limits: MessageLimits,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (buttons.length > limits.buttons) {
    issues.push({
      path,
      code: 'TOO_MANY_BUTTONS',
      message:
        limits.buttons === 0
          ? 'Messages on this platform cannot carry buttons'
          : `A message can carry at most ${limits.buttons} buttons, this one has ${buttons.length}`,
    });
  }
  buttons.forEach((button, index) => {
    const titleLength = charCount(button.title);
    if (titleLength < 1 || titleLength > 20) {
      issues.push({
        path: `${path}.${index}.title`,
        code: 'BUTTON_TITLE_INVALID',
        message: 'A button title is 1 to 20 characters',
      });
    }
    if (!isHttpUrl(button.url)) {
      issues.push({
        path: `${path}.${index}.url`,
        code: 'BUTTON_URL_INVALID',
        message: 'A button url must start with http:// or https://',
      });
    }
  });
  return issues;
};

const unreachableIssues = (
  step: SendMessageStep,
  path: string,
  record: CapabilityRecord,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const required = requiresUnreachableChoice(record);
  if (required && step.onUnreachable === undefined) {
    issues.push({
      path: `${path}.onUnreachable`,
      code: 'UNREACHABLE_CHOICE_REQUIRED',
      message: `${PLATFORM_LABELS[record.platform]} lets recipients refuse messages; choose what happens when the contact is unreachable`,
    });
  }
  if (!required && step.onUnreachable !== undefined) {
    issues.push({
      path: `${path}.onUnreachable`,
      code: 'UNREACHABLE_CHOICE_NOT_SUPPORTED',
      message: `${PLATFORM_LABELS[record.platform]} has no unreachable recipients; remove the choice`,
    });
  }
  if (step.onUnreachable === 'publicReplyInstead') {
    if (step.fallbackText === undefined) {
      issues.push({
        path: `${path}.fallbackText`,
        code: 'FALLBACK_TEXT_REQUIRED',
        message: 'Replying publicly instead needs the text of that public reply',
      });
    } else {
      issues.push(...textIssues(step.fallbackText, `${path}.fallbackText`, record.replyLimits));
    }
  }
  return issues;
};

const messageIssues = (
  step: SendMessageStep,
  path: string,
  record: CapabilityRecord,
): ValidationIssue[] => [
  ...textIssues(step.text, `${path}.text`, record.messageLimits),
  ...buttonIssues(step.buttons, `${path}.buttons`, record.messageLimits),
  ...unreachableIssues(step, path, record),
];

const waitIssues = (
  step: WaitForReplyStep,
  path: string,
  record: CapabilityRecord,
  messageSentBefore: boolean,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!messageSentBefore) {
    issues.push({
      path,
      code: 'WAIT_WITHOUT_MESSAGE',
      message: 'Waiting for a reply needs a message sent earlier in the automation',
    });
  }
  if (!(step.giveUpHours > 0)) {
    issues.push({
      path: `${path}.giveUpHours`,
      code: 'GIVE_UP_HOURS_INVALID',
      message: 'The give-up time must be more than zero hours',
    });
  }
  if (step.reminder !== undefined) {
    if (!canRemindBeforeReply(record)) {
      issues.push({
        path: `${path}.reminder`,
        code: 'REMINDER_NOT_SUPPORTED',
        message: `${PLATFORM_LABELS[record.platform]} does not allow a second message before the contact replies`,
      });
    } else {
      if (!(step.reminder.afterHours > 0 && step.reminder.afterHours < step.giveUpHours)) {
        issues.push({
          path: `${path}.reminder.afterHours`,
          code: 'REMINDER_DELAY_INVALID',
          message:
            'The reminder must go out after more than zero hours and before the give-up time',
        });
      }
      issues.push(...textIssues(step.reminder.text, `${path}.reminder.text`, record.messageLimits));
    }
  }
  if (step.nudge !== undefined) {
    issues.push(...textIssues(step.nudge.text, `${path}.nudge.text`, record.messageLimits));
  }
  return issues;
};

const webhookIssues = (step: CallWebhookStep, path: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!WEBHOOK_METHODS.includes(step.method)) {
    issues.push({
      path: `${path}.method`,
      code: 'METHOD_INVALID',
      message: `The method must be one of ${WEBHOOK_METHODS.join(', ')}`,
    });
  }
  if (!isHttpUrl(step.url)) {
    issues.push({
      path: `${path}.url`,
      code: 'URL_INVALID',
      message: 'The webhook url must start with http:// or https://',
    });
  }
  return issues;
};

const stepIssues = (steps: Step[], record: CapabilityRecord): ValidationIssue[] => {
  const kinds = allowedStepKinds(record);
  const issues: ValidationIssue[] = [];
  let messageSentBefore = false;
  steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (!kinds.includes(step.kind)) {
      issues.push({
        path: `${path}.kind`,
        code: 'STEP_NOT_SUPPORTED',
        message: `${PLATFORM_LABELS[record.platform]} cannot execute ${step.kind}`,
      });
      return;
    }
    switch (step.kind) {
      case 'reply_to_comment':
        issues.push(...replyIssues(step, path, record));
        break;
      case 'send_message':
        issues.push(...messageIssues(step, path, record));
        messageSentBefore = true;
        break;
      case 'wait_for_reply':
        issues.push(...waitIssues(step, path, record, messageSentBefore));
        break;
      case 'call_webhook':
        issues.push(...webhookIssues(step, path));
        break;
    }
  });
  return issues;
};

export const validateDefinition = (
  definition: Definition,
  record: CapabilityRecord,
): ValidationIssue[] => [
  ...triggerIssues(definition.trigger, record),
  ...stepIssues(definition.steps, record),
];
