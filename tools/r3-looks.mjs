// The r3tards lab (/r3tards, dev only): one still of the live pet per look (a lab query each), as one sheet.
//   node tools/r3-looks.mjs <out.png> "costume=witch" "costume=witch&crown=1" "head=keffiyeh&costume=bisht" … [--cols=4] [--w=420] [--js="d.die()"] [--wait=900] [--base=http://127.0.0.1:5263]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const args = process.argv.slice(2); const out = args[0];
const looks = args.slice(1).filter((a) => !a.startsWith('--'));
const arg = (k, d) => { const m = args.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263'); const COLS = Number(arg('cols', '4')); const JS = arg('js', ''); const WAIT = Number(arg('wait', '900'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const dir = fs.mkdtempSync('/tmp/r3looks-'); const names = [];
for (const [i, q] of looks.entries()) {
  await page.goto(`${BASE}/r3tards?moods=0&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__lab && window.__lab.r3tards, { timeout: 20000 });
  await page.evaluate(() => { window.__lab.r3tards.wanderEnabled = false; });
  await new Promise((r) => setTimeout(r, 1300));
  if (JS) { await page.evaluate((js) => { void new Function('d', 'return ' + js)(window.__lab.r3tards); }, JS); }
  await new Promise((r) => setTimeout(r, WAIT));
  const clip = await page.evaluate(() => { const b = document.querySelector('.hlab-booth .cathost .pet').getBoundingClientRect(); const s = document.querySelector('.hlab-booth .stage').getBoundingClientRect(); const w = b.width * 1.25; const x = b.left + b.width / 2 - w / 2; const y0 = Math.max(s.top, b.top - b.height * 0.42); return { x, y: y0 + window.scrollY, width: w, height: b.bottom + 8 - y0 }; });
  await page.screenshot({ path: `${dir}/${i}.png`, clip }); names.push([`${dir}/${i}.png`, q]);
}
const p2 = await browser.newPage(); const w = Number(arg('w', '420'));
await p2.setViewport({ width: w * COLS + 6 * (COLS + 1), height: 600 });
await p2.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${COLS},${w}px);gap:6px;padding:6px"><style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>${names.map(([f, q]) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${q}</figcaption></figure>`).join('')}</body>`);
await new Promise((r) => setTimeout(r, 400));
await p2.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length) { console.log('errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); }
console.log(looks.length, 'looks ->', out);
process.exit(0);   // (headless Chrome's close can hang after the sheet is written)
