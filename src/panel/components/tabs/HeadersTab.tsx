import { useState } from 'react';
import type { GraphQLRequest, Header } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { isSensitiveHeader } from '../../../network/headers';
import { Icon } from '../Icon';
import { CopyButton } from '../CopyButton';

function HeaderTable({ title, headers, reveal }: { title: string; headers: Header[]; reveal: boolean }) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const sorted = [...headers].sort((a, b) => a.name.localeCompare(b.name));
  const text = (h: Header) =>
    reveal || shown.has(h.name) || !isSensitiveHeader(h.name) ? h.value : '••••••••';
  return (
    <section className="kv">
      <h3>
        {title} <span className="muted">({headers.length})</span>
        <span className="spacer" />
        <CopyButton
          label={`Copy ${title.toLowerCase()}`}
          text={() =>
            sorted
              .map((h) => `${h.name}: ${isSensitiveHeader(h.name) && !reveal ? '[redacted]' : h.value}`)
              .join('\n')
          }
        />
      </h3>
      {headers.length === 0 ? (
        <p className="muted">None captured.</p>
      ) : (
        <table className="kv-table">
          <tbody>
            {sorted.map((h, i) => {
              const sensitive = isSensitiveHeader(h.name);
              const visible = reveal || shown.has(h.name);
              return (
                <tr key={`${h.name}-${i}`}>
                  <th scope="row">{h.name}</th>
                  <td className={`mono ${sensitive && !visible ? 'masked' : ''}`}>
                    {text(h)}
                    {sensitive && !reveal && (
                      <button
                        className="icon-btn inline"
                        aria-label={visible ? `Hide ${h.name}` : `Reveal ${h.name}`}
                        title={visible ? 'Hide value' : 'Reveal value'}
                        onClick={() => {
                          const next = new Set(shown);
                          if (visible) next.delete(h.name);
                          else next.add(h.name);
                          setShown(next);
                        }}
                      >
                        <Icon name={visible ? 'eyeOff' : 'eye'} size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function HeadersTab({ req, settings }: { req: GraphQLRequest; settings: Settings }) {
  const reveal = settings.showSensitiveHeaders;
  const general: Header[] = [
    { name: 'Request URL', value: req.url },
    { name: 'Request method', value: req.method },
    { name: 'Status code', value: `${req.status} ${req.statusText}`.trim() },
    ...(req.httpVersion ? [{ name: 'Protocol', value: req.httpVersion }] : []),
    ...(req.mimeType ? [{ name: 'Content type', value: req.mimeType }] : []),
    ...(req.wsProtocol ? [{ name: 'Subprotocol', value: req.wsProtocol }] : []),
  ];
  return (
    <div className="headers">
      {!reveal && (
        <p className="muted small">
          <Icon name="eyeOff" size={12} /> Credentials (Authorization, Cookie, API keys, tokens) are masked.
          Reveal one with the eye button, or turn masking off in Settings.
        </p>
      )}
      <section className="kv">
        <h3>General</h3>
        <table className="kv-table">
          <tbody>
            {general.map((h) => (
              <tr key={h.name}>
                <th scope="row">{h.name}</th>
                <td className="mono">{h.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <HeaderTable title="Request headers" headers={req.requestHeaders} reveal={reveal} />
      <HeaderTable title="Response headers" headers={req.responseHeaders} reveal={reveal} />
    </div>
  );
}
