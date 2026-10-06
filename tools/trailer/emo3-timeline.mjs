// The third emo pack trailer's cut (render.mjs with TIMELINE=tools/trailer/emo3-timeline.mjs RAW=trailer/emo/raw
// DIST=trailer/emo/dist3). A music video on the pets' own riff (a beat 350 ms, 21 frames, 171.4 bpm, E5 C5 G5 D5): a
// diary page; the cat going emo a piece a beat; IT'S NOT A PHASE; the pack; the five; every pet going emo at once; the
// pieces; the guitar, the riff, the last chord and the throw in slow motion; Thiccums; the selfies on a flip phone and
// the photo dump; then THE BAND: all five in one bedroom (cut out of their own takes), the riff together, five guitars
// thrown at once; the end card. Every word on screen is DRAFT copy the operator has not signed off.
// The second trailer's takes (emo-takes.mjs) and framing (emo-timeline.mjs) are reused; the new takes are
// emo3-takes.mjs's; the band is placed from trailer/emo/band3.json (tools/trailer/emo3-band.py).
import { readFileSync, existsSync } from 'node:fs';
import { BEAT, SPB, RIGHT, GRID, SF, tile, face, HEAD, R, centre, riffFrom, cueAt, finaleAt, shutterAt, landing, cuesOf, aimBox, fit, boxOver } from './emo-timeline.mjs';
import { solve } from './emo-frame.mjs';

export { boxOver };
export const SAFE = { print: [0.035, 0.045, 0.965, 0.955], caption: [0.44, 0.05, 0.965, 0.95], tile: [0.04, 0.05, 0.96, 0.95] };
const PETS5 = ['cat', 'frog', 'sahur', 'thicc', 'r3'];
const S = (beats, o) => ({ beats, ...o });

// ---------- the transformation: a piece a beat ----------
// (the takes press a piece every 350 ms from 1.2 s: the beanie, the lip rings, the clothes, the wristbands, the room)
const XF = 1.2;
const xpops = (first) => ['+ BEANIE', '+ SNAKEBITES', '+ THE FIT', '+ WRISTBANDS', '+ THE BEDROOM'].map((text, i) => ({ at: first + i, text }));

// ---------- the band: five cut-outs in one room ----------
const BAND = existsSync('trailer/emo/band3.json') ? JSON.parse(readFileSync('trailer/emo/band3.json', 'utf8')) : null;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// where each goes: two rows, the tall two at the back (smaller, higher), the cat in the middle at the front
// (measured widths at full size, of the room's: the cat 0.30, the frok 0.27, Thiccums 0.38, Sahur 0.31, the r3tard 0.29:
// the front row alone was 0.95 of the room, so the band is drawn at 0.85 in front and 0.72 behind, 0.84 of it in all)
const SLOT = { frog: { fx: 0.2, row: 0 }, cat: { fx: 0.47, row: 0 }, thicc: { fx: 0.76, row: 0 }, sahur: { fx: 0.335, row: 1 }, r3: { fx: 0.615, row: 1 } };
const ROWS = [{ s: 0.85, dy: 0.012 }, { s: 0.72, dy: -0.065 }];
function band(beats) {
  if (!BAND) return S(beats, { layout: 'title', words: [{ text: 'THE BAND (not measured yet)', at: 0 }] });
  const any = BAND['emo3-band-cat'], PWX = any.w, PHX = any.h;
  const members = [], placed = [];
  // the floor every take shares: the middle of its pets' feet
  const floor = median(PETS5.map((p) => median(BAND[`emo3-band-${p}`].boxes.map((b) => b[4]))));
  for (const p of PETS5) {
    const m = BAND[`emo3-band-${p}`], fps = m.fps;
    const riffF = (m.riffMs / 1000) * fps, endF = ((m.endMs ?? m.riffMs + 5720) / 1000) * fps;
    // (while it plays: its middle, and its feet)
    const playing = m.boxes.filter((b) => b[0] >= riffF && b[0] <= endF);
    const ax = median(playing.map((b) => (b[1] + b[3]) / 2)), ay = median(playing.map((b) => b[4]));
    const sl = SLOT[p], s = ROWS[sl.row].s, x = sl.fx * PWX, y = floor + ROWS[sl.row].dy * PHX;
    members.push({ take: `emo3-band-${p}`, from: m.riffMs / 1000, ax, ay, x, y, s, left: p === 'sahur' ? 1100 : 0, z: sl.row ? (p === 'sahur' ? 0 : 1) : { frog: 2, cat: 3, thicc: 4 }[p] });
    // what the camera has to keep whole: each pet as placed, from its riff to just after its last chord (the throws that
    // follow fly up off the top of the room, as they should)
    const keep = m.boxes.filter((b) => b[0] >= riffF && b[0] <= endF + 0.25 * fps);
    for (const b of keep) placed.push([x + (b[1] - ax) * s, y + (b[2] - ay) * s, x + (b[3] - ax) * s, y + (b[4] - ay) * s]);
  }
  const u = placed.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const box = [u[0] / PWX, u[1] / PHX, u[2] / PWX, u[3] / PHX];
  const opt = { boxAR: 16 / 9, safe: [0.04, 0.06, 0.96, 0.94], at: 0.5, ay: 0.5, zmin: 1, zmax: 3 };
  const a = fit(box, { ...opt, fill: 0.78 }), b = fit(box, { ...opt, fill: 0.86 });
  return S(beats, { layout: 'band', plate: 'emo3-plate', plateFrom: 0.5, members, cam: [a.zoom, b.zoom], focus: [...a.focus, ...b.focus], box, mute: true });
}

