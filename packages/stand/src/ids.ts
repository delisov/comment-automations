import { randomUUID } from 'node:crypto';
import type { Brand } from '@comment-automations/shared';

export type MessageId = Brand<string, 'MessageId'>;

export const messageId = (value: string): MessageId => {
  if (value === '') {
    throw new Error('MessageId must not be empty');
  }
  return value as MessageId;
};

export const newId = <T>(make: (value: string) => T, prefix: string): T =>
  make(`${prefix}_${randomUUID().slice(0, 8)}`);
