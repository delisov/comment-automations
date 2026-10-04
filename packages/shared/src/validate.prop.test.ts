import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CapabilityRecord } from './capabilities.js';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  requiresUnreachableChoice,
} from './capabilities.js';
import type { Definition, Step, StepKind, Trigger } from './definition.js';
import { STEP_KINDS, WEBHOOK_METHODS } from './definition.js';
import { PLATFORMS } from './platform.js';
import { capabilities } from './platforms/index.js';
import { validateDefinition } from './validate.js';

const letters = [...'abcdefghijklmnopqrstuvwxyz '];

const text = (maxChars: number) =>
  fc
    .array(fc.constantFrom(...letters), {
      minLength: 1,
      maxLength: Math.max(1, Math.min(maxChars, 60)),
    })
    .map((chars) => chars.join(''))
    .filter((value) => value.trim() !== '');

const button = fc.record({
  title: text(20).filter((title) => title.length <= 20),
  url: fc.constant('https://example.com/offer'),
});

const triggerFor = (record: CapabilityRecord): fc.Arbitrary<Trigger> => {
  const allowed = allowedTriggers(record);
  const keywords = fc.array(text(12), { minLength: 1, maxLength: 3 });
  const repeat = fc.constantFrom('supersede' as const, 'ignore' as const);
  if (allowed.comments) {
    return fc.record({
      comments: fc.record({ posts: fc.constant({ kind: 'any' as const }), keywords }),
      onRepeatWhileWaiting: repeat,
    });
  }
  return fc.record({
    messages: fc.record({ keywords: fc.array(text(12), { maxLength: 3 }) }),
    onRepeatWhileWaiting: repeat,
  });
};

const stepOfKind = (kind: StepKind, record: CapabilityRecord): fc.Arbitrary<Step> => {
  switch (kind) {
    case 'reply_to_comment':
      return fc.record({ kind: fc.constant(kind), text: text(record.replyLimits.maxChars) });
    case 'send_message':
      return fc.record({
        kind: fc.constant(kind),
        text: text(record.messageLimits.maxChars),
        buttons: fc.array(button, { maxLength: record.messageLimits.buttons }),
        onUnreachable: requiresUnreachableChoice(record)
          ? fc.constantFrom('fail' as const, 'skip' as const)
          : fc.constant(undefined),
      });
    case 'wait_for_reply':
      return fc
        .record({
          kind: fc.constant(kind),
          expect: fc.constantFrom('email' as const, 'any' as const),
          giveUpHours: fc.integer({ min: 2, max: 240 }),
          nudge: fc.option(
            fc.record({
              text: text(record.messageLimits.maxChars),
              then: fc.constantFrom('wait' as const, 'end' as const),
            }),
            { nil: undefined },
          ),
        })
        .chain((step) =>
          canRemindBeforeReply(record)
            ? fc
                .option(
                  fc.record({
                    afterHours: fc.integer({ min: 1, max: step.giveUpHours - 1 }),
                    text: text(record.messageLimits.maxChars),
                  }),
                  { nil: undefined },
                )
                .map((reminder) => ({ ...step, reminder }))
            : fc.constant(step),
        );
    case 'call_webhook':
      return fc.record({
        kind: fc.constant(kind),
        method: fc.constantFrom(...WEBHOOK_METHODS),
        url: fc.constant('https://crm.example.com/hooks/leads'),
        headers: fc.dictionary(text(8), text(16), { maxKeys: 3 }),
      });
  }
};

const dropWaitsBeforeFirstMessage = (steps: Step[]): Step[] => {
  const firstMessage = steps.findIndex((step) => step.kind === 'send_message');
  return steps.filter(
    (step, index) =>
      step.kind !== 'wait_for_reply' || (firstMessage !== -1 && index > firstMessage),
  );
};

const buildableDefinition = (record: CapabilityRecord): fc.Arbitrary<Definition> =>
  fc.record({
    trigger: triggerFor(record),
    steps: fc
      .array(
        fc.constantFrom(...allowedStepKinds(record)).chain((kind) => stepOfKind(kind, record)),
        { maxLength: 6 },
      )
      .map(dropWaitsBeforeFirstMessage),
  });

const platform = fc.constantFrom(...PLATFORMS);

const platformWithTrigger = platform.filter((name) => {
  const allowed = allowedTriggers(capabilities[name]);
  return allowed.comments || allowed.messages;
});

describe('validateDefinition invariants', () => {
  it('accepts every definition the constructor can build from allowedStepKinds', () => {
    fc.assert(
      fc.property(
        platformWithTrigger.chain((name) =>
          fc.tuple(fc.constant(name), buildableDefinition(capabilities[name])),
        ),
        ([name, definition]) => {
          expect(validateDefinition(definition, capabilities[name])).toEqual([]);
        },
      ),
    );
  });

  it('names every step outside allowedStepKinds as STEP_NOT_SUPPORTED at its index', () => {
    const platformWithGaps = platformWithTrigger.filter(
      (name) => allowedStepKinds(capabilities[name]).length < STEP_KINDS.length,
    );
    fc.assert(
      fc.property(
        platformWithGaps.chain((name) => {
          const record = capabilities[name];
          const allowed = allowedStepKinds(record);
          const forbidden = STEP_KINDS.filter((kind) => !allowed.includes(kind));
          return fc.tuple(
            fc.constant(name),
            buildableDefinition(record),
            fc.constantFrom(...forbidden).chain((kind) => stepOfKind(kind, record)),
            fc.nat(),
          );
        }),
        ([name, definition, foreignStep, position]) => {
          const index = position % (definition.steps.length + 1);
          const steps = [...definition.steps];
          steps.splice(index, 0, foreignStep);
          const issues = validateDefinition({ ...definition, steps }, capabilities[name]);
          expect(issues).toContainEqual({
            path: `steps.${index}.kind`,
            code: 'STEP_NOT_SUPPORTED',
            message: expect.stringContaining(foreignStep.kind),
          });
        },
      ),
    );
  });
});
