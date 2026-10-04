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

  it('returns null when nothing has the shape local@domain.tld', () => {
    expect(extractEmail('no email here')).toBeNull();
    expect(extractEmail('me@localhost')).toBeNull();
    expect(extractEmail('@example.com')).toBeNull();
    expect(extractEmail('me@.com')).toBeNull();
    expect(extractEmail('')).toBeNull();
  });
});
