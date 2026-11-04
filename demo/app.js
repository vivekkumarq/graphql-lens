const endpoint = '/graphql';
const log = (msg) => {
  const el = document.getElementById('log');
  el.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.scrollTop = el.scrollHeight;
};

const post = async (body, headers = {}) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer demo-secret-token',
      'x-api-key': 'demo-key-123',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  log(`${res.status} ${typeof body === 'string' ? body.slice(0, 40) : (body.operationName ?? 'batch')}`);
  return res.text();
};

const scenarios = {
  query: [
    'Query',
    'GetUsers with nested posts',
    () =>
      post({
        operationName: 'GetUsers',
        query: 'query GetUsers {\n  users {\n    id\n    name\n    email\n    posts { id title }\n  }\n}',
      }),
  ],
  variables: [
    'Query + variables',
    'GetUser($id) with a fragment and @include',
    () =>
      post({
        operationName: 'GetUser',
        variables: { id: '2', withPosts: true },
        query:
          'query GetUser($id: ID!, $withPosts: Boolean = false) { user(id: $id) { ...UserFields posts @include(if: $withPosts) { title } } } fragment UserFields on User { id name email }',
      }),
  ],
  mutation: [
    'Mutation',
    'CreateUser with variables',
    () =>
      post({
        operationName: 'CreateUser',
        variables: { name: 'Vivek Kumar', email: 'vivek@example.com' },
        query:
          'mutation CreateUser($name: String!, $email: String) { createUser(name: $name, email: $email) { id name email } }',
      }),
  ],
  graphqlError: [
    'GraphQL error',
    'Partial data + FORBIDDEN error, HTTP 200',
    () => post({ operationName: 'GetSecret', query: 'query GetSecret { users { id } secret }' }),
  ],
  notFound: [
    'Resolver error',
    'User 999 not found (NOT_FOUND)',
    () =>
      post({
        operationName: 'MissingUser',
        variables: { id: '999' },
        query: 'query MissingUser($id: ID!) { user(id: $id) { id name } }',
      }),
  ],
  syntax: [
    'Malformed query',
    'Syntax error, HTTP 400',
    () => post({ operationName: 'Broken', query: 'query Broken { users { id ' }),
  ],
  http401: [
    'HTTP 401',
    'Unauthorized',
    () => post({ operationName: 'Me', query: 'query Me { users { id } }' }, { 'x-demo-status': '401' }),
  ],
  http403: [
    'HTTP 403',
    'Forbidden',
    () =>
      post(
        { operationName: 'AdminStats', query: 'query AdminStats { users { id } }' },
        { 'x-demo-status': '403' },
      ),
  ],
  http404: [
    'HTTP 404',
    'Wrong endpoint',
    () =>
      fetch('/graphql-v0', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operationName: 'OldEndpoint', query: 'query OldEndpoint { users { id } }' }),
      }),
  ],
  http500: [
    'HTTP 500',
    'Internal Server Error',
    () =>
      post(
        { operationName: 'Checkout', query: 'mutation Checkout { deleteUser(id: "1") }' },
        { 'x-demo-status': '500' },
      ),
  ],
  batch: [
    'Batch',
    '3 operations in one request (one malformed)',
    () =>
      post([
        { operationName: 'GetUsers', query: 'query GetUsers { users { id name } }' },
        { operationName: 'GetProducts', query: 'query GetProducts { products(count: 3) { id name price } }' },
        { operationName: 'BadOne', query: 'query BadOne { nope }' },
      ]),
  ],
  get: [
    'GET query',
    'Query sent in the URL',
    async () => {
      const q = encodeURIComponent('query ProductById($id: ID!) { product(id: $id) { id name price } }');
      const v = encodeURIComponent(JSON.stringify({ id: '42' }));
      const r = await fetch(`${endpoint}?operationName=ProductById&query=${q}&variables=${v}`);
      log(`${r.status} GET ProductById`);
    },
  ],
  persisted: [
    'Persisted query',
    'APQ: hash only, server asks for the query',
    async () => {
      const ext = encodeURIComponent(
        JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38',
          },
        }),
      );
      const r = await fetch(`${endpoint}?operationName=FeedPage&extensions=${ext}`);
      log(`${r.status} GET persisted FeedPage`);
    },
  ],
  defer: [
    '@defer',
    'multipart/mixed incremental delivery',
    async () => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'multipart/mixed; deferSpec=20220824, application/json',
        },
        body: JSON.stringify({
          operationName: 'ProductPage',
          query:
            'query ProductPage { product(id: "7") { id name ... @defer { price } ... @defer { reviews { rating text } } } }',
        }),
      });
      await r.text();
      log(`${r.status} @defer ProductPage`);
    },
  ],
  sse: [
    'SSE subscription',
    'GraphQL over server-sent events',
    async () => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          operationName: 'Countdown',
          query: 'subscription Countdown($from: Int) { countdown(from: $from) }',
          variables: { from: 3 },
        }),
      });
      await r.text();
      log(`${r.status} SSE Countdown finished`);
    },
  ],
  ws: [
    'WebSocket subscription',
    'graphql-transport-ws protocol',
    () =>
      new Promise((resolve) => {
        const ws = new WebSocket(
          `${location.origin.replace('http', 'ws')}${endpoint}`,
          'graphql-transport-ws',
        );
        ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }));
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.type === 'connection_ack')
            ws.send(
              JSON.stringify({
                id: '1',
                type: 'subscribe',
                payload: {
                  operationName: 'OnCountdown',
                  query: 'subscription OnCountdown { countdown(from: 4) }',
                },
              }),
            );
          if (m.type === 'complete') {
            log('WS OnCountdown complete');
            setTimeout(() => (ws.close(), resolve()), 200);
          }
        };
      }),
  ],
  upload: [
    'File upload',
    'graphql-multipart-request-spec',
    async () => {
      const form = new FormData();
      form.append(
        'operations',
        JSON.stringify({
          operationName: 'UploadAvatar',
          query: 'mutation UploadAvatar($file: Upload) { uploadAvatar(file: $file) }',
          variables: { file: null },
        }),
      );
      form.append('map', JSON.stringify({ 0: ['variables.file'] }));
      form.append('0', new Blob(['fake image bytes'], { type: 'image/png' }), 'avatar.png');
      const r = await fetch(endpoint, { method: 'POST', body: form });
      log(`${r.status} UploadAvatar`);
    },
  ],
  rawGraphql: [
    'application/graphql',
    'Raw query body',
    async () => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/graphql' },
        body: '{ users { name } }',
      });
      log(`${r.status} application/graphql`);
    },
  ],
  large: [
    'Large response',
    '20,000 products (~2.5 MB)',
    () =>
      post({
        operationName: 'AllProducts',
        variables: { count: 20000 },
        query:
          'query AllProducts($count: Int) { products(count: $count) { id name price reviews { rating text } } }',
      }),
  ],
  slow: [
    'Slow query',
    'Resolver takes 1.5 s',
    () => post({ operationName: 'SlowReport', query: 'query SlowReport { slow(ms: 1500) }' }),
  ],
  plainWs: [
    'Plain WebSocket',
    'A non-GraphQL WebSocket price feed (JSON + one binary frame)',
    () =>
      new Promise((resolve) => {
        const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/live-prices`);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => ws.send(JSON.stringify({ action: 'subscribe', symbols: ['BTC', 'ETH'] }));
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') {
            ws.send(JSON.stringify({ action: 'unsubscribe' }));
            log('WS /live-prices done');
            setTimeout(resolve, 200);
          }
        };
      }),
  ],
  notGraphql: [
    'REST call',
    'Plain JSON API with a "query" field: listed as REST, not GraphQL',
    async () => {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'shoes', page: 1 }),
      });
      log(`${r.status} /api/search (REST, not GraphQL)`);
    },
  ],
  burst: [
    'Burst ×100',
    '100 queries in parallel',
    () =>
      Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          post({ operationName: `Burst${i}`, query: `query Burst${i} { product(id: "${i}") { id name } }` }),
        ),
      ),
  ],
};

window.demo = {
  scenarios,
  run: (name) => scenarios[name][2](),
  async runAll() {
    for (const [name, s] of Object.entries(scenarios))
      if (name !== 'burst') await s[2]().catch((e) => log(`${name} failed: ${e}`));
    log('All scenarios done');
  },
  async burst(n) {
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        post({ operationName: `Burst${i}`, query: `query Burst${i} { product(id: "${i}") { id name } }` }),
      ),
    );
  },
};

const box = document.getElementById('buttons');
for (const [name, [title, desc, run]] of Object.entries(scenarios)) {
  const b = document.createElement('button');
  b.dataset.scenario = name;
  b.innerHTML = `<b>${title}</b><span>${desc}</span>`;
  b.onclick = () => run().catch((e) => log(`${name} failed: ${e}`));
  box.append(b);
}
document.getElementById('run-all').onclick = () => window.demo.runAll();
