// Profile pictures: every pet as an avatar, in groups of looks (moods, crowned, outfits, the emo hair, the Jewish pack,
// the Habibi pack, ghosts), a second framing, and the pets in action; on the brand's colours and in the game's rooms.
// Not on chain, just for fun (operator, 2026-09-25; revamped 2026-10-01 with Thiccums, the two packs and their rooms).
// A look is drawn by the live rig: the card route bare (`/nft?card=<mood>&character=<c>&bare=1[&crown=1][&costume=…]`,
// the pet alone on transparency) for a colour, the PFP lab's real stage (`/pfplab`) for a room, framed on the head
// (measured off `#head`'s box in the page, so every look of a pet is framed the same way). Output:
// apps/web/public/pfp/<c>/<look>.png (768, the download) and <look>-t.webp (384, the grid), plus pfp/index.json for
// the /pfps page.
//   node tools/pfps.mjs [cat|frog|sahur|thiccums|r3tards] [--acts-only] [--groups=jewish,habibi]
//   BASE=<server>  the site to draw from (default a dev server on 5199). Nothing it serves may change while this runs:
//                  a production build on tools/serve-dist.mjs is the safe one when another session is editing src.
//   OUT=<dir>      a trial run: write there, and leave public/pfp and its index alone
// The files land in public/ only at the end (Vite reloads open pages when public/ changes).
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const TRIAL = process.env.OUT ? process.env.OUT.replace(/\/?$/, '/') : null;
const FINAL = TRIAL ?? fileURLToPath(new URL('../apps/web/public/pfp/', import.meta.url));   // fileURLToPath: the repo path has spaces
// rendered into a temp dir and copied over at the END: Vite reloads every open page when public/ changes, which
// would kill the card page mid-render (it did)
const ROOT = mkdtempSync(join(tmpdir(), 'pfp-')) + '/';
const ONLY = process.argv.slice(2).find((a) => !a.startsWith('--'));
const ONLY_ACTS = process.argv.includes('--acts-only');   // re-render only the In action group, merging into the existing index
const GROUPS_ARG = process.argv.find((a) => a.startsWith('--groups='));
const ONLY_GROUPS = GROUPS_ARG ? GROUPS_ARG.slice(9).split(',') : null;   // a trial of some groups ('close'/'full' is the second framing, 'act' the action shots)
// each pet has its main framing and a second one (operator, 2026-09-25: "close up tung tungs, full body inversebrahs,
// close up cats"): a frame is measured off `base` (#head; #figure for the whole pet; 'mass' = the head and the body
// together, for a pet whose #figure box is inflated by hidden parts) on its first look.
// `slide`: the main frames slide up when a hat or crown needs the room. The close-ups and the full-body ones are
// FIXED instead (`anchor` = where the base box's centre sits, as a fraction of the frame's height): sliding put the
// face at a different height in every look ("some are way too low, others just a bit higher"); now a tall hat's tip
// may clip at the top, and the face is where it is in every picture.
// `stage`: the pet has no card route in a production build (Thiccums), so its colour looks are shot bare on the stage too.
// `fit`: a look whose box is taller than the frame (the r3tard under the witch hat: his face is short and the hat as tall
// again) gets a bigger frame of its own, the whole box in it, instead of a face slid out of the bottom or a clipped hat.
const CHARS = {
  cat: { key: 'cat', label: 'Emogotchi', hair: false, frames: [{ key: '', base: 'head', zoom: 1.55, shift: 0.16, slide: true }, { key: 'close', title: 'Close-ups', base: 'head', zoom: 1.26, anchor: 0.47 }] },
  frog: { key: 'frog', label: 'inversebrah', hair: true, frames: [{ key: '', base: 'head', zoom: 1.65, shift: 0.22, slide: true }, { key: 'full', title: 'Full body', base: 'figure', zoom: 1.18, anchor: 0.5 }] },
  sahur: { key: 'sahur', label: 'Tung Tung Tung Sahur', hair: true, frames: [{ key: '', base: 'head', zoom: 1.75, shift: 0.20, slide: true }, { key: 'close', title: 'Close-ups', base: 'head', zoom: 1.2, anchor: 0.47 }] },
  thiccums: { key: 'thiccums', label: 'Thiccums', hair: true, stage: true, frames: [{ key: '', base: 'head', zoom: 1.3, shift: 0.12, slide: true }, { key: 'full', title: 'Full body', base: 'mass', zoom: 1.27, anchor: 0.5 }] },
  // the r3tard: a face on a stick. His main frame is the face (his #head IS the face: 116 wide, 70 tall), his second the
  // whole of him ('stick': the face, the spine, the arms and both legs, which are outside #body on him)
  r3tards: { key: 'r3tards', label: 'r3tardgotchi', hair: true, stage: true, frames: [{ key: '', base: 'head', zoom: 1.36, shift: 0.1, slide: true, fit: true }, { key: 'full', title: 'Full body', base: 'stick', zoom: 1.16, anchor: 0.5, fit: true }] },
};
// the backgrounds: the site's own colours (each a soft radial so a round crop still has a centre), and the ROOMS, which
// are not pasted behind the pet but captured WITH it from a real stage (/pfplab): the plain room by day and by night,
// and the shop's room themes. Cycled with a stride so every look gets a different one from its neighbours.
const COLOURS = [
  ['pink', '#ff7aa6', '#b83a66'], ['violet', '#B894D8', '#4a2a6e'], ['dusk', '#3a1f5c', '#170b2a'], ['mint', '#8FCB70', '#2f6a25'],
  ['peach', '#F0B36E', '#a5531b'], ['gold', '#E8D89B', '#8a6d1f'], ['sky', '#8fd1e8', '#2b5f80'], ['plum', '#e84d7f', '#3a0d24'],
  ['sunset', '#ffb36b', '#c2345f'], ['aurora', '#8fe3cf', '#5a3e9e'], ['ocean', '#a8e6f7', '#2a6fb0'],
  ['club', '#9a7cc4', '#573d76'],   // the r3tards club's own purple (his favourite; not in the cycle the other pets share)
];
// [key, scene, night, label]: 'backrooms-dim' is the Backrooms with the lights low (the stage's night filter turns its
// yellow a sickly green: the meme's own mood)
const ROOMS = [
  ['room', null, 0, 'the room'], ['night', null, 1, 'the room at night'], ['spooky', 'halloween', 1, 'the Spooky theme'],
  ['backrooms', 'backrooms', 0, 'the Backrooms'], ['backrooms-dim', 'backrooms', 1, 'the Backrooms, lights low'],
  ['kotel', 'kotel', 0, 'the Western Wall'], ['kotel-night', 'kotel', 1, 'the Western Wall at night'],
  ['majlis', 'majlis', 0, 'the Majlis'], ['majlis-night', 'majlis', 1, 'the Majlis at night'],
];
const BGKEY = Object.fromEntries([...COLOURS, ...ROOMS].map((b) => [b[0], b]));
const BG = ['pink', 'room', 'violet', 'sunset', 'spooky', 'dusk', 'kotel', 'mint', 'night', 'peach', 'majlis', 'backrooms-dim', 'gold', 'aurora', 'kotel-night', 'backrooms', 'sky', 'majlis-night', 'plum', 'ocean'].map((k) => BGKEY[k]);
// each pet's own background comes round twice as often: the cat haunts the Spooky theme, the frok keeps late nights,
// Sahur lives in the Backrooms, the seal has his sea
const FAVOURITE = { cat: 'spooky', frog: 'night', sahur: 'backrooms', thiccums: 'ocean', r3tards: 'club' };
const bgFor = (i, g, c) => { const list = [...BG, BGKEY[FAVOURITE[c]]]; return list[(i * 5 + g * 8) % list.length]; };
/** The looks, in the groups and the order the page shows them. A look is [mood, crown, costume, background?]: the
 *  costume is one piece or several joined by commas (as worn in the game: one outfit, any accessories), the background
 *  is forced only where a pack belongs in its own room. Every look of a pet is a different combination (checked
 *  below), and with the backgrounds cycled no two pictures are alike. */
