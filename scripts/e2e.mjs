// End-to-end test in a real browser: loads dist/ as an unpacked extension, opens DevTools on the
// demo app, switches to the GraphQL Lens panel and drives it.
//   node scripts/e2e.mjs [chrome|edge] [--screenshots]
// Set BROWSER_PATH to use a specific executable. Uses a throwaway profile; your own is untouched.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { startDemoServer } from '../demo/server.mjs';

const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'chrome';
const screenshots = process.argv.includes('--screenshots');
const CANDIDATES = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ],
  edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
  ],
};
const executablePath = process.env.BROWSER_PATH ?? CANDIDATES[which]?.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error(`No ${which} executable found; set BROWSER_PATH`);

const dist = path.resolve(process.env.EXTENSION_DIR ?? 'dist');
const shotDir = path.resolve('store-assets', 'screenshots');
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphql-lens-dl-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? `  (${detail})` : ''}`);
};
async function until(fn, timeout = 10000, every = 100) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn().catch(() => undefined);
    if (last) return last;
    await sleep(every);
  }
  return last;
}

const { server, wss, port } = await startDemoServer(0);
const origin = `http://localhost:${port}`;
console.log(`${which}: ${executablePath}\ndemo: ${origin}`);

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  pipe: true,
  enableExtensions: [dist],
  devtools: true,
  defaultViewport: null,
  args: ['--window-size=1600,1000', '--no-first-run', '--no-default-browser-check'],
});

