import { describe, expect, it } from 'vitest';
import type { Definition, Step, WebhookMethod } from './definition.js';
import { postId } from './ids.js';
import { capabilities } from './platforms/index.js';
import type { ValidationIssue } from './validate.js';
import { validateDefinition } from './validate.js';

const example: Definition = {
  trigger: {
    comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
    onRepeatWhileWaiting: 'supersede',
  },
  steps: [
    { kind: 'reply_to_comment', text: 'Sent you a DM!' },
    { kind: 'send_message', text: 'Hi {{contact.handle}}, what is your email?', buttons: [] },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      nudge: { text: 'I could not spot an email address, could you send it again?', then: 'wait' },
    },
    {
      kind: 'send_message',
      text: 'Here is the link, sent to {{email}}.',
      buttons: [{ title: 'Open the guide', url: 'https://example.com/guide' }],
    },
    {
      kind: 'call_webhook',
      method: 'POST',
      url: 'https://crm.example.com/hooks/leads',
      headers: { Authorization: 'Bearer token' },
    },
  ],
};

const withSteps = (steps: Step[], definition: Definition = example): Definition => ({
  ...definition,
  steps,
});

const withReminder = (definition: Definition): Definition =>
  withSteps(
    definition.steps.map((step) =>
      step.kind === 'wait_for_reply'
        ? { ...step, reminder: { afterHours: 24, text: 'Still there? Send me your email.' } }
        : step,
    ),
    definition,
  );

const codes = (issues: ValidationIssue[]) => issues.map(({ path, code }) => ({ path, code }));

describe('validateDefinition on the brief example', () => {
  it('accepts the example on Instagram once the reminder is left out', () => {
    expect(validateDefinition(example, capabilities.instagram)).toEqual([]);
  });

  it('rejects the reminder on Instagram, where no second message may precede a reply', () => {
    expect(validateDefinition(withReminder(example), capabilities.instagram)).toEqual([
      {
        path: 'steps.2.reminder',
        code: 'REMINDER_NOT_SUPPORTED',
        message: 'Instagram does not allow a second message before the contact replies',
      },
    ]);
  });

  it('on Bluesky demands the unreachable choice and refuses buttons, but allows the wait', () => {
    expect(codes(validateDefinition(withReminder(example), capabilities.bluesky))).toEqual([
      { path: 'steps.1.onUnreachable', code: 'UNREACHABLE_CHOICE_REQUIRED' },
      { path: 'steps.3.buttons', code: 'TOO_MANY_BUTTONS' },
      { path: 'steps.3.onUnreachable', code: 'UNREACHABLE_CHOICE_REQUIRED' },
    ]);
  });

  it.each(['bluesky', 'x'] as const)(
    'accepts the example with reminder on %s once the unreachable choice is made and buttons dropped',
    (platform) => {
      const definition = withSteps(
        withReminder(example).steps.map((step) =>
          step.kind === 'send_message'
            ? { ...step, buttons: [], onUnreachable: 'skip' as const }
            : step,
        ),
      );
      expect(validateDefinition(definition, capabilities[platform])).toEqual([]);
    },
  );

  it.each(['youtube', 'threads', 'linkedin'] as const)(
    'on %s rejects the wait step',
    (platform) => {
      expect(codes(validateDefinition(example, capabilities[platform]))).toContainEqual({
        path: 'steps.2.kind',
        code: 'STEP_NOT_SUPPORTED',
      });
    },
  );

  it('on YouTube rejects every messaging step and nothing else', () => {
    expect(validateDefinition(example, capabilities.youtube)).toEqual([
      {
        path: 'steps.1.kind',
        code: 'STEP_NOT_SUPPORTED',
        message: 'YouTube cannot execute send_message',
      },
      {
        path: 'steps.2.kind',
        code: 'STEP_NOT_SUPPORTED',
        message: 'YouTube cannot execute wait_for_reply',
      },
      {
        path: 'steps.3.kind',
        code: 'STEP_NOT_SUPPORTED',
        message: 'YouTube cannot execute send_message',
      },
    ]);
  });

  it('on WhatsApp rejects the comments trigger, the public reply and a reminder past the 24 h window', () => {
    expect(validateDefinition(withReminder(example), capabilities.whatsapp)).toEqual([
      {
        path: 'trigger.comments',
        code: 'TRIGGER_NOT_SUPPORTED',
        message: 'WhatsApp does not deliver comment events',
      },
      {
        path: 'steps.0.kind',
        code: 'STEP_NOT_SUPPORTED',
        message: 'WhatsApp cannot execute reply_to_comment',
      },
      {
        path: 'steps.2.reminder.afterHours',
        code: 'REMINDER_AFTER_WINDOW',
        message:
          "WhatsApp closes the conversation 24 hours after the contact's last message; the reminder must go out before that",
      },
    ]);
  });

  it('on Pinterest nothing but the webhook survives', () => {
    expect(codes(validateDefinition(example, capabilities.pinterest))).toEqual([
      { path: 'trigger.comments', code: 'TRIGGER_NOT_SUPPORTED' },
      { path: 'steps.0.kind', code: 'STEP_NOT_SUPPORTED' },
      { path: 'steps.1.kind', code: 'STEP_NOT_SUPPORTED' },
      { path: 'steps.2.kind', code: 'STEP_NOT_SUPPORTED' },
      { path: 'steps.3.kind', code: 'STEP_NOT_SUPPORTED' },
    ]);
  });
});

