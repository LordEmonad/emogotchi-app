// The pictures Emonadgotchi's mint page shows (/emonadgotchi: EmonadMint.tsx), into apps/web/src/emonadgotchi/mint/*.webp
// (bundled with his page's chunk alone: nothing here goes in public/):
//   mood-<mood>.webp   the nine wallet moods (the happy one crowned), from his lab's card view (/emonadgotchi?card=)
//   look-<look>.webp   him in the shop's items, from the same card view
//   shot-<name>.webp   prints of his room from the Emonadgotchi trailer's own takes (tools/trailer/eg-takes.mjs, in
//                      trailer/emonad/raw), each at a moment read off the take's own sound cues: feed, play, wash, sleep,
//                      die, revive, guitar, darbuka, falcon, selfie. The whole room is the picture, so he is always whole.
//   face.webp          his face for the last card's ring: the hero take at 2.6 s, framed on his measured head box
//                      (trailer/emonad/boxes.json, tools/trailer/eg-boxes.mjs), as the trailer's end card frames it.
//   node tools/eg-mint-art.mjs [--base=http://127.0.0.1:5422] [--only=moods,looks,shots,face] [--sheet=<png>]
// The card view needs a dev-mode build of the site served (a frozen one: see CLAUDE.md "Emonadgotchi"); the shots and the
// face need the trailer's takes on disk (they are gitignored: RAW=trailer/emonad/raw BASE=… node tools/trailer/shots.mjs eg-…).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { resolve } from 'node:path';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5422'); const ONLY = arg('only', '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const OUT = resolve('apps/web/src/emonadgotchi/mint'); fs.mkdirSync(OUT, { recursive: true });
const RAW = resolve(process.env.RAW ?? 'trailer/emonad/raw');
const BOXES = resolve(process.env.BOXES ?? 'trailer/emonad/boxes.json');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const made = [];

// one page that turns any picture into a webp of a given crop and size (canvas: no PIL, no ffmpeg)
const cv = await browser.newPage();
await cv.setContent('<canvas id="c"></canvas>');
/** `src` a data URL or a file's bytes (base64 png); crop [x, y, w, h] in its pixels; out `ow` wide (height kept to the crop's ratio) */
async function webp(src, crop, ow, file, q = 0.84) {
  const data = await cv.evaluate(async (src, crop, ow, q) => {
    const im = new Image(); im.src = src; await im.decode();
    const [x, y, w, h] = crop ?? [0, 0, im.width, im.height];
    const c = document.getElementById('c'); c.width = ow; c.height = Math.round(ow * h / w);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', q);
  }, src, crop, ow, q);
  fs.writeFileSync(`${OUT}/${file}.webp`, Buffer.from(data.split(',')[1], 'base64'));
  made.push(file);
}

