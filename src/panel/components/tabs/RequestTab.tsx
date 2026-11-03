import type { GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { prettyMaybeJSON } from '../../../graphql/formatter';
import { Code } from '../LazyCode';

/** What a REST call sent: its query-string parameters and its body. */
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
      <section className="kv">
        <h3>
          Query parameters <span className="muted">({params.length})</span>
        </h3>
        {params.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <table className="kv-table">
            <tbody>
              {params.map(([k, v], i) => (
                <tr key={`${k}-${i}`}>
                  <th scope="row">{k}</th>
                  <td className="mono">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {body ? (
        <Code
          value={settings.prettyPrint ? prettyMaybeJSON(body) : body}
          language={/^\s*[[{]/.test(body) ? 'json' : 'text'}
          label="Request body"
        />
      ) : (
        <p className="muted pad">No request body ({req.method}).</p>
      )}
    </div>
  );
}
