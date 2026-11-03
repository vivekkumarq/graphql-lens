import { describe, expect, it } from 'vitest';
import { shellQuote, toCurl, toFetch, hasCredentials } from '../src/export/curl';
import { harEntries, toHar, toJSONExport } from '../src/export/har';
import { isSensitiveHeader, redactHeaders } from '../src/network/headers';
import { normalizeEntry } from '../src/network/normalizer';
import { buildReplayScript, replayRequest, replayableHeaders } from '../src/replay/replay-request';
import { filterRequests } from '../src/panel/utils/filter';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../src/storage/settings';
import { RequestStore } from '../src/panel/store/requests-store';
import type { GraphQLRequest } from '../src/types/graphql';
import { entry, post } from './helpers';

const headers = [
  { name: ':authority', value: 'api.example.com' },
  { name: 'content-type', value: 'application/json' },
  { name: 'Authorization', value: 'Bearer secret-token' },
  { name: 'Cookie', value: 'sid=abc' },
  { name: 'x-api-key', value: 'k' },
  { name: 'accept-encoding', value: 'gzip' },
];

const req = (body: unknown, extra: Partial<GraphQLRequest> = {}): GraphQLRequest => ({
  ...normalizeEntry(post(body, { headers }), 'r1')!,
  ...extra,
});

describe('sensitive headers', () => {
  it('flags credentials', () => {
    for (const n of ['Authorization', 'cookie', 'Set-Cookie', 'X-API-Key', 'x-auth-token', 'X-Session-Id'])
      expect(isSensitiveHeader(n)).toBe(true);
    for (const n of ['content-type', 'accept', 'x-request-id']) expect(isSensitiveHeader(n)).toBe(false);
  });

  it('redacts values but keeps names', () => {
    expect(redactHeaders(headers).find((h) => h.name === 'Authorization')?.value).toBe('[redacted]');
  });
});

