// Emonadgotchi's brand kit, in his trailer's and mint page's look (the black and plum night with a hot pink glow, the
// checkered floor going away, grain and scanlines; the zine caps with the hard pink offset; the marker hand; prints of his
// room on white paper with pink tape; hot pink stickers): the two pictures his contractURI names, a logo, an icon, an X
// header, and his mint page's two link cards.
//   node tools/eg-brand.mjs [--base=http://127.0.0.1:5422] [--only=og,og-live,opensea-banner,opensea-featured,logo,icon,x-header]
// -> STAGED, never in apps/web/public (nothing of him ships before launch; tools/emonad-launch.mjs copies them in):
//    emonadgotchi/public/brand/emonadgotchi-{og,og-live,opensea-banner,opensea-featured,logo,icon,x-header}.png (og = the
//    mint page's link card while it says coming soon, og-live = from launch on), and the two OpenSea pictures again under
//    emonadgotchi/public/emonadgotchi/brand/ (his siteURI's own path, where contractURI points).
// The prints are the mint page's own (apps/web/src/emonadgotchi/mint/shot-*.webp, tools/eg-mint-art.mjs: whole rooms from the
// trailer's takes, so he is always whole); the logo is him cut out from his lab's card view (/emonadgotchi?card=…&bare=1, a
// dev-mode build served), fitted to his measured outline; the icon is his face in the pink ring, from the same view at 3x.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { resolve } from 'node:path';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5422'); const ONLY = arg('only', '').split(',').filter(Boolean);
const OUT = resolve('emonadgotchi/public/brand'); const HIS = resolve('emonadgotchi/public/emonadgotchi/brand');
const EG = resolve('apps/web/src/emonadgotchi');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const SHOT = (k) => `data:image/webp;base64,${b64(`${EG}/mint/shot-${k}.webp`)}`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });

// ---- him cut out (the card view on nothing), `dpr` x the 1024 card, and where he is in it (the alpha box)
const cp = await browser.newPage();
const cuts = new Map();
async function cut(q, dpr = 1) {
  const key = `${q}@${dpr}`; if (cuts.has(key)) return cuts.get(key);
  await cp.setViewport({ width: 1024, height: 1024, deviceScaleFactor: dpr });
  await cp.bringToFront();   // a background tab never paints: its ready flag (set on a frame) would never come
  await cp.goto(`${BASE}/emonadgotchi?card=${q}&bare=1`, { waitUntil: 'networkidle0' });
  await cp.waitForFunction(() => window.__card_ready === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
  const src = `data:image/png;base64,${await (await cp.$('.nft-art')).screenshot({ encoding: 'base64', omitBackground: true })}`;
  // his outline: every pixel more than faintly there, and the head (hair and all: the top 36% of him, the trailer's measure)
  const box = await cp.evaluate(async (src) => {
    const im = new Image(); im.src = src; await im.decode();
    const W = im.width, H = im.height; const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H).data;
    let l = W, t = H, r = 0, b = 0;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] > 40) { if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > b) b = y; }
    const hb = t + (b - t) * 0.36; let hl = W, hr = 0;
    for (let y = t; y < hb; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] > 40) { if (xx < hl) hl = xx; if (xx > hr) hr = xx; }
    return { W, H, l, t, r, b, head: { l: hl, t, r: hr, b: hb } };
  }, src);
  const v = { src, ...box }; cuts.set(key, v); return v;
}

