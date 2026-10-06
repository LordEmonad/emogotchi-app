// The item shop's on-chain art: one SVG per item and one for the collection, assembled from the same
// props the site draws, with the backdrop in native SVG so nothing depends on CSS or a server.
//   node tools/items/build-art.mjs   -> contracts/items/witch.svg, contracts/items/collection.svg
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const PROPS = root + 'packages/pet/props/';
const OUT = root + 'contracts/items/';
mkdirSync(OUT, { recursive: true });

/** A prop's drawing without its <svg> wrapper, ids stripped so several copies can share a document. */
const inner = (name, keepIds = false) => {
  let s = readFileSync(PROPS + name + '.svg', 'utf8');
  s = s.slice(s.indexOf('>', s.indexOf('<svg')) + 1, s.lastIndexOf('</svg>'));
  if (!keepIds) s = s.replace(/\s+id="[^"]*"/g, '');
  return s.replace(/\n/g, '');
};
const place = (name, x, y, w, vbW, vbH, extra = '', opacity = 1, keepIds = false) => {
  const k = w / vbW;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)}) ${extra}" opacity="${opacity}">${inner(name, keepIds)}</g>`;
};

// ---- the witch outfit's card: the hat, big and centred, under a spotlight, on a plinth glow, sparkles
const S = 1024;
const witch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#4a2a6e"/><stop offset=".45" stop-color="#2e1a4c"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".14"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".16"/><stop offset=".55" stop-color="#EAC6EA" stop-opacity=".05"/><stop offset=".8" stop-color="#EAC6EA" stop-opacity="0"/></linearGradient>
<radialGradient id="plinth"><stop offset="0" stop-color="#B894D8" stop-opacity=".34"/><stop offset=".55" stop-color="#B894D8" stop-opacity=".12"/><stop offset=".72" stop-color="#B894D8" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#dots)"/>
<polygon points="433,-82 590,-82 839,1126 184,1126" fill="url(#beam)"/>
<ellipse cx="512" cy="906" rx="317" ry="46" fill="url(#plinth)"/>
${place('sparkle', 0.12 * S, 0.22 * S, 0.05 * S, 40, 40, '', 0.9)}
${place('sparkle', 0.84 * S, 0.16 * S, 0.04 * S, 40, 40, '', 0.8)}
${place('sparkle', 0.85 * S, 0.62 * S, 0.055 * S, 40, 40, '', 0.85)}
${place('sparkle', 0.11 * S, 0.66 * S, 0.035 * S, 40, 40, '', 0.7)}
${place('witchhat', 0.19 * S, 0.164 * S, 0.62 * S, 120, 130, 'rotate(-4 60 65)')}
</svg>`;
writeFileSync(OUT + 'witch.svg', witch);

// ---- the emo hair's card: the same stage as the witch outfit, the fringe big and centred
const emohair = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#4a2a6e"/><stop offset=".45" stop-color="#2e1a4c"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".14"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".16"/><stop offset=".55" stop-color="#EAC6EA" stop-opacity=".05"/><stop offset=".8" stop-color="#EAC6EA" stop-opacity="0"/></linearGradient>
<radialGradient id="plinth"><stop offset="0" stop-color="#B894D8" stop-opacity=".34"/><stop offset=".55" stop-color="#B894D8" stop-opacity=".12"/><stop offset=".72" stop-color="#B894D8" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#dots)"/>
<polygon points="433,-82 590,-82 839,1126 184,1126" fill="url(#beam)"/>
<ellipse cx="512" cy="846" rx="317" ry="46" fill="url(#plinth)"/>
${place('sparkle', 0.12 * S, 0.22 * S, 0.05 * S, 40, 40, '', 0.9)}
${place('sparkle', 0.84 * S, 0.16 * S, 0.04 * S, 40, 40, '', 0.8)}
${place('sparkle', 0.85 * S, 0.62 * S, 0.055 * S, 40, 40, '', 0.85)}
${place('sparkle', 0.11 * S, 0.66 * S, 0.035 * S, 40, 40, '', 0.7)}
${place('emohair', 0.17 * S, 0.24 * S, 0.66 * S, 130, 124, 'rotate(-3 65 62)')}
</svg>`;
writeFileSync(OUT + 'emohair.svg', emohair);

