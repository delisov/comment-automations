import { describe, expect, it } from 'vitest';
import { sanitizeStrings } from './sanitize.js';

describe('sanitizeStrings', () => {
  it('strips NUL and replaces lone surrogates in every string of a body', () => {
    expect(
      sanitizeStrings({
        name: 'Pricing\u0000 guide',
        nested: { text: 'hi \ud800 there', ok: '😀 stays' },
        list: ['\udc00', 1, null, true],
      }),
    ).toEqual({
      name: 'Pricing guide',
      nested: { text: 'hi � there', ok: '😀 stays' },
      list: ['�', 1, null, true],
    });
  });

  it('sanitizes object keys the same way as values', () => {
    expect(
      sanitizeStrings({ 'k\u0000': 1, 'a\ud800b': { 'x\u0000y': ['v\u0000'] }, '😀': true }),
    ).toEqual({ k: 1, 'a�b': { xy: ['v'] }, '😀': true });
  });

  it('leaves values that are not strings or containers alone', () => {
    expect([sanitizeStrings(undefined), sanitizeStrings(3), sanitizeStrings(null)]).toEqual([
      undefined,
      3,
      null,
    ]);
  });
});
