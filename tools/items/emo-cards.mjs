// The emo pack's shop cards (the pack is DEV only, nothing is on chain yet): seven items, each in two editions.
//   - the paid edition (30 MON, for anyone holding a pet): the shop's own item stage, like every card before it;
//   - the holders' edition (free and soulbound, for a wallet holding 7,000 $EMO): the same item on black velvet over a
//     checkered floor, in a holographic foil frame, a round foil seal (EMO HOLDER . SOULBOUND) and a heart padlock on a
//     chain in its corners, two foil hearts in the others; its foil drifts and a sheen crosses it now and then (SMIL, so
//     it moves wherever the picture is shown as an image; a still renderer shows the first frame, which is complete).
// The bedroom is the room itself: by day for the paid edition, by night, its lights twinkling, for the holders'.
//   python3 packages/pet/design/emocards.py && node tools/items/emo-cards.mjs [--no-png]
//   -> contracts/items/emo/<item>.svg and <item>-holder.svg (the pictures that would go on chain),
//      apps/web/public/brand/emo/ (the same pictures, for the site's shop and pack page), emopack/cards/*.png (each rendered
//      by Chrome as an <img>, as a wallet or the shop shows it) and emopack/index.html, the review page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const PROPS = root + 'packages/pet/props/';
const OUT = root + 'contracts/items/emo/';
const PAGE = root + 'emopack/';
const SITE = root + 'apps/web/public/brand/emo/';
mkdirSync(OUT, { recursive: true });
mkdirSync(PAGE + 'cards', { recursive: true });
mkdirSync(SITE, { recursive: true });
const S = 1024;

/** A prop's drawing without its <svg> wrapper; ids stripped so several copies can share a document, unless kept. */
const inner = (name, keepIds = false) => {
  let s = readFileSync(PROPS + name + '.svg', 'utf8');
  s = s.slice(s.indexOf('>', s.indexOf('<svg')) + 1, s.lastIndexOf('</svg>'));
  if (!keepIds) s = s.replace(/\s+id="[^"]*"/g, '');
  return s.replace(/\n/g, '');
};
/** Drop every subtree hidden by attribute or style (a prop's switched frames: only what shows at rest goes on a card). */
const clean = (s) => {
  const out = []; const stack = []; let skip = 0; let i = 0;
  const re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(s))) {
    const [tag, close, , attrs, self] = m;
    if (!skip) out.push(s.slice(i, m.index));
    i = m.index + tag.length;
    if (close) { const top = stack.pop(); if (top) skip--; else if (!skip) out.push(tag); continue; }
    const hide = skip > 0 || /visibility(:\s*|=")hidden/.test(attrs);
    if (self) { if (!hide) out.push(tag); continue; }
    stack.push(hide); if (hide) skip++; else out.push(tag);
  }
  if (!skip) out.push(s.slice(i));
  return out.join('').replace(/\sdata-[a-z-]+="[^"]*"/g, '');
};
/** One group of a prop by its class (a whole subtree). */
const part = (src, cls) => {
  const i = src.indexOf(`<g class="${cls}"`); let d = 0, j = i; const re = /<g\b|<\/g>/g; re.lastIndex = i; let m;
  while ((m = re.exec(src))) { d += m[0] === '</g>' ? -1 : 1; if (d === 0) { j = m.index + 4; break; } }
  return src.slice(i, j);
};
const f1 = (n) => (Math.round(n * 10) / 10).toString();
/** A prop at (x, y), `w` wide, from its own `vbW`-wide box, turned `rot` degrees about its middle. */
const place = (body, x, y, w, vbW, vbH, rot = 0) => {
  const k = w / vbW;
  const turn = rot ? ` rotate(${rot} ${vbW / 2} ${vbH / 2})` : '';
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k.toFixed(4)})${turn}">${body}</g>`;
};
/** Tenths: plenty at this size, and fewer bytes on chain. */
const tenths = (svg) => svg.split(/(values="[^"]*")/).map((t, i) => (i % 2 ? t : t.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10)))).join('');   // (a colour matrix keeps its precision)
/** Every path's d rewritten in relative commands: the same points (rounded once, at `dec` decimals, then differenced,
 *  so nothing drifts), a third fewer bytes, and bytes are gas. A path with an arc is left as it is. */
const relpath = (d, dec = 1) => {
  const f = 10 ** dec;
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  if (!toks || toks.some((t) => /^[aA]$/.test(t))) return d;
  const n = (v) => { let s = String(v / f); if (s.startsWith('0.')) s = s.slice(1); else if (s.startsWith('-0.')) s = '-' + s.slice(2); return s; };
  const join = (vals) => vals.map((v, j) => { const s = n(v); return j && !s.startsWith('-') ? ' ' + s : s; }).join('');
  let i = 0, cmd = '', last = '', X = 0, Y = 0, SX = 0, SY = 0; const out = [];
  const num = () => Math.round(Number(toks[i++]) * f);
  const emit = (c, vals) => { out.push((c === last && c !== 'm' ? (vals.length && !n(vals[0]).startsWith('-') ? ' ' : '') : c) + join(vals)); last = c === 'm' ? 'l' : c; };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
    if (C === 'Z') { out.push('z'); last = 'z'; X = SX; Y = SY; continue; }
    const pt = () => { let x = num(), y = num(); if (rel) { x += X; y += Y; } return [x, y]; };
    if (C === 'M') { const [x, y] = pt(); emit('m', [x - X, y - Y]); X = SX = x; Y = SY = y; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L' || C === 'T') { const [x, y] = pt(); emit(C.toLowerCase(), [x - X, y - Y]); X = x; Y = y; }
    else if (C === 'H') { let x = num(); if (rel) x += X; emit('h', [x - X]); X = x; }
    else if (C === 'V') { let y = num(); if (rel) y += Y; emit('v', [y - Y]); Y = y; }
    else if (C === 'C') { const a = pt(), b = pt(), c = pt(); emit('c', [a[0] - X, a[1] - Y, b[0] - X, b[1] - Y, c[0] - X, c[1] - Y]); X = c[0]; Y = c[1]; }
    else if (C === 'S' || C === 'Q') { const a = pt(), c = pt(); emit(C.toLowerCase(), [a[0] - X, a[1] - Y, c[0] - X, c[1] - Y]); X = c[0]; Y = c[1]; }
    else return d;
    if (i < toks.length && !/^[a-zA-Z]$/.test(toks[i]) && C === 'M') continue;
  }
  return out.join('');
};
const compact = (svg) => svg.replace(/ d="([^"]*)"/g, (m, d) => ` d="${relpath(d, 1)}"`).replace(/ points="([^"]*)"/g, (m, p) => ` points="${p.trim().split(/[\s,]+/).map((v) => String(Math.round(Number(v) * 10) / 10)).join(' ')}"`);
const wholes = (svg) => svg.replace(/(d|points)="([^"]*)"/g, (m, a, v) => `${a}="${v.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))}"`);