// ---- the Halloween items' cards: the same stage as the witch outfit, the item big and centred on it, the glow on
// the floor in the item's own colour (candlelight, old linen, zombie green)
const halloweenCard = (prop, vbW, vbH, w, cx, bottom, glow, extra = '', keepIds = false) => {
  const h = (w * vbH) / vbW;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#4a2a6e"/><stop offset=".45" stop-color="#2e1a4c"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".14"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".16"/><stop offset=".55" stop-color="#EAC6EA" stop-opacity=".05"/><stop offset=".8" stop-color="#EAC6EA" stop-opacity="0"/></linearGradient>
<radialGradient id="plinth"><stop offset="0" stop-color="${glow}" stop-opacity=".42"/><stop offset=".55" stop-color="${glow}" stop-opacity=".14"/><stop offset=".72" stop-color="${glow}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#dots)"/>
<polygon points="433,-82 590,-82 839,1126 184,1126" fill="url(#beam)"/>
<ellipse cx="512" cy="${bottom - 8}" rx="330" ry="50" fill="url(#plinth)"/>
${place('sparkle', 0.12 * S, 0.22 * S, 0.05 * S, 40, 40, '', 0.9)}
${place('sparkle', 0.84 * S, 0.16 * S, 0.04 * S, 40, 40, '', 0.8)}
${place('sparkle', 0.85 * S, 0.62 * S, 0.055 * S, 40, 40, '', 0.85)}
${place('sparkle', 0.11 * S, 0.66 * S, 0.035 * S, 40, 40, '', 0.7)}
${place(prop, cx - w / 2, bottom - h, w, vbW, vbH, extra, 1, keepIds)}
</svg>`;
};
for (const [file, svg] of [
  ['pumpkin', halloweenCard('jackolantern', 150, 150, 0.66 * S, 512, 0.9 * S, '#FFB347')],
  ['mummy', halloweenCard('mummyheap', 150, 130, 0.68 * S, 512, 0.88 * S, '#EFE6C8', '', true)],   // keeps its clip's id
  ['zombie', halloweenCard('zombiebrain', 146, 132, 0.66 * S, 512, 0.87 * S, '#8BC34A')],
]) {
  const compact = svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));   // tenths: plenty at this size, and fewer bytes on chain
  writeFileSync(OUT + file + '.svg', compact);
  console.log(`  ${file}.svg  ${(compact.length / 1024).toFixed(1)} KB`);
}

// ---- the Jewish pack's wearables (not on chain yet; reviewed at /judaica): the same stage, the kippah with the payot
// that come with it and the Star of David on its chain, drawn by judaicaprops.py with the very functions the pets wear
// them with. The glow is the flag's blue for the kippah, a cool silver for the star.
for (const [file, svg] of [
  ['kippah', halloweenCard('kippahcard', 150, 150, 0.7 * S, 512, 0.88 * S, '#7FA8FF', '', true)],   // keeps its clip's id
  ['starofdavid', halloweenCard('starcard', 150, 150, 0.74 * S, 512, 0.92 * S, '#CFE0FF')],
]) {
  const compact = svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));
  writeFileSync(OUT + file + '.svg', compact);
  console.log(`  ${file}.svg  ${(compact.length / 1024).toFixed(1)} KB`);
}

// ---- the Western Wall theme's card: the room itself as a picture, the way the spooky card is: a square window on the
// middle of the room (world x 70..530, y 0..460), the sky, the Wall with its notes, capers and doves, the plaza (its
// colour and the sky's are CSS on the stage, stage.css data-scene="kotel", so they are gradients here). The room's
// drawings are the full 600 wide, so every sub-shape entirely outside the window is dropped (a quarter of the bytes;
// an item picture is stored on chain, under 120 KB), and the two doves are drawn once each and reused.
{
  const X0 = 70, W0 = 460, k = S / W0, M = 8;                  // the window, card units per world unit, a margin
  /** The subpaths of every path that reach into the window (x within X0-M..X0+W0+M); a path with none left is dropped. */
  const cull = (body) => body.replace(/<path\b([^>]*?)\sd="([^"]*)"([^>]*)>/g, (all, a, d, b) => {
    const subs = d.split(/(?=M)/).filter((sp) => {
      const nums = sp.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      for (let i = 0; i + 1 < nums.length; i += 2) if (nums[i] >= X0 - M && nums[i] <= X0 + W0 + M) return true;
      return false;
    });
    return subs.length ? `<path${a} d="${subs.join('')}"${b}>` : '';
  });
  // the wall and the plaza in whole world units (half a unit is a pixel at this size) and without the stones' speckle,
  // as the Spooky card is rounded: at tenths it came to 105 KB, and a create that size lands right at Monad's 30M gas
  // cap per transaction once forge's safety margin is on (and Monad charges the limit, not what is used)
  const whole = (body) => body.replace(/(d|points)="([^"]*)"/g, (m, a, v) => `${a}="${v.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))}"`);
  const at = (x, y, w, vbW) => `translate(${((x - X0) * k).toFixed(1)} ${(y * k).toFixed(1)}) scale(${((w / vbW) * k).toFixed(4)})`;
  const kotel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4E94DA"/><stop offset="${(40 / 120).toFixed(3)}" stop-color="#74B3EA"/><stop offset="${(78 / 120).toFixed(3)}" stop-color="#A9D2F3"/><stop offset="1" stop-color="#C9E2F5"/></linearGradient>
<linearGradient id="paving" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C6B28A"/><stop offset=".18" stop-color="#D6C5A0"/><stop offset=".55" stop-color="#E0D1B0"/><stop offset="1" stop-color="#E6D9BB"/></linearGradient>
<g id="dv">${inner('koteldove')}</g><g id="pc">${inner('kotelperch')}</g>
</defs>
<rect width="${S}" height="${(120 * k).toFixed(1)}" fill="url(#sky)"/>
<g transform="${at(170, 16, 40, 58)}"><use href="#dv"/></g>
<g transform="${at(372, 6, 32, 58)} "><use href="#dv"/></g>
<g transform="${at(0, 30, 600, 600)}">${whole(cull(inner('kotelwall')).replace(/<path\b[^>]*\sd="[^"]*h\.1[^"]*"[^>]*>/g, ''))}</g>
<g transform="${at(90, 90.0, 30, 46)}"><use href="#pc"/></g>
<g transform="${at(465.5, 40.9, 27, 46)} scale(-1 1)"><use href="#pc"/></g>
<rect y="${(362 * k).toFixed(1)}" width="${S}" height="${(98 * k).toFixed(1)}" fill="url(#paving)"/>
<g transform="${at(0, 362, 600, 600)}">${whole(cull(inner('kotelplaza')))}</g>
</svg>`;
  const compact = kotel.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));
  writeFileSync(OUT + 'kotel.svg', compact);
  console.log(`  kotel.svg  ${(compact.length / 1024).toFixed(1)} KB`);
}

