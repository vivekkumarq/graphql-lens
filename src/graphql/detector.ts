import type { Header } from '../types/graphql';
import { headerValue } from '../network/headers';

/** One operation as the client sent it, before parsing. */
export interface RawOperation {
  query?: string;
  operationName?: string;
  variables?: unknown;
  extensions?: unknown;
  malformed?: string; // set for batch items that are not valid operations
}

export interface HarRequestLike {
  method: string;
  url: string;
  headers: Header[];
  postData?: { mimeType?: string; text?: string; params?: { name: string; value?: string }[] };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// GraphQL "ignored tokens" (whitespace, commas, comments; JS \s also covers the BOM) may precede the first definition.
const LEADING_IGNORED = /^(?:[\s,]|#[^\n\r]*)*/;

/** True when a string is plausibly a GraphQL document. Deliberately strict so search boxes ("query": "shoes") don't match. */
export function looksLikeGraphQL(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = s.replace(LEADING_IGNORED, '');
  if (t.startsWith('{')) return /^\{\s*(?:[_A-Za-z]|\.\.\.)/.test(t);
  return /^(?:query|mutation|subscription|fragment)\b/.test(t);
}

export const hasPersistedQuery = (ext: unknown): boolean => isObject(ext) && isObject(ext.persistedQuery);

function tryJSON(s: string | null | undefined): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return s; // keep the raw string so nothing the client sent is lost
  }
}

function fromObject(o: unknown): RawOperation | null {
  if (!isObject(o)) return null;
  const { query, operationName, variables, extensions } = o;
  const named = typeof operationName === 'string' ? operationName : undefined;
  const isGraphQL =
    looksLikeGraphQL(query) ||
    hasPersistedQuery(extensions) ||
    // a broken document still counts when the client also sent GraphQL's operationName
    (typeof query === 'string' && named !== undefined);
  if (!isGraphQL) return null;
  return {
    query: typeof query === 'string' ? query : undefined,
    operationName: named,
    variables: typeof variables === 'string' ? tryJSON(variables) : variables,
    extensions,
  };
}

/** A JSON body: one operation object, or an array of them (batching). */
export function fromJSONBody(body: unknown): RawOperation[] | null {
  if (Array.isArray(body)) {
    const ops = body.map(fromObject);
    if (!ops.some(Boolean)) return null;
    return ops.map((op) => op ?? { malformed: 'Batch item is not a GraphQL operation' });
  }
  const op = fromObject(body);
  return op ? [op] : null;
}

function fromParams(p: URLSearchParams): RawOperation[] | null {
  const query = p.get('query');
  const extensions = tryJSON(p.get('extensions'));
  if (!looksLikeGraphQL(query) && !hasPersistedQuery(extensions)) return null;
  return [
    {
      query: query ?? undefined,
      operationName: p.get('operationName') ?? undefined,
      variables: tryJSON(p.get('variables')),
      extensions,
    },
  ];
}

function multipartOperations(postData: NonNullable<HarRequestLike['postData']>): string | undefined {
  const param = postData.params?.find((p) => p.name === 'operations')?.value;
  if (param) return param;
  // graphql-multipart-request-spec: the JSON lives in the "operations" form field
  return postData.text?.match(/name="operations"\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n--/)?.[1];
}

/**
 * Decide whether an HTTP request carries GraphQL, looking at the payload rather than the URL.
 * Returns the raw operations (several for a batch) or null.
 */
export function detectGraphQL(req: HarRequestLike): RawOperation[] | null {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }
  const text = req.postData?.text;
  const contentType = (
    headerValue(req.headers, 'content-type') ??
    req.postData?.mimeType ??
    ''
  ).toLowerCase();

  if (!text) return fromParams(url.searchParams); // GET, or a body-less POST with URL params

  if (/application\/graphql(?!\S*json)/.test(contentType))
    return looksLikeGraphQL(text) ? [{ query: text }] : null;

  if (contentType.includes('multipart/form-data')) {
    const ops = multipartOperations(req.postData!);
    return ops ? fromJSONBody(tryJSON(ops)) : null;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) return fromParams(new URLSearchParams(text));

  // Most clients send application/json, some text/plain; trust the shape, not the header.
  try {
    return fromJSONBody(JSON.parse(text));
  } catch {
    return null;
  }
}
