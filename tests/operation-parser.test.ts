import { describe, expect, it } from 'vitest';
import { analyzeOperation } from '../src/graphql/operation-parser';
import { formatQuery } from '../src/graphql/formatter';

describe('analyzeOperation', () => {
  it('extracts type, name, variables, fragments, directives, aliases and depth', () => {
    const op = analyzeOperation(
      {
        query: `query GetUser($id: ID!, $withPosts: Boolean = false) {
          me: user(id: $id) { ...UserFields posts @include(if: $withPosts) { id title } }
          viewer { id }
        }
        fragment UserFields on User { id name avatar { url } }`,
      },
      0,
    );
    expect(op).toMatchObject({ name: 'GetUser', operationName: 'GetUser', operationType: 'query' });
    expect(op.parseError).toBeUndefined();
    expect(op.structure).toMatchObject({
      fields: ['me: user', 'viewer'],
      fragments: ['UserFields'],
      fragmentSpreads: ['UserFields'],
      directives: ['@include'],
      variableDefinitions: [
        { name: 'id', type: 'ID!' },
        { name: 'withPosts', type: 'Boolean', defaultValue: 'false' },
      ],
      depth: 3, // user > avatar > url
      operationCount: 1,
    });
    // user, id, name, avatar, url, posts, id, title, viewer, id
    expect(op.structure?.fieldCount).toBe(10);
  });

  it.each([
    ['mutation M { a }', 'mutation', 'M'],
    ['subscription S { a }', 'subscription', 'S'],
  ])('reads %s', (query, type, name) => {
    expect(analyzeOperation({ query }, 0)).toMatchObject({ operationType: type, name });
  });

  it('names anonymous operations after their root fields', () => {
    expect(analyzeOperation({ query: '{ users { id } products { id } }' }, 0)).toMatchObject({
      operationType: 'query',
      name: '(anonymous) users, products',
      operationName: undefined,
    });
  });

  it('picks the operation named by operationName in multi-operation documents', () => {
    const op = analyzeOperation({ query: 'query A { a } mutation B { b }', operationName: 'B' }, 0);
    expect(op).toMatchObject({ operationType: 'mutation', name: 'B' });
    expect(op.structure?.operationCount).toBe(2);
  });

  it('reports malformed queries without throwing and still guesses the type', () => {
    const op = analyzeOperation({ query: 'mutation Save { save(' }, 0);
    expect(op.parseError).toMatch(/Syntax Error.*line 1/);
    expect(op).toMatchObject({ operationType: 'mutation', name: 'Save' });
  });

  it('handles persisted queries and malformed batch items', () => {
    const pq = analyzeOperation({ extensions: { persistedQuery: { sha256Hash: 'deadbeefcafe1234' } } }, 0);
    expect(pq).toMatchObject({ persistedQueryHash: 'deadbeefcafe1234', name: 'persisted deadbeefca…' });
    expect(analyzeOperation({ malformed: 'bad item' }, 2)).toMatchObject({
      index: 2,
      parseError: 'bad item',
    });
  });

  it('survives recursive fragments', () => {
    const op = analyzeOperation(
      { query: 'query Q { ...A } fragment A on Q { a { ...B } } fragment B on Q { b { ...A } }' },
      0,
    );
    expect(op.structure?.depth).toBeGreaterThan(0);
  });

  it('handles a large query quickly', () => {
    const fields = Array.from({ length: 2000 }, (_, i) => `f${i} { id name }`).join(' ');
    const t = performance.now();
    const op = analyzeOperation({ query: `query Big { ${fields} }` }, 0);
    expect(op.structure?.fieldCount).toBe(6000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('formatQuery', () => {
  it('pretty-prints valid documents and leaves invalid ones alone', () => {
    expect(formatQuery('query Q{a{b}}')).toBe('query Q {\n  a {\n    b\n  }\n}');
    expect(formatQuery('query {')).toBe('query {');
  });
});
