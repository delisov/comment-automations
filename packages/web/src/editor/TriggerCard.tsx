import type { CapabilitiesResponse, ValidationIssue } from '@comment-automations/api-schema';
import type { AccountId, PostId, Trigger } from '@comment-automations/shared';
import { useState } from 'react';
import type { Post } from '../api/client.js';
import { api } from '../api/client.js';
import { formatDate } from '../format.js';
import { useAsync } from '../useAsync.js';
import { ErrorText, issueAt } from './issues.js';

const Check = ({
  on,
  label,
  readOnly,
  onToggle,
}: {
  on: boolean;
  label: string;
  readOnly: boolean;
  onToggle: () => void;
}) => (
  <span
    className="chk"
    role="checkbox"
    aria-checked={on}
    aria-label={label}
    onClick={() => {
      if (!readOnly) {
        onToggle();
      }
    }}
  >
    <i className={on ? 'on' : ''}>{on ? '✓' : ''}</i>
    {label}
  </span>
);

const truncate = (text: string): string => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

const PostPicker = ({
  accountId,
  postId,
  readOnly,
  onPick,
}: {
  accountId: AccountId;
  postId: PostId | null;
  readOnly: boolean;
  onPick: (post: Post) => void;
}) => {
  const posts = useAsync(() => api.posts(accountId), [accountId]);
  const [open, setOpen] = useState(postId === null);
  const chosen = (posts.data ?? []).find((post) => post.postId === postId);
  return (
    <div style={{ marginTop: 10 }}>
      <div
        className={open ? 'select open' : 'select'}
        role="button"
        onClick={() => {
          if (!readOnly) {
            setOpen((value) => !value);
          }
        }}
      >
        <span>
          {chosen !== undefined
            ? `🖼 "${truncate(chosen.caption)}" · ${formatDate(chosen.publishedAt)}`
            : postId !== null
              ? `Post ${postId}`
              : 'Choose a post'}
        </span>
        <span>{chosen === undefined ? '▾' : 'Change'}</span>
      </div>
      {open ? (
        <div className="opts">
          {posts.status === 'loading' ? (
            <div className="dis">Loading posts…</div>
          ) : posts.status === 'error' ? (
            <div className="dis">Couldn’t load the posts: {posts.error.message}</div>
          ) : posts.data.length === 0 ? (
            <div className="dis">This account has no posts yet</div>
          ) : (
            posts.data.map((post) => (
              <div
                key={post.postId}
                onClick={() => {
                  onPick(post);
                  setOpen(false);
                }}
              >
                <span>🖼 {truncate(post.caption)}</span>
                <small>{formatDate(post.publishedAt)}</small>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

type TriggerControl = {
  kind: keyof CapabilitiesResponse['allowedTriggers'];
  label: string;
  toggled: Trigger;
};

const triggerControls = (trigger: Trigger, keywords: string[]): TriggerControl[] => [
  {
    kind: 'comments',
    label: 'comments',
    toggled: {
      ...trigger,
      comments: trigger.comments === undefined ? { posts: { kind: 'any' }, keywords } : undefined,
    },
  },
  {
    kind: 'messages',
    label: 'sends a message',
    toggled: {
      ...trigger,
      messages: trigger.messages === undefined ? { keywords } : undefined,
    },
  },
];

const keywordsLabel = (trigger: Trigger): string => {
  if (trigger.comments !== undefined && trigger.messages !== undefined) {
    return 'And the comment or message contains';
  }
  return trigger.messages !== undefined ? 'And the message contains' : 'And the comment contains';
};

export const TriggerCard = ({
  trigger,
  caps,
  accountId,
  issues,
  readOnly,
  onChange,
}: {
  trigger: Trigger;
  caps: CapabilitiesResponse;
  accountId: AccountId;
  issues: ValidationIssue[];
  readOnly: boolean;
  onChange: (trigger: Trigger) => void;
}) => {
  const [draft, setDraft] = useState('');
  const keywords = trigger.comments?.keywords ?? trigger.messages?.keywords ?? [];
  const keywordsError =
    issueAt(issues, 'trigger.comments.keywords') ??
    issueAt(issues, 'trigger') ??
    issueAt(issues, 'trigger.comments') ??
    issueAt(issues, 'trigger.messages');

  const setKeywords = (next: string[]) =>
    onChange({
      ...trigger,
      comments:
        trigger.comments === undefined ? undefined : { ...trigger.comments, keywords: next },
      messages: trigger.messages === undefined ? undefined : { keywords: next },
    });

  const addKeyword = () => {
    const word = draft.trim();
    if (word !== '' && !keywords.includes(word)) {
      setKeywords([...keywords, word]);
    }
    setDraft('');
  };

  const posts = trigger.comments?.posts;
  const [pickingPost, setPickingPost] = useState(false);
  const specific = posts?.kind === 'specific' || pickingPost;

  return (
    <div className="card">
      <h3>When someone…</h3>
      <div className="row" style={{ gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        {triggerControls(trigger, keywords)
          .filter((control) => caps.allowedTriggers[control.kind])
          .map((control) => (
            <Check
              key={control.kind}
              on={trigger[control.kind] !== undefined}
              label={control.label}
              readOnly={readOnly}
              onToggle={() => onChange(control.toggled)}
            />
          ))}
      </div>
      {posts !== undefined ? (
        <div className="field">
          <label>On</label>
          <span className="seg">
            <span
              className={!specific ? 'on' : readOnly ? 'dim' : ''}
              onClick={() => {
                if (!readOnly) {
                  setPickingPost(false);
                  onChange({ ...trigger, comments: { keywords, posts: { kind: 'any' } } });
                }
              }}
            >
              Any post
            </span>
            <span
              className={specific ? 'on' : readOnly ? 'dim' : ''}
              onClick={() => {
                if (!readOnly) {
                  setPickingPost(true);
                }
              }}
            >
              A specific post
            </span>
            <span className="dim" title="Not available yet">
              My next post
            </span>
          </span>
          {specific ? (
            <PostPicker
              accountId={accountId}
              postId={posts.kind === 'specific' ? posts.postId : null}
              readOnly={readOnly}
              onPick={(post) => {
                setPickingPost(false);
                onChange({
                  ...trigger,
                  comments: { keywords, posts: { kind: 'specific', postId: post.postId } },
                });
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="field">
        <label>{keywordsLabel(trigger)}</label>
        <div className="kw" style={keywordsError === null ? undefined : { borderColor: '#dc2626' }}>
          {keywords.map((word) => (
            <span key={word}>
              {word}
              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={`Remove ${word}`}
                  onClick={() => setKeywords(keywords.filter((item) => item !== word))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {readOnly ? (
            keywords.length === 0 ? (
              <span className="kwph">Any comment</span>
            ) : null
          ) : (
            <input
              aria-label="Keyword"
              placeholder={keywords.length === 0 ? 'Type a word and press Enter' : ''}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={addKeyword}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addKeyword();
                }
                if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
                  setKeywords(keywords.slice(0, -1));
                }
              }}
            />
          )}
        </div>
        <ErrorText text={keywordsError} />
        <div className="hint" style={{ marginTop: 6 }}>
          Matches whole words, any letter case. Leave empty to match everything.
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>If the same person writes again while a run is waiting</label>
        <span className="seg">
          {(
            [
              ['supersede', 'Start over with a new run'],
              ['ignore', 'Ignore it'],
            ] as const
          ).map(([value, label]) => (
            <span
              key={value}
              className={trigger.onRepeatWhileWaiting === value ? 'on' : readOnly ? 'dim' : ''}
              onClick={() => {
                if (!readOnly) {
                  onChange({ ...trigger, onRepeatWhileWaiting: value });
                }
              }}
            >
              {label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
};
