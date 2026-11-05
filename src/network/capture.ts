import type { GraphQLRequest, ResponseState } from '../types/graphql';
import { isWebSocketEntry, normalizeEntry, responseContentType, type HarEntryLike } from './normalizer';
import { decodeBody, truncateBody } from './response-body';
import { websocketRequests, type WsTracker } from './websocket';
import { analyzeSummary } from '../workers/analyzer';

export interface CaptureSink {
  upsert(req: GraphQLRequest): void;
  patch(id: string, patch: Partial<GraphQLRequest>): void;
  navigated(url: string): void;
}

export interface CaptureOptions {
  isRecording(): boolean;
  maxResponseBytes(): number;
  captureWebSockets(): boolean;
  captureRest(): boolean;
  isPanelVisible(): boolean;
  /** a socket (or the WS filter) is on screen, so its messages should update quickly */
  isWatchingSockets(): boolean;
}

type LiveEntry = HarEntryLike & { getContent?(cb: (content: string, encoding: string) => void): void };

const WS_POLL_MS = 2000; // while a socket is on screen
const WS_IDLE_POLL_MS = 15000; // otherwise: just find new sockets and refresh their message counts
const WS_LOAD_MS = 20000; // poll quickly this long after the panel opens or the page navigates

// Per-page prefix keeps ids unique against requests restored from session storage.
const PREFIX = Math.random().toString(36).slice(2, 7);
let seq = 0;
export const nextRequestId = () => `${PREFIX}-${++seq}`;

/** Turn a decoded body into the stored response state, analysed off the main thread when large. */
export async function responseStateFor(
  body: string,
  contentType: string,
  maxBytes: number,
  rest = false,
): Promise<ResponseState> {
  const t = truncateBody(body, maxBytes);
  if (t.truncated) {
    const mb = (maxBytes / 1048576).toFixed(0);
    return {
      state: 'loaded',
      body: t.body,
      truncated: true,
      summary: {
        kind: 'text',
        errorCount: 0,
        partCount: 1,
        parseError: `Response is larger than the ${mb} MB limit, so only the first ${mb} MB was kept and it is shown raw. Raise the limit in Settings.`,
      },
    };
  }
  try {
    const summary = await analyzeSummary(body, contentType);
    // an "errors" key in a REST body is just data, not GraphQL errors
    if (rest) Object.assign(summary, { errorCount: 0, firstError: undefined });
    return { state: 'loaded', body, truncated: false, summary };
  } catch (e) {
    return { state: 'failed', message: `Unable to parse response: ${String(e)}` };
  }
}

/**
 * The only module that talks to chrome.devtools.network. It turns HAR entries into
 * GraphQLRequest objects and hands them to the sink; it knows nothing about React.
 */
export function startCapture(sink: CaptureSink, opts: CaptureOptions): () => void {
  const network = chrome.devtools.network;
  const ws: WsTracker = new Map();

  const handleWebSocket = (entry: HarEntryLike) => {
    for (const req of websocketRequests(entry, ws, nextRequestId)) sink.upsert(req);
  };

  const handle = (entry: LiveEntry) => {
    if (!opts.isRecording()) return;
    try {
      if (isWebSocketEntry(entry)) {
        if (opts.captureWebSockets()) handleWebSocket(entry);
        return;
      }
      const req = normalizeEntry(entry, nextRequestId(), opts.captureRest());
      if (!req) return;
      sink.upsert(req);
      const contentType = responseContentType(entry);
      const done = (content: string | null | undefined, encoding?: string | null) => {
        void responseStateFor(
          decodeBody(content, encoding),
          contentType,
          opts.maxResponseBytes(),
          req.kind === 'rest',
        ).then((response) => sink.patch(req.id, { response }));
      };
      if (entry.response.content?.text !== undefined)
        done(entry.response.content.text, entry.response.content.encoding);
      else if (entry.getContent) entry.getContent((c, enc) => done(c, enc));
      else done('');
    } catch (e) {
      // malformed traffic must never take the panel down
      console.warn('[GraphQL Lens] skipped an entry:', e);
    }
  };

  // Pages open most of their sockets while loading, so poll quickly for a while after the panel
  // opens or the page navigates.
  let fastUntil = Date.now() + WS_LOAD_MS;
  const onFinished = (entry: chrome.devtools.network.Request) => handle(entry as unknown as LiveEntry);
  const onNavigated = (url: string) => {
    fastUntil = Date.now() + WS_LOAD_MS;
    sink.navigated(url);
  };

  // Requests made before the panel opened are still in DevTools' network log.
  network.getHAR((log) => {
    for (const e of log.entries) handle(e as unknown as LiveEntry);
    network.onRequestFinished.addListener(onFinished);
  });
  network.onNavigated.addListener(onNavigated);

  // WebSocket frames only reach extensions through getHAR. It serialises the whole network log
  // (several MB on a busy page) and stalls DevTools while doing so, so poll every 2 s only while a
  // socket is on screen, rarely otherwise, and never spend more than ~10% of the time on it.
  let last = 0;
  let cost = 0;
  const timer = setInterval(() => {
    if (!opts.captureWebSockets() || !opts.isRecording() || !opts.isPanelVisible()) return;
    const start = Date.now();
    const fast = opts.isWatchingSockets() || start < fastUntil;
    const every = Math.max(fast ? WS_POLL_MS : WS_IDLE_POLL_MS, cost * 10);
    if (start - last < every - 500) return; // 500 ms slack for timer jitter
    last = start;
    network.getHAR((log) => {
      cost = Date.now() - start;
      for (const e of log.entries as unknown as HarEntryLike[]) if (isWebSocketEntry(e)) handleWebSocket(e);
    });
  }, 1000);

  return () => {
    clearInterval(timer);
    network.onRequestFinished.removeListener(onFinished);
    network.onNavigated.removeListener(onNavigated);
  };
}

/** Load a HAR file (exported from any browser) as if it had been captured live. */
export async function importHarEntries(
  entries: HarEntryLike[],
  sink: CaptureSink,
  maxBytes: number,
  rest: boolean,
): Promise<number> {
  let count = 0;
  const ws: WsTracker = new Map();
  for (const entry of entries) {
    try {
      if (isWebSocketEntry(entry)) {
        for (const r of websocketRequests(entry, ws, nextRequestId)) {
          sink.upsert(r);
          count++;
        }
        continue;
      }
      const req = normalizeEntry(entry, nextRequestId(), rest);
      if (!req) continue;
      count++;
      sink.upsert(req);
      const body = decodeBody(entry.response.content?.text, entry.response.content?.encoding);
      sink.patch(req.id, {
        response: await responseStateFor(body, responseContentType(entry), maxBytes, req.kind === 'rest'),
      });
    } catch (e) {
      console.warn('[GraphQL Lens] skipped an imported entry:', e);
    }
  }
  return count;
}