describe('validateDefinition triggers', () => {
  it('requires a trigger', () => {
    const definition: Definition = { trigger: { onRepeatWhileWaiting: 'supersede' }, steps: [] };
    expect(validateDefinition(definition, capabilities.instagram)).toEqual([
      {
        path: 'trigger',
        code: 'TRIGGER_REQUIRED',
        message: 'An automation needs a comments trigger or a messages trigger',
      },
    ]);
  });

  it('requires keywords for a comments trigger on any post, not on a specific post', () => {
    const anyPost: Definition = {
      trigger: {
        comments: { posts: { kind: 'any' }, keywords: [] },
        onRepeatWhileWaiting: 'ignore',
      },
      steps: [],
    };
    const specificPost: Definition = {
      trigger: {
        comments: { posts: { kind: 'specific', postId: postId('post_1') }, keywords: [] },
        onRepeatWhileWaiting: 'ignore',
      },
      steps: [],
    };
    expect(codes(validateDefinition(anyPost, capabilities.facebook))).toEqual([
      { path: 'trigger.comments.keywords', code: 'KEYWORDS_REQUIRED' },
    ]);
    expect(validateDefinition(specificPost, capabilities.facebook)).toEqual([]);
  });

  it('allows a messages trigger with no keywords where a conversation window exists', () => {
    const definition: Definition = {
      trigger: { messages: { keywords: [] }, onRepeatWhileWaiting: 'supersede' },
      steps: [],
    };
    expect(validateDefinition(definition, capabilities.whatsapp)).toEqual([]);
    expect(codes(validateDefinition(definition, capabilities.youtube))).toEqual([
      { path: 'trigger.messages', code: 'TRIGGER_NOT_SUPPORTED' },
    ]);
  });
});

