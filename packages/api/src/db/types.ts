import type {
  AccountId,
  AutomationId,
  CommentId,
  ContactId,
  ConversationId,
  Definition,
  EventId,
  JobId,
  Platform,
  PostId,
  RunId,
  VersionId,
} from '@comment-automations/shared';
import type { InboundEvent } from '@comment-automations/gateway-contract';
import type { ColumnType, Generated, Kysely, Transaction } from 'kysely';

type JsonInsert<T> = null extends T ? string | null : string;

export type Json<T> = ColumnType<T, JsonInsert<T>, JsonInsert<T>>;

export type Timestamp = ColumnType<Date, Date, Date>;

export type AccountStatus = 'connected' | 'disconnected';

export type AutomationState = 'draft' | 'live' | 'archived';

export type RunStatus =
  'running' | 'waiting' | 'completed' | 'failed' | 'expired' | 'superseded' | 'stopped';

export type JobKind = 'advance' | 'reminder' | 'give_up' | 'nudge';

export type JobStatus = 'pending' | 'done' | 'failed';

export type LogLevel = 'info' | 'warn' | 'error';

export type RunContext = {
  commentId?: CommentId;
  postId?: PostId;
  conversationId?: ConversationId;
  lastInboundAt?: string;
  consumedEventIds?: EventId[];
  captured: { email?: string };
  replied: boolean;
};

export type RunError = { code: string; message: string };

export type AccountsTable = {
  id: Generated<AccountId>;
  platform: Platform;
  external_id: string;
  handle: string;
  display_name: string;
  status: AccountStatus;
  synced_at: Timestamp;
};

export type AutomationsTable = {
  id: Generated<AutomationId>;
  account_id: AccountId;
  name: string;
  state: AutomationState;
  active_version_id: VersionId | null;
  draft: Json<Definition | null>;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AutomationVersionsTable = {
  id: Generated<VersionId>;
  automation_id: AutomationId;
  number: number;
  definition: Json<Definition>;
  note: string;
  published_at: Timestamp;
};

export type EventsTable = {
  id: Generated<EventId>;
  platform: Platform;
  account_id: string;
  external_event_id: string;
  kind: InboundEvent['kind'];
  message_id: string | null;
  payload: Json<InboundEvent>;
  received_at: Timestamp;
};

export type ContactsTable = {
  id: Generated<ContactId>;
  platform: Platform;
  account_id: AccountId;
  external_id: string;
  handle: string;
  email: string | null;
  updated_at: Timestamp;
};

export type RunsTable = {
  id: Generated<RunId>;
  automation_id: AutomationId;
  version_id: VersionId;
  account_id: AccountId;
  contact_id: ContactId;
  trigger_event_id: EventId;
  comment_id: CommentId | null;
  status: RunStatus;
  step_index: number;
  context: Json<RunContext>;
  wait_until: Timestamp | null;
  reminder_at: Timestamp | null;
  reminder_sent: Generated<boolean>;
  nudged: Generated<boolean>;
  error: Json<RunError | null>;
  started_at: Timestamp;
  finished_at: Timestamp | null;
  updated_at: Timestamp;
};

export type RunLogsTable = {
  id: Generated<number>;
  run_id: RunId;
  step_index: number | null;
  level: LogLevel;
  message: string;
  context: Json<Record<string, unknown>>;
  at: Timestamp;
};

export type OutboundCallsTable = {
  id: Generated<string>;
  run_id: RunId;
  idempotency_key: string;
  kind: string;
  request: Json<unknown>;
  response: Json<unknown>;
  status: string;
  at: Timestamp;
};

export type JobsTable = {
  id: Generated<JobId>;
  kind: JobKind;
  run_id: RunId;
  run_at: Timestamp;
  attempts: Generated<number>;
  locked_until: Timestamp | null;
  status: Generated<JobStatus>;
};

export type Database = {
  accounts: AccountsTable;
  automations: AutomationsTable;
  automation_versions: AutomationVersionsTable;
  events: EventsTable;
  contacts: ContactsTable;
  runs: RunsTable;
  run_logs: RunLogsTable;
  outbound_calls: OutboundCallsTable;
  jobs: JobsTable;
};

export type Db = Kysely<Database> | Transaction<Database>;

export const json = <T>(value: T): string => JSON.stringify(value);
