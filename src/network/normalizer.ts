import type { GraphQLRequest, HarTimings, Header, Transport } from '../types/graphql';
import { detectGraphQL, type HarRequestLike } from '../graphql/detector';
import { analyzeOperation } from '../graphql/operation-parser';
import { headerValue } from './headers';
import { statusText } from '../shared/http-status';
import type { WsMessage } from '../graphql/subscription-parser';

/** The subset of a HAR 1.2 entry (plus Chrome's private fields) that we read. */
export interface HarEntryLike {
  startedDateTime: string;
  time: number;
  request: HarRequestLike & { httpVersion?: string };
  response: {
    status: number;
    statusText?: string;
    httpVersion?: string;
    headers: Header[];
    content?: { size?: number; mimeType?: string; text?: string; encoding?: string };
    bodySize?: number;
    _transferSize?: number;
  };
  timings?: Record<string, number | undefined>;
  _resourceType?: string;
  _webSocketMessages?: WsMessage[];
}

const TIMING_KEYS = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'] as const;

function timingsOf(t: HarEntryLike['timings']): HarTimings | undefined {
  if (!t) return undefined;
  const out: HarTimings = {};
  for (const k of TIMING_KEYS) {
    const v = t[k];
    if (typeof v === 'number' && v >= 0) out[k] = v; // HAR uses -1 for "not applicable"
  }
  return out;
}

export function transportOf(contentType: string): Transport {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/event-stream')) return 'sse';
  if (ct.includes('multipart/mixed')) return 'multipart';
  return 'http';
}

export const responseContentType = (entry: HarEntryLike): string =>
  headerValue(entry.response.headers, 'content-type') ?? entry.response.content?.mimeType ?? '';

export const isWebSocketEntry = (entry: HarEntryLike): boolean =>
  entry._resourceType === 'websocket' || /^wss?:/i.test(entry.request.url);

/** HAR entry → normalized GraphQL request, or null when it isn't GraphQL. Never throws. */
export function normalizeEntry(entry: HarEntryLike, id: string): GraphQLRequest | null {
  let raw;
  try {
    raw = detectGraphQL(entry.request);
  } catch {
    return null;
  }
  if (!raw) return null;
  const ct = responseContentType(entry);
  const size = entry.response._transferSize ?? entry.response.bodySize ?? entry.response.content?.size ?? 0;
  return {
    id,
    url: entry.request.url,
    method: entry.request.method,
    status: entry.response.status,
    statusText: statusText(entry.response.status, entry.response.statusText),
    mimeType: ct,
    transport: transportOf(ct),
    timestamp: Date.parse(entry.startedDateTime) || Date.now(),
    duration: Math.max(0, entry.time || 0),
    size: Math.max(0, size),
    requestHeaders: entry.request.headers ?? [],
    responseHeaders: entry.response.headers ?? [],
    requestBody: entry.request.postData?.text,
    operations: raw.map(analyzeOperation),
    isBatch: raw.length > 1,
    response: { state: 'pending' },
    timings: timingsOf(entry.timings),
    httpVersion: entry.response.httpVersion || entry.request.httpVersion,
  };
}