// ======================================================================================== the two stages
const SPARKLE = inner('sparkle');
const sparkles = (op = 1) => [[0.12, 0.22, 0.05, 0.9], [0.84, 0.16, 0.04, 0.8], [0.85, 0.62, 0.055, 0.85], [0.11, 0.66, 0.035, 0.7]]
  .map(([x, y, w, o]) => `<g transform="translate(${f1(x * S)} ${f1(y * S)}) scale(${((w * S) / 40).toFixed(4)})" opacity="${(o * op).toFixed(2)}">${SPARKLE}</g>`).join('\n');

/** The paid edition: the shop's item stage (build-art.mjs's), the floor's glow in the item's colour. */
const stage = (glow, bottom, content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#4a2a6e"/><stop offset=".45" stop-color="#2e1a4c"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".14"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".16"/><stop offset=".55" stop-color="#EAC6EA" stop-opacity=".05"/><stop offset=".8" stop-color="#EAC6EA" stop-opacity="0"/></linearGradient>
<radialGradient id="plinth"><stop offset="0" stop-color="${glow}" stop-opacity=".42"/><stop offset=".55" stop-color="${glow}" stop-opacity=".14"/><stop offset=".72" stop-color="${glow}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#dots)"/>
<polygon points="433,-82 590,-82 839,1126 184,1126" fill="url(#beam)"/>
<ellipse cx="512" cy="${bottom - 8}" rx="330" ry="50" fill="url(#plinth)"/>
${sparkles()}
${content}
</svg>`;

// ---- the holders' edition
/** The foil: a holographic spectrum on each shape's own box, drifting round (reflected, so the loop has no seam). */
const HOLO = `<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1" spreadMethod="reflect">
<stop offset="0" stop-color="#FF78B6"/><stop offset=".17" stop-color="#C79BFF"/><stop offset=".34" stop-color="#7BD9FF"/><stop offset=".5" stop-color="#B4FFE0"/><stop offset=".66" stop-color="#FFE597"/><stop offset=".83" stop-color="#FF9BCB"/><stop offset="1" stop-color="#C79BFF"/>
<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="2 2" dur="7s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF" stop-opacity="0"/><stop offset=".28" stop-color="#FF8BC4" stop-opacity=".1"/><stop offset=".46" stop-color="#FFF" stop-opacity=".3"/><stop offset=".56" stop-color="#8EE4FF" stop-opacity=".14"/><stop offset=".72" stop-color="#FFE59A" stop-opacity=".08"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></linearGradient>`;
// ---- the holders' edition's motion. Every piece is still in its first frame, and the first frame is the picture a still
// renderer shows (a marketplace's thumbnail): nothing moves into place, nothing is hidden at rest.
const EASE = 'calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"';
/** `body` breathing about (cx, cy): its scale through `values` (1 first and last). */
const pulse = (body, cx, cy, values, dur, begin = 0) => `<g transform="translate(${cx} ${cy})"><g><animateTransform attributeName="transform" type="scale" values="${values}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" ${values.split(';').length === 3 ? EASE : ''}/><g transform="translate(${-cx} ${-cy})">${body}</g></g></g>`;
/** A foil sparkle that twinkles: it shrinks to a glint and swells back, turning, on its own clock. */
const SPK = SPARKLE.replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="url(#holo)"');
// (drawn once, in the defs, and used eight times: `href` and the old `xlink:href` both, for renderers that know only one)
const SPK_DEF = `<g id="spk">${SPK}</g>`;
const twinkle = (x, y, w, dur, begin) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${(w / 40).toFixed(4)})"><g transform="translate(20 20)"><g><animateTransform attributeName="transform" type="scale" values="1;.15;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" ${EASE}/><animateTransform attributeName="transform" type="rotate" values="0;90" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" additive="sum"/><use href="#spk" xlink:href="#spk" transform="translate(-20 -20)"/></g></g></g>`;
const SPARKS = [[0.17, 0.36, 0.05, 2.6, 0.2], [0.83, 0.3, 0.042, 3.1, 1.1], [0.86, 0.6, 0.055, 2.3, 0.6], [0.13, 0.62, 0.038, 2.9, 1.6], [0.72, 0.13, 0.03, 2.2, 0.9], [0.3, 0.15, 0.026, 3.4, 2.1], [0.64, 0.74, 0.024, 2.7, 1.4], [0.24, 0.8, 0.03, 3.0, 0.4]];
/** The sheen: an iridescent band crossing the card every six seconds, eased (off the card in the first frame). */
const SHEEN = `<g transform="rotate(24 512 512)"><rect x="-1800" y="-500" width="520" height="2024" fill="url(#sheen)"><animate attributeName="x" values="-1800;1500;1500" keyTimes="0;.42;1" calcMode="spline" keySplines=".4 0 .6 1;0 0 1 1" dur="6s" begin="1s" repeatCount="indefinite"/></rect></g>`;
/** The checkered floor, in one-point perspective toward the middle of the card, fading into the dark. */
const checkerFloor = () => {
  const VPY = 560, F = 500, near = [], far = [];
  const rows = []; for (let z = 0.9; z < 2.3; z += 0.19) rows.push(z);
  const X = (u, z) => 512 + (F * u) / z, Y = (z) => VPY + F / z;
  const quads = [];
  for (let j = 0; j < rows.length - 1; j++) for (let i = -14; i < 14; i++) {
    if ((i + j) % 2 === 0) continue;
    const u0 = i * 0.19, u1 = (i + 1) * 0.19, z0 = rows[j], z1 = rows[j + 1];
    const pts = [[X(u0, z0), Y(z0)], [X(u1, z0), Y(z0)], [X(u1, z1), Y(z1)], [X(u0, z1), Y(z1)]];
    if (pts.every(([x]) => x < -20) || pts.every(([x]) => x > S + 20)) continue;
    quads.push('M' + pts.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L') + 'Z');
  }
  const top = Math.round(Y(rows[rows.length - 1]));
  return `<rect y="${top}" width="${S}" height="${S - top}" fill="#0D0610"/>
<path d="${quads.join('')}" fill="#3A2346"/>
<rect y="${top}" width="${S}" height="${S - top}" fill="url(#floorfade)"/>`;
};
/** The frame and its corners, over everything. */
const SEAL = inner('emoholdseal'), LOCK = inner('emoholdlock', true), HEART = inner('emoholdheart');
const frame = () => `<rect x="20" y="20" width="984" height="984" rx="30" fill="none" stroke="#000" stroke-width="27"/>
<rect x="20" y="20" width="984" height="984" rx="30" fill="none" stroke="url(#holo)" stroke-width="18"/>
<rect x="20" y="20" width="984" height="984" rx="30" fill="none" stroke="#FFF" stroke-width="7" stroke-opacity="0" stroke-dasharray="150 3736" stroke-linecap="round"><set attributeName="stroke-opacity" to=".8" begin="0s"/><animate attributeName="stroke-dashoffset" from="0" to="-3886" dur="4.5s" repeatCount="indefinite"/></rect>
<rect x="35" y="35" width="954" height="954" rx="18" fill="none" stroke="#000" stroke-width="3.5"/>
<rect x="43" y="43" width="938" height="938" rx="12" fill="none" stroke="url(#holo)" stroke-width="2.5" opacity=".85"/>
${pulse(place(HEART, 886, 30, 104, 64, 64, 12), 938, 85, '1;1.16;1;1.09;1', 1.8)}
${pulse(place(HEART, 34, 892, 96, 64, 64, -14), 82, 946, '1;1.16;1;1.09;1', 1.8, 0.9)}
<g transform="translate(134 134) scale(${(232 / 200).toFixed(4)}) translate(-100 -100)"><g><animateTransform attributeName="transform" type="rotate" values="0 100 100;360 100 100" dur="36s" repeatCount="indefinite"/>${SEAL}</g></g>
<g transform="rotate(-10 936 914)"><g><animateTransform attributeName="transform" type="rotate" values="0 936 824;7 936 824;0 936 824;-7 936 824;0 936 824" dur="3.6s" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1" repeatCount="indefinite"/>${place(LOCK, 936 - 70, 914 - 131 * 140 / 120, 140, 120, 172)}</g></g>`;
const holderStage = (glow, bottom, content, { floor = true } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
${SPK_DEF}
<radialGradient id="hbg" cx="50%" cy="44%" r="74%"><stop offset="0" stop-color="#4B1748"/><stop offset=".42" stop-color="#230A22"/><stop offset="1" stop-color="#08030A"/></radialGradient>
<linearGradient id="hbeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7AB6" stop-opacity=".24"/><stop offset=".55" stop-color="#FF7AB6" stop-opacity=".07"/><stop offset=".85" stop-color="#FF7AB6" stop-opacity="0"/></linearGradient>
<radialGradient id="hplinth"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset=".5" stop-color="${glow}" stop-opacity=".18"/><stop offset=".72" stop-color="${glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="floorfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14071A"/><stop offset=".55" stop-color="#14071A" stop-opacity=".35"/><stop offset="1" stop-color="#14071A" stop-opacity=".1"/></linearGradient>
${HOLO}
</defs>
<rect width="${S}" height="${S}" fill="url(#hbg)"/>
${floor ? checkerFloor() : ''}
<polygon points="433,-82 590,-82 860,1126 164,1126" fill="url(#hbeam)"/>
<ellipse cx="512" cy="${bottom - 8}" rx="340" ry="56" fill="url(#hplinth)"><animate attributeName="rx" values="340;300;340" dur="4.8s" repeatCount="indefinite" ${EASE}/><animate attributeName="opacity" values="1;.72;1" dur="4.8s" repeatCount="indefinite" ${EASE}/></ellipse>
${SPARKS.map(([x, y, w, dur, begin]) => twinkle(x * S, y * S, w * S, dur, begin)).join('\n')}
<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -12;0 0" dur="4.8s" repeatCount="indefinite" ${EASE}/>${content}</g>
${SHEEN}
${frame()}
</svg>`;

// ======================================================================================== the items
/** A prop standing on the stage: `w` wide, its middle at cx, its foot at `bottom`. In the holders' frame it is drawn a
 *  little smaller and higher (`hold`), clear of the seal and the padlock. */
const standing = (body, vbW, vbH, w, cx, bottom, rot = 0) => place(body, cx - w / 2, bottom - (w * vbH) / vbW, w, vbW, vbH, rot);
const shrink = (content, k = 0.86, cy = 520) => `<g transform="translate(512 ${cy}) scale(${k}) translate(-512 -${cy})">${content}</g>`;

const NOTE = readFileSync(PROPS + 'emoguitarnote.svg', 'utf8');
const N1 = part(NOTE, 'n1'), N2 = part(NOTE, 'n2');
const note = (g, x, y, w, rot = 0) => `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${rot} ${f1(w / 2)} ${f1(w * 0.62)}) scale(${(w / 32).toFixed(4)})">${g}</g>`;
const HEARTP = inner('heart');

const ITEMS = [
  { key: 'beanie', name: 'Beanie', what: 'A black slouch beanie with a ribbed cuff and a broken-heart patch, the black emo hair under it.',
    glow: '#E84D7F', bottom: 0.9 * S, content: () => standing(inner('emobeaniecard', true), 150, 150, 0.76 * S, 512, 0.93 * S) },
  { key: 'fit', name: 'Emo clothes', what: 'The fit, cut for each pet: a band tee over stripes, skinny jeans, a studded belt, checkered slip-ons.',
    glow: '#B894D8', bottom: 0.93 * S, content: () => standing(inner('emofitcard', true), 150, 172, 0.76 * S, 512, 0.97 * S) },
  { key: 'wristbands', name: 'Wristbands', what: 'Purple sweatbands with a white stripe, on both wrists.',
    glow: '#C27ACB', bottom: 0.84 * S, content: () => standing(inner('emowristcard', true), 150, 88, 0.8 * S, 512, 0.82 * S) },
  { key: 'piercings', name: 'Lip piercings', what: 'Snakebites: two silver hoops through the lower lip. Gold when the pet is crowned.',
    glow: '#E84D7F', bottom: 0.8 * S, content: () => standing(inner('emolipcard', true), 150, 104, 0.8 * S, 512, 0.79 * S) },
  { key: 'guitar', name: 'Guitar', what: 'A black offset electric. Play brings it down from the sky: the pet picks it up, shreds and throws it.',
    glow: '#E84D7F', bottom: 0.88 * S, content: () => [
      place(inner('emoguitar', true), 512 - 0.4 * S, 470 - 0.4 * S * 76 / 162, 0.8 * S, 162, 76, -34),
      note(N1, 0.14 * S, 0.2 * S, 0.11 * S, -10), note(N2, 0.76 * S, 0.17 * S, 0.12 * S, 10), note(N1, 0.8 * S, 0.62 * S, 0.085 * S, 8), note(N2, 0.1 * S, 0.6 * S, 0.09 * S, -12),
    ].join('\n') },
  { key: 'selfie', name: 'Mirror selfie', what: 'A pink flip phone. Pet becomes a mirror selfie: it falls in, three poses, a flash, and it is thrown away.',
    glow: '#FF7AB6', bottom: 0.9 * S, content: () => {
      const w = 0.36 * S, h = (w * 76) / 40, x = 512 - w / 2, y = 0.16 * S;
      const k = w / 40, fx = 27.5 * k, fy = 30.5 * k, fw = 0.15 * S;
      const glowAt = `<circle cx="${f1(x + fx)}" cy="${f1(y + fy)}" r="${f1(0.13 * S)}" fill="url(#flashglow)"/>`;
      const phone = `<defs><radialGradient id="flashglow"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".75"/><stop offset=".35" stop-color="#FFD3E4" stop-opacity=".35"/><stop offset="1" stop-color="#FF7AB6" stop-opacity="0"/></radialGradient></defs><g transform="rotate(-9 512 ${f1(y + h / 2)})">${place(clean(inner('emophone')), x, y, w, 40, 76)}${glowAt}<g transform="translate(${f1(x + fx - fw / 2)} ${f1(y + fy - fw / 2)}) scale(${(fw / 64).toFixed(4)})">${inner('emoflash')}</g></g>`;
      const hearts = [[0.2, 0.3, 0.07, -14], [0.75, 0.56, 0.06, 12], [0.24, 0.7, 0.05, 8]].map(([hx, hy, hw, r]) => `<g transform="translate(${f1(hx * S)} ${f1(hy * S)}) rotate(${r} ${f1(hw * S / 2)} ${f1(hw * S / 2)}) scale(${((hw * S) / 40).toFixed(4)})">${HEARTP}</g>`).join('');
      return phone + hearts;
    } },
];

// ======================================================================================== the bedroom
// The room itself, as the stage draws it (Scenery.tsx EmoroomBack, stage.css data-scene="emoroom"), in a square window
// on world x 20..580; the floor runs on 100 units further toward us (the checked rug with it, in the room's own
// perspective), since the room is wider than it is tall. Its CSS light is drawn as gradients.
const ER_LIGHTS = [[-2.9, 31.8, 0], [20.9, 45.9, 1], [45.6, 55.5, 2], [69.3, 58.7, 3], [97.8, 54.7, 0], [120.6, 44.8, 1], [142.4, 36.6, 2], [165.1, 49.2, 3], [191.8, 57.1, 0], [216, 59.6, 1], [242.4, 55.9, 2], [265.6, 46.6, 3], [291.2, 33.2, 0], [308.9, 33.2, 1], [334.3, 46.6, 2], [356.5, 55.8, 3], [383.5, 59.6, 0], [408.3, 57.1, 1], [435.6, 49.1, 2], [458.1, 36.6, 3], [481, 44.6, 0], [502.6, 54.8, 1], [529.3, 58.8, 2], [556.5, 55.5, 3], [580.9, 45.9, 0], [603.3, 31.7, 1]];
const LAVA_GLASS = '4.2 42.4,3.8 41.1,3.2 39.4,2.5 37.4,1.8 35.2,1.3 32.8,1 30.4,0.9 27.8,1 24.9,1.3 21.9,1.6 18.9,2 16,2.4 13.4,2.9 10.8,3.6 8.2,4.4 5.8,5.1 3.6,5.7 1.7,6.2 0.4,14.6 0.4,15 1.7,15.7 3.6,16.4 5.8,17.2 8.2,17.8 10.8,18.4 13.4,18.8 16,19.2 18.9,19.5 21.9,19.8 24.9,19.8 27.8,19.8 30.4,19.5 32.8,18.9 35.2,18.3 37.4,17.6 39.4,17 41.1,16.6 42.4';
const room = (night) => {
  const X0 = 20, Y0 = -40, W0 = 560, k = S / W0;
  const at = (name, x, y, filt = '') => `<g transform="translate(${x} ${y})"${filt ? ` filter="url(#${filt})"` : ''}>${wholes(inner(name))}</g>`;
  // the rug, run on toward us (emoroomprops.py emoroomrug: its tiles square on the floor, rows closing up with distance)
  const VP = [300, 236], D = 600, FLOOR = 366, XA = 132, XB = 468, T = (XB - XA) / 8;
  const P = (xw, d) => { const s = D / (D - d); return [VP[0] + (xw - VP[0]) * s, VP[1] + (FLOOR - VP[1]) * s]; };
  const rows = [16]; while (P(300, rows[rows.length - 1])[1] < 532) rows.push(rows[rows.length - 1] + T);
  const q = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
  const whites = [];
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) whites.push(q([P(XA + i * T, rows[j]), P(XA + (i + 1) * T, rows[j]), P(XA + (i + 1) * T, rows[j + 1]), P(XA + i * T, rows[j + 1])]));
  const rugEdge = q([P(XA - 3, 13), P(XB + 3, 13), P(XB + 3, rows[rows.length - 1]), P(XA - 3, rows[rows.length - 1])]);
  const rug = `<g${night ? ' filter="url(#dim30)"' : ''}><path d="${rugEdge}" fill="#1E1527"/><path d="${whites.join('')}" fill="#A79DB2"/><path d="${rugEdge}" fill="none" stroke="#000" stroke-width="1.3"/></g>`;
  // the rain falling past the window, and the beads on its glass
  const rain = Array.from({ length: 34 }, (_, i) => { const x = 214 + ((i * 47.3) % 176), y = 60 + ((i * 29.7) % 160), l = 4 + (i % 3) * 1.5; return `M${x.toFixed(1)} ${y.toFixed(1)}l${(l * 0.16).toFixed(2)} ${l.toFixed(1)}`; }).join('');
  const bulbs = ER_LIGHTS.map(([x, y, c], i) => `<circle cx="${x}" cy="${y}" r="${night ? 15.3 : 9}" fill="url(#bulb${c === 2 ? 0 : c})">${night ? `<animate attributeName="opacity" values="1;.6;1;.85;1" dur="${(2.6 + ((i * 37) % 50) / 10).toFixed(1)}s" repeatCount="indefinite"/>` : ''}</circle>`).join('');
  const blobs = [[5, 31, 9, 10], [9, 6, 7, 8], [4, 22, 6, 6], [11, 36, 5, 6]].map(([x, y, w, h], i) => `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#blob)">${night ? `<animateTransform attributeName="transform" type="translate" values="0 0;${[-1, -2, 4, -3][i]} ${[-24, 22, -16, -28][i]};0 0" dur="${[19, 23, 16, 27][i]}s" repeatCount="indefinite"/>` : ''}</ellipse>`).join('');
  const glow = (cx, cy, rx, ry, id, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})" opacity="${op}"/>`;
  // the wallpaper above the room's top (emoroomprops.py emoroomwall: its colour, two thin stripes every 24)
  const ext = `<g${night ? ' filter="url(#dim34)"' : ''}><rect x="-2" y="${Y0 - 2}" width="604" height="${-Y0 + 3}" fill="#25163A"/><path d="${Array.from({ length: 25 }, (_, i) => 6 + i * 24).flatMap((x) => [x, x + 4]).map((x) => `M${x} ${Y0 - 2}V1`).join('')}" stroke="#2F1D47" stroke-width="1.6"/></g>`;
  const world = [
    ext,
    `<rect x="214" y="66" width="172" height="152" fill="url(#${night ? 'skyn' : 'sky'})"/>`,
    at('emoroomout', 214, 66, night ? 'dimout' : ''),
    night ? at('emoroomoutlit', 214, 66) : '',
    night ? '<circle cx="314" cy="162" r="22" fill="url(#lamp)"/>' : '',
    `<g clip-path="url(#glass)"><path d="${rain}" stroke="#E8EEF8" stroke-opacity="${night ? 0.3 : 0.5}" stroke-width=".7" stroke-linecap="round"/></g>`,
    at('emoroomwall', 0, 0, night ? 'dim34' : '').replace(/class="er-curtlit" opacity="\.8"/g, `opacity="${night ? 0.25 : 0.8}"`),
    night ? '<rect x="0" y="10" width="600" height="150" fill="url(#wash)"/>' : glow(300, 144, 166, 141, 'winlight', 1),
    `<g opacity="${night ? 1 : 0.5}">${bulbs}</g>`,
    `<rect x="0" y="366" width="600" height="220" fill="url(#${night ? 'floorn' : 'floor'})"/>`,
    rug,
    night ? '' : glow(300, 386, 160, 68, 'shaft', 1),
    glow(191, 281, 85, 85, 'lavaglow', night ? 1 : 0.3),
    at('emoroombed', -2, 252, night ? 'dim34' : ''),
    at('emoroomstand', 161, 244, night ? 'dim34' : ''),
    `<g transform="translate(181 258)"><clipPath id="lava"><polygon points="${LAVA_GLASS}"/></clipPath><g clip-path="url(#lava)"><rect width="20" height="43" fill="url(#lavaw)"/><ellipse cx="10" cy="45" rx="8" ry="5" fill="url(#blob)"/>${blobs}</g></g>`,
    at('emoroomlavafront', 179, 256),
    at('emoroomdesk', 396, 196, night ? 'dim34' : ''),
    at('emoroomscreen', 454, 221),
    glow(489, 247, 130, 100, 'crt', night ? 1 : 0.22),
    glow(572, 244, 40, 40, 'candle', night ? 1 : 0.25),
    at('emoroomflame', 567, 234.7),
  ].join('\n');
  const bm = (b, s) => { const r = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], g = [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], bl = [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]; return [r, g, bl].map((row) => row.map((v) => (v * b).toFixed(4)).join(' ') + ' 0 0').join(' ') + ' 0 0 0 1 0'; };
  const filt = (id, b, s) => `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${bm(b, s)}"/></filter>`;
  const rg = (id, stops, extra = '') => `<radialGradient id="${id}"${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
  const defs = `<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="212"><stop offset="0" stop-color="#6E7586"/><stop offset=".5" stop-color="#8A8F9D"/><stop offset="1" stop-color="#A2A5AF"/></linearGradient>
