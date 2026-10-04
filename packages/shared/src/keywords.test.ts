import { describe, expect, it } from 'vitest';
import { matchesKeywords } from './keywords.js';

describe('matchesKeywords', () => {
  it('matches a whole word regardless of case', () => {
    expect(matchesKeywords('What is the PRICING for this?', ['pricing'])).toBe(true);
  });

  it('does not match a keyword hidden inside a longer word', () => {
    expect(matchesKeywords('repricing is live', ['pricing'])).toBe(false);
    expect(matchesKeywords('pricings', ['pricing'])).toBe(false);
    expect(matchesKeywords('pricey', ['price'])).toBe(false);
  });

  it('treats punctuation as a word break and every emoji as a word of its own', () => {
    expect(matchesKeywords('pricing?!', ['pricing'])).toBe(true);
    expect(matchesKeywords('wow🔥pricing🔥', ['pricing'])).toBe(true);
    expect(matchesKeywords('comment 🔥', ['🔥'])).toBe(true);
    expect(matchesKeywords('🔥', ['🔥'])).toBe(true);
    expect(matchesKeywords('comment 🔥 to get the link', ['🙋', '🔥'])).toBe(true);
    expect(matchesKeywords('comment below', ['🔥'])).toBe(false);
    expect(matchesKeywords('love it ❤️', ['❤️'])).toBe(true);
  });

  it('matches Unicode letters whole-word and case-insensitively', () => {
    expect(matchesKeywords('Сколько стоит ЦЕНА?', ['цена'])).toBe(true);
    expect(matchesKeywords('ценами', ['цена'])).toBe(false);
    expect(matchesKeywords('très intéressé', ['INTÉRESSÉ'])).toBe(true);
  });

  it('matches a keyword in a script without word spacing as a substring', () => {
    expect(matchesKeywords('価格はいくら', ['価格'])).toBe(true);
    expect(matchesKeywords('价格多少', ['价格'])).toBe(true);
    expect(matchesKeywords('ราคาเท่าไหร่', ['ราคา'])).toBe(true);
    expect(matchesKeywords('ราคาเท่าไหร่', ['เท่า'])).toBe(true);
    expect(matchesKeywords('価格はいくら', ['送料'])).toBe(false);
  });

  it('matches a multi-word keyword across line breaks and repeated spaces', () => {
    expect(matchesKeywords('send me the\n\n  price   list please', ['price list'])).toBe(true);
    expect(matchesKeywords('send me the price\nlist', ['PRICE  LIST'])).toBe(true);
  });

  it('matches when any keyword is present', () => {
    expect(matchesKeywords('link please', ['pricing', 'link'])).toBe(true);
    expect(matchesKeywords('hello there', ['pricing', 'link'])).toBe(false);
  });

  it('matches any non-empty text when the keyword list is empty', () => {
    expect(matchesKeywords('anything at all', [])).toBe(true);
    expect(matchesKeywords('   ', [])).toBe(false);
    expect(matchesKeywords('', [])).toBe(false);
  });

  it('never matches a keyword that has no letters, digits or emoji', () => {
    expect(matchesKeywords('!!! ???', ['!!!'])).toBe(false);
  });
});