try {
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await page.goto(origin);
  const dtTarget = await browser.waitForTarget((t) => t.url().startsWith('devtools://'), { timeout: 20000 });
  const devtools = await dtTarget.asPage();
  const cdp = await devtools.createCDPSession();
  if (screenshots) {
    // Store screenshots: DevTools in its own window, rendered at exactly 1280×800 CSS px, 1x.
    await sleep(1500);
    await devtools.evaluate(async () => {
      const UI = await import('./ui/legacy/legacy.js');
      UI.DockController.DockController.instance().setDockSide('undocked');
    });
    await sleep(1500);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: 20, top: 20, width: 1300, height: 860 },
    });
    await sleep(800);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  const panelId = await until(async () => {
    const ids = await devtools.evaluate(async () => {
      const UI = await import('./ui/legacy/legacy.js');
      return UI.InspectorView.InspectorView.instance().tabbedPane.tabIds();
    });
    return ids.find((id) => id.startsWith('chrome-extension://'));
  }, 20000);
  check('panel is registered in DevTools', !!panelId, panelId);
  // DevTools is open on another tab while the page sends GraphQL; the panel is opened afterwards.
  await page.evaluate(() => window.demo.run('query'));
  await sleep(500);
  await devtools.evaluate(async (id) => {
    const UI = await import('./ui/legacy/legacy.js');
    await UI.InspectorView.InspectorView.instance().showPanel(id);
  }, panelId);
  const panel = await until(
    async () => devtools.frames().find((f) => f.url().endsWith('/panel.html')),
    15000,
  );
  await panel.waitForSelector('.app', { timeout: 15000 });

  const text = (sel) => panel.$eval(sel, (e) => e.textContent ?? '').catch(() => '');
  const count = async () => Number((await text('.count')).match(/^\d+/)?.[0] ?? 0);
  const search = async (q) => {
    await panel.click('.search input', { count: 3 });
    await devtools.keyboard.press('Backspace');
    if (q) await devtools.keyboard.type(q);
    await sleep(350);
  };
  const clickByText = async (selector, label) => {
    const i = await panel.$$eval(
      selector,
      (els, l) => {
        const t = els.map((e) => e.textContent ?? '');
        const exact = t.findIndex((x) => x.replace(/[\d!]+$/, '') === l); // "REST" vs "REST + GQL"
        return exact >= 0 ? exact : t.findIndex((x) => x.startsWith(l));
      },
      label,
    );
    if (i < 0) throw new Error(`${selector} "${label}" not found`);
    await (await panel.$$(selector))[i].click();
  };
  const chip = async (label) => {
    await clickByText('.chip', label);
    await sleep(150);
  };
  const openRow = async (name) => {
    await search(name);
    for (const row of await panel.$$('.row')) {
      const names = await row.$eval('.col-name', (e) => e.getAttribute('title') ?? '');
      if (names.split(/\n/).includes(name)) {
        await row.click();
        return panel.waitForSelector('.details');
      }
    }
    throw new Error(`row ${name} not found`);
  };
  const tab = async (label) => {
    await clickByText('.tabs button', label);
    await sleep(250);
  };
  const shot = async (name) => {
    if (!screenshots) return;
    fs.mkdirSync(shotDir, { recursive: true });
    await panel.evaluate(() => document.querySelector('.toasts')?.style.setProperty('visibility', 'hidden'));
    await sleep(400);
    // The first capture after emulation can come back at device scale; retry until it is exactly 1280×800.
    let saved = false;
    for (let i = 0; i < 4 && !saved; i++) {
      const dpr = await devtools.evaluate(() => devicePixelRatio);
      const png = await devtools.screenshot({
        clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 / dpr },
      });
      saved = png.readUInt32BE(16) === 1280 && png.readUInt32BE(20) === 800;
      if (saved) fs.writeFileSync(path.join(shotDir, `${name}.png`), png);
      else await sleep(300);
    }
    await panel.evaluate(() => document.querySelector('.toasts')?.style.removeProperty('visibility'));
    if (!saved) throw new Error(`could not capture ${name} at 1280×800`);
  };

  const early = await until(async () => ((await count()) === 1 ? 1 : 0), 5000);
  check('requests sent before the panel was opened are captured', early === 1);
  await panel.click('button[aria-label="Clear history"]');
  await sleep(200);
  check(
    'empty state shows the onboarding message',
    (await text('.empty-title')).includes('calls a GraphQL or REST API'),
  );

  // ---- capture every scenario ----
  const t0 = Date.now();
  await page.evaluate(() => window.demo.runAll());
  const total = await until(async () => ((await count()) >= 23 ? count() : 0), 15000);
  check(
    'captures 20 GraphQL scenarios, the REST call and both WebSocket connections',
    total === 23,
    `${total} captured in ${Date.now() - t0} ms`,
  );

  const expected = [
    'GetUsers',
    'GetUser',
    'CreateUser',
    'GetSecret',
    'MissingUser',
    'Broken',
    'Me',
    'AdminStats',
    'OldEndpoint',
    'Checkout',
    'ProductById',
    'FeedPage',
    'ProductPage',
    'Countdown',
    'OnCountdown',
    'UploadAvatar',
    'AllProducts',
    'SlowReport',
  ];
  const missing = [];
  for (const name of expected) {
    await search(name);
    if ((await count()) < 1) missing.push(name);
  }
  check('every named operation is detected', missing.length === 0, missing.join(', '));
  await search('api/search');
  check(
    'plain JSON API with a "query" field is listed as REST, not GraphQL',
    (await count()) === 1 && (await text('.row .type-badge')) === 'R',
  );
  await search('vivek@example.com');
  check('search matches variable values', (await count()) === 1);
  await search('Not authorized to read secret');
  check('search matches response bodies', (await count()) === 1);
  await search('');

  await chip('Errors');
  const errors = await count();
  check('Errors filter (HTTP 4xx/5xx + GraphQL errors)', errors === 9, `${errors}`);
  await chip('Queries & Mutations');
  const qm = await count();
  const letters = new Set(await panel.$$eval('.row .type-badge', (b) => b.map((x) => x.textContent)));
  check(
    'Queries & Mutations filter (Q and M badges)',
    qm === 18 && letters.has('Q') && letters.has('M'),
    `${qm} ${[...letters]}`,
  );
  await panel.select('select[aria-label="More filters"]', 'subscription');
  await sleep(150);
  check('Subscriptions (More filters dropdown): SSE + WebSocket', (await count()) === 2, `${await count()}`);
  await chip('WS');
  const wsLetters = await panel.$$eval('.row .type-badge', (b) => b.map((x) => x.textContent).join(''));
  check('WS filter: both sockets (W) and the GraphQL subscription on one', (await count()) === 3, wsLetters);
  await openRow('/live-prices');
  await panel.waitForSelector('.events-list', { timeout: 5000 });
  const events = await text('.events-list');
  check(
    'Event stream lists sent and received WebSocket messages, binary too',
    events.includes('"action":"subscribe"') &&
      events.includes('"symbol":"ETH"') &&
      events.includes('Binary message'),
    (await text('.events-bar')).trim(),
  );
  await clickByText('.ev-data', '{"type":"tick","symbol":"BTC"');
  await panel.waitForSelector('.events .cm-editor', { timeout: 5000 });
  check('clicking a message shows it in full', (await text('.events .code-view')).includes('"price"'));
  await search('');
  await shot('4-websocket-events');
  await chip('REST');
  check('REST filter', (await count()) === 1, `${await count()}`);
  await openRow('/api/search');
  check('REST call shows a Request tab with its body', (await text('.tab-body')).includes('shoes'));
  await search('');
  await chip('REST + GQL + WS');
  check('record button says Stop while recording', (await text('.btn.record')).trim() === 'Stop');
  await panel.select('select[aria-label="HTTP status"]', '4xx');
  await sleep(150);
  check('HTTP status filter 4xx', (await count()) === 5, `${await count()}`);
  await panel.select('select[aria-label="HTTP status"]', 'all');

  // ---- details ----
  await openRow('GetUser');
  await panel.waitForSelector('.cm-editor', { timeout: 10000 });
  const structure = await text('.structure');
  check('query viewer renders with CodeMirror', !!(await panel.$('.cm-editor')));
  check(
    'structure shows fragments, directives and variables',
    structure.includes('UserFields') && structure.includes('@include') && structure.includes('$id: ID!'),
  );
  const queryLabels = await panel.$$eval('.op-code .code-label', (l) => l.map((x) => x.textContent));
  check('Query tab also shows the variables under the query', queryLabels.join() === 'Query,Variables');
  await tab('Request + Response');
  await panel.waitForSelector('.split2 .response', { timeout: 5000 });
  const both = await text('.split2');
  check(
    'Request + Response tab shows both side by side',
    both.includes('query GetUser') && both.includes('"withPosts"') && both.includes('"data"'),
  );
  await search('');
  await shot('3-request-response');
  await tab('Variables');
  check('variables tab shows declared vs sent', (await text('.vars-table')).includes('withPosts'));
  await search('');
  await tab('Query');
  await shot('1-query-structure');

  await openRow('GetSecret');
  await tab('Response');
  await panel.waitForSelector('.errors', { timeout: 5000 });
  const errText = await text('.errors');
  check(
    'GraphQL errors are highlighted with code and path',
    errText.includes('FORBIDDEN') && errText.includes('path: secret'),
  );
  await search('');
  await shot('2-response-errors');

  await tab('Headers');
  const headers = await text('.headers');
  check('sensitive headers are masked', headers.includes('••••') && !headers.includes('demo-secret-token'));

  await panel.click('.copy-btn');
  await sleep(200);
  await clickByText('.menu button', 'Copy as cURL');
  const toastText = await until(async () => text('.toast'), 3000);
  check('Copy as cURL works and redacts by default', /cURL copied/.test(toastText), toastText);
  await panel.evaluate(() => {
    navigator.clipboard.writeText = async (t) => void (window.__copied = t);
  });
  await panel.click('.copy-btn');
  await sleep(200);
  await clickByText('.menu button', 'Copy authorization token');
  const copied = await until(() => panel.evaluate(() => window.__copied), 3000);
  check('Copy authorization token copies the token without "Bearer"', copied === 'demo-secret-token', copied);

  await openRow('GetProducts');
  check('batched request is grouped', (await text('.details h2')) === 'Batch of 3 operations');
  await tab('Query');
  check('batch shows one collapsible block per operation', (await panel.$$('.batch-item')).length === 3);
  await tab('Response');
  await panel.waitForSelector('.errors', { timeout: 5000 });
  check('batch errors are attributed to their operation', (await text('.errors')).includes('#3 BadOne'));
  await search('');

  await openRow('ProductPage');
  await tab('Response');
  await until(async () => (await text('.response')).includes('Deferred response #2'), 5000);
  check('@defer multipart parts are shown', (await text('.response')).includes('Deferred response #2'));

  await openRow('OnCountdown');
  await tab('Response');
  await until(async () => (await text('.response')).includes('Event 5'), 5000);
  check('WebSocket subscription events are shown', (await text('.response')).includes('Event 5 · next'));
  await openRow('Countdown');
  await tab('Response');
  await until(async () => (await text('.response')).includes('complete'), 5000);
  check('SSE subscription events are shown', (await text('.response')).includes('Event 4 · next'));

  await openRow('AllProducts');
  await tab('Response');
  const tLarge = Date.now();
  await panel.waitForSelector('.response .cm-editor', { timeout: 15000 });
  check('large (~2.5 MB) response renders', true, `${Date.now() - tLarge} ms`);

  // ---- replay ----
  await openRow('CreateUser');
  await tab('Replay');
  await panel.waitForSelector('.replay .cm-editor', { timeout: 10000 });
  await search('');
  const before = await count();
  const sendBtn = await panel.$('.replay-url .btn.primary');
  await sendBtn.click();
  await panel.waitForSelector('.replay-result, .replay .banner.bad', { timeout: 15000 });
  check(
    'replay runs in the page and shows the response',
    (await text('.replay-result')).includes('200'),
    (await text('.replay-result')).slice(0, 60),
  );
  await until(async () => (await count()) > before, 5000);
  check('the replayed request is captured too', (await count()) === before + 1);
  await shot('5-replay');

  // ---- keyboard ----
  await panel.click('.list-body');
  await panel.focus('.list-body');
  await devtools.keyboard.press('Home');
  await sleep(100);
  const firstActive = await text('.row.active .name');
  await devtools.keyboard.press('ArrowDown');
  await sleep(100);
  check(
    'arrow keys move through requests',
    firstActive !== (await text('.row.active .name')) && !!firstActive,
  );
  await devtools.keyboard.press('/');
  check('"/" focuses search', await panel.evaluate(() => document.activeElement?.matches('.search input')));
  await devtools.keyboard.type('Checkout');
  await sleep(300);
  await devtools.keyboard.press('Escape');
  await sleep(300);
  check('Esc clears search', (await panel.$eval('.search input', (e) => e.value)) === '');

  // ---- export / import ----
  await cdp
    .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    .catch(() => undefined);
  await panel.click('button[aria-label="Export"]');
  await panel.waitForSelector('dialog[open]');
  const radios = await panel.$$('dialog[open] input[name="scope"]');
  await radios.at(-1).click(); // "All captured requests"
  await panel.click('dialog[open] footer .btn.primary');
  const har = await until(async () => fs.readdirSync(downloadDir).find((f) => f.endsWith('.har')), 8000);
  check('export downloads a HAR file', !!har, har);
  if (har) {
    const doc = JSON.parse(fs.readFileSync(path.join(downloadDir, har), 'utf8'));
    check(
      'exported HAR redacts credentials',
      !JSON.stringify(doc).includes('demo-secret-token') && doc.log.entries.length >= 21,
    );
    await panel.click('button[aria-label="Clear history"]');
    await sleep(200);
    // uploadFile() does not reach DevTools' out-of-process iframe; hand the file over via the DOM instead
    const harText = fs.readFileSync(path.join(downloadDir, har), 'utf8');
    await panel.evaluate(
      (content, name) => {
        const input = document.querySelector('input[type="file"]');
        const dt = new DataTransfer();
        dt.items.add(new File([content], name, { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      harText,
      har,
    );
    const seen = new Set();
    const imported = await until(async () => {
      const t = await text('.toasts');
      if (t) seen.add(t);
      return (await count()) >= 21 ? count() : 0;
    }, 8000);
    if (imported < 21) console.log('    toasts during import:', [...seen], 'harbytes', harText.length);
    check('HAR import restores the requests', imported >= 21, `${imported} ${await text('.toasts')}`);
  }

  // ---- settings ----
  await panel.click('button[aria-label="Settings"]');
  await panel.waitForSelector('dialog[open]');
  await panel.select('dialog[open] select', 'dark');
  await sleep(300);
  check(
    'theme switches to dark',
    (await panel.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
  );
  const persisted = await panel.evaluate(() =>
    chrome.storage.local.get('settings').then((s) => s.settings.theme),
  );
  check('settings persist in chrome.storage.local', persisted === 'dark');
  await panel.click('dialog[open] header .icon-btn');
  await sleep(200);
  check('settings dialog closes', !(await panel.$('dialog[open]')));

  // ---- navigation & performance ----
  await page.reload();
  await sleep(800);
  check('history clears on reload (preserve log off)', (await count()) === 0);
  await panel.click('.toolbar .check input');
  await page.evaluate(() => window.demo.run('query'));
  await until(async () => (await count()) === 1, 4000);
  await page.reload();
  await sleep(800);
  check('preserve log keeps requests across reloads', (await count()) === 1);
  await panel.click('button[aria-label="Clear history"]');

  const tBurst = Date.now();
  await page.evaluate(() => window.demo.burst(500));
  const burst = await until(async () => ((await count()) >= 500 ? count() : 0), 30000);
  const burstMs = Date.now() - tBurst;
  check('500-request burst is captured', burst === 500, `${burstMs} ms`);
  const frameMs = await panel.evaluate(
    () =>
      new Promise((resolve) => {
        const body = document.querySelector('.list-body');
        const t = performance.now();
        let frames = 0;
        const step = () => {
          body.scrollTop += 400;
          if (++frames < 30) requestAnimationFrame(step);
          else resolve((performance.now() - t) / frames);
        };
        requestAnimationFrame(step);
      }),
  );
  check(
    'list stays smooth with 500 rows (virtualized)',
    frameMs < 50,
    `${frameMs.toFixed(1)} ms/frame, ${await panel.$$eval('.row', (r) => r.length)} rows in DOM`,
  );
  if (process.argv.includes('--real')) {
    // A real public GraphQL API (CORS-enabled), to make sure nothing depends on the demo server.
    await panel.click('button[aria-label="Clear history"]');
    await page.evaluate(() =>
      fetch('https://countries.trevorblades.com/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationName: 'CountryByCode',
          variables: { code: 'IN' },
          query:
            'query CountryByCode($code: ID!) { country(code: $code) { name capital currency languages { name } } }',
        }),
      }).then((r) => r.text()),
    );
    await until(async () => (await count()) === 1, 10000);
    await openRow('CountryByCode');
    await tab('Response');
    const body = await until(
      async () => ((await text('.response')).includes('New Delhi') ? text('.response') : ''),
      10000,
    );
    check('real public API (countries.trevorblades.com) is captured and parsed', !!body);
  }
  const heap = await panel.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  if (heap) console.log(`    panel heap after 500 requests: ${(heap / 1048576).toFixed(1)} MB`);
} finally {
  await browser.close();
  wss.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed on ${which}`);
process.exit(failed.length ? 1 : 0);
