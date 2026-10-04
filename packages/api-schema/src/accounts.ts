import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { CapabilitiesResponse } from './capabilities.js';
import { AccountIdSchema } from './ids.js';
import { Platform } from './platform.js';

export const AccountSummary = Type.Object({
  id: AccountIdSchema,
  platform: Platform,
  handle: Type.String(),
  displayName: Type.String(),
  status: Type.Union([Type.Literal('connected'), Type.Literal('disconnected')]),
  capabilities: CapabilitiesResponse,
});

export type AccountSummary = Static<typeof AccountSummary>;

export const AccountsResponse = Type.Object({
  accounts: Type.Array(AccountSummary),
});

export type AccountsResponse = Static<typeof AccountsResponse>;
