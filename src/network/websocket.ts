import type { GraphQLRequest } from '../types/graphql';
import type { HarEntryLike } from './normalizer';
import { parseWebSocketMessages } from '../graphql/subscription-parser';
import { analyzeOperation } from '../graphql/operation-parser';
import { extractErrors } from '../graphql/response-parser';
import { statusText } from '../shared/http-status';
import { headerValue } from './headers';
import { restName } from './normalizer';

export const MAX_FRAMES = 2000;
const CONNECTION = '#connection'; // tracker key for the socket's own row

/** socket key → subscription id → { request id, what was last emitted (event count, or frames/status) } */
export type WsTracker = Map<string, Map<string, { id: string; seen: number | string }>>;

/** The socket itself: one row with every frame, for any WebSocket (GraphQL or not). */
function connectionRow(entry: HarEntryLike, id: string): GraphQLRequest {
  const all = entry._webSocketMessages ?? [];
  const frames = all.slice(-MAX_FRAMES);
  const start = Date.parse(entry.startedDateTime);
  const last = all.at(-1);
  const status = entry.response.status; // 0 while the handshake is still pending, or if it failed
  return {
    id,
    kind: 'ws',
    url: entry.request.url,
    method: 'WS',
    status,
    statusText: statusText(status, entry.response.statusText),
    mimeType: 'websocket',
    transport: 'websocket',
    timestamp: start,
    duration: last ? Math.max(0, last.time * 1000 - start) : Math.max(0, entry.time || 0),
    size: all.reduce((n, m) => n + m.data.length, 0),
    requestHeaders: entry.request.headers ?? [],
    responseHeaders: entry.response.headers ?? [],
    operations: [{ index: 0, name: restName(entry.request.url) }],
    isBatch: false,
    frames,
    wsProtocol: headerValue(entry.response.headers ?? [], 'sec-websocket-protocol'),
    response: {
      state: 'loaded',
      body: '',
      truncated: false,
      summary: { kind: 'empty', errorCount: 0, partCount: 0 },
    },
  };
}

/**
 * A row for the socket itself plus one GraphQLRequest per GraphQL subscription on it. Only rows
 * whose frame/event count changed since the last call are returned, so polling stays cheap.
 */
export function websocketRequests(
  entry: HarEntryLike,
  tracker: WsTracker,
  newId: () => string,
): GraphQLRequest[] {
  // Chrome lists a socket that has only just been created with a 1969 start time, then the real
  // one. Keying on the placeholder would give the same socket two rows, so wait for the real time.
  if (!(Date.parse(entry.startedDateTime) > 0)) return [];
  const messages = entry._webSocketMessages ?? [];
  const key = `${entry.request.url}@${entry.startedDateTime}`;
  const known = tracker.get(key) ?? new Map<string, { id: string; seen: number | string }>();
  tracker.set(key, known);

  const out: GraphQLRequest[] = [];
  const conn = known.get(CONNECTION);
  const state = `${messages.length}/${entry.response.status}`; // re-emit when the handshake completes too
  if (!conn || conn.seen !== state) {
    const id = conn?.id ?? newId();
    known.set(CONNECTION, { id, seen: state });
    out.push(connectionRow(entry, id));
  }
  for (const sub of parseWebSocketMessages(messages)) {
    const prev = known.get(sub.id);
    if (prev && prev.seen === sub.events.length) continue;
    const id = prev?.id ?? newId();
    known.set(sub.id, { id, seen: sub.events.length });

    // Rendered as an event stream so the response viewer can reuse its SSE handling.
    const body = sub.events
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e.payload ?? null)}\n\n`)
      .join('');
    const errorCount = sub.events.reduce(
      (n, e) =>
        n +
        (e.type === 'error' ? Math.max(1, extractErrors(e.payload).length) : extractErrors(e.payload).length),
      0,
    );
    const op = analyzeOperation(sub.operation, 0);
    const last = sub.events.at(-1)?.time ?? sub.startTime;
    const status = entry.response.status || 101;
    out.push({
      id,
      url: entry.request.url,
      method: 'WS',
      status,
      statusText: statusText(status, entry.response.statusText),
      mimeType: 'websocket',
      transport: 'websocket',
      timestamp: sub.startTime,
      duration: Math.max(0, last - sub.startTime),
      size: body.length,
      requestHeaders: entry.request.headers ?? [],
      responseHeaders: entry.response.headers ?? [],
      requestBody: JSON.stringify({ id: sub.id, payload: sub.operation }),
      // a "subscribe" message can carry a query too, so trust the document's own type when it has one
      operations: [{ ...op, operationType: op.operationType ?? 'subscription' }],
      isBatch: false,
      events: sub.events,
      wsProtocol: sub.protocol,
      response: {
        state: 'loaded',
        body,
        truncated: false,
        summary: { kind: 'sse', errorCount, partCount: sub.events.length },
      },
    });
  }
  return out;
}