<linearGradient id="skyn" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="212"><stop offset="0" stop-color="#0A0D20"/><stop offset=".5" stop-color="#131934"/><stop offset="1" stop-color="#1C2240"/></linearGradient>
<linearGradient id="floor" gradientUnits="userSpaceOnUse" x1="0" y1="366" x2="0" y2="560"><stop offset="0" stop-color="#2B2035"/><stop offset=".3" stop-color="#241A2D"/><stop offset="1" stop-color="#1C1423"/></linearGradient>
<linearGradient id="floorn" gradientUnits="userSpaceOnUse" x1="0" y1="366" x2="0" y2="560"><stop offset="0" stop-color="#160F1C"/><stop offset=".4" stop-color="#120C18"/><stop offset="1" stop-color="#0D0812"/></linearGradient>
<linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB0C4" stop-opacity="0"/><stop offset=".28" stop-color="#FFA6BC" stop-opacity=".2"/><stop offset=".64" stop-color="#FF96B0" stop-opacity=".07"/><stop offset="1" stop-color="#FF96B0" stop-opacity="0"/></linearGradient>
<linearGradient id="lavaw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B3696"/><stop offset=".55" stop-color="#50247E"/><stop offset="1" stop-color="#3A1862"/></linearGradient>
${rg('blob', [[0, '#FFB6CF', 1], [0.58, '#FF5C93', 1], [1, '#DF3A7A', 1]], ' cx="38%" cy="32%"')}
${rg('bulb0', [[0, '#FFF9EA', 1], [0.2, '#FFF9EA', 1], [0.34, '#FFDA98', 0.8], [0.62, '#FFC478', 0.24], [1, '#FFBE6E', 0]])}
${rg('bulb1', [[0, '#FFF0F6', 1], [0.2, '#FFF0F6', 1], [0.34, '#FF7AAC', 0.82], [0.62, '#FF60A0', 0.24], [1, '#FF5A96', 0]])}
${rg('bulb3', [[0, '#F8F0FF', 1], [0.2, '#F8F0FF', 1], [0.34, '#CCA0FF', 0.82], [0.62, '#BA88FF', 0.24], [1, '#B482FF', 0]])}
${rg('lamp', [[0, '#FFDE96', 0.95], [0.45, '#FFB860', 0.34], [1, '#FFAA50', 0]])}
${rg('winlight', [[0, '#A8B4D2', 0.2], [0.58, '#96A0C0', 0.07], [0.78, '#96A0C0', 0], [1, '#96A0C0', 0]])}
${rg('shaft', [[0, '#B0BCDC', 0.15], [0.76, '#B0BCDC', 0], [1, '#B0BCDC', 0]])}
${rg('lavaglow', [[0, '#FF629C', 0.55], [0.48, '#D646AA', 0.2], [1, '#C83CA0', 0]])}
${rg('crt', [[0, '#C4D6FF', 0.5], [0.5, '#96ACF0', 0.2], [1, '#96ACF0', 0]])}
${rg('candle', [[0, '#FFCE78', 0.55], [0.55, '#FFAA50', 0.16], [1, '#FFA046', 0]])}
${rg('vig', [[0.58, '#0A0410', 0], [1, '#0A0410', night ? 0.5 : 0.34]], ' cx="50%" cy="46%" r="72%"')}
<clipPath id="glass"><rect x="220" y="72" width="160" height="140"/></clipPath>
${filt('dim34', 0.34, 0.85)}${filt('dim30', 0.3, 0.8)}${filt('dimout', 0.3, 0.6)}${filt('dim55', 0.55, 1)}`;
  return { defs, body: `<g transform="scale(${k.toFixed(5)}) translate(${-X0} ${-Y0})">${world}</g><rect width="${S}" height="${S}" fill="url(#vig)"/>` };
};
const roomPaid = () => { const r = room(false); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">\n<defs>${r.defs}</defs>\n${r.body}\n</svg>`; };
const roomHolder = () => {
  const r = room(true);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>${r.defs}
${HOLO}</defs>
${r.body}
${SHEEN}
${frame()}
</svg>`;
};

// ======================================================================================== write them
const cards = [];
const write = (file, svg) => {
  const c = compact(tenths(svg));
  writeFileSync(OUT + file + '.svg', c);
  writeFileSync(SITE + file + '.svg', c);   // the same picture, served by the site for the shop's and the pack page's cards
  cards.push({ file, bytes: Buffer.byteLength(c) });
  console.log(`  ${file}.svg  ${(Buffer.byteLength(c) / 1024).toFixed(1)} KB`);
};
for (const it of ITEMS) {
  write(it.key, stage(it.glow, it.bottom, it.content()));
  write(it.key + '-holder', holderStage(it.glow, it.bottom - 0.05 * S, shrink(it.content(), it.hold ?? 0.86)));
}
write('bedroom', roomPaid());
write('bedroom-holder', roomHolder());
ITEMS.splice(4, 0, { key: 'bedroom', name: 'Emo bedroom', what: 'A room theme: fairy lights, rain on the window, posters, a lava lamp, an old monitor. With its own tune.' });
writeFileSync(PAGE + 'cards.json', JSON.stringify({ items: ITEMS.map(({ key, name, what }) => ({ key, name, what })), cards }, null, 1));

// ======================================================================================== render them
if (!process.argv.includes('--no-png')) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: S, height: S, deviceScaleFactor: 1 });
  for (const { file } of cards) {
    const svg = readFileSync(OUT + file + '.svg', 'utf8');
    await page.setContent(`<html><body style="margin:0;background:#000"><img id="i" width="${S}" height="${S}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
    await page.waitForFunction(() => { const i = document.getElementById('i'); return i.complete; }, { timeout: 15000 });
    const ok = await page.evaluate(() => document.getElementById('i').naturalWidth > 0);
    if (!ok) throw new Error(file + '.svg did not load as an image (an XML error?)');
    await page.screenshot({ path: `${PAGE}cards/${file}.png`, clip: { x: 0, y: 0, width: S, height: S } });
  }
  await browser.close();
  console.log(`  ${cards.length} PNGs -> emopack/cards/`);
}

