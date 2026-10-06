// Emotown's small avatars (2026-09-26): every pet's head at 160 px, for chat rows, DMs, notifications and follower
// lists (a 350 KB full-figure portrait squeezed to 32 px is a smudge, and a phone's data wasted).
//   node tools/social-avatars.mjs          (dev server on 5199: cd apps/web && npx vite --port 5199 --strictPort)
// Writes apps/web/public/social/av/<portrait dir>/<costume/><mood>[-crown].webp, the same tree as public/nft.
// EVERY OUTFIT NEEDS ITS SET FOR EVERY PET (social/ui.tsx avatarSrc asks for <outfit>/<mood>): the bisht's was missing for
// the cat, the frok and Sahur until 2026-10-02, and every such pet in a bisht had a blank picture.
//
// Rendered from the card route (/nft?card=…), the same drawing the portraits come from, and framed on the pet's own
// EYES: one square per character, measured on its plain look (how big the head is, and where the head's middle sits
// from the eyes), then placed on each render's eyes. So a ghost floating higher, or a pet in a costume, is framed
// the same way; a tall hat or a crown slides the frame up until it fits (a quarter of the frame at most).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = 'apps/web/public/social/av';
const SIZE = 160;
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const PETS = {
  cat: { dir: '', q: '', zoom: 1.34, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'bisht'] },
  frog: { dir: 'inversebrah/', q: '&character=frog', zoom: 1.42, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'emohair', 'bisht'] },
  // his #head is most of the log (the rig moves him as one piece), so his frame is measured off his eyes instead
  sahur: { dir: 'sahur/', q: '&character=sahur', zoom: 1.5, eyeZoom: 2.5, eyeDrop: 0.12, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'emohair', 'bisht'] },
  // Thiccums, not launched: only when asked for by name (`node tools/social-avatars.mjs thiccums`, BASE = his local dev
  // server, tools/thiccums-dev.mjs), from his lab's card view, and into thiccumsgotchi/social-av/, never public/
  // (tools/thiccums-launch.mjs copies them in at launch)
  thiccums: { dir: '', route: '/thiccums', q: '', out: 'thiccumsgotchi/social-av', only: true, head: ['#head > path'], frameOnHead: true, zoom: 1.34, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'emohair', 'bisht'] },
  // the r3tard: only when asked for by name (`BASE=<dev server> node tools/social-avatars.mjs r3tards`), from his lab's
  // card view (dev only). He is a face on a stick: the frame is his face (the lips' fill and the eyes' lines)
  r3tards: { dir: 'r3tards/', route: '/r3tards', q: '', out: process.env.AV_OUT, only: true, head: ['#head > path', '#face'], frameOnHead: true, zoom: 1.16, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'emohair', 'bisht'] },
  // Emonadgotchi: only by name (`BASE=<a dev build> node tools/social-avatars.mjs emonad`), from his card view (dev only),
  // staged in emonadgotchi/public/social/av/ until his launch. His face is small under a big mop: the frame is as wide as
  // his hair (#head, measured on the plain look) and set on his FACE, a little below the middle, so the mop shows round it.
  // No emohair set: his own hair is the look, the item is not drawn on him.
  emonad: { dir: 'emonad/', route: '/emonadgotchi', q: '', out: 'emonadgotchi/public/social/av', only: true, head: ['#head'], faceFrame: { face: ['#face'], up: 0.08 }, zoom: 1.04, costumes: ['', 'witch', 'pumpkin', 'mummy', 'zombie', 'bisht'] },
};
const only = process.argv[2];
// COSTUMES=bisht,witch renders only those sets ('plain' for the bare one); AV_OUT=<dir> writes there, not into public/
// (a dev server reloads every open page when public/ changes: render to a scratch folder and copy)
const SETS = process.env.COSTUMES ? process.env.COSTUMES.split(',').map((c) => (c === 'plain' ? '' : c)) : null;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
const load = async (url) => { await page.goto(url, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.__card_ready, { timeout: 15000 }); await new Promise((r) => setTimeout(r, 250)); };
const box = (sels) => page.evaluate((sels) => {
  const rs = sels.map((s) => document.querySelector('#cat ' + s)).filter(Boolean).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!rs.length) return null;
  return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
}, sels);
const visibleTop = () => page.evaluate(() => {
  let top = Infinity;
  for (const s of ['#crown', '#witchhat', '#pumpkin', '#emohair', '#halo', '#zombieskull']) {
    const e = document.querySelector('#cat ' + s); if (!e) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    const r = e.getBoundingClientRect(); if (r.width > 0) top = Math.min(top, r.top);
  }
  return top;
});

