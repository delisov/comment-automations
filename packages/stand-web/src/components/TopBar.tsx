import type { Platform } from '@comment-automations/gateway-contract';
import { PLATFORMS } from '../api.js';

type Props = {
  platform: Platform;
  onPlatform: (platform: Platform) => void;
  now: string;
  standNow: string;
  onClock: (now: string) => void;
  onShift: (ms: number) => void;
  onReset: () => void;
  onSeed: () => void;
};

const HOUR = 60 * 60 * 1000;

const toLocalInput = (iso: string): string => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const TopBar = ({
  platform,
  onPlatform,
  now,
  standNow,
  onClock,
  onShift,
  onReset,
  onSeed,
}: Props) => {
  const diverged =
    Boolean(now && standNow) && Math.abs(Date.parse(now) - Date.parse(standNow)) > 1000;
  return (
    <div className="topbar">
      <div className="tabs">
        {PLATFORMS.map((candidate) => (
          <button
            key={candidate}
            className={candidate === platform ? 'active' : ''}
            onClick={() => onPlatform(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      <div className="clock">
        <span className="now">{diverged ? `service clock ${now}` : now || '…'}</span>
        {diverged && <span className="notice">stand clock {standNow}</span>}
        <button onClick={() => onShift(HOUR)} disabled={!now}>
          +1 h
        </button>
        <button onClick={() => onShift(24 * HOUR)} disabled={!now}>
          +24 h
        </button>
        <button onClick={() => onShift(7 * 24 * HOUR)} disabled={!now}>
          +7 d
        </button>
        <input
          type="datetime-local"
          value={toLocalInput(now)}
          onChange={(event) => {
            const date = new Date(event.target.value);
            if (!Number.isNaN(date.getTime())) {
              onClock(date.toISOString());
            }
          }}
        />
        <button className="danger" onClick={onReset}>
          Reset
        </button>
        <button className="primary" onClick={onSeed}>
          Seed
        </button>
      </div>
    </div>
  );
};
