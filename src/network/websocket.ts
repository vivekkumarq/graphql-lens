import type { GraphQLRequest } from '../types/graphql';
import type { HarEntryLike } from './normalizer';
import { parseWebSocketMessages } from '../graphql/subscription-parser';
import { analyzeOperation } from '../graphql/operation-parser';
import { extractErrors } from '../graphql/response-parser';
import { statusText } from '../shared/http-status';

/** socket key → subscription id → { request id, events seen } */
export type WsTracker = Map<string, Map<string, { id: string; seen: number }>>;

/**
 * One GraphQLRequest per subscription on a GraphQL WebSocket. Only subscriptions whose
 * event count changed since the last call are returned, so polling stays cheap.
 */
export function websocketRequests(
  entry: HarEntryLike,
  tracker: WsTracker,
  newId: () => string,
): GraphQLRequest[] {
  const messages = entry._webSocketMessages;
  if (!messages?.length) return [];
  const key = `${entry.request.url}@${entry.startedDateTime}`;
  const known = tracker.get(key) ?? new Map<string, { id: string; seen: number }>();
  tracker.set(key, known);

  const out: GraphQLRequest[] = [];
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
