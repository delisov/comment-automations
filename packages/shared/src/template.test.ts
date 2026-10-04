import { describe, expect, it } from 'vitest';
import { PLATFORMS } from './platform.js';
import { capabilities } from './platforms/index.js';
import { longestTemplateVars, renderTemplate } from './template.js';

describe('longestTemplateVars', () => {
  it('takes the longest handle from the record and the longest email from the extractor cap', () => {
    expect(longestTemplateVars(capabilities.bluesky)).toEqual({
      email: 'a'.repeat(254),
      contactHandle: 'a'.repeat(64),
    });
    expect(longestTemplateVars(capabilities.instagram).contactHandle).toHaveLength(31);
    for (const platform of PLATFORMS) {
      const record = capabilities[platform];
      expect(longestTemplateVars(record).contactHandle).toHaveLength(record.handleMaxChars);
    }
  });
});

describe('renderTemplate', () => {
  it('fills email and contact handle', () => {
    expect(
      renderTemplate('Thanks {{contact.handle}}, sent to {{ email }}.', {
        email: 'jane@example.com',
        contactHandle: '@jane',
      }),
    ).toBe('Thanks @jane, sent to jane@example.com.');
  });

  it('leaves unknown placeholders and missing variables untouched', () => {
    expect(renderTemplate('Hi {{name}}, {{email}}', { contactHandle: '@jane' })).toBe(
      'Hi {{name}}, {{email}}',
    );
  });

  it('returns text without placeholders unchanged', () => {
    expect(renderTemplate('plain text', { email: 'x@y.io' })).toBe('plain text');
  });
});
