// The sound studio, headless: the site's own sound code (apps/web/src/sound: engine, effects, music), bundled on the spot
// with esbuild and run in Chrome on OfflineAudioContexts, written out as stereo WAVs to listen to or measure. No dev
// server (another session's edits reload those mid-render).
//   node tools/sound-studio.mjs riff <out.wav> [--band] [--room=emoroom|plain] [--duck] [--pet=cat]
//       the guitar scene's four bars of the riff and its last chord, timed exactly as the director times them, with the
//       backing band (--band; --noguitar for the band alone), over a room's tune (--room) ducked as the scene ducks it (--duck);
//       --thicc for Thiccums' butt-bounce version (buttGuitar's timing); --baked plays the strokes and bass notes from
//       their recordings, as a live page does once they are rendered (sfx.ts prepBand): it must sound the same
//   node tools/sound-studio.mjs song <out.wav> [--scene=emoroom] [--who=cat] [--bars=16] [--from=0] [--solo=<part index>]
//   node tools/sound-studio.mjs sfx <out.wav> <name> [--n=0] [--dur=0.9] [--who=<pet: a voice's throat>] [--raw]   (--raw: as written, before levels.ts;
//       it also prints the peak and loudest 300 ms that tools/sound-levels.mjs levels a sound by)
// Then `python3 tools/sound-spectrum.py <wav>` for its octave bands and width.
import { createRequire } from 'node:module';
import { readdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const [mode, out, name] = process.argv.slice(2);
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const eb = readdirSync(join(ROOT, 'node_modules/.pnpm')).find((d) => d.startsWith('esbuild@'));
const esbuild = createRequire(import.meta.url)(join(ROOT, 'node_modules/.pnpm', eb, 'node_modules/esbuild'));

const entry = `
import { buildGraph, play, setRaw } from './engine';
import { prepare, scheduleBar, songFor, start, barSeconds } from './music';
import { prepBand, setBakeInTools } from './sfx';
const SR = 44100;
const PREFS = { on: true, music: 0.6, sfx: 0.7 };
const wishOf = (scene, who) => ({ place: 'room', who, scene: scene === 'plain' ? null : scene, asleep: false, dead: false });
function room(ac, g, scene, who, secs) {
  const song = songFor(wishOf(scene, who));
  const p = start(ac, song, g.music, g.verbMusic);
  const len = barSeconds(song);
  for (let i = 0; i * len < secs; i++) scheduleBar(ac, p, i, 0.05 + i * len);
  return song;
}
const pack = (buf) => ({ L: Array.from(buf.getChannelData(0)), R: Array.from(buf.getChannelData(1)), sr: buf.sampleRate });
window.studio = {
  async riff({ band, scene, duck, who, guitar, thicc, baked }) {
    // --baked: the strokes and bass notes from their recordings (as a live page plays them once rendered), not synthesized
    setBakeInTools(!!baked);
    if (thicc) {
      // Thiccums' butt-bounce guitar, as director.ts buttGuitar times it: a landing every 240 ms (an open hit) and a chug on
      // each rise, a chord every four landings, the band a bar a chord, and the launch's big chord on the seventeenth
      const PER = 0.24, T0 = scene ? 3.0 : 0.3, landAt = (i) => 0.12 + PER * i + PER * 0.28;
      const secs = T0 + landAt(16) + 4.5 + (scene ? 3 : 0);
      const ac = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
      const g = buildGraph(ac, PREFS);
      if (baked) await prepBand(ac);
      if (scene) { const s = songFor(wishOf(scene, who)); await prepare(SR, s); room(ac, g, scene, who, secs); }
      if (scene && duck) play(g, 'music.duck', { dur: landAt(16) + 2.6 + 1.5 }, T0 - 0.5);
      for (let i = 0; i < 16; i++) {
        const chord = Math.floor(i / 4) % 4;
        if (guitar) { play(g, 'guitar.down', { n: chord, dur: PER * 0.4 + 0.03 }, T0 + landAt(i)); play(g, 'guitar.mute', { n: chord, dur: 0.12 }, T0 + 0.12 + PER * i + PER * 0.68); }
        if (band && i % 4 === 0) play(g, 'band.bar', { n: chord, gap: PER }, T0 + landAt(i));
      }
      if (guitar) play(g, 'guitar.down', { n: 0, dur: 2.6 }, T0 + landAt(16));
      if (band) play(g, 'band.end', {}, T0 + landAt(16));
      return pack(await ac.startRendering());
    }
    const STRUM_BAR = ['down', null, 'down', 'up', null, 'up', 'down', 'up'];
    const STRUM_MUTE = [false, false, true, true, false, false, true, false];
    const EIGHTH = 0.175, LEAD = 0.26, T0 = scene ? 3.0 : 0.3;
    const secs = T0 + LEAD + 32 * EIGHTH + 0.12 + 4.5 + (scene ? 3 : 0);
    const ac = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const g = buildGraph(ac, PREFS);
    if (baked) await prepBand(ac);
    if (scene) { const s = songFor(wishOf(scene, who)); await prepare(SR, s); room(ac, g, scene, who, secs); }
    // the scene ducks the room's tune from the guitar's drop to after the throw (as director.ts playGuitar does)
    if (scene && duck) play(g, 'music.duck', { dur: LEAD + 32 * EIGHTH + 2.6 + 1.0 }, T0 - 1.0);
    const strokes = [];
    for (let bb = 0; bb < 4; bb++) STRUM_BAR.forEach((kind, i) => { if (kind) strokes.push({ t: LEAD + (bb * 8 + i) * EIGHTH, kind, bar: bb }); });
    const finale = LEAD + 32 * EIGHTH + 0.12;
    strokes.push({ t: finale, kind: 'down', bar: 4 });
    if (guitar) strokes.forEach((s, i) => {
      const last = i === strokes.length - 1;
      const mute = !last && STRUM_MUTE[Math.round((s.t - LEAD) / EIGHTH) % 8] === true;
      const dur = last ? 2.6 : ((strokes[i + 1]?.t ?? s.t + EIGHTH) - s.t) + 0.03;
      play(g, mute ? 'guitar.mute' : s.kind === 'down' ? 'guitar.down' : 'guitar.up', { n: s.bar % 4, dur }, T0 + s.t);
    });
    if (band) { for (let bb = 0; bb < 4; bb++) play(g, 'band.bar', { n: bb, first: bb === 0, last: bb === 3 }, T0 + LEAD + bb * 8 * EIGHTH); play(g, 'band.end', {}, T0 + finale); }
    return pack(await ac.startRendering());
  },
  async song({ scene, who, bars, from, solo }) {
    const whole = songFor(wishOf(scene, who));
    const song = solo === undefined ? whole : { ...whole, parts: whole.parts.filter((_p, i) => i === solo) };
    const len = barSeconds(song);
    await prepare(SR, whole);
    const ac = new OfflineAudioContext(2, Math.ceil(SR * (len * bars + 2.5)), SR);
    const g = buildGraph(ac, PREFS);
    const p = start(ac, song, g.music, g.verbMusic);
    for (let i = 0; i < bars; i++) scheduleBar(ac, p, from + i, 0.05 + i * len);
    return { ...pack(await ac.startRendering()), parts: whole.parts.length };
  },
  async sfx({ name, o, secs, raw, baked }) {
    setRaw(!!raw);
    setBakeInTools(!!baked);
    const ac = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const g = buildGraph(ac, PREFS);
    if (baked) await prepBand(ac);
    if (!play(g, name, o, 0.02)) throw new Error('no sound called ' + name);
    return pack(await ac.startRendering());
  },
};
`;
const dir = mkdtempSync(join(tmpdir(), 'studio-'));
await esbuild.build({ stdin: { contents: entry, resolveDir: join(ROOT, 'apps/web/src/sound'), loader: 'ts' }, bundle: true, format: 'esm', target: 'es2022', outfile: join(dir, 'studio.js'), define: { 'import.meta.env.DEV': 'true', __SOUND__: 'true' }, logLevel: 'error' });
const server = createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><script type="module" src="/studio.js"></script>'); return; }
  if (req.url === '/studio.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(dir, 'studio.js'))); return; }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0 });
const pg = await b.newPage();
pg.on('pageerror', (e) => console.error('page error:', e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.studio, { timeout: 30000 });
let r;
if (mode === 'riff') r = await pg.evaluate((o) => window.studio.riff(o), { band: flag('band'), scene: arg('room', null), duck: flag('duck'), who: arg('pet', 'cat'), guitar: !flag('noguitar'), thicc: flag('thicc'), baked: flag('baked') });
else if (mode === 'song') r = await pg.evaluate((o) => window.studio.song(o), { scene: arg('scene', 'emoroom'), who: arg('who', 'cat'), bars: Number(arg('bars', 16)), from: Number(arg('from', 0)), solo: arg('solo', null) === null ? undefined : Number(arg('solo')) });
else if (mode === 'sfx') r = await pg.evaluate((o) => window.studio.sfx(o), { name, o: { n: Number(arg('n', 0)), dur: Number(arg('dur', 0.9)), ...(arg('who', null) ? { who: arg('who') } : {}) }, secs: Number(arg('secs', 3)), raw: flag('raw'), baked: flag('baked') });
else { console.error('mode: riff | song | sfx'); process.exit(1); }
await b.close(); server.close();
// a 16-bit stereo WAV
const n = r.L.length, buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(r.sr, 24); buf.writeUInt32LE(r.sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
let peak = 0;
for (let i = 0; i < n; i++) { const l = r.L[i], rr = r.R[i]; peak = Math.max(peak, Math.abs(l), Math.abs(rr)); buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(l * 32767))), 44 + i * 4); buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(rr * 32767))), 46 + i * 4); }
writeFileSync(resolve(out), buf);
// the loudest 300 ms (as RMS of the two sides' mean) and the peak, as tools/sound-levels.mjs measures a sound
const win = Math.floor(r.sr * 0.3); let sum = 0, best = 0;
for (let i = 0; i < n; i++) { const m = (r.L[i] + r.R[i]) / 2; sum += m * m; if (i >= win) { const o = (r.L[i - win] + r.R[i - win]) / 2; sum -= o * o; } if (sum > best) best = sum; }
console.log(`  loudest 300 ms ${(10 * Math.log10(best / win + 1e-12)).toFixed(1)} dB`);
console.log(`${out}: ${(n / r.sr).toFixed(1)} s, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS${r.parts ? `, ${r.parts} parts` : ''}`);
