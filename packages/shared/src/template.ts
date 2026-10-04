export type TemplateVars = { email?: string; contactHandle?: string };

const PLACEHOLDER = /\{\{\s*(email|contact\.handle)\s*\}\}/g;

export const renderTemplate = (text: string, vars: TemplateVars): string =>
  text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = name === 'email' ? vars.email : vars.contactHandle;
    return value === undefined ? placeholder : value;
  });
