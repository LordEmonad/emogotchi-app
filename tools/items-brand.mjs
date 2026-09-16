// Brand imagery for the Emogotchi Items collection (apps/web/public/brand/items-*).
//
// Same room and the same flat ink as the cats, but the subjects are the items themselves, so the two
// collections read as a family without the second one looking like a copy of the first.
//
// Sizes come from OpenSea's own creator guidance, not from folklore:
//   logo   PNG, 1:1, minimum 240x240. Rendered at 1024 so it stays sharp on a retina screen.
//   header 8:3 on desktop, 16:9 on mobile. THE SAME FILE IS CROPPED BOTH WAYS. A 16:9 slice of an 8:3
//          image is the middle 66.7% of its width, so everything that matters has to live inside that
//          middle two thirds or a phone cuts it off. The old 4:1 banner was the real bug: shown in an
//          8:3 frame only 66.7% of it survives on desktop and only 44.4% on a phone, which is why its
//          edges were missing.
//   OpenSea also drops the round collection logo over the bottom-left and prints the collection name
//   beside it, so nothing goes there and there is no text anywhere.
//
//   node tools/items-brand.mjs [--guides]
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PROPS = root + 'packages/pet/props/';
const ART = root + 'contracts/art/';
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const OUT = root + 'apps/web/public/brand/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GUIDES = process.argv.includes('--guides');
mkdirSync(OUT, { recursive: true });

