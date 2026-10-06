// The r3tards lab's showreel (/r3tards?reel=1, dev only), watched headless through one whole loop: a still of the stage
// a few seconds into every beat (one sheet), how long each beat and the loop take, and any page or console error.
//   node tools/r3-reel.mjs <out.png> [--base=http://127.0.0.1:5263] [--at=3500]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const args = process.argv.slice(2); const out = args[0];
const arg = (k, d) => { const m = args.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263'); const AT = Number(arg('at', '3500'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/r3tards?moods=0&reel=1`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__reel, { timeout: 20000 });
const t0 = Date.now(); const shots = []; const times = []; let last = -1; let lastAt = t0;
const stage = await page.$('.hlab-booth .stage');
while (true) {
  const r = await page.evaluate(() => ({ ...window.__reel, note: document.querySelector('.r3-reel-note')?.textContent ?? '' }));
  if (r.loops >= 1) { times.push([last, Date.now() - lastAt]); break; }
  if (r.beat !== last) {
    if (last >= 0) times.push([last, Date.now() - lastAt]);
    last = r.beat; lastAt = Date.now();
    await sleep(AT);
    shots.push([await stage.screenshot({ encoding: 'base64' }), r.note]);
  }
  await sleep(120);
  if (Date.now() - t0 > 420000) { errors.push('the loop did not come round in 7 minutes'); break; }
}
const total = Date.now() - t0;
// switched off, it must finish its move and hand the buttons back
await page.evaluate(() => { [...document.querySelectorAll('.lab-actions button')].find((b) => /Showreel/.test(b.textContent)).click(); });
await page.waitForFunction(() => !document.querySelector('.hlab-booth').getAttribute('data-busy'), { timeout: 60000 }).catch(() => errors.push('the showreel did not stop'));
const p2 = await browser.newPage(); const cols = 5; const w = 380;
await p2.setViewport({ width: w * cols + 4 * (cols + 1), height: 600 });
await p2.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;padding:4px"><style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:11px sans-serif;padding:2px 3px}</style>${shots.map(([b, n]) => `<figure><img src="data:image/png;base64,${b}"><figcaption>${n}</figcaption></figure>`).join('')}</body>`);
await sleep(400); await p2.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('beats (s):', times.map(([i, ms]) => `${i + 1}: ${(ms / 1000).toFixed(1)}`).join('  '));
console.log(`one loop: ${(total / 1000).toFixed(0)} s, ${shots.length} beats`);
if (errors.length) { console.log('errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); } else console.log('no page or console error; it stopped when switched off');
process.exit(0);
