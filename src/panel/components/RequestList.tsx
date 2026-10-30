import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { GraphQLRequest } from '../../types/graphql';
import { StatusBadge, TypeBadge } from './Badges';
import { formatBytes, formatDuration, formatTime, shortUrl } from '../utils/format';

const ROW = 24; // fixed row height keeps virtualization trivial
const OVERSCAN = 10;

interface Props {
  requests: GraphQLRequest[];
  activeId: string | null;
  selected: Set<string>;
  onSelect: (id: string, e: { shift: boolean; toggle: boolean }) => void;
  onMove: (delta: number | 'start' | 'end') => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

const Row = memo(function Row({
  req,
  index,
  active,
  selected,
  onClick,
}: {
  req: GraphQLRequest;
  index: number;
  active: boolean;
  selected: boolean;
  onClick: (id: string, e: MouseEvent) => void;
}) {
  const op = req.operations[0];
  const transport = req.transport !== 'http' ? req.transport : null;
  return (
    <div
      role="row"
      id={`row-${req.id}`}
      aria-selected={selected}
      className={`row ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
      style={{ transform: `translateY(${index * ROW}px)` }}
      onMouseDown={(e) => onClick(req.id, e)}
    >
      <span role="gridcell" className="col-name" title={req.operations.map((o) => o.name).join('\n')}>
        <TypeBadge type={op?.operationType} persisted={!!op?.persistedQueryHash} />
        <span className="name">{op?.name}</span>
        {req.isBatch && (
          <span className="batch" title="Batched request">
            +{req.operations.length - 1}
          </span>
        )}
        {transport && (
          <span className={`transport tr-${transport}`}>
            {transport === 'websocket' ? 'WS' : transport === 'sse' ? 'SSE' : 'defer'}
          </span>
        )}
      </span>
      <span role="gridcell" className="col-status">
        <StatusBadge req={req} compact />
      </span>
      <span role="gridcell" className="col-time num">
        {formatDuration(req.duration)}
      </span>
      <span role="gridcell" className="col-size num">
        {formatBytes(req.size)}
      </span>
      <span role="gridcell" className="col-started num">
        {formatTime(req.timestamp)}
      </span>
      <span role="gridcell" className="col-url" title={req.url}>
        {req.method !== 'POST' && <b className="method">{req.method}</b>}
        {shortUrl(req.url)}
      </span>
    </div>
  );
});

/** Virtualized: only visible rows are in the DOM, so 5000 requests scroll as smoothly as 5. */
export function RequestList({ requests, activeId, selected, onSelect, onMove, onKeyDown }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Like the Network panel: follow new requests while scrolled to the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [requests.length]);

  // Keep the active row in view during keyboard navigation.
  useEffect(() => {
    const el = scroller.current;
    const i = requests.findIndex((r) => r.id === activeId);
    if (!el || i < 0) return;
    const top = i * ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight;
  }, [activeId, requests]);

  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(requests.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  const click = (id: string, e: MouseEvent) => {
    if (e.button !== 0) return;
    onSelect(id, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
  };

  return (
    <div className="list" role="grid" aria-label="GraphQL requests" aria-rowcount={requests.length}>
      <div className="list-head" role="row">
        <span className="col-name">Operation</span>
        <span className="col-status">Status</span>
        <span className="col-time num">Time</span>
        <span className="col-size num">Size</span>
        <span className="col-started num">Started</span>
        <span className="col-url">URL</span>
      </div>
      <div
        className="list-body"
        ref={scroller}
        tabIndex={0}
        aria-activedescendant={activeId ? `row-${activeId}` : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollTop(el.scrollTop);
          stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW;
        }}
        onKeyDown={(e) => {
          const moves: Record<string, number | 'start' | 'end'> = {
            ArrowDown: 1,
            ArrowUp: -1,
            PageDown: 10,
            PageUp: -10,
            Home: 'start',
            End: 'end',
          };
          const m = moves[e.key];
          if (m !== undefined) {
            e.preventDefault();
            onMove(m);
          } else onKeyDown(e);
        }}
      >
        <div className="list-inner" style={{ height: requests.length * ROW }}>
          {requests.slice(first, last).map((r, i) => (
            <Row
              key={r.id}
              req={r}
              index={first + i}
              active={r.id === activeId}
              selected={selected.has(r.id)}
              onClick={click}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
