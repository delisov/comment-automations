import type { AccountSummary, CapabilitiesResponse } from '@comment-automations/api-schema';
import { AccountsResponse } from '@comment-automations/api-schema';
import { PostsResponse } from '@comment-automations/gateway-contract';
import type { AccountId, Platform } from '@comment-automations/shared';
import {
  allowedStepKinds,
  allowedTriggers,
  canRemindBeforeReply,
  capabilities,
  requiresUnreachableChoice,
} from '@comment-automations/shared';
import type { App, AppDeps } from './types.js';
import { ErrorResponse, IdParams } from './types.js';

export const capabilitiesOf = (platform: Platform): CapabilitiesResponse => {
  const record = capabilities[platform];
  return {
    record,
    allowedTriggers: allowedTriggers(record),
    allowedStepKinds: allowedStepKinds(record),
    requiresUnreachableChoice: requiresUnreachableChoice(record),
    canRemindBeforeReply: canRemindBeforeReply(record),
  };
};

export const registerAccountRoutes = (app: App, deps: AppDeps): void => {
  app.get(
    '/accounts',
    { schema: { response: { 200: AccountsResponse, 502: ErrorResponse } } },
    async (_request, reply) => {
      const listed = await deps.gateway.listAccounts();
      if (!listed.ok) {
        return reply.status(502).send({ error: 'The gateway could not list the accounts' });
      }
      const now = deps.clock.now();
      for (const account of listed.value) {
        await deps.db
          .insertInto('accounts')
          .values({
            platform: account.platform,
            external_id: account.accountId,
            handle: account.handle,
            display_name: account.displayName,
            status: account.status,
            synced_at: now,
          })
          .onConflict((conflict) =>
            conflict.columns(['platform', 'external_id']).doUpdateSet({
              handle: account.handle,
              display_name: account.displayName,
              status: account.status,
              synced_at: now,
            }),
          )
          .execute();
      }
      const rows = await deps.db
        .selectFrom('accounts')
        .selectAll()
        .orderBy('platform')
        .orderBy('handle')
        .execute();
      const accounts: AccountSummary[] = rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        handle: row.handle,
        displayName: row.display_name,
        status: row.status,
        capabilities: capabilitiesOf(row.platform),
      }));
      return { accounts };
    },
  );

  app.get(
    '/accounts/:id/posts',
    {
      schema: {
        params: IdParams,
        response: { 200: PostsResponse, 404: ErrorResponse, 502: ErrorResponse },
      },
    },
    async (request, reply) => {
      const account = await deps.db
        .selectFrom('accounts')
        .select('external_id')
        .where('id', '=', request.params.id as AccountId)
        .executeTakeFirst();
      if (account === undefined) {
        return reply.status(404).send({ error: 'Account not found' });
      }
      const listed = await deps.gateway.listPosts(account.external_id);
      if (!listed.ok) {
        return reply.status(502).send({ error: 'The gateway could not list the posts' });
      }
      return { posts: listed.value };
    },
  );
};
