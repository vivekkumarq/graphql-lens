import type { GraphQLRequest, Header } from '../types/graphql';
import { isSensitiveHeader, isTransportHeader, REDACTED } from '../network/headers';

export interface SnippetOptions {
  includeCredentials: boolean;
}

/** POSIX shell single-quoting: close, escaped quote, reopen. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

function copyableHeaders(headers: Header[], { includeCredentials }: SnippetOptions): Header[] {
  return headers
    .filter((h) => !isTransportHeader(h.name))
    .map((h) => (!includeCredentials && isSensitiveHeader(h.name) ? { name: h.name, value: REDACTED } : h));
}

export const hasCredentials = (req: GraphQLRequest): boolean =>
  req.requestHeaders.some((h) => isSensitiveHeader(h.name));

export function toCurl(req: GraphQLRequest, opts: SnippetOptions): string {
  const lines = [`curl ${shellQuote(req.url)}`];
  if (req.method !== 'GET' && !(req.method === 'POST' && req.requestBody)) lines.push(`-X ${req.method}`);
  for (const h of copyableHeaders(req.requestHeaders, opts))
    lines.push(`-H ${shellQuote(`${h.name}: ${h.value}`)}`);
  if (req.requestBody) lines.push(`--data-raw ${shellQuote(req.requestBody)}`);
  if (req.requestHeaders.some((h) => h.name.toLowerCase() === 'accept-encoding')) lines.push('--compressed');
  return lines.join(' \\\n  ');
}

export function toFetch(req: GraphQLRequest, opts: SnippetOptions): string {
  const headers = Object.fromEntries(copyableHeaders(req.requestHeaders, opts).map((h) => [h.name, h.value]));
  const init: Record<string, unknown> = { method: req.method, headers };
  if (req.requestBody) init.body = req.requestBody;
  return `await fetch(${JSON.stringify(req.url)}, ${JSON.stringify(init, null, 2)});`;
}
