const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const sanitizeString = (value: string): string =>
  value.replaceAll('\u0000', '').replace(LONE_SURROGATE, '�');

export const sanitizeStrings = <T>(value: T): T => {
  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeStrings) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeStrings(entry)]),
    ) as T;
  }
  return value;
};
