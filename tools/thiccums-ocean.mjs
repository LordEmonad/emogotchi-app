// Thiccums' kit in the $THICCUMS coin's look (the coin's X banner: a sunny sky, the sea breaking on a rock, chunky white
// letters in a black line). LAB ONLY: he is not launched, so it writes to thiccumsgotchi/brand/ocean/, never the site.
// Reads his baked on-chain art (contracts/art-thiccums; node tools/bake-art.mjs thiccums first) the way brand.mjs does.
//   node tools/thiccums-ocean.mjs
// Decided with the operator (2026-09-29): the coin's look for his kit and link cards; the name "Thiccumsgotchi" with
// "Thiccums the Seal" under it; the coin and the sweep mentioned, worded only from what the operator said ("$THICCUMS is
// live on FOMO", "fees will be used to sweep @sappyseals and airdrop the NFTs to THICCUMS holders").
import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ART = root + 'contracts/art-thiccums/';
const OUT = root + 'thiccumsgotchi/brand/ocean/';
mkdirSync(OUT + 'pet', { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SG = 'file://' + root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const ROUND = 'file:///System/Library/Fonts/Supplemental/Arial%20Rounded%20Bold.ttf';
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];

// ---- him (and his mood's props) on a transparent 1024 canvas, straight from the on-chain blobs (brand.mjs's cat())
const base = readFileSync(ART + 'base.bin', 'latin1');
const seal = (mood, crown) => {
  const mi = MOODS.indexOf(mood);
  const patch = readFileSync(ART + `patch-${mi * 2 + (crown ? 1 : 0)}.bin`, 'latin1').split('\x01');
  let k = 0; const body = base.replace(/\x01/g, () => patch[k++]);
  const pre = readFileSync(ART + `scene-${mi}-pre.bin`, 'latin1'); const post = readFileSync(ART + `scene-${mi}-post.bin`, 'latin1');
  const defs = pre.slice(pre.indexOf('<defs>'), pre.indexOf('</defs>') + 7);
  const box = pre.slice(pre.lastIndexOf('<svg x='));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${defs}${box}${body}${post}`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'latin1').toString('base64');
};

// ---- the scenery, drawn in the pets' style: flat fills, a clean dark line on what is near (the rock, the foam), none on
// what is far (the sky, the sea)
const INK = '#141a24';
// a cumulus: overlapping domes on a flat-ish base, a pale blue underside
const cloud = (x, y, s, flip = 1) => {
  const puffs = [[0, 0, 1], [0.9, -0.35, 1.25], [1.95, -0.1, 1.05], [2.8, 0.2, 0.8], [-0.85, 0.25, 0.75]];
  const c = (dy, fill) => puffs.map(([px, py, r]) => `<circle cx="${(px * flip).toFixed(2)}" cy="${(py + dy).toFixed(2)}" r="${r}" fill="${fill}"/>`).join('');
  return `<g transform="translate(${x} ${y}) scale(${s})">${c(0.28, '#cfe8fb')}${c(0, '#ffffff')}<ellipse cx="${(1 * flip).toFixed(2)}" cy="0.75" rx="2.4" ry="0.42" fill="#e3f2fd"/></g>`;
};
// the rock: an outcrop standing out of the sea, drawn in a 100 x 50 box stretched to its place. Its main stone has a
// flat top to sit on (y = 8), steep sides down to the waterline (y = 40); a cooler stone rises behind one end and a
// small one sits in front of the other, so a long ledge still reads as rocks. Lit from the sun's side (`sunRight`).
const ROCK_TOP = 8 / 50; const ROCK_WATER = 40 / 50;
const MAIN = 'M1.6,43 L2,42 C3,34 5,26 8,19 C10,13 13,9.6 19,8.6 C30,7.4 42,8.2 50,7.8 C60,7.4 72,8.2 81,8.6 C87,9.4 90,13 92,19 C95,26 97,34 98,42 L98.4,43 Z';
const TOPFACE = 'M8,19 C10,13 13,9.6 19,8.6 C30,7.4 42,8.2 50,7.8 C60,7.4 72,8.2 81,8.6 C87,9.4 90,13 92,19 C84,15.4 70,14.2 50,14.4 C30,14.2 16,15.4 8,19 Z';
const BACK = 'M59.6,43 L60,20 C61,8 66,-1 74,-3.6 C80,-5.4 88,-4 92,1 C96,6 98,16 99,30 L99.6,43 Z';
const FRONT = 'M-3.4,43 L-3,40 C-2,33 1,27.6 6,26 C10,24.8 15,25.6 18,28.6 C21,31.6 23,37 23.6,42 L23.7,43 Z';
const rock = (lw, sunRight = true) => {
  return `<svg viewBox="0 0 100 50" preserveAspectRatio="none" width="100%" height="100%" style="overflow:visible${sunRight ? '' : ';transform:scaleX(-1)'}">
<defs>
<linearGradient id="rk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a39a91"/><stop offset=".45" stop-color="#7c736b"/><stop offset=".8" stop-color="#554d47"/><stop offset="1" stop-color="#3d3733"/></linearGradient>
<linearGradient id="rkb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d8c93"/><stop offset="1" stop-color="#55555d"/></linearGradient>
<linearGradient id="rkf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3aaa0"/><stop offset="1" stop-color="#655c55"/></linearGradient>
</defs>
<path d="${BACK}" fill="url(#rkb)"/>
<path d="M88,-2 C93,2 96,10 97.4,22 L92,26 C92,16 90.6,8 88,-2 Z" fill="#a9a8ae" opacity=".7"/>
<path d="${BACK}" fill="none" stroke="${INK}" stroke-width="${lw}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
<path d="${MAIN}" fill="url(#rk)"/>
<path d="${TOPFACE}" fill="#c2b8ad"/>
<path d="M81,8.6 C87,9.4 90,13 92,19 C95,26 97,34 98,42 L98.4,43 L86,43 C85,40 84,30 82,22 C84,20 84,16 81,14.3 C84,13.4 84.6,11 81,8.6 Z" fill="#b1a89e" opacity=".75"/>
<path d="M1.6,43 L2,42 C3,34 5,26 8,19 C12,17 16,16 21,15.3 C19,22 17,30 15,38 L14,43 Z" fill="#2c2622" opacity=".32"/>
<path d="M36,15 L39,22 L37,28 M60,15 L58,21 L62,27 M47,31 L50,36 M26,24 L29,31" fill="none" stroke="#3a322d" stroke-width="${lw * 0.55}" vector-effect="non-scaling-stroke" stroke-linecap="round" opacity=".55"/>
<path d="M4,37 C30,35 70,35 96.5,37 L98,42 L98.4,43 L1.6,43 L2,42 Z" fill="#2e3a3c" opacity=".35"/>
<path d="${MAIN}" fill="none" stroke="${INK}" stroke-width="${lw}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
<path d="${FRONT}" fill="url(#rkf)"/>
<path d="M6,26 C10,24.8 15,25.6 18,28.6 C14,28 10,28.2 3,30.6 C3.6,28.4 4.6,26.8 6,26 Z" fill="#cfc6bb"/>
<path d="${FRONT}" fill="none" stroke="${INK}" stroke-width="${lw}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
</svg>`;
};
// seeded numbers, so every render is the same picture
const rng = (seed) => { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
// the sea breaking round the rock's foot, drawn in pixels (so the drops stay round): a band of foam bumps along the
// waterline, bigger where the sea hits the ends, a pale wash under it, splashes thrown up at both ends, spray
const foam = (fw, fh, lw, seed = 7) => {
  const r = rng(seed); const wl = fh * 0.42;
  const bumps = []; let x = 0;
  while (x < fw - 1) {
    const t = (x + fh * 0.3) / fw; const end = Math.min(t, 1 - t) < 0.13;
    const bw = Math.min(fh * (end ? 0.62 : 0.46) * (0.75 + 0.5 * r()), fw - x);
    bumps.push([x, x + bw, fh * (end ? 0.26 : 0.13) * (0.7 + 0.6 * r())]);
    x += bw;
  }
  const top = `M0,${wl.toFixed(1)} ` + bumps.map(([a, b, hgt]) => `Q${((a + b) / 2).toFixed(1)},${(wl - hgt * 2).toFixed(1)} ${b.toFixed(1)},${wl.toFixed(1)}`).join(' ');
  const wave = (y0, amp, n, ph) => Array.from({ length: n + 1 }, (_, i) => { const xx = fw - (fw * i) / n; return `${i ? 'L' : ''}${xx.toFixed(1)},${(y0 + amp * Math.sin(i * 1.7 + ph)).toFixed(1)}`; }).join(' ');
  const lower = wave(fh * 0.64, fh * 0.07, 30, 0.3); const wash = wave(fh * 0.86, fh * 0.07, 22, 1.1);
  const curls = bumps.filter((_, i) => i % 2 === 1).map(([a, b, hgt]) => { const cx = (a + b) / 2; const rr = Math.min((b - a) * 0.22, hgt * 0.8); return `<path d="M${(cx - rr).toFixed(1)},${(wl - hgt * 0.35).toFixed(1)} a${rr.toFixed(1)},${rr.toFixed(1)} 0 0 1 ${(2 * rr).toFixed(1)},0" fill="none" stroke="#9fc9ea" stroke-width="${(lw * 0.7).toFixed(2)}" stroke-linecap="round"/>`; }).join('');
  // splashes: a burst of fingers of water thrown up and out at each end, one piece at the base, drops off the tips
  const splash = (bx, dir) => {
    const F = [[-12, 0.72, 0.15], [8, 1.0, 0.17], [30, 0.86, 0.15], [54, 0.58, 0.12]];
    const path = F.map(([deg, len, wd], i) => {
      const a = (deg * Math.PI) / 180; const L = fh * len; const x0 = bx + dir * (i - 1.5) * fh * 0.1; const y0 = wl + fh * 0.12;
      const tx = x0 + dir * Math.sin(a) * L; const ty = y0 - Math.cos(a) * L;
      const qx = x0 + dir * Math.sin(a) * L * 0.25; const qy = y0 - Math.cos(a) * L * 0.6;
      return [`M${x0.toFixed(1)},${y0.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`, fh * wd, tx, ty, a];
    });
    const under = path.map(([d, wd]) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${(wd + 2 * lw).toFixed(1)}" stroke-linecap="round"/>`).join('');
    const over = path.map(([d, wd]) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${wd.toFixed(1)}" stroke-linecap="round"/>`).join('');
    const tips = path.map(([, wd, tx, ty, a], i) => { const d = wd * (1.1 + 0.3 * i); const rr = wd * (0.36 - 0.04 * i); return `<circle cx="${(tx + dir * Math.sin(a) * d).toFixed(1)}" cy="${(ty - Math.cos(a) * d).toFixed(1)}" r="${rr.toFixed(1)}" fill="#fff" stroke="${INK}" stroke-width="${(lw * 0.8).toFixed(2)}"/>`; }).join('');
    return under + over + tips;
  };
  return `<svg viewBox="0 0 ${fw} ${fh}" width="${fw}" height="${fh}" style="overflow:visible">
${splash(fw * 0.045, -1)}${splash(fw * 0.955, 1)}
<path d="${top} L${fw},${fh * 0.86} ${wash} Z" fill="#cfe9fb" opacity=".5"/>
<path d="${top} L${fw},${fh * 0.64} ${lower} Z" fill="#fff"/>
${curls}
<path d="${top}" fill="none" stroke="${INK}" stroke-width="${lw}" stroke-linejoin="round" stroke-linecap="round"/>

</svg>`;
};
// a small wave breaking out on the sea, for the foreground (pixels)
const crest = (cw, lw) => { const ch = cw * 0.28; return `<svg viewBox="0 0 ${cw} ${ch}" width="${cw}" height="${ch}" style="overflow:visible"><path d="M0,${ch} C${cw * 0.15},${ch} ${cw * 0.22},${ch * 0.35} ${cw * 0.38},${ch * 0.28} C${cw * 0.5},${ch * 0.22} ${cw * 0.58},${ch * 0.5} ${cw * 0.52},${ch * 0.7} C${cw * 0.66},${ch * 0.44} ${cw * 0.82},${ch * 0.5} ${cw},${ch} Z" fill="#fff"/><path d="M0,${ch} C${cw * 0.15},${ch} ${cw * 0.22},${ch * 0.35} ${cw * 0.38},${ch * 0.28} C${cw * 0.5},${ch * 0.22} ${cw * 0.58},${ch * 0.5} ${cw * 0.52},${ch * 0.7} C${cw * 0.66},${ch * 0.44} ${cw * 0.82},${ch * 0.5} ${cw},${ch}" fill="none" stroke="${INK}" stroke-width="${lw}" stroke-linejoin="round"/></svg>`; };

const CSS = (w, h, horizon) => `
@font-face { font-family:'SG'; src:url('${SG}') format('woff2'); font-weight:300 700; }
@font-face { font-family:'RND'; src:url('${ROUND}') format('truetype'); }
html,body { margin:0; width:${w}px; height:${h}px; overflow:hidden; background:#1579d6; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:${w}px; height:${h}px; overflow:hidden; }
.sky { position:absolute; left:0; right:0; top:0; height:${h * horizon}px; background:linear-gradient(180deg,#136fd0 0%,#2f98ec 42%,#76c6f8 82%,#b9e4fd 100%); }
.sun { position:absolute; border-radius:50%; background:radial-gradient(closest-side,#ffffff 0%,#fffbe2 16%,rgba(255,246,196,.55) 30%,rgba(255,240,180,.18) 55%,transparent 100%); }
.flare { position:absolute; border-radius:50%; background:radial-gradient(closest-side,rgba(255,255,255,.26),rgba(255,255,255,.06) 70%,transparent); }
.clouds { position:absolute; inset:0; }
.sea { position:absolute; left:0; right:0; top:${h * horizon}px; bottom:0; background:linear-gradient(180deg,#5fb8f3 0%,#2b8fe3 10%,#1a73cf 38%,#0f58ab 75%,#0b468d 100%); }
.haze { position:absolute; left:0; right:0; top:${h * horizon - 2}px; height:4px; background:#cdeeff; opacity:.8; }
.glint { position:absolute; height:3px; border-radius:3px; background:#ffffff; }
.swell { position:absolute; left:0; right:0; height:3px; border-radius:50%; background:rgba(186,228,255,.35); }
.rock, .foam, .seal { position:absolute; }
.seal { display:block; }
.copy { position:absolute; display:flex; flex-direction:column; }
.title { font-family:'RND',sans-serif; color:#fff; -webkit-text-stroke: var(--st) ${INK}; paint-order: stroke fill; letter-spacing:.005em; line-height:1; text-shadow: 0 var(--sh) 0 ${INK}; white-space:nowrap; }
.tag { font-family:'RND',sans-serif; color:#ffd84a; -webkit-text-stroke: var(--st2) ${INK}; paint-order: stroke fill; line-height:1; text-shadow: 0 var(--sh2) 0 ${INK}; white-space:nowrap; letter-spacing:.02em; }
.h1 { font-family:'RND',sans-serif; color:#fff; -webkit-text-stroke: var(--st2) ${INK}; paint-order: stroke fill; line-height:1.08; text-shadow: 0 var(--sh2) 0 ${INK}; }
.h1 .y { color:#ffd84a; }
.panel { font-family:'SG',sans-serif; color:#fff; background:rgba(7,38,86,.62); border:2px solid rgba(255,255,255,.28); line-height:1.4; }
.panel b { color:#ffd84a; font-weight:700; }
.chip { align-self:flex-start; font-family:'SG',sans-serif; font-weight:700; color:${INK}; background:#ffd84a; border:3px solid ${INK}; border-radius:999px; box-shadow:0 4px 0 ${INK}; white-space:nowrap; }
.foot { position:absolute; font-family:'SG',sans-serif; font-weight:600; color:#fff; text-shadow:0 2px 0 rgba(7,38,86,.9); white-space:nowrap; }
.foot b { color:#ffd84a; }
.crown { position:absolute; font-family:'SG',sans-serif; font-weight:700; color:${INK}; background:#E8D89B; border:3px solid ${INK}; border-radius:999px; box-shadow:0 4px 0 ${INK}; }
`;

// the whole scene. seals: [{ mood, crown, size }] standing on the rock's top, spaced by `gap` (of the seal box), the row
// centred at cx. rock: its box as fractions of the card (x0, x1, top = where their feet go, depth below)
const FEET = 866 / 1024;   // his floor in his 1024 portrait (the belly's line at 861-868, his shadow round it; measured)
const STAND = 3.5 / 50;
const FOOT_L = 214 / 1024; const FOOT_R = 789 / 1024;   // his tail tip and his belly's far edge, low down
const FLAT = [0.15, 0.85];   // the flat of the rock's top face, as parts of its box    // they stand on the rock's top face, this far in front of its back rim
function scene({ w, h, horizon = 0.6, sun = [0.86, 0.12], sunR = 0.5, clouds = [], crests = [], rockBox, seals = [], sealH, gap = 0.52, cx, copy = '', foot = '', extra = '' }) {
  const top = h * rockBox.top;
  // the rock's box: its ledge (y = 8 of 50) at `top`, its waterline (y = 40) at `water`
  const water = h * rockBox.water; const rockH = (water - top) / (ROCK_WATER - ROCK_TOP);
  const rockTop = top - rockH * ROCK_TOP;
  const n = seals.length; const Hs = h * sealH;
  const lw = Math.max(2, Hs * 0.0098);                // his own line weight at this size, for everything near
  const xs = seals.map((s, i) => (i - (n - 1) / 2) * Hs * gap);
  // the rock is as long as the line-up: every seal's footprint (his tail tip at 214 of his 1024 portrait to his belly
  // at 789, measured) lies on the flat of the top face (15-85% of the rock's box), with a little to spare
  const feet = seals.map((s, i) => { const size = Hs * (s.size ?? 1); const c = w * cx + xs[i]; return [c + size * (FOOT_L - 0.5), c + size * (FOOT_R - 0.5)]; });
  const fl = Math.min(...feet.map((f) => f[0])) - Hs * 0.03; const fr = Math.max(...feet.map((f) => f[1])) + Hs * 0.03;
  const rw = Math.max((fr - fl) / (FLAT[1] - FLAT[0]), rockBox.minW ? w * rockBox.minW : 0);
  const rx0 = (fl + fr) / 2 - rw / 2;   // the flat is the middle of the box, so the line-up sits in its middle
  const rx1 = rx0 + rw;
  const lineup = seals.map((s, i) => {
    const size = Hs * (s.size ?? 1); const x = w * cx + xs[i] - size * 0.5;
    return `<img class="seal" style="left:${x}px; top:${top + rockH * STAND - size * FEET}px; width:${size}px; height:${size}px; z-index:${10 + (s.z ?? i)}" src="${seal(s.mood, !!s.crown)}">`;
  }).join('');
  const sunPx = Math.max(w, h) * sunR;
  const flares = [0.28, 0.46, 0.6].map((t, i) => { const fx = w * (sun[0] + (0.5 - sun[0]) * t); const fy = h * (sun[1] + (0.5 - sun[1]) * t); const r = h * [0.06, 0.035, 0.05][i]; return `<div class="flare" style="left:${fx - r}px; top:${fy - r}px; width:${2 * r}px; height:${2 * r}px"></div>`; }).join('');
  const glints = Array.from({ length: 14 }, (_, i) => { const t = i / 13; const y = h * horizon + (h - h * horizon) * (0.06 + t * 0.5); const len = w * (0.02 + 0.05 * (1 - t) * ((i * 37) % 7) / 7); const x = w * sun[0] + (((i * 53) % 11) - 5) * w * 0.012 - len / 2; return `<div class="glint" style="left:${x}px; top:${y}px; width:${len}px; opacity:${(0.55 - t * 0.35).toFixed(2)}"></div>`; }).join('');
  const swells = Array.from({ length: 5 }, (_, i) => `<div class="swell" style="top:${h * horizon + (h - h * horizon) * (0.12 + i * 0.16)}px; left:${-w * 0.1 + (i % 2) * w * 0.05}px; right:${-w * 0.1}px"></div>`).join('');
  const cloudSvg = `<svg class="clouds" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${clouds.map(([x, y, s, f]) => cloud(w * x, h * y, h * s, f)).join('')}</svg>`;
  const fw = (rx1 - rx0) * 1.06; const fh = Math.min(rockH * 0.5, Hs * 0.2);
  const sunRight = sun[0] >= rockBox.x0 + (rockBox.x1 - rockBox.x0) / 2 || sun[0] > 0.5;
  return `<div class="card"><div class="sky"></div>
<div class="sun" style="left:${w * sun[0] - sunPx / 2}px; top:${h * sun[1] - sunPx / 2}px; width:${sunPx}px; height:${sunPx}px"></div>${flares}${cloudSvg}
<div class="sea"></div><div class="haze"></div>${glints}${swells}
${crests.map(([x, y, cw]) => `<div class="foam" style="left:${w * x}px; top:${h * y}px; z-index:5">${crest(w * cw, lw * 0.8)}</div>`).join('')}
<div class="rock" style="left:${rx0}px; width:${rx1 - rx0}px; top:${rockTop}px; height:${rockH}px; z-index:6">${rock(lw, sunRight)}</div>
${lineup}
<div class="foam" style="left:${rx0 - (fw - (rx1 - rx0)) / 2}px; top:${water - fh * 0.42}px; z-index:30">${foam(fw, fh, lw * 0.85)}</div>
${extra}${copy}${foot}</div>`;
}

const render = (name, w, h, dpr, body, use) => {
  const html = OUT + `.${name.replace('/', '-')}.html`; const png = OUT + `${name}.png`;
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(w, h, body.horizon ?? 0.6)}</style></head><body>${scene({ w, h, ...body })}</body></html>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--force-device-scale-factor=${dpr}`, `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
  unlinkSync(html);
  const kb = Math.round(statSync(png).size / 1024); console.log(name, `${w * dpr}x${h * dpr}`, kb, 'KB');
  return { file: `${name}.png`, use, px: `${w * dpr}×${h * dpr}`, kb };
};

