import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { RequestStore } from './store/requests-store';
import { importHarEntries, startCapture } from '../network/capture';
import { harEntries } from '../export/har';
import { clearHistory, loadHistory, saveHistory } from '../storage/history';
import { filterRequests, hasErrors, type Filters } from './utils/filter';
import { useDebounced, useSettings, useTheme } from './hooks/useSettings';
import { copyText } from './utils/clipboard';
import { toast } from './utils/toast';
import { Toolbar } from './components/Toolbar';
import { RequestList } from './components/RequestList';
import { RequestDetails, type TabId } from './components/RequestDetails';
import { EmptyState } from './components/EmptyState';
import { SettingsDialog } from './components/Settings';
import { ExportDialog } from './components/ExportDialog';
import { Dialog } from './components/Dialog';
import { Toasts } from './components/Toasts';

const store = new RequestStore();
const NO_FILTERS: Filters = { text: '', type: 'all', status: 'all' };

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  el.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null;

function readSplit(): number {
  try {
    const v = Number(localStorage.getItem('split'));
    return v > 0.15 && v < 0.85 ? v : 0.42;
  } catch {
    return 0.42;
  }
}

export function App() {
  const requests = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { settings, update, loaded } = useSettings();
  useTheme(settings.theme);

  const [recording, setRecording] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const text = useDebounced(filters.text, 180);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [tab, setTab] = useState<TabId>('query');
  const [dialog, setDialog] = useState<'settings' | 'export' | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(
    null,
  );
  const [split, setSplit] = useState(readSplit);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Capture reads live values through refs so it is started exactly once.
  const live = useRef({ recording, settings, visible: true, watching: false });
  useEffect(() => {
    live.current.recording = recording;
    live.current.settings = settings;
  }, [recording, settings]);

  useEffect(() => {
    store.preserveLog = settings.preserveLog;
    store.setMax(settings.maxRequests);
  }, [settings.preserveLog, settings.maxRequests]);

  useEffect(() => {
    if (!loaded) return;
    const start = () =>
      startCapture(store, {
        isRecording: () => live.current.recording,
        maxResponseBytes: () => live.current.settings.maxResponseMB * 1048576,
        captureWebSockets: () => live.current.settings.captureWebSockets,
        captureRest: () => live.current.settings.captureRest,
        isPanelVisible: () => live.current.visible,
        isWatchingSockets: () => live.current.watching,
      });
    let stop: (() => void) | undefined;
    if (live.current.settings.persistRequests)
      void loadHistory().then((saved) => {
        if (saved.length) store.replaceAll(saved);
        stop = start();
      });
    else stop = start();
    const onVisibility = (e: Event) => (live.current.visible = (e as CustomEvent<boolean>).detail);
    window.addEventListener('graphql-lens:visibility', onVisibility);
    return () => {
      stop?.();
      window.removeEventListener('graphql-lens:visibility', onVisibility);
    };
  }, [loaded]);

  // Opt-in persistence to session storage (memory only, cleared when the browser quits).
  useEffect(() => {
    if (!settings.persistRequests) {
      store.onChange = undefined;
      void clearHistory();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;
    store.onChange = (reqs) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!(await saveHistory(reqs)) && !warned) {
          warned = true;
          toast('History is too large to keep after DevTools closes (10 MB limit)', 'error');
        }
      }, 800);
    };
    store.onChange(store.getSnapshot());
    return () => clearTimeout(timer);
  }, [settings.persistRequests]);

  const visible = useMemo(
    () => filterRequests(requests, { text, type: filters.type, status: filters.status }),
    [requests, text, filters.type, filters.status],
  );
  const active = useMemo(() => requests.find((r) => r.id === activeId), [requests, activeId]);
  const errorCount = useMemo(() => requests.filter(hasErrors).length, [requests]);
  useEffect(() => {
    live.current.watching = active?.transport === 'websocket' || filters.type === 'ws';
  }, [active, filters.type]);

  const selectOnly = useCallback((id: string | null) => {
    setActiveId(id);
    setSelected(id ? new Set([id]) : new Set());
    anchor.current = id;
  }, []);

  const onSelect = useCallback(
    (id: string, { shift, toggle }: { shift: boolean; toggle: boolean }) => {
      if (shift && anchor.current) {
        const a = visible.findIndex((r) => r.id === anchor.current);
        const b = visible.findIndex((r) => r.id === id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(visible.slice(lo, hi + 1).map((r) => r.id)));
          setActiveId(id);
          return;
        }
      }
      if (toggle) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setActiveId(id);
        anchor.current = id;
        return;
      }
      selectOnly(id);
    },
    [visible, selectOnly],
  );

  const onMove = useCallback(
    (delta: number | 'start' | 'end') => {
      if (!visible.length) return;
      const i = visible.findIndex((r) => r.id === activeId);
      const next =
        delta === 'start'
          ? 0
          : delta === 'end'
            ? visible.length - 1
            : Math.min(visible.length - 1, Math.max(0, (i < 0 ? -1 : i) + delta));
      selectOnly(visible[next]!.id);
    },
    [visible, activeId, selectOnly],
  );

  // stable, so the memoised details pane skips re-rendering when other requests arrive
  const closeDetails = useCallback(() => selectOnly(null), [selectOnly]);
  const openExport = useCallback(() => setDialog('export'), []);

  const clearAll = useCallback(() => {
    store.clear();
    selectOnly(null);
  }, [selectOnly]);

  const removeSelected = useCallback(() => {
    const ids = selected.size ? selected : activeId ? new Set([activeId]) : new Set<string>();
    if (!ids.size) return;
    store.remove(ids);
    selectOnly(null);
    toast(`Removed ${ids.size} request(s)`);
  }, [selected, activeId, selectOnly]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Delete') {
      e.preventDefault();
      removeSelected();
    } else if (e.key === 'Enter' && active) setTab('response');
    else if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'c' &&
      !window.getSelection()?.toString() &&
      active
    ) {
      e.preventDefault();
      if (active.kind) void copyText(active.url, 'URL copied');
      else void copyText(active.operations.map((o) => o.query ?? '').join('\n\n'), 'Query copied');
    }
  };

  // Global shortcuts. Captured early so DevTools' own Ctrl+F does not swallow them.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setRecording((r) => !r);
        return;
      }
      if (document.querySelector('dialog[open]')) return;
      if (isEditable(e.target)) return;
      if (e.key === '/' || (mod && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        e.stopPropagation();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape') {
        if (filters.text) setFilters((f) => ({ ...f, text: '' }));
        else if (activeId) selectOnly(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filters.text, activeId, selectOnly]);

  const confirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmState({ message, resolve })),
    [],
  );
  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const entries = harEntries(JSON.parse(await file.text()));
      const n = await importHarEntries(
        entries,
        store,
        settings.maxResponseMB * 1048576,
        settings.captureRest,
      );
      toast(
        n
          ? `Imported ${n} request(s) from ${file.name}`
          : `No GraphQL or REST requests found in ${file.name}`,
        n ? 'info' : 'error',
      );
    } catch (e) {
      toast(`Could not import ${file.name}: ${(e as Error).message}`, 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = mainRef.current;
    if (!host) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = host.getBoundingClientRect();
    const move = (ev: PointerEvent) =>
      setSplit(Math.min(0.8, Math.max(0.18, (ev.clientX - rect.left) / rect.width)));
    const up = (ev: PointerEvent) => {
      (e.target as HTMLElement).removeEventListener('pointermove', move);
      (e.target as HTMLElement).removeEventListener('pointerup', up);
      try {
        localStorage.setItem('split', String((ev.clientX - rect.left) / rect.width));
      } catch {
        /* storage unavailable */
      }
    };
    e.currentTarget.addEventListener('pointermove', move);
    e.currentTarget.addEventListener('pointerup', up);
  };

  const filtered = filters.text !== '' || filters.type !== 'all' || filters.status !== 'all';

  return (
    <div className="app">
      <Toolbar
        filters={filters}
        onFilters={setFilters}
        searchRef={searchRef}
        recording={recording}
        onRecording={setRecording}
        preserveLog={settings.preserveLog}
        onPreserveLog={(v) => update({ preserveLog: v })}
        onClear={clearAll}
        onImport={() => fileRef.current?.click()}
        onExport={() => setDialog('export')}
        onSettings={() => setDialog('settings')}
        shown={visible.length}
        total={requests.length}
        errorCount={errorCount}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".har,.json,application/json"
        hidden
        onChange={(e) => void onImportFile(e.target.files?.[0])}
      />
      <main
        className={`main ${active ? 'with-details' : ''}`}
        ref={mainRef}
        style={{ '--split': `${split * 100}%` } as React.CSSProperties}
      >
        <div className="list-pane">
          {visible.length === 0 ? (
            <EmptyState
              filtered={filtered && requests.length > 0}
              recording={recording}
              onReload={() => chrome.devtools.inspectedWindow.reload({})}
              onImport={() => fileRef.current?.click()}
              onResetFilters={() => setFilters(NO_FILTERS)}
            />
          ) : (
            <RequestList
              requests={visible}
              activeId={active ? activeId : null}
              selected={selected}
              onSelect={onSelect}
              onMove={onMove}
              onKeyDown={onListKey}
            />
          )}
        </div>
        {active && (
          <>
            <div
              className="resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panes"
              onPointerDown={startResize}
            />
            <RequestDetails
              req={active}
              settings={settings}
              tab={tab}
              onTab={setTab}
              onClose={closeDetails}
              confirm={confirm}
              onExport={openExport}
            />
          </>
        )}
      </main>
      <SettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        settings={settings}
        onChange={update}
      />
      {dialog === 'export' && (
        <ExportDialog
          open
          onClose={() => setDialog(null)}
          active={active}
          selected={requests.filter((r) => selected.has(r.id))}
          visible={visible}
          all={requests}
        />
      )}
      <Dialog
        open={!!confirmState}
        title="Copy credentials?"
        onClose={() => closeConfirm(false)}
        footer={
          <>
            <button className="btn" onClick={() => closeConfirm(false)}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => closeConfirm(true)}>
              Copy with credentials
            </button>
          </>
        }
      >
        <p>{confirmState?.message}</p>
      </Dialog>
      <Toasts />
    </div>
  );
}