// ---- the look
const grain = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -0.9'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E";
const FONTS = `@font-face{font-family:'SG';src:url(data:font/woff2;base64,${b64('apps/web/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2')});font-weight:300 700}
@font-face{font-family:'Gloria';src:url(data:font/woff2;base64,${b64(`${EG}/fonts/GloriaHallelujah-400.woff2`)})}`;
const HEART = `<svg viewBox="-2 -1 28 25" style="display:block;width:100%;height:auto;overflow:visible"><defs><linearGradient id="hg" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF78B4"/><stop offset="1" stop-color="#FF2E88"/></linearGradient><clipPath id="hl"><polygon points="-1,-1 12,-1 12,4.9 10.4,8.6 13.2,11.4 10.8,14.8 12.6,17.6 12,21.2 12,25 -1,25"/></clipPath><clipPath id="hr"><polygon points="25,-1 12,-1 12,4.9 10.4,8.6 13.2,11.4 10.8,14.8 12.6,17.6 12,21.2 12,25 25,25"/></clipPath></defs><g clip-path="url(#hl)" transform="translate(-1.4 .3) rotate(-4 12 21)"><path d="M12 21.2l-1.3-1.2C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.5 2.8c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.8 22 5.2 22 8.3c0 3.8-3.4 6.9-8.7 11.7L12 21.2z" fill="url(#hg)" stroke="#0B0610" stroke-width="1.3"/></g><g clip-path="url(#hr)" transform="translate(1.4 .3) rotate(4 12 21)"><path d="M12 21.2l-1.3-1.2C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.5 2.8c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.8 22 5.2 22 8.3c0 3.8-3.4 6.9-8.7 11.7L12 21.2z" fill="url(#hg)" stroke="#0B0610" stroke-width="1.3"/></g></svg>`;
/** the common sheet: `u` is the unit every size is given in (px per design unit), so one layout serves every size */
const base = (w, h, u, floor = true) => `<style>${FONTS}
html,body{margin:0;background:#07030B}
#c{position:relative;width:${w}px;height:${h}px;overflow:hidden;color:#F8F8FF;font-family:'SG';
 background:radial-gradient(ellipse 60% 60% at 18% 8%,rgba(123,63,184,.42),transparent 70%),radial-gradient(ellipse 60% 55% at 88% 100%,rgba(255,46,136,.26),transparent 70%),#07030B}
#floor{position:absolute;left:-30%;right:-30%;bottom:0;height:46%;perspective:${480 * u}px;perspective-origin:50% 0;-webkit-mask-image:linear-gradient(to bottom,transparent,#000 55%);opacity:.1}
#floor i{position:absolute;left:0;right:0;top:-60%;height:260%;transform-origin:50% 0;transform:rotateX(68deg);background:repeating-conic-gradient(#fff 0 25%,transparent 0 50%) 0 0/${96 * u}px ${96 * u}px}
#fx{position:absolute;inset:0;z-index:20;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.05) 0 ${1.5 * u}px,transparent ${1.5 * u}px ${4 * u}px),radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.5) 100%)}
#g{position:absolute;inset:0;z-index:19;pointer-events:none;opacity:.08;background:url("${grain}") 0 0/${240 * u}px ${240 * u}px}
.zine{position:absolute;margin:0;font-weight:700;text-transform:uppercase;letter-spacing:-.04em;line-height:.9;white-space:nowrap;text-shadow:.05em .05em 0 #FF2E88}
.hand{position:absolute;margin:0;font-family:'Gloria';font-weight:400;white-space:nowrap;line-height:1.15;text-shadow:0 ${2 * u}px ${14 * u}px rgba(0,0,0,.7)}
.kick{position:absolute;margin:0;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#EAC6EA;white-space:nowrap}
.print{position:absolute;box-sizing:border-box;padding:${13 * u}px;background:#EEE6EF;border-radius:${7 * u}px;box-shadow:0 ${18 * u}px ${46 * u}px rgba(0,0,0,.62)}
.print img{display:block;width:100%;height:auto;border-radius:${2 * u}px}
.print::after{content:'';position:absolute;inset:${13 * u}px;background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,0) 42%)}
.tape{position:absolute;z-index:2;top:${-11 * u}px;left:50%;width:24%;height:${30 * u}px;transform:translateX(-50%) rotate(-3.5deg);background:repeating-linear-gradient(-62deg,rgba(255,255,255,.24) 0 ${9 * u}px,transparent ${9 * u}px ${21 * u}px),rgba(255,46,136,.6);opacity:.9}
.sticker{position:absolute;margin:0;padding:${7 * u}px ${15 * u}px ${8 * u}px;background:#FF2E88;color:#0B0610;font-weight:700;text-transform:uppercase;letter-spacing:-.01em;white-space:nowrap;box-shadow:${6 * u}px ${6 * u}px 0 rgba(0,0,0,.55)}
.band{position:absolute;left:-6%;right:-6%;padding:${11 * u}px 0;background:#FF2E88;color:#0B0610;font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;box-shadow:0 ${10 * u}px 0 rgba(0,0,0,.45)}
.band.alt{background:#120816;color:#FF78B4;box-shadow:inset 0 ${2 * u}px 0 #FF2E88,inset 0 ${-2 * u}px 0 #FF2E88}
.band i{font-style:normal}.band i::after{content:'\\2665';margin:0 .8em;font-size:.8em}
</style><div id="c">${floor ? '<div id="floor"><i></i></div>' : ''}<div id="g"></div><div id="fx"></div>`;
const END = '</div>';
/** a taped print at (x, y), `w` wide, turned `rot` (design units); the picture keeps its own shape (a whole room) */
const print = (src, x, y, w, rot, u) => `<div class="print" style="left:${x * u}px;top:${y * u}px;width:${w * u}px;transform:rotate(${rot}deg)"><span class="tape"></span><img src="${src}"></div>`;
const zine = (text, x, y, size, u, extra = '') => `<p class="zine" style="left:${x * u}px;top:${y * u}px;font-size:${size * u}px;${extra}">${text}</p>`;
const hand = (text, x, y, size, rot, color, u) => `<p class="hand" style="left:${x * u}px;top:${y * u}px;font-size:${size * u}px;transform:rotate(${rot}deg);transform-origin:0 50%;color:${color}">${text}</p>`;
const sticker = (text, x, y, size, rot, u, bg = '#FF2E88') => `<p class="sticker" style="left:${x * u}px;top:${y * u}px;font-size:${size * u}px;transform:rotate(${rot}deg);background:${bg}">${text}</p>`;
const heart = (x, y, w, u) => `<div style="position:absolute;left:${x * u}px;top:${y * u}px;width:${w * u}px;filter:drop-shadow(0 ${6 * u}px ${20 * u}px rgba(255,46,136,.5))">${HEART}</div>`;
const band = (words, y, rot, size, u, alt = false, shift = 0) => `<div class="band${alt ? ' alt' : ''}" style="top:${y * u}px;transform:rotate(${rot}deg);font-size:${size * u}px"><span style="display:inline-block;margin-left:${shift * u}px">${[...words, ...words, ...words].map((t) => `<i>${t}</i>`).join('')}</span></div>`;
const BAND1 = ['Feed him', 'Play with him', 'Wash him', 'Put him to bed', "Don't let him die", 'Free mint', 'One per wallet'];
const BAND2 = ['The face of $EMO', 'On chain', 'Fit check', 'Name him, burn EMO', 'Never let him starve', 'Emonadgotchi'];
/** the word, centred on `cx` (design units), as big as `maxW` allows up to `size` */
const word = (cx, y, size, maxW, u) => `<p class="zine" style="left:${(cx - maxW / 2) * u}px;width:${maxW * u}px;top:${y * u}px;text-align:center;font-size:min(${size * u}px, ${(maxW / 7.25) * u}px)">EMONADGOTCHI</p>`;

