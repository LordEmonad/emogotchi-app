// Bakes the 18 wallet portraits (9 moods x crown) into static SVG for the on-chain art contract.
//   node tools/bake-art.mjs              the cat      -> packages/pet/art/,             contracts/art/
//   node tools/bake-art.mjs inversebrah  inversebrah  -> packages/pet/art-inversebrah/, contracts/art-inversebrah/
//   node tools/bake-art.mjs sahur        sahur        -> packages/pet/art-sahur/,       contracts/art-sahur/
//   BASE=http://127.0.0.1:5263 node tools/bake-art.mjs r3tards    (the same, through /r3tards?card= on his dev server)
//   BASE=http://127.0.0.1:5421 node tools/bake-art.mjs emonad     (Emonadgotchi, through /emonadgotchi?card= on a DEV build: his
//                                        card view is dev only until launch; outputs packages/pet/art-emonad/, contracts/art-emonad/)
//   BASE=http://127.0.0.1:5231 node tools/bake-art.mjs thiccums   (LAB ONLY: drawn through his lab's own card view,
//                                        /thiccums?card=, on the local dev server; nothing of his is on the site)
// Needs the dev server on 5199. Output in packages/pet/art/:
//   base.svgt      the cat with a \x01 sentinel wherever a mood changes an attribute value
//   patches.json   18 arrays of sentinel values, index = mood*2 + crown
//   scenes.json    9 {pre, post} scene halves (background, props); the cat goes between
//   preview/*.svg  the composed pictures, and preview/*.png rendered by Chrome for review
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const WHO = ['inversebrah', 'sahur', 'thiccums', 'r3tards', 'emonad'].includes(process.argv[2]) ? process.argv[2] : 'cat';
const SUFFIX = WHO === 'cat' ? '' : '-' + WHO;
const CHARACTER = WHO === 'cat' ? '' : WHO === 'sahur' ? '&character=sahur' : '&character=frog';
const OUT = fileURLToPath(new URL(`../packages/pet/art${SUFFIX}/`, import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:5199';
mkdirSync(OUT + 'preview', { recursive: true });

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

// ---- in-page capture: the frozen rig serialised with computed values baked into attributes
async function capture(mood, crown) {
  await page.goto(WHO === 'thiccums' || WHO === 'r3tards' ? `${BASE}/${WHO}?card=${mood}${crown ? '&crown=1' : ''}` : WHO === 'emonad' ? `${BASE}/emonadgotchi?card=${mood}${crown ? '&crown=1' : ''}` : `${BASE}/nft?card=${mood}${crown ? '&crown=1' : ''}${CHARACTER}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__card_ready === true, { timeout: 20000 });
  // parts no portrait ever shows: the frog's pinched body, camera and slap mark, and every costume piece of either
  // character (witch, pumpkin, mummy, zombie; the cat's art was baked before any of them existed and is immutable)
  await page.evaluate(() => { window.__bakeStrip = ['bodysq', 'camera', 'slapmark', 'robeback', 'yoke', 'sleeveL', 'sleeveR', 'robebacksq', 'yokesq', 'sleeveLsq', 'sleeveRsq', 'emohair', 'witchhat', 'robe',
    'pumpkin', 'pkdefs', 'mummyhead', 'mummyface', 'mummybody', 'wrapL', 'wrapR', 'mummytail', 'earwrap', 'mummybodysq', 'wrapLsq', 'wrapRsq', 'zombiehead', 'zombiebody', 'zombieL', 'zombieR', 'zombiebodysq', 'zombieLsq',
    'mummyfootL', 'mummyfootR', 'bowl', 'bowlfront',   // (these four: sahur's thigh wraps and the bowl drawn in his hand for the feed)
    'kippah', 'kippahdefs', 'sahurkippahdefs', 'frogkippahdefs', 'payot', 'davidstar', 'davidstarsq',   // the Jewish pack (the cat's #emotag stays: it is the tag)
    'keffiyeh', 'keffiyehback', 'keffiyehdrape', 'keffiyehdefs', 'frogkeffiyehdefs', 'sahurkeffiyehdefs', 'bishtback', 'bisht', 'bishtsleeveL', 'bishtsleeveR', 'bishtbacksq', 'bishtsq', 'bishtsleeveLsq', 'bishtsleeveRsq', 'bishtdefs', 'frogbishtdefs', 'sahurbishtdefs',   // the Habibi pack
    // Thiccums: the clips only his costumes use (the far cheek's and the butt's own stay: the drawing uses them)
    'thicchead', 'thiccbody', 'thiccflipL', 'thiccflipR', 'thiccfin', 'thiccfarcheek', 'thiccnearcheek', 'thiccfarclip', 'thiccrobeclip', 'thiccnothead',
    'thicchairclip', 'thiccpkclip', 'thiccpkmask', 'thiccpkholesclip', 'thicckippahclip', 'thicckeffiyehdefs',
    // r3tards: the items' defs (one group), the heads the mummy and the zombie give him, the empty perch over his arm, and
    // the pale-edge twin of every item (r3items.py: `<id>rim`)
    'r3itemdefs', 'mummyin', 'zombieskull', 'pumpkinin', 'armsover',
    ...['witchhat', 'robe', 'bisht', 'mummyhead', 'wrapL', 'wrapR', 'mummyfootL', 'mummyfootR', 'mummybody', 'zombiehead', 'zombieL', 'zombiebody', 'emohair', 'kippah', 'davidstar', 'keffiyeh', 'pumpkin'].map((id) => id + 'rim')]; });
  // Emonadgotchi: every piece only his items draw (emonaditems.py; the emo pack's too, which no other pet's bake has met), the
  // item defs, and by class the keffiyeh's cloth behind his head (.egkf) and the lip rings in every mouth (.lipring). His own
  // list, applied to him alone: the other pets' bakes are on chain and a re-bake of them must not change.
  if (WHO === 'emonad') await page.evaluate(() => {
    // (#armsover is the r3tard's empty perch, but on him it holds his drawn forearms and hands: kept)
    window.__bakeStrip = window.__bakeStrip.filter((id) => id !== 'armsover');
    window.__bakeStrip.push('egitemdefs', 'egunderhat', 'egrobeclip', 'egpkmask', 'egpkclip', 'egpkholes', 'egkippahclip', 'egkfpat', 'egkfclip', 'egkfopen', 'egkfout',
      'egbnclip', 'egbncuff', 'egfitelbowL', 'egfitelbowR', 'egcheck', 'bishtback', 'mummyshinL', 'mummyshinR', 'emofitfootL', 'emofitfootR', 'mummyneck', 'emofitback',
      'emofit', 'emofitL', 'emofitR', 'piercings', 'beanie', 'wrapLfore', 'wrapRfore', 'zombieLfore', 'zombieLbite', 'bishtsleeveLfore', 'bishtsleeveRfore',
      'emofitLfore', 'emofitRfore', 'emofitLelbow', 'emofitRelbow');
    window.__bakeStripClass = ['egkf', 'lipring'];
  });
  await new Promise((r) => setTimeout(r, 300));
  return page.evaluate(() => {
    const world = document.querySelector('.nft-world');
    const wr = world.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height }; };
    const hex = (rgb) => { const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(rgb); if (!m) return null; const h = (n) => Number(n).toString(16).padStart(2, '0'); return { hex: '#' + h(m[1]) + h(m[2]) + h(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }; };
    const num = (v) => { const n = Math.round(Number(v) * 1000) / 1000; return Object.is(n, -0) ? 0 : n; };
    const src = document.querySelector('.nft-cat svg');
    const root = src.cloneNode(true);
    // parts no portrait ever shows (the frog's pinched body, his camera and slap mark, every costume piece) are
    // dropped from the clone: on chain they would be paid for at every deploy and never drawn
    const strip = new Set(window.__bakeStrip ?? []);
    const stripClass = window.__bakeStripClass ?? [];
    const dropped = (el) => { for (let e = el; e && e !== src; e = e.parentElement) if (strip.has(e.id) || stripClass.some((c) => e.classList?.contains(c))) return true; return false; };
    const srcEls = [src, ...src.querySelectorAll('*')].filter((el) => !dropped(el));
    const dstEls = [root, ...root.querySelectorAll('*')];
    const dstKeep = [];
    { const all = [root, ...root.querySelectorAll('*')]; const srcAll = [src, ...src.querySelectorAll('*')]; srcAll.forEach((el, i) => { if (!dropped(el)) dstKeep.push(all[i]); }); }
    dstEls.length = 0; dstEls.push(...dstKeep);
    for (const id of strip) root.querySelector('#' + id)?.remove();
    for (const c of stripClass) for (const e of [...root.querySelectorAll('.' + c)]) e.remove();
    let ghostFilter = false;
    srcEls.forEach((el, i) => {
      const d = dstEls[i];
      // the source hides swappable parts with opacity/display attributes and the rig overrides them in
      // style: drop both and write the computed truth back as attributes
      for (const a of ['style', 'class', 'opacity', 'display', 'visibility']) d.removeAttribute(a);
      for (const a of [...d.getAttributeNames()]) if (a.startsWith('data-')) d.removeAttribute(a);   // (the page's own notes, e.g. a far cheek's bend points)
      const cs = getComputedStyle(el);
      if (el === src) { ghostFilter = cs.filter !== 'none'; return; }
      if (cs.display === 'none') { d.setAttribute('display', 'none'); return; }
      if (cs.transform && cs.transform !== 'none') {
        const m = /matrix\(([^)]+)\)/.exec(cs.transform);
        if (m) {
          const [a, b, c, dd, e, f] = m[1].split(',').map((x) => num(x.trim()));
          const [oxs, oys] = cs.transformOrigin.split(' ');
          let ox = parseFloat(oxs), oy = parseFloat(oys);
          if (cs.transformBox === 'fill-box' && typeof el.getBBox === 'function') { const bb = el.getBBox(); ox += bb.x; oy += bb.y; }
          ox = num(ox); oy = num(oy);
          if (!(a === 1 && b === 0 && c === 0 && dd === 1 && e === 0 && f === 0)) d.setAttribute('transform', `translate(${ox} ${oy}) matrix(${a} ${b} ${c} ${dd} ${e} ${f}) translate(${-ox} ${-oy})`);
        }
      }
      if (cs.opacity !== '1') d.setAttribute('opacity', num(cs.opacity));
      if (cs.visibility === 'hidden') d.setAttribute('visibility', 'hidden');
      if (el.tagName === 'path' || el.tagName === 'ellipse' || el.tagName === 'circle' || el.tagName === 'rect') {
        const f = hex(cs.fill); const attr = (el.getAttribute('fill') || '').toLowerCase();
        if (f && attr !== 'none' && f.hex.toLowerCase() !== attr) d.setAttribute('fill', f.hex);
      }
    });
    if (ghostFilter) root.querySelector('#cat').setAttribute('filter', 'url(#ghost)');
    // the nested svg: geometry from the box, keep the viewBox
    root.removeAttribute('width'); root.removeAttribute('height'); root.removeAttribute('xmlns'); root.removeAttribute('style'); root.removeAttribute('class');
    const cat = { box: box(document.querySelector('.nft-cat')), svg: root.outerHTML };
    const props = [];
    for (const el of document.querySelectorAll('.nft-moon svg, .nft-prop svg, .nft-thought .thought-cloud svg, .nft-thought .thought-icon svg')) {
      const kind = el.closest('.nft-moon') ? 'moon' : el.closest('.thought-icon') ? 'icon' : el.closest('.thought-cloud') ? 'cloud' : 'prop';
      props.push({ kind, box: box(el), svg: el.outerHTML });
    }
    return { cat, props, night: document.querySelector('.nft-art').dataset.night === 'on' };
  });
}

// ---- pure-SVG background, matching the CSS of .nft-art
// the floor's line: 870 on every card but his (Emonadgotchi's card stands him on 900, he is tall: Lab.tsx MoodTile)
const FLOOR = WHO === 'emonad' ? 900 : 870;
const dim = (hexColor, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hexColor.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
function scene(night) {
  const k = night ? 0.62 : 1;
  const wall = ['#3a1f5c', '#24123f', '#170b2a'].map((c) => dim(c, k));
  const floor = ['#2c1a44', '#1d1030', '#150a24'].map((c) => dim(c, k));
  const pre = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">` +
    `<defs>` +
    `<radialGradient id="w" cx="0.5" cy="0.2" r="0.5" gradientTransform="translate(0.5 0.2) scale(2.4 1.8) translate(-0.5 -0.2)"><stop offset="0" stop-color="${wall[0]}"/><stop offset="0.55" stop-color="${wall[1]}"/><stop offset="1" stop-color="${wall[2]}"/></radialGradient>` +
    `<pattern id="d" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.6" fill="#EAC6EA" fill-opacity="0.13"/></pattern>` +
    `<linearGradient id="dm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="dk"><rect width="1024" height="1024" fill="url(#dm)"/></mask>` +
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floor[0]}"/><stop offset="0.6" stop-color="${floor[1]}"/><stop offset="1" stop-color="${floor[2]}"/></linearGradient>` +
    `<radialGradient id="r"><stop offset="0" stop-color="#B894D8" stop-opacity="0.22"/><stop offset="0.55" stop-color="#B894D8" stop-opacity="0.08"/><stop offset="0.72" stop-color="#B894D8" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="fc"><path d="M-51 ${FLOOR + 20}A563 60 0 0 1 1075 ${FLOOR + 20}V1030H-51Z"/></clipPath>` +
    `<filter id="ghost" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#B894D8" flood-opacity="0.55"/></filter>` +
    `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#E8D89B" flood-opacity="0.35"/></filter>` +
    `</defs>` +
    `<rect width="1024" height="1024" fill="url(#w)"/>` +
    `<rect width="1024" height="1024" fill="url(#d)" mask="url(#dk)"/>`;
  const floorSvg = `<g clip-path="url(#fc)"><path d="M-51 ${FLOOR + 20}A563 60 0 0 1 1075 ${FLOOR + 20}V1030H-51Z" fill="url(#f)"/><path d="M-51 ${FLOOR + 20}A563 60 0 0 1 1075 ${FLOOR + 20}" fill="none" stroke="#B894D8" stroke-opacity="0.16" stroke-width="8"/></g>` +
    `<ellipse cx="512" cy="${FLOOR - 6 + 48}" rx="320" ry="48" fill="url(#r)"/>`;
  return { pre, floorSvg };
}
const nested = (svg, box, extra = '') => svg.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(x|y|width|height|xmlns|class|style)="[^"]*"/g, '').replace(/^<svg/, `<svg x="${r1(box.x)}" y="${r1(box.y)}" width="${r1(box.w)}" height="${r1(box.h)}"${extra}`));
const r1 = (n) => Math.round(n * 10) / 10;
// whitespace out; path data rewritten as relative commands at one decimal (the wobble was drawn at two).
// Deltas are taken between the already-rounded absolute points, so the shape is exactly the rounded
// absolute path: no drift. Only M/L/C/Z paths are rewritten; anything else is left as it was.
const fmt = (n) => { const r = Math.round(n * 10) / 10; let t = (Object.is(r, -0) ? 0 : r).toFixed(1); if (t.endsWith('.0')) t = t.slice(0, -2); return t.replace(/^(-?)0\./, '$1.'); };
const join = (nums) => nums.map(fmt).reduce((acc, t) => (acc === '' || t.startsWith('-') || (acc.includes('.') === false && false)) ? acc + t : acc + (t.startsWith('-') || (acc.at(-1) === '.' ) ? '' : ' ') + t, '');
function relPath(d) {
  if (/[^MLCZmlcz0-9\s,.\-]/.test(d)) return d; // arcs, H/V and friends: leave the path alone
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+/g);
  if (!tokens) return d;
  let out = ''; let cx = 0, cy = 0; let i = 0; let cmd = '';
  const r1 = (n) => Math.round(n * 10) / 10;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLCZmlcz]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { out += 'z'; } continue; }
    if (cmd === 'M' || cmd === 'L') {
      const x = r1(+tokens[i]), y = r1(+tokens[i + 1]); i += 2;
      if (cmd === 'M' && out === '') { out += 'M' + join([x, y]); }
      else { const rel = cmd === 'M' ? 'm' : 'l'; out += rel + join([r1(x - cx), r1(y - cy)]); }
      cx = x; cy = y; if (cmd === 'M') cmd = 'L';
    } else if (cmd === 'C') {
      const p = tokens.slice(i, i + 6).map((v) => r1(+v)); i += 6;
      out += 'c' + join([r1(p[0] - cx), r1(p[1] - cy), r1(p[2] - cx), r1(p[3] - cy), r1(p[4] - cx), r1(p[5] - cy)]);
      cx = p[4]; cy = p[5];
    } else { return d; } // unexpected: leave the path alone
  }
  return out;
}
const minify = (s) => s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/ (?=\/?>)/g, '').replace(/ d="([^"]*)"/g, (m, d) => ` d="${relPath(d)}"`);

