import type { Settings, ThemeSetting } from '../../storage/settings';
import { APP_NAME, APP_VERSION, TAGLINE } from '../../shared/constants';
import { Dialog } from './Dialog';

const SHORTCUTS: [string, string][] = [
  ['/ or Ctrl+F', 'Focus search'],
  ['Esc', 'Clear search, then close details'],
  ['↑ / ↓, PgUp / PgDn, Home / End', 'Move through requests'],
  ['Ctrl/⌘ + click, Shift + click', 'Select several requests (for export)'],
  ['Delete', 'Remove the selected requests'],
  ['Ctrl/⌘ + C', 'Copy the selected query, or a REST call’s URL (when no text is selected)'],
  ['Ctrl+E', 'Start / stop recording'],
  ['Ctrl+F inside a code view', 'Search within that query or response'],
];

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Settings" wide>
      <div className="settings-grid">
        <section>
          <h3>Appearance</h3>
          <label className="setting setting-row">
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => onChange({ theme: e.target.value as ThemeSetting })}
            >
              <option value="system">Match DevTools / system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <Toggle
            label="Pretty-print JSON"
            hint="Format variables and responses"
            checked={settings.prettyPrint}
            onChange={(v) => onChange({ prettyPrint: v })}
          />
          <Toggle
            label="Format queries by default"
            hint="Reprint queries canonically (comments are dropped; “As sent” keeps them)"
            checked={settings.formatQueries}
            onChange={(v) => onChange({ formatQueries: v })}
          />

          <h3>Capture</h3>
          <label className="setting setting-row">
            <span>
              Maximum request history
              <small>Oldest requests are dropped first</small>
            </span>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={settings.maxRequests}
              onChange={(e) => onChange({ maxRequests: Number(e.target.value) })}
            />
          </label>
          <label className="setting setting-row">
            <span>
              Maximum response size (MB)
              <small>Larger bodies are truncated and shown raw</small>
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxResponseMB}
              onChange={(e) => onChange({ maxResponseMB: Number(e.target.value) })}
            />
          </label>
          <Toggle
            label="Preserve log on reload"
            hint="Off = auto-clear when the page navigates"
            checked={settings.preserveLog}
            onChange={(v) => onChange({ preserveLog: v })}
          />
          <Toggle
            label="Capture REST API calls"
            hint="fetch/XHR requests that are not GraphQL, shown with an R badge"
            checked={settings.captureRest}
            onChange={(v) => onChange({ captureRest: v })}
          />
          <Toggle
            label="Capture WebSocket connections"
            hint="Every socket with its messages, plus GraphQL subscriptions (graphql-ws, subscriptions-transport-ws)"
            checked={settings.captureWebSockets}
            onChange={(v) => onChange({ captureWebSockets: v })}
          />

          <h3>Privacy</h3>
          <Toggle
            label="Show sensitive headers"
            hint="Authorization, Cookie, API keys and tokens are masked by default"
            checked={settings.showSensitiveHeaders}
            onChange={(v) => onChange({ showSensitiveHeaders: v })}
          />
          <Toggle
            label="Keep requests when DevTools closes"
            hint="Stored in this browser's session storage only, and cleared when the browser quits"
            checked={settings.persistRequests}
            onChange={(v) => onChange({ persistRequests: v })}
          />
        </section>
        <section>
          <h3>Keyboard shortcuts</h3>
          <table className="kv-table shortcuts">
            <tbody>
              {SHORTCUTS.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">
                    <kbd>{k}</kbd>
                  </th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>About</h3>
          <p>
            <b>{APP_NAME}</b> {APP_VERSION}. {TAGLINE}
          </p>
          <p className="muted small">
            Everything stays on your machine: no analytics, no telemetry, no servers. Captured traffic lives
            in this DevTools window’s memory and is never uploaded.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
