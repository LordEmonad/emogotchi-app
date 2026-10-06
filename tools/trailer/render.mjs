// Renders the trailer: serves the compositor (compose.js) with the filmed takes, and has Chrome draw and encode it.
//   node tools/trailer/render.mjs stills <outdir> [mid | n,n,n | every:<frames>]   frames as pictures, and a contact sheet
//   node tools/trailer/render.mjs video <out.mp4> [fromBeat toBeat]                the film, or a stretch of it
//   RAW=<takes, default trailer/raw>  DIST=<the site build, for its font and the end card's faces, default trailer/dist>
//   VENDOR=<a folder where `npm i mp4-muxer@5` was run, default trailer/vendor>  MBPS=16  FPS=60 HEIGHT=1080 (FPS=30 HEIGHT=720 MBPS=1.2 for a copy small enough to send)   (run from the repo root)
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(process.env.RAW ?? 'trailer/raw');
const DIST = resolve(process.env.DIST ?? 'trailer/dist');
const VENDOR = resolve(process.env.VENDOR ?? 'trailer/vendor');
const [mode, out, ...rest] = process.argv.slice(2);
if (!mode || !out) { console.error('usage: render.mjs stills <dir> [mid|n,n|every:N]  |  render.mjs video <out.mp4> [fromBeat toBeat]'); process.exit(1); }

