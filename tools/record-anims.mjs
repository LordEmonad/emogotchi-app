/**
 * Record the cat's real animations once, so the share card can replay them.
 *
 * The rig is SVG driven by the browser's animation engine, and nothing can rasterise that frame by
 * frame at speed inside a visitor's browser. The cat looks the same for everyone though, so the clips
 * only have to be made once. This drives the director through each action, grabs the stage as fast as
 * it can, and records how long each frame actually took, so playback is faithful even though capture
 * is not evenly spaced. The frames become one sprite sheet per action.
 *
 *   node tools/record-anims.mjs        (dev server on 5173)
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const RAW = '/tmp/emo-anim';
const OUT = 'apps/web/public/anim';
const BASE = process.env.BASE ?? 'http://localhost:5173';
const SIZE = 360;
const MAX_MS = 16000; // longest action (feed) runs ~13.2s

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

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars'],
});

// The rig wears the crown for the top 100 cats, and the crown rides the head through every frame,
// so it cannot be pasted on afterwards. Each action is recorded twice instead.
const VARIANTS = [{ suffix: '', crown: false }, { suffix: '-crown', crown: true }];

const meta = [];
for (const variant of VARIANTS) for (const clip of CLIPS) {
  const key = clip.key + variant.suffix;
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('emogotchi.wallet', 'demo'); } catch {} });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => window.__pet?.director, { timeout: 60000 });

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

  // Start the action WITHOUT awaiting it. page.evaluate() on a string resolves the last expression,
  // so ending on the async IIFE would block here until the animation had already played out.
  await page.evaluate(`window.__recDone = false; (async () => { const d = window.__pet.director; ${clip.run}; })().catch((e) => console.error(e)).then(() => { window.__recDone = true; }); void 0;`);
  const t0 = Date.now();
  const times = [];
  let n = 0;
  for (;;) {
    await page.screenshot({ path: `${RAW}/${key}-${String(n).padStart(3, '0')}.png` });
    times.push(Date.now() - t0);
    n += 1;
    const done = await page.evaluate(() => window.__recDone === true);
    if ((done && times.length > 8) || Date.now() - t0 > MAX_MS) break;
  }
  meta.push({ key, label: clip.label, crown: variant.crown, frames: n, times });
  console.log(`${key.padEnd(12)} ${clip.label.padEnd(13)} ${n} frames · plays for ${(times[times.length - 1] / 1000).toFixed(1)}s`);
  await page.close();
}
await browser.close();
writeFileSync(`${RAW}/meta.json`, JSON.stringify(meta));
console.log('\nframes in', RAW, '— now run tools/pack-anims.py');
