// The link-preview card for /pfps: apps/web/public/brand/pfps-og.png, 1200x630. The copy on the left, and on the right
// a staggered wall of the profile pictures themselves (read from apps/web/public/pfp, so run it after tools/pfps.mjs),
// round like every app shows them, each ringed in its pet's colour.
//   node tools/og-pfps.mjs
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const heart = readFileSync(root + 'tools/og/card.html', 'utf8').match(/<div class="brand">(<svg[\s\S]*?<\/svg>)/)[1];
const PFP = root + 'apps/web/public/pfp/';
const RING = { cat: '#E84D7F', frog: '#5da03a', sahur: '#d2822e', thiccums: '#6fb7e8' };
// the wall, column by column (four pets, mixed): the loudest pictures of the set
const WANT = [
  ['sahur', 'act-tung-3150-zombie'], ['cat', 'happy-crown'], ['frog', 'act-slap-2100'],
  ['thiccums', 'act-bounce-1050'], ['sahur', 'happy-close'], ['cat', 'act-falcon-3300-bisht-keffiyeh'],
  ['cat', 'content-witch'], ['frog', 'act-burn-2700'], ['thiccums', 'content-crown-bisht-keffiyeh'],
  ['frog', 'content-kippah-starofdavid'], ['thiccums', 'happy-pumpkin-full'], ['sahur', 'act-tung-3000-crown-witch'],
];
const picks = WANT.filter(([c, f]) => existsSync(`${PFP}${c}/${f}.png`));
if (picks.length < 12) throw new Error(`only ${picks.length} of the chosen pictures exist: run node tools/pfps.mjs first`);
const cols = [picks.slice(0, 3), picks.slice(3, 6), picks.slice(6, 9), picks.slice(9, 12)];
const tile = (c, f, size) => `<div class="t" style="width:${size}px;height:${size}px;border-color:${RING[c]};box-shadow:0 0 0 6px ${RING[c]}33, 0 24px 50px -20px rgba(0,0,0,.9)"><img src="file://${PFP}${c}/${f}.png"></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'SG'; src: url('file://${font}') format('woff2'); font-weight: 300 700; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; background:#000; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:1200px; height:630px; overflow:hidden; background: radial-gradient(120% 90% at 30% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%); }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) 2.6px, transparent 2.8px); background-size:44px 44px; -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.2) 55%, transparent); }
.copy { position:absolute; left:64px; top:0; height:630px; width:470px; display:flex; flex-direction:column; justify-content:center; gap:20px; padding-bottom:10px; z-index:2; }
.brand { display:flex; align-items:center; gap:14px; font-weight:700; font-size:40px; letter-spacing:-.02em; } .brand svg { width:36px; height:36px; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:8px 16px; border-radius:999px; font-size:16px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; font-size:78px; line-height:1.0; letter-spacing:-.035em; font-weight:700; background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:23px; line-height:1.4; color:rgba(248,248,255,.82); } .sub b { color:#F8F8FF; font-weight:600; }
.foot { position:absolute; left:64px; bottom:34px; font-size:18px; color:rgba(234,198,234,.75); z-index:2; } .foot b { color:#EAC6EA; font-weight:600; }
.wall { position:absolute; left:545px; top:-70px; display:flex; gap:22px; transform: rotate(-8deg); transform-origin: 50% 50%; }
.col { display:flex; flex-direction:column; gap:22px; } .col:nth-child(2) { margin-top:92px; } .col:nth-child(3) { margin-top:28px; } .col:nth-child(4) { margin-top:120px; }
.t { border-radius:50%; overflow:hidden; border:5px solid; background:#1a1024; flex:none; } .t img { display:block; width:100%; height:100%; }
.fade { position:absolute; left:0; top:0; bottom:0; width:640px; background: linear-gradient(90deg, #24123f 58%, rgba(36,18,63,0.85) 72%, transparent); z-index:1; }
</style></head><body><div class="card">
<div class="wall">${cols.filter((c) => c.length).map((col) => `<div class="col">${col.map(([c, f]) => tile(c, f, 188)).join('')}</div>`).join('')}</div>
<div class="fade"></div><div class="dots"></div>
<div class="copy">
  <div class="brand">${heart} Emogotchi</div>
  <div class="eyebrow">Free profile pictures</div>
  <h1>Wear your pet.</h1>
  <p class="sub">The cat, the frok, Tung Tung Tung Sahur and Thiccums in <b>every mood, outfit and room</b>, and in the middle of things. Pick one, save it, it's yours.</p>
</div>
<div class="foot"><b>$EMO</b> on Monad · emogotchi.emonad.lol/pfps</div>
</div></body></html>`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await browser.newPage();
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
const tmp = root + 'tools/og/.pfps.rendered.html';
writeFileSync(tmp, html);   // a file:// page may load file:// pictures; about:blank may not
await p.goto('file://' + tmp, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: root + 'apps/web/public/brand/pfps-og.png' });
await browser.close(); unlinkSync(tmp);
console.log('wrote apps/web/public/brand/pfps-og.png from', picks.length, 'pictures');
