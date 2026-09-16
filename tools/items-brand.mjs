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
    const ew = w * e.w, eh = ew / (AR[e.name] ?? 1);
    return `<img class="it" style="left:${w * e.x}px; top:${h * e.y}px; width:${ew}px; height:${eh}px; z-index:${e.z ?? 1}; transform:rotate(${e.rot ?? 0}deg)" src="${prop(e.name)}">`;
  }).join('');
  const safeW = h * (16 / 9);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body { margin:0; width:${w}px; height:${h}px; overflow:hidden; background:${transparent ? 'transparent' : '#000'}; }
.card { position:relative; width:${w}px; height:${h}px; overflow:hidden;
  background: ${transparent ? 'transparent' : 'radial-gradient(120% 90% at 50% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%)'}; }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) ${h * 0.0029}px, transparent ${h * 0.0031}px);
  background-size:${h * 0.049}px ${h * 0.049}px; -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 70%, transparent); }
.floor { position:absolute; left:-5%; right:-5%; top:${floorY}px; height:${h}px; border-radius:50% 50% 0 0 / ${h * 0.067}px ${h * 0.067}px 0 0;
  background: linear-gradient(180deg,#2c1a44,#1d1030 60%,#150a24); box-shadow: inset 0 ${h * 0.0044}px 0 rgba(184,148,216,.16); }
.glow { position:absolute; left:${w / 2 - total / 2 - U * 0.5}px; width:${total + U}px; top:${floorY - U * 0.14}px; height:${U * 0.34}px;
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
  locker: 100 / 202, lockeropen: 126 / 202, pricetag: 44 / 60, bag: 80 / 92, shelf: 200 / 34 };
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

// Tuned on a strip (--tune): any higher and the hat hovers instead of being worn; any lower and the
// brim swallows the eyes.
const HAT = { x: 0.247, y: -0.07, w: 0.44, rot: -6 };
if (process.argv.includes('--tune')) {
  for (const [i, y] of [-0.04, -0.07, -0.10, -0.13].entries()) {
    shot(`tune-${i}`, { w: 700, h: 700, floorAt: 0.93, unit: 0.95,
      items: [{ cat: 'content', hat: { ...HAT, y }, ar: 1, size: 1, sink: 0.115, hero: true }] });
  }
}

// Logo: the locker. The shop is where the cat keeps its things, and a locker says that in one shape at
// any size. Closed, with the heart padlock and the stickers, so it reads as this cat's locker and not
// a gym's.
shot('items-logo', { use: 'Collection logo · PNG, 1:1. OpenSea asks for 240×240 minimum; this is 1024 so it stays sharp.',
  w: 1024, h: 1024, floorAt: 0.905, unit: 0.86, items: [it('locker', { size: 1, hero: true })] });

// Header: the shop. Locker open with the hat on its shelf, the cat trying one on, things on the wall
// shelf with a price tag, and a bag on the floor. Everything inside the middle 16:9.
// Row: locker 0.92 (392px wide) + gap + cat 684 + gap + bag, centred on the cat. Left edge lands at
// x=411 and the right at 1787, inside the 400..2000 band a phone keeps. The locker's left edge is what
// hatOnShelf needs, so it is computed the same way here rather than eyeballed.
const B = { w: 2400, h: 900, floorAt: 0.88, unit: 0.76, gap: 0.08 };
const bU = B.h * B.unit, bCat = bU, bLock = bU * 0.92, bGap = bU * B.gap;
const bLockLeft = (B.w / 2 - bCat / 2 - bGap - bLock * AR.lockeropen) / B.w;
shot('items-banner', {
  use: 'Page header · 8:3 on desktop, cropped to the middle 16:9 on a phone. Same file, two crops.',
  ...B, showSafe: true,
  items: [
    it('lockeropen', { size: 0.92, z: 3 }),
    { cat: 'content', hat: HAT, ar: 1, size: 1.0, z: 9, sink: 0.115, hero: true },
    it('bag', { size: 0.32, z: 4 }),
  ],
  extra: [
    hatOnShelf({ w: B.w, h: B.h, floorAt: B.floorAt, lockerH: B.unit * 0.92, lockerLeft: bLockLeft }),
    { name: 'shelf', x: 0.655, y: 0.36, w: 0.14, z: 2 },
    { name: 'yarn', x: 0.668, y: 0.29, w: 0.045, z: 3 },
    { name: 'bowl', x: 0.722, y: 0.305, w: 0.06, z: 3 },
    { name: 'pricetag', x: 0.785, y: 0.385, w: 0.022, z: 4, rot: 12 },
  ],
});

// Featured / card, 3:2: the cat in the hat by the open locker.
const F = { w: 1200, h: 800, floorAt: 0.92, unit: 0.62, gap: 0.06 };
const fU = F.h * F.unit, fLock = fU * 0.95, fGap = fU * F.gap;
const fLockLeft = (F.w / 2 - fU / 2 - fGap - fLock * AR.lockeropen) / F.w;
shot('items-featured', {
  use: 'Featured / card · 3:2.', ...F,
  items: [
    it('lockeropen', { size: 0.95, z: 3 }),
    { cat: 'content', hat: HAT, ar: 1, size: 1.0, z: 9, sink: 0.115, hero: true },
    it('bag', { size: 0.3, z: 4 }),
  ],
  extra: [hatOnShelf({ w: F.w, h: F.h, floorAt: F.floorAt, lockerH: F.unit * 0.95, lockerLeft: fLockLeft })],
});

// Item card, 1:1: how a single item is presented as its own NFT image. The item on a shelf with a
// price tag, in the room. Every item gets this frame; the witch hat is the first.
shot('item-witchhat', {
  use: 'Item card · 1:1. The template every item token image uses; this one is the witch hat.',
  w: 1024, h: 1024, floorAt: 0.99, unit: 0.05, items: [],
  extra: [
    { name: 'shelf', x: 0.14, y: 0.70, w: 0.72, z: 2 },
    { name: 'witchhat', x: 0.235, y: 0.135, w: 0.53, z: 5 },
    { name: 'pricetag', x: 0.71, y: 0.69, w: 0.075, z: 6, rot: 14 },
  ],
});


// The locker alone on nothing, for putting on top of anything: posts, the site, a Telegram avatar.
shot('items-logo-transparent', { use: 'Logo on transparent · 1024×1024. For overlays and avatars.',
  w: 1024, h: 1024, floorAt: 0.94, unit: 0.9, transparent: true, items: [it('locker', { size: 1, hero: true })] });

// X header, 3:1. The profile avatar covers the bottom-left corner on X, so the scene is pushed to the
// right of that, and X trims the top and bottom on a phone, so nothing important touches either edge.
const X = { w: 1500, h: 500, floorAt: 0.9, unit: 0.74, gap: 0.08 };
const xU = X.h * X.unit, xLock = xU * 0.92, xGap = xU * X.gap;
const xLockLeft = (X.w * 0.55 - xU / 2 - xGap - xLock * AR.lockeropen) / X.w;
shot('items-x-header', {
  use: 'X header · 1500×500 (3:1). Avatar covers the bottom-left, so the shop sits right of centre.',
  ...X, dpr: 2,
  items: [
    it('lockeropen', { size: 0.92, z: 3 }),
    { cat: 'content', hat: HAT, ar: 1, size: 1.0, z: 9, sink: 0.115, hero: true, at: 0.55 },
    it('bag', { size: 0.3, z: 4 }),
  ],
  extra: [
    hatOnShelf({ w: X.w, h: X.h, floorAt: X.floorAt, lockerH: X.unit * 0.92, lockerLeft: xLockLeft }),
    { name: 'shelf', x: 0.735, y: 0.3, w: 0.15, z: 2 },
    { name: 'yarn', x: 0.748, y: 0.19, w: 0.05, z: 3 },
    { name: 'bowl', x: 0.808, y: 0.21, w: 0.065, z: 3 },
    { name: 'pricetag', x: 0.876, y: 0.325, w: 0.024, z: 4, rot: 12 },
  ],
});

// Link preview, 1.91:1, for a /shop or /items page one day.
const O = { w: 2400, h: 1260, floorAt: 0.9, unit: 0.62, gap: 0.08 };
const oU = O.h * O.unit, oLock = oU * 0.92, oGap = oU * O.gap;
const oLockLeft = (O.w / 2 - oU / 2 - oGap - oLock * AR.lockeropen) / O.w;
shot('items-og', {
  use: 'Link preview (Open Graph / X card) · 2400×1260 (1.91:1).',
  ...O,
  items: [
    it('lockeropen', { size: 0.92, z: 3 }),
    { cat: 'content', hat: HAT, ar: 1, size: 1.0, z: 9, sink: 0.115, hero: true },
    it('bag', { size: 0.3, z: 4 }),
  ],
  extra: [
    hatOnShelf({ w: O.w, h: O.h, floorAt: O.floorAt, lockerH: O.unit * 0.92, lockerLeft: oLockLeft }),
    { name: 'shelf', x: 0.66, y: 0.36, w: 0.16, z: 2 },
    { name: 'yarn', x: 0.675, y: 0.275, w: 0.05, z: 3 },
    { name: 'bowl', x: 0.735, y: 0.29, w: 0.07, z: 3 },
    { name: 'pricetag', x: 0.812, y: 0.385, w: 0.025, z: 4, rot: 12 },
  ],
});

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