// ---- copy
const TITLE = 'Thiccumsgotchi'; const TAG = 'THICCUMS THE SEAL';
const H1 = `Mint him free.<br><span class="y">Watch it bounce.</span>`;
const SUB = `A seal with a big bouncy butt, free to mint on Monad, one per wallet. Feed him, wash him, play with him, and watch that butt <b>bounce</b>.`;
const COIN = `<b>$THICCUMS</b> is live on FOMO: its fees sweep <b>Sappy Seals</b> and airdrop them to holders.`;
const FOOT = `Thiccumsgotchi on Monad · <b>$THICCUMS</b> on FOMO`;
const block = (s, { title = true, tag = true, h1 = true, sub = false, coin = false, chip = false, left, top, width, gap }) => {
  const parts = [];
  if (chip) parts.push(`<div class="chip" style="font-size:${s * 17}px; padding:${s * 7}px ${s * 16}px">$THICCUMS is live on FOMO</div>`);
  if (title) parts.push(`<div class="title" style="font-size:${s * 76}px; --st:${s * 9}px; --sh:${s * 6}px">${TITLE}</div>`);
  if (tag) parts.push(`<div class="tag" style="font-size:${s * 30}px; --st2:${s * 6}px; --sh2:${s * 4}px">${TAG}</div>`);
  if (h1) parts.push(`<div class="h1" style="font-size:${s * 50}px; --st2:${s * 8}px; --sh2:${s * 5}px">${h1 === true ? H1 : h1}</div>`);
  if (sub || coin) parts.push(`<div class="panel" style="font-size:${s * 20}px; padding:${s * 14}px ${s * 18}px; border-radius:${s * 18}px">${sub ? (sub === true ? SUB : sub) : ''}${sub && coin ? `<div style="height:${s * 8}px"></div>` : ''}${coin ? COIN : ''}</div>`);
  return `<div class="copy" style="left:${left}px; top:${top}px; width:${width}px; gap:${gap ?? s * 16}px; z-index:40">${parts.join('')}</div>`;
};
const foot = (s, left, bottom, right = false) => `<div class="foot" style="${right ? 'right' : 'left'}:${left}px; bottom:${bottom}px; font-size:${s * 17}px; z-index:40">${FOOT}</div>`;

