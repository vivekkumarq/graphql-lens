import type { RefObject } from 'react';
import type { Filters, StatusFilter, TypeFilter } from '../utils/filter';
import { Icon } from './Icon';

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'REST + GQL + WS' },
  { id: 'operation', label: 'Queries & Mutations' },
  { id: 'rest', label: 'REST' },
  { id: 'ws', label: 'WS' },
  { id: 'errors', label: 'Errors' },
  { id: 'success', label: 'Successful' },
];
const MORE: { id: TypeFilter; label: string }[] = [
  { id: 'subscription', label: 'Subscriptions' },
  { id: 'persisted', label: 'Persisted queries' },
  { id: 'batch', label: 'Batched requests' },
  { id: 'slow', label: 'Slow (over 1 s)' },
];

interface Props {
  filters: Filters;
  onFilters: (f: Filters) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  recording: boolean;
  onRecording: (v: boolean) => void;
  preserveLog: boolean;
  onPreserveLog: (v: boolean) => void;
  onClear: () => void;
  onImport: () => void;
  onExport: () => void;
  onSettings: () => void;
  shown: number;
  total: number;
  errorCount: number;
}

export function Toolbar({ searchRef, ...p }: Props) {
  const set = (patch: Partial<Filters>) => p.onFilters({ ...p.filters, ...patch });
  return (
    <header className="toolbar" role="toolbar" aria-label="GraphQL Lens toolbar">
      <div className="toolbar-row">
        <button
          className={`btn record ${p.recording ? 'on' : ''}`}
          title={
            p.recording
              ? 'Recording. Click to stop (Ctrl+E)'
              : 'Recording is stopped. Click to start (Ctrl+E)'
          }
          aria-pressed={p.recording}
          onClick={() => p.onRecording(!p.recording)}
        >
          <Icon name="record" /> {p.recording ? 'Stop' : 'Record'}
        </button>
        <button className="icon-btn" title="Clear history" aria-label="Clear history" onClick={p.onClear}>
          <Icon name="clear" />
        </button>
        <span className="divider" />
        <label className="search">
          <Icon name="search" size={12} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search names, queries, bodies, URLs"
            title="Searches operation names, queries, variables, request and response bodies, WebSocket messages and URLs (not case-sensitive)"
            aria-label="Search requests"
            value={p.filters.text}
            onChange={(e) => set({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && p.filters.text) {
                e.stopPropagation();
                set({ text: '' });
              }
            }}
          />
          <kbd title="Press / to search">/</kbd>
        </label>
        <span className="divider" />
        <label className="check" title="Keep requests when the page reloads or navigates">
          <input
            type="checkbox"
            checked={p.preserveLog}
            onChange={(e) => p.onPreserveLog(e.target.checked)}
          />
          Preserve log
        </label>
        <span className="spacer" />
        <span className="count" aria-live="polite">
          {p.shown === p.total
            ? `${p.total} request${p.total === 1 ? '' : 's'}`
            : `${p.shown} / ${p.total} requests`}
        </span>
        <button className="icon-btn" title="Import a HAR file" aria-label="Import HAR" onClick={p.onImport}>
          <Icon name="upload" />
        </button>
        <button
          className="icon-btn"
          title="Export requests"
          aria-label="Export"
          onClick={p.onExport}
          disabled={!p.total}
        >
          <Icon name="download" />
        </button>
        <button className="icon-btn" title="Settings" aria-label="Settings" onClick={p.onSettings}>
          <Icon name="gear" />
        </button>
      </div>
      <div className="toolbar-row filters">
        <div className="chips" role="radiogroup" aria-label="Request type">
          {TYPES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={p.filters.type === t.id}
              className={`chip ${p.filters.type === t.id ? 'on' : ''} ${t.id === 'errors' && p.errorCount ? 'has-errors' : ''}`}
              onClick={() => set({ type: t.id })}
            >
              {t.label}
              {t.id === 'errors' && p.errorCount > 0 && <span className="chip-count">{p.errorCount}</span>}
            </button>
          ))}
        </div>
        <span className="divider" />
        <select
          aria-label="More filters"
          className={MORE.some((m) => m.id === p.filters.type) ? 'on' : ''}
          value={MORE.some((m) => m.id === p.filters.type) ? p.filters.type : ''}
          onChange={(e) => set({ type: (e.target.value || 'all') as TypeFilter })}
        >
          <option value="">More filters…</option>
          {MORE.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label="HTTP status"
          value={p.filters.status}
          onChange={(e) => set({ status: e.target.value as StatusFilter })}
        >
          <option value="all">Any status</option>
          <option value="2xx">2xx Success</option>
          <option value="3xx">3xx Redirect</option>
          <option value="4xx">4xx Client error</option>
          <option value="5xx">5xx Server error</option>
        </select>
        {!p.recording && <span className="paused">Recording paused</span>}
      </div>
    </header>
  );
}
