// The emo pack trailer's cut (render.mjs with TIMELINE=tools/trailer/emo-timeline.mjs RAW=trailer/emo/raw
// DIST=trailer/emo/dist). Its beat is the pets' own riff's: the director plays the guitar in eighths of 175 ms, so a
// beat is 350 ms (171.4 bpm), 21 frames, and every cut lands on one. The soundtrack (compose.js `song`) is written on the
// same grid in the same key (E5 C5 G5 D5, the riff's chords), so when a pet plays, its riff is in time with the drums.
// Every word on screen is DRAFT copy the operator has not signed off; nothing claims a price or a threshold.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { solve, PIC_AR } from './emo-frame.mjs';

export const BEAT = 21;
export const SPB = 350;   // ms a beat
const RAW = process.env.RAW ?? 'trailer/emo/raw';

/** a take's recorded sounds (ms from its first frame) */
export const cuesOf = (take) => { const p = join(RAW, take, 'meta.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).cues ?? [] : []; };
/** where a guitar take's riff starts: its first stroke (a stroke carries `dur`; the landing and the catch do not) */
export const riffAt = (take) => cuesOf(take).find((c) => /^guitar\.(down|up|mute)$/.test(c.name) && c.o?.dur !== undefined && c.o.dur < 2)?.t ?? null;
/** the big last chord (2.6 s) */
export const finaleAt = (take) => cuesOf(take).find((c) => c.name === 'guitar.down' && c.o?.dur >= 2)?.t ?? null;
/** the n-th shutter of a selfie take */
export const shutterAt = (take, n) => cuesOf(take).filter((c) => c.name === 'shutter')[n]?.t ?? null;
/** the n-th cue called `name` */
export const cueAt = (take, name, n = 0) => cuesOf(take).filter((c) => c.name === name)[n]?.t ?? null;
/** `from` (seconds) such that moment `ms` of the take lands `beats` beats into the clip */
export const landing = (ms, beats, fallback) => (ms === null ? fallback : Math.max(0, (ms - beats * SPB) / 1000));


// Where each pet is: what is visible of its drawing (with what it holds) as fractions of the room picture, x0 y0 x1 y1,
// every 50 ms of each take's action, measured by tools/trailer/emo-boxes.mjs into trailer/emo/boxes.json. That run is in
// real time, the take in the film's; the two are lined up on the sound cues they share.
// (BOXES=<file>: another cut's measurements, the Emonadgotchi trailer's trailer/emonad/boxes.json)
const BOXFILE = process.env.BOXES ?? 'trailer/emo/boxes.json';
const BOXES = existsSync(BOXFILE) ? JSON.parse(readFileSync(BOXFILE, 'utf8')) : {};
/** the box run's ms for a take's ms: shifted by how far apart the last cue before it fell in the two */
function runMs(take, ms) {
  const run = BOXES[take]?.cues ?? []; let off = 0; const seen = {};
  for (const c of cuesOf(take)) {
    if (c.t > ms) break;
    const i = (seen[c.name] = (seen[c.name] ?? -1) + 1);
    const m = run.filter(([, n]) => n === c.name)[i];
    if (m) off = m[0] - c.t;
  }
  return ms + off;
}
const union = (u, b) => (u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b.slice());
// (the measuring run and the film can drift this far apart between two cues: every stretch is widened by it)
const PAD = 120;
/** the union of a take's boxes (`which`: 'boxes' the pet with what it holds, 'body' without, 'props', 'beanie', 'lips',
 * 'held') over `beats` beats from second `from` */
export function boxOver(take, from, beats, which = 'boxes') {
  const run = BOXES[take]?.[which]; if (!run) return null;
  const a = runMs(take, from * 1000), b = runMs(take, from * 1000 + beats * SPB);
  let u = null;
  for (const s of run) if (s.length === 5 && s[0] >= a - PAD && s[0] <= b + PAD) u = union(u, s.slice(1));
  return u;
}
export { runMs };
const ROOM = [0.05, 0.05, 0.95, 0.95];   // (no measurement: the whole room)

// Two ways a take is shown, and neither ever cuts a pet:
// - a PRINT (compose.js drawPrint): the whole room as a photo in a scrapbook, the words beside it. A shot of a whole pet
//   is a print: zoomed in only as far as its pet, through the whole shot, stays inside the photo with a margin.
// - FULL BLEED (drawFill): a close-up of a whole head (the beanie, the lip rings), the item's name in a column on the left
//   that the head never reaches.
// tools/trailer/emo-frame-check.mjs checks every frame of the film against both.
export const SAFE = {
  print: [0.035, 0.045, 0.965, 0.955],  // inside a print's photo
  caption: [0.44, 0.05, 0.965, 0.95],   // full bleed beside an item's name (compose.js CAPTION_COL: to 0.40 of the width)
  tile: [0.04, 0.05, 0.96, 0.95],       // inside a grid's print
};
export const WORDS = { caption: [0, 0.58, 0.42, 1] };
// the prints, in px of the 1920 x 1080 frame (the photo; its paper border is drawn round it)
export const PH = 864, PW = Math.round(PH * PIC_AR);
export const RIGHT = { x: 1920 - 70 - PW, y: (1080 - PH) / 2, w: PW, h: PH };
const BIG = { w: Math.round(929 * PIC_AR), h: 929 };
export const centre = (dx, rot) => ({ x: (1920 - BIG.w) / 2 + dx, y: (1080 - BIG.h) / 2, w: BIG.w, h: BIG.h, rot });
// a grid's five prints, three over two
const GH = 372, GW = Math.round(GH * PIC_AR), GG = 48;
export const GRID = [0, 1, 2, 3, 4].map((i) => {
  const row = i < 3 ? 0 : 1, k = row ? i - 3 : i, n = row ? 2 : 3;
  return { x: 960 + (k - (n - 1) / 2) * (GW + GG) - GW / 2, y: 34 + row * (GH + 46), w: GW, h: GH, rot: [-1.6, 1.2, -0.8, 1.4, -1.2][i] };
});
const S = (beats, take, from, o = {}) => ({ beats, take, from, ...o });
/** what a shot is framed on, through its whole stretch or part of it */
export function aimBox(take, aim, f, n) {
  const { on = 'boxes', also, props, extra, grow, box } = aim;
  let u = box ?? boxOver(take, f, n, on) ?? boxOver(take, f, n) ?? ROOM;
  if (also) { const a = boxOver(take, f, n, also); if (a) u = union(u, a); }
  if (props) { const pb = boxOver(take, f, n, 'props'); if (pb) u = union(u, pb.map((v, i) => (i % 2 ? Math.max(0, Math.min(1, v)) : v))); }
  if (extra) u = union(u, extra);
  return grow ? [u[0] - grow[0], u[1] - grow[1], u[2] + grow[2], u[3] + grow[3]] : u;
}
/** solve, or the whole room when even that will not leave a margin (a print never cuts: the room holds the pet) */
export const fit = (b, o) => { try { return solve(b, o); } catch (e) { if (o.zmin <= 1 && o.boxAR !== 16 / 9) return { zoom: 1, focus: [0.5, 0.5] }; throw e; } };
/**
 * a shot framed on its pet: `print` (a rect: the shot is a print there; else full bleed beside a caption), `fill` (how
 * much of the photo's or frame's height the pet takes, if it can), `at`/`ay` (where its middle goes in the safe rect),
 * `push` (a slow zoom: > 1 in, < 1 out; the pet whole at both ends), `drift` (frame its first and its last beat and
 * move between them), `toFill` (the last framing's fill), plus aimBox's `on`, `also`, `props`, `extra`, `grow`, `box`
 */
export function SF(beats, take, from, o = {}) {
  const { push = 1.04, drift = false, toFill, print = null, fill = 0.86, at = 0.5, ay = 0.5, ...aim } = o;
  const opt = print
    ? { boxAR: print.w / print.h, safe: SAFE.print, fill, at, ay, zmin: 1, zmax: 4 }
    : { boxAR: 16 / 9, safe: SAFE.caption, fill, at, ay, zmin: 1.02, zmax: 6 };
  let a, b;
  if (drift || toFill) {
    const first = aimBox(take, aim, from, drift ? 1 : beats), last = aimBox(take, aim, from + (drift ? (beats - 1) * SPB / 1000 : 0), drift ? 1 : beats);
    a = fit(first, opt); b = fit(last, { ...opt, fill: toFill ?? fill });
  } else {
    const whole = aimBox(take, aim, from, beats);
    if (push >= 1) { b = fit(whole, opt); try { a = solve(whole, { ...opt, zmax: b.zoom / push }); } catch { a = b; } }
    else { a = fit(whole, opt); try { b = solve(whole, { ...opt, zmax: a.zoom * push }); } catch { b = a; } }
  }
  return S(beats, take, from, { layout: print ? 'print' : 'fill', print, zoom: [a.zoom, b.zoom], focus: [...a.focus, ...b.focus], aim });
}
/** a grid's print of a pet, whole, filling `fill` of the photo's height if it can */
export function tile(take, from, beats, i, fill = 0.8, aim = {}) {
  const r = fit(aimBox(take, aim, from, beats), { boxAR: PIC_AR, safe: SAFE.tile, fill, zmin: 1, zmax: 4 });
  return { take, from, zoom: r.zoom, focus: r.focus, aim, print: GRID[i] };
}
/** an end-card face: the circle round the pet's face (its beanie down to its lip rings) at second `sec` of a take */
export function face(take, sec) {
  const be = boxOver(take, sec, 0.3, 'beanie'), li = boxOver(take, sec, 0.3, 'lips');
  const b = be && li ? union(be, li) : boxOver(take, sec, 0.3) ?? ROOM;
  const hw = Math.max((b[3] - b[1]) * 538 / 702, b[2] - b[0]) / 2;
  return [take, sec, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, hw * 1.12];
}

const PETS5 = ['cat', 'frog', 'sahur', 'thicc', 'r3'];
const gtrLand = landing(cueAt('emo-guitar-cat', 'thud', 0), 2, 0.4);
const gtrUp = riffAt('emo-guitar-cat') === null ? 4.6 : (riffAt('emo-guitar-cat') - 4 * SPB) / 1000;
const gtrOut = landing(finaleAt('emo-guitar-cat'), 1, 9.6);
const thiccA = landing(cueAt('emo-guitar-thicc', 'boing', 0), 1, 0.27), thiccB = landing(cueAt('emo-guitar-thicc', 'boing', 1), 5, 3.8);
export const riffFrom = (p, i) => { const t0 = riffAt(`emo-guitar-${p}`); return t0 === null ? 4 + i * 1.4 : (t0 + i * 1400) / 1000; };
// (a whole head: the beanie down to just under the lip rings)
export const HEAD = { on: 'beanie', also: 'lips', grow: [0.012, 0.012, 0.012, 0.03] };
export const R = (rot) => ({ ...RIGHT, rot });

// (built when the cut is built: another cut importing the helpers above must not need this one's measurements)
const CLIPS = () => [
  // ---- cold open: a page of the diary: a print of the cat alone and sad in the bedroom at night, the rain, the words ----
  { id: 'intro', dim: 0.1, mute: true, fadeIn: true, ...SF(8, 'emo-intro', 0.2, { print: R(-1.4), fill: 0.62, push: 1.12 }),
    scrawl: [{ text: 'dear diary,', at: 1, x: 116, y: 430, size: 66, rot: -4 }, { text: 'nobody gets us.', at: 4, x: 116, y: 540, size: 62, rot: -3 }] },
  { id: 'phase', layout: 'title', beats: 8, words: [{ text: "IT'S", at: 0 }, { text: 'NOT', at: 1 }, { text: 'A', at: 2 }, { text: 'PHASE.', at: 3, pink: true }], shake: true },

  // ---- the drop: the pack, then every pet in it, its name big beside its print ----
  { id: 'logo', layout: 'title', beats: 4, logo: true, glitch: true, flash: true, sub: 'for Emogotchi' },
  ...[['cat', 'THE CAT'], ['frog', 'THE FROK'], ['sahur', ['TUNG TUNG', 'TUNG SAHUR']], ['thicc', 'THICCUMS'], ['r3', 'THE R3TARD']].map(([p, name], i) =>
    ({ id: `hero-${p}`, glitch: true, slam: true, name, ...SF(2, `emo-hero-${p}`, 0.25, { print: R(i % 2 ? -1.3 : 1.3), fill: 0.74, push: 0.96 }) })),
  { id: 'five', layout: 'grid', beats: 6, glitch: true, stagger: 0.5, title: 'FIVE PETS. FULL EMO.', tiles: PETS5.map((p, i) => tile(`emo-hero-${p}`, 1.6, 6, i)) },

  // ---- the items ----
  // the beanie and the lip rings full bleed: a whole head, to the right of the item's name
  { group: 'beanie', title: 'THE BEANIE', sub: 'black emo hair included', wipe: true, shots:
    ['cat', 'frog', 'thicc', 'r3'].map((p) => SF(2, `emo-hero-${p}`, 2.2, { ...HEAD, fill: 0.8 })) },
  // the rest as prints: every pet whole
  { group: 'fit', title: 'THE FIT', sub: 'stripes, hoodies, skinny jeans, checkered slip-ons', shots:
    ['cat', 'frog', 'sahur', 'r3'].map((p) => SF(2, `emo-guitar-${p}`, 0.1, { print: R(1.2), fill: 0.82 })) },
  { group: 'lips', title: 'SNAKEBITES', sub: 'they move with every mouth', shots:
    // (the yawn: the rings ride the lip as the mouth opens)
    [['frog', 3], ['sahur', 3], ['r3', 2]].map(([p, n]) => SF(n, `emo-lip-${p}`, 0.6, { ...HEAD, fill: 0.84, push: 1.05 })) },
  // (their strumming is not on the song's grid here: the song's riff is the only guitar heard)
  { group: 'wrist', title: 'WRISTBANDS', mute: ['guitar.'], shots: [
    SF(2, 'emo-guitar-frog', 9.0, { print: R(-1.2), fill: 0.86 }), SF(2, 'emo-guitar-sahur', 9.0, { print: R(-1.2), fill: 0.9 })] },
  { group: 'room', title: ['THE EMO', 'BEDROOM'], sub: 'fairy lights. rain on the window.', shots: [
    SF(4, 'emo-room-day', 0.6, { print: R(1.4), fill: 0.6, push: 1.04 }), SF(4, 'emo-intro', 2.6, { print: R(1.4), fill: 0.5, push: 0.96 })] },

  // ---- the guitar ----
  // (two shots: it falls by her and lands, the thud on a beat; then the pick-up, running straight on into her first strum)
  { group: 'gtr-in', title: 'THE GUITAR', sub: 'it falls from the sky. they pick it up.', wipe: true, shots: [
    SF(4, 'emo-guitar-cat', gtrLand, { print: R(-1.3), fill: 0.7, push: 1.03, extra: boxOver('emo-guitar-cat', gtrLand + 2 * SPB / 1000, 2, 'props') ?? undefined }),
    SF(4, 'emo-guitar-cat', gtrUp, { print: R(-1.3), fill: 0.78, drift: true, props: true })] },
  // four bars of the riff, a pet a bar, each cut so its own bar lands on the downbeat (E5, C5, G5, D5 in turn); each print
  // slams onto the page, a little this way and that
  ...['cat', 'frog', 'sahur', 'r3'].map((p, i) => ({ id: `riff-${p}`, pulse: true, slam: true, glitch: i > 0, mute: ['guitar.'], tag: i === 0 ? 'THEY SHRED' : null,
    ...SF(4, `emo-guitar-${p}`, riffFrom(p, i), { print: centre([90, -60, 60, -60][i], [1.6, -1.8, 1.4, -1.6][i]), fill: 0.84 }) })),
  // the big last chord (on the second beat) and the throw: pulling back to the whole room as it flies off over her head
  { id: 'gtr-out', flash: true, slam: true, mute: ['guitar.'], ...SF(8, 'emo-guitar-cat', gtrOut, { print: centre(0, 0.8), fill: 0.84, toFill: 0.5 }) },
  // Thiccums plays it with his butt (the music stops: his own bounce, his own tempo)
  // (two shots: the fall into the crack, then the last bounces and the launch; framed on HIS box: the guitar falls into
  // him from above the room inside his own drawing)
  { group: 'thicc', hand: ['or play it', 'with your butt.'], wipe: true, sfxGain: 1.9, shots: [
    SF(4, 'emo-guitar-thicc', thiccA, { on: 'body', print: R(1.3), fill: 0.66, push: 1.0 }),
    SF(8, 'emo-guitar-thicc', thiccB, { on: 'body', print: R(1.3), fill: 0.66, push: 0.94 })] },

  // ---- the mirror selfie: a pet a shot, each flash on a beat ----
  { group: 'selfie', title: ['THE MIRROR', 'SELFIE'], sub: "say cheese. don't smile.", wipe: true, sfxGain: 2.2, shots: [
    SF(3, 'emo-selfie-cat', landing(shutterAt('emo-selfie-cat', 0), 1.5, 1.6), { print: R(-1.2), fill: 0.82 }),
    SF(2, 'emo-selfie-frog', landing(shutterAt('emo-selfie-frog', 1), 1, 2.6), { print: R(-1.2), fill: 0.82 }),
    SF(2, 'emo-selfie-sahur', landing(shutterAt('emo-selfie-sahur', 2), 1, 3.6), { print: R(-1.2), fill: 0.88 }),
    SF(2, 'emo-selfie-thicc', landing(shutterAt('emo-selfie-thicc', 1), 1, 2.6), { print: R(-1.2), fill: 0.82 }),
    SF(3, 'emo-selfie-r3', landing(cueAt('emo-selfie-r3', 'whoosh', 1), 1, 5.8), { print: R(-1.2), fill: 0.82, push: 0.92 })] },

  // ---- the band: all five strumming the same bar, five prints ----
  { id: 'band', layout: 'grid', beats: 8, stagger: 0.25, mute: true, title: 'SEVEN ITEMS. FIVE PETS.', sub: 'not a phase.',
    tiles: PETS5.map((p, i) => (p === 'thicc'
      ? tile('emo-guitar-thicc', (cueAt('emo-guitar-thicc', 'boing', 0) ?? 600) / 1000 + 1.4, 8, i, 0.74, { on: 'body' })
      : tile(`emo-guitar-${p}`, riffFrom(p, 1), 8, i, 0.8))) },

  // ---- the end: each pet's face in a circle, the pack's name, where ----
  { id: 'end', layout: 'emoend', beats: 16, mute: true, sub: 'Coming soon to the item shop. For $EMO holders.', url: 'emogotchi.emonad.lol',
    faces: PETS5.map((p) => face(`emo-hero-${p}`, 2.6)) },
];

/**
 * The soundtrack, in film beats (compose.js `song` renders it). Sections: `clean` (a clean guitar picking Em, the rain),
 * `phase` (a hit on each word, then a snare roll and a riser into the drop), `riff` (drums, bass, the electric riff),
 * `kit` (drums and bass only: a pet is playing the riff itself), `pickup` (half-time, building), `ring` (one big chord
 * left to ring), `rest` (nothing), `band` (the riff, driving), `outro` (the last hit, then the clean guitar again).
 */
const SONG = [
  { at: 0, beats: 8, kind: 'intro' },      // the diary: rain and the clean guitar
  { at: 8, beats: 8, kind: 'phase' },      // a hit on each word, a roll, a riser
  { at: 16, beats: 16, kind: 'drop' },     // the pack and the pets: the riff, the hook
  { at: 32, beats: 16, kind: 'verse' },    // the five, the beanie, the fit: palm-muted, the clean guitar over it
  { at: 48, beats: 16, kind: 'drop2' },    // the lip rings, the wristbands: the riff again, the hook's answer
  { at: 64, beats: 8, kind: 'break' },     // the bedroom: the band stops, rain on the window
  { at: 72, beats: 8, kind: 'pickup' },    // the guitar falls and is picked up: half time, a build
  { at: 80, beats: 16, kind: 'riff' },     // they shred: the chorus
  { at: 96, beats: 8, kind: 'ring', hit: 1 },   // the last chord, ringing under the throw
  { at: 104, beats: 12, kind: 'rest' },    // Thiccums: his own bounce, no song
  { at: 116, beats: 12, kind: 'verse2', duck: -2 },  // the selfies: a light groove, the shutters on top
  { at: 128, beats: 8, kind: 'band' },     // all five: the chorus's end
  { at: 136, beats: 16, kind: 'outro' },   // the end card: one last chord, the clean guitar, the rain
];

export function build() {
  // shots of a group become clips of their own, carrying the group's start (its type is set once, over all of them)
  const flat = [];
  for (const c of CLIPS()) {
    if (!c.shots) { flat.push(c); continue; }
    const { shots, group, ...rest } = c;
    shots.forEach((s, i) => flat.push({ ...rest, ...s, id: `${group}-${i}`, group, first: i === 0, glitch: i > 0 || rest.glitch, wipe: i === 0 && rest.wipe }));
  }
  let at = 0;
  const groups = {};
  const clips = flat.map((c) => {
    const start = Math.round(at * BEAT);
    at += c.beats;
    const len = Math.round(at * BEAT) - start;
    if (c.group && groups[c.group] === undefined) groups[c.group] = start;
    return { ...c, start, len, lenMs: len * 1000 / 60, gstart: c.group ? groups[c.group] : start };
  });
  // each group's whole length, for its type's timing
  for (const c of clips) if (c.group) c.glen = clips.filter((k) => k.group === c.group).reduce((s, k) => s + k.len, 0);
  return { fps: 60, frames: Math.round(at * BEAT), clips, style: 'emo', beat: BEAT, song: SONG, songLevel: -15, sfxPeak: 0.62 };
}
