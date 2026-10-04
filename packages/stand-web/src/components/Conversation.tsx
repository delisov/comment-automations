import { useState } from 'react';
import type { Account, Rules, State, User } from '../api.js';

type Props = {
  state: State;
  account: Account | null;
  user: User | null;
  rules: Rules | null;
  onMessage: (body: { accountId: string; userId: string; text: string }) => void;
};

export const Conversation = ({ state, account, user, rules, onMessage }: Props) => {
  const [draft, setDraft] = useState('');

  if (rules && rules.messaging.kind === 'none') {
    return (
      <div className="panel">
        <h2>Conversation</h2>
        <span className="muted">This platform has no conversations.</span>
      </div>
    );
  }
  if (!account || !user) {
    return (
      <div className="panel">
        <h2>Conversation</h2>
        <span className="muted">Select an account and a user.</span>
      </div>
    );
  }

  const conversation =
    state.conversations.find(
      (candidate) => candidate.account_id === account.id && candidate.user_id === user.id,
    ) ?? null;

  return (
    <div className="panel">
      <h2>
        Conversation {user.handle} ↔ {account.handle}
      </h2>
      {conversation ? (
        <div className="mono muted">
          {conversation.id} · opened by {conversation.opened_by} · last user message{' '}
          {conversation.last_user_message_at ?? 'never'}
        </div>
      ) : (
        <span className="muted">No conversation yet.</span>
      )}
      <div className="messages">
        {conversation?.messages.map((message) => (
          <div key={message.id} className={`message from-${message.from}`}>
            <div>{message.text}</div>
            {message.buttons.length > 0 && (
              <div className="row">
                {message.buttons.map((button) => (
                  <span key={button.url} className="tag">
                    {button.title} → {button.url}
                  </span>
                ))}
              </div>
            )}
            <span className="meta">
              {message.from === 'account' ? account.handle : user.handle} · {message.created_at}
            </span>
          </div>
        ))}
      </div>
      <textarea
        placeholder={`Message ${account.handle} as ${user.handle}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="row">
        <button
          className="primary"
          disabled={draft.trim() === ''}
          onClick={() => {
            onMessage({ accountId: account.id, userId: user.id, text: draft });
            setDraft('');
          }}
        >
          Send as {user.handle}
        </button>
      </div>
    </div>
  );
};
