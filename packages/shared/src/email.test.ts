import { describe, expect, it } from 'vitest';
import { extractEmail } from './email.js';

describe('extractEmail', () => {
  it('returns the first address, lowercased', () => {
    expect(extractEmail('sure! Jane.Doe@Example.COM or jane2@example.com')).toBe(
      'jane.doe@example.com',
    );
  });

  it('finds an address inside punctuation and line breaks', () => {
    expect(extractEmail('here:\nme@mail.example.org.')).toBe('me@mail.example.org');
    expect(extractEmail('(ping me at a+b@x-y.co)')).toBe('a+b@x-y.co');
  });

  it('accepts an address of 254 characters with a local part of 64, and nothing longer', () => {
    const local = 'a'.repeat(64);
    const longest = `${local}@${'b'.repeat(185)}.com`;
    expect(longest).toHaveLength(254);
    expect(extractEmail(`send it to ${longest} thanks`)).toBe(longest);
    expect(extractEmail(`${local}@${'b'.repeat(186)}.com`)).toBeNull();
    expect(extractEmail(`${'a'.repeat(65)}@example.com`)).toBeNull();
    expect(extractEmail(`${'a'.repeat(408)}@x.io`)).toBeNull();
  });

  it('skips an overlong address and returns the next one that fits', () => {
    expect(extractEmail(`${'a'.repeat(65)}@example.com or jane@example.com`)).toBe(
      'jane@example.com',
    );
  });

  it('returns null when nothing has the shape local@domain.tld', () => {
    expect(extractEmail('no email here')).toBeNull();
    expect(extractEmail('me@localhost')).toBeNull();
    expect(extractEmail('@example.com')).toBeNull();
    expect(extractEmail('me@.com')).toBeNull();
    expect(extractEmail('')).toBeNull();
  });
});
