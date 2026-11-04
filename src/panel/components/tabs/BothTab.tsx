import type { GraphQLRequest } from '../../../types/graphql';
import type { Settings } from '../../../storage/settings';
import { formatQuery, prettyMaybeJSON } from '../../../graphql/formatter';
import { Code } from '../LazyCode';
import { SentVariables } from './QueryTab';
import { RequestTab } from './RequestTab';
import { ResponseTab } from './ResponseTab';

function SentRequest({ req, settings }: { req: GraphQLRequest; settings: Settings }) {
  if (req.kind === 'rest') return <RequestTab req={req} settings={settings} />;
  const op = req.operations[0];
  if (req.isBatch || !op)
    return <Code value={prettyMaybeJSON(req.requestBody ?? '')} language="json" label="Request body" />;
  return (
    <>
      {op.query === undefined ? (
        <p className="muted">Persisted query: only its hash was sent.</p>
      ) : (
        <Code
          value={settings.formatQueries ? formatQuery(op.query) : op.query}
          language="graphql"
          label="Query"
        />
      )}
      <SentVariables op={op} settings={settings} />
    </>
  );
}

/** What was sent and what came back, side by side (stacked when the pane is narrow). */
export function BothTab({
  req,
  settings,
  onRaw,
}: {
  req: GraphQLRequest;
  settings: Settings;
  onRaw: () => void;
}) {
  return (
    <div className="split2">
      <section aria-label="Request">
        <h3 className="split-head">Request</h3>
        <SentRequest req={req} settings={settings} />
      </section>
      <section aria-label="Response">
        <h3 className="split-head">Response</h3>
        <ResponseTab req={req} settings={settings} onRaw={onRaw} />
      </section>
    </div>
  );
}
