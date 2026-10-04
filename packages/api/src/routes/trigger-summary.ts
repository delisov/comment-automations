import type { Definition } from '@comment-automations/shared';

const keywordList = (keywords: string[]): string =>
  keywords.length === 0 ? 'any' : keywords.join(', ');

export const triggerSummary = (definition: Definition | null): string => {
  if (definition === null) {
    return 'No trigger yet';
  }
  const { comments, messages } = definition.trigger;
  if (comments !== undefined && messages !== undefined) {
    const keywords = [...new Set([...comments.keywords, ...messages.keywords])];
    return `Comment or message · ${keywordList(keywords)}`;
  }
  if (comments !== undefined) {
    return `Comment · ${keywordList(comments.keywords)}`;
  }
  if (messages !== undefined) {
    return `Message · ${keywordList(messages.keywords)}`;
  }
  return 'No trigger yet';
};
