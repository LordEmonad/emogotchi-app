// The /habibi lab page itself at a phone's width and a desktop's: the top of the page as a screenshot, page and console
// errors, sideways scroll. node tools/habibi-page.mjs [--path=/shop/habibi] [--out=<dir>] [--base=http://localhost:5173]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const OUT = arg('out', 'habibi-page'); const BASE = arg('base', 'http://localhost:5173');
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}${arg("path", "/habibi")}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 3000));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.screenshot({ path: `${OUT}/page-${w}.png`, fullPage: true });
  console.log(w, 'sideways scroll', sw, 'errors', errs.length ? errs : 'none');
  await p.close();
}
await b.close();