// TIMELINE=<a cut's module> (default: the app trailer's, timeline.mjs)
const TL = await import(process.env.TIMELINE ? resolve(process.env.TIMELINE) : './timeline.mjs');
const T = TL.build();
// DEBUG_BOXES=1: each shot carries its pet's measured box through its stretch, drawn over the picture (the emo cut)
if (process.env.DEBUG_BOXES && TL.boxOver) {
  const samples = (take, aim, from, len) => { const out = []; for (let ms = 0; ms <= len; ms += 50) { const t = from + ms / 1000; const on = aim?.on ?? 'boxes'; let b = TL.boxOver(take, t, 0.05 / 0.35, on); if (b && aim?.also) { const a = TL.boxOver(take, t, 0.05 / 0.35, aim.also); if (a) b = [Math.min(b[0], a[0]), Math.min(b[1], a[1]), Math.max(b[2], a[2]), Math.max(b[3], a[3])]; } out.push(b ? [t * 1000, ...b] : [t * 1000]); } return out; };
  for (const c of T.clips) {
    if (c.take && c.aim) c.dbg = samples(c.take, c.aim, c.from ?? 0, c.lenMs);
    for (const t of c.tiles ?? []) if (t.take) t.dbg = samples(t.take, t.aim, t.from ?? 0, c.lenMs);
  }
}
// MUSIC=0: a cut that has a soundtrack (`song`) is rendered without it (the pets' own sounds only)
if (process.env.MUSIC === '0') T.song = null;
// what was filmed; a stretch of the film can be rendered before every take exists
const range = mode === 'video' && rest[0] !== undefined ? [Math.round(Number(rest[0]) * (T.beat ?? 30)), Math.round(Number(rest[1] ?? 1e9) * (T.beat ?? 30))] : [0, 1e9];
T.takes = {};
const cuesOf = {};
const missing = new Set();
// every take a clip draws: its own, a grid's tiles', an end card's faces'
const takesOf = (c) => [c.take, c.plate, ...(c.tiles ?? []).map((t) => t.take), ...(c.members ?? []).map((m) => m.take), ...(c.pics ?? []).map((q) => q.take), ...(c.faces ?? []).filter(Array.isArray).map((f) => f[0]), Array.isArray(c.face) ? c.face[0] : null].filter(Boolean);
for (const c of T.clips) for (const take of takesOf(c)) {
  if (T.takes[take] || missing.has(take)) continue;
  const metaPath = join(RAW, take, 'meta.json');
  if (!existsSync(metaPath)) {
    if (mode === 'video' && c.start < range[1] && c.start + c.len > range[0]) { console.error(`the take "${take}" has not been filmed (node tools/trailer/shots.mjs ${take})`); process.exit(1); }
    missing.add(take); console.warn(`  not filmed yet: ${take}`); continue;
  }
  const m = JSON.parse(readFileSync(metaPath, 'utf8'));
  T.takes[take] = { frames: m.frames, marks: m.marks ?? [], fps: m.fps ?? 60 };
  cuesOf[take] = m.cues ?? [];
}
for (const c of T.clips) {
  if (!c.take || !T.takes[c.take]) continue;
  const m = { frames: T.takes[c.take].frames, hitches: JSON.parse(readFileSync(join(RAW, c.take, 'meta.json'), 'utf8')).hitches ?? [] };
  const need = Math.round((c.from ?? 0) * (T.takes[c.take].fps ?? 60)) + Math.round(c.len * (c.speed ?? 1));
  if (need > m.frames) console.warn(`  note: "${c.take}" has ${m.frames} frames and the cut asks for ${need}; its last frame is held`);
  const bad = (m.hitches ?? []).filter(([f]) => f >= Math.round((c.from ?? 0) * (T.takes[c.take].fps ?? 60)) && f < need);
  if (bad.length) console.warn(`  note: "${c.take}" strays inside the cut at frames ${bad.map(([f, e]) => `${f} (${e}ms)`).slice(0, 6).join(', ')}`);
}
// the film's sound: each clip's stretch of its take's cues, at the clip's place in the film (SFX=0 for a silent film)
T.sfx = [];
if (process.env.SFX !== '0') {
  for (const c of T.clips) {
    const cues = cuesOf[c.take]; if (!cues?.length || c.mute === true) continue;
    const fromMs = (c.from ?? 0) * 1000;
    const endMs = Math.min(fromMs + c.lenMs, c.until ? c.until * 1000 : 1e12);
    const start = c.start / 60, end = start + c.lenMs / 1000;
    const stops = new Map(cues.filter((e) => e.stop !== undefined).map((e) => [e.stop, e]));
    for (const e of cues) {
      if (e.stop !== undefined || (Array.isArray(c.mute) ? c.mute : []).some((m) => e.name.startsWith(m))) continue;
      let at = e.t + (e.o?.delay ?? 0) * 1000;
      if (at >= endMs - 30) continue;
      const st = stops.get(e.id);
      let o = e.o ?? {};
      if (at < fromMs - 20) {
        // already going when the clip cuts in (a spin, a fire): it is heard from the cut, for what is left of it
        const endAt = o.dur ? at + o.dur * 1000 : st ? st.t : null;
        if (endAt === null || endAt < fromMs + 200 || at < fromMs - 8000) continue;
        if (o.dur) o = { ...o, dur: (endAt - fromMs) / 1000 };
        at = fromMs;
      }
      // a sound still going at the cut goes out over a quarter of a second, not on into the next scene
      const stopAt = st && st.t < endMs ? start + (st.t - fromMs) / 1000 : end + 0.05;
      // (a clip may set its sounds louder or softer than the take had them: `sfxGain`)
      if (c.sfxGain) o = { ...o, v: (o.v ?? 1) * c.sfxGain };
      T.sfx.push({ at: Math.max(start, start + (at - fromMs) / 1000), name: e.name, o, stopAt, fade: st && st.t < endMs ? st.fade : 260, clip: c.id });
    }
  }
  if (process.env.SFX_LEVEL) T.sfxLevel = Number(process.env.SFX_LEVEL);
  // the site's sound engine, bundled for the compositor
  const eb = readdirSync(join(HERE, '../../node_modules/.pnpm')).find((d) => d.startsWith('esbuild@'));
  execFileSync(join(HERE, '../../node_modules/.pnpm', eb, 'node_modules/esbuild/bin/esbuild'), [join(HERE, '../../apps/web/src/sound/engine.ts'), '--bundle', '--format=esm', '--target=es2022', '--define:import.meta.env.DEV=true', `--outfile=${join(RAW, '..', 'sound-engine.mjs')}`, '--log-level=error']);
}
const font = readdirSync(join(DIST, 'assets')).find((f) => /^space-grotesk-latin-wght-normal.*\.woff2$/.test(f));
// a hand for the scrawled lines (the emo cut): the r3tards mint page's Gloria Hallelujah, if the build has it
const hand = readdirSync(join(DIST, 'assets')).find((f) => /^GloriaHallelujah.*\.woff2$/.test(f));
if (!font) { console.error('no Space Grotesk in DIST/assets'); process.exit(1); }

