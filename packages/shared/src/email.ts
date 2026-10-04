const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

export const extractEmail = (text: string): string | null => {
  const match = EMAIL.exec(text);
  return match === null ? null : match[0].toLowerCase();
};
