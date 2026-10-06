// Frame-by-frame sheets of every action on the PFP lab stage, to choose the moments the profile pictures freeze on.
//   node tools/pfp-moments.mjs [cat|frog|sahur|thiccums|r3tards] [action,...] [--every=120] [--out=dir] [--base=<server>] [--costume=a,b] [--scene=kotel]
//   (a dev server on 5199, or a production build on tools/serve-dist.mjs). dreidel, darbuka, kapparot and falcon are
//   Play and Pet with that shop item (the lab sets it).
// Each sheet is one action: frames every `every` ms from the start, numbered, so `at = index * every`.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://localhost:5199'); const EVERY = Number(arg('every', '120')); const OUT = arg('out', 'pfp-moments');
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CHARS = pos[0] ? [pos[0]] : ['cat', 'frog', 'sahur', 'thiccums'];
const PACK = ['dreidel', 'darbuka', 'kapparot', 'falcon'];
const DRESS = `${arg('costume', '') ? '&costume=' + arg('costume', '') : ''}${arg('scene', '') ? '&scene=' + arg('scene', '') : ''}`;
const ACTIONS = { cat: ['feed', 'wash', 'play', 'pet', 'poop', 'yawn', 'rumble', 'die', ...PACK], frog: ['feed', 'wash', 'play', 'pet', 'poop', 'yawn', 'screenshot', 'slap', 'squeeze', 'burn', 'die', ...PACK], sahur: ['feed', 'wash', 'play', 'pet', 'poop', 'yawn', 'tung', 'die', ...PACK], thiccums: ['feed', 'wash', 'play', 'pet', 'poop', 'yawn', 'bounce', 'die', ...PACK], r3tards: ['feed', 'wash', 'play', 'pet', 'poop', 'yawn', 'die', ...PACK] };
const only = pos[1] ? pos[1].split(',') : null;
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 600, height: 460, deviceScaleFactor: 1 });
const sheetPage = await browser.newPage();
for (const c of CHARS) for (const action of (only ?? ACTIONS[c])) {
  await page.bringToFront();
  await page.goto(`${BASE}/pfplab?character=${c}&card=content&action=${action}${DRESS}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready, { timeout: 20000, polling: 200 });
  await page.evaluate(() => { window.__done = false; window.__act().then(() => { window.__done = true; }, () => { window.__done = true; }); });
  const frames = []; const t0 = Date.now(); let i = 0;
  while (true) {
    const st = await page.$('.pfplab .stage'); const f = `${OUT}/${c}-${action}-${String(i).padStart(2, '0')}.png`;
    await st.screenshot({ path: f }); frames.push(f); i++;
    if (await page.evaluate(() => window.__done) || Date.now() - t0 > 20000) break;
    const next = t0 + i * EVERY; const wait = next - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(6,200px);gap:6px;padding:6px">${frames.map((f, k) => `<figure style="margin:0"><img src="file://${resolve(f)}" style="width:200px"><figcaption style="color:#ccc;font:11px sans-serif;text-align:center">${k} · ${k * EVERY}ms</figcaption></figure>`).join('')}</body></html>`;
  const hp = `${OUT}/.sheet.html`; writeFileSync(hp, html);
  await sheetPage.setViewport({ width: 1248, height: 800 }); await sheetPage.goto('file://' + resolve(hp), { waitUntil: 'networkidle0' });
  await sheetPage.screenshot({ path: `${OUT}/${c}-${action}-sheet.png`, fullPage: true });
  for (const f of frames) unlinkSync(f); unlinkSync(hp);
  console.log(c, action, frames.length, 'frames');
}
await browser.close();
