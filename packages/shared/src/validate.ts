import type { CapabilityRecord, MessageLimits } from './capabilities.js';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  consecutiveMessageCapReached,
  deliveredAsPrivateReply,
  nextAllowedStepKinds,
  requiresUnreachableChoice,
} from './capabilities.js';
import type {
  CallWebhookStep,
  Definition,
  ReplyToCommentStep,
  SendMessageStep,
  Step,
  StepKind,
  Trigger,
  WaitForReplyStep,
} from './definition.js';
import { MAX_WAIT_HOURS, WEBHOOK_METHODS } from './definition.js';
import { hoursToMs } from './durations.js';
import { isMatchableKeyword } from './keywords.js';
import { PLATFORM_LABELS } from './platform.js';
import { longestTemplateVars, renderTemplate } from './template.js';

export type ValidationIssue = { path: string; code: string; message: string };

type StepContext = {
  record: CapabilityRecord;
  trigger: Trigger;
  stepsSoFar: Step[];
  emailCaptured: boolean;
};

const PLACEHOLDER = /\{\{([^}]*)\}\}/g;

const KNOWN_PLACEHOLDERS = ['email', 'contact.handle'];

const NOT_ALLOWED_HERE: Record<StepKind, string> = {
  send_message: 'A second message needs a wait for a reply before it on this network',
  reply_to_comment: 'Replying to the comment needs a comments trigger',
  wait_for_reply: 'Waiting needs a message right before it',
  call_webhook: 'Calling a webhook is allowed at every position',
};

const notAllowedHereMessage = (
  kind: StepKind,
  record: CapabilityRecord,
  stepsSoFar: Step[],
): string =>
  kind === 'send_message' && consecutiveMessageCapReached(record, stepsSoFar)
    ? `${PLATFORM_LABELS[record.platform]} allows at most ${String(record.maxConsecutiveMessages)} messages in a row before the contact replies`
    : NOT_ALLOWED_HERE[kind];

const charCount = (text: string): number => text.length;

const byteCount = (text: string): number => new TextEncoder().encode(text).length;

const lengthMessage = (filledIn: boolean, count: number, unit: string, limit: number): string =>
  filledIn
    ? `Text may be ${count} ${unit} once filled in, the limit is ${limit}`
    : `Text is ${count} ${unit}, the limit is ${limit}`;

const wholeHours = (hours: number, max: number): boolean =>
  Number.isInteger(hours) && hours >= 1 && hours <= max;

const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const placeholderIssues = (text: string, path: string, emailCaptured: boolean): ValidationIssue[] =>
  [...text.matchAll(PLACEHOLDER)].flatMap(([placeholder, name]) => {
    const known = (name ?? '').trim();
    if (!KNOWN_PLACEHOLDERS.includes(known)) {
      return [
        {
          path,
          code: 'UNKNOWN_PLACEHOLDER',
          message: `${placeholder} is not a placeholder; use {{email}} or {{contact.handle}}`,
        },
      ];
    }
    if (known === 'email' && !emailCaptured) {
      return [
        {
          path,
          code: 'EMAIL_NOT_CAPTURED_YET',
          message: '{{email}} is only known after a wait for a reply that expects an email',
        },
      ];
    }
    return [];
  });

const textIssues = (
  text: string,
  path: string,
  limits: { maxChars: number; maxBytes?: number },
  emailCaptured: boolean,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const filled = renderTemplate(text, longestTemplateVars);
  const filledIn = filled !== text;
  if (text.trim() === '') {
    issues.push({ path, code: 'TEXT_REQUIRED', message: 'Text must not be empty' });
  } else if (charCount(filled) > limits.maxChars) {
    issues.push({
      path,
      code: 'TEXT_TOO_LONG',
      message: lengthMessage(filledIn, charCount(filled), 'characters', limits.maxChars),
    });
  }
  if (limits.maxBytes !== undefined && byteCount(filled) > limits.maxBytes) {
    issues.push({
      path,
      code: 'TEXT_TOO_MANY_BYTES',
      message: lengthMessage(filledIn, byteCount(filled), 'bytes in UTF-8', limits.maxBytes),
    });
  }
  issues.push(...placeholderIssues(text, path, emailCaptured));
  return issues;
};

const keywordIssues = (keywords: string[], path: string): ValidationIssue[] =>
  keywords.flatMap((keyword, index) =>
    isMatchableKeyword(keyword)
      ? []
      : [
          {
            path: `${path}.${index}`,
            code: 'KEYWORD_UNMATCHABLE',
            message: 'A keyword needs at least one letter, number or emoji',
          },
        ],
  );

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
    } else {
      issues.push(...keywordIssues(trigger.comments.keywords, 'trigger.comments.keywords'));
    }
  }
  if (trigger.messages !== undefined) {
    if (!allowed.messages) {
      issues.push({
        path: 'trigger.messages',
        code: 'TRIGGER_NOT_SUPPORTED',
        message: `${label} has no conversation window for inbound messages`,
      });
    } else {
      issues.push(...keywordIssues(trigger.messages.keywords, 'trigger.messages.keywords'));
    }
  }
  return issues;
};

