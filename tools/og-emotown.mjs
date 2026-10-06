// Emotown's link card (brand/emotown-og.png): the live town at night from the park (the EMOTOWN sign on its hill, the
// lamps, the real pets of the day), every piece of interface hidden, and the town's name set in the site's type.
//   node tools/og-emotown.mjs [--site <dev server>] [--bare]     (default http://127.0.0.1:5199; the dev server proxies /api)
// Writes apps/web/public/brand/emotown-og.png (1200x630). Run it by hand when the town changes; it is not redrawn on deploy.
// --bare writes brand/emotown-live.webp instead: the same picture with no words on it, for the home page's live row
// (2026-10-02), whose words are HTML and live.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : 'http://127.0.0.1:5199';
const BARE = process.argv.includes('--bare');
const OUT = join(ROOT, BARE ? 'apps/web/public/brand/emotown-live.webp' : 'apps/web/public/brand/emotown-og.png');
const RAW = OUT.replace(/\.(png|webp)$/, '-2x.png');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.goto(`${SITE}/emotown?at=${process.env.AT ?? 'park'}&time=night`, { waitUntil: 'networkidle2', timeout: 90_000 });
await page.waitForFunction(() => window.__town && window.__town.sim.residents.size > 40, { timeout: 90_000 });
await page.addStyleTag({ content: `
  .town-ui, .so-bubbles, .town-ticker, .map, .town-minimap { display: none !important; }
  .og-veil { position: fixed; inset: 0; pointer-events: none; z-index: 99;
    background: radial-gradient(120% 90% at 0% 0%, rgba(10, 5, 20, 0.86) 0%, rgba(10, 5, 20, 0.55) 34%, rgba(10, 5, 20, 0) 62%); }
  .og-title { position: fixed; left: 56px; top: 44px; z-index: 100; font-family: var(--font-sans); color: #F8F8FF; }
  .og-title em { display: inline-block; vertical-align: top; margin: 14px 0 0 16px; padding: 7px 14px 6px; border-radius: 12px; background: #E84D7F; color: #fff; font-style: normal; font-size: 26px; font-weight: 800; letter-spacing: 0.08em; box-shadow: 0 6px 22px rgba(232, 77, 127, 0.45); }
  .og-title b { display: inline-block; font-size: 104px; line-height: 0.95; font-weight: 800; letter-spacing: -0.035em; text-shadow: 0 6px 34px rgba(232, 77, 127, 0.45), 0 2px 0 rgba(0,0,0,0.4); }
  .og-title span { display: block; margin-top: 16px; font-size: 30px; font-weight: 600; color: #EAC6EA; text-shadow: 0 2px 12px rgba(0,0,0,0.6); }
  .og-title i { display: inline-flex; align-items: center; gap: 10px; margin-top: 18px; padding: 9px 16px; border-radius: 999px; background: rgba(14, 7, 26, 0.72); border: 1.5px solid rgba(234, 198, 234, 0.28); font-style: normal; font-size: 22px; font-weight: 700; color: #F8F8FF; }
  .og-title i::before { content: ''; width: 11px; height: 11px; border-radius: 50%; background: #6BD35A; box-shadow: 0 0 10px #6BD35A; }
` });
// the pets settle, the lamps come on, the street is drawn
await new Promise((r) => setTimeout(r, 9000));
const count = await page.evaluate((BARE) => {
  const n = [...window.__town.sim.residents.values()].filter((r) => !r.inside).length;
  if (BARE) return n;
  const v = document.createElement('div'); v.className = 'og-veil'; document.body.appendChild(v);
  const t = document.createElement('div'); t.className = 'og-title';
  t.innerHTML = '<b>Emotown</b><em>BETA</em><span>Where the pets of Emogotchi hang out</span><i>Live on Monad</i>';
  document.body.appendChild(t);
  return n;
}, BARE);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: RAW });
await browser.close();
// 2400x1260 down to 1200x630, sharply
execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(RAW)}).convert('RGB').resize((1200, 630), Image.LANCZOS).save(${JSON.stringify(OUT)}, ${BARE ? 'quality=84, method=6' : 'optimize=True'})`]);
execFileSync('rm', [RAW]);
console.log(`wrote ${OUT} (${count} pets on the street)`);