// ---- the spooky theme's card: the haunted room itself, as a picture. A bank of ground with the stones
// and the pumpkins, the fence, the tree, the moon, bats, a cobweb: the same pieces the site draws.
{
  const ground = 0.80 * S;                       // the bank's top edge
  const PUMPKIN = '#F08A24';
  const spooky = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="sky" cx="50%" cy="12%" r="90%"><stop offset="0" stop-color="#22163e"/><stop offset=".5" stop-color="#110a22"/><stop offset="1" stop-color="#06030c"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6BB84A" stop-opacity="0"/><stop offset="1" stop-color="#6BB84A" stop-opacity=".22"/></linearGradient>
<linearGradient id="bank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2038"/><stop offset=".4" stop-color="#221630"/><stop offset="1" stop-color="#170d22"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22162e"/><stop offset=".5" stop-color="#130a1c"/><stop offset="1" stop-color="#09050f"/></linearGradient>
<radialGradient id="moonglow"><stop offset="0" stop-color="#F2B14A" stop-opacity=".45"/><stop offset=".5" stop-color="#F2B14A" stop-opacity=".12"/><stop offset="1" stop-color="#F2B14A" stop-opacity="0"/></radialGradient>
<radialGradient id="pglow"><stop offset="0" stop-color="#FFBE50" stop-opacity=".38"/><stop offset=".5" stop-color="${PUMPKIN}" stop-opacity=".12"/><stop offset="1" stop-color="${PUMPKIN}" stop-opacity="0"/></radialGradient>
<radialGradient id="fog"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".30"/><stop offset=".5" stop-color="#EAC6EA" stop-opacity=".10"/><stop offset="1" stop-color="#EAC6EA" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#sky)"/>
${Array.from({ length: 26 }, (_, i) => { const x = ((i * 137.5) % 980) + 22, y = ((i * 89.3) % 560) + 18, r = 2 + (i % 3); return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="#EAC6EA" fill-opacity="${(0.35 + (i % 4) * 0.15).toFixed(2)}"/>`; }).join('')}
<rect x="0" y="${ground - 260}" width="${S}" height="260" fill="url(#mist)"/>
<circle cx="700" cy="250" r="230" fill="url(#moonglow)"/>
${place('harvestmoon', 700 - 110, 250 - 110, 220, 140, 140)}
<path d="M-60,${ground + 40} Q512,${ground - 44} ${S + 60},${ground + 40} L${S + 60},${S} L-60,${S} Z" fill="url(#bank)"/>
<path d="M-60,${ground + 40} Q512,${ground - 44} ${S + 60},${ground + 40}" fill="none" stroke="#6BB84A" stroke-opacity=".34" stroke-width="5"/>
<path d="M-60,${S - 90} Q512,${S - 170} ${S + 60},${S - 90} L${S + 60},${S} L-60,${S} Z" fill="url(#floor)"/>
<path d="M-60,${S - 90} Q512,${S - 170} ${S + 60},${S - 90}" fill="none" stroke="#6BB84A" stroke-opacity=".28" stroke-width="5"/>
<ellipse cx="200" cy="${ground + 8}" rx="250" ry="60" fill="url(#pglow)"/>
${place('fence', 220, ground - 96, 560, 350, 62)}
${place('deadtree-item', 640, ground - 470, 400, 212, 336)}
${place('tombstone', 60, ground - 244, 230, 104, 116)}
${place('pumpkin', 250, ground - 180, 190, 112, 100)}
${place('cobweb', 0, 0, 260, 100, 100)}
${place('bat', 150, 170, 120, 90, 46)}
${place('bat', 420, 90, 84, 90, 46, 'rotate(-8)')}
<ellipse cx="300" cy="${S - 120}" rx="420" ry="70" fill="url(#fog)"/>
<ellipse cx="760" cy="${S - 100}" rx="380" ry="60" fill="url(#fog)"/>
</svg>`;
  // Monad caps a contract (so an SSTORE2 pointer) at 128 KB. Prop coordinates are in native units and
  // drawn up to twice their size here, so whole numbers cost under a pixel and save a third of the bytes.
  const compact = spooky.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m))));
  writeFileSync(OUT + 'spooky.svg', compact);
  console.log('  spooky.svg ', (compact.length / 1024).toFixed(1), 'KB (before rounding', (spooky.length / 1024).toFixed(1), 'KB)');
}

