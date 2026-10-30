// Renders the store promo images from HTML: small tile 440×280 and marquee 1400×560.
//   node scripts/promo.mjs   (needs store-assets/screenshots from `npm run screenshots`)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const exe =
  process.env.BROWSER_PATH ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => fs.existsSync(p));

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const icon = dataUrl('public/icons/128.png');
const shot = dataUrl('store-assets/screenshots/2-response-errors.png');

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #e6fffb; overflow: hidden;
    background: radial-gradient(circle at 15% 20%, #134e4a 0%, #0f172a 55%, #0b1020 100%); }
  .brand { display: flex; align-items: center; gap: 14px; }
  h1 { font-weight: 700; letter-spacing: -0.02em; color: #fff; }
  .tag { color: #5eead4; font-weight: 600; }
  ul { list-style: none; padding: 0; color: #cbd5e1; }
  li::before { content: '▸ '; color: #2dd4bf; }
`;

const small = `<style>${base}
  body { width: 440px; height: 280px; padding: 30px 32px; }
  img { width: 64px; height: 64px; }
  h1 { font-size: 30px; }
  .tag { font-size: 15px; margin: 14px 0 12px; }
  li { font-size: 13px; line-height: 1.6; }
</style>
<div class="brand"><img src="${icon}"><h1>GraphQL Lens</h1></div>
<p class="tag">Inspect. Debug. Understand GraphQL traffic.</p>
<ul><li>Queries, mutations & subscriptions</li><li>Errors, batching, @defer, WebSocket</li><li>Replay, cURL & HAR export</li></ul>`;

const marquee = `<style>${base}
  body { width: 1400px; height: 560px; display: grid; grid-template-columns: 520px 1fr; align-items: center; padding: 0 0 0 70px; }
  img.icon { width: 88px; height: 88px; }
  h1 { font-size: 52px; }
  .tag { font-size: 22px; margin: 18px 0 22px; }
  li { font-size: 18px; line-height: 1.75; }
  .shot { width: 820px; border-radius: 12px 0 0 12px; box-shadow: 0 20px 60px rgb(0 0 0 / .55); border: 1px solid #334155; border-right: 0; justify-self: end; }
</style>
<div><div class="brand"><img class="icon" src="${icon}"><h1>GraphQL Lens</h1></div>
<p class="tag">Inspect. Debug. Understand GraphQL traffic.</p>
<ul><li>Every operation in its own DevTools panel</li><li>GraphQL errors highlighted, batches split apart</li><li>SSE, WebSocket and @defer streams</li><li>Edit & replay, copy as cURL, HAR export</li><li>100% local: no telemetry, ever</li></ul></div>
<img class="shot" src="${shot}">`;

const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
for (const [name, html, width, height] of [
  ['promo-small-440x280', small, 440, 280],
  ['promo-marquee-1400x560', marquee, 1400, 560],
]) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const out = path.join('store-assets', `${name}.png`);
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
