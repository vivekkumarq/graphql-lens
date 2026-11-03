import type { GraphQLRequest, Header } from '../types/graphql';
import { redactHeaders } from '../network/headers';
import type { HarEntryLike } from '../network/normalizer';
import { APP_VERSION } from '../shared/constants';

export interface ExportOptions {
  includeCredentials: boolean;
}

const headersFor = (h: Header[], opts: ExportOptions) => (opts.includeCredentials ? h : redactHeaders(h));

function queryString(url: string) {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

/** Rebuild Chrome's `_webSocketMessages` for a subscription so it survives export → import. */
function wsMessages(r: GraphQLRequest) {
  let sub: { id?: string; payload?: unknown } = {};
  try {
    sub = JSON.parse(r.requestBody ?? '{}');
  } catch {
    /* keep defaults */
  }
  const id = sub.id ?? '1';
  const legacy = r.wsProtocol === 'subscriptions-transport-ws';
  const frame = (type: 'send' | 'receive', time: number, data: unknown) => ({
    type,
    time: time / 1000,
    opcode: 1,
    data: JSON.stringify(data),
  });
  return [
    frame('send', r.timestamp, { id, type: legacy ? 'start' : 'subscribe', payload: sub.payload }),
    ...(r.events ?? []).map((e) =>
      frame('receive', e.time, {
        id,
        type: legacy && e.type === 'next' ? 'data' : e.type,
        ...(e.payload !== undefined ? { payload: e.payload } : {}),
      }),
    ),
  ];
}

/** HAR 1.2, so exports open in Chrome/Edge/Firefox DevTools and can be re-imported here. */
export function toHar(requests: GraphQLRequest[], opts: ExportOptions) {
  return {
    log: {
      version: '1.2',
      creator: { name: 'GraphQL Lens', version: APP_VERSION },
      entries: requests.map((r) => {
        const body = r.response.state === 'loaded' ? r.response.body : '';
        const httpVersion = r.httpVersion || 'HTTP/1.1';
        return {
          startedDateTime: new Date(r.timestamp).toISOString(),
          time: r.duration,
          request: {
            method: r.method,
            url: r.url,
            httpVersion,
            headers: headersFor(r.requestHeaders, opts),
            queryString: queryString(r.url),
            cookies: [],
            headersSize: -1,
            bodySize: r.requestBody?.length ?? 0,
            ...(r.requestBody !== undefined
              ? {
                  postData: {
                    mimeType:
                      r.requestHeaders.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '',
                    text: r.requestBody,
                  },
                }
              : {}),
          },
          response: {
            status: r.status,
            statusText: r.statusText,
            httpVersion,
            headers: headersFor(r.responseHeaders, opts),
            cookies: [],
            content: { size: body.length, mimeType: r.mimeType, text: body },
            redirectURL: '',
            headersSize: -1,
            bodySize: r.size,
          },
          cache: {},
          timings: { send: 0, wait: r.duration, receive: 0, ...r.timings },
          ...(r.transport === 'websocket'
            ? { _resourceType: 'websocket', _webSocketMessages: wsMessages(r) }
            : { _resourceType: 'fetch' }),
        };
      }),
    },
  };
}

/** A readable, GraphQL-shaped export: one object per request. */
export function toJSONExport(requests: GraphQLRequest[], opts: ExportOptions) {
  return {
    exportedBy: `GraphQL Lens ${APP_VERSION}`,
    exportedAt: new Date().toISOString(),
    requests: requests.map((r) => {
      let response: unknown;
      if (r.response.state === 'loaded') {
        try {
          response = JSON.parse(r.response.body);
        } catch {
          response = r.response.body;
        }
      }
      return {
        url: r.url,
        method: r.method,
        status: r.status,
        durationMs: Math.round(r.duration),
        timestamp: new Date(r.timestamp).toISOString(),
        transport: r.transport,
        kind: r.kind ?? 'graphql',
        operations: r.operations.map((o) => ({
          name: o.operationName ?? null,
          type: o.operationType ?? null,
          query: o.query ?? null,
          variables: o.variables ?? null,
          ...(o.persistedQueryHash ? { persistedQueryHash: o.persistedQueryHash } : {}),
        })),
        requestHeaders: headersFor(r.requestHeaders, opts),
        responseHeaders: headersFor(r.responseHeaders, opts),
        response,
      };
    }),
  };
}

/** Accept a parsed HAR document and return its entries, or throw a readable error. */
export function harEntries(doc: unknown): HarEntryLike[] {
  const entries = (doc as { log?: { entries?: unknown } } | null)?.log?.entries;
  if (!Array.isArray(entries)) throw new Error('Not a HAR file: missing log.entries');
  return entries.filter(
    (e): e is HarEntryLike =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as HarEntryLike).request?.url === 'string' &&
      typeof (e as HarEntryLike).response?.status === 'number',
  );
}
