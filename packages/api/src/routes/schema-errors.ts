import type { ValidationIssue } from '@comment-automations/api-schema';
import type { FastifyRequest, FastifySchemaValidationError } from 'fastify';

type SchemaError = FastifySchemaValidationError & {
  parentSchema?: { minimum?: number; maximum?: number };
};

export type SchemaIssuesError = Error & { issues: ValidationIssue[]; validationContext?: string };

const SHAPE_KEYWORDS = new Set(['anyOf', 'const', 'enum', 'required']);

const ISSUE_ROUTES = new Set(['PUT /automations/:id/draft', 'POST /automations/:id/publish']);

const pathOf = (error: SchemaError): string => {
  const segments = error.instancePath.split('/').filter((segment) => segment !== '');
  if (typeof error.params.missingProperty === 'string') {
    segments.push(error.params.missingProperty);
  }
  return (segments[0] === 'definition' ? segments.slice(1) : segments).join('.');
};

const describe = (error: SchemaError): Pick<ValidationIssue, 'code' | 'message'> => {
  switch (error.keyword) {
    case 'maxLength':
      return { code: 'TOO_LONG', message: `is longer than ${error.params.limit} characters` };
    case 'minLength':
      return { code: 'EMPTY', message: 'must not be empty' };
    case 'maxItems':
      return { code: 'TOO_MANY', message: `has more than ${error.params.limit} items` };
    case 'minimum':
    case 'maximum':
      return {
        code: 'OUT_OF_RANGE',
        message: `must be between ${error.parentSchema?.minimum} and ${error.parentSchema?.maximum}`,
      };
    default:
      return { code: 'INVALID', message: 'is not valid' };
  }
};

const mostSpecific = (errors: SchemaError[]): SchemaError[] => {
  const detailed = errors.filter((error) => !SHAPE_KEYWORDS.has(error.keyword));
  if (detailed.length > 0) {
    return detailed;
  }
  const branches = errors.filter((error) => error.keyword !== 'anyOf');
  return branches.length > 0 ? branches : errors;
};

export const schemaIssues = (errors: FastifySchemaValidationError[]): ValidationIssue[] => {
  const seen = new Set<string>();
  return mostSpecific(errors)
    .map((error) => ({ path: pathOf(error), ...describe(error) }))
    .filter((issue) => {
      const key = `${issue.path} ${issue.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

export const schemaErrorFormatter = (errors: FastifySchemaValidationError[]): Error => {
  const issues = schemaIssues(errors);
  const error = new Error(
    issues.map((issue) => `${issue.path} ${issue.message}`.trim()).join('; '),
  ) as SchemaIssuesError;
  error.issues = issues;
  return error;
};

export const isSchemaIssuesError = (error: unknown): error is SchemaIssuesError =>
  error instanceof Error && Array.isArray((error as Partial<SchemaIssuesError>).issues);

export const answersIssues = (request: FastifyRequest): boolean =>
  ISSUE_ROUTES.has(`${request.method} ${request.routeOptions.url}`);
