import { useState } from 'react';
import type { GraphQLOperation, GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { formatQuery, prettyJSON } from '../../../graphql/formatter';
import { Code } from '../LazyCode';
import { TypeBadge } from '../Badges';

function Structure({ op }: { op: GraphQLOperation }) {
  const s = op.structure;
  const rows: [string, string][] = [
    ['Type', op.operationType ?? 'unknown'],
    ['Name', op.operationName ?? '(anonymous)'],
  ];
  if (s) {
    rows.push(
      ['Root fields', s.fields.join(', ') || '—'],
      ['Depth', String(s.depth)],
      ['Fields selected', String(s.fieldCount)],
      ['Variables', s.variableDefinitions.map((v) => `$${v.name}: ${v.type}`).join(', ') || '—'],
      ['Fragments', s.fragments.join(', ') || '—'],
      ['Directives', s.directives.join(', ') || '—'],
    );
    if (s.operationCount > 1) rows.push(['Operations in document', String(s.operationCount)]);
  }
  if (op.persistedQueryHash) rows.push(['Persisted query hash', op.persistedQueryHash]);
  return (
    <dl className="structure">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd title={v}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The variables sent with an operation, shown under its query. */
export function SentVariables({ op, settings }: { op: GraphQLOperation; settings: Settings }) {
  if (op.variables === undefined) return null;
  return (
    <Code
      value={settings.prettyPrint ? prettyJSON(op.variables) : JSON.stringify(op.variables)}
      language="json"
      label="Variables"
    />
  );
}

function OperationView({ op, settings }: { op: GraphQLOperation; settings: Settings }) {
  const [formatted, setFormatted] = useState(settings.formatQueries);
  const text = op.query === undefined ? '' : formatted ? formatQuery(op.query) : op.query;
  return (
    <div className="op-view">
      {op.parseError && (
        <div className="banner warn" role="status">
          <strong>Could not fully parse this operation:</strong> {op.parseError}
        </div>
      )}
      <div className="op-grid">
        <div className="op-code">
          {op.query === undefined ? (
            <div className="banner info">
              <strong>Persisted query.</strong> The client sent only a hash, so no query text is available.
              {op.extensions !== undefined && (
                <pre className="code-fallback">{prettyJSON(op.extensions)}</pre>
              )}
            </div>
          ) : (
            <>
              <div className="seg" role="radiogroup" aria-label="Query formatting">
                <button
                  role="radio"
                  aria-checked={formatted}
                  className={formatted ? 'on' : ''}
                  onClick={() => setFormatted(true)}
                >
                  Formatted
                </button>
                <button
                  role="radio"
                  aria-checked={!formatted}
                  className={!formatted ? 'on' : ''}
                  onClick={() => setFormatted(false)}
                >
                  As sent
                </button>
              </div>
              <Code value={text} language="graphql" label="Query" />
            </>
          )}
          <SentVariables op={op} settings={settings} />
        </div>
        <Structure op={op} />
      </div>
    </div>
  );
}

export function QueryTab({ req, settings }: { req: GraphQLRequest; settings: Settings }) {
  if (!req.isBatch) return <OperationView op={req.operations[0]!} settings={settings} />;
  return (
    <div className="batch-list">
      {req.operations.map((op) => (
        <details key={op.index} open={req.operations.length <= 3} className="batch-item">
          <summary>
            <TypeBadge type={op.operationType} persisted={!!op.persistedQueryHash} />
            <span className="batch-index">#{op.index + 1}</span>
            <strong>{op.name}</strong>
            {op.parseError && <span className="tab-err">!</span>}
          </summary>
          <OperationView op={op} settings={settings} />
        </details>
      ))}
    </div>
  );
}
