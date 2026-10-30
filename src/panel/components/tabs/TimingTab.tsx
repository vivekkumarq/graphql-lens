import type { GraphQLRequest, HarTimings } from '../../../types/graphql';
import { formatDuration, formatTime } from '../../utils/format';

const PHASES: { key: keyof HarTimings; label: string; hint: string }[] = [
  {
    key: 'blocked',
    label: 'Queueing / stalled',
    hint: 'Waiting for a connection or a higher-priority request',
  },
  { key: 'dns', label: 'DNS lookup', hint: 'Resolving the host name' },
  { key: 'connect', label: 'Initial connection', hint: 'TCP handshake (includes TLS)' },
  { key: 'ssl', label: 'TLS', hint: 'TLS negotiation' },
  { key: 'send', label: 'Request sent', hint: 'Uploading the request body' },
  { key: 'wait', label: 'Waiting for server', hint: 'Time to first byte: mostly your resolvers' },
  { key: 'receive', label: 'Content download', hint: 'Downloading the response' },
];

export function TimingTab({ req }: { req: GraphQLRequest }) {
  if (req.transport === 'websocket') {
    const events = req.events ?? [];
    return (
      <div className="timing pad">
        <p>
          Subscription started at <b>{formatTime(req.timestamp)}</b>, {events.length} message(s) over{' '}
          <b>{formatDuration(req.duration)}</b>.
        </p>
        <table className="kv-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>+ since start</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="mono">{formatTime(e.time)}</td>
                <td className="mono">{formatDuration(e.time - req.timestamp)}</td>
                <td className="mono">{e.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const t = req.timings ?? {};
  const total = Math.max(req.duration, 0.001);
  const known = PHASES.filter((p) => t[p.key] !== undefined && !(p.key === 'ssl' && t.connect !== undefined)); // ssl is inside connect
  const starts = known.map((_, i) => known.slice(0, i).reduce((sum, p) => sum + (t[p.key] ?? 0), 0));
  const wait = t.wait ?? 0;
  return (
    <div className="timing pad">
      <p>
        Started at <b>{formatTime(req.timestamp)}</b>, total <b>{formatDuration(req.duration)}</b>
        {wait > 0 && (
          <>
            , of which <b>{Math.round((wait / total) * 100)}%</b> was server time
          </>
        )}
        .
      </p>
      {known.length === 0 ? (
        <p className="muted">No timing breakdown is available for this request.</p>
      ) : (
        <div className="waterfall" role="table" aria-label="Timing breakdown">
          {known.map((p, i) => {
            const v = t[p.key] ?? 0;
            const left = (starts[i]! / total) * 100;
            return (
              <div className="wf-row" role="row" key={p.key} title={p.hint}>
                <span role="cell" className="wf-label">
                  {p.label}
                </span>
                <span role="cell" className="wf-track">
                  <span
                    className={`wf-bar wf-${p.key}`}
                    style={{ left: `${Math.min(left, 100)}%`, width: `${Math.max((v / total) * 100, 0.4)}%` }}
                  />
                </span>
                <span role="cell" className="wf-value num">
                  {formatDuration(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        Timings come from the browser's network log (HAR). Server time ≈ resolver execution plus network
        latency.
      </p>
    </div>
  );
}
