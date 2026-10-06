// The pictures the r3tardgotchi mint page PREVIEW uses (/r3tardgotchi, dev only), into apps/web/src/r3tards/mint/ (bundled
// only with that dev-only page; nothing here goes in public/):
//   wall.png     the wall of his faces behind the page (a tile that repeats both ways), from his own drawing: lips in the
//                r3tards colours, a few mouths and eyes
//   mood-*.png   the nine wallet moods (the happy one crowned), from the lab's card view
//   look-*.png   him in the shop's items
// They are written as .png; turn them into .webp (PIL: the wall as it is, the stills cropped to the middle two thirds,
// x 17-83%, y 25-91%, at 384) and delete the .png: R3Mint.tsx loads ./mint/*.webp.   node tools/r3-mint-art.mjs [--base=http://127.0.0.1:5263] [--only=wall|moods|looks]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263'); const ONLY = arg('only', '');
const OUT = 'apps/web/src/r3tards/mint'; fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });

if (!ONLY || ONLY === 'wall') {
  const svg = fs.readFileSync('packages/pet/r3tards.svg', 'utf8');
  const W = 1500, H = 1020, COLS = 4, ROWS = 3, K = 2.8;   // px per drawing unit: a face is ~325 px wide, shoulder to shoulder like the club's wall
  const LIPS = ['#965E4C', '#B3262F', '#8A63C7', '#7C7448', '#C8822E', '#C06AA6', '#965E4C', '#B3262F', '#7C7448', '#965E4C', '#8A63C7', '#C8822E'];
  const MOUTH = ['idle', 'yum', 'smile', 'idle', 'smug', 'idle', 'frown', 'idle', 'yum', 'smile', 'idle', 'smug'];
  const EYES = ['open', 'open', 'happy', 'open', 'open', 'closed', 'open', 'open', 'open', 'happy', 'open', 'open'];
  const ROT = [-7, 5, -3, 8, 4, -6, 7, -4, -8, 3, 6, -5];
  let css = `html,body{margin:0;background:transparent}#t{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.f{position:absolute;width:${200 * K}px;height:${230 * K}px}.f svg{width:100%;height:100%;display:block;overflow:visible}
.f #figure > *:not(#head), .f #shadow, .f .r3rim{display:none}`;
  let html = '';
  let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, n++) {
    const cx = (c + 0.5 + (r % 2 ? 0.5 : 0)) * (W / COLS) + (n % 3 - 1) * 14; const cy = (r + 0.5) * (H / ROWS) + ((n * 7) % 5 - 2) * 9;
    css += `.f${n} path[fill="#965E4C"]{fill:${LIPS[n]}}`;
    if (MOUTH[n] !== 'idle') css += `.f${n} #mouth-idle{display:none}.f${n} #mouth-${MOUTH[n]}{display:inline}`;
    if (EYES[n] !== 'open') css += `.f${n} .eye .open{display:none}.f${n} .eye .${EYES[n]}{display:inline}`;
    // the face's middle in the drawing is (100, 80); a copy a tile away for whatever crosses the right edge
    for (const dx of [0, -W]) html += `<div class="f f${n}" style="left:${(cx + dx - 100 * K).toFixed(1)}px;top:${(cy - 80 * K).toFixed(1)}px;transform:rotate(${ROT[n]}deg);transform-origin:${100 * K}px ${80 * K}px">${svg}</div>`;
  }
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(`<style>${css}</style><div id="t">${html}</div>`);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/wall.png`, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  await page.close(); console.log('wall');
}
const card = async (query, file) => {
  const page = await browser.newPage(); await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/r3tards?${query}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready === true, { timeout: 20000 });
  const el = await page.$('.nft-art'); await el.screenshot({ path: `${OUT}/${file}.png` });
  await page.close();
};
if (!ONLY || ONLY === 'moods') {
  for (const m of ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead']) await card(`card=${m}${m === 'happy' ? '&crown=1' : ''}`, `mood-${m}`);
  console.log('moods');
}
if (!ONLY || ONLY === 'looks') {
  const LOOKS = { witch: 'costume=witch', pumpkin: 'costume=pumpkin', mummy: 'costume=mummy', zombie: 'costume=zombie', emohair: 'costume=emohair', kippah: 'costume=kippah,starofdavid', habibi: 'costume=bisht,keffiyeh', pharaoh: 'costume=mummy&crown=1' };
  for (const [k, q] of Object.entries(LOOKS)) await card(`card=content&${q}`, `look-${k}`);
  console.log('looks');
}
await browser.close(); process.exit(0);
