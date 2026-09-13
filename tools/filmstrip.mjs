// Filmstrips of each pet action against a running dev server (pnpm dev -- --port 5199).
// node tools/filmstrip.mjs <action> [frames] [intervalMs] [viewportWidth] [crop]
// actions: page idle walk feed poop clean wash play sleep wake pet rumble sad tour
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [action = 'feed', framesArg = '12', intervalArg = '500', vw = '430', crop = '', extra = ''] = process.argv.slice(2);
// extra: a path ('/nft'), and/or query pairs ('view=dead'); 'nowallet' skips the demo wallet
const extraPath = extra.startsWith('/') ? extra.split('?')[0] : '/';
const extraQuery = extra.includes('?') ? extra.split('?')[1] : (extra.startsWith('/') ? '' : extra);
const noWallet = extraQuery.includes('nowallet');
const frames = Number(framesArg), interval = Number(intervalArg);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(vw), height: 930, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
if (!noWallet) await page.evaluateOnNewDocument(() => { try { localStorage.setItem('emogotchi.wallet', 'demo'); } catch {} });
await page.goto(`http://localhost:5199${extraPath}?dev=1${extraQuery ? '&' + extraQuery : ''}`, { waitUntil: 'networkidle0' });
if (extraPath === '/' && !noWallet && !extraQuery.includes('view=nopet')) await page.waitForFunction(() => window.__pet, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
const stage = await page.$('.stage');
const tag = extra ? '-' + extra.replace(/[^a-z0-9]+/gi, '_') : '';
const dir = `tools/shots/${action}${tag}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
if (action === 'page' || action === 'modal') {
  if (action === 'modal') { await page.click('.hdr .btn'); await new Promise((r) => setTimeout(r, 500)); }
  await page.screenshot({ path: `${dir}/page-${vw}.png`, fullPage: action === 'page' });
}
else {
  // fire the action and capture frames while it runs
  await page.evaluate((a) => {
    const d = window.__pet.director; d.wanderEnabled = false;
    const map = { feed: () => d.feed(), poop: () => d.poop(), clean: () => d.poop().then(() => d.clean()), wash: () => d.wash(), play: () => d.play(),
      sleep: () => d.sleep(), wake: () => d.sleep().then(() => new Promise((r) => setTimeout(r, 1500))).then(() => d.wake()), pet: () => d.pet(1), walk: () => d.walk(120).then(() => d.walk(480)), rumble: () => d.rumble(), yawn: () => d.yawn(), hairflick: () => d.hairflick(), night: () => { window.__pet.dispatch({ type: 'slept', on: true }); return d.sleep().then(() => new Promise((r) => setTimeout(r, 1600))); }, die: () => { window.__pet.dispatch({ type: 'kill' }); return new Promise((r) => setTimeout(r, 4500)); }, revive: () => { window.__pet.dispatch({ type: 'kill' }); return new Promise((r) => setTimeout(r, 4200)).then(() => { window.__pet.dispatch({ type: 'revived' }); return d.revive(); }); }, paidfeed: () => { window.__pet.dispatch({ type: 'pay', action: 'feed' }); return d.feed(); }, paidpoop: () => d.poop().then(() => window.__pet.dispatch({ type: 'pooped' })).then(() => new Promise((r) => setTimeout(r, 800))), edgefeed: () => d.walk(480).then(() => d.feed()), edgepoop: () => d.walk(480).then(() => d.poop()), edgewash: () => d.walk(480).then(() => d.wash()), edgethought: () => d.walk(480).then(() => { window.__pet.dispatch({ type: 'set', stats: { fun: 10 } }); return new Promise((r) => setTimeout(r, 1500)); }), sad: () => { window.__pet.dispatch({ type: 'set', stats: { food: 10, fun: 10, clean: 10 } }); return new Promise((r) => setTimeout(r, 3500)); }, idle: () => new Promise((r) => setTimeout(r, 4000)), tour: () => d.tour() };
    window.__done = false; map[a]().then(() => { window.__done = true; });
  }, action);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    if (crop === 'page') { await page.screenshot({ path: `${dir}/${String(i).padStart(2, '0')}.png` }); }
    else if (crop) {
      const r = await page.evaluate(() => { const b = document.querySelector('.cathost').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      await page.screenshot({ path: `${dir}/${String(i).padStart(2, '0')}.png`, clip: { x: Math.max(0, r.x - 90), y: Math.max(0, r.y - 30), width: r.w + 180, height: r.h + 70 } });
    } else await stage.screenshot({ path: `${dir}/${String(i).padStart(2, '0')}.png` });
    const next = t0 + (i + 1) * interval; const w = next - Date.now(); if (w > 0) await new Promise((r) => setTimeout(r, w));
  }
  const done = await page.evaluate(() => window.__done);
  console.log(`${action}: done=${done} after ${Date.now() - t0}ms`);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