describe('validateDefinition send_message', () => {
  const message = (overrides: Partial<Extract<Step, { kind: 'send_message' }>>): Step => ({
    kind: 'send_message',
    text: 'hello',
    buttons: [],
    ...overrides,
  });

  it('enforces the character and the UTF-8 byte limit separately', () => {
    expect(
      codes(
        validateDefinition(
          withSteps([message({ text: 'a'.repeat(1001) })]),
          capabilities.instagram,
        ),
      ),
    ).toEqual([
      { path: 'steps.0.text', code: 'TEXT_TOO_LONG' },
      { path: 'steps.0.text', code: 'TEXT_TOO_MANY_BYTES' },
    ]);
    expect(
      codes(
        validateDefinition(withSteps([message({ text: 'a'.repeat(2001) })]), capabilities.facebook),
      ),
    ).toEqual([{ path: 'steps.0.text', code: 'TEXT_TOO_LONG' }]);
    expect(
      codes(
        validateDefinition(withSteps([message({ text: 'é'.repeat(600) })]), capabilities.instagram),
      ),
    ).toEqual([{ path: 'steps.0.text', code: 'TEXT_TOO_MANY_BYTES' }]);
    expect(
      validateDefinition(withSteps([message({ text: 'é'.repeat(600) })]), capabilities.facebook),
    ).toEqual([]);
  });

  it('rejects empty text', () => {
    expect(
      codes(validateDefinition(withSteps([message({ text: '  ' })]), capabilities.instagram)),
    ).toEqual([{ path: 'steps.0.text', code: 'TEXT_REQUIRED' }]);
  });

  it('checks button count, title length and url scheme', () => {
    const button = { title: 'Open', url: 'https://example.com' };
    expect(
      codes(
        validateDefinition(
          withSteps([message({ buttons: [button, button, button, button] })]),
          capabilities.instagram,
        ),
      ),
    ).toEqual([{ path: 'steps.0.buttons', code: 'TOO_MANY_BUTTONS' }]);
    expect(
      codes(
        validateDefinition(
          withSteps([
            message({
              buttons: [
                { title: '', url: 'https://example.com' },
                { title: 'x'.repeat(21), url: 'ftp://example.com' },
                { title: 'ok', url: 'not a url' },
              ],
            }),
          ]),
          capabilities.instagram,
        ),
      ),
    ).toEqual([
      { path: 'steps.0.buttons.0.title', code: 'BUTTON_TITLE_INVALID' },
      { path: 'steps.0.buttons.1.title', code: 'BUTTON_TITLE_INVALID' },
      { path: 'steps.0.buttons.1.url', code: 'BUTTON_URL_INVALID' },
      { path: 'steps.0.buttons.2.url', code: 'BUTTON_URL_INVALID' },
    ]);
  });

  it('forbids the unreachable choice where every commenter is reachable', () => {
    expect(
      codes(
        validateDefinition(withSteps([message({ onUnreachable: 'skip' })]), capabilities.instagram),
      ),
    ).toEqual([{ path: 'steps.0.onUnreachable', code: 'UNREACHABLE_CHOICE_NOT_SUPPORTED' }]);
  });

  it('requires a fallback text for a public reply instead, within the reply limit', () => {
    const x = capabilities.x;
    expect(
      codes(validateDefinition(withSteps([message({ onUnreachable: 'publicReplyInstead' })]), x)),
    ).toEqual([{ path: 'steps.0.fallbackText', code: 'FALLBACK_TEXT_REQUIRED' }]);
    expect(
      codes(
        validateDefinition(
          withSteps([
            message({ onUnreachable: 'publicReplyInstead', fallbackText: 'a'.repeat(281) }),
          ]),
          x,
        ),
      ),
    ).toEqual([{ path: 'steps.0.fallbackText', code: 'TEXT_TOO_LONG' }]);
    expect(
      validateDefinition(
        withSteps([message({ onUnreachable: 'publicReplyInstead', fallbackText: 'DM me!' })]),
        x,
      ),
    ).toEqual([]);
  });
});

describe('validateDefinition reply_to_comment', () => {
  it('enforces the reply character limit of the platform', () => {
    const reply: Step = { kind: 'reply_to_comment', text: 'a'.repeat(281) };
    expect(codes(validateDefinition(withSteps([reply]), capabilities.x))).toEqual([
      { path: 'steps.0.text', code: 'TEXT_TOO_LONG' },
    ]);
    expect(validateDefinition(withSteps([reply]), capabilities.bluesky)).toEqual([]);
  });
});

