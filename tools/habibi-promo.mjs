// The Habibi pack's promo pictures (1600 x 900), shot from the live composition at /habibi/promo (dev server):
//   node tools/habibi-promo.mjs [--base=http://localhost:5173] [--out=apps/web/public/brand]
// writes habibi-pack.png (no text), habibi-pack-title.png (with the pack's title), like jewish-pack(-title).png, and
// habibi-pack-og.png (2400 x 1260: /shop/habibi's link card, framing habibi-pack.png). --only=og for just the card.
import puppeteer from 'puppeteer-core';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5173');
const OUT = arg('out', 'apps/web/public/brand');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const ONLY = arg('only', '');   // 'og' for the link card alone (it frames habibi-pack.png, so shoot that first)
for (const [q, file, w, h, dpr] of [['', 'habibi-pack.png', 1600, 900, 1], ['?title=1', 'habibi-pack-title.png', 1600, 900, 1], ['?og=1', 'habibi-pack-og.png', 1200, 630, 2]]) {
  if (ONLY && !file.includes(ONLY)) continue;
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/habibi/promo${q}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__promo_ready === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 300));
  await p.screenshot({ path: `${OUT}/${file}`, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(file, errs.length ? errs : 'ok');
  await p.close();
}
await b.close();
