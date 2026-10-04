import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { Callout } from '../ui.js';
import { useAsync } from '../useAsync.js';

const NAV = [
  'Overview',
  'Calendar',
  'Analytics',
  'Posts',
  'Logs',
  'Videos',
  'Inbox',
  'DM automations',
  'Accounts',
  'Tools',
  'Settings',
] as const;

const ICONS: Record<(typeof NAV)[number], ReactNode> = {
  Overview: (
    <>
      <path d="M3 12a9 9 0 0 1 18 0" />
      <path d="M12 12l4-4" />
    </>
  ),
  Calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  Analytics: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  Posts: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </>
  ),
  Logs: <path d="M4 6c4 0 4 12 8 12s4-12 8-12" />,
  Videos: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 11l5-3v8l-5-3z" />
    </>
  ),
  Inbox: (
    <>
      <path d="M3 13l2-8h14l2 8v6H3z" />
      <path d="M3 13h5l2 3h4l2-3h5" />
    </>
  ),
  'DM automations': (
    <>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  Accounts: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5M15 20c0-2 2-4 4-4" />
    </>
  ),
  Tools: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />,
  Settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </>
  ),
};

const Icon = ({ name }: { name: (typeof NAV)[number] }) => (
  <svg
    viewBox="0 0 24 24"
    width="17"
    height="17"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {ICONS[name]}
  </svg>
);

const Logo = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" aria-label="Boltato">
    <defs>
      <linearGradient id="zn" x1="0" x2="1">
        <stop offset="0" stopColor="#d9dde3" />
        <stop offset=".5" stopColor="#f3f5f7" />
        <stop offset="1" stopColor="#9aa3ad" />
      </linearGradient>
    </defs>
    <rect
      x="4"
      y="3"
      width="20"
      height="8"
      rx="1.5"
      fill="url(#zn)"
      stroke="#6b7280"
      strokeWidth="1"
    />
    <path d="M8 3v8M14 3v8M20 3v8" stroke="#8b949e" strokeWidth=".8" />
    <rect x="10" y="11" width="8" height="14" fill="url(#zn)" stroke="#6b7280" strokeWidth="1" />
    <path d="M10 14h8M10 17h8M10 20h8M10 23h8" stroke="#6b7280" strokeWidth="1" />
  </svg>
);

const Sidebar = () => (
  <aside className="side">
    <div className="brand">
      <div className="logo">
        <Logo />
      </div>
      <div>
        <b>Boltato</b>
        <small>Developer Platform</small>
      </div>
    </div>
    <div className="switch">
      <span>✦ Switch to Content Studio</span>
      <span>↗</span>
    </div>
    <div className="navsec">Platform</div>
    <div className="nav">
      {NAV.map((name) =>
        name === 'DM automations' ? (
          <Link key={name} to="/" className="on">
            <Icon name={name} />
            {name}
          </Link>
        ) : (
          <a key={name}>
            <Icon name={name} />
            {name}
            {name === 'Tools' ? <span className="chev">›</span> : null}
          </a>
        ),
      )}
    </div>
  </aside>
);

const Diagnostics = ({ sha }: { sha: string | null }) => {
  const clock = useAsync(() => api.clock(), []);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || clock.status !== 'ready') {
    return null;
  }
  return (
    <div className="diag">
      <em>diag</em> gateway: <b>test stand</b> <em>·</em> clock: {clock.data.now}
      {sha === null ? null : (
        <>
          {' '}
          <em>·</em> sha {sha.slice(0, 7)}
        </>
      )}
      <span className="x" onClick={() => setDismissed(true)} role="button" aria-label="Dismiss">
        ✕
      </span>
    </div>
  );
};

export const Shell = ({ children }: { children: ReactNode }) => {
  const health = useAsync(() => api.health(), []);
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {health.status === 'error' ? (
          <Callout
            tone="bad"
            title="We can’t reach the social networks right now"
            className="outage"
          >
            New comments and messages are queued and will be processed when the connection is back.
            Nothing is lost. We’re on it.
          </Callout>
        ) : null}
        {children}
      </div>
      <Diagnostics sha={health.status === 'ready' ? health.data.sha : null} />
    </div>
  );
};