const MOODS = ['content', 'happy', 'sleepy', 'sleeping', 'bored', 'hungry', 'grubby', 'sad'];
const OUTFITS = ['witch', 'pumpkin', 'mummy', 'zombie'];
const SETS = (c) => [
  { key: 'moods', title: 'Moods', looks: MOODS.map((m) => [m]) },
  { key: 'crowned', title: 'Crowned', looks: MOODS.map((m) => [m, 1]) },
  { key: 'outfits', title: 'Outfits', looks: [
    ...OUTFITS.flatMap((o) => ['content', 'happy', 'sleepy', 'bored', 'sad'].map((m) => [m, 0, o])),   // each outfit in five moods
    ...OUTFITS.flatMap((o) => [['content', 1, o], ['happy', 1, o]]),                                   // each outfit gold, crowned
    // (the cat has no emo hair of the shop's: more of the outfits instead)
    ...(c.hair ? [] : [['sleeping', 0, 'witch'], ['grubby', 0, 'zombie'], ['hungry', 0, 'pumpkin'], ['sleeping', 0, 'mummy'], ['sad', 1, 'witch'], ['sleepy', 1, 'zombie'], ['hungry', 1, 'mummy'], ['grubby', 1, 'pumpkin']]),
  ] },
  ...(c.hair ? [{ key: 'hair', title: 'Emo hair', looks: [['content', 0, 'emohair'], ['happy', 0, 'emohair'], ['bored', 0, 'emohair'], ['sleepy', 0, 'emohair'], ['content', 1, 'emohair'], ['happy', 1, 'emohair'], ['sad', 0, 'emohair'], ['grubby', 0, 'emohair']] }] : []),
  // the kippah (with its payot) and the Star of David, alone, together, crowned (the gilded kippah), and with an outfit
  { key: 'jewish', title: 'The Jewish pack', looks: [
    ['content', 0, 'kippah'], ['happy', 0, 'kippah'], ['sleepy', 0, 'kippah'], ['content', 1, 'kippah'],
    ['content', 0, 'starofdavid'], ['happy', 1, 'starofdavid'],
    ['content', 0, 'kippah,starofdavid', 'kotel'], ['happy', 0, 'kippah,starofdavid'], ['bored', 0, 'kippah,starofdavid'], ['happy', 1, 'kippah,starofdavid', 'kotel-night'],
    ['content', 0, 'witch,starofdavid'], ['bored', 0, 'witch,kippah'],
    ...(c.hair ? [['content', 0, 'emohair,kippah']] : []),
  ] },
  // the keffiyeh and the bisht, alone, together, crowned (the gold agal, the golden bisht)
  { key: 'habibi', title: 'The Habibi pack', looks: [
    ['content', 0, 'keffiyeh'], ['happy', 0, 'keffiyeh'], ['sleepy', 0, 'keffiyeh'], ['content', 1, 'keffiyeh'],
    ['content', 0, 'bisht'], ['happy', 0, 'bisht'], ['happy', 1, 'bisht'],
    ['content', 0, 'bisht,keffiyeh', 'majlis'], ['happy', 0, 'bisht,keffiyeh'], ['bored', 0, 'bisht,keffiyeh'], ['sad', 0, 'bisht,keffiyeh'], ['content', 1, 'bisht,keffiyeh', 'majlis-night'],
  ] },
  { key: 'ghosts', title: 'Ghosts', looks: [['dead'], ['dead', 1], ['dead', 0, 'witch'], ['dead', 0, 'pumpkin'], ['dead', 1, 'witch'], ['dead', 0, 'zombie']] },
];
/** the second framing: the moods that read best, crowns, the outfits, the hair (or more outfits on the cat), the packs, the ghost */
const ALT = (c) => [
  ['content'], ['happy'], ['sleepy'], ['bored'], ['sad'], ['hungry'], ['content', 1], ['happy', 1], ['sleepy', 1],
  ['content', 0, 'witch'], ['happy', 0, 'pumpkin'], ['content', 0, 'zombie'], ['happy', 1, 'mummy'],
  ...(c.hair ? [['content', 0, 'emohair'], ['happy', 1, 'emohair']] : [['bored', 0, 'mummy'], ['sad', 1, 'zombie']]),
  ['content', 0, 'kippah,starofdavid'], ['happy', 1, 'kippah'], ['happy', 0, 'starofdavid'],
  ['content', 0, 'bisht,keffiyeh'], ['happy', 0, 'keffiyeh'], ['content', 1, 'bisht,keffiyeh'],
  ['dead'],
];
/** The pets in action: the director's own animation on the stage, frozen at `at` ms (chosen off the frame sheets of
 *  `node tools/pfp-moments.mjs`). [action, at, crown, costume, background, label, zoom?, dx?]; zoom is the frame's side
 *  in rest-figure heights (capped at the stage's height), dx slides it sideways in frame widths. `dreidel`, `darbuka`,
 *  `kapparot` and `falcon` are Play and Pet with that item (the lab sets it). */
