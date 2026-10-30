import { useMemo, useState } from 'react';
import type { GraphQLRequest, Header } from '../../../types/graphql';
import { formatQuery, prettyJSON, prettyMaybeJSON } from '../../../graphql/formatter';
import {
  replayRequest,
  replayableHeaders,
  type ReplayInput,
  type ReplayResult,
} from '../../../replay/replay-request';
import { parseResponse } from '../../../graphql/response-parser';
import { headerValue } from '../../../network/headers';
import { Code } from '../LazyCode';
import { Icon } from '../Icon';
import { formatBytes, formatDuration } from '../../utils/format';

type Mode = 'operation' | 'get' | 'raw';

function modeOf(req: GraphQLRequest): Mode {
  if (req.isBatch || req.operations[0]?.parseError === 'Batch item is not a GraphQL operation') return 'raw';
  if (req.method === 'GET') return 'get';
  const ct = headerValue(req.requestHeaders, 'content-type') ?? '';
  return ct.includes('json') || ct === '' ? 'operation' : 'raw';
}

const headersToText = (h: Header[]) => h.map((x) => `${x.name}: ${x.value}`).join('\n');
const textToHeaders = (t: string): Header[] =>
  t
    .split('\n')
    .map((l) => l.match(/^\s*([^:\s][^:]*?)\s*:\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1]!, value: m[2]! }));

export function ReplayTab({ req }: { req: GraphQLRequest }) {
  const op = req.operations[0];
  const mode = modeOf(req);
  const [url, setUrl] = useState(() => (mode === 'get' ? req.url.split('?')[0]! : req.url));
  const [query, setQuery] = useState(() => (op?.query ? formatQuery(op.query) : ''));
  const [variables, setVariables] = useState(() => prettyJSON(op?.variables ?? {}));
  const [raw, setRaw] = useState(() => prettyMaybeJSON(req.requestBody ?? ''));
  const [headers, setHeaders] = useState(() => headersToText(replayableHeaders(req.requestHeaders)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);

  const varsError = useMemo(() => {
    if (mode === 'raw') return null;
    try {
      JSON.parse(variables || '{}');
      return null;
    } catch (e) {
      return `Variables are not valid JSON: ${(e as Error).message}`;
    }
  }, [variables, mode]);

  const build = (): ReplayInput => {
    const h = textToHeaders(headers);
    if (mode === 'raw') return { url, method: req.method, headers: h, body: raw };
    const vars = JSON.parse(variables || '{}') as unknown;
    const payload: Record<string, unknown> = {
      ...(op?.operationName ? { operationName: op.operationName } : {}),
      ...(query.trim() ? { query } : {}),
      variables: vars,
      ...(op?.extensions !== undefined ? { extensions: op.extensions } : {}),
    };
    if (mode === 'get') {
      const u = new URL(url);
      for (const [k, v] of Object.entries(payload))
        u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      return { url: u.toString(), method: 'GET', headers: h };
    }
    return { url, method: req.method, headers: h, body: JSON.stringify(payload) };
  };

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await replayRequest(build()));
    } catch (e) {
      setResult({ ok: false, error: String(e), hint: 'The request could not be built.' });
    }
    setBusy(false);
  };

  if (req.transport === 'websocket')
    return (
      <p className="muted pad">
        WebSocket subscriptions cannot be replayed from here. Trigger them again from the page.
      </p>
    );

  const errors = result?.ok
    ? parseResponse(result.body, headerValue(result.headers, 'content-type')).errors.length
    : 0;

  return (
    <div className="replay">
      <p className="muted small">
        Replays run inside the inspected page with <code>fetch()</code>, so the page's cookies, CORS and CSP
        rules apply. The new request also appears in the list.
      </p>
      <div className="replay-url">
        <b className="method">{mode === 'get' ? 'GET' : req.method}</b>
        <input
          aria-label="Request URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
        />
        <button className="btn primary" onClick={send} disabled={busy || !!varsError}>
          <Icon name="play" /> {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {mode === 'raw' ? (
        <Code value={raw} onChange={setRaw} language="json" editable label="Request body" height="220px" />
      ) : (
        <div className="replay-grid">
          <Code value={query} onChange={setQuery} language="graphql" editable label="Query" height="240px" />
          <Code
            value={variables}
            onChange={setVariables}
            language="json"
            editable
            label="Variables"
            height="240px"
          />
        </div>
      )}
      {varsError && <div className="banner warn">{varsError}</div>}
      <details className="replay-headers">
        <summary>Headers ({textToHeaders(headers).length}), one "Name: value" per line</summary>
        <textarea
          aria-label="Request headers"
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          spellCheck={false}
          rows={8}
        />
      </details>
      {result && !result.ok && (
        <div className="banner bad" role="alert">
          <strong>Replay failed: {result.error}</strong>
          <p>{result.hint}</p>
        </div>
      )}
      {result?.ok && (
        <div className="replay-result">
          <div className="details-meta">
            <span className={`status tone-${result.status >= 400 ? 'bad' : errors ? 'warn' : 'good'}`}>
              <Icon name={result.status >= 400 ? 'error' : errors ? 'alert' : 'check'} size={12} />
              {result.status} {result.statusText}
            </span>
            <span>{formatDuration(result.duration)}</span>
            <span>{formatBytes(result.body.length)}</span>
            {errors > 0 && <span className="err-count">{errors} GraphQL error(s)</span>}
          </div>
          <Code value={prettyMaybeJSON(result.body)} language="json" label="Replay response" />
        </div>
      )}
    </div>
  );
}