// ---- the Backrooms theme's card: the meme's own picture, not the stage. One-point perspective from eye level: a
// mono-yellow space running away from the camera, its wallpaper's stripes closing up with distance, a drop ceiling
// of tiles with rows of fluorescent panels receding, damp carpet, a doorway in the right wall and the corridor
// turning at the far end, all of it fading into the yellow haze. Native SVG, ~12 KB. (The first card was the stage's
// pieces pasted into a square: an office corner with a slab in it, which the operator called messed up.)
{
  const VP = { x: 512, y: 470 }; const R = 0.115;                   // the vanishing point, and the scale of the far end
  // the near plane: the space's corners just outside the frame
  const NL = -90, NR = 1114, NT = -110, NB = 1110;
  const P = (x, y, sc) => [VP.x + (x - VP.x) * sc, VP.y + (y - VP.y) * sc];
  const f = (n) => (Math.round(n * 10) / 10).toString();
  const quad = (pts) => 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' L') + ' Z';
  const line = (a, b) => `M${f(a[0])},${f(a[1])} L${f(b[0])},${f(b[1])}`;
  // depth steps that look even (perspective-correct): sc = 1 / (1 + i q)
  const N = 9; const q = (1 / R - 1) / N; const sc = (i) => 1 / (1 + i * q);
  const g = [];
  // the four planes
  g.push(`<path d="${quad([P(NL, NT, 1), P(NR, NT, 1), P(NR, NT, R), P(NL, NT, R)])}" fill="#E6DFB9"/>`);                          // ceiling
  g.push(`<path d="${quad([P(NL, NB, 1), P(NR, NB, 1), P(NR, NB, R), P(NL, NB, R)])}" fill="url(#carpet)"/>`);                      // floor
  g.push(`<path d="${quad([P(NL, NB, 1), P(NR, NB, 1), P(NR, NB, R), P(NL, NB, R)])}" fill="url(#pile)"/>`);
  g.push(`<path d="${quad([P(NL, NT, 1), P(NL, NT, R), P(NL, NB, R), P(NL, NB, 1)])}" fill="#E9D77A"/>`);                          // left wall
  g.push(`<path d="${quad([P(NR, NT, 1), P(NR, NT, R), P(NR, NB, R), P(NR, NB, 1)])}" fill="#E4D072"/>`);                          // right wall, a shade darker
  g.push(`<path d="${quad([P(NL, NT, R), P(NR, NT, R), P(NR, NB, R), P(NL, NB, R)])}" fill="#DCC864"/>`);                          // the far wall
  // the wallpaper's stripes, closing up with distance (finer steps than the tiles)
  for (let i = 0; i <= 44; i++) {
    const s0 = 1 / (1 + i * q / 5); if (s0 < R) break;
    for (const [x, col] of [[NL, '#D9C25C'], [NR, '#CDB54F']]) g.push(`<path d="${line(P(x, NT, s0), P(x, NB, s0))}" stroke="${col}" stroke-opacity=".5" stroke-width="${f(1.2 + 2.2 * s0)}"/>`);
  }
  // the far wall's stripes and the corridor turning: a dark way on through its left half, a partition edge on the right
  for (let x = NL + 40; x < NR; x += 36) g.push(`<path d="${line(P(x, NT, R), P(x, NB, R))}" stroke="#C9B04E" stroke-opacity=".45" stroke-width="1"/>`);
  g.push(`<path d="${quad([P(NL, NT + 60, R), P(560, NT + 60, R), P(560, NB, R), P(NL, NB, R)])}" fill="#7A6320"/>`);
  g.push(`<path d="${quad([P(NL, NT + 60, R), P(560, NT + 60, R), P(560, NB, R), P(NL, NB, R)])}" fill="url(#deep)"/>`);
  // a doorway in the right wall, mid-way down: an opening into the dark
  g.push(`<path d="${quad([P(NR, NT + 210, 0.46), P(NR, NT + 210, 0.36), P(NR, NB, 0.36), P(NR, NB, 0.46)])}" fill="#8A7028"/>`);
  g.push(`<path d="${quad([P(NR, NT + 210, 0.46), P(NR, NT + 210, 0.36), P(NR, NB, 0.36), P(NR, NB, 0.46)])}" fill="url(#doorway)"/>`);
  g.push(`<path d="${quad([P(NR, NT + 210, 0.46), P(NR, NT + 210, 0.36), P(NR, NB, 0.36), P(NR, NB, 0.46)])}" fill="none" stroke="#2B1607" stroke-opacity=".7" stroke-width="2.4"/>`);
  // the ceiling grid: tile rows across, and rays to the vanishing point
  for (let i = 1; i < N; i++) g.push(`<path d="${line(P(NL, NT, sc(i)), P(NR, NT, sc(i)))}" stroke="#B4A97A" stroke-opacity=".7" stroke-width="${f(1 + 1.6 * sc(i))}"/>`);
  for (let k = -3; k <= 3; k++) { const x = VP.x + k * 172; g.push(`<path d="${line(P(x, NT, 1), P(x, NT, R))}" stroke="#B4A97A" stroke-opacity=".7" stroke-width="1.6"/>`); }
  // the panels: three columns (between rays), every other row, each with its dull frame, its lit face and the tube
  let n = 0;
  for (let i = 0; i < N - 1; i += 2) {
    const a = sc(i) - (sc(i) - sc(i + 1)) * 0.12, b = sc(i + 1) + (sc(i) - sc(i + 1)) * 0.12;
    for (const [x0, x1] of [[VP.x - 172 + 14, VP.x + 172 - 14], [VP.x - 3 * 172 + 14, VP.x - 172 - 14], [VP.x + 172 + 14, VP.x + 3 * 172 - 14]]) {
      n++;
      const frame = [P(x0, NT, a), P(x1, NT, a), P(x1, NT, b), P(x0, NT, b)];
      const ins = frame.map((p, j) => { const c = [(frame[0][0] + frame[2][0]) / 2, (frame[0][1] + frame[2][1]) / 2]; return [p[0] + (c[0] - p[0]) * 0.1, p[1] + (c[1] - p[1]) * 0.1]; });
      g.push(`<path d="${quad(frame)}" fill="#D4D0A6" stroke="#2B1607" stroke-opacity=".85" stroke-width="${f(1 + 1.4 * a)}"/>`);
      g.push(`<path d="${quad(ins)}" fill="#F3F7D8"/>`);
      const m = (t) => [P(x0 + (x1 - x0) * 0.12, NT, a + (b - a) * t), P(x1 - (x1 - x0) * 0.12, NT, a + (b - a) * t)];
      for (const t of [0.4, 0.64]) { const [l, r] = m(t); g.push(`<path d="${line(l, r)}" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="${f(1 + 2 * a)}"/>`); }
    }
  }
  // the edges of the space: where the walls meet the ceiling and the carpet, and the far wall's frame
  for (const [x, y] of [[NL, NT], [NR, NT], [NL, NB], [NR, NB]]) g.push(`<path d="${line(P(x, y, 1), P(x, y, R))}" stroke="#2B1607" stroke-opacity=".85" stroke-width="3"/>`);
  g.push(`<path d="${quad([P(NL, NT, R), P(NR, NT, R), P(NR, NB, R), P(NL, NB, R)])}" fill="none" stroke="#2B1607" stroke-opacity=".85" stroke-width="2.4"/>`);
  // the light on the walls under the panels, the shade at the walls' feet, the haze toward the far end, a vignette
  g.push(`<path d="${quad([P(NL, NT, 1), P(NL, NT, R), P(NL, NB, R), P(NL, NB, 1)])}" fill="url(#wallLight)"/>`);
  g.push(`<path d="${quad([P(NR, NT, 1), P(NR, NT, R), P(NR, NB, R), P(NR, NB, 1)])}" fill="url(#wallLight)"/>`);
  g.push(`<path d="${quad([P(NL, NB - 90, 1), P(NL, NB - 90, R), P(NL, NB, R), P(NL, NB, 1)])}" fill="url(#footL)"/>`);
  g.push(`<path d="${quad([P(NR, NB - 90, 1), P(NR, NB - 90, R), P(NR, NB, R), P(NR, NB, 1)])}" fill="url(#footL)"/>`);
  g.push(`<circle cx="${VP.x}" cy="${VP.y}" r="560" fill="url(#haze)"/>`);
  g.push(`<rect width="${S}" height="${S}" fill="url(#vignette)"/>`);
  const backrooms = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<linearGradient id="carpet" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#C4AD63"/><stop offset=".55" stop-color="#BFA75C"/><stop offset="1" stop-color="#AE9650"/></linearGradient>