// the packs' toys and Pet items in use, dressed for them and in their rooms: the same seven for every pet. `zoom` is the
// pet's own; the falcon (on the head, an arm or the bat) and, where `hen` says so, the hen overhead get more room, and
// `drum` slides the frame toward a drum that stands off to one side, `encore` is the moment after the last stroke
// (Sahur's is later: his bat's last hit throws a burst that the stage's edge cuts)
const PACK_ACTS = (zoom, { hen = 0, drum = 0, encore = 7950 } = {}) => [
  ['dreidel', 3450, 0, 'kippah', 'kotel', 'the dreidel', zoom], ['dreidel', 4500, 0, 'kippah,starofdavid', 'sky', 'the dreidel, spinning', zoom],
  ['darbuka', 4350, 0, 'keffiyeh', 'majlis', 'on the darbuka', zoom, drum], ['darbuka', encore, 0, 'bisht,keffiyeh', 'sunset', 'the darbuka, an encore', zoom, drum],
  ['kapparot', 3900, 0, 'kippah', 'kotel-night', 'kapparot', zoom + hen],
  ['falcon', 3300, 0, 'bisht,keffiyeh', 'majlis-night', 'the falcon', zoom + 0.12], ['falcon', 2400, 0, 'keffiyeh', 'dusk', 'the falcon', zoom + 0.12],
];
const ACTS = {
  cat: [
    ['feed', 3300, 0, null, 'room', 'dinner'], ['feed', 12150, 1, null, 'sunset', 'full and happy'], ['feed', 3450, 0, 'mummy', 'violet', 'dinner'],
    ['wash', 4650, 0, null, 'backrooms', 'bath time', 1.85], ['wash', 4800, 0, 'pumpkin', 'night', 'bath time', 1.85],
    ['play', 5700, 0, null, 'mint', 'caught it'], ['play', 10650, 0, 'witch', 'spooky', 'got the ball'],
    ['poop', 1050, 0, null, 'sky', 'straining'], ['poop', 5100, 0, 'zombie', 'backrooms-dim', 'the aftermath'],
    ['pet', 900, 0, null, 'pink', 'petted'],
    ...PACK_ACTS(1.6, { hen: 0.12 }),
  ],
  frog: [
    ['screenshot', 2700, 0, null, 'room', 'screenshot'], ['screenshot', 4050, 1, 'emohair', 'dusk', 'after the flash'],
    ['slap', 2100, 0, null, 'pink', 'slapped', 1.8, 0.1], ['slap', 3600, 0, 'witch', 'spooky', 'seeing stars'],
    ['squeeze', 2850, 0, null, 'backrooms', 'squeezed', 1.75, 0.1], ['squeeze', 2700, 1, 'mummy', 'violet', 'squeezed', 1.75, 0.1],
    ['burn', 2700, 0, null, 'night', 'on fire', 1.75], ['burn', 6300, 0, 'zombie', 'sky', 'still on fire', 1.75],
    ['play', 10650, 0, 'emohair', 'mint', 'got the ball'], ['wash', 4650, 0, null, 'backrooms-dim', 'bath time'],
    ['poop', 1050, 0, 'pumpkin', 'peach', 'straining'], ['feed', 12150, 1, null, 'aurora', 'full and happy'],
    ...PACK_ACTS(1.7),
  ],
  sahur: [
    ['tung', 2100, 0, null, 'backrooms', 'tung', 1.6, -0.12], ['tung', 2550, 1, null, 'room', 'tung tung', 1.6, -0.1],
    ['tung', 3150, 0, 'zombie', 'backrooms-dim', 'tung tung tung', 1.6, -0.12], ['tung', 3000, 1, 'witch', 'spooky', 'tung tung tung', 1.6, -0.12],
    ['feed', 1950, 0, null, 'peach', 'picking up dinner', 1.5], ['feed', 4500, 0, 'emohair', 'backrooms', 'dinner'], ['feed', 11950, 0, null, 'night', 'bowl, thrown', 1.55, 0.12],
    ['play', 6250, 0, null, 'mint', 'the swipe', 1.55, -0.06], ['play', 10950, 1, null, 'pink', 'got the ball'],
    ['wash', 4650, 0, 'pumpkin', 'sky', 'bath time', 1.5], ['poop', 1050, 0, null, 'gold', 'straining'], ['poop', 5100, 0, 'mummy', 'backrooms', 'the aftermath', 1.55, -0.1],
    ...PACK_ACTS(1.5, { drum: -0.1, encore: 8400 }),
  ],
  thiccums: [
    ['bounce', 1050, 0, null, 'ocean', 'butt bounce'], ['bounce', 2550, 1, null, 'pink', 'butt bounce'], ['bounce', 1200, 0, 'witch', 'spooky', 'butt bounce'],
    ['feed', 1800, 0, null, 'room', 'fish, caught'], ['feed', 3450, 0, 'mummy', 'violet', 'fish incoming', 1.7], ['feed', 7650, 1, null, 'sunset', 'full and happy'],
    ['play', 5850, 0, null, 'mint', 'a header', 1.7], ['play', 10200, 0, 'emohair', 'sky', 'got the ball'],
    ['wash', 4650, 0, null, 'backrooms', 'bath time', 1.7], ['poop', 1050, 0, 'pumpkin', 'peach', 'straining'], ['pet', 900, 0, null, 'aurora', 'petted'],
    ...PACK_ACTS(1.7),
  ],
  // the r3tard: he sits down behind his bowl, kicks the ball, and the falcon rides his left arm (moments off
  // `pfp-moments.mjs r3tards`, 2026-10-01)
  r3tards: [
    ['feed', 5250, 0, null, 'room', 'dinner'], ['feed', 10500, 0, 'emohair', 'club', 'licking his lips'], ['feed', 12600, 1, null, 'sunset', 'full and happy'],
    ['play', 6180, 0, null, 'mint', 'the kick', 1.45, 0.08], ['play', 6480, 0, 'witch', 'spooky', 'kicked it', 1.45, 0.08], ['play', 10800, 1, null, 'pink', 'got the ball'],
    ['wash', 4350, 0, null, 'backrooms', 'bath time', 1.45], ['wash', 4500, 0, 'pumpkin', 'night', 'bath time', 1.45],
    ['poop', 2100, 0, null, 'sky', 'straining'], ['poop', 5100, 0, 'zombie', 'backrooms-dim', 'the aftermath', 1.5, -0.12],
    ['pet', 600, 0, null, 'club', 'petted'], ['yawn', 750, 0, 'mummy', 'violet', 'a yawn'],
    ...PACK_ACTS(1.3, { hen: 0.12, drum: -0.08 }),
  ],
};
const ZOOM = { cat: 1.6, frog: 1.55, sahur: 1.4, thiccums: 1.5, r3tards: 1.3 };   // in silhouette heights
const WORDS = { emohair: 'emo hair', starofdavid: 'Star of David' };
const wornOf = (costume) => (costume ?? '').split(',').filter(Boolean);
const nameOf = ([mood, crown, costume]) => [mood, crown ? 'crown' : '', ...wornOf(costume)].filter(Boolean).join('-');
const labelOf = ([mood, crown, costume], bg) => { const parts = [mood === 'dead' ? 'ghost' : mood, ...wornOf(costume).map((w) => WORDS[w] ?? w)]; if (crown) parts.push('crowned'); if (bg[3]) parts.push(bg[3]); return parts.join(' · '); };
/** a step that depends on the page having settled, tried again on a hiccup (a navigation that timed out, a late chunk) */
const thrice = async (what, f) => { for (let n = 1; ; n++) { try { return await f(); } catch (e) { if (n === 3) throw new Error(`${what}: ${e.message}`); console.log('  again:', what, String(e.message).split('\n')[0]); await new Promise((r) => setTimeout(r, 1500)); await revive(); } } };

