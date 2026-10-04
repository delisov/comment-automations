import type {
  CommentEvent,
  MessageButton,
  MessageEvent,
  Platform,
} from '@comment-automations/gateway-contract';
import type { AccountId, ConversationId, UserId } from '@comment-automations/shared';
import { conversationId } from '@comment-automations/shared';
import type { Selectable } from 'kysely';
import type { CommentsTable, ConversationsTable, Db, MessagesTable } from './db/database.js';
import { messageId, newId } from './ids.js';

export type Comment = Selectable<CommentsTable>;
export type Conversation = Selectable<ConversationsTable>;
export type Message = Selectable<MessagesTable>;

export type Author = { id: string; handle: string };

export type LogEntry = {
  direction: 'to_service' | 'from_service';
  kind: string;
  payload: object;
  resultCode: string | null;
  at: Date;
};

export const logEvent = (db: Db, entry: LogEntry) =>
  db
    .insertInto('event_log')
    .values({
      direction: entry.direction,
      kind: entry.kind,
      payload: JSON.stringify(entry.payload),
      result_code: entry.resultCode,
      at: entry.at,
    })
    .execute();

export const readSettings = (db: Db) =>
  db.selectFrom('settings').selectAll().where('id', '=', 1).executeTakeFirstOrThrow();

export const findConversation = (db: Db, account: AccountId, user: UserId) =>
  db
    .selectFrom('conversations')
    .selectAll()
    .where('account_id', '=', account)
    .where('user_id', '=', user)
    .executeTakeFirst();

export const openConversation = (
  db: Db,
  account: AccountId,
  user: UserId,
  openedBy: Conversation['opened_by'],
  lastUserMessageAt: Date | null,
) =>
  db
    .insertInto('conversations')
    .values({
      id: newId(conversationId, 'conv'),
      account_id: account,
      user_id: user,
      opened_by: openedBy,
      last_user_message_at: lastUserMessageAt,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

export const addMessage = (
  db: Db,
  message: {
    conversationId: ConversationId;
    from: Message['from'];
    text: string;
    buttons: MessageButton[];
    at: Date;
  },
) =>
  db
    .insertInto('messages')
    .values({
      id: newId(messageId, 'msg'),
      conversation_id: message.conversationId,
      from: message.from,
      text: message.text,
      buttons: JSON.stringify(message.buttons),
      created_at: message.at,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

export const accountMessagesSinceUser = async (
  db: Db,
  conversation: Conversation,
): Promise<number> => {
  const lastUser = await db
    .selectFrom('messages')
    .select((eb) => eb.fn.max('seq').as('seq'))
    .where('conversation_id', '=', conversation.id)
    .where('from', '=', 'user')
    .executeTakeFirstOrThrow();
  const row = await db
    .selectFrom('messages')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('conversation_id', '=', conversation.id)
    .where('from', '=', 'account')
    .where('seq', '>', Number(lastUser.seq ?? 0))
    .executeTakeFirstOrThrow();
  return Number(row.count);
};

export const commentEvent = (
  platform: Platform,
  account: AccountId,
  comment: Comment,
  author: Author,
): CommentEvent => ({
  kind: 'comment',
  platform,
  accountId: account,
  eventId: `evt_${comment.id}`,
  commentId: comment.id,
  postId: comment.post_id,
  ...(comment.parent_id === null ? {} : { parentCommentId: comment.parent_id }),
  authorId: author.id,
  authorHandle: author.handle,
  text: comment.text,
  createdAt: comment.created_at.toISOString(),
});

export const messageEvent = (
  platform: Platform,
  account: AccountId,
  message: Message,
  sender: Author,
): MessageEvent => ({
  kind: 'message',
  platform,
  accountId: account,
  eventId: `evt_${message.id}`,
  conversationId: message.conversation_id,
  messageId: message.id,
  senderId: sender.id,
  senderHandle: sender.handle,
  text: message.text,
  createdAt: message.created_at.toISOString(),
});
