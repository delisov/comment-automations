import type { MessageButton, Platform } from '@comment-automations/gateway-contract';
import type {
  AccountId,
  CommentId,
  ConversationId,
  EventId,
  PostId,
  UserId,
} from '@comment-automations/shared';
import type { Generated, JSONColumnType } from 'kysely';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { MessageId } from '../ids.js';

export type DmSetting = 'all' | 'following' | 'none';

export type AccountsTable = {
  id: AccountId;
  platform: Platform;
  handle: string;
  display_name: string;
  status: 'connected' | 'disconnected';
};

export type UsersTable = {
  id: UserId;
  platform: Platform;
  handle: string;
  display_name: string;
  dm_setting: DmSetting;
  follows_account_ids: AccountId[];
};

export type PostsTable = {
  id: PostId;
  account_id: AccountId;
  caption: string;
  published_at: Date;
};

export type CommentsTable = {
  id: CommentId;
  post_id: PostId;
  author_user_id: UserId | null;
  author_account_id: AccountId | null;
  parent_id: CommentId | null;
  text: string;
  created_at: Date;
  private_reply_sent: Generated<boolean>;
};

export type ConversationsTable = {
  id: ConversationId;
  account_id: AccountId;
  user_id: UserId;
  opened_by: 'privateReply' | 'user' | 'account';
  last_user_message_at: Date | null;
};

export type MessagesTable = {
  id: MessageId;
  seq: Generated<number>;
  conversation_id: ConversationId;
  from: 'account' | 'user';
  text: string;
  buttons: JSONColumnType<MessageButton[]>;
  created_at: Date;
};

export type EventLogTable = {
  id: Generated<number>;
  direction: 'to_service' | 'from_service';
  kind: string;
  payload: JSONColumnType<object>;
  result_code: string | null;
  at: Date;
};

export type DeliveriesTable = {
  id: Generated<number>;
  event_id: EventId;
  attempt: number;
  status: 'delivered' | 'failed' | 'dropped';
  at: Date;
};

export type StoredResponse = { status: number; code: string; body: unknown };

export type IdempotencyTable = {
  account_id: AccountId;
  key: string;
  response: JSONColumnType<StoredResponse>;
};

export type SettingsTable = {
  id: Generated<number>;
  duplicate_percent: Generated<number>;
  reorder_window_ms: Generated<number>;
  delay_ms: Generated<number>;
  drop_percent: Generated<number>;
  burst429: Generated<number>;
};

export type Database = {
  accounts: AccountsTable;
  users: UsersTable;
  posts: PostsTable;
  comments: CommentsTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  event_log: EventLogTable;
  deliveries: DeliveriesTable;
  idempotency: IdempotencyTable;
  settings: SettingsTable;
};

export type Db = Kysely<Database>;

export const createDb = (connectionString: string): Db =>
  new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  }).withSchema('stand');
