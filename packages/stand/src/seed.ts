import { accountId, postId, userId } from '@comment-automations/shared';
import type { Db, DmSetting } from './db/database.js';
import { platforms, worlds } from './worlds/index.js';

const WORLD_TABLES = [
  'messages',
  'conversations',
  'comments',
  'posts',
  'users',
  'accounts',
  'event_log',
  'deliveries',
  'idempotency',
] as const;

export const resetWorlds = async (db: Db): Promise<void> => {
  for (const table of WORLD_TABLES) {
    await db.deleteFrom(table).execute();
  }
};

const SEED_USERS: [
  handle: string,
  displayName: string,
  dmSetting: DmSetting,
  followsAccount: boolean,
][] = [
  ['jane.doe', 'Jane Doe', 'all', true],
  ['bob', 'Bob', 'following', false],
  ['spammy_sam', 'Spammy Sam', 'none', false],
  ['desktop_dan', 'Desktop Dan', 'all', false],
];

const SEED_POSTS: [suffix: string, caption: string, daysAgo: number][] = [
  ['post_1', 'New guide out now', 1],
  ['post_2', 'Autumn pricing is live', 2],
];

export const seedWorlds = async (db: Db, now: Date): Promise<void> => {
  for (const platform of platforms) {
    const account = accountId(`${platform}_oqtastore`);
    await db
      .insertInto('accounts')
      .values({
        id: account,
        platform,
        handle: '@oqtastore',
        display_name: 'Oqtastore',
        status: 'connected',
      })
      .execute();
    if (worlds[platform].comments) {
      await db
        .insertInto('posts')
        .values(
          SEED_POSTS.map(([suffix, caption, daysAgo]) => ({
            id: postId(`${platform}_${suffix}`),
            account_id: account,
            caption,
            published_at: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
          })),
        )
        .execute();
    }
    await db
      .insertInto('users')
      .values(
        SEED_USERS.map(([handle, displayName, dmSetting, followsAccount]) => ({
          id: userId(`${platform}_${handle}`),
          platform,
          handle: `@${handle}`,
          display_name: displayName,
          dm_setting: dmSetting,
          follows_account_ids: followsAccount ? [account] : [],
        })),
      )
      .execute();
  }
};
