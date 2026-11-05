import { memo, useId, useRef, useState } from 'react';
import type { GraphQLRequest } from '../../types/graphql';
import type { Settings } from '../../storage/settings';
import { hasCredentials, toCurl, toFetch } from '../../export/curl';
import { prettyJSON } from '../../graphql/formatter';
import { authToken } from '../../network/headers';
import { copyText } from '../utils/clipboard';
import { formatBytes, formatDuration, formatTime } from '../utils/format';
import { StatusBadge, TypeBadge } from './Badges';
import { Icon } from './Icon';
import { QueryTab } from './tabs/QueryTab';
import { VariablesTab } from './tabs/VariablesTab';
import { RawTab, ResponseTab } from './tabs/ResponseTab';
import { HeadersTab } from './tabs/HeadersTab';
import { TimingTab } from './tabs/TimingTab';
import { ReplayTab } from './tabs/ReplayTab';
import { RequestTab } from './tabs/RequestTab';
import { BothTab } from './tabs/BothTab';
import { EventStreamTab } from './tabs/EventStreamTab';
import { ErrorBoundary } from './ErrorBoundary';

export type TabId =
  | 'query'
  | 'variables'
  | 'request'
  | 'both'
  | 'response'
  | 'raw'
  | 'headers'
  | 'timing'
  | 'replay'
  | 'events';

type Tab = { id: TabId; label: string };
const BOTH: Tab = { id: 'both', label: 'Request + Response' };
const COMMON: Tab[] = [
  { id: 'response', label: 'Response' },
  { id: 'raw', label: 'Raw' },
  { id: 'headers', label: 'Headers' },
  { id: 'timing', label: 'Timing' },
  { id: 'replay', label: 'Replay' },
];
const TABS: Record<'graphql' | 'rest' | 'ws', Tab[]> = {
  graphql: [{ id: 'query', label: 'Query' }, { id: 'variables', label: 'Variables' }, BOTH, ...COMMON],
  rest: [{ id: 'request', label: 'Request' }, BOTH, ...COMMON],
  ws: [
    { id: 'events', label: 'Event stream' },
    { id: 'headers', label: 'Headers' },
    { id: 'timing', label: 'Timing' },
  ],
};

type CopyWhat =
  | 'query'
  | 'variables'
  | 'both'
  | 'body'
  | 'response'
  | 'messages'
  | 'curl'
  | 'curl-auth'
  | 'fetch'
  | 'token'
  | 'name'
  | 'url';

interface Props {
  req: GraphQLRequest;
  settings: Settings;
  tab: TabId;
  onTab: (t: TabId) => void;
  onClose: () => void;
  confirm: (message: string) => Promise<boolean>;
  onExport: () => void;
}