describe('validateDefinition wait_for_reply', () => {
  const messagesTrigger: Definition = {
    trigger: { messages: { keywords: ['hi'] }, onRepeatWhileWaiting: 'supersede' },
    steps: [],
  };
  const message: Step = { kind: 'send_message', text: 'What is your email?', buttons: [] };

  it('needs a message right before it, with no other wait in between', () => {
    const wait: Step = { kind: 'wait_for_reply', expect: 'any', giveUpHours: 24 };
    const webhook: Step = {
      kind: 'call_webhook',
      method: 'POST',
      url: 'https://crm.example.com/hook',
      headers: {},
    };
    const notAllowedHere = (index: number): ValidationIssue => ({
      path: `steps.${index}.kind`,
      code: 'STEP_NOT_ALLOWED_HERE',
      message: 'Waiting needs a message right before it',
    });
    expect(validateDefinition(withSteps([wait], messagesTrigger), capabilities.whatsapp)).toEqual([
      notAllowedHere(0),
    ]);
    expect(
      validateDefinition(withSteps([message, wait], messagesTrigger), capabilities.whatsapp),
    ).toEqual([]);
    expect(
      validateDefinition(
        withSteps([message, webhook, wait], messagesTrigger),
        capabilities.whatsapp,
      ),
    ).toEqual([]);
    expect(
      validateDefinition(withSteps([message, wait, wait], messagesTrigger), capabilities.whatsapp),
    ).toEqual([notAllowedHere(2)]);
  });

  it('keeps the reminder inside the conversation window where the platform has one', () => {
    const reminderAfter = (afterHours: number): Step => ({
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      reminder: { afterHours, text: 'Still there?' },
    });
    expect(
      codes(
        validateDefinition(
          withSteps([message, reminderAfter(36)], messagesTrigger),
          capabilities.whatsapp,
        ),
      ),
    ).toEqual([{ path: 'steps.1.reminder.afterHours', code: 'REMINDER_AFTER_WINDOW' }]);
    expect(
      codes(
        validateDefinition(
          withSteps([message, reminderAfter(24)], messagesTrigger),
          capabilities.whatsapp,
        ),
      ),
    ).toEqual([{ path: 'steps.1.reminder.afterHours', code: 'REMINDER_AFTER_WINDOW' }]);
    expect(
      validateDefinition(
        withSteps([message, reminderAfter(23)], messagesTrigger),
        capabilities.whatsapp,
      ),
    ).toEqual([]);
    expect(
      validateDefinition(
        withSteps([message, reminderAfter(36)], messagesTrigger),
        capabilities.tiktok,
      ),
    ).toEqual([]);
    expect(
      codes(
        validateDefinition(
          withSteps([message, reminderAfter(48)], messagesTrigger),
          capabilities.tiktok,
        ),
      ),
    ).toEqual([{ path: 'steps.1.reminder.afterHours', code: 'REMINDER_AFTER_WINDOW' }]);
    expect(
      validateDefinition(
        withSteps([{ ...message, onUnreachable: 'skip' }, reminderAfter(60)], messagesTrigger),
        capabilities.bluesky,
      ),
    ).toEqual([]);
  });

  it('places the reminder strictly between zero and the give-up time', () => {
    const late: Step = {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 24,
      reminder: { afterHours: 24, text: 'Still there?' },
    };
    const zero: Step = {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 24,
      reminder: { afterHours: 0, text: 'Still there?' },
    };
    const fine: Step = {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 24,
      reminder: { afterHours: 12, text: 'Still there?' },
    };
    expect(
      codes(validateDefinition(withSteps([message, late], messagesTrigger), capabilities.whatsapp)),
    ).toEqual([{ path: 'steps.1.reminder.afterHours', code: 'REMINDER_DELAY_INVALID' }]);
    expect(
      codes(validateDefinition(withSteps([message, zero], messagesTrigger), capabilities.whatsapp)),
    ).toEqual([{ path: 'steps.1.reminder.afterHours', code: 'REMINDER_DELAY_INVALID' }]);
    expect(
      validateDefinition(withSteps([message, fine], messagesTrigger), capabilities.whatsapp),
    ).toEqual([]);
  });

  it('rejects a non-positive give-up time and empty reminder or nudge texts', () => {
    const wait: Step = {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 0,
      reminder: { afterHours: 1, text: '' },
      nudge: { text: ' ', then: 'end' },
    };
    expect(
      codes(validateDefinition(withSteps([message, wait], messagesTrigger), capabilities.tiktok)),
    ).toEqual([
      { path: 'steps.1.giveUpHours', code: 'GIVE_UP_HOURS_INVALID' },
      { path: 'steps.1.reminder.afterHours', code: 'REMINDER_DELAY_INVALID' },
      { path: 'steps.1.reminder.text', code: 'TEXT_REQUIRED' },
      { path: 'steps.1.nudge.text', code: 'TEXT_REQUIRED' },
    ]);
  });
});

