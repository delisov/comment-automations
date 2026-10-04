import { capabilities, validateDefinition } from '@comment-automations/shared';
import { describe, expect, it } from 'vitest';
import { definitionsByPlatform } from './definitions.js';

describe('the definitions the cycles publish', () => {
  it.each(definitionsByPlatform)(
    '%s %s validates clean against its platform',
    (platform, _, definition) => {
      expect(validateDefinition(definition, capabilities[platform])).toEqual([]);
    },
  );
});
