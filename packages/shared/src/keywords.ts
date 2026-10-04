const WORD = /[\p{L}\p{M}\p{N}]+|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

const UNSPACED_SCRIPTS =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]+$/u;

const normalizeWords = (text: string): string => (text.match(WORD) ?? []).join(' ').toLowerCase();

export const matchesKeywords = (text: string, keywords: string[]): boolean => {
  if (keywords.length === 0) {
    return text.trim() !== '';
  }
  const words = normalizeWords(text);
  const haystack = ` ${words} `;
  return keywords
    .map(normalizeWords)
    .filter((keyword) => keyword !== '')
    .some((keyword) =>
      UNSPACED_SCRIPTS.test(keyword) ? words.includes(keyword) : haystack.includes(` ${keyword} `),
    );
};
