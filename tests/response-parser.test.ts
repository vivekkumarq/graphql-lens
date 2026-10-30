import { describe, expect, it } from 'vitest';
import { parseResponse, summarize } from '../src/graphql/response-parser';
import { toView } from '../src/workers/analyze-core';
import { decodeBody, truncateBody } from '../src/network/response-body';

describe('parseResponse', () => {
  it('parses a data response', () => {
    const r = parseResponse('{"data":{"user":{"id":123,"name":"Vivek"}}}', 'application/json');
    expect(r).toMatchObject({ kind: 'json', errors: [] });
    expect(r.parts[0]?.value).toEqual({ data: { user: { id: 123, name: 'Vivek' } } });
  });

  it('extracts GraphQL errors with path, locations and extensions', () => {
    const r = parseResponse(
      JSON.stringify({
        data: { user: null },
        errors: [
          {
            message: 'Not found',
            path: ['user'],
            locations: [{ line: 1, column: 3 }],
            extensions: { code: 'NOT_FOUND' },
          },
        ],
      }),
    );
    expect(r.errors).toEqual([
      {
        message: 'Not found',
        path: ['user'],
        locations: [{ line: 1, column: 3 }],
        extensions: { code: 'NOT_FOUND' },
      },
    ]);
    expect(summarize(r)).toMatchObject({ errorCount: 1, firstError: 'Not found' });
  });

  it('tolerates odd error shapes', () => {
    expect(parseResponse('{"errors":["boom", {"code": 1}]}').errors.map((e) => e.message)).toEqual([
      'boom',
      '{"code":1}',
    ]);
  });

  it('maps batched responses to operations', () => {
    const r = parseResponse('[{"data":{"a":1}},{"errors":[{"message":"bad"}]}]');
    expect(r.parts.map((p) => p.label)).toEqual(['Operation 1', 'Operation 2']);
    expect(r.errors).toEqual([{ message: 'bad', operationIndex: 1 }]);
  });

  it('handles empty and non-JSON bodies', () => {
    expect(parseResponse('')).toMatchObject({ kind: 'empty', parts: [] });
    expect(parseResponse('<html>502 Bad Gateway</html>', 'text/html')).toMatchObject({
      kind: 'text',
      parseError: 'Response is not valid JSON',
    });
    expect(parseResponse('{"data": {', 'application/json').parseError).toBeDefined();
  });

  it('parses multipart/mixed incremental delivery (@defer)', () => {
    const body = [
      '',
      '---',
      'Content-Type: application/json; charset=utf-8',
      '',
      '{"data":{"product":{"id":"1"}},"hasNext":true}',
      '---',
      'Content-Type: application/json; charset=utf-8',
      '',
      '{"incremental":[{"data":{"reviews":[]},"path":["product"],"errors":[{"message":"late"}]}],"hasNext":false}',
      '-----',
    ].join('\r\n');
    const r = parseResponse(body, 'multipart/mixed; boundary="-"; deferSpec=20220824');
    expect(r.kind).toBe('multipart');
    expect(r.parts.map((p) => p.label)).toEqual(['Initial response', 'Deferred response #1']);
    expect(r.errors.map((e) => e.message)).toEqual(['late']);
  });

  it('parses server-sent events', () => {
    const body =
      'event: next\ndata: {"data":{"n":1}}\n\nevent: next\ndata: {"errors":[{"message":"x"}]}\n\nevent: complete\ndata:\n\n';
    const r = parseResponse(body, 'text/event-stream');
    expect(r.kind).toBe('sse');
    expect(r.parts.map((p) => p.label)).toEqual(['Event 1 · next', 'Event 2 · next', 'Event 3 · complete']);
    expect(r.errors).toHaveLength(1);
  });

  it('handles large responses', () => {
    const big = JSON.stringify({
      data: { items: Array.from({ length: 50000 }, (_, i) => ({ id: i, name: `item ${i}` })) },
    });
    const t = performance.now();
    const view = toView(parseResponse(big, 'application/json'));
    expect(view.parts[0]?.isJSON).toBe(true);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

describe('response bodies', () => {
  it('decodes base64 UTF-8 and replaces invalid bytes instead of throwing', () => {
    expect(decodeBody(btoa(String.fromCharCode(...new TextEncoder().encode('héllo ✓'))), 'base64')).toBe(
      'héllo ✓',
    );
    expect(decodeBody(btoa('\xff\xfe'), 'base64')).toBe('��');
    expect(decodeBody(null)).toBe('');
  });

  it('truncates over the limit', () => {
    expect(truncateBody('abcdef', 3)).toEqual({ body: 'abc', truncated: true });
    expect(truncateBody('abc', 3)).toEqual({ body: 'abc', truncated: false });
  });
});
