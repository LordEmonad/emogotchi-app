// Brand imagery for the collection (apps/web/public/brand/): X header, OpenSea banner + featured image,
// 16:9 hero, logo. Same art as the NFTs: the cat is composed from contracts/art, the room from the share
// card. node tools/brand.mjs  (writes PNGs + brand/index.html gallery)
import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const ART = root + 'contracts/art/';
const OUT = root + 'apps/web/public/brand/';
mkdirSync(OUT, { recursive: true });
const font = 'file://' + root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];

// ---- a cat with its props on a transparent 1024x1024 canvas, straight from the on-chain blobs
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
const heart = readFileSync(root + 'tools/og/card.html', 'utf8').match(/<div class="brand">(<svg[\s\S]*?<\/svg>)/)[1];

// ---- the page: room + lineup of cats on the floor + copy. Everything in vw so one template fits every ratio.
const page = ({ w, h, cats, copy, foot, floorAt = 0.86, catH = 0.62, span = [0.4, 0.98], copyLeft = 0.06, copyTop = 0.5, copyW = 0.4, scale = 1, catGap = 0.62, transparent = false }) => {
  const floorY = h * floorAt;
  let H = h * catH; // a cat box (1024 space) in px; feet sit at 0.885 of the box
  // lay the cats out on a line, centre the line, and shrink the whole lineup if it would run off the right edge
  const layout = (H) => { let x = 0; const xs = cats.map((c, i) => { const cx = x; x += H * catGap * (c.dx ?? 1); return cx; }); const width = xs[xs.length - 1] + 0; return { xs, width }; };
  let { xs, width } = layout(H);
  const units = (H) => { const l = layout(H); return (l.width + H * ((cats[0].size ?? 1) + (cats[cats.length - 1].size ?? 1)) * 0.32) / H; };
  const [sl, sr] = span; const avail = w * (sr - sl);
  if (units(H) * H > avail) H = avail / units(H);
  ({ xs, width } = layout(H));
  const lineupCenter = (sl + sr) / 2;
  const lineup = cats.map((c, i) => {
    const size = H * (c.size ?? 1); const x = w * lineupCenter - width / 2 + xs[i] - size * 0.5;
    return `<img class="cat" style="left:${x}px; top:${floorY - size * 0.885}px; width:${size}px; height:${size}px; z-index:${c.z ?? i}" src="${cat(c.mood, !!c.crown)}">`;
  }).join('');
  const s = (v) => `${v * scale}px`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family:'SG'; src:url('${font}') format('woff2'); font-weight:300 700; }