describe('validateDefinition step order', () => {
  const messagesTrigger: Definition = {
    trigger: { messages: { keywords: ['hi'] }, onRepeatWhileWaiting: 'supersede' },
    steps: [],
  };
  const reply: Step = { kind: 'reply_to_comment', text: 'Check your inbox' };
  const message: Step = { kind: 'send_message', text: 'What is your email?', buttons: [] };
  const wait: Step = { kind: 'wait_for_reply', expect: 'email', giveUpHours: 72 };
  const webhook: Step = {
    kind: 'call_webhook',
    method: 'POST',
    url: 'https://crm.example.com/hook',
    headers: {},
  };
  const secondMessage = (index: number): ValidationIssue => ({
    path: `steps.${index}.kind`,
    code: 'STEP_NOT_ALLOWED_HERE',
    message: 'A second message needs a wait for a reply before it on this network',
  });

  it.each(['instagram', 'facebook'] as const)(
    'on %s refuses a second message until the contact had a chance to reply',
    (platform) => {
      const record = capabilities[platform];
      expect(validateDefinition(withSteps([reply, message, message]), record)).toEqual([
        secondMessage(2),
      ]);
      expect(validateDefinition(withSteps([message, webhook, message]), record)).toEqual([
        secondMessage(2),
      ]);
      expect(validateDefinition(withSteps([message, wait, message]), record)).toEqual([]);
      expect(validateDefinition(withSteps([message, wait, webhook, message]), record)).toEqual([]);
      expect(validateDefinition(withSteps([message, wait, message, message]), record)).toEqual([
        secondMessage(3),
      ]);
    },
  );

  it('on Bluesky accepts two messages in a row', () => {
    const skip: Step = { ...message, onUnreachable: 'skip' };
    expect(validateDefinition(withSteps([skip, skip]), capabilities.bluesky)).toEqual([]);
  });

  it('refuses a comment reply when no comments trigger exists', () => {
    expect(
      validateDefinition(withSteps([reply, message], messagesTrigger), capabilities.instagram),
    ).toEqual([
      {
        path: 'steps.0.kind',
        code: 'STEP_NOT_ALLOWED_HERE',
        message: 'Replying to the comment needs a comments trigger',
      },
    ]);
    expect(
      validateDefinition(
        withSteps([reply, message], {
          ...messagesTrigger,
          trigger: { ...messagesTrigger.trigger, comments: example.trigger.comments },
        }),
        capabilities.instagram,
      ),
    ).toEqual([]);
  });

  it('refuses replying publicly instead when no comments trigger exists', () => {
    const fallback: Step = {
      ...message,
      onUnreachable: 'publicReplyInstead',
      fallbackText: 'DM me!',
    };
    expect(validateDefinition(withSteps([fallback], messagesTrigger), capabilities.x)).toEqual([
      {
        path: 'steps.0.onUnreachable',
        code: 'PUBLIC_REPLY_NEEDS_COMMENTS_TRIGGER',
        message: 'Replying publicly instead needs a comments trigger',
      },
    ]);
    expect(validateDefinition(withSteps([fallback]), capabilities.x)).toEqual([]);
  });
});

