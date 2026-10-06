// r3tardgotchi's brand kit, in the look of his mint page (the purple wall of faces with its grain, the handwritten word,
// black cards with a white line round them): the two pictures his contractURI names, a logo, an icon, an X header.
//   node tools/r3-brand.mjs [--base=http://127.0.0.1:5263] [--only=opensea-banner,logo]
// -> apps/web/public/brand/r3tardgotchi-{og,og-live,opensea-banner,opensea-featured,logo,icon,x-header}.png (og = the mint
//    page's link card while it says coming soon, og-live = from launch on), and the two OpenSea
//    pictures again under apps/web/public/r3tardgotchi/brand/ (his siteURI's own path, where contractURI points).
// He is drawn by the lab's card view (/r3tards?card=, dev server needed).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { resolve } from 'node:path';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263'); const ONLY = arg('only', '').split(',').filter(Boolean);
const OUT = resolve('apps/web/public/brand'); const HIS = resolve('apps/web/public/r3tardgotchi/brand');
const R3 = resolve('apps/web/src/r3tards');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });

// ---- him: the card view in his room (1024 square), or cut out on nothing (&bare=1)
const cp = await browser.newPage(); await cp.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
const shots = new Map();
const him = async (q, bare = false) => {
  const key = q + (bare ? '|bare' : ''); if (shots.has(key)) return shots.get(key);
  await cp.bringToFront();   // a background tab never paints: its ready flag (set on a frame) would never come
  await cp.goto(`${BASE}/r3tards?card=${q}${bare ? '&bare=1' : ''}`, { waitUntil: 'networkidle0' });
  await cp.waitForFunction(() => window.__card_ready === true, { timeout: 20000 });
  const png = await (await cp.$('.nft-art')).screenshot({ encoding: 'base64', omitBackground: bare });
  shots.set(key, `data:image/png;base64,${png}`); return shots.get(key);
};
/** where he is in a look's 1024 picture: the alpha box of the same look cut out (hat, crown and all) */
const boxes = new Map();
const where = async (q) => {
  if (boxes.has(q)) return boxes.get(q);
  const src = await him(q, true);
  const b = await cp.evaluate(async (src) => {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 1024, 1024);
    const d = x.getImageData(0, 0, 1024, 1024).data; let l = 1024, t = 1024, r = 0, bt = 0;
    for (let y = 0; y < 1024; y++) for (let xx = 0; xx < 1024; xx++) if (d[(y * 1024 + xx) * 4 + 3] > 40) { if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > bt) bt = y; }
    return { l, t, r, b: bt };
  }, src);
  boxes.set(q, b); return b;
};