// ---- capture everything
const cats = []; const scenes = [];
for (const [mi, mood] of MOODS.entries()) {
  for (const crown of [false, true]) {
    const c = await capture(mood, crown);
    // r3tards' lines are <use>s of shapes kept once in <defs> (each is drawn twice: its pale edge, then black). `href` is
    // SVG 2; a wallet's or a marketplace's rasteriser may only know `xlink:href`, so his art uses that (the scene's root
    // declares the namespace, below). No other pet's art has a <use>.
    cats[mi * 2 + (crown ? 1 : 0)] = WHO === 'r3tards' || WHO === 'emonad' ? minify(c.cat.svg).replace(/ href="#/g, ' xlink:href="#') : minify(c.cat.svg);
    if (!crown) {
      const s = scene(c.night);
      const moon = c.props.filter((p) => p.kind === 'moon').map((p) => nested(p.svg, p.box, ' filter="url(#glow)"')).join('');
      const after = c.props.filter((p) => p.kind !== 'moon').map((p) => nested(p.svg, p.box)).join('');
      // the character's nested svg clips to its viewBox unless told not to: sahur's halo (y -6..8) and the sleep z's rise
      // above y=0 and were cut off. The cat's and the frog's art is on chain and immutable, so only his bake gets the
      // attribute (a re-bake of theirs must stay byte-identical to what was deployed).
      const ov = WHO === 'sahur' || WHO === 'thiccums' || WHO === 'r3tards' || WHO === 'emonad' ? ' overflow="visible"' : '';
      scenes[mi] = { pre: minify((WHO === 'r3tards' || WHO === 'emonad' ? s.pre.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"') : s.pre) + moon + s.floorSvg + `<svg x="${r1(c.cat.box.x)}" y="${r1(c.cat.box.y)}" width="${r1(c.cat.box.w)}" height="${r1(c.cat.box.h)}" viewBox="0 0 200 230"${ov}>`), post: '</svg>' + minify(after) + '</svg>' };
      // the nested cat svg's own opening tag is dropped: the scene supplies it, so the base is the inner markup
    }
    console.log(mood, crown ? 'crown' : '     ', 'cat', cats[mi * 2 + (crown ? 1 : 0)].length, 'bytes, props', c.props.length);
  }
}
// strip the cat's own <svg ...> wrapper: the scene provides it
const inner = cats.map((s) => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''));

// ---- base + patches: tokenise into tags, compare attributes across the 18 variants
const tokenise = (s) => s.match(/<[^>]+>|[^<]+/g);
const toks = inner.map(tokenise);
const n = toks[0].length;
for (const t of toks) if (t.length !== n) throw new Error('variants differ in structure');
const attrRe = /([a-zA-Z:-]+)="([^"]*)"/g;
let base = ''; const patches = inner.map(() => []); let variables = 0;
for (let i = 0; i < n; i++) {
  const t0 = toks[0][i];
  if (!t0.startsWith('<') || t0.startsWith('</')) {
    for (const t of toks) if (t[i] !== t0) throw new Error(`text differs at token ${i}`);
    base += t0; continue;
  }
  const tag = /^<([a-zA-Z0-9-]+)/.exec(t0)[1];
  const maps = toks.map((t) => Object.fromEntries([...t[i].matchAll(attrRe)].map((m) => [m[1], m[2]])));
  const names = [...new Set(maps.flatMap((m) => Object.keys(m)))];
  // attribute order: stable, id first
  names.sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : a.localeCompare(b)));
  let tagStr = '<' + tag;
  for (const name of names) {
    const defaults = { transform: '', opacity: '1', display: 'inline', visibility: 'visible', filter: '' };
    const vals = maps.map((m) => m[name] ?? defaults[name] ?? '');
    if (vals.every((v) => v === vals[0])) { if (vals[0] !== '' || !(name in defaults)) tagStr += ` ${name}="${vals[0]}"`; }
    else { tagStr += ` ${name}="\x01"`; vals.forEach((v, k) => patches[k].push(v)); variables++; }
  }
  tagStr += t0.endsWith('/>') ? '/>' : '>';
  base += tagStr;
}
writeFileSync(OUT + 'base.svgt', base);
writeFileSync(OUT + 'patches.json', JSON.stringify(patches));
writeFileSync(OUT + 'scenes.json', JSON.stringify(scenes));
console.log('base', base.length, 'bytes,', variables, 'variable attributes; patches', patches.map((p) => p.join('\x01').length).join('/'), 'bytes; scenes', scenes.map((s) => s.pre.length + s.post.length).join('/'));

