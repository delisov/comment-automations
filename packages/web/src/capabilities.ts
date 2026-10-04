import type { CapabilitiesResponse } from '@comment-automations/api-schema';
import type { CapabilityRecord } from '@comment-automations/shared';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  capabilities,
  requiresUnreachableChoice,
} from '@comment-automations/shared';
import type { Account } from './api/client.js';

export const deriveCapabilities = (record: CapabilityRecord): CapabilitiesResponse => ({
  record,
  allowedTriggers: allowedTriggers(record),
  allowedStepKinds: allowedStepKinds(record),
  requiresUnreachableChoice: requiresUnreachableChoice(record),
  canRemindBeforeReply: canRemindBeforeReply(record),
});

export const capabilitiesFor = (account: Account): CapabilitiesResponse =>
  account.capabilities ?? deriveCapabilities(capabilities[account.platform]);

export const supportsAutomations = (caps: CapabilitiesResponse): boolean =>
  caps.allowedTriggers.comments || caps.allowedTriggers.messages;