const FAMILY = [{ mood: 'hungry', size: 0.86 }, { mood: 'content', size: 0.94 }, { mood: 'happy', crown: true, size: 1.1, z: 10 }, { mood: 'sleeping', size: 0.92 }, { mood: 'bored', size: 0.86 }];
const TRIO = [{ mood: 'hungry', size: 0.9 }, { mood: 'happy', crown: true, size: 1.08, z: 10 }, { mood: 'sleeping', size: 0.92 }];
const CLOUDS_WIDE = [[0.08, 0.2, 0.05, 1], [0.3, 0.1, 0.035, -1], [0.55, 0.24, 0.03, 1], [0.7, 0.07, 0.04, 1], [0.95, 0.3, 0.045, -1]];
const written = [];

// X header 1500x500: copy high on the left (the avatar covers the bottom left), the family on the rock on the right
written.push(render('thiccums-x-header', 1500, 500, 2, {
  horizon: 0.64, clouds: CLOUDS_WIDE, sun: [0.93, 0.14], sunR: 0.42,
  rockBox: { top: 0.66, water: 0.9 }, seals: TRIO, sealH: 0.56, gap: 0.56, cx: 0.735, crests: [[0.05, 0.86, 0.05], [0.2, 0.93, 0.07], [0.36, 0.82, 0.04]],
  copy: block(0.92, { left: 70, top: 44, width: 620, h1: true }),
}, 'X header · 1500×500 (3:1)'));