const grain = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='2.6 0 0 0 -0.8  2.6 0 0 0 -0.8  2.6 0 0 0 -0.8  0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E";
const FONTS = `@font-face{font-family:'Gloria';src:url(data:font/woff2;base64,${b64(R3 + '/fonts/GloriaHallelujah-400.woff2')})}
@font-face{font-family:'School';src:url(data:font/woff2;base64,${b64(R3 + '/fonts/Schoolbell-400.woff2')})}
@font-face{font-family:'Plex';src:url(data:font/woff2;base64,${b64(R3 + '/fonts/IBMPlexMono-500.woff2')})}`;
const WALL = `data:image/webp;base64,${b64(R3 + '/mint/wall.webp')}`;
/** the common sheet: `u` is the unit every size is given in (px per design unit), so one layout serves every size */
const base = (w, h, u, wall = true, wallAt = '0 0', tile = 1240) => `<style>${FONTS}
html,body{margin:0;background:#573d76}#c{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#573d76 ${wall ? `url(${WALL}) ${wallAt} / ${tile * u}px auto` : ''}}
#g{position:absolute;inset:0;background:url("${grain}") 0 0 / ${300 * u}px ${300 * u}px;opacity:.4;mix-blend-mode:overlay;z-index:5;pointer-events:none}
h1{position:absolute;left:0;right:0;margin:0;text-align:center;font-family:'Gloria';font-weight:400;line-height:1.2;color:#fff;letter-spacing:-.02em;paint-order:stroke fill;white-space:nowrap;z-index:3}
.card{position:absolute;box-sizing:border-box;background:#000;border:${4 * u}px solid #fff;border-radius:${16 * u}px;box-shadow:0 ${14 * u}px 0 rgba(0,0,0,.32)}
.pill{position:absolute;top:${-23 * u}px;left:${20 * u}px;background:#fff;color:#000;border:${3 * u}px solid #000;border-radius:999px;padding:${6 * u}px ${16 * u}px;font:500 ${21 * u}px 'Plex';letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;z-index:2}
.shot{padding:${10 * u}px}.shot .in{width:100%;height:100%;border-radius:${8 * u}px;overflow:hidden;background:#241038}
.shot img{display:block}
</style>`;
const word = (size, top, u) => `<style>h1{top:${top * u}px;font-size:${size * u}px;-webkit-text-stroke:${(size * 0.079 * u).toFixed(1)}px #000;text-shadow:0 ${(size * 0.062 * u).toFixed(1)}px 0 #000}</style><h1>r3tardgotchi</h1>`;
/** A framed shot of him in his room, cropped to him: the frame's inside shows him whole with `air` (a share of his height)
 *  over his head and a little floor under his feet, centred on him. Sizes in design units. */
const shot = async (q, x, y, w, h, tilt, u, air = 0.1, pill = '', floor = 0.09) => {
  const src = await him(q); const b = await where(q);
  const inW = w - 28, inH = h - 28;                        // inside the border (4) and the padding (10), each side
  const fh = (b.b - b.t) * (1 + air + floor);                // the slice of the picture shown, in its pixels: his height, the air, the floor
  const sh = Math.max(fh, (b.r - b.l) * 1.12 * inH / inW); const sw = sh * inW / inH;
  const sx = (b.l + b.r) / 2 - sw / 2; const sy = b.b + (b.b - b.t) * floor - sh;
  const k = inW / sw;
  return `<div class="card shot" style="left:${x * u}px;top:${y * u}px;width:${w * u}px;height:${h * u}px;transform:rotate(${tilt}deg)">${pill ? `<span class="pill">${pill}</span>` : ''}<div class="in"><img style="width:${1024 * k * u}px;margin:${-sy * k * u}px 0 0 ${-sx * k * u}px" src="${src}"></div></div>`;
};

// the five looks for a row
const ROW = ['content&costume=witch', 'content&costume=mummy&crown=1', 'content&crown=1', 'content&costume=zombie', 'content&costume=bisht,keffiyeh'];
const row = async (x0, y, w, h, gap, u) => {
  let out = '';   // one at a time: the card page is one tab
  for (const [i, q] of ROW.entries()) out += await shot(q, x0 + i * (w + gap), y + [8, -5, 3, -6, 6][i], w, h, [-2.2, 1.4, -0.8, 1.8, -1.6][i], u);
  return out;
};

/** the mint page's link card, 1200x630: the word, the offer, him crowned in a framed stage. `pill` is the offer's tag. */
const og = (pill) => async () => `${base(1200, 630, 1, true, '-150px -96px')}<div id="c"><div id="g"></div>${word(178, -6, 1)}
<div class="card" style="left:46px;top:318px;width:640px;height:262px;padding:44px 34px 0;transform:rotate(-1.2deg)"><span class="pill">${pill}</span>
<p style="margin:0;font:400 62px/1.14 'Gloria';color:#fff;white-space:nowrap">Meet the r3tard.</p><p style="margin:0;font:400 62px/1.14 'Gloria';color:#aaff72;white-space:nowrap">Mint him free.</p>
<small style="display:block;margin-top:12px;font:400 31px/1.2 'School';color:#ededed;white-space:nowrap">He lives in your wallet, on Monad.</small></div>
${await shot('content&crown=1', 782, 284, 372, 310, 1.6, 1, 0.07, 'The fifth pet', 0.035)}</div>`;