// ======================================================================================== the review page
// emopack/index.html: every card as the PNG a wallet shows, the two editions side by side; the holders' cards can be
// switched to the live SVG (its foil drifting, its sheen, the bedroom's lights). Serve it with any static server, e.g.
//   python3 -m http.server 5396 --bind 0.0.0.0 --directory emopack
{
  mkdirSync(PAGE + 'svg', { recursive: true });
  for (const { file } of cards) writeFileSync(PAGE + 'svg/' + file + '.svg', readFileSync(OUT + file + '.svg'));
  // gas: what the Habibi pack's creates cost, per byte of picture (70.08M gas for 253 KB, ~270 a byte with the item's
  // own storage), at 102 gwei
  const MON_PER_BYTE = 270 * 102e-9;
  const size = (f) => cards.find((c) => c.file === f).bytes;
  const kb = (b) => (b / 1024).toFixed(1) + ' KB';
  const mon = (b) => (b * MON_PER_BYTE).toFixed(2) + ' MON';
  const total = cards.reduce((a, c) => a + c.bytes, 0);
  const v = Date.now().toString(36);
  const row = (it) => `
<section class="item" id="${it.key}">
  <h2>${it.name}</h2>
  <p class="what">${it.what}</p>
  <div class="pair">
    <figure>
      <figcaption><b>Paid edition</b><span>30 MON · hold any pet · unlimited · tradeable</span></figcaption>
      <a href="cards/${it.key}.png?v=${v}" target="_blank"><img src="cards/${it.key}.png?v=${v}" alt="${it.name}, paid edition" loading="lazy"></a>
      <small>On chain: ${kb(size(it.key))} · about ${mon(size(it.key))} to create</small>
    </figure>
    <figure class="holder">
      <figcaption><b>Holders' edition</b><span>Free · hold 7,000 $EMO · one each · soulbound</span></figcaption>
      <a href="cards/${it.key}-holder.png?v=${v}" target="_blank"><img data-png="cards/${it.key}-holder.png?v=${v}" data-svg="svg/${it.key}-holder.svg?v=${v}" src="cards/${it.key}-holder.png?v=${v}" alt="${it.name}, holders' edition" loading="lazy"></a>
      <small>On chain: ${kb(size(it.key + '-holder'))} · about ${mon(size(it.key + '-holder'))} to create · <button type="button" class="live">Play the foil</button></small>
    </figure>
  </div>
</section>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emo pack · item cards</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0B0610; color: #EDE3F2; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { padding: 28px 20px 8px; max-width: 1180px; margin: 0 auto; }
h1 { font-size: 30px; margin: 0 0 4px; letter-spacing: -0.02em; }
h1 em { font-style: normal; color: #FF5C9A; }
.draft { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #160A1A; background: #FFD36E; border-radius: 6px; padding: 2px 8px; margin-left: 8px; vertical-align: middle; }
.lead { color: #B9A8C4; max-width: 760px; margin: 6px 0 18px; }
table { border-collapse: collapse; width: 100%; max-width: 760px; font-size: 14px; margin: 6px 0 10px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2A1C33; vertical-align: top; }
th { color: #B9A8C4; font-weight: 600; }
td b { color: #fff; }
main { max-width: 1180px; margin: 0 auto; padding: 0 20px 60px; }
.item { padding: 30px 0 10px; border-top: 1px solid #22162A; }
.item h2 { margin: 0; font-size: 24px; }
.what { margin: 2px 0 14px; color: #B9A8C4; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
figure { margin: 0; background: #140B1A; border: 1px solid #2A1C33; border-radius: 16px; padding: 12px; }
figure.holder { background: linear-gradient(135deg, rgba(255,120,182,.10), rgba(123,217,255,.08) 50%, rgba(255,229,151,.08)); border-color: #4A2B55; }
figcaption { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; margin: 2px 4px 10px; }
figcaption b { font-size: 16px; }
figcaption span { color: #B9A8C4; font-size: 13px; }
figure img { display: block; width: 100%; height: auto; border-radius: 10px; }
small { display: block; margin: 8px 4px 0; color: #8F7F9C; font-size: 12.5px; }
button.live { font: inherit; color: #FFB6D3; background: none; border: 1px solid #5A3366; border-radius: 999px; padding: 2px 10px; cursor: pointer; }
button.live[aria-pressed="true"] { background: #5A3366; color: #fff; }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-top: 14px; }
.grid img { width: 100%; border-radius: 8px; display: block; }
.grid p { margin: 4px 2px 0; font-size: 12px; color: #B9A8C4; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } .grid { grid-template-columns: repeat(2, 1fr); } h1 { font-size: 24px; } }
</style></head>
<body>
<header>
  <h1>The <em>emo pack</em> · item cards <span class="draft">Draft</span></h1>
  <p class="lead">Every card exactly as a wallet or the shop shows it: the picture that would be stored on chain, rendered by Chrome. Seven items, two editions each. Nothing here is on chain or on the site. Tap a card for full size; "Play the foil" shows a holders' card live, its foil drifting.</p>
  <table>
    <tr><th></th><th>Paid edition</th><th>Holders' edition</th></tr>
    <tr><td>Who</td><td>Anyone holding a pet</td><td>A wallet holding <b>7,000 $EMO</b></td></tr>
    <tr><td>Price</td><td><b>30 MON</b> each, 80% buys and burns EMO</td><td><b>Free</b>, gas only</td></tr>
    <tr><td>Per wallet</td><td>Unlimited</td><td>One of each</td></tr>
    <tr><td>Transfer</td><td>Tradeable</td><td><b>Soulbound</b></td></tr>
    <tr><td>Supply</td><td>Unlimited</td><td>Unlimited</td></tr>
    <tr><td>All 14 pictures on chain</td><td colspan="2">${kb(total)}, about <b>${(total * MON_PER_BYTE).toFixed(1)} MON</b> to create at today's gas (each card under 100 KB, so each create fits one transaction)</td></tr>
  </table>
</header>
<main>
${ITEMS.map(row).join('\n')}
<section class="item">
  <h2>All fourteen, at shop size</h2>
  <div class="grid">${ITEMS.map((it) => `<div><img src="cards/${it.key}.png?v=${v}" alt=""><p>${it.name}</p></div>`).join('')}${ITEMS.map((it) => `<div><img src="cards/${it.key}-holder.png?v=${v}" alt=""><p>${it.name} · holders</p></div>`).join('')}</div>
</section>
</main>
<script>
for (const b of document.querySelectorAll('button.live')) b.addEventListener('click', () => {
  const img = b.closest('figure').querySelector('img');
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  img.src = on ? img.dataset.svg : img.dataset.png;
  b.textContent = on ? 'Show the PNG' : 'Play the foil';
});
</script>
</body></html>`;
  writeFileSync(PAGE + 'index.html', html);
  console.log('  emopack/index.html');
}