// OpenSea header 2400x900 (8:3; the middle 16:9 is what a phone keeps): no text, the family on a rock held in the middle
written.push(render('thiccums-opensea-banner', 2400, 900, 1, {
  horizon: 0.58, clouds: [[0.05, 0.18, 0.06, 1], [0.24, 0.08, 0.04, -1], [0.44, 0.2, 0.035, 1], [0.66, 0.1, 0.045, 1], [0.93, 0.26, 0.055, -1]], sun: [0.86, 0.15], sunR: 0.36,
  rockBox: { top: 0.7, water: 0.92 }, seals: FAMILY, sealH: 0.5, gap: 0.5, cx: 0.5, crests: [[0.04, 0.8, 0.05], [0.13, 0.9, 0.07], [0.8, 0.84, 0.06], [0.9, 0.93, 0.05]],
}, 'OpenSea / Poply header · 2400×900 (8:3; the middle 16:9 is what a phone keeps)'));

// OpenSea featured 1200x800: him crowned, big, on the rock; the offer and the coin on the left
written.push(render('thiccums-opensea-featured', 1200, 800, 1, {
  horizon: 0.6, clouds: [[0.1, 0.1, 0.045, 1], [0.58, 0.07, 0.035, -1], [0.9, 0.3, 0.05, 1]], sun: [0.9, 0.1], sunR: 0.5,
  rockBox: { top: 0.72, water: 0.92, minW: 0.44 }, seals: [{ mood: 'happy', crown: true }], sealH: 0.66, cx: 0.765, crests: [[0.42, 0.9, 0.06]],
  copy: block(0.9, { left: 56, top: 70, width: 560, sub: true, coin: true }), foot: foot(0.9, 56, 26),
}, 'OpenSea featured image · 1200×800 (3:2)'));

