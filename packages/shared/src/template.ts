import type { CapabilityRecord } from './capabilities.js';
import { EMAIL_MAX_CHARS } from './email.js';

export type TemplateVars = { email?: string; contactHandle?: string };

export const longestTemplateVars = (record: CapabilityRecord): Required<TemplateVars> => ({
  email: 'a'.repeat(EMAIL_MAX_CHARS),
  contactHandle: 'a'.repeat(record.handleMaxChars),
});

const PLACEHOLDER = /\{\{\s*(email|contact\.handle)\s*\}\}/g;

export const renderTemplate = (text: string, vars: TemplateVars): string =>
  text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = name === 'email' ? vars.email : vars.contactHandle;
    return value === undefined ? placeholder : value;
  });