const launch = () => puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
let browser = await launch();
let src = await browser.newPage();
let out = await browser.newPage();
/** a browser that died mid-run (the Mac short of memory kills it) is started again, with fresh pages */
const revive = async () => {
  if (browser.connected && !src.isClosed() && !out.isClosed()) return;
  console.log('  (the browser was gone: starting another)');
  try { await browser.close(); } catch { /* already gone */ }
  browser = await launch(); src = await browser.newPage(); out = await browser.newPage();
};
/** the lab's stage with a pet in it, settled: front tab (a background tab's animation timeline is frozen, so the
 *  zombie's 0.8 s fur transition and the ghost's paling were caught at their start), ready flag, and a room's scenery in */
const openStage = async (q, room, dpr = 4) => {
  await src.setViewport({ width: 600, height: 460, deviceScaleFactor: dpr });
  await src.goto(`${BASE}/pfplab?${q}${room ? `${room[1] ? '&scene=' + room[1] : ''}${room[2] ? '&night=1' : ''}` : '&bare=1'}`, { waitUntil: 'networkidle0' });
  await src.bringToFront();
  await src.waitForFunction(() => window.__card_ready, { timeout: 20000, polling: 200 });   // interval polling, not rAF (a background tab never fires it)
  if (room?.[1]) await src.waitForFunction(() => !!document.querySelector('.pfplab .stage [class*="scn-"]'), { timeout: 20000, polling: 200 });   // a room theme's scenery is a chunk of its own
};
const frame = async (png, { x0, y0, side, srcW, srcH, room, bg, glow }, path) => {
  const [, bgA, bgB] = bg;
  for (const size of [768, 384]) {
    const k = size / side;
    const html = `<!doctype html><html><head><style>
      html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:#000}
      .pfp{position:relative;width:${size}px;height:${size}px;overflow:hidden;background:${room ? '#000' : `radial-gradient(120% 120% at 50% 30%, ${bgA} 0%, ${bgB} 100%)`}}
      .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,0.14) ${size * 0.0028}px, transparent ${size * 0.003}px);background-size:${size * 0.045}px ${size * 0.045}px;-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.9),rgba(0,0,0,.2) 70%,transparent)}
      .glow{position:absolute;left:10%;right:10%;${glow};border-radius:50%}
      img{position:absolute;left:${-x0 * k}px;top:${-y0 * k}px;width:${srcW * k}px;height:${srcH * k}px}
    </style></head><body><div class="pfp">${room ? '' : '<div class="dots"></div><div class="glow"></div>'}<img src="data:image/png;base64,${png}"></div></body></html>`;
    await out.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await out.setContent(html, { waitUntil: 'load' });
    // the download is a PNG; the grid's thumbnail a WebP a sixth of the size (the page shows hundreds of them)
    await out.screenshot(size === 768 ? { path: `${path}.png`, clip: { x: 0, y: 0, width: size, height: size } } : { path: `${path}-t.webp`, type: 'webp', quality: 88, clip: { x: 0, y: 0, width: size, height: size } });
  }
};

