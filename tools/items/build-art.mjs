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
const place = (name, x, y, w, vbW, vbH, extra = '', opacity = 1) => {
  const k = w / vbW;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)}) ${extra}" opacity="${opacity}">${inner(name)}</g>`;
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