let n = 0;
for (const [char, P] of Object.entries(PETS)) {
  if (only ? only !== char : P.only) continue;
  // the frame, from the plain look: the head's size, and its middle relative to the eyes
  const route = P.route ?? '/nft'; const out = process.env.AV_OUT ?? P.out ?? OUT;
  await load(`${BASE}${route}?card=content${P.q}`);
  const head = await box(P.head ?? ['#head', '#headstack']);   // (his: the head's own outline; the eyelid covers make #head's box taller than the head)
  const eyes = await box(['#eyeL', '#eyeR']);
  const size = P.faceFrame ? (head.r - head.l) * P.zoom : P.eyeZoom ? (eyes.r - eyes.l) * P.eyeZoom : Math.max(head.r - head.l, head.b - head.t) * P.zoom;
  const off = P.eyeZoom ? { x: 0, y: size * P.eyeDrop } : { x: (head.l + head.r) / 2 - (eyes.l + eyes.r) / 2, y: (head.t + head.b) / 2 - (eyes.t + eyes.b) / 2 + size * 0.06 };
  for (const c of P.costumes) for (const mood of MOODS) for (const crown of [false, true]) {
    if (SETS && !SETS.includes(c)) continue;
    await load(`${BASE}${route}?card=${mood}${crown ? '&crown=1' : ''}${c ? '&costume=' + c : ''}${P.q}`);
    const e = await box(['#eyeL', '#eyeR']) ?? eyes;
    let x = (e.l + e.r) / 2 + off.x - size / 2, y = (e.t + e.b) / 2 + off.y - size / 2;
    if (P.frameOnHead) {   // his eye groups carry the lid covers, whose box moves with the mood: frame on the head's outline
      const h = await box(P.head) ?? head;
      x = (h.l + h.r) / 2 - size / 2; y = (h.t + h.b) / 2 + size * 0.04 - size / 2;
    }
    let shot = size;
    if (P.faceFrame) {   // set on the face, a little below the middle (the hair above it)
      const f = await box(P.faceFrame.face);
      if (f) { x = (f.l + f.r) / 2 - size / 2; y = (f.t + f.b) / 2 - P.faceFrame.up * size - size / 2; }
    }
    const top = await visibleTop();
    if (P.faceFrame && top < y + size * 0.03) {
      // a crown or a hat sits high on his mop: sliding the frame up to it would leave his face behind, so the frame
      // grows upward from the same bottom edge (the face stays where it was, smaller) until the top fits
      const bottom = y + size; const cx = x + size / 2;
      shot = Math.min(size * 1.6, bottom - (top - size * 0.03)); y = bottom - shot; x = cx - shot / 2;
    } else if (top < y + size * 0.03) y = Math.max(y - size * 0.25, top - size * 0.03);
    // never off the card (the page past its edge screenshots black)
    x = Math.max(0, Math.min(1024 - shot, x)); y = Math.max(0, Math.min(1024 - shot, y));
    const dir = `${out}/${P.dir}${c ? c + '/' : ''}`; fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}${mood}${crown ? '-crown' : ''}.webp`, type: 'webp', quality: 82, clip: { x, y, width: shot, height: shot, scale: SIZE / shot } });
    n++;
  }
  console.log(char, 'done', n);
}
await browser.close();
console.log(n, 'avatars in', OUT);