/** One look, settled, with the box its frame is built round: the head unit's (the crown, hat, hair, pumpkin and
 *  keffiyeh ride in it), or the whole pet's. In page pixels, relative to the stage when shot on it. */
const capture = (what, q, room, onStage, base) => thrice(what, async () => {
  if (onStage) await openStage(q, room);
  else {
    await src.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 }); await src.goto(`${BASE}/nft?${q}&bare=1`, { waitUntil: 'networkidle0' });
    await src.bringToFront();
    await src.waitForFunction(() => window.__card_ready, { timeout: 20000, polling: 200 });
  }
  await new Promise((r) => setTimeout(r, 400));
  const box = await src.evaluate((base) => {
    const ids = base === 'figure' ? ['#figure', '#crown', '#witchhat', '#emohair', '#pumpkin', '#arms'] : base === 'stick' ? ['#head', '#body', '#arms', '#footL', '#footR', '#crown', '#witchhat', '#emohair', '#pumpkin', '#kippah', '#keffiyeh'] : base === 'mass' ? ['#head', '#body', '#crown', '#witchhat', '#emohair', '#pumpkin', '#kippah', '#keffiyeh'] : ['#head', '#headstack', '#crown', '#witchhat', '#emohair', '#pumpkin', '#kippah', '#keffiyeh'];
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    for (const id of ids) { const el = document.querySelector('#cat ' + id); if (!el || getComputedStyle(el).display === 'none') continue; const q = el.getBoundingClientRect(); if (q.width === 0) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
    // a whole-pet frame centres on the head-and-body mass, not the box: the frog's feet stick out one way and his
    // head leans the other, so the box's centre left him off centre (operator, 2026-09-25)
    let mx = (l + r) / 2;
    if (base !== 'head') { const parts = ['#head', '#body'].map((id) => document.querySelector('#cat ' + id)?.getBoundingClientRect()).filter((q) => q && q.width > 0); if (parts.length) mx = (Math.min(...parts.map((q) => q.left)) + Math.max(...parts.map((q) => q.right))) / 2; }
    // on the stage, everything is relative to the stage's own box (the screenshot is of that box)
    const st = document.querySelector('.pfplab .stage')?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1024, height: 1024 };
    return { l: l - st.left, t: t - st.top, r: r - st.left, b: b - st.top, mx: mx - st.left, sw: st.width, sh: st.height };
  }, base);
  const png = onStage
    ? await (await src.$('.pfplab .stage')).screenshot({ encoding: 'base64', omitBackground: !room })
    : await src.screenshot({ omitBackground: true, encoding: 'base64' });
  return { box, png };
});

