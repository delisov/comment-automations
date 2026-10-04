import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

export const GATEWAY_ERROR_STATUS = {
  ALREADY_REPLIED: 409,
  REPLY_WINDOW_CLOSED: 403,
  MESSAGING_WINDOW_CLOSED: 403,
  RECIPIENT_UNREACHABLE: 403,
  MESSAGE_TOO_LONG: 422,
  BUTTONS_NOT_SUPPORTED: 422,
  RATE_LIMITED: 429,
  ACCOUNT_DISCONNECTED: 403,
  NOT_FOUND: 404,
  UNSUPPORTED: 422,
} as const satisfies Record<string, number>;

export type GatewayErrorCode = keyof typeof GATEWAY_ERROR_STATUS;

export const GATEWAY_ERROR_CODES = Object.keys(GATEWAY_ERROR_STATUS) as GatewayErrorCode[];

export const GatewayErrorCode = Type.Unsafe<GatewayErrorCode>(
  Type.Union(GATEWAY_ERROR_CODES.map((code) => Type.Literal(code))),
);

export const GatewayError = Type.Object({
  code: GatewayErrorCode,
  message: Type.String(),
  retryable: Type.Boolean(),
});

export type GatewayError = Static<typeof GatewayError>;
