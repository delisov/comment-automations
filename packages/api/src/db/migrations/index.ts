import type { Migration } from 'kysely/migration';
import * as initial from './0001_initial.js';
import * as runsCommentId from './0002_runs_comment_id.js';
import * as eventsMessageId from './0003_events_message_id.js';

export const migrations: Record<string, Migration> = {
  '0001_initial': initial,
  '0002_runs_comment_id': runsCommentId,
  '0003_events_message_id': eventsMessageId,
};
