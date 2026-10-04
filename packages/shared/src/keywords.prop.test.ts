import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isMatchableKeyword, matchesKeywords } from './keywords.js';

const letters = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789абвгдежзийклмнопрстуфхцчшщэюяÀÉÎÕÜàéîõü',
];

const word = fc
  .array(fc.constantFrom(...letters), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(''));

const phrase = fc.array(word, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));

const whitespace = fc
  .array(fc.constantFrom(' ', '\n', '\t', '  '), {
    minLength: 1,
    maxLength: 3,
  })
  .map((parts) => parts.join(''));

const sentence = fc.array(word, { minLength: 0, maxLength: 8 }).map((words) => words.join(' '));

const randomCase = (text: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: text.length, maxLength: text.length })
    .map((flags) =>
      [...text].map((char, i) => (flags[i] ? char.toUpperCase() : char.toLowerCase())).join(''),
    );

describe('matchesKeywords invariants', () => {
  it('is invariant under case changes of text and keywords', () => {
    fc.assert(
      fc.property(
        sentence.chain((text) => fc.tuple(fc.constant(text), randomCase(text))),
        fc
          .array(phrase, { maxLength: 4 })
          .chain((keywords) =>
            fc.tuple(fc.constant(keywords), fc.tuple(...keywords.map(randomCase))),
          ),
        ([text, recasedText], [keywords, recasedKeywords]) => {
          expect(matchesKeywords(recasedText, recasedKeywords)).toBe(
            matchesKeywords(text, keywords),
          );
        },
      ),
    );
  });

  it('is invariant under the kind of whitespace that separates words', () => {
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 8 }),
        fc.array(whitespace, { minLength: 8, maxLength: 8 }),
        fc.array(phrase, { maxLength: 4 }),
        (words, gaps, keywords) => {
          const plain = words.join(' ');
          const spaced = words.map((w, i) => `${w}${gaps[i]}`).join('');
          expect(matchesKeywords(spaced, keywords)).toBe(matchesKeywords(plain, keywords));
        },
      ),
    );
  });

  it('always matches a text that contains the keyword surrounded by spaces', () => {
    fc.assert(
      fc.property(sentence, sentence, phrase, (before, after, keyword) => {
        expect(matchesKeywords(`${before} ${keyword} ${after}`, [keyword])).toBe(true);
      }),
    );
  });

  it('never matches a keyword glued inside a longer word', () => {
    fc.assert(
      fc.property(word, word, word, (prefix, keyword, suffix) => {
        expect(matchesKeywords(`${prefix}${keyword}${suffix}`, [keyword])).toBe(false);
      }),
    );
  });
});

describe('isMatchableKeyword invariants', () => {
  it('a comment consisting of exactly a keyword that validates matches that keyword', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }).filter(isMatchableKeyword),
        (keyword) => {
          expect(matchesKeywords(keyword, [keyword])).toBe(true);
        },
      ),
    );
  });
});