// link preview for his mint page 1200x630 @2x
written.push(render('thiccums-og', 1200, 630, 2, {
  horizon: 0.6, clouds: [[0.12, 0.1, 0.045, 1], [0.6, 0.06, 0.035, -1], [0.92, 0.3, 0.05, 1]], sun: [0.9, 0.1], sunR: 0.55,
  rockBox: { top: 0.74, water: 0.93, minW: 0.42 }, seals: [{ mood: 'happy', crown: true }], sealH: 0.7, cx: 0.8,
  copy: block(0.78, { left: 48, top: 40, width: 600, sub: true, coin: true }), foot: foot(0.78, 48, 20),
}, 'Link preview (Open Graph / X card) · 2400×1260 (1.91:1), for his mint page'));

// 16:9 hero
written.push(render('thiccums-hero-16x9', 1920, 1080, 1, {
  horizon: 0.6, clouds: CLOUDS_WIDE, sun: [0.9, 0.12], sunR: 0.45,
  rockBox: { top: 0.7, water: 0.92 }, seals: TRIO, sealH: 0.46, gap: 0.56, cx: 0.73, crests: [[0.4, 0.88, 0.05]],
  copy: block(1.35, { left: 110, top: 150, width: 820, sub: true, coin: true }), foot: foot(1.35, 110, 44),
}, 'Hero 16:9 · 1920×1080 (Discord banner, splash, decks)'));

