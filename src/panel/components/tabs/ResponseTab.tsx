import { useEffect, useState } from 'react';
import type { GraphQLErrorInfo, GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { analyzeView } from '../../../workers/analyzer';
import type { ResponseView } from '../../../workers/analyze-core';
import { Code } from '../LazyCode';
import { Icon } from '../Icon';
import { formatTime } from '../../utils/format';

function ErrorList({ errors, req }: { errors: GraphQLErrorInfo[]; req: GraphQLRequest }) {
  return (
    <div className="banner bad errors" role="alert">
      <div className="errors-head">
        <Icon name="error" />{' '}
        <strong>
          {errors.length} GraphQL error{errors.length > 1 ? 's' : ''}
        </strong>
      </div>
      <ol>
        {errors.map((e, i) => {
          const code =
            typeof e.extensions === 'object' && e.extensions !== null
              ? (e.extensions as { code?: unknown }).code
              : undefined;
          return (
            <li key={i}>
              <span className="err-msg">{e.message}</span>
              {typeof code === 'string' && <code className="err-code">{code}</code>}
              {e.path && <span className="err-meta">path: {e.path.join('.')}</span>}
              {e.locations && (
                <span className="err-meta">
                  at {e.locations.map((l) => `${l.line}:${l.column}`).join(', ')}
                </span>
              )}
              {req.isBatch && e.operationIndex !== undefined && (
                <span className="err-meta">
                  in #{e.operationIndex + 1} {req.operations[e.operationIndex]?.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ResponseTab({
  req,
  settings,
  onRaw,
}: {
  req: GraphQLRequest;
  settings: Settings;
  onRaw: () => void;
}) {
  const [view, setView] = useState<ResponseView | null>(null);
  const r = req.response;
  const body = r.state === 'loaded' ? r.body : null;

  useEffect(() => {
    if (body === null || r.state !== 'loaded' || r.truncated) return;
    let live = true;
    void analyzeView(body, req.mimeType).then((v) => live && setView(v));
    return () => {
      live = false;
    };
  }, [body, req.mimeType, r]);

  if (r.state === 'pending') return <p className="muted pad">Loading response…</p>;
  if (r.state === 'failed') return <div className="banner bad">{r.message}</div>;
  if (r.truncated)
    return (
      <>
        <div className="banner warn">{r.summary.parseError}</div>
        <Code value={r.body} language="text" label="Response (truncated)" />
      </>
    );
  if (r.summary.kind === 'empty')
    return <p className="muted pad">The server returned an empty body (HTTP {req.status}).</p>;
  if (!view) return <p className="muted pad">Formatting response…</p>;

  const events = req.events;
  return (
    <div className="response">
      {view.errors.length > 0 && req.kind !== 'rest' && <ErrorList errors={view.errors} req={req} />}
      {view.parseError && (
        <div className="banner warn">
          <strong>Unable to parse response.</strong> {view.parseError}.{' '}
          <button className="link" onClick={onRaw}>
            Show raw response
          </button>
        </div>
      )}
      {view.parts.length === 1 ? (
        <Code
          value={settings.prettyPrint || !view.parts[0]!.isJSON ? view.parts[0]!.text : r.body}
          language={view.parts[0]!.isJSON ? 'json' : 'text'}
          label="Response"
        />
      ) : (
        <div className="batch-list">
          <p className="muted stream-note">
            {view.kind === 'multipart'
              ? `Incremental delivery: initial payload plus ${view.parts.length - 1} deferred payload(s).`
              : view.kind === 'sse' || req.transport === 'websocket'
                ? `${view.parts.length} event(s) received${req.transport === 'websocket' ? ' on the WebSocket' : ''}.`
                : `Batched response with ${view.parts.length} results.`}
          </p>
          {view.parts.map((p, i) => (
            <details key={i} open={view.parts.length <= 6 || i < 3} className="batch-item">
              <summary>
                <strong>
                  {req.isBatch && view.kind === 'json'
                    ? `#${i + 1} ${req.operations[i]?.name ?? p.label}`
                    : p.label}
                </strong>
                {events?.[i] && <span className="muted">{formatTime(events[i].time)}</span>}
              </summary>
              <Code value={p.text} language={p.isJSON ? 'json' : 'text'} label={p.label} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

export function RawTab({ req }: { req: GraphQLRequest }) {
  const r = req.response;
  if (r.state === 'pending') return <p className="muted pad">Loading response…</p>;
  if (r.state === 'failed') return <div className="banner bad">{r.message}</div>;
  return (
    <div className="response">
      <Code value={r.body} language="text" label="Raw response" />
      {req.requestBody !== undefined && (
        <Code value={req.requestBody} language="text" label="Raw request body" />
      )}
    </div>
  );
}