// ---------- the slow motion: the cat's last chord at speed, then her throw three times slower ----------
const SLOWTAKE = 'emo3-slow-cat';
const slowEnd = cuesOf(SLOWTAKE).find((c) => c.name === 'band.end')?.t ?? 489;   // her last chord, ms into the take
const slowFrom = slowEnd / 1000, slowFrom2 = slowFrom + 2 * SPB / 1000;   // (2 beats at three times the speed: 0.7 s of hers)
// (framed on the same stretch of her normal-speed take: the same scene, the same moments after the last chord)
const gtrEnd = (finaleAt('emo-guitar-cat') ?? 11860) / 1000;
const slowA = SF(2, 'emo-guitar-cat', gtrEnd, { print: centre(0, 0.8), fill: 0.8, push: 1 });
const slowB = SF(10, 'emo-guitar-cat', gtrEnd + 0.7, { print: centre(0, 0.8), fill: 0.74, push: 1.06 });
const whoosh = cuesOf(SLOWTAKE).find((c) => c.name === 'whoosh' && c.t > slowEnd)?.t ?? 1690;
// (the beat of the section the guitar leaves her hand on: 2 beats at speed, then 21 frames a beat of 180 a page second)
const releaseBeat = 2 + ((whoosh / 1000 - slowFrom2) * 180) / BEAT;

