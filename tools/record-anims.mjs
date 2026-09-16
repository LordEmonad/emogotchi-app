/**
 * Record the cat's real animations once, so the share card can replay them.
 *
 * The rig is SVG driven by the browser's animation engine, and nothing can rasterise that frame by
 * frame at speed inside a visitor's browser. The cat looks the same for everyone though, so the clips
 * only have to be made once.
 *
 * Headless Chrome only manages about seven screenshots a second, which is nowhere near smooth. The rig
 * has no frame loop of its own: every motion is a Web Animation and every gap is a setTimeout. So the
 * whole world is slowed to a ninth of speed, which turns those seven screenshots a second into sixty
 * frames of animation a second, and the timestamps are scaled back on the way out. Nothing is skipped
 * and nothing is faked: it is the real choreography, watched in slow motion.
 *
 * The frames are then played back at true speed in the same browser and recorded to MP4, because at
 * 60fps a sprite sheet would be tens of megabytes and a video of flat vector art is a fraction of that.
 *
 *   node tools/record-anims.mjs        (dev server on 5173)
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';

const RAW = '/tmp/emo-anim';
const OUT = 'apps/web/public/anim';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const SIZE = 500;                                   // exactly the box the share card draws the cat into
const FPS = 60;
const RATE = Number(process.env.RATE ?? 0.11);      // slow motion: ~6.7 screenshots/sec becomes ~60fps
const MAX_S = Number(process.env.MAX_S ?? 20);      // safety net, in animation seconds
const KBPS = Number(process.env.KBPS ?? 1600);

const CLIPS = [
  { key: 'feed', label: 'Eating', run: 'await d.feed()' },
  { key: 'wash', label: 'Bath time', run: 'await d.wash()' },
  { key: 'play', label: 'Playing', run: 'await d.play()' },
  { key: 'sleep', label: 'Sleeping', run: 'await d.sleep(); await new Promise(r=>setTimeout(r,1200)); await d.wake()' },
  { key: 'pet', label: 'Being petted', run: 'await d.pet(1); await d.pet(-1)' },
  { key: 'poop', label: 'Cleaning up', run: 'await d.poop(); await d.clean()' },
  { key: 'walk', label: 'Wandering', run: 'await d.walkTo(180); await d.walkTo(470)' },
  { key: 'die', label: 'Dying', run: 'await d.die()' },
];
// The rig wears the crown for the top 100 cats, and the crown rides the head through every frame, so
// it cannot be pasted on afterwards. Each action is recorded twice instead.
const VARIANTS = [{ suffix: '', crown: false }, { suffix: '-crown', crown: true }];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const pad = (n) => String(n).padStart(4, '0');

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Resume: recording the whole set takes about twenty minutes, and a dev server hiccup should not
// throw all of it away. Anything already encoded is kept.
const metaPath = `${OUT}/anim.json`;
const done = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : [];

/** Frames live on disk; the encoder page fetches them over this. */
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>encoder</title>'); return; }
  const file = `${RAW}${path}`;
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars'],
});

/** Slow every animation and every timer by the same factor, so the choreography stays intact. */
const SLOW = (rate) => {
  if (window.__slowed) return;
  window.__slowed = true;
  const realTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => realTimeout(fn, (Number(ms) || 0) / rate, ...rest);
  const realAnimate = Element.prototype.animate;
  Element.prototype.animate = function animate(...args) {
    const a = realAnimate.apply(this, args);
    try { a.playbackRate = rate; } catch { /* a finished animation refuses, which is fine */ }
    return a;
  };
  for (const a of document.getAnimations()) a.playbackRate = rate;
};

async function capture(clip, variant) {
  const key = clip.key + variant.suffix;
  mkdirSync(`${RAW}/${key}`, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('emogotchi.wallet', 'demo'); } catch { /* private mode */ } });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__pet?.director, { timeout: 120000, polling: 200 });

  // strip the page back to the stage alone, filling the viewport
  await page.evaluate((size) => {
    const stage = document.querySelector('.stage');
    document.body.innerHTML = '';
    document.body.style.cssText = `margin:0;width:${size}px;height:${size}px;overflow:hidden`;
    stage.style.cssText = `width:${size}px;height:${size}px;border-radius:0;box-shadow:none`;
    document.body.appendChild(stage);
  }, SIZE);

  // A neutral cat: the card's own copy says whether it is sad or dirty, and the demo wallet's cat
  // happens to be crowned, which would put a crown on everybody's video.
  await page.evaluate((crown) => {
    const d = window.__pet.director;
    d.setCrown(crown); d.setDirty(false); d.setSad(false);
  }, variant.crown);
  await new Promise((r) => setTimeout(r, 900));

  await page.evaluate(SLOW, RATE);
  // Start the action WITHOUT awaiting it. page.evaluate() on a string resolves the last expression,
  // so ending on the async IIFE would block here until the animation had already played out.
  await page.evaluate(`window.__recDone = false; (async () => { const d = window.__pet.director; ${clip.run}; })().catch((e) => console.error(e)).then(() => { window.__recDone = true; }); void 0;`);

  const t0 = Date.now();
  const times = [];
  for (;;) {
    await page.screenshot({ path: `${RAW}/${key}/f-${pad(times.length)}.png` });
    times.push(Math.round((Date.now() - t0) * RATE));
    const done = await page.evaluate(() => window.__recDone === true);
    if ((done && times.length > 8) || times[times.length - 1] > MAX_S * 1000) break;
  }
  await page.close();
  const secs = times[times.length - 1] / 1000;
  console.log(`  ${key.padEnd(12)} ${times.length} frames · ${secs.toFixed(1)}s · ${(times.length / secs).toFixed(0)}fps`);
  return { key, label: clip.label, crown: variant.crown, times };
}

