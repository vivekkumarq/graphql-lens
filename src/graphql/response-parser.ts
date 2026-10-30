import type { GraphQLErrorInfo, ParsedResponse, ResponsePart, ResponseSummary } from '../types/graphql';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function toErrorInfo(e: unknown, operationIndex?: number): GraphQLErrorInfo {
  if (!isObject(e)) return { message: typeof e === 'string' ? e : JSON.stringify(e), operationIndex };
  const path = Array.isArray(e.path)
    ? e.path.filter((p) => typeof p === 'string' || typeof p === 'number')
    : undefined;
  const locations = Array.isArray(e.locations)
    ? e.locations.filter(
        (l): l is { line: number; column: number } =>
          isObject(l) && typeof l.line === 'number' && typeof l.column === 'number',
      )
    : undefined;
  return {
    message: typeof e.message === 'string' ? e.message : JSON.stringify(e),
    ...(path?.length ? { path } : {}),
    ...(locations?.length ? { locations } : {}),
    ...(e.extensions !== undefined ? { extensions: e.extensions } : {}),
    ...(operationIndex !== undefined ? { operationIndex } : {}),
  };
}

/** GraphQL errors in a payload, including incremental (@defer/@stream) and websocket `error` arrays. */
export function extractErrors(payload: unknown, operationIndex?: number): GraphQLErrorInfo[] {
  if (Array.isArray(payload)) return payload.map((e) => toErrorInfo(e, operationIndex));
  if (!isObject(payload)) return [];
  const out: GraphQLErrorInfo[] = [];
  if (Array.isArray(payload.errors)) out.push(...payload.errors.map((e) => toErrorInfo(e, operationIndex)));
  if (Array.isArray(payload.incremental))
    for (const inc of payload.incremental) out.push(...extractErrors(inc, operationIndex));
  return out;
}

function jsonPart(label: string, raw: string): ResponsePart {
  try {
    return { label, raw, value: JSON.parse(raw) };
  } catch {
    return { label, raw };
  }
}

export function boundaryOf(contentType: string): string | undefined {
  return contentType.match(/boundary="?([^";]+)"?/i)?.[1];
}

/** multipart/mixed incremental delivery (@defer / @stream). */
export function parseMultipart(body: string, boundary?: string): ResponsePart[] {
  const b = boundary ?? body.match(/^\s*--([^\r\n]+)/)?.[1];
  if (!b) return [];
  const parts: ResponsePart[] = [];
  for (const chunk of body.split(`--${b}`)) {
    if (chunk.trim() === '' || chunk.trim() === '--') continue;
    // headers and body are separated by the first blank line; a part without headers is all body
    const sep = chunk.search(/\r?\n\r?\n/);
    const content = (sep >= 0 && /^\s*[\w-]+:/.test(chunk) ? chunk.slice(sep) : chunk).trim();
    if (!content || content === '--') continue;
    parts.push(
      jsonPart(parts.length === 0 ? 'Initial response' : `Deferred response #${parts.length}`, content),
    );
  }
  return parts;
}

/** text/event-stream (GraphQL over SSE). */
export function parseSSE(body: string): ResponsePart[] {
  const parts: ResponsePart[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    let event = '';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length && !event) continue;
    parts.push(jsonPart(`Event ${parts.length + 1}${event ? ` · ${event}` : ''}`, data.join('\n')));
  }
  return parts;
}

/** Parse a response body of any GraphQL transport. Never throws. */
export function parseResponse(body: string, contentType = ''): ParsedResponse {
  if (!body.trim()) return { kind: 'empty', parts: [], errors: [] };
  const ct = contentType.toLowerCase();

  if (ct.includes('multipart/mixed') || (!ct.includes('json') && /^\s*--\S+\r?\n/.test(body))) {
    const parts = parseMultipart(body, boundaryOf(contentType));
    if (parts.length)
      return { kind: 'multipart', parts, errors: parts.flatMap((p) => extractErrors(p.value)) };
  }

  if (ct.includes('text/event-stream') || /^(?:event|data):/.test(body)) {
    const parts = parseSSE(body);
    if (parts.length) return { kind: 'sse', parts, errors: parts.flatMap((p) => extractErrors(p.value)) };
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return {
      kind: 'text',
      parts: [{ label: 'Response', raw: body }],
      errors: [],
      parseError: 'Response is not valid JSON',
    };
  }
  if (Array.isArray(value) && value.every(isObject)) {
    // batched response: element i answers operation i
    return {
      kind: 'json',
      parts: value.map((v, i) => ({ label: `Operation ${i + 1}`, raw: JSON.stringify(v), value: v })),
      errors: value.flatMap((v, i) => extractErrors(v, i)),
    };
  }
  return { kind: 'json', parts: [{ label: 'Response', raw: body, value }], errors: extractErrors(value) };
}

export function summarize(parsed: ParsedResponse): ResponseSummary {
  return {
    kind: parsed.kind,
    errorCount: parsed.errors.length,
    ...(parsed.errors[0] ? { firstError: parsed.errors[0].message } : {}),
    partCount: parsed.parts.length,
    ...(parsed.parseError ? { parseError: parsed.parseError } : {}),
  };
}
