import type { Definition, Step, StepKind, ValidationIssue } from '@comment-automations/shared';
import { Value } from '@sinclair/typebox/value';
import type { Static } from '@sinclair/typebox';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  StepKindSchema,
  StepSchema,
  ValidationIssue as ValidationIssueSchema,
} from './definition.js';
import { DefinitionSchema } from './definition.js';

const example: Definition = {
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [
    { kind: 'reply_to_comment', text: 'Sent you a DM!' },
    { kind: 'send_message', text: 'What is your email?', buttons: [], onUnreachable: 'skip' },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      reminder: { afterHours: 24, text: 'Still there?' },
      nudge: { text: 'No address spotted, try again?', then: 'wait' },
    },
    {
      kind: 'send_message',
      text: 'Here is the link, {{email}}',
      buttons: [{ title: 'Open', url: 'https://example.com' }],
    },
    { kind: 'call_webhook', method: 'POST', url: 'https://crm.example.com/hook', headers: {} },
  ],
};

describe('DefinitionSchema', () => {
  it('describes the same type as the shared Definition, in both directions', () => {
    expectTypeOf<Static<typeof DefinitionSchema>>().toExtend<Definition>();
    expectTypeOf<Definition>().toExtend<Static<typeof DefinitionSchema>>();
    expectTypeOf<Static<typeof StepSchema>>().toExtend<Step>();
    expectTypeOf<Step>().toExtend<Static<typeof StepSchema>>();
    expectTypeOf<Static<typeof StepKindSchema>>().toEqualTypeOf<StepKind>();
    expectTypeOf<Static<typeof ValidationIssueSchema>>().toEqualTypeOf<ValidationIssue>();
  });

  it('accepts a definition with every step kind', () => {
    expect([...Value.Errors(DefinitionSchema, example)]).toEqual([]);
    expect(Value.Check(DefinitionSchema, example)).toBe(true);
  });

  it('rejects an unknown step kind and a missing repeat policy', () => {
    expect(
      Value.Check(DefinitionSchema, {
        ...example,
        steps: [{ kind: 'send_email', text: 'hi' }],
      }),
    ).toBe(false);
    expect(
      Value.Check(DefinitionSchema, {
        ...example,
        trigger: { comments: example.trigger.comments },
      }),
    ).toBe(false);
  });
});

describe('WaitForReplyStepSchema bounds', () => {
  const wait = (giveUpHours: number, afterHours?: number) => ({
    ...example,
    steps: [
      {
        kind: 'wait_for_reply',
        expect: 'any',
        giveUpHours,
        ...(afterHours === undefined ? {} : { reminder: { afterHours, text: 'Still there?' } }),
      },
    ],
  });

  it('keeps the give-up and reminder hours whole numbers from 1 to 720', () => {
    expect(Value.Check(DefinitionSchema, wait(720, 1))).toBe(true);
    expect(Value.Check(DefinitionSchema, wait(1e10))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(721))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(0))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(0.5))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(720, 1e12))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(720, 0))).toBe(false);
    expect(Value.Check(DefinitionSchema, wait(720, 1.5))).toBe(false);
  });
});