/** Play the frames back at true speed and let the browser encode them. */
async function encode(clip) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const out = await page.evaluate(async (key, times, size, fps, kbps) => {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const x = cv.getContext('2d');
    const total = times[times.length - 1];
    const pad4 = (n) => String(n).padStart(4, '0');
    const load = (i) => fetch(`/${key}/f-${pad4(i)}.png`).then((r) => r.blob()).then(createImageBitmap);

    // decode a little ahead, so playback never waits on a PNG
    const AHEAD = 30;
    const q = new Map();
    const want = (i) => { if (i >= 0 && i < times.length && !q.has(i)) q.set(i, load(i)); };
    for (let i = 0; i < AHEAD; i++) want(i);

    const mime = ['video/mp4;codecs=avc1.4D401F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
      .find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('no encoder');
    const rec = new MediaRecorder(cv.captureStream(fps), { mimeType: mime, videoBitsPerSecond: kbps * 1000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    x.drawImage(await q.get(0), 0, 0, size, size);
    rec.start();
    await new Promise((done) => {
      const t0 = performance.now();
      let last = -1;
      const tick = async () => {
        const ms = performance.now() - t0;
        if (ms >= total) { done(); return; }
        let i = Math.max(last, 0);
        while (i + 1 < times.length && times[i + 1] <= ms) i += 1;
        if (i !== last) {
          want(i + AHEAD);
          const bm = await q.get(i);
          if (bm) x.drawImage(bm, 0, 0, size, size);
          for (const [j, p] of q) if (j < i - 1) { q.delete(j); void p.then((b) => b.close()).catch(() => {}); }
          last = i;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => setTimeout(r, 200));
    const blob = await new Promise((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: mime })); rec.stop(); });
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(s), type: mime };
  }, clip.key, clip.times, SIZE, FPS, KBPS);
  await page.close();

  const ext = out.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  const buf = Buffer.from(out.b64, 'base64');
  writeFileSync(`${OUT}/${clip.key}.${ext}`, buf);
  rmSync(`${RAW}/${clip.key}`, { recursive: true, force: true });
  console.log(`  ${clip.key.padEnd(12)} ${ext} ${(buf.length / 1024).toFixed(0)} KB`);
  return { ...clip, file: `${clip.key}.${ext}`, duration: clip.times[clip.times.length - 1], frames: clip.times.length, times: undefined };
}

const meta = [...done];
for (const variant of VARIANTS) {
  for (const clip of CLIPS) {
    if (only.length && !only.includes(clip.key)) continue;
    const key = clip.key + variant.suffix;
    const already = meta.find((m) => m.key === key);
    if (already && existsSync(`${OUT}/${already.file}`)) { console.log(`  ${key.padEnd(12)} already done`); continue; }
    let shot = null;
    for (let attempt = 1; attempt <= 3 && !shot; attempt += 1) {
      try { shot = await capture(clip, variant); }
      catch (e) { console.log(`  ${key.padEnd(12)} attempt ${attempt} failed: ${String(e.message).slice(0, 60)}`); }
    }
    if (!shot) { console.log(`  ${key.padEnd(12)} GIVING UP`); continue; }
    meta.push(await encode(shot));
    writeFileSync(metaPath, JSON.stringify(meta.map(({ key: k, label, crown, file, duration, frames }) => ({ key: k, label, crown, file, duration, frames }))));
  }
}
await browser.close();
server.close();
writeFileSync(metaPath, JSON.stringify(meta.map(({ key, label, crown, file, duration, frames }) => ({ key, label, crown, file, duration, frames }))));
console.log(`\n${meta.length} clips -> ${OUT}`);
