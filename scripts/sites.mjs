// Smoke test against real websites that make GraphQL calls (no login needed).
//   node scripts/sites.mjs [chrome|edge] [url ...]
// For each site: open it with the GraphQL Lens panel already showing, wait for traffic,
// then open every captured request's Query and Response tabs and look for panel errors.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const which = args[0] === 'edge' || args[0] === 'chrome' ? args.shift() : 'chrome';
const SITES = args.length
  ? args
  : [
      'https://www.twitch.tv/directory',
      'https://anilist.co/search/anime/trending',
      'https://gitlab.com/explore/projects',
      'https://rickandmortyapi.com/graphql',
      'https://countries.trevorblades.com/',
    ];
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
const executablePath = process.env.BROWSER_PATH ?? CANDIDATES[which].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  pipe: true,
  enableExtensions: [path.resolve(process.env.EXTENSION_DIR ?? 'dist')],
  devtools: true,
  defaultViewport: null,
  args: ['--window-size=1600,1000', '--no-first-run', '--no-default-browser-check'],
});
let failures = 0;
try {
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await page.goto('about:blank');
  const devtools = await (
    await browser.waitForTarget((t) => t.url().startsWith('devtools://'), { timeout: 20000 })
  ).asPage();
  await sleep(2500);
  await devtools.evaluate(async () => {
    const UI = await import('./ui/legacy/legacy.js');
    const iv = UI.InspectorView.InspectorView.instance();
    await iv.showPanel(iv.tabbedPane.tabIds().find((id) => id.startsWith('chrome-extension://')));
  });
  await sleep(1500);
  const panel = devtools.frames().find((f) => f.url().endsWith('/panel.html'));
  await panel.waitForSelector('.app');
  const panelErrors = [];
  devtools.on('console', (m) => {
    if (m.type() === 'error' && m.location()?.url?.startsWith('chrome-extension://'))
      panelErrors.push(m.text());
  });

  for (const site of SITES) {
    panelErrors.length = 0;
    console.log(`\n${site}`);
    try {
      await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      console.log(`  ! could not load: ${e.message.split('\n')[0]}`);
      continue;
    }
    await sleep(6000);
    await page.evaluate(() => window.scrollBy(0, 1500)).catch(() => undefined);
    await sleep(5000);
    const rows = await panel.$$eval('.row', (rs) =>
      rs.map((r) => ({
        name: r.querySelector('.col-name')?.getAttribute('title') ?? '',
        status: r.querySelector('.col-status')?.textContent ?? '',
        badge: r.querySelector('.type-badge')?.textContent ?? '',
        extra: [...r.querySelectorAll('.batch, .transport')].map((e) => e.textContent).join(' '),
      })),
    );
    const total = (await panel.$eval('.count', (e) => e.textContent)) ?? '';
    console.log(`  captured: ${total}`);
    for (const r of rows.slice(0, 8))
      console.log(`   [${r.badge}] ${r.name.split('\n').join(' | ').slice(0, 70)}  ${r.status} ${r.extra}`);

    // Open up to 6 requests and render every tab that parses data.
    const problems = [];
    const n = Math.min(rows.length, 6);
    for (let i = 0; i < n; i++) {
      const all = await panel.$$('.row');
      if (!all[i]) break;
      await all[i].click();
      await panel.waitForSelector('.details');
      for (const label of ['Query', 'Variables', 'Request', 'Response', 'Headers', 'Timing', 'Raw']) {
        const idx = await panel.$$eval(
          '.tabs button',
          (b, l) => b.findIndex((x) => x.textContent?.startsWith(l)),
          label,
        );
        if (idx < 0) continue; // REST rows have Request instead of Query/Variables
        await (await panel.$$('.tabs button'))[idx].click();
        await sleep(label === 'Response' ? 900 : 200);
        const body = await panel.$eval('.tab-body', (e) => e.textContent ?? '');
        if (body.includes('Unable to display this view'))
          problems.push(`${rows[i].name.split('\n')[0]} → ${label}: ${body.slice(0, 160)}`);
        if (label === 'Response' && body.includes('Formatting response…'))
          problems.push(`${rows[i].name.split('\n')[0]} → response never rendered`);
      }
    }
    const ok = rows.length > 0 && problems.length === 0 && panelErrors.length === 0;
    if (!ok) failures++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${rows.length ? `${n} request(s) opened in every tab` : 'nothing captured'}`,
    );
    for (const p of problems) console.log(`    problem: ${p}`);
    for (const e of panelErrors) console.log(`    panel error: ${e.slice(0, 200)}`);
  }
} finally {
  await browser.close();
}
console.log(`\n${SITES.length - failures}/${SITES.length} sites OK on ${which}`);
process.exit(failures ? 1 : 0);
