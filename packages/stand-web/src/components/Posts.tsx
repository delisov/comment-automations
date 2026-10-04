import { useState } from 'react';
import type { Account, Comment, Delivery, LogEntry, Rules, State, User } from '../api.js';
import { annotate } from './annotate.js';

type Props = {
  state: State;
  account: Account | null;
  user: User | null;
  rules: Rules | null;
  log: LogEntry[];
  deliveries: Delivery[];
  onComment: (body: { postId: string; userId: string; text: string; parentId?: string }) => void;
};

export const Posts = ({ state, account, user, rules, log, deliveries, onComment }: Props) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, Comment | null>>({});

  if (!account) {
    return (
      <div className="panel">
        <h2>Posts</h2>
        <span className="muted">Select an account.</span>
      </div>
    );
  }
  if (rules && !rules.comments) {
    return (
      <div className="panel">
        <h2>Posts</h2>
        <span className="muted">This platform has no posts or comments.</span>
      </div>
    );
  }

  const posts = state.posts.filter((post) => post.account_id === account.id);
  const authorOf = (comment: Comment): string =>
    comment.author_account_id !== null
      ? (state.accounts.find((a) => a.id === comment.author_account_id)?.handle ??
        comment.author_account_id)
      : (state.users.find((u) => u.id === comment.author_user_id)?.handle ??
        comment.author_user_id ??
        '?');

  const renderComment = (comment: Comment, all: Comment[], postId: string) => (
    <div
      key={comment.id}
      className={`comment ${comment.author_account_id !== null ? 'by-account' : ''}`}
    >
      <div className="row">
        <span className="author">{authorOf(comment)}</span>
        <span className="muted mono">{comment.created_at}</span>
        <button onClick={() => setReplyTo({ ...replyTo, [postId]: comment })}>reply</button>
      </div>
      <div>{comment.text}</div>
      <div className="tags">
        {annotate(comment, log, deliveries).map((tag, index) => (
          <span key={index} className={`tag ${tag.tone}`}>
            {tag.text}
          </span>
        ))}
      </div>
      <div className="replies">
        {all
          .filter((child) => child.parent_id === comment.id)
          .map((child) => renderComment(child, all, postId))}
      </div>
    </div>
  );

  return (
    <div className="panel">
      <h2>Posts of {account.handle}</h2>
      {posts.length === 0 && <span className="muted">No posts.</span>}
      {posts.map((post) => {
        const parent = replyTo[post.id] ?? null;
        const draft = drafts[post.id] ?? '';
        return (
          <div key={post.id} className="post">
            <div className="caption">{post.caption}</div>
            <div className="mono muted">
              {post.id} · {post.published_at}
            </div>
            <div className="thread">
              {post.comments
                .filter((comment) => comment.parent_id === null)
                .map((comment) => renderComment(comment, post.comments, post.id))}
            </div>
            <div className="compose">
              <textarea
                placeholder={
                  parent
                    ? `Reply to ${authorOf(parent)} as ${user?.handle ?? '…'}`
                    : `Comment as ${user?.handle ?? '…'}`
                }
                value={draft}
                onChange={(event) => setDrafts({ ...drafts, [post.id]: event.target.value })}
              />
              <div className="row">
                <button
                  className="primary"
                  disabled={!user || draft.trim() === ''}
                  onClick={() => {
                    if (!user) {
                      return;
                    }
                    onComment({
                      postId: post.id,
                      userId: user.id,
                      text: draft,
                      ...(parent ? { parentId: parent.id } : {}),
                    });
                    setDrafts({ ...drafts, [post.id]: '' });
                    setReplyTo({ ...replyTo, [post.id]: null });
                  }}
                >
                  {parent ? 'Reply' : 'Comment'} as {user?.handle ?? '…'}
                </button>
                {parent && (
                  <button onClick={() => setReplyTo({ ...replyTo, [post.id]: null })}>
                    cancel reply
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
