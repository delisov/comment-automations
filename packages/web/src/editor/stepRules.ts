import type { CapabilityRecord, Step, StepKind, Trigger } from '@comment-automations/shared';
import * as shared from '@comment-automations/shared';
import { allowedStepKinds } from '@comment-automations/shared';

export type NextAllowedStepKinds = (
  record: CapabilityRecord,
  trigger: Trigger,
  stepsSoFar: Step[],
) => StepKind[];

const messageNeedsWaitBefore = (record: CapabilityRecord, stepsSoFar: Step[]): boolean => {
  if (record.reminderBeforeReply) {
    return false;
  }
  const lastMessage = stepsSoFar.map((step) => step.kind).lastIndexOf('send_message');
  if (lastMessage === -1) {
    return false;
  }
  return !stepsSoFar.slice(lastMessage + 1).some((step) => step.kind === 'wait_for_reply');
};

const localRules: NextAllowedStepKinds = (record, trigger, stepsSoFar) => {
  const last = stepsSoFar[stepsSoFar.length - 1];
  return allowedStepKinds(record).filter((kind) => {
    switch (kind) {
      case 'reply_to_comment':
        return trigger.comments !== undefined;
      case 'send_message':
        return !messageNeedsWaitBefore(record, stepsSoFar);
      case 'wait_for_reply':
        return last?.kind === 'send_message';
      case 'call_webhook':
        return true;
    }
  });
};

const fromShared = (shared as Partial<{ nextAllowedStepKinds: NextAllowedStepKinds }>)
  .nextAllowedStepKinds;

export const nextAllowedStepKinds: NextAllowedStepKinds = fromShared ?? localRules;
