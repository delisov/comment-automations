const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const timeOnly = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));

export const formatDate = (iso: string): string => dateOnly.format(new Date(iso));

export const formatTime = (iso: string): string => timeOnly.format(new Date(iso));

export const formatRelative = (iso: string | null, now = Date.now()): string => {
  if (iso === null) {
    return '—';
  }
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

export const formatCount = (count: number): string => count.toLocaleString('en-US');

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) {
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

export const charCount = (text: string): number => [...text].length;

export const byteCount = (text: string): number => new TextEncoder().encode(text).length;

export const plural = (count: number, noun: string): string =>
  `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;

export const listWords = (words: string[]): string => {
  if (words.length <= 1) {
    return words.join('');
  }
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
};
