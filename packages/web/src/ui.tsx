import type { Platform } from '@comment-automations/shared';
import { PLATFORM_LABELS } from '@comment-automations/shared';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export type PillTone = 'ok' | 'bad' | 'warn' | 'wait' | 'info' | 'plain';

export const Pill = ({ tone = 'plain', children }: { tone?: PillTone; children: ReactNode }) => (
  <span className={tone === 'plain' ? 'pill' : `pill ${tone}`}>{children}</span>
);

const platformClass: Record<Platform, string> = {
  instagram: 'ig',
  facebook: 'fb',
  threads: 'th',
  x: 'x',
  bluesky: 'bs',
  youtube: 'yt',
  linkedin: 'li',
  whatsapp: 'wa',
  tiktok: 'tt',
  pinterest: 'pi',
};

const platformMark: Record<Platform, string> = {
  instagram: 'IG',
  facebook: 'f',
  threads: '@',
  x: 'X',
  bluesky: 'bs',
  youtube: '▶',
  linkedin: 'in',
  whatsapp: 'W',
  tiktok: 'TT',
  pinterest: 'P',
};

export const PlatformBadge = ({ platform, text }: { platform: Platform; text: string }) => (
  <span className={`plat ${platformClass[platform]}`}>
    <i>{platformMark[platform]}</i>
    {text}
  </span>
);

export const platformLabel = (platform: Platform): string => PLATFORM_LABELS[platform];

export const Modal = ({
  title,
  text,
  children,
  footer,
  onClose,
}: {
  title: string;
  text?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) => (
  <div
    className="modal-bg"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}
  >
    <div className="modal" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      {text === undefined ? null : <p>{text}</p>}
      {children}
      <div className="foot">{footer}</div>
    </div>
  </div>
);

export type ToastMessage = { text: string; tone: 'ok' | 'bad' };

export const Toast = ({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) => {
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  if (toast === null) {
    return null;
  }
  return <div className={`toast ${toast.tone}`}>{toast.text}</div>;
};

export const Callout = ({
  tone,
  title,
  children,
  className = '',
}: {
  tone: 'warn' | 'bad' | 'info' | 'ok';
  title?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`callout ${tone} ${className}`.trim()}>
    {title === undefined ? null : <b>{title}</b>}
    {children}
  </div>
);

export const Skeleton = ({ rows }: { rows: number }) => (
  <div className="tbl" style={{ padding: 16 }}>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="skel" style={{ width: `${60 + ((index * 17) % 30)}%` }} />
    ))}
  </div>
);

export const Empty = ({
  title,
  text,
  action,
}: {
  title: string;
  text: ReactNode;
  action?: ReactNode;
}) => (
  <div className="empty">
    <h3>{title}</h3>
    <p>{text}</p>
    {action}
  </div>
);

export const Button = ({
  kind = 'primary',
  small = false,
  disabled = false,
  onClick,
  children,
}: {
  kind?: 'primary' | 'sec' | 'ghost' | 'danger';
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) => {
  const classes = ['btn'];
  if (kind !== 'primary') {
    classes.push(kind);
  }
  if (small) {
    classes.push('sm');
  }
  if (disabled) {
    classes.push('dis');
  }
  return (
    <button type="button" className={classes.join(' ')} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
};
