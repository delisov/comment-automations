import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CapabilityRecord } from './capabilities.js';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  deliveredAsPrivateReply,
  nextAllowedStepKinds,
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
  const comments = fc.record({
    posts: fc.constant({ kind: 'any' as const }),
    keywords: fc.array(text(12), { minLength: 1, maxLength: 3 }),
  });
  const messages = fc.record({ keywords: fc.array(text(12), { maxLength: 3 }) });
  const shapes: fc.Arbitrary<Omit<Trigger, 'onRepeatWhileWaiting'>>[] = [];
  if (allowed.comments) {
    shapes.push(comments.map((value) => ({ comments: value })));
  }
  if (allowed.messages) {
    shapes.push(messages.map((value) => ({ messages: value })));
  }
  if (allowed.comments && allowed.messages) {
    shapes.push(fc.record({ comments, messages }));
  }
  return fc
    .tuple(fc.oneof(...shapes), fc.constantFrom('supersede' as const, 'ignore' as const))
    .map(([shape, onRepeatWhileWaiting]) => ({ ...shape, onRepeatWhileWaiting }));
};

const windowHours = (record: CapabilityRecord): number =>
  record.conversationWindow === null
    ? Number.POSITIVE_INFINITY
    : record.conversationWindow.durationMs / 3_600_000;

const stepOfKind = (
  kind: StepKind,
  record: CapabilityRecord,
  trigger: Trigger,
  stepsSoFar: Step[],
): fc.Arbitrary<Step> => {
  switch (kind) {
    case 'reply_to_comment':
      return fc.record({ kind: fc.constant(kind), text: text(record.replyLimits.maxChars) });
    case 'send_message':
      return fc.record({
        kind: fc.constant(kind),
        text: text(record.messageLimits.maxChars),
        buttons: fc.array(button, {
          maxLength: deliveredAsPrivateReply(record, trigger, stepsSoFar)
            ? 0
            : record.messageLimits.buttons,
        }),
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
                    afterHours: fc.integer({
                      min: 1,
                      max: Math.min(step.giveUpHours - 1, windowHours(record) - 1),
                    }),
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

const stepsFrom = (
  record: CapabilityRecord,
  trigger: Trigger,
  stepsSoFar: Step[],
  remaining: number,
): fc.Arbitrary<Step[]> =>
  remaining === 0
    ? fc.constant(stepsSoFar)
    : fc
        .constantFrom(...nextAllowedStepKinds(record, trigger, stepsSoFar))
        .chain((kind) => stepOfKind(kind, record, trigger, stepsSoFar))
        .chain((step) => stepsFrom(record, trigger, [...stepsSoFar, step], remaining - 1));

const buildableDefinition = (record: CapabilityRecord): fc.Arbitrary<Definition> =>
  fc
    .tuple(triggerFor(record), fc.nat({ max: 6 }))
    .chain(([trigger, length]) =>
      stepsFrom(record, trigger, [], length).map((steps) => ({ trigger, steps })),
    );

const platformWithTrigger = fc.constantFrom(...PLATFORMS).filter((name) => {
  const allowed = allowedTriggers(capabilities[name]);
  return allowed.comments || allowed.messages;
});

describe('validateDefinition invariants', () => {
  it('accepts every definition built by picking from nextAllowedStepKinds, for every record and trigger shape', () => {
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

  it('reports a step outside nextAllowedStepKinds at its position, naming whether the platform ever offers it', () => {
    fc.assert(
      fc.property(
        platformWithTrigger.chain((name) => {
          const record = capabilities[name];
          return buildableDefinition(record).chain((definition) => {
            const outsideAt = (index: number): StepKind[] => {
              const next = nextAllowedStepKinds(
                record,
                definition.trigger,
                definition.steps.slice(0, index),
              );
              return STEP_KINDS.filter((kind) => !next.includes(kind));
            };
            const positions = Array.from(
              { length: definition.steps.length + 1 },
              (_, i) => i,
            ).filter((index) => outsideAt(index).length > 0);
            return fc.constantFrom(...positions).chain((index) =>
              fc
                .constantFrom(...outsideAt(index))
                .chain((kind) =>
                  stepOfKind(kind, record, definition.trigger, definition.steps.slice(0, index)),
                )
                .map((foreignStep) => [name, definition, index, foreignStep] as const),
            );
          });
        }),
        ([name, definition, index, foreignStep]) => {
          const record = capabilities[name];
          const steps = [...definition.steps];
          steps.splice(index, 0, foreignStep);
          const issues = validateDefinition({ ...definition, steps }, record);
          const expected = allowedStepKinds(record).includes(foreignStep.kind)
            ? 'STEP_NOT_ALLOWED_HERE'
            : 'STEP_NOT_SUPPORTED';
          expect(
            issues.filter((issue) => issue.path === `steps.${index}.kind`).map(({ code }) => code),
          ).toEqual([expected]);
        },
      ),
    );
  });
});
