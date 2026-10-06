// Emotown's Fight Club in the sandbox: the arena at rest, then a fight on the outdoor ring, filmed.
//   node tools/fightclub/town-shots.mjs <out dir> [l=cat r=frog w=0 width=1440 height=900]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.argv[2] ?? '/tmp/fighttown'; mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const BASE = process.env.BASE ?? 'http://localhost:5260';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setViewport({ width: Number(opt.width ?? 1440), height: Number(opt.height ?? 900), deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await p.goto(`${BASE}/emotown?at=arena`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.tb-arena', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => document.querySelector('.so-chat .tc-close')?.click());
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: join(OUT, 'arena-rest.png') });
await p.evaluate((o) => window.__fightTown({ left: o.l ?? 'cat', right: o.r ?? 'frog', winner: Number(o.w ?? 0) }), opt);
const frames = [];
for (let i = 0; i < 26; i++) { await new Promise((r) => setTimeout(r, 750)); const f = join(OUT, `town-${String(i).padStart(2, '0')}.png`); const sl = await p.evaluate(() => Math.round(document.querySelector('.town-scroll')?.scrollLeft ?? -1)); await p.screenshot({ path: f, clip: { x: 0, y: 150, width: Number(opt.width ?? 1440), height: Number(opt.height ?? 900) - 150 }, captureBeyondViewport: false }); frames.push(f); console.log(i, 'scrollLeft', sl); }
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,440px);gap:4px">${frames.map((f, i) => `<div style="color:#aaa;font:11px sans-serif"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:440px;display:block">${((i + 1) * 0.75).toFixed(2)}s</div>`).join('')}</body></html>`;
const s = await b.newPage(); await s.setViewport({ width: 4 * 444, height: 300 }); await s.setContent(html); await new Promise((r) => setTimeout(r, 300));
await s.screenshot({ path: join(OUT, 'town-sheet.png'), fullPage: true });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
