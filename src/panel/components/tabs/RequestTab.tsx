import type { GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { prettyMaybeJSON } from '../../../graphql/formatter';
import { Code } from '../LazyCode';
import { CopyButton } from '../CopyButton';

/** What a REST call sent: its query-string parameters and body, boxed like a GraphQL query and its variables. */
export function RequestTab({ req, settings }: { req: GraphQLRequest; settings: Settings }) {
  let params: [string, string][] = [];
  try {
    params = [...new URL(req.url).searchParams];
  } catch {
    /* not a parseable URL */
  }
  const body = req.requestBody;
  return (
    <div className="response">
      {params.length > 0 && (
        <div className="code-view">
          <div className="code-toolbar">
            <span className="code-label">Query parameters ({params.length})</span>
            <span className="spacer" />
            <CopyButton
              label="Copy query parameters"
              text={() => params.map(([k, v]) => `${k}: ${v}`).join('\n')}
            />
          </div>
          <table className="kv-table params-table">
            <tbody>
              {params.map(([k, v], i) => (
                <tr key={`${k}-${i}`}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {body ? (
        <Code
          value={settings.prettyPrint ? prettyMaybeJSON(body) : body}
          language={/^\s*[[{]/.test(body) ? 'json' : 'text'}
          label="Request body"
        />
      ) : (
        <p className="muted pad">
          {params.length ? 'No request body' : 'No query parameters and no request body'} ({req.method}).
        </p>
      )}
    </div>
  );
}