html,body { margin:0; width:${w}px; height:${h}px; overflow:hidden; background:${transparent ? 'transparent' : '#000'}; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:${w}px; height:${h}px; overflow:hidden; background: ${transparent ? 'transparent' : 'radial-gradient(120% 90% at 50% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%)'}; }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) ${s(2.6)}, transparent ${s(2.8)}); background-size:${s(44)} ${s(44)}; -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 70%, transparent); }
.floor { position:absolute; left:-5%; right:-5%; top:${floorY}px; height:${h}px; border-radius:50% 50% 0 0 / ${s(60)} ${s(60)} 0 0; background: linear-gradient(180deg,#2c1a44,#1d1030 60%,#150a24); box-shadow: inset 0 ${s(4)} 0 rgba(184,148,216,.16); }
.glow { position:absolute; left:${w * lineupCenter - width / 2 - H * 0.4}px; width:${width + H * 0.8}px; top:${floorY - H * 0.12}px; height:${H * 0.3}px; border-radius:50%; background: radial-gradient(closest-side, rgba(184,148,216,.22), rgba(184,148,216,.08) 55%, transparent 72%); }
.cat { position:absolute; display:block; }
.copy { position:absolute; left:${w * copyLeft}px; top:${h * copyTop}px; transform:translateY(-50%); width:${w * copyW}px; display:flex; flex-direction:column; gap:${s(22)}; }
.brand { display:flex; align-items:center; gap:${s(14)}; font-weight:700; font-size:${s(44)}; letter-spacing:-.02em; }
.brand svg { width:${s(40)}; height:${s(40)}; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:${s(8)} ${s(16)}; border-radius:999px; font-size:${s(16)}; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; white-space:nowrap; font-size:${s(74)}; line-height:1.02; letter-spacing:-.03em; font-weight:700; }
h1 .grad { background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:${s(23)}; line-height:1.4; color:rgba(248,248,255,.78); }
.sub b { color:#F8F8FF; font-weight:600; }
.foot { position:absolute; left:${w * copyLeft}px; bottom:${s(36)}; font-size:${s(18)}; color:rgba(234,198,234,.75); letter-spacing:.01em; z-index:50; }
.foot b { color:#EAC6EA; font-weight:600; }
.foot.right { left:auto; right:${w * copyLeft}px; }
</style></head><body><div class="card">${transparent ? '' : '<div class="dots"></div><div class="floor"></div><div class="glow"></div>'}${lineup}
${copy ? `<div class="copy">${copy}</div>` : ''}${foot ? `<div class="foot ${foot.side ?? ''}">${foot.html}</div>` : ''}</div></body></html>`;
};

const BRAND = `<div class="brand">${heart}Emogotchi</div>`;
const EYEBROW = `<div class="eyebrow">A cat that lives in your wallet</div>`;
const H1 = `<h1>Feed it. Wash it.<br><span class="grad">Burn EMO.</span></h1>`;
const SUB = `<p class="sub">A cat you keep alive on Monad. Every meal, bath and ball of yarn is <b>1 MON</b>, and <b>80%</b> of every interaction buys <b>EMO</b> and burns it.</p>`;
const FOOT = { html: `<b>$EMO</b> on Monad · emogotchi.emonad.lol` };
const FAMILY = [{ mood: 'hungry', size: 0.8 }, { mood: 'content', size: 0.9 }, { mood: 'happy', crown: true, size: 1.08, z: 10 }, { mood: 'sleeping', size: 0.86 }, { mood: 'bored', size: 0.82 }];

const pieces = [
  // X / Twitter header 1500x500 (3:1). The avatar covers the bottom-left corner on the profile page, so the copy sits high on the left.
  { name: 'x-header', w: 1500, h: 500, dpr: 2, use: 'X header · 1500×500 (3:1)', opts: { cats: FAMILY, copy: BRAND + EYEBROW + H1, copyLeft: 0.06, copyTop: 0.44, copyW: 0.36, floorAt: 0.9, catH: 0.8, span: [0.4, 0.985], catGap: 0.5, scale: 0.9 } },
  // OpenSea banner 2800x700 (4:1, under 1 MB). OpenSea drops the logo over the bottom-left and crops the sides on phones: copy small, lineup centered.
  { name: 'opensea-banner', w: 2800, h: 700, dpr: 1, use: 'OpenSea / Poply banner · 2800×700 (4:1)', opts: { cats: FAMILY, copy: BRAND + EYEBROW, copyLeft: 0.08, copyTop: 0.42, copyW: 0.3, floorAt: 0.9, catH: 1.05, span: [0.34, 0.985], catGap: 0.5, scale: 1.3, foot: { ...FOOT, side: 'right' } } },
  // OpenSea featured 1200x800 (3:2): the crowned cat, big.
  { name: 'opensea-featured', w: 1200, h: 800, dpr: 1, use: 'OpenSea featured image · 1200×800 (3:2)', opts: { cats: [{ mood: 'happy', crown: true, size: 1 }], copy: BRAND + EYEBROW + H1 + SUB, copyLeft: 0.06, copyTop: 0.48, copyW: 0.46, floorAt: 0.87, catH: 1.0, span: [0.55, 0.985], scale: 1.05, foot: FOOT } },
  // 16:9 hero: Discord banner / invite splash, decks, video thumbnails.
  { name: 'hero-16x9', w: 1920, h: 1080, dpr: 1, use: 'Hero 16:9 · 1920×1080 (Discord banner, splash, decks)', opts: { cats: FAMILY, copy: BRAND + EYEBROW + H1 + SUB, copyLeft: 0.06, copyTop: 0.42, copyW: 0.4, floorAt: 0.86, catH: 0.7, span: [0.47, 0.985], catGap: 0.48, scale: 1.5, foot: FOOT } },
];
pieces.push(
  { name: 'logo', w: 1024, h: 1024, dpr: 1, use: 'Logo / avatar · 1024×1024 (X, Telegram, Discord, MonadVision cover, OpenSea logo)', opts: { cats: [{ mood: 'happy', crown: true }], floorAt: 0.975, catH: 1.32, span: [0.0, 1.0], catGap: 1 } },
  { name: 'logo-transparent', w: 1024, h: 1024, dpr: 1, use: 'Logo on transparent · 1024×1024 (stickers, overlays)', opts: { cats: [{ mood: 'happy', crown: true }], floorAt: 0.975, catH: 1.32, span: [0.0, 1.0], catGap: 1, transparent: true } },
);
const written = [];
for (const p of pieces) {
  const html = OUT + `.${p.name}.html`; const png = OUT + `${p.name}.png`;
  writeFileSync(html, page({ w: p.w, h: p.h, ...p.opts }));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${p.w},${p.h}`, `--force-device-scale-factor=${p.dpr}`, `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
  unlinkSync(html);
  written.push({ file: `${p.name}.png`, use: p.use, px: `${p.w * p.dpr}×${p.h * p.dpr}`, kb: Math.round(statSync(png).size / 1024) });
  console.log(p.name, `${p.w * p.dpr}x${p.h * p.dpr}`, Math.round(statSync(png).size / 1024), 'KB');
}
// transparent logo: the crowned happy cat alone
writeFileSync(OUT + 'logo-transparent-1024.svg', Buffer.from(cat('happy', true).split(',')[1], 'base64'));
written.push({ file: '../og.png', use: 'Link preview (Open Graph / X card) · 2400×1260 (1.91:1)', px: '2400×1260', kb: Math.round(statSync(root + 'apps/web/public/og.png').size / 1024) });
writeFileSync(OUT + 'index.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Emogotchi brand kit</title><style>
body{margin:0;background:#0c0614;color:#F8F8FF;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:32px 20px 80px}h1{font-size:28px;margin:0 0 4px}p.lead{color:#B894D8;margin:0 0 32px}
.piece{max-width:1200px;margin:0 auto 48px}.piece h2{font-size:17px;margin:0 0 8px;font-weight:600}.piece small{color:#B894D8;font-weight:400;margin-left:8px}
.frame{background:repeating-conic-gradient(#1a1024 0 25%,#12091b 0 50%) 0 0/28px 28px;border-radius:14px;padding:12px;display:inline-block;max-width:100%}.frame img{display:block;max-width:100%;height:auto;border-radius:8px}
a{color:#ff7aa6}</style></head><body><h1>Emogotchi brand kit</h1><p class="lead">Every piece is generated from the on-chain cat art by <code>tools/brand.mjs</code>. Right-click → Save, or use the direct link.</p>
${written.map((p) => `<div class="piece"><h2>${p.use}<small>${p.px} · ${p.kb} KB · <a href="${p.file}" download>${p.file.replace('../', '')}</a></small></h2><div class="frame"><img src="${p.file}" alt=""></div></div>`).join('')}
</body></html>`);
writeFileSync(OUT + 'pieces.json', JSON.stringify(written, null, 2));
