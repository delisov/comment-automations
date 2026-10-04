import type { AutomationSummary } from '@comment-automations/api-schema';
import type { AccountId } from '@comment-automations/shared';
import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Account } from '../api/client.js';
import { api } from '../api/client.js';
import { formatRelative, plural } from '../format.js';
import type { ToastMessage } from '../ui.js';
import {
  Button,
  Callout,
  Empty,
  Pill,
  PlatformBadge,
  platformLabel,
  Skeleton,
  Toast,
} from '../ui.js';
import { useAsync } from '../useAsync.js';
import { NewAutomationModal } from './NewAutomationModal.js';

const StatePill = ({
  automation,
  account,
}: {
  automation: AutomationSummary;
  account: Account | undefined;
}) => {
  if (account?.status === 'disconnected') {
    return <Pill tone="bad">Account disconnected</Pill>;
  }
  switch (automation.state) {
    case 'live':
      return <Pill tone="ok">Live</Pill>;
    case 'draft':
      return <Pill>Draft</Pill>;
    case 'archived':
      return <Pill tone="warn">Archived</Pill>;
  }
};

const Table = ({
  automations,
  accounts,
  now,
  onOpen,
}: {
  automations: AutomationSummary[];
  accounts: Account[];
  now: number;
  onOpen: (automation: AutomationSummary) => void;
}) => (
  <div className="tbl">
    <table>
      <thead>
        <tr>
          <th>Automation</th>
          <th>Account</th>
          <th>Version</th>
          <th>State</th>
          <th>Runs 24h</th>
          <th>Success</th>
          <th>Failed</th>
          <th>Last run</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {automations.map((automation) => {
          const account = accounts.find((item) => item.id === automation.accountId);
          const live = automation.state === 'live';
          return (
            <tr key={automation.id} className="link" onClick={() => onOpen(automation)}>
              <td>
                <b>{automation.name}</b>
              </td>
              <td>
                <PlatformBadge
                  platform={automation.platform}
                  text={account?.handle ?? platformLabel(automation.platform)}
                />
              </td>
              <td className="mono">
                {automation.activeVersionNumber === null
                  ? '—'
                  : `v${automation.activeVersionNumber}`}
              </td>
              <td>
                <StatePill automation={automation} account={account} />
              </td>
              <td>{live || automation.stats.runs24h > 0 ? automation.stats.runs24h : '—'}</td>
              <td>{live || automation.stats.runs24h > 0 ? automation.stats.succeeded24h : '—'}</td>
              <td>
                {automation.stats.failed24h > 0 ? (
                  <span style={{ color: '#b91c1c' }}>{automation.stats.failed24h}</span>
                ) : live ? (
                  0
                ) : (
                  '—'
                )}
              </td>
              <td className="mono">{formatRelative(automation.stats.lastRunAt, now)}</td>
              <td style={{ color: '#9ca3af' }}>›</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const OverviewPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<ToastMessage | null>(
    (location.state as { toast?: ToastMessage } | null)?.toast ?? null,
  );
  const clearToast = useCallback(() => setToast(null), []);
  const automations = useAsync(() => api.automations(), []);
  const accounts = useAsync(() => api.accounts(), []);
  const clock = useAsync(() => api.clock(), []);
  const now = clock.status === 'ready' ? new Date(clock.data.now).getTime() : Date.now();
  const [accountFilter, setAccountFilter] = useState<AccountId | ''>('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const accountList = accounts.data ?? [];
  const all = (automations.data ?? []).filter((automation) => automation.state !== 'archived');
  const byAccount =
    accountFilter === '' ? all : all.filter((item) => item.accountId === accountFilter);
  const matching = byAccount.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const runs = byAccount.reduce((sum, item) => sum + item.stats.runs24h, 0);
  const failed = byAccount.reduce((sum, item) => sum + item.stats.failed24h, 0);
  const filteredAccount = accountList.find((account) => account.id === accountFilter);
  const disconnected = accountList.filter(
    (account) =>
      account.status === 'disconnected' && all.some((item) => item.accountId === account.id),
  );

  const subtitle =
    automations.status === 'loading' && automations.data === undefined
      ? ' '
      : `${plural(byAccount.length, 'automation')}${
          filteredAccount === undefined ? '' : ` on ${filteredAccount.handle}`
        } · ${plural(runs, 'run')} in the last 24 hours · ${failed} failed`;

  const newButton = <Button onClick={() => setCreating(true)}>+ New automation</Button>;

  return (
    <>
      <div className="ph">
        <div>
          <h1>DM automations</h1>
          <div className="sub">{subtitle}</div>
        </div>
        <div className="row">
          {accountList.length > 0 ? (
            <select
              className="btn sec"
              aria-label="Filter by account"
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value as AccountId | '')}
            >
              <option value="">All accounts ▾</option>
              {accountList.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.handle} · {platformLabel(account.platform)} ▾
                </option>
              ))}
            </select>
          ) : null}
          {newButton}
        </div>
      </div>
      {automations.status === 'error' ? (
        <Callout tone="bad" title="Couldn’t load the automations" className="outage">
          {automations.error.message}{' '}
          <a style={{ textDecoration: 'underline' }} onClick={automations.reload}>
            Try again
          </a>
        </Callout>
      ) : null}
      {disconnected.map((account) => (
        <Callout
          key={account.id}
          tone="warn"
          title={`${account.displayName} (${platformLabel(account.platform)}) is disconnected`}
          className="outage"
        >
          Runs for{' '}
          {all
            .filter((item) => item.accountId === account.id)
            .map((item) => `"${item.name}"`)
            .join(', ')}{' '}
          fail while it stays disconnected. Reconnect the account on the Accounts page to resume.
        </Callout>
      ))}
      {all.length > 0 ? (
        <div className="field">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Search automations"
            aria-label="Search automations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      ) : null}
      {automations.status === 'loading' && automations.data === undefined ? (
        <Skeleton rows={4} />
      ) : all.length === 0 ? (
        <Empty
          title="No automations yet"
          text="Create your first automation to start responding automatically."
          action={newButton}
        />
      ) : matching.length === 0 ? (
        <Empty
          title={`Nothing matches "${search}"`}
          text="Check the spelling or clear the search."
          action={
            <Button kind="sec" onClick={() => setSearch('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <Table
          automations={matching}
          accounts={accountList}
          now={now}
          onOpen={(automation) => navigate(`/automations/${automation.id}`)}
        />
      )}
      {creating ? (
        <NewAutomationModal
          accounts={accountList}
          onClose={() => setCreating(false)}
          onCreated={(automation) => navigate(`/automations/${automation.id}`)}
        />
      ) : null}
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
};