<pattern id="pile" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="1" fill="#46320A" fill-opacity=".12"/><circle cx="5.3" cy="5.3" r="1" fill="#FFF0BE" fill-opacity=".13"/></pattern>
<linearGradient id="deep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3A2C0A" stop-opacity=".55"/><stop offset="1" stop-color="#3A2C0A" stop-opacity="0"/></linearGradient>
<linearGradient id="doorway" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A2C0A" stop-opacity=".5"/><stop offset="1" stop-color="#3A2C0A" stop-opacity=".1"/></linearGradient>
<linearGradient id="wallLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFCE0" stop-opacity=".34"/><stop offset=".45" stop-color="#FFFCE0" stop-opacity="0"/></linearGradient>
<linearGradient id="footL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A360A" stop-opacity="0"/><stop offset="1" stop-color="#4A360A" stop-opacity=".28"/></linearGradient>
<radialGradient id="haze"><stop offset="0" stop-color="#E9D77A" stop-opacity=".78"/><stop offset=".18" stop-color="#E9D77A" stop-opacity=".45"/><stop offset=".5" stop-color="#E9D77A" stop-opacity=".12"/><stop offset="1" stop-color="#E9D77A" stop-opacity="0"/></radialGradient>
<radialGradient id="vignette" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
</defs>
${g.join('\n')}
</svg>`;
  writeFileSync(OUT + 'backrooms.svg', backrooms);
  console.log('  backrooms.svg ', (backrooms.length / 1024).toFixed(1), 'KB');
}

// ---- the collection's picture: the locker standing on the floor of the room
const floorY = 0.9 * S, U = 0.72 * S, edge = floorY - U * 0.14;
const lockerH = 0.72 * S, lockerW = lockerH * (100 / 202);
const collection = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<radialGradient id="wall" cx="50%" cy="20%" r="75%"><stop offset="0" stop-color="#3a1f5c"/><stop offset=".55" stop-color="#24123f"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".13"/></pattern>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1a44"/><stop offset=".6" stop-color="#1d1030"/><stop offset="1" stop-color="#150a24"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#B894D8" stop-opacity=".24"/><stop offset=".55" stop-color="#B894D8" stop-opacity=".08"/><stop offset=".72" stop-color="#B894D8" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${S}" height="${S}" fill="url(#wall)"/><rect width="${S}" height="${S * 0.8}" fill="url(#dots)"/>
<ellipse cx="512" cy="${edge + 30}" rx="563" ry="30" fill="#2c1a44"/><ellipse cx="512" cy="${edge + 28}" rx="563" ry="30" fill="none" stroke="#B894D8" stroke-opacity=".16" stroke-width="4"/>
<rect x="-51" y="${edge + 30}" width="1126" height="${S}" fill="url(#floor)"/>
<ellipse cx="512" cy="${floorY + 8}" rx="${U * 0.4}" ry="${U * 0.09}" fill="url(#glow)"/>
<ellipse cx="512" cy="${floorY + 6}" rx="${lockerW * 0.62}" ry="${lockerW * 0.1}" fill="#0a0412" fill-opacity=".5"/>
${place('locker', 512 - lockerW / 2, floorY - lockerH, lockerW, 100, 202)}
</svg>`;
writeFileSync(OUT + 'collection.svg', collection);
for (const f of ['witch', 'collection']) console.log(`  ${f}.svg  ${(readFileSync(OUT + f + '.svg').length / 1024).toFixed(1)} KB`);

