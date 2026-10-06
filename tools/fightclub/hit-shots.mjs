// Freeze a fight in the lab (/fightlab) at the exact moment of every blow's contact, and after the knockout, to check
// that each strike visibly lands. At each contact it also measures the striking limb's box against the defender's head
// and body boxes (screen px; overlap > 0 = touching).
//   BASE=http://localhost:5261 node tools/fightclub/hit-shots.mjs <out dir> [l=cat r=frog w=0 seed=0x… name=…]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/tmp/hits'; mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const BASE = process.env.BASE ?? 'http://localhost:5261';
const name = opt.name ?? `${opt.l ?? 'cat'}-${opt.r ?? 'sahur'}`;
const qs = new URLSearchParams({ l: opt.l ?? 'cat', r: opt.r ?? 'sahur', ...(opt.w ? { w: opt.w } : {}), ...(opt.seed ? { seed: opt.seed } : {}) });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto(`${BASE}/fightlab?${qs}`, { waitUntil: 'networkidle0' });
await p.waitForFunction(() => window.__fight?.director, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
const ring = await p.$('.fc-arena');
await p.evaluate(() => {
  const f = window.__fight; const d = f.director;
  window.__hits = []; window.__done = false;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; };
  const over = (a, c) => Math.min(Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0), Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
  const orig = d.land.bind(d);
  d.land = async (a, dd, power) => {
    const running = document.getAnimations().filter((x) => x.playState === 'running');
    running.forEach((x) => x.pause());
    const A = f.fighters[a]; const D = f.fighters[dd];
    const ka = A.rig.fightKit(); const kd = D.rig.fightKit();
    // the striking limb: whichever arm group is turned furthest from rest right now
    const ang = (el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI); };
    const limb = ang(ka.el.legL) > ang(ka.el.legR) ? 'legL' : 'legR';
    const lb = box(ka.el[limb]);
    const hit = { a, d: dd, power, limb, attacker: A.character, defender: D.character, head: Math.round(over(lb, box(kd.el.head))), body: Math.round(over(lb, box(kd.el.body))) };
    window.__hits.push(hit);
    await new Promise((r) => { window.__resume = r; });
    running.forEach((x) => { if (x.playState === 'paused') x.play(); });
    return orig(a, dd, power);
  };
  const ob = d.banner.bind(d);
  d.banner = (text, ...r) => { if (text === 'K.O.!') setTimeout(() => { window.__ko = true; }, 700); return ob(text, ...r); };
  void d.play(f.plan).then(() => { window.__done = true; });
});
const frames = []; let seen = 0; const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const n = await p.evaluate(() => window.__hits.length);
  if (n > seen) {
    const hit = await p.evaluate((i) => window.__hits[i], n - 1);
    const file = join(OUT, `${name}-hit${n}.png`); await ring.screenshot({ path: file });
    frames.push({ file, label: `#${n} ${hit.attacker}→${hit.defender} ${hit.limb} head ${hit.head} body ${hit.body}` });
    console.log(frames.at(-1).label);
    seen = n; await p.evaluate(() => window.__resume?.());
  }
  if (await p.evaluate(() => window.__ko === true)) {
    await p.evaluate(() => { window.__ko = 'shot'; });
    const file = join(OUT, `${name}-ko.png`); await ring.screenshot({ path: file }); frames.push({ file, label: 'K.O.' });
  }
  if (await p.evaluate(() => window.__done)) break;
  await new Promise((r) => setTimeout(r, 15));
}
for (const [tag, wait] of [['end', 0], ['end+1.5s', 1500]]) {
  await new Promise((r) => setTimeout(r, wait)); const file = join(OUT, `${name}-${tag}.png`); await ring.screenshot({ path: file }); frames.push({ file, label: tag });
}
const cols = 4; const cellW = 420;
const html = `<html><body style="margin:0;background:#111;color:#ccc;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:4px;padding:4px">${frames.map((f) => `<div><img src="data:image/png;base64,${readFileSync(f.file).toString('base64')}" style="width:${cellW}px;display:block"><div>${f.label}</div></div>`).join('')}</body></html>`;
const sheet = await b.newPage(); await sheet.setViewport({ width: cols * (cellW + 4) + 4, height: 400 });
await sheet.setContent(html); await new Promise((r) => setTimeout(r, 300));
await sheet.screenshot({ path: join(OUT, `${name}-hits.png`), fullPage: true });
console.log(`${seen} contacts${errs.length ? `\nERRORS:\n${errs.join('\n')}` : ''}`);
await b.close();
