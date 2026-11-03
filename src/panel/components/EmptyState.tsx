import { Icon } from './Icon';

export function EmptyState({
  filtered,
  recording,
  onReload,
  onImport,
  onResetFilters,
}: {
  filtered: boolean;
  recording: boolean;
  onReload: () => void;
  onImport: () => void;
  onResetFilters: () => void;
}) {
  if (filtered)
    return (
      <div className="empty">
        <p className="empty-title">No requests match the current filters.</p>
        <button className="btn" onClick={onResetFilters}>
          Reset filters
        </button>
      </div>
    );
  return (
    <div className="empty">
      <img src="icons/128.png" alt="" width="64" height="64" />
      <p className="empty-title">Open a page that calls a GraphQL or REST API to start inspecting traffic.</p>
      <p className="muted">
        {recording
          ? 'Requests sent before DevTools opened are not recorded. Reload the page to capture them.'
          : 'Recording is paused. Press the record button or Ctrl+E to resume.'}
      </p>
      <div className="empty-actions">
        <button className="btn primary" onClick={onReload}>
          <Icon name="reload" /> Reload page
        </button>
        <button className="btn" onClick={onImport}>
          <Icon name="upload" /> Import HAR file
        </button>
      </div>
      <p className="muted small">
        Detects GraphQL by payload (POST, GET, batching, persisted queries, uploads, SSE, WebSocket and
        @defer), not by URL. Every other fetch/XHR call is listed as REST.
      </p>
    </div>
  );
}
