import type { HarEntryLike } from '../src/network/normalizer';
import type { Header } from '../src/types/graphql';

export const json = { name: 'content-type', value: 'application/json' };

export function post(
  body: unknown,
  opts: { url?: string; headers?: Header[]; raw?: boolean } = {},
): HarEntryLike {
  return entry({
    method: 'POST',
    url: opts.url ?? 'https://api.example.com/graphql',
    headers: opts.headers ?? [json],
    text: opts.raw ? String(body) : JSON.stringify(body),
  });
}

export function entry(o: {
  method?: string;
  url?: string;
  headers?: Header[];
  text?: string;
  status?: number;
  responseText?: string;
  responseType?: string;
}): HarEntryLike {
  return {
    startedDateTime: '2026-10-30T10:00:00.000Z',
    time: 143.4,
    request: {
      method: o.method ?? 'GET',
      url: o.url ?? 'https://api.example.com/graphql',
      headers: o.headers ?? [],
      ...(o.text !== undefined ? { postData: { mimeType: 'application/json', text: o.text } } : {}),
    },
    response: {
      status: o.status ?? 200,
      statusText: '',
      headers: [{ name: 'content-type', value: o.responseType ?? 'application/json' }],
      content: {
        size: o.responseText?.length ?? 0,
        mimeType: o.responseType ?? 'application/json',
        text: o.responseText,
      },
      _transferSize: 512,
    },
    timings: { blocked: 1, dns: -1, connect: -1, ssl: -1, send: 0.2, wait: 140, receive: 2.2 },
  };
}