describe('validateDefinition template placeholders', () => {
  const message = (text: string): Step => ({ kind: 'send_message', text, buttons: [] });
  const waitForEmail: Step = { kind: 'wait_for_reply', expect: 'email', giveUpHours: 72 };
  const waitForAny: Step = { kind: 'wait_for_reply', expect: 'any', giveUpHours: 72 };

  it('rejects any placeholder other than {{email}} and {{contact.handle}}, spaces tolerated', () => {
    expect(
      validateDefinition(
        withSteps([message('Hi {{name}}, {{ Email }} and {{ contact.handle }}')]),
        capabilities.instagram,
      ),
    ).toEqual([
      {
        path: 'steps.0.text',
        code: 'UNKNOWN_PLACEHOLDER',
        message: '{{name}} is not a placeholder; use {{email}} or {{contact.handle}}',
      },
      {
        path: 'steps.0.text',
        code: 'UNKNOWN_PLACEHOLDER',
        message: '{{ Email }} is not a placeholder; use {{email}} or {{contact.handle}}',
      },
    ]);
    expect(
      validateDefinition(
        withSteps([{ kind: 'reply_to_comment', text: 'Thanks {{handle}}' }]),
        capabilities.instagram,
      ),
    ).toEqual([
      {
        path: 'steps.0.text',
        code: 'UNKNOWN_PLACEHOLDER',
        message: '{{handle}} is not a placeholder; use {{email}} or {{contact.handle}}',
      },
    ]);
  });

  it('allows {{email}} only after a wait for a reply that expects an email', () => {
    const notCaptured = (path: string): ValidationIssue => ({
      path,
      code: 'EMAIL_NOT_CAPTURED_YET',
      message: '{{email}} is only known after a wait for a reply that expects an email',
    });
    expect(
      validateDefinition(withSteps([message('Sent to {{ email }}')]), capabilities.instagram),
    ).toEqual([notCaptured('steps.0.text')]);
    expect(
      validateDefinition(
        withSteps([message('Email?'), waitForAny, message('Sent to {{email}}')]),
        capabilities.instagram,
      ),
    ).toEqual([notCaptured('steps.2.text')]);
    expect(
      validateDefinition(
        withSteps(
          [
            message('Email?'),
            {
              ...waitForEmail,
              reminder: { afterHours: 12, text: 'Still waiting for {{email}}' },
              nudge: { text: 'No address in {{email}}', then: 'wait' },
            },
            message('Sent to {{email}}'),
          ],
          { trigger: { messages: { keywords: [] }, onRepeatWhileWaiting: 'supersede' }, steps: [] },
        ),
        capabilities.tiktok,
      ),
    ).toEqual([notCaptured('steps.1.reminder.text'), notCaptured('steps.1.nudge.text')]);
    expect(
      validateDefinition(
        withSteps([message('Email?'), waitForEmail, message('Sent to {{email}}')]),
        capabilities.instagram,
      ),
    ).toEqual([]);
  });

  it('measures length on the raw template text, before placeholders are filled', () => {
    const text = `${'a'.repeat(980)}{{contact.handle}}`;
    expect(validateDefinition(withSteps([message(text)]), capabilities.instagram)).toEqual([]);
    expect(
      codes(validateDefinition(withSteps([message(`${text}aaa`)]), capabilities.instagram)),
    ).toEqual([
      { path: 'steps.0.text', code: 'TEXT_TOO_LONG' },
      { path: 'steps.0.text', code: 'TEXT_TOO_MANY_BYTES' },
    ]);
  });
});

describe('validateDefinition call_webhook', () => {
  it('requires an http(s) url and a known method', () => {
    const webhook: Step = {
      kind: 'call_webhook',
      method: 'HEAD' as WebhookMethod,
      url: 'crm.example.com/hooks',
      headers: {},
    };
    expect(codes(validateDefinition(withSteps([webhook]), capabilities.pinterest))).toEqual([
      { path: 'trigger.comments', code: 'TRIGGER_NOT_SUPPORTED' },
      { path: 'steps.0.method', code: 'METHOD_INVALID' },
      { path: 'steps.0.url', code: 'URL_INVALID' },
    ]);
  });
});
