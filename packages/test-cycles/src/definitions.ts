import type { Definition, Platform, Trigger } from '@comment-automations/shared';

export const KEYWORD = 'pricing';

const onComments: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: [KEYWORD] },
  onRepeatWhileWaiting: 'supersede',
};

export const GUIDE_URL = 'https://example.com/guide';

export const PRICING_URL = 'https://example.com/pricing';

export const instagramFullFlow = (webhookUrl: string): Definition => ({
  trigger: onComments,
  steps: [
    { kind: 'reply_to_comment', text: 'Sent you a DM, {{contact.handle}}!' },
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
      buttons: [{ title: 'Open the guide', url: GUIDE_URL }],
    },
    {
      kind: 'call_webhook',
      method: 'POST',
      url: `${webhookUrl}/hooks/leads`,
      headers: { Authorization: 'Bearer token' },
    },
  ],
});

export const instagramAskForEmail: Definition = {
  trigger: onComments,
  steps: [
    { kind: 'send_message', text: 'What is your email?', buttons: [] },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      nudge: { text: 'Could you send the email once more?', then: 'wait' },
    },
  ],
};

export const instagramReplyOnly: Definition = {
  trigger: onComments,
  steps: [{ kind: 'reply_to_comment', text: 'Thanks for asking, {{contact.handle}}!' }],
};

export const instagramReplyOnKeyword = (keyword: string): Definition => ({
  trigger: { ...onComments, comments: { posts: { kind: 'any' }, keywords: [keyword] } },
  steps: [{ kind: 'reply_to_comment', text: `Thanks for the ${keyword}, {{contact.handle}}!` }],
});

export const tiktokElevenMessages: Definition = {
  trigger: { messages: { keywords: [KEYWORD] }, onRepeatWhileWaiting: 'supersede' },
  steps: Array.from({ length: 11 }, (_, index) => ({
    kind: 'send_message' as const,
    text: `Message ${String(index + 1)} of 11`,
    buttons: [],
  })),
};

export const blueskyReminder: Definition = {
  trigger: onComments,
  steps: [
    { kind: 'send_message', text: 'What is your email?', buttons: [], onUnreachable: 'fail' },
    {
      kind: 'wait_for_reply',
      expect: 'email',
      giveUpHours: 72,
      reminder: { afterHours: 24, text: 'Still there, {{contact.handle}}?' },
    },
  ],
};

export const blueskyPublicFallback: Definition = {
  trigger: onComments,
  steps: [
    {
      kind: 'send_message',
      text: 'Here is the pricing guide',
      buttons: [],
      onUnreachable: 'publicReplyInstead',
      fallbackText: 'Your DMs are closed, {{contact.handle}}; find the guide in our bio.',
    },
  ],
};

export const youtubeReplyOnly: Definition = {
  trigger: onComments,
  steps: [
    {
      kind: 'reply_to_comment',
      text: 'Thanks {{contact.handle}}, the pricing is pinned in the description.',
    },
  ],
};

export const whatsappPricing: Definition = {
  trigger: { messages: { keywords: [KEYWORD] }, onRepeatWhileWaiting: 'supersede' },
  steps: [
    {
      kind: 'send_message',
      text: 'Hi {{contact.handle}}, here is our pricing.',
      buttons: [{ title: 'Open pricing', url: PRICING_URL }],
    },
  ],
};

export const definitionsByPlatform: [Platform, string, Definition][] = [
  ['instagram', 'full flow', instagramFullFlow('http://receiver.local:3900')],
  ['instagram', 'ask for an email', instagramAskForEmail],
  ['instagram', 'reply only', instagramReplyOnly],
  ['bluesky', 'reminder', blueskyReminder],
  ['bluesky', 'public fallback', blueskyPublicFallback],
  ['youtube', 'reply only', youtubeReplyOnly],
  ['whatsapp', 'pricing on message', whatsappPricing],
];
