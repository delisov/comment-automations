import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractEmail } from './email.js';

const alnum = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
const alpha = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'];

const chunk = (chars: string[], max: number) =>
  fc.array(fc.constantFrom(...chars), { minLength: 1, maxLength: max }).map((c) => c.join(''));

const address = fc
  .tuple(
    fc.array(chunk([...alnum, '_', '%', '+', '-'], 8), { minLength: 1, maxLength: 3 }),
    fc.array(chunk([...alnum, '-'], 8), { minLength: 1, maxLength: 3 }),
    chunk(alpha, 6).filter((tld) => tld.length >= 2),
  )
  .map(([local, domain, tld]) => `${local.join('.')}@${domain.join('.')}.${tld}`);

const filler = fc
  .array(fc.constantFrom(...alpha, ' ', '\n', '!', ',', ':'), { maxLength: 20 })
  .map((c) => c.join(''))
  .filter((text) => !/[A-Za-z0-9]$/.test(text));

const trailer = fc
  .array(fc.constantFrom(...alpha, ' ', '\n', '!', ',', ')'), { maxLength: 20 })
  .map((c) => c.join(''))
  .filter((text) => !/^[A-Za-z0-9.@_%+-]/.test(text));

const longAddress = fc
  .tuple(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 1, max: 300 }))
  .filter(([local, domain]) => local > 64 || local + 1 + domain + 4 > 254)
  .map(([local, domain]) => `${'a'.repeat(local)}@${'b'.repeat(domain)}.com`);

describe('extractEmail invariants', () => {
  it('recovers a generated address, lowercased, from surrounding text', () => {
    fc.assert(
      fc.property(filler, address, trailer, (before, email, after) => {
        expect(extractEmail(`${before}${email}${after}`)).toBe(email.toLowerCase());
      }),
    );
  });

  it('never returns more than 254 characters or a local part over 64, whatever the text', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 600 }), longAddress), (text) => {
        const email = extractEmail(text);
        if (email !== null) {
          expect(email.length).toBeLessThanOrEqual(254);
          expect(email.indexOf('@')).toBeLessThanOrEqual(64);
        }
      }),
    );
  });

  it('ignores an address that is too long to be delivered', () => {
    fc.assert(
      fc.property(filler, longAddress, trailer, (before, email, after) => {
        expect(extractEmail(`${before}${email}${after}`)).toBeNull();
      }),
    );
  });
});
