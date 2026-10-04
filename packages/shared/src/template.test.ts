import { describe, expect, it } from 'vitest';
import { renderTemplate } from './template.js';

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
