import type { Delivery, LogEntry } from '../api.js';
import { deliveryLogLine } from './annotate.js';

type Props = { log: LogEntry[]; deliveries: Delivery[] };

const summarize = (entry: LogEntry): string => {
  const payload = entry.payload;
  const deliveryLine = deliveryLogLine(entry);
  if (deliveryLine !== null) {
    return `${entry.kind} ${String(payload.eventId)}: ${deliveryLine}`;
  }
  if (entry.direction === 'to_service') {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const author =
      typeof payload.authorHandle === 'string'
        ? payload.authorHandle
        : typeof payload.senderHandle === 'string'
          ? payload.senderHandle
          : '';
    return `${entry.kind} by ${author}: ${text}`;
  }
  const request =
    typeof payload.request === 'object' && payload.request !== null
      ? (payload.request as Record<string, unknown>)
      : {};
  const text = typeof request.text === 'string' ? `: ${request.text}` : '';
  const visibility = typeof request.visibility === 'string' ? ` ${request.visibility}` : '';
  return `${entry.kind}${visibility}${text}`;
};

const tone = (entry: LogEntry): string => {
  if (entry.result_code === null || entry.result_code === 'OK') {
    return 'ok';
  }
  if (entry.result_code === 'DUPLICATED' || entry.result_code === 'NETWORK_DROP') {
    return '';
  }
  return 'refused';
};

export const LogPanel = ({ log, deliveries }: Props) => (
  <>
    <div className="panel">
      <h2>Event log</h2>
      <div className="log">
        {log.length === 0 && <span className="muted">Nothing crossed the contract yet.</span>}
        {log.map((entry) => (
          <div key={entry.id} className={`entry ${tone(entry)}`}>
            <div className="head">
              <span className="mono muted">{entry.at}</span>
              <span className="mono">
                {entry.direction === 'to_service' ? '→ service' : '← service'}
              </span>
              {entry.result_code && <span className="mono">{entry.result_code}</span>}
            </div>
            <div>{summarize(entry)}</div>
            <details>
              <summary className="muted">payload</summary>
              <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
            </details>
          </div>
        ))}
      </div>
    </div>
    <div className="panel">
      <h2>Deliveries</h2>
      {deliveries.length === 0 ? (
        <span className="muted">No deliveries yet.</span>
      ) : (
        <table className="deliveries">
          <thead>
            <tr>
              <th>at</th>
              <th>event</th>
              <th>attempt</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td className="mono">{delivery.at}</td>
                <td className="mono">{delivery.event_id}</td>
                <td>{delivery.attempt}</td>
                <td className={`status-${delivery.status}`}>{delivery.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </>
);
