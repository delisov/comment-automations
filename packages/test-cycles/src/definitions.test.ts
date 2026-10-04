import { capabilities, validateDefinition } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import { definitionsByPlatform, tiktokElevenMessages } from './definitions.js';

describe('the definitions the cycles publish', () => {
  it.each(definitionsByPlatform)(
    '%s %s validates clean against its platform',
    (platform, _, definition) => {
      expect(validateDefinition(definition, capabilities[platform])).toEqual([]);
    },
  );

  it('eleven messages in a row on tiktok hit the cap at the eleventh step', () => {
    expect(validateDefinition(tiktokElevenMessages, capabilities.tiktok)).toEqual([
      {
        path: 'steps.10.kind',
        code: 'STEP_NOT_ALLOWED_HERE',
        message: 'TikTok allows at most 10 messages in a row before the contact replies',
      },
    ]);
  });
});