const PIECES = {
  // the mint page's link cards (og-meta.mjs r3tardgotchi): before launch, and from launch on (tools/r3tards-launch.mjs
  // points the page's tags at the second)
  // (the coming-soon card on the site is the one the operator approved on 2026-10-01; `--only=og` redraws it)
  og: { w: 1200, h: 630, html: og('Free mint · coming soon'), ask: true },
  'og-live': { w: 1200, h: 630, html: og('Free mint · open now') },
  // OpenSea's header, 2400x900 (8:3): a phone keeps the middle 16:9 (x 400..2000), the collection's round logo sits over the
  // bottom left. So: the word across the middle, five framed looks under it, all inside the middle
  'opensea-banner': { w: 2400, h: 900, html: async () => { const u = 2; return `${base(2400, 900, u, true, `${-70 * u}px ${-52 * u}px`, 760)}<div id="c"><div id="g"></div>${word(122, -8, u)}${await row(206, 212, 148, 196, 12, u)}</div>`; } },
  // OpenSea's featured picture, 1200x800 (3:2): the mint page's top
  'opensea-featured': { w: 1200, h: 800, html: async () => { const u = 1; return `${base(1200, 800, u, true, '-150px -40px')}<div id="c"><div id="g"></div>${word(176, -4, u)}
<div class="card" style="left:46px;top:372px;width:640px;height:300px;padding:52px 34px 0;transform:rotate(-1.2deg)"><span class="pill">The fifth pet · free mint</span>
<p style="margin:0;font:400 62px/1.14 'Gloria';color:#fff;white-space:nowrap">Meet the r3tard.</p><p style="margin:0;font:400 62px/1.14 'Gloria';color:#aaff72;white-space:nowrap">Mint him free.</p>
<small style="display:block;margin-top:14px;font:400 31px/1.2 'School';color:#ededed;white-space:nowrap">He lives in your wallet, on Monad.</small></div>
${await shot('content&crown=1', 782, 330, 372, 400, 1.6, u, 0.12, 'Emogotchi')}</div>`; } },
  // the logo, 1024 square: him whole, crowned, on the wall's purple with its grain (no faces behind: at avatar size they are noise)
  logo: { w: 1024, h: 1024, html: async () => `${base(1024, 1024, 1, false)}<div id="c"><div id="g"></div><img style="position:absolute;left:-205px;top:-196px;width:1434px" src="${await him('content&crown=1', true)}"></div>` },
  // the icon, 1024 square: his face, the reference's own framing (the face on purple)
  icon: { w: 1024, h: 1024, html: async () => `${base(1024, 1024, 1, false)}<div id="c"><div id="g"></div><img style="position:absolute;left:-1010px;top:-640px;width:3050px" src="${await him('content', true)}"></div>` },
  // X's header, 1500x500 at 2x: the profile picture covers the bottom left, so everything sits in the middle and right
  'x-header': { w: 3000, h: 1000, html: async () => { const u = 2; return `${base(3000, 1000, u, true, `${-90 * u}px ${-40 * u}px`, 900)}<div id="c"><div id="g"></div>${word(140, -10, u)}${await row(338, 244, 156, 206, 14, u)}</div>`; } },
};

const page = await browser.newPage();
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(HIS, { recursive: true });
for (const [name, P] of Object.entries(PIECES)) {
  if (ONLY.length ? !ONLY.includes(name) : P.ask) continue;
  await page.setViewport({ width: P.w, height: P.h, deviceScaleFactor: 1 });
  await page.setContent(await P.html());
  await page.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 700));
  const file = `${OUT}/r3tardgotchi-${name}.png`;
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: P.w, height: P.h } });
  if (name.startsWith('opensea-')) fs.copyFileSync(file, `${HIS}/r3tardgotchi-${name}.png`);
  console.log('->', file);
}
await browser.close(); process.exit(0);
