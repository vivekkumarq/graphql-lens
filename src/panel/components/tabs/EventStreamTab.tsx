import { useMemo, useState } from 'react';
import type { GraphQLRequest } from '../../../types/graphql';
import { prettyMaybeJSON } from '../../../graphql/formatter';
import { MAX_FRAMES } from '../../../network/websocket';
import { formatBytes, formatTime } from '../../utils/format';
import { Code } from '../LazyCode';

type Direction = 'all' | 'send' | 'receive';

// Binary frames arrive base64-encoded; report their decoded size.
const base64Bytes = (s: string) =>
  Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

/** Every frame of a WebSocket, newest at the bottom, like DevTools' own Messages view. */
export function EventStreamTab({ req }: { req: GraphQLRequest }) {
  const frames = useMemo(() => req.frames ?? [], [req.frames]);
  const [direction, setDirection] = useState<Direction>('all');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number | null>(null);

  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    return frames
      .map((f, i) => ({ f, i }))
      .filter(
        ({ f }) => (direction === 'all' || f.type === direction) && (!t || f.data.toLowerCase().includes(t)),
      );
  }, [frames, direction, text]);
  const frame = picked === null ? undefined : frames[picked];
  const sent = frames.filter((f) => f.type === 'send').length;

  return (
    <div className="events">
      <div className="events-bar">
        <input
          type="search"
          placeholder="Filter messages"
          aria-label="Filter messages"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          aria-label="Message direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
        >
          <option value="all">All messages</option>
          <option value="send">Sent ↑</option>
          <option value="receive">Received ↓</option>
        </select>
        <span className="muted">
          {sent} sent · {frames.length - sent} received
          {frames.length >= MAX_FRAMES && ` (latest ${MAX_FRAMES})`}
        </span>
      </div>
      {frames.length === 0 ? (
        <p className="muted pad">
          No messages yet. New messages show up here every 2 seconds while the panel is open.
        </p>
      ) : (
        <div className="events-list" role="table" aria-label="WebSocket messages">
          <div className="ev-row ev-head" role="row">
            <span role="columnheader" />
            <span role="columnheader">Data</span>
            <span role="columnheader" className="num">
              Length
            </span>
            <span role="columnheader" className="num">
              Time
            </span>
          </div>
          {shown.map(({ f, i }) => {
            const binary = f.opcode !== 1;
            return (
              <div
                key={i}
                role="row"
                className={`ev-row ev-${f.type} ${picked === i ? 'on' : ''}`}
                onClick={() => setPicked(picked === i ? null : i)}
              >
                <span className="ev-dir" title={f.type === 'send' ? 'Sent' : 'Received'}>
                  {f.type === 'send' ? '↑' : '↓'}
                </span>
                <span className="ev-data" title="Click to see the whole message">
                  {binary ? `Binary message (${formatBytes(base64Bytes(f.data))})` : f.data.slice(0, 400)}
                </span>
                <span className="num">{formatBytes(binary ? base64Bytes(f.data) : f.data.length)}</span>
                <span className="num">{formatTime(f.time * 1000)}</span>
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted pad">No messages match the filter.</p>}
        </div>
      )}
      {frame && (
        <Code
          value={frame.opcode === 1 ? prettyMaybeJSON(frame.data) : frame.data}
          language={frame.opcode === 1 && /^\s*[[{]/.test(frame.data) ? 'json' : 'text'}
          label={
            frame.opcode === 1
              ? `${frame.type === 'send' ? 'Sent' : 'Received'} message`
              : 'Binary message (base64)'
          }
        />
      )}
    </div>
  );
}
