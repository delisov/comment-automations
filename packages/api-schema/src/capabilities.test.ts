import type { CapabilityRecord as SharedCapabilityRecord } from '@comment-automations/shared';
import {
  PLATFORMS,
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  capabilities,
  requiresUnreachableChoice,
} from '@comment-automations/shared';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CapabilitiesResponse as CapabilitiesResponseType } from './capabilities.js';
import { CapabilitiesResponse, CapabilityRecord } from './capabilities.js';

describe('CapabilityRecord schema', () => {
  it('describes the same type as the shared record, in both directions', () => {
    expectTypeOf<CapabilityRecord>().toExtend<SharedCapabilityRecord>();
    expectTypeOf<SharedCapabilityRecord>().toExtend<CapabilityRecord>();
  });

  it.each(PLATFORMS)('accepts the declared %s record', (platform) => {
    expect([...Value.Errors(CapabilityRecord, capabilities[platform])]).toEqual([]);
  });
});

describe('CapabilitiesResponse schema', () => {
  it.each(PLATFORMS)('accepts the record and derived helper results for %s', (platform) => {
    const record = capabilities[platform];
    const response: CapabilitiesResponseType = {
      record,
      allowedTriggers: allowedTriggers(record),
      allowedStepKinds: allowedStepKinds(record),
      requiresUnreachableChoice: requiresUnreachableChoice(record),
      canRemindBeforeReply: canRemindBeforeReply(record),
    };
    expect([...Value.Errors(CapabilitiesResponse, response)]).toEqual([]);
  });
});
