// Opens a browser with GraphQL Lens loaded, the demo app running and the panel visible,
// fires every demo scenario, then leaves everything open to explore. Ctrl+C to quit.
//   node scripts/showcase.mjs [chrome|edge]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { startDemoServer } from '../demo/server.mjs';

const which = process.argv[2] === 'edge' ? 'edge' : 'chrome';
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
  ],
};
const executablePath = process.env.BROWSER_PATH ?? CANDIDATES[which].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { port } = await startDemoServer(Number(process.env.PORT) || 4000);
const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  pipe: true,
  enableExtensions: [path.resolve(process.env.EXTENSION_DIR ?? 'dist')],
  devtools: true,
  defaultViewport: null,
  args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
});
const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.goto(`http://localhost:${port}`);
const devtools = await (await browser.waitForTarget((t) => t.url().startsWith('devtools://'))).asPage();
await sleep(2500);
await devtools.evaluate(async () => {
  const UI = await import('./ui/legacy/legacy.js');
  UI.DockController.DockController.instance().setDockSide('bottom');
  const iv = UI.InspectorView.InspectorView.instance();
  await iv.showPanel(iv.tabbedPane.tabIds().find((id) => id.startsWith('chrome-extension://')));
});
await sleep(1000);
await page.evaluate(() => window.demo.runAll());
console.log(
  `GraphQL Lens is open in ${which} on http://localhost:${port}. Explore, then press Ctrl+C here to close.`,
);
if (process.env.SHOT) await devtools.screenshot({ path: process.env.SHOT });
browser.on('disconnected', () => process.exit(0));
