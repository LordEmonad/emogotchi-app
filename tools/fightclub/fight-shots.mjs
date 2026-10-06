// Film a fight in the lab (/fightlab) and lay the frames out as a contact sheet, to review the choreography.
//   node tools/fightclub/fight-shots.mjs <out dir> [l=cat r=sahur w=0 seed=… every=350 name=cat-sahur]
// needs the sandbox's dev server (default http://localhost:5260; BASE=… to change).
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/tmp/fight'; mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const BASE = process.env.BASE ?? 'http://localhost:5260';
const every = Number(opt.every ?? 350);
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
await p.evaluate(() => { window.__done = false; const f = window.__fight; void f.director.play(f.plan).then(() => { window.__done = true; }); });
const frames = [];
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const file = join(OUT, `${name}-${String(frames.length).padStart(3, '0')}.png`);
  await ring.screenshot({ path: file });
  frames.push({ file, t: Date.now() - t0 });
  if (await p.evaluate(() => window.__done)) break;
  const next = t0 + frames.length * every; const w = next - Date.now(); if (w > 0) await new Promise((r) => setTimeout(r, w));
}
// one more after the end, when the dust settles
await new Promise((r) => setTimeout(r, 600));
const last = join(OUT, `${name}-end.png`); await ring.screenshot({ path: last }); frames.push({ file: last, t: Date.now() - t0 });
// the sheet
const cols = 6; const cellW = 300;
const html = `<html><body style="margin:0;background:#111;color:#ccc;font:11px sans-serif;display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:4px;padding:4px">${frames.map((f) => `<div><img src="data:image/png;base64,${readFileSync(f.file).toString('base64')}" style="width:${cellW}px;display:block"><div>${(f.t / 1000).toFixed(2)}s</div></div>`).join('')}</body></html>`;
const sheet = await b.newPage(); await sheet.setViewport({ width: cols * (cellW + 4) + 4, height: 400 });
await sheet.setContent(html); await new Promise((r) => setTimeout(r, 300));
await sheet.screenshot({ path: join(OUT, `${name}-sheet.png`), fullPage: true });
const plan = await p.evaluate(() => JSON.stringify(window.__fight.plan));
writeFileSync(join(OUT, `${name}-plan.json`), plan);
console.log(`${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s, plan ${plan}${errs.length ? `\nERRORS:\n${errs.join('\n')}` : ''}`);
await b.close();
