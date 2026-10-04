import type { Platform } from '@comment-automations/gateway-contract';
import { useCallback, useEffect, useState } from 'react';
import type { Delivery, LogEntry, Rules, Settings, State } from './api.js';
import { PLATFORMS, api } from './api.js';
import { shiftClock } from './clockControl.js';
import { Conversation } from './components/Conversation.js';
import { LogPanel } from './components/LogPanel.js';
import { Posts } from './components/Posts.js';
import { TopBar } from './components/TopBar.js';
import { WorldPanel } from './components/WorldPanel.js';

const EMPTY: State = { accounts: [], users: [], posts: [], conversations: [] };

export const App = () => {
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0]!);
  const [now, setNow] = useState<string>('');
  const [standNow, setStandNow] = useState<string>('');
  const [state, setState] = useState<State>(EMPTY);
  const [rules, setRules] = useState<Rules | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const refresh = useCallback(async () => {
    const [nextState, nextLog, nextDeliveries, clock] = await Promise.all([
      api.state(platform),
      api.eventLog(),
      api.deliveries(),
      api.clock(),
    ]);
    setState(nextState);
    setLog(nextLog);
    setDeliveries(nextDeliveries);
    setNow(clock.now);
    setStandNow(clock.standNow);
  }, [platform]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        setNotice('');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
      await refresh().catch(() => undefined);
    },
    [refresh],
  );

  useEffect(() => {
    void api.rules(platform).then(setRules);
    void api.settings().then(setSettings);
  }, [platform]);

  useEffect(() => {
    void refresh().catch((error: unknown) => setNotice(String(error)));
    const timer = setInterval(() => void refresh().catch(() => undefined), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!state.users.some((user) => user.id === userId)) {
      setUserId(state.users[0]?.id ?? '');
    }
    if (!state.accounts.some((account) => account.id === accountId)) {
      setAccountId(state.accounts[0]?.id ?? '');
    }
  }, [state, userId, accountId]);

  const user = state.users.find((candidate) => candidate.id === userId) ?? null;
  const account = state.accounts.find((candidate) => candidate.id === accountId) ?? null;

  return (
    <>
      <TopBar
        platform={platform}
        onPlatform={setPlatform}
        now={now}
        standNow={standNow}
        onClock={(next) => act(() => api.setClock(next))}
        onShift={(ms) => act(() => shiftClock(api, ms))}
        onReset={() => act(api.reset)}
        onSeed={() => act(api.seed)}
      />
      <div className="banner">
        <span>Emulating {user ? `${user.handle} (${user.display_name})` : 'nobody'}</span>
        <label>
          Switch user{' '}
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            {state.users.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.handle}
              </option>
            ))}
          </select>
        </label>
        {notice && <span className="notice">{notice}</span>}
      </div>
      <div className="layout">
        <div className="column">
          <WorldPanel
            state={state}
            rules={rules}
            settings={settings}
            selectedAccountId={accountId}
            onSelectAccount={setAccountId}
            onPatchUser={(id, patch) => act(() => api.patchUser(id, patch))}
            onSettings={(patch) => act(async () => setSettings(await api.putSettings(patch)))}
          />
        </div>
        <div className="column">
          <Posts
            state={state}
            account={account}
            user={user}
            rules={rules}
            log={log}
            deliveries={deliveries}
            onComment={(body) => act(() => api.comment(body))}
          />
          <Conversation
            state={state}
            account={account}
            user={user}
            rules={rules}
            onMessage={(body) => act(() => api.message(body))}
          />
        </div>
        <div className="column">
          <LogPanel log={log} deliveries={deliveries} />
        </div>
      </div>
    </>
  );
};
