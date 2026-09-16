/**
 * Check every recorded clip before it ships.
 *
 * A clip once shipped with the dev server's error overlay recorded into it, and another with the cat
 * barely moving because the action had been driven around the director's queue. Both were only caught
 * by eye, late. This looks at the actual pixels: the room should be purple, the cat should be there,
 * and the cat should move.
 *
 *   node tools/check-anims.mjs          (dev server on 5173)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

const clips = await page.evaluate(() => fetch('/anim/anim.json').then((r) => r.json()));
console.log(`${clips.length} clips\n`);

let bad = 0;
for (const clip of clips) {
  const r = await page.evaluate(async (file) => {
    const v = document.createElement('video');
    v.src = `/anim/${file}`; v.muted = true;
    document.body.appendChild(v);
    const ok = await new Promise((r) => { v.onloadeddata = () => r(true); v.onerror = () => r(false); setTimeout(() => r(false), 20000); });
    if (!ok) { v.remove(); return { ok: false }; }
    const c = document.createElement('canvas'); c.width = 500; c.height = 500;
    const x = c.getContext('2d', { willReadFrequently: true });
    const centres = [];
    let purple = 0;
    for (let i = 0; i <= 10; i++) {
      v.currentTime = (v.duration * i) / 10.5;
      await new Promise((r) => { v.onseeked = r; setTimeout(r, 3000); });
      x.drawImage(v, 0, 0, 500, 500);
      const d = x.getImageData(0, 0, 500, 500).data;
      let sum = 0, n = 0, rSum = 0, gSum = 0, bSum = 0, px = 0;
      for (let ix = 0; ix < 500; ix += 1) for (let iy = 120; iy < 460; iy += 2) {
        const o = (iy * 500 + ix) * 4;
        rSum += d[o]; gSum += d[o + 1]; bSum += d[o + 2]; px += 1;
        if (d[o] > 190 && d[o + 1] > 190 && d[o + 2] > 190) { sum += ix; n += 1; }
      }
      // the room is purple: red and blue both clearly above green. an error overlay is grey on black.
      if (rSum / px > gSum / px + 6 && bSum / px > gSum / px + 12) purple += 1;
      centres.push(n > 40 ? Math.round(sum / n) : null);
    }
    v.pause(); v.remove();
    const seen = centres.filter((c) => c !== null);
    return {
      ok: true, duration: v.duration, w: v.videoWidth, h: v.videoHeight,
      frames: centres.length, catSeen: seen.length, purple,
      span: seen.length ? Math.max(...seen) - Math.min(...seen) : 0,
    };
  }, clip.file);

  const problems = [];
  if (!r.ok) problems.push('will not load');
  else {
    if (r.w !== 500 || r.h !== 500) problems.push(`is ${r.w}x${r.h}`);
    if (r.purple < r.frames - 1) problems.push(`${r.frames - r.purple} frames are not the room (error overlay?)`);
    if (r.catSeen < r.frames - 2) problems.push(`cat missing in ${r.frames - r.catSeen} frames`);
  }
  if (problems.length) { bad += 1; console.log(`FAIL ${clip.key.padEnd(12)} ${problems.join('; ')}`); }
  else console.log(`ok   ${clip.key.padEnd(12)} ${r.duration.toFixed(1)}s  moves ${String(r.span).padStart(3)}px`);
}
console.log(bad ? `\n${bad} clips need re-recording` : '\nevery clip is the room, with the cat in it');
await browser.close();
process.exit(bad ? 1 : 0);