let outFile = null, sfxFile = null;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const send = (file, type) => { if (!existsSync(file)) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); createReadStream(file).pipe(res); };
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><canvas id="cv" width="1920" height="1080" style="width:960px"></canvas><script type="module" src="/compose.js"></script>'); return; }
  if (p === '/compose.js') return send(join(HERE, 'compose.js'), 'text/javascript');
  if (p === '/emo-song.js') return send(join(HERE, 'emo-song.js'), 'text/javascript');
  if (p === '/sound-engine.mjs') return send(join(RAW, '..', 'sound-engine.mjs'), 'text/javascript');
  if (p === '/mp4-muxer.mjs') return send(join(VENDOR, 'node_modules/mp4-muxer/build/mp4-muxer.mjs'), 'text/javascript');
  if (p === '/font.woff2') return send(join(DIST, 'assets', font), 'font/woff2');
  if (p === '/hand.woff2') return hand ? send(join(DIST, 'assets', hand), 'font/woff2') : res.writeHead(404).end();
  if (p === '/timeline.json') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(T)); return; }
  if (p.startsWith('/dist/')) { const f = resolve(DIST, p.slice(6)); if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; } return send(f, f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream'); }
  if (p.startsWith('/raw/')) { const f = resolve(RAW, p.slice(5)); if (!f.startsWith(RAW)) { res.writeHead(403).end(); return; } return send(f, 'image/png'); }
  if (p === '/out' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => { const f = url.searchParams.get('name') === 'sfx' ? sfxFile : outFile; if (url.searchParams.get('part') === '0') rmSync(f, { force: true }); appendFileSync(f, Buffer.concat(chunks)); res.writeHead(200).end('ok'); });
    return;
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 0, args: ['--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(ORIGIN + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

const secs = (f) => (f / 60).toFixed(2);
console.log(`${T.clips.length} clips, ${T.frames} frames (${secs(T.frames)}s, ${T.frames / (T.beat ?? 30)} beats)`);

if (mode === 'stills') {
  mkdirSync(out, { recursive: true });
  const what = rest[0] ?? 'mid';
  let frames;
  if (what === 'mid') frames = T.clips.filter((c) => !takesOf(c).some((k) => missing.has(k) || !T.takes[k])).map((c) => c.start + Math.min(c.len - 1, Math.max(Math.round(c.len * 0.6), Math.min(c.len - 1, 36))));
  else if (what.startsWith('every:')) { const n = Number(what.slice(6)); frames = []; for (let f = 0; f < T.frames; f += n) frames.push(f); }
  else frames = what.split(',').map(Number);
  const scale = Number(process.env.SCALE ?? 0.5);
  const names = [];
  for (const n of frames) {
    const b64 = await page.evaluate((n, s) => window.still(n, s), n, scale);
    const name = `t-${String(n).padStart(5, '0')}.${scale === 1 ? 'png' : 'jpg'}`;
    writeFileSync(join(out, name), Buffer.from(b64, 'base64'));
    names.push([name, n]);
  }
  // a contact sheet of them
  const cols = Number(process.env.COLS ?? 4);
  const tw = Number(process.env.TW ?? 470);
  const html = join(out, '_sheet.html');
  writeFileSync(html, `<body style="margin:6px;background:#222;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;font:12px monospace;color:#ccc">${names.map(([f, n]) => { const c = T.clips.find((k) => n >= k.start && n < k.start + k.len); return `<div><img src="file://${resolve(out, f)}" style="width:${tw}px;display:block"><span>${secs(n)}s · beat ${(n / (T.beat ?? 30)).toFixed(1)} · ${c?.id ?? ''}</span></div>`; }).join('')}</body>`);
  const sp = await browser.newPage();
  await sp.setViewport({ width: cols * (tw + 6) + 6, height: 600 });
  await sp.goto('file://' + html);
  await sp.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await sp.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
  rmSync(html);
  console.log(`${frames.length} stills -> ${out}/sheet.png`);
} else if (mode === 'video') {
  outFile = resolve(out);
  // the sound beside the film: the effects alone, or with a soundtrack the whole mix
  sfxFile = outFile.replace(/\.mp4$/, '') + (T.song ? '-mix.wav' : '-sfx.wav');
  rmSync(outFile, { force: true });
  const from = rest[0] !== undefined ? Math.round(Number(rest[0]) * (T.beat ?? 30)) : 0;
  const to = rest[1] !== undefined ? Math.min(T.frames, Math.round(Number(rest[1]) * (T.beat ?? 30))) : T.frames;
  const tick = setInterval(async () => { const p = await page.evaluate(() => window.__progress).catch(() => null); if (p) process.stdout.write(`\r  frame ${p.n - from}/${p.of}  ${(p.s).toFixed(0)}s   `); }, 5000);
  const r = await page.evaluate((a, b, o) => window.render(a, b, o), from, to, { mbps: Number(process.env.MBPS ?? 16), name: 'out', fps: Number(process.env.FPS ?? 60), height: Number(process.env.HEIGHT ?? 1080) });
  clearInterval(tick);
  console.log(`\n${outFile}: ${(r.bytes / 1048576).toFixed(1)} MB, ${secs(to - from)}s, ${r.codec} (${r.hw}), rendered in ${r.seconds.toFixed(0)}s`);
  if (r.sound) console.log(`  sound: ${r.sound.sounds} effects (${r.sound.codec}), peak ${r.sound.peak.toFixed(2)} x${r.sound.gain.toFixed(2)}${r.sound.unknown.length ? '; no sound called: ' + r.sound.unknown.join(', ') : ''}; ${T.song ? 'the mix' : 'the effects alone'}: ${sfxFile}`);
} else if (mode === 'sound') {
  // how loud the mix is through the film, and what sounds each clip has: node tools/trailer/render.mjs sound <out.json>
  const r = await page.evaluate((n) => window.sfxLevels(0, n), T.frames);
  writeFileSync(out, JSON.stringify({ ...r, events: T.sfx }));
  const by = {}; for (const e of T.sfx) (by[e.clip] ??= []).push(e.name);
  for (const c of T.clips) console.log(`${secs(c.start).padStart(7)}s ${c.id.padEnd(16)} ${(by[c.id] ?? []).length} ${[...new Set(by[c.id] ?? [])].slice(0, 9).join(' ')}`);
  console.log(`${r.made} effects, peak ${r.peak.toFixed(2)} x${r.gain.toFixed(2)}${r.unknown.length ? '; no sound called: ' + r.unknown.join(', ') : ''}`);
} else if (mode === 'songwav') {
  // the song alone, as the film sets it: node tools/trailer/render.mjs songwav <out.wav>
  sfxFile = resolve(out);
  const r = await page.evaluate((n) => window.songOnly(0, n), T.frames);
  console.log(`${sfxFile}: the limiter took off at most ${(-r.limited).toFixed(1)} dB`);
} else if (mode === 'song') {
  // the soundtrack's stems, how loud each is section by section: node tools/trailer/render.mjs song <out.json>
  const r = await page.evaluate((n) => window.songStems(0, n), T.frames);
  writeFileSync(out, JSON.stringify(r));
  const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf').padStart(6);
  const beat = T.beat / 60;
  for (const s of T.song ?? []) {
    const a = Math.floor(s.at * beat * 10), b = Math.floor((s.at + s.beats) * beat * 10);
    const row = Object.entries(r).map(([k, v]) => { const sl = v.levels.slice(a, b); const rms = Math.sqrt(sl.reduce((x, y) => x + y * y, 0) / (sl.length || 1)); return `${k} ${db(rms)}`; });
    console.log(`${String(s.at).padStart(4)} ${s.kind.padEnd(7)} ${row.join('  ')}`);
  }
  console.log('peaks', Object.entries(r).map(([k, v]) => `${k} ${db(v.peak)}`).join('  '));
} else { console.error('unknown mode'); }
await browser.close();
server.close();
