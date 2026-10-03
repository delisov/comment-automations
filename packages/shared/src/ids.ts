import type { Brand } from './brand.js';

export type AccountId = Brand<string, 'AccountId'>;

export const accountId = (value: string): AccountId => {
  if (value === '') {
    throw new Error('AccountId must not be empty');
  }
  return value as AccountId;
};