const index = {};
for (const c of Object.values(CHARS)) {
  if (ONLY && ONLY !== c.key) continue;
  mkdirSync(ROOT + c.key, { recursive: true });
  const [main, alt] = c.frames;
  const sets = SETS(c);
  index[c.key] = { label: c.label, frames: [...sets.map((s) => ({ key: s.key, title: s.title })), { key: alt.key, title: alt.title }], looks: [] };
  const seen = new Set();
  // every look, in page order: the main framing's groups, then the second framing
  const todo = [...sets.flatMap((s) => s.looks.map((look) => ({ look, group: s.key, f: main, g: 0 }))), ...ALT(c).map((look) => ({ look, group: alt.key, f: alt, g: 1 }))];
  for (const t of todo) { const k = nameOf(t.look) + (t.f.key ? '-' + t.f.key : ''); if (seen.has(k)) throw new Error(`${c.key}: ${k} twice`); seen.add(k); t.name = k; }
  const counter = [0, 0];
  for (const { look, group, f, g, name } of todo) {
    const i = counter[g]++;   // (counted before any skip, so a trial of one group gets the backgrounds the full run gives it)
    if (ONLY_ACTS || (ONLY_GROUPS && !ONLY_GROUPS.includes(group))) continue;
    f.space ??= {};   // the frame, measured once per capture space ('card' or 'stage') on the framing's first look in it
    const [mood, crown, costume, forced] = look;
    const bg = forced ? BGKEY[forced] : bgFor(i, g, c.key); if (!bg) throw new Error(`no background ${forced}`);
    const room = bg.length === 4 ? bg : null;
    const onStage = !!room || !!c.stage;
    const q = `card=${mood}&character=${c.key}${crown ? '&crown=1' : ''}${costume ? '&costume=' + costume : ''}`;
    const { box, png } = await capture(`${c.key} ${name}`, q, room, onStage, f.base);
    // ONE frame per framing, measured on its first (plain) look: a square `zoom` times the head's size, centred on
    // the head and slid down `shift` so the shoulders show. Measuring every look framed Sahur's mummy and zombie on
    // the whole log (those pieces live inside his #head group) while the plain looks stayed close; a fixed frame keeps
    // the whole set the same size. A hat, a crown or the pumpkin only slides the frame up until it fits.
    const sp = onStage ? 'stage' : 'card';
    if (!f.space[sp]) {
      // (its own render of the plain, content pet in that space, so a trial of one group measures the same frame)
      const plain = await capture(`${c.key} ${sp} frame`, `card=content&character=${c.key}`, null, onStage, f.base);
      const hw = plain.box.r - plain.box.l, hh = plain.box.b - plain.box.t; const side = Math.max(hw, hh) * f.zoom;
      f.space[sp] = { side, cx: plain.box.mx, cy: (plain.box.t + plain.box.b) / 2 + side * (f.slide ? f.shift : 0.5 - f.anchor) };
    }
    let { side } = f.space[sp]; const { cx } = f.space[sp]; let cy = f.space[sp].cy;
    if (f.slide) { const head = side * 0.05; if (box.t < cy - side / 2 + head) cy = box.t + side / 2 - head; }
    if (f.fit && box.b - box.t > side * 0.9) { side = (box.b - box.t) / 0.9; cy = (box.t + box.b) / 2; }
    await thrice('framing', () => frame(png, { x0: cx - side / 2, y0: cy - side / 2, side, srcW: onStage ? box.sw : 1024, srcH: onStage ? box.sh : 1024, room, bg, glow: 'bottom:-20%;height:60%;background:radial-gradient(closest-side, rgba(0,0,0,.35), transparent 70%)' }, `${ROOT}${c.key}/${name}`));
    index[c.key].looks.push({ file: name, label: labelOf(look, bg), bg: bg[0], frame: group });
    console.log(c.key, name, `${f.base} ${Math.round(box.r - box.l)}x${Math.round(box.b - box.t)} frame ${Math.round(side)} bg ${bg[0]}`);
  }
  // ---- the pets in action: the director's own animation on the real stage, frozen at the chosen millisecond (the lab
  // pauses every animation and clears every pending timer at that instant, so nothing moves before the shot)
  const acts = ONLY_GROUPS && !ONLY_GROUPS.includes('act') ? [] : ACTS[c.key] ?? [];
  if (!acts.length) continue;
  index[c.key].frames.push({ key: 'act', title: 'In action' });
  // the pet's real silhouette at rest, in stage px: the alpha box of a transparent render (#figure's box counts parts
  // drawn at opacity 0, the halo, the z's, the tear, and came out twice the pet's height)
  await thrice(`${c.key} at rest`, () => openStage(`character=${c.key}&card=content`, null, 2));
  const bareRest = await (await src.$('.pfplab .stage')).screenshot({ encoding: 'base64', omitBackground: true });
  const restBody = await src.evaluate(() => { const st = document.querySelector('.pfplab .stage').getBoundingClientRect(); const q = document.querySelector('.catbody').getBoundingClientRect(); return (q.left + q.right) / 2 - st.left; });
  await out.setContent(`<canvas id="c"></canvas><img id="i" src="data:image/png;base64,${bareRest}">`, { waitUntil: 'load' });
  const sil = await out.evaluate(() => {
    const img = document.getElementById('i'); const cv = document.getElementById('c'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, cv.width, cv.height).data;
    let l = 1e9, t = 1e9, r = -1, b = -1;
    // (a faint glow runs along the stage's top rows: skipped)
    for (let y = 8; y < cv.height; y++) for (let xx = 0; xx < cv.width; xx++) if (d[(y * cv.width + xx) * 4 + 3] > 90) { if (xx < l) l = xx; if (xx > r) r = xx; if (y < t) t = y; if (y > b) b = y; }
    return { l: l / 2, t: t / 2, r: r / 2, b: b / 2 };   // dpr 2 -> stage px
  });
  console.log(c.key, 'silhouette', JSON.stringify(sil), 'height', Math.round(sil.b - sil.t));
  const seenA = new Set();
  for (const [action, at, crown, costume, bgKey, label, zoom = ZOOM[c.key], dx = 0] of acts) {
    const name = `act-${action}-${at}${crown ? '-crown' : ''}${costume ? '-' + wornOf(costume).join('-') : ''}`;
    if (seenA.has(name)) throw new Error(`${c.key} act: ${name} twice`); seenA.add(name);
    const bg = BGKEY[bgKey]; if (!bg) throw new Error(`no background ${bgKey}`);
    const room = bg.length === 4 ? bg : null;
    const { rest, now, png } = await thrice(`${c.key} ${name}`, async () => {
      await openStage(`character=${c.key}&card=content&action=${action}${crown ? '&crown=1' : ''}${costume ? '&costume=' + costume : ''}`, room);
      const rel = () => src.evaluate(() => {
        const st = document.querySelector('.pfplab .stage').getBoundingClientRect();
        const r = (el) => { const q = el.getBoundingClientRect(); return { l: q.left - st.left, t: q.top - st.top, r: q.right - st.left, b: q.bottom - st.top }; };
        return { body: r(document.querySelector('.catbody')), sw: st.width, sh: st.height };
      });
      const rest = await rel();
      await src.evaluate((ms) => window.__shoot(ms), at);
      const now = await rel();
      const png = await (await src.$('.pfplab .stage')).screenshot({ encoding: 'base64', omitBackground: !room });
      return { rest, now, png };
    });
    // the frame: `zoom` rest-figure heights (never taller than the stage), on the pet where it is at that instant,
    // its bottom a little under the floor it stands on
    const side = Math.min(rest.sh, (sil.b - sil.t) * zoom);
    let x0 = (sil.l + sil.r) / 2 + ((now.body.l + now.body.r) / 2 - restBody) + dx * side - side / 2;
    let y0 = sil.b + side * 0.07 - side;
    x0 = Math.max(0, Math.min(rest.sw - side, x0)); y0 = Math.max(0, Math.min(rest.sh - side, y0));
    await thrice('framing', () => frame(png, { x0, y0, side, srcW: rest.sw, srcH: rest.sh, room, bg, glow: 'bottom:-18%;height:50%;background:radial-gradient(closest-side, rgba(0,0,0,.3), transparent 70%)' }, `${ROOT}${c.key}/${name}`));
    const parts = [label, ...wornOf(costume).map((w) => WORDS[w] ?? w)]; if (crown) parts.push('crowned'); if (room) parts.push(room[3]);
    index[c.key].looks.push({ file: name, label: parts.join(' · '), bg: bg[0], frame: 'act' });
    console.log(c.key, name, `frame ${Math.round(side)} at x ${Math.round(x0)} bg ${bg[0]}`);
  }
}
await browser.close();
if (TRIAL) {
  mkdirSync(FINAL, { recursive: true });
  cpSync(ROOT, FINAL, { recursive: true });
  writeFileSync(FINAL + 'trial.json', JSON.stringify(index, null, 1));
  rmSync(ROOT, { recursive: true, force: true });
  console.log('trial ->', FINAL);
} else {
  // the index: rewritten whole, or merged over the existing one when only one pet or only the action shots were rendered
  let merged = index;
  if (ONLY || ONLY_ACTS || ONLY_GROUPS) {
    let prev = {}; try { prev = JSON.parse(readFileSync(FINAL + 'index.json', 'utf8')); } catch { /* no index yet */ }
    merged = { ...prev };
    for (const [k, v] of Object.entries(index)) {
      if (!(ONLY_ACTS || ONLY_GROUPS) || !prev[k]) { merged[k] = v; continue; }
      // some groups only: keep the pet's other groups, replace the ones rendered, in the page's order
      const done = new Set(v.looks.map((l) => l.frame));
      const frames = [...v.frames.filter((f) => f.key !== 'act' || done.has('act')), ...prev[k].frames.filter((f) => !v.frames.some((x) => x.key === f.key))];
      const looks = frames.flatMap((f) => (done.has(f.key) ? v.looks : prev[k].looks).filter((l) => (l.frame ?? '') === f.key));
      merged[k] = { ...prev[k], frames: frames.filter((f) => looks.some((l) => (l.frame ?? '') === f.key)), looks };
    }
  }
  merged.version = new Date().toISOString().replace(/\D/g, '').slice(0, 12);   // on every picture URL (Pfps.tsx): a new generation never mixes with a cached old one
  mkdirSync(FINAL, { recursive: true });
  // a pet rendered whole replaces its folder (a look that is gone must not stay on the site); a part replaces its files
  for (const k of Object.keys(index)) {
    if (!(ONLY_ACTS || ONLY_GROUPS)) { rmSync(FINAL + k, { recursive: true, force: true }); continue; }
    const keep = new Set(merged[k].looks.map((l) => l.file));
    if (existsSync(FINAL + k)) for (const file of readdirSync(FINAL + k)) { const look = file.replace(/(-t)?\.(png|webp)$/, ''); if (!keep.has(look)) rmSync(FINAL + k + '/' + file); }
  }
  writeFileSync(ROOT + 'index.json', JSON.stringify(merged, null, 1));
  cpSync(ROOT, FINAL, { recursive: true });
  rmSync(ROOT, { recursive: true, force: true });
  console.log('done ->', FINAL);
}