// the cat, straight from the on-chain blobs, same as tools/brand.mjs
const base = readFileSync(ART + 'base.bin', 'latin1');
const cat = (mood, crown) => {
  const mi = MOODS.indexOf(mood);
  const patch = readFileSync(ART + `patch-${mi * 2 + (crown ? 1 : 0)}.bin`, 'latin1').split('\x01');
  let k = 0; const body = base.replace(/\x01/g, () => patch[k++]);
  const pre = readFileSync(ART + `scene-${mi}-pre.bin`, 'latin1'); const post = readFileSync(ART + `scene-${mi}-post.bin`, 'latin1');
  const defs = pre.slice(pre.indexOf('<defs>'), pre.indexOf('</defs>') + 7);
  const box = pre.slice(pre.lastIndexOf('<svg x='));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${defs}${box}${body}${post}`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'latin1').toString('base64');
};

const prop = (name) => 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(PROPS + name + '.svg', 'utf8'), 'utf8').toString('base64');

/**
 * A room with things standing on the floor. `items` are placed along a line and centred; `w`/`h` set
 * the frame. `safe` draws the 16:9 mobile crop so the layout can be checked by eye.
 */
const page = ({ w, h, items, extra = [], floorAt = 0.84, unit = 0.5, gap = 1.0, dots = true, safe = false, transparent = false }) => {
  const floorY = h * floorAt;
  const U = h * unit;                       // one "item unit" in px: the height of a size-1 item
  const widths = items.map((it) => U * (it.size ?? 1) * (it.ar ?? 1));
  const gaps = items.map((it, i) => (i === 0 ? 0 : U * gap * ((it.gap ?? 1))));
  const total = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  // Centre on the hero if there is one. Centring the bounding box instead puts the subject off to one
  // side whenever the flanking items differ in width, which is what a viewer actually notices.
  const hero = items.findIndex((it) => it.hero);
  let x = w / 2 - total / 2;
  if (hero >= 0) {
    let before = 0;
    for (let i = 0; i <= hero; i += 1) before += gaps[i] + (i < hero ? widths[i] : 0);
    x = w * (items[hero].at ?? 0.5) - widths[hero] / 2 - before;
  }
  const html = items.map((it, i) => {
    x += gaps[i];
    const iw = widths[i];
    const ih = U * (it.size ?? 1);
    const left = x;
    x += iw;
    const bottom = floorY + (it.sink ?? 0) * ih;
    if (it.cat) {
      const H = it.hat;
      const hat = H
        ? `<img style="position:absolute; left:${H.x * iw}px; top:${H.y * ih}px; width:${H.w * iw}px; height:${H.w * iw / AR.witchhat}px; transform:rotate(${H.rot ?? 0}deg)" src="${prop('witchhat')}">`
        : '';
      return `<div class="it" style="left:${left}px; top:${bottom - ih}px; width:${iw}px; height:${ih}px; z-index:${it.z ?? i}">
        <img style="position:absolute; inset:0; width:100%; height:100%" src="${cat(it.cat, !!it.crown)}">${hat}</div>`;
    }
    return `<img class="it" style="left:${left}px; top:${bottom - ih}px; width:${iw}px; height:${ih}px; z-index:${it.z ?? i}; transform:rotate(${it.rot ?? 0}deg)" src="${prop(it.name)}">`;
  }).join('');
  // extras: x/y are the top-left as fractions of the frame, w the width as a fraction of the frame width
  const extras = extra.map((e) => {
    if (e.shadow) {
      const ew = w * e.w, eh = ew * 0.16;
      return `<div class="it" style="left:${w * e.x}px; top:${h * e.y - eh / 2}px; width:${ew}px; height:${eh}px; z-index:${e.z ?? 1}; border-radius:50%; background:radial-gradient(closest-side, rgba(10,4,18,.55), rgba(10,4,18,.25) 55%, transparent 100%)"></div>`;
    }
    const ew = w * e.w, eh = e.cat ? ew : ew / (AR[e.name] ?? 1);
    const src = e.cat ? cat(e.cat, !!e.crown) : prop(e.name);
    return `<img class="it" style="left:${w * e.x}px; top:${h * e.y}px; width:${ew}px; height:${eh}px; z-index:${e.z ?? 1}; transform:rotate(${e.rot ?? 0}deg)" src="${src}">`;
  }).join('');
  const safeW = h * (16 / 9);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body { margin:0; width:${w}px; height:${h}px; overflow:hidden; background:${transparent ? 'transparent' : '#000'}; }
.card { position:relative; width:${w}px; height:${h}px; overflow:hidden;
  background: ${transparent ? 'transparent' : 'radial-gradient(120% 90% at 50% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%)'}; }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) ${h * 0.0029}px, transparent ${h * 0.0031}px);
  background-size:${h * 0.049}px ${h * 0.049}px; -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 70%, transparent); }
.floor { position:absolute; left:-5%; right:-5%; top:${floorY - U * 0.14}px; height:${h}px; border-radius:50% 50% 0 0 / ${h * 0.067}px ${h * 0.067}px 0 0;
  background: linear-gradient(180deg,#2c1a44,#1d1030 60%,#150a24); box-shadow: inset 0 ${h * 0.0044}px 0 rgba(184,148,216,.16); }
.glow { position:absolute; left:${w / 2 - total / 2 - U * 0.5}px; width:${total + U}px; top:${floorY - U * 0.17}px; height:${U * 0.34}px;
  border-radius:50%; background: radial-gradient(closest-side, rgba(184,148,216,.24), rgba(184,148,216,.08) 55%, transparent 72%); }
.it { position:absolute; display:block; }
.safe { position:absolute; top:0; height:${h}px; left:${(w - safeW) / 2}px; width:${safeW}px; outline:3px dashed rgba(255,120,160,.9); }
</style></head><body><div class="card">${transparent ? '' : `${dots ? '<div class="dots"></div>' : ''}<div class="floor"></div><div class="glow"></div>`}${extras}${html}
${safe ? '<div class="safe"></div>' : ''}</div></body></html>`;
};

