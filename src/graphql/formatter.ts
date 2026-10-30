import { parse, print } from 'graphql';

/** Canonical formatting via the reference printer. Comments are dropped by the printer, so callers keep the original too. */
export function formatQuery(query: string): string {
  try {
    return print(parse(query));
  } catch {
    return query;
  }
}

export function prettyJSON(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Pretty-print a string that may or may not be JSON. */
export function prettyMaybeJSON(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
