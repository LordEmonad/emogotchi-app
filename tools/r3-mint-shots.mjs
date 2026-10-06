// The r3tardgotchi mint page preview (/r3tardgotchi, dev only): the whole page at a desktop and a phone width, in each of
// its states, with any page error, console error or sideways scroll.
//   node tools/r3-mint-shots.mjs <outdir> [--base=http://127.0.0.1:5263]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const report = {};
for (const [name, vw, vh, dpr, mobile] of [['desk', 1440, 900, 1, false], ['phone', 390, 844, 2, true]]) {
  const page = await browser.newPage(); await page.setViewport({ width: vw, height: vh, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/r3tardgotchi`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.r3m-word', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${out}/${name}-top.png` });
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  // the page a screen at a time (a full-page shot of a long phone page is too small to read)
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0, i = 0; y < tall && i < 14; y += Math.round(vh * 0.92), i++) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await new Promise((r) => setTimeout(r, 250)); await page.screenshot({ path: `${out}/${name}-s${String(i).padStart(2, '0')}.png` }); }
  await page.evaluate(() => window.scrollTo(0, 0));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // the states
  const press = async (label) => page.evaluate((l) => { [...document.querySelectorAll('.r3m-preview button')].find((b) => b.textContent.includes(l)).click(); }, label);
  await press('minting open'); await new Promise((r) => setTimeout(r, 300));
  const open = await page.evaluate(() => document.querySelector('.r3m-mint').textContent);
  await page.evaluate(() => document.querySelector('.r3m-mint').click()); await new Promise((r) => setTimeout(r, 1800));
  const done = await page.evaluate(() => document.querySelector('.r3m-mint').textContent);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${out}/${name}-done.png` });
  report[name] = { errors: [...new Set(errors)], sidewaysScroll: wide, open, done };
  await page.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close(); process.exit(0);
