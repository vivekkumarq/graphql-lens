// Local GraphQL server that produces every kind of traffic GraphQL Lens handles:
// queries, mutations, variables, errors, HTTP failures, batching, GET, persisted queries,
// @defer (multipart), SSE and WebSocket subscriptions, uploads and large responses.
// Run: npm run demo  →  http://localhost:4000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { buildSchema, graphql, GraphQLError, parse, subscribe } from 'graphql';

const here = path.dirname(fileURLToPath(import.meta.url));

const schema = buildSchema(`
  type Query {
    users: [User!]!
    user(id: ID!): User
    products(count: Int = 10): [Product!]!
    product(id: ID!): Product
    secret: String
    slow(ms: Int = 1500): String
  }
  type Mutation {
    createUser(name: String!, email: String): User!
    deleteUser(id: ID!): Boolean!
    uploadAvatar(file: Upload): String
  }
  type Subscription { countdown(from: Int = 5): Int! }
  scalar Upload
  type User { id: ID!, name: String!, email: String, posts: [Post!]! }
  type Post { id: ID!, title: String! }
  type Product { id: ID!, name: String!, price: Float!, reviews: [Review!]! }
  type Review { id: ID!, rating: Int!, text: String! }
`);

const users = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: '2', name: 'Alan Turing', email: 'alan@example.com' },
  { id: '3', name: 'Grace Hopper', email: 'grace@example.com' },
];
const withPosts = (u) => ({ ...u, posts: [{ id: `${u.id}-1`, title: `Notes by ${u.name}` }] });
const product = (i) => ({
  id: String(i),
  name: `Product ${i}`,
  price: Math.round(((i * 7.31) % 100) * 100) / 100,
  reviews: [{ id: `${i}-r1`, rating: (i % 5) + 1, text: 'Solid.' }],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const root = {
  users: () => users.map(withPosts),
  user: ({ id }) => {
    const u = users.find((x) => x.id === id);
    if (!u) throw new GraphQLError(`User ${id} not found`, { extensions: { code: 'NOT_FOUND' } });
    return withPosts(u);
  },
  products: ({ count }) => Array.from({ length: Math.min(count, 50000) }, (_, i) => product(i + 1)),
  product: ({ id }) => product(Number(id) || 1),
  secret: () => {
    throw new GraphQLError('Not authorized to read secret', { extensions: { code: 'FORBIDDEN' } });
  },
  slow: async ({ ms }) => (await sleep(Math.min(ms, 10000)), `waited ${ms} ms`),
  createUser: ({ name, email }) => {
    const u = { id: String(users.length + 1), name, email };
    users.push(u);
    return withPosts(u);
  },
  deleteUser: ({ id }) => users.some((u) => u.id === id),
  uploadAvatar: () => 'avatar.png stored',
  countdown: async function* ({ from }) {
    for (let n = from; n >= 0; n--) {
      yield { countdown: n };
      await sleep(400);
    }
  },
};

async function execute({ query, variables, operationName, extensions }) {
  if (!query && extensions?.persistedQuery)
    return {
      errors: [{ message: 'PersistedQueryNotFound', extensions: { code: 'PERSISTED_QUERY_NOT_FOUND' } }],
    };
  return graphql({ schema, source: query ?? '', rootValue: root, variableValues: variables, operationName });
}

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/graphql-response+json; charset=utf-8',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

async function handleDefer(res, query) {
  // Hand-built incremental delivery in the shape of the @defer spec.
  res.writeHead(200, { 'content-type': 'multipart/mixed; boundary="-"; deferSpec=20220824' });
  const part = (o) => `\r\n---\r\ncontent-type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(o)}`;
  const id = /product\(id:\s*"?(\d+)/.exec(query)?.[1] ?? '1';
  const p = product(Number(id));
  res.write(part({ data: { product: { id: p.id, name: p.name } }, hasNext: true }));
  await sleep(300);
  res.write(part({ incremental: [{ data: { price: p.price }, path: ['product'] }], hasNext: true }));
  await sleep(300);
  res.write(part({ incremental: [{ data: { reviews: p.reviews }, path: ['product'] }], hasNext: false }));
  res.end('\r\n-----\r\n');
}

async function handleSSE(res, params) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const result = await subscribe({
    schema,
    document: parse(params.query),
    rootValue: root,
    variableValues: params.variables,
  });
  if (!(Symbol.asyncIterator in result)) {
    res.end(`event: next\ndata: ${JSON.stringify(result)}\n\nevent: complete\ndata:\n\n`);
    return;
  }
  for await (const value of result) res.write(`event: next\ndata: ${JSON.stringify(value)}\n\n`);
  res.end('event: complete\ndata:\n\n');
}

function multipartField(body, name) {
  return new RegExp(`name="${name}"\\r?\\n(?:[^\\r\\n]+\\r?\\n)*\\r?\\n([\\s\\S]*?)\\r?\\n--`).exec(
    body,
  )?.[1];
}

async function handleGraphQL(req, res, url) {
  const forced = Number(req.headers['x-demo-status']);
  if (forced >= 400)
    return json(res, forced, {
      errors: [{ message: http.STATUS_CODES[forced], extensions: { code: `HTTP_${forced}` } }],
    });

  let params;
  const ct = req.headers['content-type'] ?? '';
  if (req.method === 'GET') {
    const p = url.searchParams;
    const parseJSON = (s) => (s ? JSON.parse(s) : undefined);
    params = {
      query: p.get('query') ?? undefined,
      variables: parseJSON(p.get('variables')),
      operationName: p.get('operationName') ?? undefined,
      extensions: parseJSON(p.get('extensions')),
    };
  } else {
    const body = await readBody(req);
    try {
      if (ct.includes('application/graphql')) params = { query: body };
      else if (ct.includes('multipart/form-data'))
        params = JSON.parse(multipartField(body, 'operations') ?? '{}');
      else params = JSON.parse(body);
    } catch {
      return json(res, 400, { errors: [{ message: 'Request body is not valid JSON' }] });
    }
  }

  if (Array.isArray(params)) {
    const results = await Promise.all(
      params.map((p) =>
        p && typeof p === 'object' ? execute(p) : { errors: [{ message: 'Invalid batch item' }] },
      ),
    );
    return json(res, 200, results);
  }
  if (params.query?.includes('@defer')) return handleDefer(res, params.query);
  if ((req.headers.accept ?? '').includes('text/event-stream')) return handleSSE(res, params);

  const result = await execute(params);
  const syntaxOrValidation = result.errors && !('data' in result);
  json(res, syntaxOrValidation ? 400 : 200, result);
}

export function startDemoServer(port = 4000) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === '/' || url.pathname === '/app.js') {
        const file = url.pathname === '/' ? 'index.html' : 'app.js';
        res.writeHead(200, {
          'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8',
        });
        return res.end(await readFile(path.join(here, file)));
      }
      if (url.pathname === '/graphql') return await handleGraphQL(req, res, url);
      if (url.pathname === '/api/search') {
        // A plain JSON API that happens to use a "query" field: must NOT be detected as GraphQL.
        await readBody(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ results: ['red shoes', 'blue shoes'] }));
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'No GraphQL endpoint here' }] }));
    } catch (e) {
      json(res, 500, { errors: [{ message: `Demo server error: ${e.message}` }] });
    }
  });

  // graphql-transport-ws over WebSocket
  const wss = new WebSocketServer({
    server,
    path: '/graphql',
    handleProtocols: (p) => (p.has('graphql-transport-ws') ? 'graphql-transport-ws' : false),
  });
  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'connection_init') return ws.send(JSON.stringify({ type: 'connection_ack' }));
      if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
      if (msg.type !== 'subscribe') return;
      try {
        const result = await subscribe({
          schema,
          document: parse(msg.payload.query),
          rootValue: root,
          variableValues: msg.payload.variables,
        });
        if (Symbol.asyncIterator in result) {
          for await (const value of result)
            ws.send(JSON.stringify({ id: msg.id, type: 'next', payload: value }));
        } else ws.send(JSON.stringify({ id: msg.id, type: 'next', payload: result }));
        ws.send(JSON.stringify({ id: msg.id, type: 'complete' }));
      } catch (e) {
        ws.send(JSON.stringify({ id: msg.id, type: 'error', payload: [{ message: e.message }] }));
      }
    });
  });

  return new Promise((resolve) =>
    server.listen(port, () => resolve({ server, wss, port: server.address().port })),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { port } = await startDemoServer(Number(process.env.PORT) || 4000);
  console.log(`GraphQL Lens demo running at http://localhost:${port}`);
}
