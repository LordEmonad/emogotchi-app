// Emotown profile banners (2026-09-26): the town's own streets, drawn by the town itself with nobody on them.
//   node tools/social-banners.mjs        (dev server on 5199: cd apps/web && npx vite --port 5199 --strictPort)
// Writes apps/web/public/social/banners/<id>.webp, 1500x500: each landmark at night (the town's signature look), and
// the park by day in each season. The ids are rules.js BANNERS; a profile stores only the id.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = 'apps/web/public/social/banners';
const PLACES = ['hall', 'diner', 'baths', 'park', 'shop', 'inn', 'furnace', 'haunted', 'backrooms', 'graveyard'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const shots = [
  ...PLACES.map((id) => ({ id, q: `at=${id}&time=night&season=autumn` })),
  ...SEASONS.map((s) => ({ id: s, q: `at=park&time=${s === 'winter' ? 'dusk' : 'day'}&season=${s}` })),
];
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
// at 1000 px tall the street is drawn at scale 1; the banner is the band from the rooftops to the pavement
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
for (const s of shots) {
  await page.goto(`${BASE}/emotown?${s.q}&empty=1`, { waitUntil: 'networkidle0' });
  // no live numbers in a picture that never changes: the furnace's counter and the crown board's list go blank
  await page.addStyleTag({ content: '.town-ui, .so-bubbles, .pet-donors { display: none !important; } .burn-plate .num, .crown-list { visibility: hidden !important; }' });
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.loading = 'eager', i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))));
  // let the camera settle where ?at= put it, then hold still (a shot mid-scroll doubled the town hall once)
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/${s.id}.webp`, type: 'webp', quality: 80, clip: { x: 0, y: 250, width: 1500, height: 500 } });
  console.log('wrote', s.id);
}
await browser.close();