const CLIPS = [
  // ---- a diary page, the rain, the clean guitar ----
  { id: 'diary', layout: 'diary', beats: 8, mute: true, fadeIn: true, lines: [
    { text: 'dear diary,', at: 0.5, size: 92 }, { text: 'everyone says', at: 2.5 }, { text: "it's just a phase.", at: 4 }, { text: 'watch this.', at: 6, size: 96, pink: true }] },
  // ---- the cat goes emo, a piece a beat; the room turns into the bedroom ----
  { id: 'xform', ...SF(12, 'emo3-xform-cat', XF - 2 * SPB / 1000, { print: R(-1.3), fill: 0.62, push: 1.04 }), layout: 'xform', pops: xpops(2), flipAt: 6, flashes: [6], splits: [2, 3, 4, 5], leak: 60, mute: ['ui.'] },
  { id: 'phase', layout: 'title', beats: 8, words: [{ text: "IT'S", at: 0 }, { text: 'NOT', at: 1 }, { text: 'A', at: 2 }, { text: 'PHASE.', at: 3, pink: true }], shake: true },

  // ---- the drop: the pack, the five, every pet going emo at once ----
  { id: 'logo', layout: 'title', beats: 4, logo: true, glitch: true, flash: true, leak: 70, sub: 'for Emogotchi' },
  ...[['cat', 'THE CAT'], ['frog', 'THE FROK'], ['sahur', ['TUNG TUNG', 'TUNG SAHUR']], ['thicc', 'THICCUMS'], ['r3', 'THE R3TARD']].map(([p, name], i) =>
    ({ id: `hero-${p}`, glitch: true, slam: true, name, ...SF(2, `emo-hero-${p}`, 0.25, { print: R(i % 2 ? -1.3 : 1.3), fill: 0.74, push: 0.96 }) })),
  { id: 'xgrid', layout: 'grid', beats: 10, stagger: 0.12, mute: true, title: 'ANY PET. FULL EMO.', flashes: [5], splits: [1, 2, 3, 4],
    tiles: PETS5.map((p, i) => tile(`emo3-xform-${p}`, XF - SPB / 1000, 10, i, 0.78)) },

  // ---- the pieces ----
  { group: 'beanie', title: 'THE BEANIE', sub: 'black emo hair included', wipe: true, shots:
    ['frog', 'thicc', 'r3'].map((p) => SF(2, `emo-hero-${p}`, 2.2, { ...HEAD, fill: 0.8 })) },
  { group: 'lips', title: 'SNAKEBITES', sub: 'they move with every mouth', shots:
    [['frog', 2], ['sahur', 2], ['r3', 2]].map(([p, n]) => SF(n, `emo-lip-${p}`, 0.6, { ...HEAD, fill: 0.84, push: 1.05 })) },
  { group: 'fit', title: 'THE FIT', sub: 'stripes, hoodies, skinny jeans, checkered slip-ons', shots:
    ['cat', 'sahur'].map((p) => SF(2, `emo-guitar-${p}`, 0.1, { print: R(1.2), fill: 0.82 })) },
  { group: 'room', title: ['THE EMO', 'BEDROOM'], sub: 'fairy lights. rain on the window.', shots: [
    SF(4, 'emo-intro', 2.6, { print: R(1.4), fill: 0.5, push: 0.96 })] },

  // ---- the guitar ----
  { group: 'gtr-in', title: 'THE GUITAR', sub: 'it falls from the sky. they pick it up.', wipe: true, shots: [
    SF(4, 'emo-guitar-cat', landing(cueAt('emo-guitar-cat', 'thud', 0), 2, 0.4), { print: R(-1.3), fill: 0.7, push: 1.03, extra: boxOver('emo-guitar-cat', landing(cueAt('emo-guitar-cat', 'thud', 0), 2, 0.4) + 2 * SPB / 1000, 2, 'props') ?? undefined }),
    SF(4, 'emo-guitar-cat', riffFrom('cat', 0) - 4 * SPB / 1000, { print: R(-1.3), fill: 0.78, drift: true, props: true })] },
  ...['cat', 'frog', 'sahur', 'r3'].map((p, i) => ({ id: `riff-${p}`, pulse: true, slam: true, glitch: i > 0, mute: ['guitar.', 'band.'], tag: i === 0 ? 'THEY SHRED' : null,
    ...SF(4, `emo-guitar-${p}`, riffFrom(p, i), { print: centre([90, -60, 60, -60][i], [1.6, -1.8, 1.4, -1.6][i]), fill: 0.84 }) })),
  // the last chord at speed, then the throw three times slower (the take filmed at 180 a second); the music holds its breath
  { id: 'slow-a', ...slowA, take: SLOWTAKE, from: slowFrom, speed: 3, flash: true, slam: true, mute: true },
  { id: 'slow-b', ...slowB, take: SLOWTAKE, from: slowFrom2, speed: 1, mute: true, tag: 'SLOW MO', tagTop: true, leak: 120 },
  // Thiccums plays it with his butt (the music stops: his own bounce, his own tempo)
  { group: 'thicc', hand: ['or play it', 'with your butt.'], wipe: true, sfxGain: 1.9, mute: ['band.', 'music.'], shots: [
    SF(4, 'emo-guitar-thicc', landing(cueAt('emo-guitar-thicc', 'boing', 0), 1, 0.27), { on: 'body', print: R(1.3), fill: 0.66, push: 1.0 }),
    SF(8, 'emo-guitar-thicc', landing(cueAt('emo-guitar-thicc', 'boing', 1), 5, 3.8), { on: 'body', print: R(1.3), fill: 0.66, push: 0.94 })] },

  // ---- the mirror selfie, on a flip phone's screen: a flash on every beat it shoots ----
  { group: 'selfie', title: ['THE MIRROR', 'SELFIE'], sub: "say cheese. don't smile.", wipe: true, sfxGain: 2.2, shots: [
    ['cat', 0, 'IMG_0417'], ['frog', 1, 'IMG_0418'], ['sahur', 2, 'IMG_0419'], ['thicc', 1, 'IMG_0420'], ['r3', 0, 'IMG_0421']].map(([p, k, shot]) => {
    const s = SF(2, `emo-selfie-${p}`, landing(shutterAt(`emo-selfie-${p}`, k), 1, 2.6), { print: R(-1.2), fill: 0.8 });
    return { ...s, layout: 'viewfinder', shot, flashes: [1] };
  }) },
  // the photo dump: the five shots as polaroids, a beat apart
  { id: 'dump', layout: 'dump', beats: 10, mute: true, stagger: 1, title: 'PHOTO DUMP.', titleAt: 6, bursts: [0, 1, 2, 3, 4],
    pics: [['cat', 0, 'rawr xD'], ['frog', 1, '3am again'], ['sahur', 2, 'no filter'], ['thicc', 1, 'mood'], ['r3', 0, 'not a phase']].map(([p, k, cap], i) => {
      // (0.45 s after the shutter: the pose still held, the room's own camera flash faded; at 0.12 it washed the print out)
      const at = (shutterAt(`emo-selfie-${p}`, k) ?? 2000) / 1000 + 0.45;
      const r = fit(aimBox(`emo-selfie-${p}`, {}, at - 0.1, 0.6), { boxAR: 1, safe: [0.05, 0.05, 0.95, 0.95], fill: 0.8, zmin: 1, zmax: 4 });
      return { take: `emo-selfie-${p}`, at, zoom: r.zoom, focus: r.focus, x: [250, 625, 960, 1295, 1670][i], y: [450, 505, 440, 515, 460][i], rot: [-6, 4, -2, 5, -4][i], size: 360, cap };
    }) },

  // ---- THE BAND: all five in one bedroom ----
  { id: 'band-title', layout: 'title', beats: 4, words: [{ text: 'AND', at: 0 }, { text: 'NOW', at: 1 }, { text: 'THE', at: 2 }, { text: 'BAND.', at: 3, pink: true }], shake: true },
  { id: 'band', ...band(20), bursts: [0, 8], flashes: [16.343], splits: [0, 16.343], leak: 90 },

  // ---- the end: each pet's face in a circle, the pack's name, where ----
  { id: 'end', layout: 'emoend', beats: 16, mute: true, sub: 'Coming soon to the item shop. For $EMO holders.', url: 'emogotchi.emonad.lol',
    faces: PETS5.map((p) => face(`emo-hero-${p}`, 2.6)) },
];

