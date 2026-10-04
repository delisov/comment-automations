import type { ValidationIssue } from '@comment-automations/api-schema';

const wording: Record<string, string> = {
  TEXT_REQUIRED: 'Write the text to send.',
  KEYWORDS_REQUIRED:
    'Add at least one keyword, or choose a specific post to reply to every comment on it.',
  FALLBACK_TEXT_REQUIRED: 'Write the public reply to send instead.',
};

export const issueAt = (issues: ValidationIssue[], path: string): string | null => {
  const issue = issues.find((item) => item.path === path);
  if (issue === undefined) {
    return null;
  }
  return wording[issue.code] ?? issue.message;
};

export const issuesUnder = (issues: ValidationIssue[], path: string): ValidationIssue[] =>
  issues.filter((item) => item.path === path || item.path.startsWith(`${path}.`));

export const ErrorText = ({ text }: { text: string | null }) =>
  text === null ? null : <div className="errtext">{text}</div>;