// ---- compose (the same way the contract will) and render previews
const compose = (mi, crown) => { let k = 0; const p = patches[mi * 2 + (crown ? 1 : 0)]; const cat = base.replace(/\x01/g, () => p[k++]); return scenes[mi].pre + cat + scenes[mi].post; };
for (const [mi, mood] of MOODS.entries()) {
  for (const crown of [false, true]) {
    const name = `${mood}${crown ? '-crown' : ''}`;
    const svg = compose(mi, crown);
    if (svg.includes('\x01')) throw new Error('sentinel left in ' + name);
    writeFileSync(`${OUT}preview/${name}.svg`, svg);
    await page.goto('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), { waitUntil: 'load' });
    await page.screenshot({ path: `${OUT}preview/${name}.png` });
  }
}
console.log('previews written');
await browser.close();

// ---- files for the contracts: contracts/art/ (read by the deploy script and the tests)
{
  const ART = fileURLToPath(new URL(`../contracts/art${SUFFIX}/`, import.meta.url));
  mkdirSync(ART, { recursive: true });
  writeFileSync(ART + 'base.bin', base);
  { const offs = []; for (let i = 0; i < base.length; i++) if (base[i] === '\x01') offs.push(i); const buf = Buffer.alloc(offs.length * 4); offs.forEach((o, i) => buf.writeUInt32BE(o, i * 4)); writeFileSync(ART + 'offsets.bin', buf); }
  patches.forEach((p, i) => writeFileSync(ART + `patch-${i}.bin`, p.join('\x01')));
  scenes.forEach((s, m) => { writeFileSync(ART + `scene-${m}-pre.bin`, s.pre); writeFileSync(ART + `scene-${m}-post.bin`, s.post); });
  for (const [mi, mood] of MOODS.entries()) for (const crown of [false, true]) writeFileSync(ART + `expected-${mi * 2 + (crown ? 1 : 0)}.svg`, compose(mi, crown));
  writeFileSync(ART + 'README.md', `# On-chain art\n\nGenerated by \`node tools/bake-art.mjs${WHO === 'cat' ? '' : ' ' + WHO}\` (dev server on 5199). Do not edit.\n\n- \`base.bin\`: ${WHO === 'cat' ? 'the cat' : WHO}, ${base.length} bytes, with a 0x01 byte wherever a mood changes an attribute value (${variables} places)\n- \`patch-<i>.bin\`: the values for variant i = mood*2 + crown, joined by 0x01 (moods: ${MOODS.join(', ')})\n- \`scene-<m>-pre.bin\` / \`-post.bin\`: the picture before and after the cat (background, moon, props)\n- \`expected-<i>.svg\`: the composed picture, what \`EmogotchiArt.image()\` must return byte for byte\n`);
  console.log('contracts/art written');
}