// logo and icon 1024: him on his rock under the sun, no text
written.push(render('thiccums-logo', 1024, 1024, 1, {
  horizon: 0.62, clouds: [[0.1, 0.18, 0.05, 1], [0.78, 0.1, 0.04, -1]], sun: [0.84, 0.14], sunR: 0.55,
  rockBox: { top: 0.8, water: 0.95, minW: 0.74 }, seals: [{ mood: 'happy', crown: true }], sealH: 0.86, cx: 0.5,
}, 'Logo / avatar · 1024×1024, crowned (OpenSea logo, X, Telegram, Discord)'));
written.push(render('thiccums-icon', 1024, 1024, 1, {
  horizon: 0.62, clouds: [[0.1, 0.18, 0.05, 1], [0.78, 0.1, 0.04, -1]], sun: [0.84, 0.14], sunR: 0.55,
  rockBox: { top: 0.8, water: 0.95, minW: 0.74 }, seals: [{ mood: 'content' }], sealH: 0.86, cx: 0.5,
}, 'Icon / avatar · 1024×1024, his resting face, as the coin\'s banner draws him'));

// ---- the link cards for his pet pages: one per mood, crowned or not, the mood on the left, him on the rock on the right
const MOOD_COPY = {
  content: ['Doing just fine.', 'Fed, washed, played with, rested. And that butt is <b>bouncing</b>.'],
  happy: ['Happy.', 'Somebody has been looking after him. Give it a <b>bounce</b>.'],
  hungry: ['Hungry.', 'His bowl is empty. A seal needs his fish.'],
  grubby: ['Needs a bath.', 'He is not going to wash himself.'],
  bored: ['Bored out of his mind.', 'Throw him the ball. He will head it right back.'],
  sleepy: ['Sleepy.', 'Put him to bed.'],
  sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
  sad: ['Sad.', 'Nobody has come by in a while.'],
  dead: ['Dead.', 'Nobody fed him. Written on the seal, on chain, forever.'],
};
for (const mood of MOODS) for (const crown of [false, true]) {
  const [head, sub] = MOOD_COPY[mood];
  const name = `pet/${mood}${crown ? '-crown' : ''}`;
  render(name, 1200, 630, 1, {
    horizon: 0.6, clouds: [[0.1, 0.1, 0.045, 1], [0.6, 0.06, 0.035, -1], [0.93, 0.32, 0.05, 1]], sun: [0.88, 0.1], sunR: 0.55,
    rockBox: { top: 0.76, water: 0.94, minW: 0.42 }, seals: [{ mood, crown }], sealH: 0.7, cx: 0.8,
    copy: block(0.82, { left: 52, top: 60, width: 600, h1: head.length > 15 ? `<span style="font-size:.8em">${head}</span>` : head, sub, coin: true }),
    foot: foot(0.82, 52, 22),
    extra: crown ? `<div class="crown" style="right:40px; top:26px; font-size:18px; padding:7px 16px; z-index:45">♛ Wears the crown</div>` : '',
  });
}

