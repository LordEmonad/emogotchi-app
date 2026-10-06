// The link-preview card for /pets (the "Pet gallery", 2026-09-28): apps/web/public/brand/gallery-og.png, 1200x630 at 2x.
// The copy on the left; on the right a wall of the pets' own wallet pictures (apps/web/public/nft, the portraits the art
// contract composes), all three pets mixed across the wall in every mood, crowns, outfits and a ghost or two, tilted
// away like a gallery seen from its door, a few with the gallery's own chips. No numbers: a card with a count goes stale.
//   node tools/og-gallery.mjs
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const heart = readFileSync(root + 'tools/og/card.html', 'utf8').match(/<div class="brand">(<svg[\s\S]*?<\/svg>)/)[1];
const NFT = root + 'apps/web/public/nft/';
const RING = { cat: '#E84D7F', frok: '#5da03a', sahur: '#d2822e' };
const DIR = { cat: '', frok: 'inversebrah/', sahur: 'sahur/' };
// [pet, costume folder ('' = none), picture, chip]
const WALL = [
  ['cat', '', 'happy-crown', ''], ['frok', 'emohair/', 'content', ''], ['sahur', '', 'happy', 'never died'], ['cat', 'witch/', 'sleeping', ''], ['frok', 'pumpkin/', 'happy', ''],
  ['sahur', 'zombie/', 'content', ''], ['cat', 'judaica/', 'happy', ''], ['frok', '', 'dead', ''], ['sahur', 'witch/', 'happy-crown', ''], ['cat', 'mummy/', 'bored', ''],
  ['frok', '', 'happy-crown', 'never died'], ['sahur', 'pumpkin/', 'content', ''], ['cat', '', 'dead', 'revived'], ['frok', 'judaica/', 'content', ''], ['sahur', 'kippah/', 'happy', ''],
  ['cat', '', 'grubby', ''], ['frok', 'witch/', 'sleepy', ''], ['sahur', 'judaica/', 'happy-crown', ''], ['cat', 'zombie/', 'hungry', ''], ['frok', 'mummy/', 'content', ''],
  ['sahur', '', 'sleeping', ''], ['cat', 'pumpkin/', 'content', ''], ['frok', 'zombie/', 'happy', ''], ['sahur', 'mummy/', 'bored', ''], ['cat', 'kippah/', 'happy-crown', 'never died'],
  ['frok', 'emohair/', 'happy-crown', ''], ['sahur', 'emohair/', 'content', ''], ['cat', 'witch/', 'happy-crown', ''], ['frok', 'kippah/', 'sleepy', ''], ['sahur', '', 'dead', 'revived'],
];
const src = ([pet, costume, pic]) => `${NFT}${DIR[pet]}${costume}${pic}-1024.png`;
const missing = WALL.filter((t) => !existsSync(src(t)));
if (missing.length) throw new Error(`missing portraits: ${missing.map(src).join(', ')}`);
const tile = (t) => `<div class="t" style="--c:${RING[t[0]]}"><img src="file://${src(t)}">${t[3] ? `<i class="${t[3] === 'never died' ? 'gold' : 'sun'}">${t[3]}</i>` : ''}</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'SG'; src: url('file://${font}') format('woff2'); font-weight: 300 700; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; background:#000; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:1200px; height:630px; overflow:hidden; background: radial-gradient(120% 90% at 30% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%); }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) 2.6px, transparent 2.8px); background-size:44px 44px; -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.2) 55%, transparent); }
.scene { position:absolute; left:470px; top:-40px; width:900px; height:720px; perspective:1400px; }
.wall { position:absolute; left:34px; top:6px; display:grid; grid-template-columns: repeat(5, 128px); gap:14px; transform: rotateY(-24deg) rotateX(8deg) rotateZ(-4deg); transform-origin: 0% 50%; }
.t { position:relative; width:128px; height:128px; border-radius:19px; overflow:hidden; background:#1a1024; border:3px solid var(--c); box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, transparent), 0 22px 40px -18px rgba(0,0,0,.95); }
.t img { display:block; width:100%; height:100%; }
.t i { position:absolute; left:7px; bottom:7px; padding:3px 8px; border-radius:999px; font-style:normal; font-size:10.5px; font-weight:700; letter-spacing:.02em; }
.t i.gold { background:#F5C542; color:#2a1a05; } .t i.sun { background:rgba(20,12,36,.85); color:#FFD98C; border:1px solid rgba(255,217,140,.5); }
.fade { position:absolute; left:0; top:0; bottom:0; width:620px; background: linear-gradient(90deg, #24123f 62%, rgba(36,18,63,0.8) 78%, transparent); z-index:1; }
.copy { position:absolute; left:64px; top:0; height:630px; width:440px; display:flex; flex-direction:column; justify-content:center; gap:18px; padding-bottom:16px; z-index:3; }
.brand { display:flex; align-items:center; gap:14px; font-weight:700; font-size:38px; letter-spacing:-.02em; } .brand svg { width:34px; height:34px; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:8px 16px; border-radius:999px; font-size:16px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; font-size:74px; line-height:.98; letter-spacing:-.035em; font-weight:700; }
h1 span { display:block; background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:20px; line-height:1.42; color:rgba(248,248,255,.8); } .sub b { color:#F8F8FF; font-weight:600; }
.foot { position:absolute; left:64px; bottom:32px; font-size:18px; color:rgba(234,198,234,.75); z-index:3; } .foot b { color:#EAC6EA; font-weight:600; }
</style></head><body><div class="card">
<div class="scene"><div class="wall">${WALL.map(tile).join('')}</div></div>
<div class="fade"></div><div class="dots"></div>
<div class="copy">
  <div class="brand">${heart} Emogotchi</div>
  <div class="eyebrow">Pet gallery</div>
  <h1>Every pet,<span>live.</span></h1>
  <p class="sub">The <b>cats</b>, the <b>froks</b> and the <b>Sahurs</b>, read straight from Monad: their moods, crowns and outfits, the ones that never died and the ones that did.</p>
</div>
<div class="foot"><b>$EMO</b> on Monad · emogotchi.emonad.lol/pets</div>
</div></body></html>`;

const tmp = mkdtempSync(join(tmpdir(), 'og-gallery-'));
const file = join(tmp, 'card.html');
writeFileSync(file, html);   // a file:// page may load file:// pictures
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.goto('file://' + file, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: root + 'apps/web/public/brand/gallery-og.png' });
await browser.close(); unlinkSync(file);
console.log('wrote apps/web/public/brand/gallery-og.png');