// ---- the dreidel's card (the Jewish pack's toy): the Halloween cards' stage, the glow the flag's blue. One dreidel
// standing on its point, leaning as it spins, gimel toward us, gelt at its feet (dreidelcard.svg,
// packages/pet/design/dreidelprops.py)
{
  const svg = halloweenCard('dreidelcard', 120, 100, 0.9 * S, 512, 0.9 * S, '#5B8CFF');
  const compact = svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));   // tenths, like the others
  writeFileSync(OUT + 'dreidel.svg', compact);
  console.log(`  dreidel.svg  ${(compact.length / 1024).toFixed(1)} KB`);
}

// ---- the kapparot hen's card (the Jewish pack; worn, it turns Pet into kapparot): the Halloween cards' stage with a
// warm glow, the white hen mid-flap, feathers round her (kapparotcard.svg, packages/pet/design/kapparotprops.py)
{
  const svg = halloweenCard('kapparotcard', 140, 120, 0.82 * S, 512, 0.9 * S, '#FFD9A0');
  const compact = svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));   // tenths, like the others
  writeFileSync(OUT + 'kapparot.svg', compact);
  console.log(`  kapparot.svg  ${(compact.length / 1024).toFixed(1)} KB`);
}

// ======== the Habibi pack (not on chain yet; reviewed at /habibi): the keffiyeh with its agal, the bisht, the Majlis, the
// darbuka and the falcon. The same item stage as the Jewish pack's, the glow in each item's own colour. The keffiyeh and
// the bisht are drawn by packages/pet/design/habibiprops.py with the pack's own helpers (habibi.py); the darbuka, the
// falcon and the room come straight from the props the site plays them with, so a card can never disagree with its item.
{
  const tenths = (svg) => svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(Number(m) * 10) / 10));
  /** Drop every group hidden by style (the props' switched frames: only what shows at rest goes on the card) and the
   *  given classes' elements, whole subtrees; and the data-* attributes the site reads, which a picture does not need. */
  const clean = (s, dropClasses = []) => {
    const out = []; const stack = []; let skip = 0; let i = 0;
    const re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g; let m;
    while ((m = re.exec(s))) {
      const [tag, close, name, attrs, self] = m;
      if (!skip) out.push(s.slice(i, m.index));
      i = m.index + tag.length;
      if (close) { const top = stack.pop(); if (top) skip--; else if (!skip) out.push(tag); continue; }
      const cls = /class="([^"]*)"/.exec(attrs)?.[1].split(/\s+/) ?? [];
      const hide = skip > 0 || /visibility:\s*hidden/.test(attrs) || cls.some((c) => dropClasses.includes(c));
      if (self) { if (!hide) out.push(tag); continue; }
      stack.push(hide); if (hide) skip++; else out.push(tag);
    }
    if (!skip) out.push(s.slice(i));
    return out.join('').replace(/\sdata-[a-z-]+="[^"]*"/g, '');
  };
  const stageDefs = (glow) => `<radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#4a2a6e"/><stop offset=".45" stop-color="#2e1a4c"/><stop offset="1" stop-color="#170b2a"/></radialGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity=".14"/></pattern>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAC6EA" stop-opacity=".16"/><stop offset=".55" stop-color="#EAC6EA" stop-opacity=".05"/><stop offset=".8" stop-color="#EAC6EA" stop-opacity="0"/></linearGradient>
<radialGradient id="plinth"><stop offset="0" stop-color="${glow}" stop-opacity=".42"/><stop offset=".55" stop-color="${glow}" stop-opacity=".14"/><stop offset=".72" stop-color="${glow}" stop-opacity="0"/></radialGradient>`;
  const stage = (glow, bottom, content, sparkles = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
${stageDefs(glow)}
</defs>
<rect width="${S}" height="${S}" fill="url(#bg)"/><rect width="${S}" height="${S}" fill="url(#dots)"/>
<polygon points="433,-82 590,-82 839,1126 184,1126" fill="url(#beam)"/>
<ellipse cx="512" cy="${bottom - 8}" rx="330" ry="50" fill="url(#plinth)"/>
${sparkles ? [place('sparkle', 0.12 * S, 0.22 * S, 0.05 * S, 40, 40, '', 0.9), place('sparkle', 0.84 * S, 0.16 * S, 0.04 * S, 40, 40, '', 0.8),
    place('sparkle', 0.85 * S, 0.62 * S, 0.055 * S, 40, 40, '', 0.85), place('sparkle', 0.11 * S, 0.66 * S, 0.035 * S, 40, 40, '', 0.7)].join('\n') : ''}
${content}
</svg>`;
  const write = (file, svg) => { const c = tenths(svg); writeFileSync(OUT + file + '.svg', c); console.log(`  ${file}.svg  ${(c.length / 1024).toFixed(1)} KB`); };

  // ---- the keffiyeh: the shemagh as it sits on a head, the agal round it, a warm red glow
  write('keffiyeh', halloweenCard('keffiyehcard', 150, 170, 0.66 * S, 512, 0.95 * S, '#E8546A', '', true));   // keeps its pattern's and clips' ids
  // ---- the bisht: on its hanger, the gold catching the spotlight, a gold glow
  write('bisht', halloweenCard('bishtcard', 150, 160, 0.66 * S, 512, 0.93 * S, '#E8C35A', '', true));

  // ---- the darbuka: the drum standing on the stage, the notes of its rhythm round it (a gold DUM, a turquoise tek)
  {
    const note = readFileSync(PROPS + 'darbukanote.svg', 'utf8');
    const part = (cls) => { const i = note.indexOf(`<g class="${cls}"`); let d = 0, j = i; const re = /<g\b|<\/g>/g; re.lastIndex = i; let m; while ((m = re.exec(note))) { d += m[0] === '</g>' ? -1 : 1; if (d === 0) { j = m.index + 4; break; } } return note.slice(i, j).replace(/\sstyle="visibility:hidden"/, ''); };
    const dum = part('nd'), tek = part('nt');
    const at = (g, x, y, w, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot} ${w / 2} ${w / 2}) scale(${(w / 40).toFixed(4)})">${g}</g>`;
    const w = 0.44 * S, h = (w * 104) / 70, bottom = 0.9 * S;
    const drum = place('darbuka', 512 - w / 2, bottom - h, w, 70, 104);
    const notes = [at(dum, 0.13 * S, 0.2 * S, 0.14 * S, -10), at(tek, 0.72 * S, 0.24 * S, 0.12 * S, 12), at(dum, 0.79 * S, 0.5 * S, 0.1 * S, 8), at(tek, 0.17 * S, 0.52 * S, 0.09 * S, -8)].join('\n');
    write('darbuka', stage('#48CDBD', bottom, drum + '\n' + notes, false));
  }

  // ---- the falcon: perched on its block perch (the wakr), the drawing at rest from falcon.svg (only the perched pose,
  // its switched frames dropped), a warm sand glow
  {
    const bird = clean(readFileSync(PROPS + 'falcon.svg', 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''), ['fc-fly']);
    const perch = inner('falconperch');
    const w = 0.64 * S, k = w / 140, bottom = 0.93 * S, top = bottom - 170 * k;
    const content = `<g transform="translate(${(512 - w / 2).toFixed(1)} ${top.toFixed(1)}) scale(${k.toFixed(4)})">${perch}${bird.replace(/\n/g, '')}</g>`;
    write('falcon', stage('#E8C27A', bottom, content));
  }

  // ---- the Majlis theme: the room itself as a picture, like the Western Wall's card: a square window on the middle of
  // the room (world x 70..530, y 0..460) by day, the sky through the arch and the floor as gradients (they are CSS on the
  // stage, stage.css data-scene="majlis"). The coffee tray and the incense burner stand at the room's edges, outside that
  // window, so on the card they are brought in to the edges of the rug, with their steam and smoke. What moves in the room
  // is caught in one moment: two clouds and three gulls in the sky, the fountain's jets up, the lanterns' flames lit. The
  // night-only pieces (the moon, the city's lit windows, the lantern light on the plaster) are left out.
  {
    const X0 = 70, W0 = 460, k = S / W0;
    const at = (x, y, w, vbW) => `translate(${((x - X0) * k).toFixed(1)} ${(y * k).toFixed(1)}) scale(${((w / vbW) * k).toFixed(4)})`;
    const prop = (name, drop = []) => clean(inner(name), drop);
    const K = 1.25;
    const world = (body) => `<g transform="${at(0, 0, 600, 600)}">${body}</g>`;
    // the fountain mid-show (Scenery.tsx JETS: [x, height], rising from the lake at y 257); each jet stretched to its box
    const jet = prop('majlisjet');
    const JETS = [[330, 52], [342, 58], [354, 50], [306, 29], [318, 38], [366, 43], [378, 36], [390, 32]];
    const jets = JETS.map(([x, h]) => `<g transform="translate(${x - 3.25} ${257 - h}) scale(0.65 ${(h / 60).toFixed(4)})">${jet}</g>`).join('');
    const gull = prop('majlisbird');
    const gulls = [[262, 118, 1.3], [277, 124, 1.1], [248, 112, 0.95]].map(([x, y, sc]) => `<g transform="translate(${x - 9 * sc} ${y - 6 * sc}) scale(${sc})">${gull}</g>`).join('');
    const cloud = prop('majliscloud');
    const clouds = `<g transform="translate(206 70)">${cloud}</g><g transform="translate(330 120) scale(0.625)">${cloud}</g>`;
    const majlis = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="${(50 / 366).toFixed(3)}" stop-color="#4F8FD2"/><stop offset="${(110 / 366).toFixed(3)}" stop-color="#7FB3E6"/><stop offset="${(170 / 366).toFixed(3)}" stop-color="#B7D5EE"/><stop offset="${(220 / 366).toFixed(3)}" stop-color="#DCE4E6"/><stop offset="${(272 / 366).toFixed(3)}" stop-color="#EEDCBD"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFA986"/><stop offset=".22" stop-color="#D7C4A2"/><stop offset=".6" stop-color="#E3D3B5"/><stop offset="1" stop-color="#E8DAC0"/></linearGradient>
<radialGradient id="sun" cx="50%" cy="34%" r="50%"><stop offset="0" stop-color="#FFF6DC" stop-opacity=".16"/><stop offset=".55" stop-color="#FFF0CD" stop-opacity=".07"/><stop offset="1" stop-color="#FFECC4" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="50%" cy="46%" r="72%"><stop offset=".62" stop-color="#5A3614" stop-opacity="0"/><stop offset="1" stop-color="#5A3614" stop-opacity=".16"/></radialGradient>
<g id="lan">${prop('majlislantern')}<g transform="translate(10.5 101)">${prop('majlisflame')}</g>${prop('majlislanternfront')}</g>
</defs>
<rect width="${S}" height="${(366 * k).toFixed(1)}" fill="url(#sky)"/>
<rect y="${(366 * k).toFixed(1)}" width="${S}" height="${(94 * k).toFixed(1)}" fill="url(#floor)"/>
${world(clouds)}
<g transform="${at(190, 54, 220, 220)}">${prop('majlissky', ['mj-lit', 'mj-moon'])}</g>
${world(`${jets}<g transform="translate(300 248)" opacity=".45">${prop('majlismist')}</g>${gulls}`)}
<g transform="${at(0, 0, 600, 600)}">${prop('majliswall')}</g>
<g transform="${at(0, 374, 600, 600)}">${prop('majlisrug')}</g>
<g transform="${at(0, 286, 600, 600)}">${prop('majlisseat')}</g>
<ellipse cx="${((300 - X0) * k).toFixed(1)}" cy="${(355 * k).toFixed(1)}" rx="${(190 * k).toFixed(1)}" ry="${(95 * k).toFixed(1)}" fill="url(#sun)"/>
<g transform="${at(470 - 56, 399 - 112 * (74 / 92), 112, 92)}">${prop('majlistray')}</g>
<g transform="${at(470 - 56 + 17.4, 399 - 112 * (74 / 92) - 15.6, 13.8, 12)}">${prop('majlissteam')}</g>
<g transform="${at(112 - 23, 394 - 46 * (54 / 40), 46, 40)}">${prop('majlisincense')}</g>
<g transform="${at(112 - 2.4 - 6.7, 264.9, 17.9, 16)}">${prop('majlissmoke')}</g>
<g transform="${at(153 - 18 * K, 18, 36 * K, 36)}"><use href="#lan"/></g>
<g transform="${at(447 - 18 * K, 18, 36 * K, 36)}"><use href="#lan"/></g>
<rect width="${S}" height="${S}" fill="url(#vig)"/>
</svg>`;
    write('majlis', majlis);
  }
}