// the page to look at them on
writeFileSync(OUT + 'index.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thiccums, the coin's look</title><style>
body{margin:0;background:#06213f;color:#fff;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 6px}p{color:#bfe6ff;margin:0 0 20px;max-width:900px}
.p{max-width:1200px;margin:0 auto 34px}.p h2{font-size:16px;margin:0 0 8px}.p small{color:#bfe6ff;font-weight:400;margin-left:6px}img{display:block;max-width:100%;height:auto;border-radius:10px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr));gap:12px}a{color:#ffd84a}</style></head><body>
<h1>Thiccums, in the $THICCUMS look</h1><p>His kit and his pet-page link cards on the coin's sunny sea. Local only: he is not launched. Made by <code>tools/thiccums-ocean.mjs</code>.</p>
${written.map((p) => `<div class="p"><h2>${p.use}<small>${p.px} · ${p.kb} KB · <a href="${p.file}">${p.file}</a></small></h2><a href="${p.file}"><img src="${p.file}"></a></div>`).join('')}
<div class="p"><h2>Link cards for his pet pages <small>one per mood, crowned or not</small></h2><div class="g">${MOODS.flatMap((m) => [m, m + '-crown']).map((f) => `<a href="pet/${f}.png"><img src="pet/${f}.png" loading="lazy"></a>`).join('')}</div></div>
</body></html>`);
writeFileSync(OUT + 'pieces.json', JSON.stringify(written, null, 2));
console.log('wrote', OUT);
