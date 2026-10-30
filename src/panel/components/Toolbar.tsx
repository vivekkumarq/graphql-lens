import type { RefObject } from 'react';
import type { Filters, StatusFilter, TypeFilter } from '../utils/filter';
import { Icon } from './Icon';

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'query', label: 'Queries' },
  { id: 'mutation', label: 'Mutations' },
  { id: 'subscription', label: 'Subscriptions' },
  { id: 'errors', label: 'Errors' },
  { id: 'success', label: 'Successful' },
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
          className={`icon-btn record ${p.recording ? 'on' : ''}`}
          title={p.recording ? 'Stop recording (Ctrl+E)' : 'Record GraphQL traffic (Ctrl+E)'}
          aria-pressed={p.recording}
          onClick={() => p.onRecording(!p.recording)}
        >
          <Icon name="record" />
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
            placeholder="Search operations, queries, variables, responses, URLs"
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
        <div className="chips" role="radiogroup" aria-label="Operation type">
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