/**
 * A print framed on HIM, from one of the trailer's takes (trailer/emonad/raw) at a moment (ms): his measured box (boxes.json
 * `boxes`: his drawing with what he holds, as fractions of the stage) over the moment +-200 ms, grown by `margin` of its
 * height each side, widened or heightened to `aspect` (w/h) about its middle, slid back inside the frame (its 1.2% border
 * kept out) and refused if it cannot hold him whole: the never-crop rule, by numbers.
 */
const RAW = resolve(process.env.RAW ?? 'trailer/emonad/raw'); const BOXES = JSON.parse(fs.readFileSync(resolve(process.env.BOXES ?? 'trailer/emonad/boxes.json'), 'utf8'));
async function framed(take, ms, aspect, margin) {
  const meta = JSON.parse(fs.readFileSync(`${RAW}/${take}/meta.json`, 'utf8'));
  const f = Math.max(0, Math.min(meta.frames - 1, Math.round((ms * (meta.fps ?? 60)) / 1000)));
  const file = `${RAW}/${take}/f-${String(f).padStart(5, '0')}.png`; const buf = fs.readFileSync(file);
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  const near = BOXES[take].boxes.filter((b) => b.length === 5 && Math.abs(b[0] - ms) <= 200);
  const bx = [Math.min(...near.map((b) => b[1])) * W, Math.min(...near.map((b) => b[2])) * H, Math.max(...near.map((b) => b[3])) * W, Math.max(...near.map((b) => b[4])) * H];
  const m = (bx[3] - bx[1]) * margin; let h = bx[3] - bx[1] + 2 * m, w = h * aspect;
  if (w < bx[2] - bx[0] + 2 * m) { w = bx[2] - bx[0] + 2 * m; h = w / aspect; }
  const ins = Math.round(W * 0.012), cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2;
  const x = Math.max(ins, Math.min(W - ins - w, cx - w / 2)), y = Math.max(ins, Math.min(H - ins - h, cy - h / 2));
  if (x > bx[0] || y > bx[1] || x + w < bx[2] || y + h < bx[3] || w > W - 2 * ins || h > H - 2 * ins) throw new Error(`${take} at ${ms} ms: a ${aspect.toFixed(2)} frame cannot hold him whole`);
  const out = await cp.evaluate(async (src, c) => {
    const im = new Image(); im.src = src; await im.decode();
    const k = document.createElement('canvas'); k.width = Math.round(c[2]); k.height = Math.round(c[3]);
    const g = k.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, c[0], c[1], c[2], c[3], 0, 0, k.width, k.height);
    return k.toDataURL('image/png');
  }, `data:image/png;base64,${buf.toString('base64')}`, [x, y, w, h]);
  console.log(`  ${take} @${ms}ms: him ${bx.map(Math.round).join(',')} in frame ${[x, y, x + w, y + h].map(Math.round).join(',')} (room ${W}x${H}); clear by ${Math.round(Math.min(bx[0] - x, bx[1] - y, x + w - bx[2], y + h - bx[3]))} px`);
  return out;
}

