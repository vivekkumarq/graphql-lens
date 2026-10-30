import type { GraphQLOperation, GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { prettyJSON } from '../../../graphql/formatter';
import { Code } from '../LazyCode';
import { TypeBadge } from '../Badges';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Declared variables next to what was actually sent, flagging missing required ones. */
function Declared({ op }: { op: GraphQLOperation }) {
  const defs = op.structure?.variableDefinitions ?? [];
  if (!defs.length) return null;
  const sent = isObject(op.variables) ? op.variables : {};
  return (
    <table className="kv-table vars-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Type</th>
          <th>Default</th>
          <th>Sent value</th>
        </tr>
      </thead>
      <tbody>
        {defs.map((d) => {
          const has = d.name in sent;
          const missing = !has && d.type.endsWith('!') && d.defaultValue === undefined;
          return (
            <tr key={d.name} className={missing ? 'missing' : ''}>
              <td className="mono">${d.name}</td>
              <td className="mono">{d.type}</td>
              <td className="mono">{d.defaultValue ?? '—'}</td>
              <td className="mono">
                {has ? JSON.stringify(sent[d.name]) : missing ? '⚠ missing (required)' : 'not sent'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OperationVariables({ op, settings }: { op: GraphQLOperation; settings: Settings }) {
  if (op.variables === undefined && !op.structure?.variableDefinitions.length)
    return <p className="muted pad">This operation sent no variables.</p>;
  return (
    <div className="op-view">
      <Declared op={op} />
      {op.variables !== undefined && (
        <Code
          value={settings.prettyPrint ? prettyJSON(op.variables) : JSON.stringify(op.variables)}
          language="json"
          label="Variables"
        />
      )}
    </div>
  );
}

export function VariablesTab({ req, settings }: { req: GraphQLRequest; settings: Settings }) {
  if (!req.isBatch) return <OperationVariables op={req.operations[0]!} settings={settings} />;
  return (
    <div className="batch-list">
      {req.operations.map((op) => (
        <details key={op.index} open className="batch-item">
          <summary>
            <TypeBadge type={op.operationType} />
            <span className="batch-index">#{op.index + 1}</span>
            <strong>{op.name}</strong>
          </summary>
          <OperationVariables op={op} settings={settings} />
        </details>
      ))}
    </div>
  );
}
