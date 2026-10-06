// The r3tards lab's card view (/r3tards?card=<mood>&costume=…, dev only): every wallet mood in every look, one sheet per
// look row. For checking that each face (smile, frown, yawn, shut, x) holds up under each item.
//   node tools/r3-moods.mjs <out.png> ["" "witch" "mummy" "zombie,emohair" …] [--crown=1] [--size=300] [--moods=sad,happy] [--base=http://127.0.0.1:5263]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const args = process.argv.slice(2); const out = args[0];
const arg = (k, d) => { const m = args.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const looks = args.slice(1).filter((a) => !a.startsWith('--'));
const BASE = arg('base', 'http://127.0.0.1:5263'); const SIZE = Number(arg('size', '300')); const CROWN = arg('crown', '');
const MOODS = arg('moods', 'content,happy,hungry,grubby,bored,sleepy,sleeping,sad,dead').split(',');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const cells = [];
for (const look of looks.length ? looks : ['']) for (const mood of MOODS) {
  await page.goto(`${BASE}/r3tards?card=${mood}${look ? '&costume=' + look : ''}${CROWN ? '&crown=1' : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready === true, { timeout: 20000 });
  const el = await page.$('.nft-art'); const b = await el.boundingBox();
  cells.push([(await page.screenshot({ clip: b, encoding: 'base64' })), `${look || 'plain'} · ${mood}`]);
}
const p2 = await browser.newPage(); const cols = MOODS.length;
await p2.setViewport({ width: SIZE * cols + 4 * (cols + 1), height: 600 });
await p2.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${SIZE}px);gap:4px;padding:4px"><style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:11px sans-serif;padding:1px 3px}</style>${cells.map(([b64, q]) => `<figure><img src="data:image/png;base64,${b64}"><figcaption>${q}</figcaption></figure>`).join('')}</body>`);
await new Promise((r) => setTimeout(r, 500));
await p2.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length) { console.log('errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); }
console.log(cells.length, 'cards ->', out);
process.exit(0);   // (headless Chrome's close can hang after the sheet is written)