// ---- the card view: a 1024 square of his room, him whole in it (grave, poop, thought cloud and hearts included)
const card = await browser.newPage(); await card.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
async function shoot(query) {
  await card.bringToFront();   // a background tab never paints: its ready flag (set on a frame) would never come
  await card.goto(`${BASE}/emonadgotchi?${query}`, { waitUntil: 'networkidle0' });
  await card.waitForFunction(() => window.__card_ready === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
  return 'data:image/png;base64,' + await (await card.$('.nft-art')).screenshot({ encoding: 'base64' });
}
// the square kept: everything any mood draws (the thought cloud's top at 120, the grave's foot at 950), centred on him
const CARD_CROP = [72, 96, 880, 880];
if (want('moods')) {
  for (const m of ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead']) await webp(await shoot(`card=${m}${m === 'happy' ? '&crown=1' : ''}`), CARD_CROP, 440, `mood-${m}`);
  console.log('moods');
}
if (want('looks')) {
  const LOOKS = {
    witch: 'costume=witch', pumpkin: 'costume=pumpkin', mummy: 'costume=mummy', zombie: 'costume=zombie',
    emofit: 'costume=emofit,beanie,piercings', kippah: 'costume=kippah,starofdavid', habibi: 'costume=bisht,keffiyeh',
    gold: 'costume=emofit,beanie,piercings&crown=1',
  };
  // (a look has no props round him: taller and closer, 3:4, every hat and crown inside)
  for (const [k, q] of Object.entries(LOOKS)) await webp(await shoot(`card=content&${q}`), [192, 130, 640, 853], 420, `look-${k}`);
  console.log('looks');
}

// ---- the trailer's takes: a frame of a take at a moment (ms from its first frame)
const meta = (take) => JSON.parse(fs.readFileSync(`${RAW}/${take}/meta.json`, 'utf8'));
/** the time of a take's `n`th cue of that name (ms), or null */
const cue = (take, name, n = 0) => meta(take).cues.filter((c) => c.name === name)[n]?.t ?? null;
function frameFile(take, ms) {
  const m = meta(take); const f = Math.max(0, Math.min(m.frames - 1, Math.round((ms * (m.fps ?? 60)) / 1000)));
  return `${RAW}/${take}/f-${String(f).padStart(5, '0')}.png`;
}
const png = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
// the capture's own rounded border is kept out (compose.js cover(): 1.2% of the width each side)
const roomCrop = (w, h) => { const i = Math.round(w * 0.012); return [i, i, w - 2 * i, h - 2 * i]; };
const SIZE = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
/** [name, take, moment in ms] */
const at = (take, name, n, plus, fallback) => { const t = cue(take, name, n); return (t ?? fallback) + plus; };
const SHOTS = () => [
  ['feed', 'eg-feed', at('eg-feed', 'bite', 0, 120, 3400)],                                  // eating from the bowl in his hands
  ['play', 'eg-play', at('eg-play', 'kick', 0, 60, 6300)],                                   // the kick
  ['wash', 'eg-wash', at('eg-wash', 'splash', 0, 900, 2300)],                                // in the tub
  ['sleep', 'eg-sleep', at('eg-sleep', 'voice.yawn', 0, 3000, 800)],                         // asleep, the z's
  ['die', 'eg-die', at('eg-die', 'die', 0, 3200, 300)],                                      // the ghost over his grave
  ['revive', 'eg-revive', at('eg-revive', 'revive', 0, 2100, 300)],                          // back, arms up in a Y
  ['guitar', 'eg-guitar', at('eg-guitar', 'guitar.down', 2, 40, 6000)],                      // mid riff
  ['darbuka', 'eg-darbuka', at('eg-darbuka', 'drum.dum', 1, 30, 3500)],                      // a stroke on the drum
  ['falcon', 'eg-falcon', at('eg-falcon', 'pat', 0, 700, 2200)],                             // the falcon on his fist
  ['selfie', 'eg-selfie', at('eg-selfie', 'shutter', 1, 450, 4000)],                         // the phone up (after the flash, not on it)
];
if (want('shots')) {
  for (const [name, take, ms] of SHOTS()) {
    const f = frameFile(take, ms); const [w, h] = SIZE(f);
    await webp(png(f), roomCrop(w, h), 900, `shot-${name}`);
    console.log('shot', name, take, Math.round(ms), 'ms');
  }
}
if (want('face')) {
  // the hero take at 2.6 s, his head (hair and all) framed square with a little air, the way the trailer's end card does
  const take = 'eg-hero', ms = 2600;
  const f = frameFile(take, ms); const [w, h] = SIZE(f);
  const heads = JSON.parse(fs.readFileSync(BOXES, 'utf8'))[take].head;
  let best = heads[0]; for (const b of heads) if (Math.abs(b[0] - ms) < Math.abs(best[0] - ms)) best = b;
  const [, x0, y0, x1, y1] = best;
  const cx = (x0 + x1) / 2 * w, cy = (y0 + y1) / 2 * h + 0.01 * h;
  const side = Math.max((x1 - x0) * w, (y1 - y0) * h) * 1.16;
  await webp(png(f), [cx - side / 2, cy - side / 2, side, side], 480, 'face');
  console.log('face');
}

// ---- a contact sheet of what was made, to look at
const sheet = arg('sheet', '');
if (sheet) {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).sort();
  const p = await browser.newPage(); await p.setViewport({ width: 1600, height: 1000 });
  await p.setContent(`<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;font:12px monospace;color:#ccc">${files.map((f) => `<figure style="margin:0;width:${f.startsWith('shot') ? 380 : 186}px"><img style="width:100%;display:block" src="data:image/webp;base64,${fs.readFileSync(`${OUT}/${f}`).toString('base64')}"><figcaption>${f}</figcaption></figure>`).join('')}</body>`);
  await new Promise((r) => setTimeout(r, 500));
  await p.screenshot({ path: sheet, fullPage: true });
  console.log('sheet ->', sheet);
}
console.log(made.length, 'pictures ->', OUT);
await browser.close(); process.exit(0);
