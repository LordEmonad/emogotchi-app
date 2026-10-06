// The r3tards lab (/r3tards, dev only), one action caught at chosen moments, at 2x. The whole page runs in
// slow motion (every animation and every timer slowed by --rate, the recorder's trick, tools/record-anims.mjs), so a
// screenshot's own time barely moves the scene and the moments land where asked. Writes the frames and one sheet.
//   node tools/r3-moments.mjs "<director call>" "<ms,ms,...>|every:<ms>:<until>" <outdir> [--base=http://127.0.0.1:5301] [--query=crown=1] [--zoom=pet|room] [--cols=4] [--rate=0.2]
//   e.g. node tools/r3-moments.mjs "feed()" every:250:9000 /tmp/feed
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [call, list, out] = process.argv.slice(2);
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263'); const QUERY = arg('query', ''); const ZOOM = arg('zoom', 'room'); const COLS = Number(arg('cols', '4'));
const PRE = arg('pre', '');   // a director call to run (and wait for) first, e.g. "walk(200)"
const RATE = Number(arg('rate', '0.2'));   // how fast the page runs while it is filmed
fs.mkdirSync(out, { recursive: true });
let times;
if (list.startsWith('every:')) { const [, step, until] = list.split(':').map(Number); times = []; for (let t = 0; t <= until; t += step) times.push(t); }
else times = list.split(',').map(Number);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(`${BASE}/r3tards?moods=0${QUERY ? '&' + QUERY : ''}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__lab && window.__lab.r3tards, { timeout: 20000 });
await page.evaluate(() => { window.__lab.r3tards.wanderEnabled = false; });
await new Promise((r) => setTimeout(r, 1200));
if (PRE) await page.evaluate((pre) => new Function('d', 'return d.' + pre)(window.__lab.r3tards), PRE);
const stage = await page.evaluate(() => { const r = document.querySelector('.hlab-booth .stage').getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height }; });
await page.evaluate((rate) => {
  const realTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => realTimeout(fn, (Number(ms) || 0) / rate, ...rest);
  const realAnimate = Element.prototype.animate;
  Element.prototype.animate = function animate(...args) { const a = realAnimate.apply(this, args); try { a.playbackRate = rate; } catch { /* fine */ } return a; };
  for (const a of document.getAnimations()) a.playbackRate = rate;
  window.__rate = rate;
}, RATE);
await page.evaluate((call) => { const d = window.__lab.r3tards; window.__t0 = performance.now(); window.__done = false; Promise.resolve(new Function('d', 'return d.' + call)(d)).then(() => { window.__done = true; }); }, call);
const names = [];
for (const t of times) {
  const now = await page.evaluate(() => (performance.now() - window.__t0) * window.__rate);
  if (t > now) await new Promise((r) => setTimeout(r, (t - now) / RATE));
  const at = await page.evaluate(() => Math.round((performance.now() - window.__t0) * window.__rate));
  let clip = { x: stage.x - 2, y: stage.y - 2, width: stage.width + 4, height: stage.height + 4 };
  if (ZOOM === 'pet') {
    const r = await page.evaluate(() => { const e = document.querySelector('.hlab-booth .cathost .pet') ?? document.querySelector('.hlab-booth .pet'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top + window.scrollY, w: b.width, h: b.height }; });
    const padX = r.w * 0.45; const padT = r.h * 0.35; const padB = r.h * 0.12;
    clip = { x: Math.max(stage.x, r.x - padX), y: Math.max(stage.y, r.y - padT), width: Math.min(r.w + 2 * padX, stage.width), height: Math.min(r.h + padT + padB, stage.height) };
  }
  const name = `t${String(at).padStart(5, '0')}`;
  await page.screenshot({ path: `${out}/${name}.png`, clip });
  names.push(name);
  if (await page.evaluate(() => window.__done) && times.indexOf(t) > 0 && list.startsWith('every:')) break;
}
// the sheet
const p2 = await browser.newPage();
const w = 420;
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${COLS},${w}px);gap:6px;padding:6px">
  <style>figure{margin:0}img{display:block;width:100%}figcaption{color:#ccc;font:12px sans-serif;padding:2px 4px}</style>
  ${names.map((n) => `<figure><img src="file://${out}/${n}.png"><figcaption>${n.slice(1)} ms</figcaption></figure>`).join('')}</body></html>`;
fs.writeFileSync(`${out}/sheet.html`, html);
await p2.setViewport({ width: w * COLS + 6 * (COLS + 1), height: 600 });
await p2.goto('file://' + out + '/sheet.html', { waitUntil: 'networkidle0' });
await p2.screenshot({ path: `${out}/sheet.png`, fullPage: true });
await browser.close();
console.log(names.length, 'frames');
if (errors.length) { console.log('errors:'); for (const e of errors) console.log('  ' + e); }
process.exit(0);   // (headless Chrome's close can hang after the sheet is written)
