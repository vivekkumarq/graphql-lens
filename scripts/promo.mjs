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
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #e6edf3; overflow: hidden;
    background:
      radial-gradient(circle at 0% 0%, rgb(45 212 191 / .28), transparent 45%),
      radial-gradient(circle at 100% 100%, rgb(88 166 255 / .25), transparent 50%),
      linear-gradient(135deg, #0b1324, #0d1117 60%, #0a1020); }
  .brand { display: flex; align-items: center; gap: 12px; }
  h1 { font-weight: 800; letter-spacing: -0.03em; color: #fff; line-height: 1; }
  .tag { color: #cbd5e1; font-weight: 500; }
  .tag b { color: #2dd4bf; } .tag i { font-style: normal; color: #58a6ff; font-weight: 700; }
  .pills { display: flex; gap: 6px; }
  .pill { font: 700 11px ui-monospace, Consolas, monospace; padding: 3px 8px; border-radius: 99px;
    border: 1px solid; letter-spacing: .04em; }
  .p-gql { color: #2dd4bf; border-color: #2dd4bf66; background: #2dd4bf14; }
  .p-rest { color: #58a6ff; border-color: #58a6ff66; background: #58a6ff14; }
  .win { background: #0d1117ee; border: 1px solid #30363d; border-radius: 10px; overflow: hidden;
    box-shadow: 0 18px 50px rgb(0 0 0 / .55); }
  .bar { display: flex; gap: 5px; padding: 7px 10px; background: #161b22; border-bottom: 1px solid #30363d;
    align-items: center; color: #8b949e; font-size: 11px; }
  .bar i { width: 8px; height: 8px; border-radius: 50%; background: #30363d; }
  .bar span { margin-left: 8px; color: #2dd4bf; font-weight: 600; }
  .row { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 8px; align-items: center;
    padding: 6px 10px; border-bottom: 1px solid #21262d; font: 12px ui-monospace, Consolas, monospace; }
  .row:last-child { border-bottom: 0; }
  .row.on { background: #2dd4bf1f; }
  .b { width: 18px; height: 18px; border-radius: 4px; display: grid; place-items: center;
    font-weight: 800; font-size: 11px; color: #0d1117; }
  .q { background: #4ac26b; } .m { background: #b392f0; } .s { background: #f0883e; } .r { background: #58a6ff; }
  .n { color: #e6edf3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .n em { color: #8b949e; font-style: normal; margin-right: 6px; }
  .ok { color: #4ac26b; } .bad { color: #f85149; } .t { color: #8b949e; }
`;

const rows = (list) =>
  list
    .map(
      ([cls, letter, name, status, time, on]) =>
        `<div class="row${on ? ' on' : ''}"><span class="b ${cls}">${letter}</span><span class="n">${name}</span>` +
        `<span class="${status >= 400 ? 'bad' : 'ok'}">${status}</span><span class="t">${time}</span></div>`,
    )
    .join('');

const small = `<style>${base}
  body { width: 440px; height: 280px; padding: 22px 24px; display: grid; grid-template-rows: auto auto 1fr; gap: 12px; }
  img { width: 44px; height: 44px; }
  h1 { font-size: 27px; }
  .tag { font-size: 13px; margin-top: 4px; }
  .win { align-self: end; }
</style>
<div class="brand"><img src="${icon}"><div><h1>GraphQL Lens</h1>
<p class="tag">Inspect <b>GraphQL</b> + <i>REST</i> calls in DevTools</p></div></div>
<div class="pills"><span class="pill p-gql">QUERIES</span><span class="pill p-gql">MUTATIONS</span><span class="pill p-gql">SUBS</span><span class="pill p-rest">REST API</span></div>
<div class="win">${rows([
  ['q', 'Q', 'GetUser', 200, '42 ms', true],
  ['m', 'M', 'CreateOrder', 200, '118 ms'],
  ['r', 'R', '<em>GET</em>/api/cart', 200, '35 ms'],
  ['s', 'S', 'OnPriceChange', 101, 'live'],
])}</div>`;

const marquee = `<style>${base}
  body { width: 1400px; height: 560px; display: grid; grid-template-columns: 560px 1fr; align-items: center; gap: 40px; padding: 0 0 0 72px; }
  img.icon { width: 84px; height: 84px; }
  h1 { font-size: 58px; }
  .tag { font-size: 24px; margin: 22px 0 20px; }
  .pills { margin-bottom: 26px; } .pill { font-size: 14px; padding: 5px 12px; }
  ul { list-style: none; padding: 0; color: #cbd5e1; }
  li { font-size: 18px; line-height: 1.8; } li::before { content: '▸ '; color: #2dd4bf; }
  .stack { position: relative; height: 460px; }
  .shot { position: absolute; right: 0; top: 0; width: 700px; border-radius: 12px 0 0 12px; border: 1px solid #334155;
    border-right: 0; box-shadow: 0 20px 60px rgb(0 0 0 / .55); }
  .stack .win { position: absolute; left: 0; bottom: 0; width: 420px; }
  .stack .row { font-size: 15px; padding: 9px 14px; grid-template-columns: 26px 1fr auto auto; }
  .stack .b { width: 22px; height: 22px; font-size: 13px; }
</style>
<div><div class="brand"><img class="icon" src="${icon}"><h1>GraphQL Lens</h1></div>
<p class="tag">Inspect <b>GraphQL</b> and <i>REST</i> API calls, right in DevTools.</p>
<div class="pills"><span class="pill p-gql">Q · QUERIES</span><span class="pill p-gql">M · MUTATIONS</span><span class="pill p-gql">S · SUBSCRIPTIONS</span><span class="pill p-rest">R · REST</span></div>
<ul><li>GraphQL errors highlighted, batches split apart</li><li>SSE, WebSocket and @defer streams</li><li>Edit & replay, copy as cURL, HAR export</li><li>100% local: no telemetry, ever</li></ul></div>
<div class="stack"><img class="shot" src="${shot}"><div class="win"><div class="bar"><i></i><i></i><i></i><span>GraphQL Lens</span></div>${rows(
  [
    ['q', 'Q', 'GetUser', 200, '42 ms', true],
    ['m', 'M', 'CreateOrder', 200, '118 ms'],
    ['r', 'R', '<em>GET</em>/api/cart', 200, '35 ms'],
    ['q', 'Q', 'Products', 403, '1.31 s'],
    ['s', 'S', 'OnPriceChange', 101, 'live'],
  ],
)}</div></div>`;

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
