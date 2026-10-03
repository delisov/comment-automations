import { describe, expect, it } from 'vitest';
import { accountId } from './ids.js';

describe('accountId', () => {
  it('rejects the empty string', () => {
    expect(() => accountId('')).toThrow('AccountId must not be empty');
  });

  it('round-trips a non-empty value', () => {
    expect(accountId('acc_42')).toBe('acc_42');
  });
});
