import type { GraphQLRequest, OperationType } from '../../types/graphql';
import { statusClass } from '../../shared/http-status';
import { Icon } from './Icon';

const LETTER: Record<OperationType, string> = { query: 'Q', mutation: 'M', subscription: 'S' };

/** Q / M / S for GraphQL, P for a persisted query of unknown type, R for a REST call. */
export function TypeBadge({
  type,
  persisted,
  rest,
}: {
  type?: OperationType;
  persisted?: boolean;
  rest?: boolean;
}) {
  const label = rest ? 'rest' : (type ?? (persisted ? 'persisted' : 'unknown'));
  const title = rest ? 'REST call' : `GraphQL ${label}`;
  return (
    <span className={`type-badge t-${label}`} title={title} aria-label={title}>
      {rest ? 'R' : type ? LETTER[type] : persisted ? 'P' : '?'}
    </span>
  );
}

/** Status is always icon + text, never colour alone. */
export function StatusBadge({ req, compact = false }: { req: GraphQLRequest; compact?: boolean }) {
  const cls = statusClass(req.status);
  const gqlErrors =
    req.response.state === 'loaded' && req.kind !== 'rest' ? req.response.summary.errorCount : 0;
  const httpBad = cls === 'failed' || cls === '4xx' || cls === '5xx';
  const tone = httpBad ? 'bad' : gqlErrors ? 'warn' : req.response.state === 'pending' ? 'pending' : 'good';
  const text =
    req.status === 0 ? 'Failed' : compact ? String(req.status) : `${req.status} ${req.statusText}`.trim();
  return (
    <span
      className={`status tone-${tone}`}
      title={gqlErrors ? `${text}, ${gqlErrors} GraphQL error(s)` : text}
    >
      <Icon name={tone === 'bad' ? 'error' : tone === 'warn' ? 'alert' : 'check'} size={12} />
      <span>{text}</span>
      {!compact && gqlErrors > 0 && (
        <span className="err-count">
          {gqlErrors} GraphQL error{gqlErrors > 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}
