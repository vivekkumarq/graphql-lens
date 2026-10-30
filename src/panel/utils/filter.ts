import type { GraphQLRequest } from '../../types/graphql';
import { statusClass } from '../../shared/http-status';

export type TypeFilter = 'all' | 'query' | 'mutation' | 'subscription' | 'errors' | 'success';
export type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx';

export interface Filters {
  text: string;
  type: TypeFilter;
  status: StatusFilter;
}

export const hasErrors = (r: GraphQLRequest): boolean =>
  r.status === 0 ||
  r.status >= 400 ||
  r.response.state === 'failed' ||
  (r.response.state === 'loaded' && r.response.summary.errorCount > 0);

export const isSuccess = (r: GraphQLRequest): boolean =>
  !hasErrors(r) && (statusClass(r.status) === '2xx' || r.status === 101) && r.response.state === 'loaded';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matchesText(r: GraphQLRequest, re: RegExp): boolean {
  if (re.test(r.url)) return true;
  for (const o of r.operations) {
    if (re.test(o.name) || (o.query && re.test(o.query))) return true;
    if (o.variables !== undefined && re.test(JSON.stringify(o.variables) ?? '')) return true;
  }
  // a case-insensitive regex avoids lower-casing (copying) multi-megabyte bodies on each keystroke
  return r.response.state === 'loaded' && re.test(r.response.body);
}

/** Pure, so it's unit-tested and memoised by the list. */
export function filterRequests(requests: GraphQLRequest[], f: Filters): GraphQLRequest[] {
  const text = f.text.trim();
  const re = text ? new RegExp(escapeRegExp(text), 'i') : null;
  return requests.filter((r) => {
    if (f.status !== 'all' && statusClass(r.status) !== f.status) return false;
    switch (f.type) {
      case 'errors':
        if (!hasErrors(r)) return false;
        break;
      case 'success':
        if (!isSuccess(r)) return false;
        break;
      case 'all':
        break;
      default:
        if (!r.operations.some((o) => o.operationType === f.type)) return false;
    }
    return !re || matchesText(r, re);
  });
}