/** The soundtrack (emo-song.js), in film beats: see that file for what each section kind plays. */
const SONG = [
  { at: 0, beats: 8, kind: 'intro' },      // the diary: rain and the clean guitar
  { at: 8, beats: 12, kind: 'xform', pops: [2, 3, 4, 5], flip: 6 },   // a piece a beat, the room goes dark
  { at: 20, beats: 8, kind: 'phase' },     // a hit on each word, a roll, a riser
  { at: 28, beats: 24, kind: 'drop' },     // the pack, the five, every pet going emo: the riff, the hook
  { at: 52, beats: 20, kind: 'verse' },    // the pieces: palm-muted, the clean guitar over it
  { at: 72, beats: 8, kind: 'pickup' },    // the guitar falls and is picked up: half time, a build
  { at: 80, beats: 16, kind: 'riff' },     // they shred
  { at: 96, beats: 12, kind: 'slow', hit: 0, release: Math.round(releaseBeat * 100) / 100 },   // the last chord; slow motion; the throw
  { at: 108, beats: 12, kind: 'rest' },    // Thiccums: his own bounce, no song
  { at: 120, beats: 20, kind: 'verse2', duck: -2 },   // the selfies and the photo dump
  { at: 140, beats: 4, kind: 'build' },    // AND NOW THE BAND: a fill
  { at: 144, beats: 16, kind: 'band3' },   // all five: the riff, the hook and its twin
  { at: 160, beats: 4, kind: 'ring', hit: 0.343 },   // their last chord (0.12 s after the bar: the pets' own), the throws
  { at: 164, beats: 16, kind: 'outro' },   // the end card
];

export function build() {
  const flat = [];
  for (const c of CLIPS) {
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
  for (const c of clips) if (c.group) c.glen = clips.filter((k) => k.group === c.group).reduce((s, k) => s + k.len, 0);
  return { fps: 60, frames: Math.round(at * BEAT), clips, style: 'emo', beat: BEAT, song: SONG, songLevel: -15, sfxPeak: 0.62 };
}
