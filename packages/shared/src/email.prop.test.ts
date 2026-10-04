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

describe('extractEmail invariants', () => {
  it('recovers a generated address, lowercased, from surrounding text', () => {
    fc.assert(
      fc.property(filler, address, trailer, (before, email, after) => {
        expect(extractEmail(`${before}${email}${after}`)).toBe(email.toLowerCase());
      }),
    );
  });
});
