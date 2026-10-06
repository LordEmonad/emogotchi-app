// The emo pack's promo pictures (the pack is DEV only; nothing here is on the site): the five pets in the whole pack,
// guitars in hand, in the emo bedroom at night: the band from the third trailer, put together from the same cut-outs
// (each pet filmed alone with the room hidden, its alpha kept: tools/trailer/emo3-takes.mjs) over the empty room, laid
// out as the trailer lays it out (tools/trailer/emo3-timeline.mjs band()), at one chosen moment of the riff.
//   node tools/emo-promo.mjs [--at=1.2]     (needs trailer/emo/raw's emo3-* takes and trailer/emo/band3.json)
//   -> emopack/brand/emo-pack.png        1600x900, no words: the pack page's hero and the shop banner's picture
//      emopack/brand/emo-pack-og.png     1200x630, the link card: the words on the left, the band on the right
// Words: drafts the operator has not signed off. No pet is ever cut by an edge or under a word (each is checked against
// its measured box; the run fails if one is).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = fileURLToPath(new URL('..', import.meta.url));
const RAW = root + 'trailer/emo/raw/';
const OUT = root + 'emopack/brand/';
mkdirSync(OUT, { recursive: true });
const AT = Number((process.argv.find((a) => a.startsWith('--at=')) ?? '--at=1.2').slice(5));   // seconds into each pet's riff
const BAND = JSON.parse(readFileSync(root + 'trailer/emo/band3.json', 'utf8'));
const PETS = ['frog', 'cat', 'thicc', 'sahur', 'r3'];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const FONT = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';

/** Each pet as the trailer places it: its frame at the moment, where its middle and feet are while it plays, its spot. */
const members = (slot, rows) => {
  const any = BAND['emo3-band-cat'];
  const floor = median(PETS.map((p) => median(BAND[`emo3-band-${p}`].boxes.map((b) => b[4]))));
  return PETS.map((p) => {
    const m = BAND[`emo3-band-${p}`], fps = m.fps;
    const riffF = (m.riffMs / 1000) * fps, endF = ((m.endMs ?? m.riffMs + 5720) / 1000) * fps;
    const playing = m.boxes.filter((b) => b[0] >= riffF && b[0] <= endF);
    const ax = median(playing.map((b) => (b[1] + b[3]) / 2)), ay = median(playing.map((b) => b[4]));
    // the frame at the moment, snapped to a measured one (every third), and its box
    const want = Math.round(riffF + AT * fps);
    const box = m.boxes.reduce((best, b) => (Math.abs(b[0] - want) < Math.abs(best[0] - want) ? b : best));
    const sl = slot[p], s = rows[sl.row].s, x = sl.fx * any.w, y = floor + rows[sl.row].dy * any.h;
    const z = sl.row ? (p === 'sahur' ? 0 : 1) : { frog: 2, cat: 3, thicc: 4 }[p];
    const placed = [x + (box[1] - ax) * s, y + (box[2] - ay) * s, x + (box[3] - ax) * s, y + (box[4] - ay) * s];
    return { p, file: `${RAW}emo3-band-${p}/f-${String(box[0]).padStart(5, '0')}.png`, ax, ay, x, y, s, left: p === 'sahur' ? 1100 : 0, z, placed };
  }).sort((a, b) => a.z - b.z);
};

