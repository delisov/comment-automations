import { describe, expect, it } from 'vitest';
import { charCount, plural } from './format.js';

describe('format', () => {
  it('counts text the way the validator does, in UTF-16 code units', () => {
    expect(charCount('😀'.repeat(501))).toBe(1002);
    expect(charCount('pricing')).toBe(7);
  });

  it('pluralizes a noun by its count', () => {
    expect(plural(1, 'run')).toBe('1 run');
    expect(plural(2, 'button')).toBe('2 buttons');
  });
});
