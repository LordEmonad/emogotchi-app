// Fight Club's link card (brand/fightclub-og.png): the basement at the moment Tung Tung Tung Sahur's bat lands on the
// cat, from the lab's own fight (the real rigs, the real strike), the title set in the site's type over it.
//   node tools/og-fightclub.mjs [--site <dev server>] [--bare]     (default http://127.0.0.1:5199; /fightlab is a DEV route)
// Writes apps/web/public/brand/fightclub-og.png (1200x630). Run it by hand when the fight changes; not redrawn on deploy.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : 'http://127.0.0.1:5199';
const BARE = process.argv.includes('--bare');   // no words: brand/fightclub-live.webp, for the home page's live row (2026-10-02);
// with no words to make room for, the ring fills the whole frame (the card's framing left an empty strip down the left
// of the home page's picture on phones, 2026-10-06)
const OUT = process.env.OUT ?? join(ROOT, BARE ? 'apps/web/public/brand/fightclub-live.webp' : 'apps/web/public/brand/fightclub-og.png');
const RAW = OUT.replace(/\.(png|webp)$/, '-2x.png');
// a fixed random number: the same fight every time (Sahur on the left wins; the first blow that lands is his)
const SEED = '0x7c0ffee0000000000000000000000000000000000000000000000000000f1647';
const HIT = Number(process.env.HIT ?? 1);   // which of Sahur's landed blows to freeze on (1 = his first)
const BY = Number(process.env.BY ?? 0);     // whose blow: 0 = the left fighter (Sahur)

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.goto(`${SITE}/fightlab?l=sahur&r=cat&w=0&seed=${SEED}`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForFunction(() => window.__fight?.director, { timeout: 60_000 });
await page.addStyleTag({ content: `
  body { background: #12071f !important; overflow: hidden !important; }
  .fl-title, .fl-panel, .fl-actions, .hdr, footer { display: none !important; }
  .page, .fl-grid, .fl-ring { position: static !important; display: block !important; max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .fc-arena { position: fixed !important; left: ${process.env.LEFT ?? (BARE ? 0 : 300)}px !important; top: ${process.env.TOP ?? (BARE ? -243 : -178)}px !important; width: ${process.env.WIDTH ?? (BARE ? 1200 : 1060)}px !important; height: auto !important; border-radius: 0 !important; z-index: 1; }
  .og-veil { position: fixed; inset: 0; pointer-events: none; z-index: 99;
    background: linear-gradient(180deg, rgba(10, 5, 20, 0.82) 0%, rgba(10, 5, 20, 0.35) 34%, rgba(10, 5, 20, 0) 58%), linear-gradient(0deg, rgba(10, 5, 20, 0.75) 0%, rgba(10, 5, 20, 0) 26%); }
  .og-title { position: fixed; left: 56px; top: 40px; z-index: 100; font-family: var(--font-sans); color: #F8F8FF; }
  .og-title em { display: inline-block; vertical-align: top; margin: 14px 0 0 16px; padding: 7px 14px 6px; border-radius: 12px; background: #E84D7F; color: #fff; font-style: normal; font-size: 26px; font-weight: 800; letter-spacing: 0.08em; box-shadow: 0 6px 22px rgba(232, 77, 127, 0.45); }
  .og-title b { display: inline-block; font-size: 104px; line-height: 0.95; font-weight: 800; letter-spacing: -0.035em; text-shadow: 0 6px 34px rgba(232, 77, 127, 0.45), 0 2px 0 rgba(0,0,0,0.4); }
  .og-title span { display: block; margin-top: 14px; font-size: 32px; font-weight: 600; letter-spacing: -0.01em; color: rgba(248,248,255,0.92); text-shadow: 0 2px 12px rgba(0,0,0,0.6); }
  .og-foot { position: fixed; left: 56px; bottom: 36px; z-index: 100; font-family: var(--font-sans); font-size: 22px; font-weight: 600; color: rgba(248,248,255,0.78); text-shadow: 0 2px 12px rgba(0,0,0,0.7); }
  .og-foot b { display: block; margin-bottom: 10px; font-size: 34px; font-weight: 700; letter-spacing: -0.01em; color: #F8F8FF; }
  .og-foot i { font-style: normal; color: #E84D7F; margin-right: 12px; }
  .og-mark { position: fixed; right: 56px; bottom: 36px; z-index: 100; font-family: var(--font-sans); font-size: 26px; font-weight: 800; color: #F8F8FF; text-shadow: 0 2px 12px rgba(0,0,0,0.7); }
  .og-mark i { font-style: normal; color: #E84D7F; margin-right: 10px; }
` });
// run the fight and freeze at the chosen landing blow (the same trick as tools/fightclub/hit-shots.mjs)
await page.evaluate((HIT, BY) => {
  const f = window.__fight; const d = f.director;
  window.__frozen = false; let n = 0;
  const orig = d.land.bind(d);
  d.land = async (a, dd, power) => {
    if (a === BY) n++;
    if (a === BY && n === HIT) {
      document.getAnimations().forEach((x) => { if (x.playState === 'running') x.pause(); });
      window.__frozen = true;
      await new Promise(() => {});   // never resumes: the picture is taken here
    }
    return orig(a, dd, power);
  };
  void d.play(f.plan);
}, HIT, BY);
await page.waitForFunction(() => window.__frozen === true, { timeout: 60_000 });
if (!BARE) await page.evaluate(() => {
  const v = document.createElement('div'); v.className = 'og-veil'; document.body.appendChild(v);
  const t = document.createElement('div'); t.className = 'og-title';
  t.innerHTML = '<b>Fight Club</b><em>BETA</em>';
  document.body.appendChild(t);
  const f = document.createElement('div'); f.className = 'og-foot'; f.innerHTML = '<b>Any pet against any pet. Winner takes the pot.</b><i>♥</i>2 to 1,000 MON a side · 50/50, provably random · Live on Monad'; document.body.appendChild(f);
  const m = document.createElement('div'); m.className = 'og-mark'; m.innerHTML = '<i>♥</i>Emogotchi'; document.body.appendChild(m);
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: RAW });
await browser.close();
execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(RAW)}).convert('RGB').resize((1200, 630), Image.LANCZOS).save(${JSON.stringify(OUT)}, ${BARE ? 'quality=84, method=6' : 'optimize=True'})`]);
execFileSync('rm', [RAW]);
console.log(`wrote ${OUT}`);