const LAYOUTS = {
  // the trailer's own: two rows, the tall two at the back, the cat in the middle at the front
  hero: { W: 1600, H: 900, slot: { frog: { fx: 0.2, row: 0 }, cat: { fx: 0.47, row: 0 }, thicc: { fx: 0.76, row: 0 }, sahur: { fx: 0.335, row: 1 }, r3: { fx: 0.615, row: 1 } },
    rows: [{ s: 0.85, dy: 0.012 }, { s: 0.72, dy: -0.065 }], fill: 0.82, at: [0.5, 0.5] },
  // the link card: the band tighter and to the right, the room's left (the bed, the heart poster) under the words
  og: { W: 1200, H: 630, slot: { frog: { fx: 0.53, row: 0 }, cat: { fx: 0.655, row: 0 }, thicc: { fx: 0.785, row: 0 }, sahur: { fx: 0.59, row: 1 }, r3: { fx: 0.722, row: 1 } },
    rows: [{ s: 0.6, dy: 0.012 }, { s: 0.51, dy: -0.05 }], fill: 0.84, at: [0.665, 0.52], words: true },
};

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
for (const [name, L] of Object.entries(LAYOUTS)) {
  const mem = members(L.slot, L.rows);
  const u = mem.map((m) => m.placed).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const PW = BAND['emo3-band-cat'].w, PH = BAND['emo3-band-cat'].h;
  // the room covers the card; the band's box is scaled to `fill` of the card's height and centred at `at`
  let P = Math.max(L.W / PW, L.H / PH, ((u[3] - u[1]) > 0 ? 0 : 0));
  P = Math.max(P, 0);
  const want = (L.H * L.fill) / (u[3] - u[1]);
  P = Math.max(P, Math.min(want, 3));
  let ox = L.at[0] * L.W - ((u[0] + u[2]) / 2) * P, oy = L.at[1] * L.H - ((u[1] + u[3]) / 2) * P;
  ox = Math.min(0, Math.max(L.W - PW * P, ox)); oy = Math.min(0, Math.max(L.H - PH * P, oy));
  const box = [ox + u[0] * P, oy + u[1] * P, ox + u[2] * P, oy + u[3] * P];
  const M = 10;
  if (box[0] < M || box[1] < M || box[2] > L.W - M || box[3] > L.H - M) throw new Error(`${name}: a pet would be cut: ${box.map((v) => v.toFixed(0))} in ${L.W}x${L.H}`);
  const html = `<!doctype html><html><head><style>@font-face { font-family: SG; src: url("file://${FONT}") format("woff2"); font-weight: 300 700; }
body { margin: 0; background: #000; } canvas { display: block; }</style></head><body><canvas id="c" width="${L.W}" height="${L.H}"></canvas></body></html>`;
  writeFileSync(OUT + '.compose.html', html);
  await page.setViewport({ width: L.W, height: L.H, deviceScaleFactor: 1 });
  await page.goto('file://' + OUT + '.compose.html');
  const res = await page.evaluate(async ({ L, mem, P, ox, oy, plate, box }) => {
    const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('no ' + src)); i.src = 'file://' + src; });
    await document.fonts.load('700 40px SG');
    const c = document.getElementById('c'), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(await img(plate), ox, oy, (await img(plate)).width * P, (await img(plate)).height * P);
    const TOP = 12;   // (the top rows of a cut-out are left out: a faint bar of the room's: emo3-band.py's TOP)
    for (const m of mem) {
      const i = await img(m.file), Lx = m.left;
      x.drawImage(i, Lx, TOP, i.width - Lx, i.height - TOP, ox + (m.x + (Lx - m.ax) * m.s) * P, oy + (m.y + (TOP - m.ay) * m.s) * P, (i.width - Lx) * m.s * P, (i.height - TOP) * m.s * P);
    }
    // a soft vignette, as the room has
    const v = x.createRadialGradient(L.W / 2, L.H * 0.46, Math.min(L.W, L.H) * 0.35, L.W / 2, L.H * 0.46, Math.max(L.W, L.H) * 0.75);
    v.addColorStop(0, 'rgba(8,3,12,0)'); v.addColorStop(1, 'rgba(8,3,12,.55)');
    x.fillStyle = v; x.fillRect(0, 0, L.W, L.H);
    let words = null;
    if (L.words) {
      // the words' side darkened, never over a pet: the gradient stops before the band's box begins
      const edge = box[0] - 10;
      const g = x.createLinearGradient(0, 0, edge, 0);
      g.addColorStop(0, 'rgba(10,4,14,.9)'); g.addColorStop(0.72, 'rgba(10,4,14,.72)'); g.addColorStop(1, 'rgba(10,4,14,0)');
      x.fillStyle = g; x.fillRect(0, 0, edge, L.H);
      const left = 58;
      const zine = (t, px, py, size, fill, shadow) => {
        x.font = `700 ${size}px SG`; x.textBaseline = 'alphabetic';
        x.fillStyle = shadow; x.fillText(t, px + size * 0.055, py + size * 0.055);
        x.fillStyle = fill; x.fillText(t, px, py);
        return x.measureText(t).width;
      };
      // a broken heart over THE, the pack's mark
      x.font = '700 30px SG'; x.letterSpacing = '6px'; x.fillStyle = '#FF5C9A'; x.fillText('THE', left + 2, 176);
      x.letterSpacing = '-3px';
      const w1 = zine('EMO', left, 270, 112, '#FFFFFF', '#E84D7F');
      const w2 = zine('PACK', left, 370, 112, '#FFFFFF', '#E84D7F');
      x.letterSpacing = '0px';
      x.font = '600 27px SG'; x.fillStyle = '#F2E4F4';
      x.fillText('Seven items for every pet.', left + 2, 432);
      x.fillText('Free for $EMO holders.', left + 2, 468);
      const w3 = Math.max(x.measureText('Seven items for every pet.').width, x.measureText('Free for $EMO holders.').width) + 2;
      x.font = '600 19px SG'; x.letterSpacing = '2px'; x.fillStyle = '#B9A3C6';
      x.fillText('EMOGOTCHI  ·  COMING SOON', left + 2, 552);
      x.letterSpacing = '0px';
      words = [left, 140, left + Math.max(w1, w2, w3), 560];
    }
    return { words };
  }, { L, mem, P, ox, oy, plate: `${RAW}emo3-plate/f-00030.png`, box });
  if (res.words && res.words[2] > box[0]) throw new Error(`${name}: the words (to x ${res.words[2].toFixed(0)}) would run into the band (from x ${box[0].toFixed(0)})`);
  const file = name === 'hero' ? 'emo-pack.png' : 'emo-pack-og.png';
  await (await page.$('#c')).screenshot({ path: OUT + file });
  console.log(`  ${file}  ${L.W}x${L.H}  band box ${box.map((v) => v.toFixed(0)).join(',')}${res.words ? `  words to x ${res.words[2].toFixed(0)}` : ''}`);
}
await browser.close();
