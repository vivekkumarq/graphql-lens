import type { Header } from '../types/graphql';

export const headerValue = (headers: Header[] | undefined, name: string): string | undefined =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

const SENSITIVE_EXACT = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-csrf-token',
  'x-xsrf-token',
]);
const SENSITIVE_PATTERN = /token|secret|password|passwd|session|api[-_]?key|auth/i;

export const isSensitiveHeader = (name: string): boolean =>
  SENSITIVE_EXACT.has(name.toLowerCase()) || SENSITIVE_PATTERN.test(name);

export const REDACTED = '[redacted]';

export const redactHeaders = (headers: Header[]): Header[] =>
  headers.map((h) => (isSensitiveHeader(h.name) ? { name: h.name, value: REDACTED } : h));

/** HTTP/2 pseudo headers and values the browser computes itself; never useful to copy or replay. */
export const isTransportHeader = (name: string): boolean =>
  name.startsWith(':') ||
  ['host', 'content-length', 'connection', 'accept-encoding', 'keep-alive', 'transfer-encoding'].includes(
    name.toLowerCase(),
  );
