const WORD_BREAK = /[^\p{L}\p{N}]+/u;

const normalizeWords = (text: string): string =>
  text
    .split(WORD_BREAK)
    .filter((word) => word !== '')
    .join(' ')
    .toLowerCase();

export const matchesKeywords = (text: string, keywords: string[]): boolean => {
  if (keywords.length === 0) {
    return text.trim() !== '';
  }
  const haystack = ` ${normalizeWords(text)} `;
  return keywords
    .map(normalizeWords)
    .filter((keyword) => keyword !== '')
    .some((keyword) => haystack.includes(` ${keyword} `));
};