const replyIssues = (
  step: ReplyToCommentStep,
  path: string,
  { record, emailCaptured }: StepContext,
): ValidationIssue[] => textIssues(step.text, `${path}.text`, record.replyLimits, emailCaptured);

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
  { record, trigger, emailCaptured }: StepContext,
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
    if (trigger.comments === undefined) {
      issues.push({
        path: `${path}.onUnreachable`,
        code: 'PUBLIC_REPLY_NEEDS_COMMENTS_TRIGGER',
        message: 'Replying publicly instead needs a comments trigger',
      });
    }
    if (step.fallbackText === undefined) {
      issues.push({
        path: `${path}.fallbackText`,
        code: 'FALLBACK_TEXT_REQUIRED',
        message: 'Replying publicly instead needs the text of that public reply',
      });
    } else {
      issues.push(
        ...textIssues(step.fallbackText, `${path}.fallbackText`, record.replyLimits, emailCaptured),
      );
    }
  }
  return issues;
};

const privateReplyButtonIssues = (
  step: SendMessageStep,
  path: string,
  { record, trigger, stepsSoFar }: StepContext,
): ValidationIssue[] =>
  step.buttons.length > 0 && deliveredAsPrivateReply(record, trigger, stepsSoFar)
    ? [
        {
          path,
          code: 'BUTTONS_IN_PRIVATE_REPLY',
          message:
            'This message is delivered as a private reply to the comment, which cannot carry buttons',
        },
      ]
    : [];

const messageIssues = (
  step: SendMessageStep,
  path: string,
  context: StepContext,
): ValidationIssue[] => [
  ...textIssues(step.text, `${path}.text`, context.record.messageLimits, context.emailCaptured),
  ...buttonIssues(step.buttons, `${path}.buttons`, context.record.messageLimits),
  ...privateReplyButtonIssues(step, `${path}.buttons`, context),
  ...unreachableIssues(step, path, context),
];

const waitIssues = (
  step: WaitForReplyStep,
  path: string,
  { record, emailCaptured }: StepContext,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!wholeHours(step.giveUpHours, MAX_WAIT_HOURS)) {
    issues.push({
      path: `${path}.giveUpHours`,
      code: 'GIVE_UP_HOURS_INVALID',
      message: `The give-up time is a whole number of hours from 1 to ${MAX_WAIT_HOURS}`,
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
      if (!wholeHours(step.reminder.afterHours, step.giveUpHours - 1)) {
        issues.push({
          path: `${path}.reminder.afterHours`,
          code: 'REMINDER_DELAY_INVALID',
          message:
            'The reminder must go out a whole number of hours after the message, at least one and before the give-up time',
        });
      } else if (
        record.conversationWindow !== null &&
        hoursToMs(step.reminder.afterHours) >= record.conversationWindow.durationMs
      ) {
        issues.push({
          path: `${path}.reminder.afterHours`,
          code: 'REMINDER_AFTER_WINDOW',
          message: `${PLATFORM_LABELS[record.platform]} closes the conversation ${record.conversationWindow.durationMs / hoursToMs(1)} hours after the contact's last message; the reminder must go out before that`,
        });
      }
      issues.push(
        ...textIssues(
          step.reminder.text,
          `${path}.reminder.text`,
          record.messageLimits,
          emailCaptured,
        ),
      );
    }
  }
  if (step.nudge !== undefined) {
    issues.push(
      ...textIssues(step.nudge.text, `${path}.nudge.text`, record.messageLimits, emailCaptured),
    );
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

const stepIssues = (definition: Definition, record: CapabilityRecord): ValidationIssue[] => {
  const kinds = allowedStepKinds(record);
  const issues: ValidationIssue[] = [];
  let emailCaptured = false;
  definition.steps.forEach((step, index) => {
    const path = `steps.${index}`;
    if (!kinds.includes(step.kind)) {
      issues.push({
        path: `${path}.kind`,
        code: 'STEP_NOT_SUPPORTED',
        message: `${PLATFORM_LABELS[record.platform]} cannot execute ${step.kind}`,
      });
      return;
    }
    const stepsSoFar = definition.steps.slice(0, index);
    if (!nextAllowedStepKinds(record, definition.trigger, stepsSoFar).includes(step.kind)) {
      issues.push({
        path: `${path}.kind`,
        code: 'STEP_NOT_ALLOWED_HERE',
        message: notAllowedHereMessage(step.kind, record, stepsSoFar),
      });
    }
    const context: StepContext = {
      record,
      trigger: definition.trigger,
      stepsSoFar,
      emailCaptured,
    };
    switch (step.kind) {
      case 'reply_to_comment':
        issues.push(...replyIssues(step, path, context));
        break;
      case 'send_message':
        issues.push(...messageIssues(step, path, context));
        break;
      case 'wait_for_reply':
        issues.push(...waitIssues(step, path, context));
        emailCaptured = emailCaptured || step.expect === 'email';
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
  ...stepIssues(definition, record),
];
