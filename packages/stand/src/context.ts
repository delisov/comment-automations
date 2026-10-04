import type { ControlledClock } from '@comment-automations/shared';
import type { Db } from './db/database.js';
import type { Delivery } from './delivery.js';

export type Context = {
  db: Db;
  clock: ControlledClock;
  serviceUrl: string;
  serviceToken: string;
  delivery: Delivery;
};