describe('cURL', () => {
  it('quotes for POSIX shells', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('redacts credentials by default and drops transport headers', () => {
    const r = req({ query: 'query Q { a(x: "it\'s") }' });
    const curl = toCurl(r, { includeCredentials: false });
    expect(curl).toContain(`curl 'https://api.example.com/graphql'`);
    expect(curl).toContain(`-H 'Authorization: [redacted]'`);
    expect(curl).not.toContain('secret-token');
    expect(curl).not.toContain(':authority');
    expect(curl).toContain('--data-raw');
    expect(curl).toContain('--compressed');
    expect(curl).not.toContain('-X POST'); // implied by --data-raw
    expect(hasCredentials(r)).toBe(true);
  });

  it('includes credentials only when asked', () => {
    expect(toCurl(req({ query: '{ a }' }), { includeCredentials: true })).toContain('Bearer secret-token');
  });

  it('produces a fetch() snippet', () => {
    const f = toFetch(req({ query: '{ a }' }), { includeCredentials: false });
    expect(f).toMatch(/^await fetch\("https:\/\/api.example.com\/graphql"/);
    expect(f).toContain('"Authorization": "[redacted]"');
  });
});

describe('HAR / JSON export', () => {
  it('round-trips through HAR and redacts by default', () => {
    const r = req(
      { query: '{ a }' },
      {
        response: {
          state: 'loaded',
          body: '{"data":{"a":1}}',
          truncated: false,
          summary: { kind: 'json', errorCount: 0, partCount: 1 },
        },
      },
    );
    const har = toHar([r], { includeCredentials: false });
    expect(JSON.stringify(har)).not.toContain('secret-token');
    const [back] = harEntries(JSON.parse(JSON.stringify(har)));
    expect(normalizeEntry(back!, 'again')?.operations[0]?.query).toBe('{ a }');
    expect(back?.response.content?.text).toBe('{"data":{"a":1}}');
  });

  it('rejects non-HAR files', () => {
    expect(() => harEntries({ foo: 1 })).toThrow(/Not a HAR/);
  });

  it('exports readable JSON', () => {
    const out = toJSONExport([req({ query: '{ a }', variables: { x: 1 } })], { includeCredentials: false });
    expect(out.requests[0]?.operations[0]).toMatchObject({ query: '{ a }', variables: { x: 1 } });
  });
});

describe('replay', () => {
  it('drops headers page scripts may not set and embeds values safely', () => {
    expect(replayableHeaders(headers).map((h) => h.name)).toEqual([
      'content-type',
      'Authorization',
      'x-api-key',
    ]);
    const script = buildReplayScript(
      { url: 'https://x.dev/"); alert(1); ("', method: 'POST', headers: [], body: '`${x}`' },
      't',
    );
    expect(() => new Function(script)).not.toThrow(); // still valid JS: values stayed inside string literals
    expect(script).toContain(JSON.stringify('https://x.dev/"); alert(1); ("'));
  });

  it('polls until the page reports a result', async () => {
    let calls = 0;
    const result = await replayRequest(
      { url: 'https://x.dev', method: 'POST', headers: [], body: '{}' },
      async () => {
        calls++;
        return calls < 3 ? (calls === 1 ? true : null) : { ok: false, error: 'Failed to fetch' };
      },
    );
    expect(result).toMatchObject({ ok: false, error: 'Failed to fetch' });
    expect(result.ok === false && result.hint).toMatch(/CORS/);
  });
});

describe('filterRequests', () => {
  const loaded = (body: string, errorCount = 0) =>
    ({
      state: 'loaded',
      body,
      truncated: false,
      summary: { kind: 'json', errorCount, partCount: 1 },
    }) as const;
  const all = [
    req(
      { query: 'query GetUsers { users { id } }' },
      { id: 'a', response: loaded('{"data":{"users":[{"id":"needle"}]}}') },
    ),
    req(
      { query: 'mutation CreateUser { createUser { id } }', variables: { email: 'vivek@x.dev' } },
      { id: 'b', response: loaded('{}') },
    ),
    req(
      { query: 'query Broken { b }' },
      { id: 'c', status: 500, response: loaded('{"errors":[{"message":"x"}]}', 1) },
    ),
    req({ query: 'subscription OnTick { tick }' }, { id: 'd', status: 404, response: loaded('') }),
    req(
      { query: '{ x }' },
      {
        id: 'e',
        kind: 'rest',
        operations: [{ index: 0, name: '/api/cart' }],
        requestBody: '{"sku":"shoe-42"}',
        response: loaded('{"errors":[]}'),
      },
    ),
    req({ extensions: { persistedQuery: { sha256Hash: 'abc' } } }, { id: 'f', response: loaded('{}') }),
  ];
  const ids = (f: Partial<Parameters<typeof filterRequests>[1]>) =>
    filterRequests(all, { text: '', type: 'all', status: 'all', ...f }).map((r) => r.id);

  it('filters by type, outcome and status class', () => {
    expect(ids({ type: 'operation' })).toEqual(['a', 'b', 'c', 'f']); // persisted (unknown type) too
    expect(ids({ type: 'subscription' })).toEqual(['d']);
    expect(ids({ type: 'rest' })).toEqual(['e']);
    expect(ids({ type: 'errors' })).toEqual(['c', 'd']);
    expect(ids({ type: 'success' })).toEqual(['a', 'b', 'e', 'f']);
    expect(ids({ status: '5xx' })).toEqual(['c']);
    expect(ids({ status: '4xx' })).toEqual(['d']);
  });

  it('searches names, queries, variables, responses and URLs case-insensitively', () => {
    expect(ids({ text: 'createuser' })).toEqual(['b']);
    expect(ids({ text: 'VIVEK@' })).toEqual(['b']);
    expect(ids({ text: 'needle' })).toEqual(['a']);
    expect(ids({ text: 'shoe-42' })).toEqual(['e']); // request bodies
    expect(ids({ text: 'api.example.com' })).toHaveLength(6);
    expect(ids({ text: '(' })).toEqual([]); // regex characters are literal
  });
});

describe('settings', () => {
  it('sanitizes stored values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ maxRequests: 1e9, theme: 'neon', prettyPrint: 'yes' })).toMatchObject({
      maxRequests: 5000,
      theme: 'system',
      prettyPrint: true,
    });
  });
});

describe('RequestStore', () => {
  it('caps history, drops the oldest first and clears on navigation unless preserved', async () => {
    const store = new RequestStore();
    store.setMax(50);
    for (let i = 0; i < 120; i++) store.upsert({ ...req({ query: '{ a }' }), id: `r${i}` });
    expect(store.getSnapshot()).toHaveLength(50);
    expect(store.getSnapshot()[0]?.id).toBe('r70');
    store.preserveLog = true;
    store.navigated();
    expect(store.getSnapshot()).toHaveLength(50);
    store.preserveLog = false;
    store.navigated();
    expect(store.getSnapshot()).toHaveLength(0);
    expect(entry({}).request.method).toBe('GET');
  });
});