/** the mint page's link card, 1200x630, `tag` the offer's words: the word big across the top (read at a feed's ~500 px),
 *  him big in a taped print framed on his measured box (mid riff, in his bedroom at night), the offer on a sticker */
const og = (tag) => async () => { const u = 1; const him = await framed('eg-guitar', 6761, 3 / 4, 0.1); return `${base(1200, 630, u)}
${band(BAND1, 566, -2.2, 21, u, false, -40)}
${heart(575, 14, 50, u)}${word(600, 66, 142, 1130, u)}
${hand("he's the face of $EMO.", 58, 236, 44, -2.5, '#F8F8FF', u)}${hand('nobody has ever fed him.', 82, 296, 44, -2.5, '#FF9CC8', u)}
${sticker(tag, 60, 392, 50, -2, u)}
<p class="kick" style="left:66px;top:494px;font-size:18px;letter-spacing:.22em">One per wallet · on Monad</p>
<div class="print" style="left:846px;top:208px;width:290px;transform:rotate(2deg);z-index:5"><span class="tape"></span><img src="${him}"></div>${END}`; };

/** a row of prints, `w` wide each, centred on `cx`, a little up and down and turned */
const row = (keys, cx, y, w, gap, u) => {
  const total = keys.length * w + (keys.length - 1) * gap; const x0 = cx - total / 2;
  return keys.map((k, i) => print(SHOT(k), x0 + i * (w + gap), y + [10, -8, 6, -6, 8][i % 5], w, [-2, 1.4, -0.9, 1.8, -1.4][i % 5], u)).join('');
};

