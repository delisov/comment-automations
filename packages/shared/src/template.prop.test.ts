import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from './template.js';

const withoutBraces = fc.string().filter((text) => !text.includes('{{'));

const vars = fc.record(
  { email: withoutBraces, contactHandle: withoutBraces },
  { requiredKeys: [] },
);

const template = fc
  .array(fc.oneof(withoutBraces, fc.constantFrom('{{email}}', '{{contact.handle}}', '{{ email }}')))
  .map((parts) => parts.join(''));

describe('renderTemplate invariants', () => {
  it('is idempotent once no placeholder remains', () => {
    fc.assert(
      fc.property(template, vars, (text, values) => {
        const once = renderTemplate(text, values);
        fc.pre(!once.includes('{{'));
        expect(renderTemplate(once, values)).toBe(once);
      }),
    );
  });

  it('leaves text without placeholders unchanged', () => {
    fc.assert(
      fc.property(withoutBraces, vars, (text, values) => {
        expect(renderTemplate(text, values)).toBe(text);
      }),
    );
  });
});
