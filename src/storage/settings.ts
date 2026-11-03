export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeSetting;
  maxRequests: number;
  preserveLog: boolean; // false = auto-clear on page reload/navigation
  showSensitiveHeaders: boolean;
  persistRequests: boolean; // keep history in session storage while the browser runs
  prettyPrint: boolean;
  formatQueries: boolean;
  maxResponseMB: number;
  captureWebSockets: boolean;
  captureRest: boolean; // plain fetch/XHR API calls next to GraphQL
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  maxRequests: 500,
  preserveLog: false,
  showSensitiveHeaders: false,
  persistRequests: false,
  prettyPrint: true,
  formatQueries: true,
  maxResponseMB: 10,
  captureWebSockets: true,
  captureRest: true,
};

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Storage is user-writable; never trust its shape. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  return {
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : d.theme,
    maxRequests: clamp(r.maxRequests, 50, 5000, d.maxRequests),
    preserveLog: bool(r.preserveLog, d.preserveLog),
    showSensitiveHeaders: bool(r.showSensitiveHeaders, d.showSensitiveHeaders),
    persistRequests: bool(r.persistRequests, d.persistRequests),
    prettyPrint: bool(r.prettyPrint, d.prettyPrint),
    formatQueries: bool(r.formatQueries, d.formatQueries),
    maxResponseMB: clamp(r.maxResponseMB, 1, 100, d.maxResponseMB),
    captureWebSockets: bool(r.captureWebSockets, d.captureWebSockets),
    captureRest: bool(r.captureRest, d.captureRest),
  };
}

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return sanitizeSettings(stored[KEY]);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(sanitizeSettings(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