const PIECES = {
  // the mint page's link cards (og-meta.mjs emonadgotchi): before launch, and from launch on (tools/emonad-launch.mjs
  // points the page's tags at the second)
  og: { w: 1200, h: 630, html: og('Free mint · coming soon') },
  'og-live': { w: 1200, h: 630, html: og('Free mint · open now') },
  // OpenSea's header, 2400x900 (8:3): a phone keeps the middle 16:9 (x 400..2000), the collection's round logo sits over the
  // bottom left on a desk. So: the word across the middle, four prints under it, all inside the middle; the tape at the foot
  'opensea-banner': { w: 2400, h: 900, html: async () => { const u = 2; return `${base(2400, 900, u)}
${band(BAND2, 372, 2, 22, u, true, -60)}${band(BAND1, 366, -2.4, 22, u, false, -200)}
${heart(580, 18, 52, u)}${word(600, 74, 120, 780, u)}${hand('the $EMO mascot, in your wallet.', 438, 186, 30, -2, '#FF9CC8', u)}
${row(['guitar', 'falcon', 'die', 'selfie'], 600, 248, 168, 18, u)}${END}`; } },
  // OpenSea's featured picture, 1200x800 (3:2): the mint page's top
  'opensea-featured': { w: 1200, h: 800, html: async () => { const u = 1; return `${base(1200, 800, u)}
${heart(565, 34, 70, u)}${word(600, 110, 150, 1110, u)}
${hand("he's the face of $EMO.", 60, 300, 46, -2.5, '#F8F8FF', u)}${hand('nobody has ever fed him.', 84, 364, 46, -2.5, '#FF9CC8', u)}
${sticker('The sixth pet · free mint', 62, 478, 32, -2, u)}
${print(SHOT('guitar'), 660, 300, 490, 1.6, u)}
${band(BAND1, 676, -2.2, 24, u, false, -120)}${END}`; } },
  // the logo, 1024 square: him whole, crowned, on the night with a pink glow behind him (measured: his whole outline, crown
  // and all, fitted into the middle 84% of the height)
  logo: { w: 1024, h: 1024, html: async () => { const c = await cut('content&crown=1'); const H = c.b - c.t, k = (1024 * 0.84) / H; const cx = (c.l + c.r) / 2;
    return `${base(1024, 1024, 1)}<div style="position:absolute;left:50%;top:52%;width:620px;height:620px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,46,136,.34),transparent 68%)"></div>
<img style="position:absolute;left:${512 - cx * k}px;top:${512 - ((c.t + c.b) / 2) * k}px;width:${c.W * k}px" src="${c.src}">${END}`; } },
  // the icon, 1024 square: his face in the pink ring (the trailer's end card), his head measured off the 3x cut-out
  icon: { w: 1024, h: 1024, html: async () => { const c = await cut('content', 3); const h = c.head; const side = Math.max(h.r - h.l, h.b - h.t) * 1.14;
    const ring = 860, k = ring / side; const cx = (h.l + h.r) / 2, cy = (h.t + h.b) / 2 + side * 0.04;
    return `${base(1024, 1024, 1, false)}<div style="position:absolute;left:${512 - ring / 2 - 16}px;top:${512 - ring / 2 - 16}px;width:${ring + 32}px;height:${ring + 32}px;border-radius:50%;background:#FF2E88;box-shadow:0 0 90px rgba(255,46,136,.6)"></div>
<div style="position:absolute;left:${512 - ring / 2}px;top:${512 - ring / 2}px;width:${ring}px;height:${ring}px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 35%,#3a1d56,#160a24 75%)">
<img style="position:absolute;left:${ring / 2 - cx * k}px;top:${ring / 2 - cy * k}px;width:${c.W * k}px" src="${c.src}"></div>${END}`; } },
  // X's header, 1500x500 at 2x: the profile picture covers the bottom left, so the word and the prints sit in the middle and right
  'x-header': { w: 3000, h: 1000, html: async () => { const u = 2; return `${base(3000, 1000, u)}
${band(BAND2, 410, 2, 22, u, true, -60)}${band(BAND1, 404, -2.2, 22, u, false, -260)}
${heart(830, 22, 56, u)}${word(858, 82, 130, 900, u)}${hand('the $EMO mascot, in your wallet.', 700, 204, 32, -2, '#FF9CC8', u)}
${row(['guitar', 'falcon', 'die', 'selfie'], 858, 268, 186, 20, u)}${END}`; } },
};

const page = await browser.newPage();
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(HIS, { recursive: true });
for (const [name, P] of Object.entries(PIECES)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  await page.setViewport({ width: P.w, height: P.h, deviceScaleFactor: 1 });
  await page.setContent(await P.html(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 600));
  const file = `${OUT}/emonadgotchi-${name}.png`;
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: P.w, height: P.h } });
  if (name.startsWith('opensea-')) fs.copyFileSync(file, `${HIS}/emonadgotchi-${name}.png`);
  console.log('->', file);
}
await browser.close(); process.exit(0);
