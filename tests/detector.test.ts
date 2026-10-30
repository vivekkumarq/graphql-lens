import { describe, expect, it } from 'vitest';
import { detectGraphQL, looksLikeGraphQL } from '../src/graphql/detector';
import { entry, json, post } from './helpers';

const detect = (e: ReturnType<typeof entry>) => detectGraphQL(e.request);

describe('looksLikeGraphQL', () => {
  it.each([
    'query GetUsers { users { id } }',
    'mutation { a }',
    'subscription OnEvent { e }',
    '{ users { id } }',
    '  # leading comment\n query Q { a }',
    'fragment F on User { id } query Q { ...F }',
    '{ ...F }',
  ])('accepts %j', (q) => expect(looksLikeGraphQL(q)).toBe(true));

  it.each(['shoes', 'SELECT * FROM users', '{"a":1}', '', 'queryString', 42, null])('rejects %j', (q) =>
    expect(looksLikeGraphQL(q)).toBe(false),
  );
});

describe('detectGraphQL', () => {
  it('detects a POST query', () => {
    expect(detect(post({ query: 'query GetUsers { users { id name } }' }))).toEqual([
      {
        query: 'query GetUsers { users { id name } }',
        operationName: undefined,
        variables: undefined,
        extensions: undefined,
      },
    ]);
  });

  it('detects a mutation with operationName and variables', () => {
    const ops = detect(
      post({
        operationName: 'CreateUser',
        variables: { name: 'Vivek' },
        query: 'mutation CreateUser($name: String!) { createUser(name: $name) { id } }',
      }),
    );
    expect(ops?.[0]?.operationName).toBe('CreateUser');
    expect(ops?.[0]?.variables).toEqual({ name: 'Vivek' });
  });

  it('does not depend on the URL', () => {
    expect(
      detect(post({ query: '{ me { id } }' }, { url: 'https://example.com/api/v2/data' })),
    ).not.toBeNull();
    expect(detect(post({ items: [1, 2] }, { url: 'https://example.com/graphql' }))).toBeNull();
  });

  it('ignores arbitrary JSON APIs, including ones with a "query" field', () => {
    expect(detect(post({ query: 'shoes', page: 2 }))).toBeNull();
    expect(detect(post({ q: 'query' }))).toBeNull();
    expect(detect(post([1, 2, 3]))).toBeNull();
    expect(detect(post('not json at all', { raw: true }))).toBeNull();
  });

  it('detects batches and keeps malformed items as placeholders', () => {
    const ops = detect(post([{ query: 'query A { a }' }, { query: 'query B { b }' }, 42]));
    expect(ops).toHaveLength(3);
    expect(ops?.[2]?.malformed).toMatch(/not a GraphQL operation/);
  });

  it('detects GET requests', () => {
    const url = `https://api.example.com/gql?query=${encodeURIComponent('query Q($id: ID!) { node(id: $id) { id } }')}&variables=${encodeURIComponent('{"id":"1"}')}&operationName=Q`;
    const ops = detect(entry({ url }));
    expect(ops?.[0]).toMatchObject({ operationName: 'Q', variables: { id: '1' } });
  });

  it('detects automatic persisted queries without query text', () => {
    const ext = encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: 'abc123' } }));
    expect(
      detect(entry({ url: `https://x.dev/graphql?operationName=Feed&extensions=${ext}` }))?.[0]?.query,
    ).toBeUndefined();
    expect(
      detect(post({ operationName: 'Feed', extensions: { persistedQuery: { sha256Hash: 'abc' } } })),
    ).toHaveLength(1);
  });

  it('ignores GET requests with unrelated query params', () => {
    expect(detect(entry({ url: 'https://shop.dev/search?query=red+shoes' }))).toBeNull();
  });

  it('supports application/graphql bodies', () => {
    const e = entry({
      method: 'POST',
      headers: [{ name: 'Content-Type', value: 'application/graphql' }],
      text: '{ me { id } }',
    });
    expect(detect(e)?.[0]?.query).toBe('{ me { id } }');
  });

  it('supports multipart file uploads', () => {
    const text = [
      '------b',
      'Content-Disposition: form-data; name="operations"',
      '',
      '{"query":"mutation Upload($f: Upload!) { upload(file: $f) }","variables":{"f":null}}',
      '------b',
      'Content-Disposition: form-data; name="map"',
      '',
      '{"0":["variables.f"]}',
      '------b--',
    ].join('\r\n');
    const e = entry({
      method: 'POST',
      headers: [{ name: 'content-type', value: 'multipart/form-data; boundary=----b' }],
      text,
    });
    expect(detect(e)?.[0]?.query).toMatch(/^mutation Upload/);
  });

  it('supports form-urlencoded bodies', () => {
    const e = entry({
      method: 'POST',
      headers: [{ name: 'content-type', value: 'application/x-www-form-urlencoded' }],
      text: 'query=%7B%20me%20%7B%20id%20%7D%20%7D',
    });
    expect(detect(e)?.[0]?.query).toBe('{ me { id } }');
  });

  it('keeps a broken document when operationName says it is GraphQL', () => {
    expect(detect(post({ query: 'qury Broken {', operationName: 'Broken' }))).toHaveLength(1);
  });

  it('parses string-encoded variables', () => {
    expect(detect(post({ query: '{ a }', variables: '{"x":1}' }))?.[0]?.variables).toEqual({ x: 1 });
  });

  it('survives garbage input', () => {
    expect(detectGraphQL({ method: 'POST', url: 'not a url', headers: [json] })).toBeNull();
    expect(detect(entry({ method: 'POST', text: '' }))).toBeNull();
  });
});