const written = [];
const shot = (name, { w, h, dpr = 1, use = '', ...opts }) => {
  const file = `${OUT}${name}.png`;
  const tmp = `/tmp/items-${name}.html`;
  writeFileSync(tmp, page({ w, h, safe: GUIDES && opts.showSafe, ...opts }));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--screenshot=${file}`,
    `--window-size=${w},${h}`, `--force-device-scale-factor=${dpr}`, 'file://' + tmp], { stdio: 'ignore' });
  written.push({ file: `../${name}.png`, name: `${name}.png`, use, px: `${w * dpr}×${h * dpr}`, kb: Math.round(statSync(file).size / 1024) });
  console.log(`  ${name.padEnd(22)} ${w}x${h}`);
};

// the witch hat is wider than it is tall; the props keep their own aspect
const AR = { witchhat: 120 / 130, yarn: 72 / 74, bowl: 120 / 74, sponge: 64 / 40, coin: 1, moon: 1, sparkle: 1,
  locker: 100 / 202, lockeropen: 126 / 202, pricetag: 44 / 60, bag: 80 / 92, shelf: 200 / 34,
  partyhat: 80 / 100, bow: 90 / 62, shades: 100 / 40, bell: 50 / 58, fish: 90 / 50, potion: 60 / 80, wand: 60 / 110,
  cushion: 120 / 62, crate: 110 / 82, beanie: 80 / 80, hook: 34 / 40, milk: 60 / 90 };
const it = (name, o = {}) => ({ name, ar: AR[name] ?? 1, ...o });

/**
 * The hat on the open locker's inside shelf. Given the frame, the floor line, the locker's height as a
 * fraction of the frame height and its left edge as a fraction of the frame width, returns the extra
 * that puts a hat 80% of the interior width sitting on the shelf. Interior and shelf positions come
 * from the prop's own geometry (viewBox 126x202: interior x 42..110, shelf y 112).
 */
const hatOnShelf = ({ w, h, floorAt, lockerH, lockerLeft }) => {
  const lh = h * lockerH, lw = lh * AR.lockeropen;
  const ix = lockerLeft * w + lw * (42 / 126), iw = lw * (68 / 126);
  const shelfY = h * floorAt - lh + lh * (112 / 202);
  const hw = iw * 0.8, hh = hw / AR.witchhat;
  return { name: 'witchhat', x: (ix + iw / 2 - hw / 2) / w, y: (shelfY - hh + 4) / h, w: hw / w, z: 5 };
};

console.log('Emogotchi Items brand:');

/**
 * The shop, laid out once in cat units so it fits every frame.
 *
 * U is the cat's height. dx is an element's centre, in U, from the cat's centre; dy is its bottom, in U,
 * above the floor line (0 = standing on the floor). w is its width in U. Shelves go up the wall, hooks
 * above them with hats hanging, the crate and cushion and bag on the floor. Everything sits within
 * about ±1.3U of the cat, which is what the middle 16:9 of an 8:3 header can hold at this scale.
 */
const SHOP = [
  // floor
  { name: 'lockeropen', dx: -0.95, dy: 0, w: 0.63, z: 3 },
  { name: 'cushion', dx: -0.55, dy: 0, w: 0.34, z: 6 },
  { shadow: true, dx: 0.02, dy: 0.01, w: 0.78, z: 8 },                  // the cat's contact shadow
  { cat: 'content', dx: 0, dy: -0.115, w: 1.0, z: 9 },                 // feet at 0.885 of the box
  { name: 'crate', dx: 0.74, dy: 0, w: 0.44, z: 5 },
  { name: 'milk', dx: 1.12, dy: 0, w: 0.17, z: 6 },                     // a carton on the floor by the crate
  // shelf 1, right, low. A tag's string is at the top of its box, so the box top sits on the shelf's
  // top edge and the body hangs in front of the shelf.
  { name: 'shelf', dx: 0.88, dy: 0.70, w: 0.72, z: 2 },
  { name: 'potion', dx: 0.66, dy: 0.74, w: 0.17, z: 3 },
  { name: 'fish', dx: 1.00, dy: 0.74, w: 0.25, z: 3 },
  { name: 'pricetag', dx: 1.23, dy: 0.70, w: 0.06, z: 4, rot: 10 },
  // shelf 2, right, high
  { name: 'shelf', dx: 0.98, dy: 1.10, w: 0.64, z: 2 },
  { name: 'bell', dx: 0.76, dy: 1.14, w: 0.13, z: 3 },
  { name: 'bowl', dx: 0.98, dy: 1.14, w: 0.29, z: 3 },
  { name: 'yarn', dx: 1.20, dy: 1.14, w: 0.17, z: 3 },
  // shelf 3 sits over the locker, the locker's own width: the cone lives here, since cones do not hang
  { name: 'shelf', dx: -0.95, dy: 1.12, w: 0.62, z: 2 },
  { name: 'partyhat', dx: -1.15, dy: 1.16, w: 0.15, z: 3 },
  { name: 'shades', dx: -0.93, dy: 1.16, w: 0.24, z: 3 },
  { name: 'bow', dx: -0.73, dy: 1.16, w: 0.19, z: 3 },
  { name: 'pricetag', dx: -0.655, dy: 1.12, w: 0.055, z: 4, rot: -10 },
  // hooks. The hook sits BEHIND what hangs on it: the plate and stem show above, the J is inside the
  // handles or the crown, and the thing tilts a little the way hung things do.
  { name: 'hook', dx: 0.42, dy: 1.20, w: 0.09, z: 2 },
  { name: 'bag', dx: 0.43, dy: 0.985, w: 0.28, z: 3, rot: -5 },          // handles looped over the J
  { name: 'hook', dx: -0.50, dy: 0.88, w: 0.09, z: 2 },                  // in the gap between locker and cat
  { name: 'beanie', dx: -0.49, dy: 0.72, w: 0.21, z: 3, rot: -8 },        // crown over the J
];

/** Convert the shop to frame fractions for a given frame, cat scale and cat position. */
const scene = ({ w, h, floorAt, unit, at = 0.5 }) => {
  const U = h * unit, cx = w * at, floorY = h * floorAt;
  const out = SHOP.map((e) => {
    const ew = U * e.w;
    if (e.shadow) return { ...e, x: (cx + U * e.dx - ew / 2) / w, y: (floorY + U * (e.dy ?? 0)) / h, w: ew / w };
    const eh = e.cat ? ew : ew / (AR[e.name] ?? 1);
    const left = cx + U * e.dx - ew / 2, top = floorY - U * e.dy - eh;
    return { ...e, x: left / w, y: top / h, w: ew / w };
  });
  // the witch hat on the locker's inside shelf, from the locker's own geometry
  const L = SHOP.find((e) => e.name === 'lockeropen');
  const lw = U * L.w, lh = lw / AR.lockeropen, lleft = cx + U * L.dx - lw / 2;
  const ix = lleft + lw * (42 / 126), iw = lw * (68 / 126), shelfY = floorY - lh + lh * (112 / 202);
  const hw = iw * 0.8, hh = hw / AR.witchhat;
  out.push({ name: 'witchhat', x: (ix + iw / 2 - hw / 2) / w, y: (shelfY - hh + 4) / h, w: hw / w, z: 5 });
  return out;
};

// Logo: the locker, closed, with the heart padlock and the stickers. One shape that reads at 100px.
{
  const w = 1024, h = 1024, floorAt = 0.9, unit = 0.72;
  const lh = h * 0.72, lw = lh * AR.locker;
  shot('items-logo', { use: 'Collection logo · PNG, 1:1. OpenSea asks for 240×240 minimum; this is 1024 so it stays sharp.',
    w, h, floorAt, unit, items: [],
    extra: [
      { shadow: true, x: 0.5 - 0.21, y: floorAt + 0.008, w: 0.42, z: 2 },
      { name: 'locker', x: (w / 2 - lw / 2) / w, y: floorAt - lh / h, w: lw / w, z: 3 },
    ] });
}
shot('items-logo-transparent', { use: 'Logo on transparent · 1024×1024. For overlays and avatars.',
  w: 1024, h: 1024, floorAt: 0.94, unit: 0.9, transparent: true, items: [it('locker', { size: 1, hero: true })] });

// Header, 8:3. The shop; every subject inside the middle 16:9.
shot('items-banner', { use: 'Page header · 8:3 on desktop, cropped to the middle 16:9 on a phone. Same file, two crops.',
  w: 2400, h: 900, floorAt: 0.87, unit: 0.62, showSafe: true, items: [],
  extra: scene({ w: 2400, h: 900, floorAt: 0.87, unit: 0.62 }) });

// Featured, 3:2.
shot('items-featured', { use: 'Featured / card · 3:2.',
  w: 1200, h: 800, floorAt: 0.92, unit: 0.5, items: [],
  extra: scene({ w: 1200, h: 800, floorAt: 0.92, unit: 0.5 }) });

// X header, 3:1. The avatar covers the bottom-left, so the shop sits right of centre.
shot('items-x-header', { use: 'X header · 1500×500 (3:1). Avatar covers the bottom-left, so the shop sits right of centre.',
  w: 1500, h: 500, dpr: 2, floorAt: 0.9, unit: 0.62, items: [],
  extra: scene({ w: 1500, h: 500, floorAt: 0.9, unit: 0.62, at: 0.56 }) });

// Link preview, 1.91:1.
shot('items-og', { use: 'Link preview (Open Graph / X card) · 2400×1260 (1.91:1).',
  w: 2400, h: 1260, floorAt: 0.9, unit: 0.5, items: [],
  extra: scene({ w: 2400, h: 1260, floorAt: 0.9, unit: 0.5 }) });

// Item card, 1:1: the template every item token image uses. The witch hat is the first.
shot('item-witchhat', { use: 'Item card · 1:1. The template every item token image uses; this one is the witch hat.',
  w: 1024, h: 1024, floorAt: 0.99, unit: 0.05, items: [],
  extra: [
    { name: 'shelf', x: 0.14, y: 0.70, w: 0.72, z: 2 },
    { name: 'witchhat', x: 0.235, y: 0.135, w: 0.53, z: 5 },
    { name: 'pricetag', x: 0.71, y: 0.69, w: 0.075, z: 6, rot: 14 },
  ] });

// A page with everything on it, at /brand/items/. The header previews use object-fit: cover inside a
// fixed aspect box, which is exactly how a marketplace crops it, so what is on this page is what they
// will see rather than a promise about it.
mkdirSync(OUT + 'items/', { recursive: true });

const style = `
body{margin:0;background:#0c0614;color:#F8F8FF;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:32px 20px 80px}
h1{font-size:28px;margin:0 0 4px}p.lead{color:#B894D8;margin:0 0 10px;max-width:780px}
.piece{max-width:1200px;margin:0 auto 48px}.piece h2{font-size:17px;margin:0 0 8px;font-weight:600}
.piece small{color:#B894D8;font-weight:400;margin-left:8px}
.frame{background:repeating-conic-gradient(#1a1024 0 25%,#12091b 0 50%) 0 0/28px 28px;border-radius:14px;padding:12px;display:inline-block;max-width:100%}
.frame img{display:block;max-width:100%;height:auto;border-radius:8px}
.crops{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px}
.crop{flex:1 1 320px;min-width:280px}.crop b{font-size:13px;color:#EAC6EA;display:block;margin-bottom:6px}
.crop .box{border-radius:10px;overflow:hidden;border:1px solid rgba(184,148,216,.25)}
.crop img{width:100%;height:100%;object-fit:cover;display:block}
.d{aspect-ratio:8/3}.m{aspect-ratio:16/9}
.thumbs{display:flex;gap:16px;align-items:center;margin-top:12px}
.thumbs img{border-radius:10px}
a{color:#ff7aa6}code{color:#EAC6EA}`;

const block = (p) => {
  const crops = p.name === 'items-banner.png' ? `<div class="crops">
  <div class="crop"><b>Desktop · 8:3</b><div class="box d"><img src="${p.file}" alt=""></div></div>
  <div class="crop"><b>Phone · 16:9, the middle of the same file</b><div class="box m"><img src="${p.file}" alt=""></div></div>
</div>` : '';
  const thumbs = p.name === 'items-logo.png' ? `<div class="thumbs"><img src="${p.file}" width="120" height="120" alt="">
  <img src="${p.file}" width="64" height="64" alt=""><small>how it reads at the sizes a marketplace actually renders it</small></div>` : '';
  return `<div class="piece"><h2>${p.use}<small>${p.px} · ${p.kb} KB · <a href="${p.file}" download>${p.name}</a></small></h2>
<div class="frame"><img src="${p.file}" alt=""></div>${thumbs}${crops}</div>`;
};

writeFileSync(OUT + 'items/index.html', `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Emogotchi Items brand kit</title><style>${style}</style></head><body>
<h1>Emogotchi Items — brand kit</h1>
<p class="lead">The costumes and tools collection. Generated from the same room and the same on-chain cat art as
Emogotchi itself, by <code>tools/items-brand.mjs</code>. The cats kit is at <a href="../">/brand/</a>.</p>
<p class="lead">A marketplace crops one header file twice: <b>8:3</b> on desktop and <b>16:9</b> on a phone. A 16:9
slice of an 8:3 image is the middle 66.7% of its width, so nothing that matters may sit outside that band. The round
collection logo also covers the bottom-left corner, which is why there is no text anywhere on it.</p>
${written.map(block).join('\n')}
</body></html>`);
console.log(`\nwritten to ${OUT}  ·  gallery at /brand/items/`);
