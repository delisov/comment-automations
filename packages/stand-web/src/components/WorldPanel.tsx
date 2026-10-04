import type { DmSetting, Rules, Settings, State } from '../api.js';

type Props = {
  state: State;
  rules: Rules | null;
  settings: Settings | null;
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  onPatchUser: (id: string, patch: { dmSetting?: DmSetting; follows?: string[] }) => void;
  onSettings: (patch: Partial<Settings>) => void;
};

const duration = (ms: number): string => {
  const hours = ms / (60 * 60 * 1000);
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} h`;
};

const describeRules = (rules: Rules): [string, string][] => {
  const messaging =
    rules.messaging.kind === 'none'
      ? 'no conversations'
      : rules.messaging.kind === 'dmSetting'
        ? 'by the user dm setting, no window'
        : `${duration(rules.messaging.durationMs)} window opened by the user${
            rules.messaging.maxConsecutiveAccountMessages === null
              ? ''
              : `, max ${rules.messaging.maxConsecutiveAccountMessages} account messages in a row`
          }`;
  return [
    ['Posts and comments', rules.comments ? 'yes' : 'no'],
    ['Public reply', rules.publicReply ? `yes, up to ${rules.limits.replyMaxChars} chars` : 'no'],
    [
      'Private reply',
      rules.privateReply
        ? `once per comment, within ${duration(rules.privateReply.windowMs)}`
        : 'no',
    ],
    ['Messaging', messaging],
    [
      'Message limits',
      rules.messaging.kind === 'none'
        ? 'n/a'
        : `${rules.limits.messageMaxChars} chars, ${rules.limits.maxButtons} buttons`,
    ],
    ['Own activity echoed', rules.ownActivityEcho ? 'yes' : 'no'],
  ];
};

export const WorldPanel = ({
  state,
  rules,
  settings,
  selectedAccountId,
  onSelectAccount,
  onPatchUser,
  onSettings,
}: Props) => {
  const knob = (key: keyof Settings, label: string) => (
    <label key={key}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={settings ? settings[key] : 0}
        disabled={!settings}
        onChange={(event) => onSettings({ [key]: Number(event.target.value) })}
      />
    </label>
  );

  return (
    <>
      <div className="panel">
        <h2>Accounts</h2>
        <div className="list">
          {state.accounts.length === 0 && (
            <span className="muted">No accounts. Seed the world.</span>
          )}
          {state.accounts.map((account) => (
            <div
              key={account.id}
              className={`item selectable ${account.id === selectedAccountId ? 'selected' : ''}`}
              onClick={() => onSelectAccount(account.id)}
            >
              <div>
                {account.handle} <span className="muted">{account.display_name}</span>
              </div>
              <div className="mono muted">
                {account.id} · {account.status}
              </div>
            </div>
          ))}
        </div>
        <h2 style={{ marginTop: 12 }}>Users</h2>
        <div className="list">
          {state.users.map((user) => (
            <div key={user.id} className="item">
              <div>
                {user.handle} <span className="muted">{user.display_name}</span>
              </div>
              <div className="mono muted">{user.id}</div>
              <div className="row">
                <label>
                  dm{' '}
                  <select
                    value={user.dm_setting}
                    onChange={(event) =>
                      onPatchUser(user.id, { dmSetting: event.target.value as DmSetting })
                    }
                  >
                    <option value="all">all</option>
                    <option value="following">following</option>
                    <option value="none">none</option>
                  </select>
                </label>
                {state.accounts.map((account) => (
                  <label key={account.id}>
                    <input
                      type="checkbox"
                      checked={user.follows_account_ids.includes(account.id)}
                      onChange={(event) =>
                        onPatchUser(user.id, {
                          follows: event.target.checked
                            ? [...user.follows_account_ids, account.id]
                            : user.follows_account_ids.filter((id) => id !== account.id),
                        })
                      }
                    />{' '}
                    follows {account.handle}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel rules">
        <h2>Rules this world enforces</h2>
        {rules ? (
          <dl>
            {describeRules(rules).map(([term, value]) => (
              <div key={term} style={{ display: 'contents' }}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="muted">Loading…</span>
        )}
      </div>
      <div className="panel knobs">
        <h2>Delivery knobs</h2>
        {knob('duplicatePercent', 'Duplicate %')}
        {knob('reorderWindowMs', 'Reorder window ms')}
        {knob('delayMs', 'Delay ms')}
        {knob('dropPercent', 'Network failures per attempt (%)')}
        <div className="muted hint">The network retries, as Instagram does.</div>
        {knob('burst429', 'Next N gateway calls 429')}
      </div>
    </>
  );
};
