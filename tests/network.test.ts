import { describe, expect, it } from 'vitest';
import { normalizeEntry } from '../src/network/normalizer';
import { websocketRequests, type WsTracker } from '../src/network/websocket';
import { parseWebSocketMessages, type WsMessage } from '../src/graphql/subscription-parser';
import { responseStateFor } from '../src/network/capture';
import { entry, post } from './helpers';

describe('normalizeEntry', () => {
  it('builds the internal model', () => {
    const r = normalizeEntry(post({ query: 'query GetUsers { users { id } }' }), 'r1');
    expect(r).toMatchObject({
      id: 'r1',
      method: 'POST',
      status: 200,
      statusText: 'OK',
      transport: 'http',
      duration: 143.4,
      size: 512,
      isBatch: false,
      timestamp: Date.parse('2026-10-30T10:00:00.000Z'),
      response: { state: 'pending' },
      timings: { blocked: 1, send: 0.2, wait: 140, receive: 2.2 },
    });
    expect(r?.timings?.dns).toBeUndefined(); // -1 means "not applicable"
    expect(r?.operations[0]).toMatchObject({ name: 'GetUsers', operationType: 'query' });
  });

  it.each([
    [400, 'Bad Request'],
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
    [500, 'Internal Server Error'],
    [0, 'Failed'],
  ])('keeps HTTP %i as "%s"', (status, text) => {
    const e = entry({ method: 'POST', text: '{"query":"{ a }"}', status });
    expect(normalizeEntry(e, 'x')).toMatchObject({ status, statusText: text });
  });

  it('marks batches and streaming transports', () => {
    expect(normalizeEntry(post([{ query: '{ a }' }, { query: '{ b }' }]), 'b')?.isBatch).toBe(true);
    const sse = entry({
      method: 'POST',
      text: '{"query":"subscription { a }"}',
      responseType: 'text/event-stream',
    });
    expect(normalizeEntry(sse, 's')?.transport).toBe('sse');
  });

  it('returns null for non-GraphQL traffic unless REST capture is on', () => {
    expect(normalizeEntry(post({ hello: 'world' }), 'n')).toBeNull();
    const fetchCall = {
      ...post({ query: 'shoes' }, { url: 'https://shop.test/api/search?q=1' }),
      _resourceType: 'fetch',
    };
    expect(normalizeEntry(fetchCall, 'r', true)).toMatchObject({
      kind: 'rest',
      method: 'POST',
      isBatch: false,
      operations: [{ index: 0, name: '/api/search' }],
    });
    // scripts, images and documents are never API calls
    expect(normalizeEntry({ ...fetchCall, _resourceType: 'script' }, 's', true)).toBeNull();
    // HARs from other browsers have no _resourceType: a JSON response counts
    expect(normalizeEntry(entry({ url: 'https://shop.test/api/items' }), 'h', true)?.kind).toBe('rest');
    expect(
      normalizeEntry(entry({ url: 'https://shop.test/', responseType: 'text/html' }), 'x', true),
    ).toBeNull();
    // GraphQL still wins when REST capture is on
    expect(
      normalizeEntry({ ...post({ query: '{ a }' }), _resourceType: 'fetch' }, 'g', true)?.kind,
    ).toBeUndefined();
  });
});

describe('responseStateFor', () => {
  it('summarises and enforces the size limit', async () => {
    const ok = await responseStateFor('{"errors":[{"message":"x"}]}', 'application/json', 1000);
    expect(ok).toMatchObject({ state: 'loaded', truncated: false, summary: { errorCount: 1 } });
    const big = await responseStateFor('x'.repeat(2000), 'application/json', 1000);
    expect(big).toMatchObject({ state: 'loaded', truncated: true });
    // an "errors" key in a REST body is data, not GraphQL errors
    const rest = await responseStateFor('{"errors":[{"message":"x"}]}', 'application/json', 1000, true);
    expect(rest).toMatchObject({ summary: { errorCount: 0 } });
  });
});

const msg = (type: 'send' | 'receive', data: unknown, time = 1): WsMessage => ({
  type,
  time,
  opcode: 1,
  data: JSON.stringify(data),
});

describe('GraphQL over WebSocket', () => {
  const transportWs: WsMessage[] = [
    msg('send', { type: 'connection_init' }),
    msg('receive', { type: 'connection_ack' }),
    msg('send', { id: '1', type: 'subscribe', payload: { query: 'subscription OnTick { tick }' } }, 1),
    msg('receive', { id: '1', type: 'next', payload: { data: { tick: 1 } } }, 2),
    msg('receive', { id: '1', type: 'next', payload: { data: { tick: 2 } } }, 3),
    { type: 'receive', time: 3, opcode: 1, data: 'not json' },
    msg('receive', { id: '1', type: 'complete' }, 4),
  ];

  it('groups graphql-transport-ws messages into subscriptions', () => {
    const [sub] = parseWebSocketMessages(transportWs);
    expect(sub).toMatchObject({
      id: '1',
      protocol: 'graphql-transport-ws',
      completed: true,
      startTime: 1000,
    });
    expect(sub?.events.map((e) => e.type)).toEqual(['next', 'next', 'complete']);
  });

  it('supports legacy subscriptions-transport-ws', () => {
    const [sub] = parseWebSocketMessages([
      msg('send', { id: 7, type: 'start', payload: { query: 'subscription { a }' } }),
      msg('receive', { id: 7, type: 'data', payload: { data: { a: 1 } } }),
      msg('receive', { id: 7, type: 'error', payload: [{ message: 'denied' }] }),
    ]);
    expect(sub).toMatchObject({ id: '7', protocol: 'subscriptions-transport-ws', completed: true });
  });

  it('turns subscriptions into requests and only re-emits changed ones', () => {
    const tracker: WsTracker = new Map();
    let n = 0;
    const e = {
      ...entry({ url: 'wss://api.example.com/graphql', status: 101 }),
      _webSocketMessages: transportWs.slice(0, 4),
    };
    const [first] = websocketRequests(e, tracker, () => `w${++n}`);
    expect(first).toMatchObject({
      transport: 'websocket',
      method: 'WS',
      status: 101,
      operations: [{ name: 'OnTick', operationType: 'subscription' }],
    });
    expect(websocketRequests(e, tracker, () => `w${++n}`)).toHaveLength(0);
    const [again] = websocketRequests({ ...e, _webSocketMessages: transportWs }, tracker, () => `w${++n}`);
    expect(again?.id).toBe(first?.id);
    expect(again?.events).toHaveLength(3);
  });
});

describe('WebSocket HAR round-trip', () => {
  it('exports subscription frames so they can be imported again', async () => {
    const { toHar, harEntries } = await import('../src/export/har');
    const messages: WsMessage[] = [
      msg('send', { id: '9', type: 'subscribe', payload: { query: 'subscription OnTick { tick }' } }, 1),
      msg('receive', { id: '9', type: 'next', payload: { data: { tick: 1 } } }, 2),
      msg('receive', { id: '9', type: 'complete' }, 3),
    ];
    const e = { ...entry({ url: 'wss://x.dev/graphql', status: 101 }), _webSocketMessages: messages };
    const [req] = websocketRequests(e, new Map(), () => 'w1');
    const [back] = harEntries(JSON.parse(JSON.stringify(toHar([req!], { includeCredentials: false }))));
    const [again] = websocketRequests(back!, new Map(), () => 'w2');
    expect(again?.operations[0]?.name).toBe('OnTick');
    expect(again?.events?.map((x) => x.type)).toEqual(['next', 'complete']);
  });
});