/** Memoised: re-renders only when the shown request, tab or settings change, not on every new row. */
export const RequestDetails = memo(function RequestDetails({
  req,
  settings,
  tab: wanted,
  onTab,
  onClose,
  confirm,
  onExport,
}: Props) {
  const op = req.operations[0];
  const kind = req.kind ?? 'graphql';
  const tabs = TABS[kind];
  // Query, Request and Event stream share the first slot, so switching rows keeps your place.
  const tab: TabId = tabs.some((t) => t.id === wanted) ? wanted : tabs[0]!.id;
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [tabsId] = useState(() => `tabs-${Math.random().toString(36).slice(2)}`);
  const errorCount = req.response.state === 'loaded' && !req.kind ? req.response.summary.errorCount : 0;
  const token = authToken(req.requestHeaders);

  const copy = async (what: CopyWhat) => {
    menu.current?.hidePopover();
    const ops = req.operations;
    switch (what) {
      case 'query':
        return copyText(ops.map((o) => o.query ?? '').join('\n\n'), 'Query copied');
      case 'variables':
        return copyText(
          ops.length === 1
            ? prettyJSON(ops[0]?.variables ?? {})
            : prettyJSON(ops.map((o) => o.variables ?? null)),
          'Variables copied',
        );
      case 'both': {
        const one = (o: (typeof ops)[number]) => ({ query: o.query ?? '', variables: o.variables ?? {} });
        return copyText(
          prettyJSON(ops.length === 1 ? one(ops[0]!) : ops.map(one)),
          'Query + variables copied',
        );
      }
      case 'body':
        return copyText(req.requestBody ?? '', 'Request body copied');
      case 'response':
        return copyText(req.response.state === 'loaded' ? req.response.body : '', 'Response copied');
      case 'messages':
        return copyText(
          prettyJSON(
            (req.frames ?? []).map((f) => ({
              type: f.type === 'send' ? 'sent' : 'received',
              time: new Date(f.time * 1000).toISOString(),
              data: f.data,
            })),
          ),
          'Messages copied',
        );
      case 'curl':
        return copyText(toCurl(req, { includeCredentials: false }), 'cURL copied (credentials redacted)');
      case 'curl-auth':
        if (
          await confirm(
            'This cURL command will contain the Authorization, Cookie and API-key headers of this request in clear text. Anyone with the command can act as you. Copy it?',
          )
        )
          return copyText(toCurl(req, { includeCredentials: true }), 'cURL with credentials copied');
        return;
      case 'fetch':
        return copyText(toFetch(req, { includeCredentials: false }), 'fetch() copied (credentials redacted)');
      case 'token':
        return copyText(token ?? '', 'Authorization token copied');
      case 'name':
        return copyText(ops.map((o) => o.name).join(', '), 'Operation name copied');
      case 'url':
        return copyText(req.url, 'URL copied');
    }
  };

  const item = (what: CopyWhat, label: string, disabled = false, title?: string) => (
    <button role="menuitem" onClick={() => copy(what)} disabled={disabled} title={title}>
      {label}
    </button>
  );

  return (
    <section className="details" aria-label="Request details">
      <div className="details-head">
        <div className="details-title">
          <TypeBadge type={op?.operationType} persisted={!!op?.persistedQueryHash} kind={req.kind} />
          <h2 title={op?.name}>{req.isBatch ? `Batch of ${req.operations.length} operations` : op?.name}</h2>
          <span className="op-type">
            {kind === 'rest'
              ? 'REST'
              : kind === 'ws'
                ? 'WEBSOCKET'
                : req.isBatch
                  ? 'BATCH'
                  : (op?.operationType ?? 'unknown').toUpperCase()}
          </span>
          <span className="spacer" />
          <button
            className="btn"
            title="Edit and resend this request from the page"
            onClick={() => onTab('replay')}
            disabled={req.transport === 'websocket'}
          >
            <Icon name="play" /> <span className="btn-label">Replay</span>
          </button>
          <button className="btn copy-btn" popoverTarget={menuId}>
            <Icon name="copy" /> <span className="btn-label">Copy</span> <Icon name="chevron" size={10} />
          </button>
          <div className="menu" id={menuId} popover="auto" ref={menu} role="menu">
            {kind === 'graphql' && (
              <>
                {item('query', 'Copy query')}
                {item('variables', 'Copy variables')}
                {item('both', 'Copy query + variables')}
              </>
            )}
            {kind === 'rest' && item('body', 'Copy request body', !req.requestBody)}
            {kind === 'ws'
              ? item('messages', 'Copy all messages', !req.frames?.length)
              : item('response', 'Copy response', req.response.state !== 'loaded')}
            <hr />
            {kind !== 'ws' && (
              <>
                {item('curl', 'Copy as cURL')}
                {item('curl-auth', 'Copy as cURL with credentials…', !hasCredentials(req))}
                {item('fetch', 'Copy as fetch()')}
                <hr />
              </>
            )}
            {item(
              'token',
              'Copy authorization token',
              !token,
              token
                ? 'The Authorization header value without its scheme (no "Bearer ")'
                : 'This request has no Authorization header',
            )}
            {kind === 'graphql' && item('name', 'Copy operation name')}
            {item('url', 'Copy URL')}
            <hr />
            <button role="menuitem" onClick={() => (menu.current?.hidePopover(), onExport())}>
              Export…
            </button>
          </div>
          <button
            className="icon-btn"
            title="Close details (Esc)"
            aria-label="Close details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="details-meta">
          <StatusBadge req={req} />
          <span>{formatDuration(req.duration)}</span>
          <span>{formatBytes(req.size)}</span>
          <span title={new Date(req.timestamp).toString()}>{formatTime(req.timestamp)}</span>
          {req.httpVersion && <span>{req.httpVersion.toUpperCase()}</span>}
          {req.transport !== 'http' && (
            <span className="pill">
              {req.transport === 'websocket'
                ? `WebSocket${req.wsProtocol ? ` · ${req.wsProtocol}` : ''}`
                : req.transport === 'sse'
                  ? 'Server-sent events'
                  : 'Incremental (@defer/@stream)'}
            </span>
          )}
        </div>
        <div className="details-url" title={req.url}>
          <b>{req.method}</b> {req.url}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Request detail tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${tabsId}-${t.id}`}
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {(t.id === 'response' || t.id === 'both') && errorCount > 0 && (
              <span className="tab-err" aria-label={`${errorCount} errors`}>
                {errorCount}
              </span>
            )}
            {t.id === 'query' && req.operations.some((o) => o.parseError) && (
              <span className="tab-err" aria-label="parse error">
                !
              </span>
            )}
            {t.id === 'events' && <span className="tab-count">{req.frames?.length ?? 0}</span>}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel" aria-labelledby={`${tabsId}-${tab}`}>
        <ErrorBoundary
          key={`${req.id}-${tab}`}
          body={req.response.state === 'loaded' ? req.response.body : undefined}
        >
          {tab === 'request' && <RequestTab req={req} settings={settings} />}
          {tab === 'query' && <QueryTab req={req} settings={settings} />}
          {tab === 'variables' && <VariablesTab req={req} settings={settings} />}
          {tab === 'both' && <BothTab req={req} settings={settings} onRaw={() => onTab('raw')} />}
          {tab === 'response' && <ResponseTab req={req} settings={settings} onRaw={() => onTab('raw')} />}
          {tab === 'raw' && <RawTab req={req} />}
          {tab === 'headers' && <HeadersTab req={req} settings={settings} />}
          {tab === 'timing' && <TimingTab req={req} />}
          {tab === 'replay' && <ReplayTab req={req} key={req.id} />}
          {tab === 'events' && <EventStreamTab req={req} />}
        </ErrorBoundary>
      </div>
    </section>
  );
});
