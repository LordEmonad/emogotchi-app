// Face sheet: every eye × mouth state, head cropped at 3×. node tools/faces.mjs (dev server on 5199)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 3 });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__pet, { timeout: 10000 });
await page.evaluate(() => { window.__pet.director.wanderEnabled = false; });
fs.rmSync('tools/shots/faces', { recursive: true, force: true }); fs.mkdirSync('tools/shots/faces', { recursive: true });
const eyes = ['open', 'closed', 'happy', 'squeeze']; const mouths = ['idle', 'smug', 'open', 'smile', 'frown', 'yum'];
for (const e of eyes) for (const m of mouths) {
  await page.evaluate((e, m) => { const r = window.__pet.director.petRig; r.face(e, m, 0); }, e, m);
  await new Promise((r) => setTimeout(r, 400));
  const r = await page.evaluate(() => { const b = document.querySelector('.cathost').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.screenshot({ path: `tools/shots/faces/${e}-${m}.png`, clip: { x: r.x + r.w * 0.18, y: r.y + r.h * 0.12, width: r.w * 0.64, height: r.h * 0.5 } });
}
await browser.close();
console.log('faces ok');
