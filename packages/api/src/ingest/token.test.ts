import { describe, expect, it } from 'vitest';
import { tokenMatches } from './token.js';

describe('tokenMatches', () => {
  it('accepts the exact token and rejects anything else, including a missing header', () => {
    expect(tokenMatches('secret', 'secret')).toBe(true);
    expect(tokenMatches('secret ', 'secret')).toBe(false);
    expect(tokenMatches('Secret', 'secret')).toBe(false);
    expect(tokenMatches('', 'secret')).toBe(false);
    expect(tokenMatches(undefined, 'secret')).toBe(false);
  });
});
