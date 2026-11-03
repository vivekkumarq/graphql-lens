import { useId, useRef, useState } from 'react';
import type { GraphQLRequest } from '../../types/graphql';
import type { Settings } from '../../storage/settings';
import { hasCredentials, toCurl, toFetch } from '../../export/curl';
import { prettyJSON } from '../../graphql/formatter';
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
import { ErrorBoundary } from './ErrorBoundary';

export type TabId = 'query' | 'variables' | 'request' | 'response' | 'raw' | 'headers' | 'timing' | 'replay';

const COMMON: { id: TabId; label: string }[] = [
  { id: 'response', label: 'Response' },
  { id: 'raw', label: 'Raw' },
  { id: 'headers', label: 'Headers' },
  { id: 'timing', label: 'Timing' },
  { id: 'replay', label: 'Replay' },
];
const GQL_TABS = [
  { id: 'query', label: 'Query' } as const,
  { id: 'variables', label: 'Variables' } as const,
  ...COMMON,
];
const REST_TABS = [{ id: 'request', label: 'Request' } as const, ...COMMON];

interface Props {
  req: GraphQLRequest;
  settings: Settings;
  tab: TabId;
  onTab: (t: TabId) => void;
  onClose: () => void;
  confirm: (message: string) => Promise<boolean>;
  onExport: () => void;
}

export function RequestDetails({ req, settings, tab: wanted, onTab, onClose, confirm, onExport }: Props) {
  const op = req.operations[0];
  const rest = req.kind === 'rest';
  // Query/Variables and Request are the same "what was sent" slot, so switching rows keeps the place.
  const tab: TabId =
    rest && (wanted === 'query' || wanted === 'variables')
      ? 'request'
      : !rest && wanted === 'request'
        ? 'query'
        : wanted;
  const tabs = rest ? REST_TABS : GQL_TABS;
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [tabsId] = useState(() => `tabs-${Math.random().toString(36).slice(2)}`);
  const errorCount = req.response.state === 'loaded' && !rest ? req.response.summary.errorCount : 0;

  const copy = async (
    what:
      'query' | 'variables' | 'both' | 'body' | 'response' | 'curl' | 'curl-auth' | 'fetch' | 'name' | 'url',
  ) => {
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
      case 'name':
        return copyText(ops.map((o) => o.name).join(', '), 'Operation name copied');
      case 'url':
        return copyText(req.url, 'URL copied');
    }
  };

  return (
    <section className="details" aria-label="Request details">
      <div className="details-head">
        <div className="details-title">
          <TypeBadge
            type={op?.operationType}
            persisted={!!op?.persistedQueryHash}
            rest={req.kind === 'rest'}
          />
          <h2 title={op?.name}>{req.isBatch ? `Batch of ${req.operations.length} operations` : op?.name}</h2>
          <span className="op-type">
            {rest ? 'REST' : req.isBatch ? 'BATCH' : (op?.operationType ?? 'unknown').toUpperCase()}
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
            {rest ? (
              <button role="menuitem" onClick={() => copy('body')} disabled={!req.requestBody}>
                Copy request body
              </button>
            ) : (
              <>
                <button role="menuitem" onClick={() => copy('query')}>
                  Copy query
                </button>
                <button role="menuitem" onClick={() => copy('variables')}>
                  Copy variables
                </button>
                <button role="menuitem" onClick={() => copy('both')}>
                  Copy query + variables
                </button>
              </>
            )}
            <button
              role="menuitem"
              onClick={() => copy('response')}
              disabled={req.response.state !== 'loaded'}
            >
              Copy response
            </button>
            <hr />
            <button role="menuitem" onClick={() => copy('curl')}>
              Copy as cURL
            </button>
            <button role="menuitem" onClick={() => copy('curl-auth')} disabled={!hasCredentials(req)}>
              Copy as cURL with credentials…
            </button>
            <button role="menuitem" onClick={() => copy('fetch')}>
              Copy as fetch()
            </button>
            <hr />
            {!rest && (
              <button role="menuitem" onClick={() => copy('name')}>
                Copy operation name
              </button>
            )}
            <button role="menuitem" onClick={() => copy('url')}>
              Copy URL
            </button>
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
                ? `WebSocket · ${req.wsProtocol}`
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
            {t.id === 'response' && errorCount > 0 && (
              <span className="tab-err" aria-label={`${errorCount} errors`}>
                {errorCount}
              </span>
            )}
            {t.id === 'query' && req.operations.some((o) => o.parseError) && (
              <span className="tab-err" aria-label="parse error">
                !
              </span>
            )}
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
          {tab === 'response' && <ResponseTab req={req} settings={settings} onRaw={() => onTab('raw')} />}
          {tab === 'raw' && <RawTab req={req} />}
          {tab === 'headers' && <HeadersTab req={req} settings={settings} />}
          {tab === 'timing' && <TimingTab req={req} />}
          {tab === 'replay' && <ReplayTab req={req} key={req.id} />}
        </ErrorBoundary>
      </div>
    </section>
  );
}
