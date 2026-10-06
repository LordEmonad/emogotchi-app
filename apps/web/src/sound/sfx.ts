// Every sound effect on the site, by name. Each is a small recipe over dsp.ts (a few oscillators, some filtered
// noise), written to sit together: soft attacks, short tails, pitches taken from one scale (A minor pentatonic and its
// relative major) so that chimes ringing over the music never clash with it.
//
// A recipe takes where to make the sound (C) and how (CueOpts: rate = pitch, dur, n, gap) and returns how long it
// lasts in seconds. Loudness between sounds is set in levels.ts, measured, not guessed: tools/sound-levels.mjs renders
// every sound and writes the table.

import type { CueOpts } from './cue';
import { bell, coo, echoing, hiss, hz, later, midi, mul, panned, pluckOf, rng, scaled, tone, type C, type F } from './dsp';

export type Syn = (c: C, o: CueOpts) => number;

const N = (name: string) => hz(midi(name));
const k = (o: CueOpts) => o.rate ?? 1;
/** A number that differs a little each time, the same way for the same moment (so an offline render repeats). */
const jit = (c: C, i = 0) => { const x = Math.sin((c.t + i * 0.137) * 9173.7) * 43758.5453; return x - Math.floor(x); };
const pick = <T,>(c: C, list: readonly T[], i = 0) => list[Math.floor(jit(c, i) * list.length) % list.length]!;

// the chimes' notes: A minor pentatonic, high
const PENTA = ['a5', 'c6', 'd6', 'e6', 'g6', 'a6', 'c7', 'd7', 'e7'].map(N);

// ---------- small shared pieces ----------

const thud = (c: C, f = 110, v = 0.6, d = 0.16) => {
  tone(c, { f: [[0, f], [d * 0.7, f * 0.42]], d, v, a: 0.002 });
  hiss(c, { f: 420, kind: 'lowpass', d: d * 0.5, v: v * 0.5, a: 0.001 });
  return d + 0.03;
};
const whoosh = (c: C, dur = 0.3, lo = 420, hi = 2400, v = 0.3, q = 1.3) =>
  hiss(c, { f: [[0, lo], [dur * 0.55, hi], [dur, lo * 1.3]], q, a: dur * 0.45, d: dur * 0.55, v });
const click = (c: C, f = 3200, v = 0.3, d = 0.012) => hiss(c, { f, q: 1.5, a: 0.0005, d, v });
const chime = (c: C, f: number, v = 0.2, d = 0.45, at = 0) => bell(c, { f, at, d, v, ratio: 4, index: 0.9, bite: 0.25 });
const drop = (c: C, f = 800, v = 0.2, at = 0) => tone(c, { f: [[0, f], [0.05, f * 1.9]], at, a: 0.002, d: 0.07, v });
const knock = (c: C, f = 620, v = 0.45, at = 0) => {
  tone(c, { f: [[0, f], [0.05, f * 0.8]], at, a: 0.001, d: 0.07, v });
  tone(c, { f: f * 2.7, at, a: 0.001, d: 0.025, v: v * 0.35 });
  hiss(c, { f: f * 1.6, q: 3, at, a: 0.0005, d: 0.018, v: v * 0.5 });
  return at + 0.1;
};
const coin = (c: C, at = 0, kk = 1, v = 0.22) => {
  const w = echoing(c, 0.2);
  bell(w, { f: N('e7') * kk, at, d: 0.32, v, ratio: 2.76, index: 1.6, bite: 0.2 });
  bell(w, { f: N('b7') * kk, at: at + 0.035, d: 0.4, v: v * 0.8, ratio: 2.76, index: 1.2, bite: 0.2 });
  return at + 0.5;
};
const flap = (c: C, at = 0, big = 1, v = 0.3) =>
  hiss(c, { f: [[0, 320 / big], [0.05 * big, 1100 / big], [0.11 * big, 280 / big]], kind: 'lowpass', q: 0.8, at, a: 0.02 * big, d: 0.1 * big, v });
const arp = (c: C, notes: readonly number[], gap: number, v = 0.2, d = 0.5) => {
  const w = echoing(c, 0.3);
  notes.forEach((f, i) => chime(w, f, v, d, i * gap));
  return notes.length * gap + d;
};

// ---------- the pets' voices ----------
// Soft and small, more cartoon than animal (the operator, of the first set: "too robotic or buzzy", "should be
// cuter"). One throat per pet: its pitch, how round it is, how its mouth opens; each mood is a little tune through it.

type Throat = {
  /** its own pitch, Hz: every mood's line is in multiples of this */
  base: number;
  /** 2 = round, 4 = reedy */
  bright: number;
  /** the mouth: shut, open, shut again (Hz) */
  wah: readonly [number, number, number];
  /** a wobble in the pitch: [times a second, share of the pitch] */
  trill?: readonly [number, number];
  /** a soft roll in the loudness (a croak): [times a second, 0..1] */
  pulse?: readonly [number, number];
  air?: number;
  v: number;
  /** a pet with no measured levels of its own (levels.ts): whose to use instead, the nearest voice */
  levels?: string;
};
// a small bright "mew"
const CAT_THROAT: Throat = { base: 740, bright: 2.8, wah: [950, 2000, 1250], air: 0.04, v: 0.6 };
const THROATS: Record<string, Throat> = {
  cat: CAT_THROAT,
  // a round "bwip", with a little roll in it
  frog: { base: 255, bright: 2.2, wah: [520, 1150, 640], pulse: [27, 0.4], v: 0.9 },
  // a hollow, woody "ho"
  sahur: { base: 172, bright: 2, wah: [380, 720, 430], v: 1 },
  // a squeaky "ap!"
  thiccums: { base: 440, bright: 3, wah: [720, 1550, 900], v: 0.7 },
  // a low, wobbly "duh"
  r3tards: { base: 205, bright: 2.2, wah: [430, 820, 500], trill: [5.5, 0.025], v: 0.9 },
  // a deadpan, breathy "mm" (dev builds, and a production build only with his switch on: before that no line of him ships)
  ...(import.meta.env.DEV || __EMONAD__ ? { emonad: { base: 186, bright: 2.1, wah: [400, 780, 470] as const, air: 0.07, v: 0.95, levels: 'r3tards' } } : {}),
};
THROATS.seal = THROATS.thiccums!;
const throat = (who?: string) => THROATS[who ?? 'cat'] ?? CAT_THROAT;

/** One syllable: a pitch line (as multiples of the pet's own pitch) through its throat. */
function say(c: C, who: string | undefined, line: readonly [readonly [number, number], ...(readonly [number, number])[]], d: number, x: { at?: number; v?: number; vib?: readonly [number, number]; open?: number; a?: number } = {}) {
  const m = throat(who);
  const open = x.open ?? 1;
  return coo(c, {
    f: mul(line, m.base), bright: m.bright, air: m.air, pulse: m.pulse,
    wah: [[0, m.wah[0] * open], [d * 0.35, m.wah[1] * open], [d, m.wah[2] * open]],
    trill: x.vib ?? (m.trill ? [m.trill[0], m.trill[1] * m.base] : undefined),
    at: x.at, a: x.a ?? 0.018, hold: Math.max(0, d - 0.1), d: 0.1, v: (x.v ?? 1) * m.v,
  });
}

const VOICE: Record<string, (c: C, who: string | undefined, kk: number) => number> = {
  // glad: up and bright
  happy: (c, who) => {
    if (who === 'frog') { say(c, who, [[0, 1], [0.1, 1.2]], 0.12); return say(c, who, [[0, 1.35], [0.12, 1.25]], 0.14, { at: 0.17 }); }
    if (who === 'sahur') { say(c, who, [[0, 1], [0.1, 1.05]], 0.12); return say(c, who, [[0, 1.3], [0.14, 1.26]], 0.16, { at: 0.18 }); }
    if (who === 'thiccums' || who === 'seal') { say(c, who, [[0, 1.1], [0.1, 0.9]], 0.11); return say(c, who, [[0, 1.2], [0.1, 0.95]], 0.12, { at: 0.17 }); }
    if (who === 'r3tards') { say(c, who, [[0, 1], [0.09, 0.92]], 0.1); say(c, who, [[0, 1.12], [0.09, 1]], 0.1, { at: 0.15 }); return say(c, who, [[0, 1.2], [0.12, 1.02]], 0.13, { at: 0.3 }); }
    return say(c, who, [[0, 0.9], [0.07, 1.45], [0.2, 1.3]], 0.2, { vib: [26, 26] });   // "mrrp!", with the roll in it
  },
  // a hello, softer than glad
  hello: (c, who) => {
    if (who === 'frog') return say(c, who, [[0, 1], [0.14, 1.25]], 0.16, { v: 0.8 });
    if (who === 'sahur') return say(c, who, [[0, 1.05], [0.16, 1.2]], 0.18, { v: 0.8 });
    if (who === 'thiccums' || who === 'seal') return say(c, who, [[0, 1.15], [0.11, 0.9]], 0.12, { v: 0.8 });
    if (who === 'r3tards') return say(c, who, [[0, 0.95], [0.16, 1.1]], 0.18, { v: 0.8 });
    return say(c, who, [[0, 0.95], [0.1, 1.3], [0.28, 1.05]], 0.28, { v: 0.8 });   // "mew"
  },
  // yum: a short pleased one
  yum: (c, who) => {
    if (who === 'cat' || !who) return say(c, who, [[0, 1.05], [0.06, 1.35], [0.16, 1.2]], 0.15, { v: 0.7 });
    return say(c, who, [[0, 1.05], [0.12, 1.22]], 0.13, { v: 0.8 });
  },
  // unhappy: down and slow
  sad: (c, who) => {
    if (who === 'frog') return say(c, who, [[0, 0.82], [0.4, 0.66]], 0.42, { v: 0.8 });
    if (who === 'sahur') return say(c, who, [[0, 1.05], [0.5, 0.8]], 0.5, { v: 0.8 });
    if (who === 'thiccums' || who === 'seal') return say(c, who, [[0, 1.6], [0.15, 1.75], [0.55, 1.2]], 0.55, { v: 0.6, vib: [6, 10] });
    if (who === 'r3tards') return say(c, who, [[0, 1.15], [0.5, 0.74]], 0.52, { v: 0.8 });
    return say(c, who, [[0, 1.15], [0.12, 1.25], [0.55, 0.78]], 0.55, { v: 0.75, vib: [5.5, 8] });   // "meeew"
  },
  // hurt: sharp
  ouch: (c, who) => {
    if (who === 'frog') return say(c, who, [[0, 2.1], [0.05, 2.6], [0.16, 1.5]], 0.16);
    if (who === 'sahur') return say(c, who, [[0, 1.5], [0.2, 1]], 0.2);
    if (who === 'thiccums' || who === 'seal') return say(c, who, [[0, 1.9], [0.06, 2.8], [0.2, 1.6]], 0.2);
    if (who === 'r3tards') return say(c, who, [[0, 1.6], [0.05, 1.8], [0.22, 0.95]], 0.22);
    return say(c, who, [[0, 1.5], [0.05, 2.1], [0.22, 1.2]], 0.22, { open: 1.15 });   // "yow!"
  },
  // frightened: long, high, shaking
  alarm: (c, who) => {
    if (who === 'frog') { for (let i = 0; i < 4; i++) say(c, who, [[0, 1.9], [0.08, 2.3]], 0.09, { at: i * 0.14 }); return 0.6; }
    const top = who === 'sahur' ? 1.7 : who === 'r3tards' ? 1.8 : 1.9;
    return say(c, who, [[0, top * 0.8], [0.1, top], [0.6, top * 0.9], [0.75, top * 0.6]], 0.75, { vib: [8, throat(who).base * 0.06], open: 1.15 });
  },
  // a yawn: up, then a long way down
  yawn: (c, who) => say(c, who, [[0, 0.9], [0.3, 1.3], [0.95, 0.62]], 0.95, { v: 0.55, a: 0.12, open: 1.1 }),
  // straining
  effort: (c, who, kk) => say(c, who, [[0, 0.72 * kk], [0.24, 0.8 * kk]], 0.24, { v: 0.6, vib: [24, 6] }),
  // a small questioning sound
  huh: (c, who) => say(c, who, [[0, 1], [0.16, 1.4]], 0.17, { v: 0.7 }),
  // unimpressed
  meh: (c, who) => say(c, who, [[0, 1], [0.25, 0.8]], 0.26, { v: 0.7 }),
  // a little laugh
  giggle: (c, who) => { for (let i = 0; i < 3; i++) say(c, who, [[0, 1.3 + i * 0.08], [0.07, 1.15 + i * 0.08]], 0.08, { at: i * 0.11, v: 0.75 }); return 0.4; },
};

// ---------- the electric guitar (the emo pack) ----------
// The operator: "make sure its like an electric guitar emo riff". So: power chords (root, fifth, octave, the fifth on
// top: what an overdriven amp keeps clean; a third under distortion turns to mud) of the emo four, Em C G D, played
// through a little amp, open hits ringing and palm-muted chugs between them (the director chooses which, per stroke).
const POWER: readonly (readonly string[])[] = [
  ['e2', 'b2', 'e3', 'b3'],     // E5
  ['c3', 'g3', 'c4', 'g4'],     // C5
  ['g2', 'd3', 'g3', 'd4'],     // G5
  ['d3', 'a3', 'd4', 'a4'],     // D5
];
/** Drive curves, made once per context: tanh at a strength `k`, a little lopsided (`asym`, the even harmonics a valve
 *  adds), normalised to ±1. */
const CURVES = new WeakMap<BaseAudioContext, Map<string, Float32Array<ArrayBuffer>>>();
function driveCurve(ac: BaseAudioContext, k: number, asym: number) {
  let m = CURVES.get(ac); if (!m) { m = new Map(); CURVES.set(ac, m); }
  const key = `${k}:${asym}`;
  let cv = m.get(key);
  if (!cv) {
    const n = 4096; cv = new Float32Array(new ArrayBuffer(n * 4)); let mx = 0;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(k * (x + asym)) - Math.tanh(k * asym); mx = Math.max(mx, Math.abs(cv[i]!)); }
    for (let i = 0; i < n; i++) cv[i] = cv[i]! / mx;
    m.set(key, cv);
  }
  return cv;
}
const biq = (ac: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7, gain = 0) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
/**
 * One stroke of the electric: its strings, a few ms apart in the stroke's direction (low to high going down), played
 * TWICE, one take to each side, a little apart in time and tune, each through its own amp: the double-tracked wall of
 * an emo record. The amp (voiced by measurement, tools/sound-studio.mjs + sound-spectrum.py: the first one, a single
 * soft clip in the middle, measured all 1-2 kHz, its body 11 dB down and its lows 19: a small practice amp): a push
 * at 800 Hz into a first drive, a second drive, then the body back (140 and 260 Hz), the presence eased (2.4 kHz) and a
 * cabinet's roll-off from 4.3 kHz, where distortion turns to fizz. Cut off at `d` (the next stroke, or a hand on the
 * strings). `mute`: palm-muted, the strings' top dulled before the amp, short and chunky. Returns how long it lasts.
 */
function electric(c: C, notes: readonly string[], o: { dir: 1 | -1; d: number; v: number; drive: number; mute?: boolean; fade?: number }) {
  const ac = c.ac, t = c.t;
  const gap = o.dir > 0 ? 0.008 : 0.006;
  const order = o.dir > 0 ? notes : [...notes].reverse();
  const len = Math.max(1.6, o.d + 0.2);
  for (const [side, rate, lag, k1] of [[-0.62, 0.99885, 0, 6], [0.62, 1.00115, 0.0055, 6.6]] as const) {
    const pre = ac.createGain(); pre.gain.value = o.drive * 0.13;
    let into: AudioNode = pre;
    if (o.mute) { const pm = biq(ac, 'lowpass', 680, 0.9); pm.connect(pre); into = pm; }
    const s1 = ac.createWaveShaper(); s1.curve = driveCurve(ac, k1, 0.08); s1.oversample = '2x';
    const s2 = ac.createWaveShaper(); s2.curve = driveCurve(ac, 4, -0.04); s2.oversample = '2x';
    const g = ac.createGain();
    g.gain.setValueAtTime(o.v, t); g.gain.setValueAtTime(o.v, t + (o.fade ?? o.d * 0.75)); g.gain.linearRampToValueAtTime(0, t + o.d);
    const chain: AudioNode[] = [pre, biq(ac, 'highpass', 80), biq(ac, 'peaking', 800, 0.7, 3), s1, biq(ac, 'peaking', 650, 0.8, -1.5), s2,
      biq(ac, 'highpass', 70), biq(ac, 'peaking', 130, 0.8, 6.5), biq(ac, 'peaking', 260, 0.9, 3), biq(ac, 'peaking', 2600, 0.8, side < 0 ? -4.5 : -3.5),
      biq(ac, 'lowpass', 3500), biq(ac, 'lowpass', 5600, 0.5), g];
    for (let i = 0; i < chain.length - 1; i++) chain[i]!.connect(chain[i + 1]!);
    const out = typeof ac.createStereoPanner === 'function' ? ac.createStereoPanner() : null;
    if (out) { out.pan.value = side; g.connect(out); out.connect(c.out); } else g.connect(c.out);
    order.forEach((nm, i) => {
      const src = ac.createBufferSource(); src.buffer = pluckOf(ac, N(nm), o.mute ? 0.45 : 0.75, len); src.playbackRate.value = rate;
      const sg = ac.createGain(); sg.gain.value = 0.5 * (1 - i * 0.06);
      src.connect(sg); sg.connect(into);
      src.start(t + lag + i * gap); src.stop(t + o.d + 0.03);
    });
  }
  return o.d + 0.04;
}
/** The three strokes of the riff, by chord (`n`, 0..3: E5 C5 G5 D5). Where a stroke is cut is the only thing that
 *  changes from one to the next. */
type Stroke = 'down' | 'up' | 'mute';
const STROKE = {
  down: (n: number) => ({ notes: POWER[n % 4]!, dir: 1 as const, v: 0.5, drive: 6 }),
  up: (n: number) => ({ notes: POWER[n % 4]!.slice(1), dir: -1 as const, v: 0.36, drive: 5 }),
  mute: (n: number) => ({ notes: POWER[n % 4]!.slice(0, 3), dir: 1 as const, v: 0.42, drive: 4.5, mute: true }),
};
/** How much of each stroke is kept as a recording: the first chord rings out at the end of the song (2.6 s); every
 *  other open stroke is cut by the next within 0.4 s, a chug within 0.16. A longer cut than kept is played live. */
const KEEP: Record<Stroke, (n: number) => number> = { down: (n) => (n % 4 === 0 ? 2.65 : 1), up: () => 1, mute: () => 0.2 };
function stroke(c: C, kind: Stroke, n: number, d: number) {
  const b = BAKES.get(c.ac)?.get(`g:${kind}:${n % 4}`);
  if (b && d <= b.duration) return replay(c, b, 0, d, 1, true);
  void prepBand(c.ac);
  return electric(c, STROKE[kind](n).notes, { ...STROKE[kind](n), d });
}

// ---------- recordings of the sounds that never change (the electric's strokes, the band's bass notes) ----------
// Live, one stroke of the electric is some forty nodes (two takes, each its own amp: two drive stages oversampled, nine
// filters), and Thiccums strums one every 120 ms. Measured on the M3 (Chrome's own renderCapacity): the guitar scene ran
// the audio thread at up to 25% and Thiccums' at 46%, the room tune at 7%; on a slower phone that is a crackle. Every
// stroke and every bass note is the same each time, so the first one played in a context renders them all, once, on
// an OfflineAudioContext (one render, each sound at its own place in it, then cut apart), and from then on each is a
// recording through the same fade: the same samples for a tenth of the work. Until that render is in (about a second
// on a phone) they are played live, as before. The tools that render sound to files run on offline contexts and play
// them live (exact, and no waiting), unless asked (`bakeInTools`, to prove the two the same).
const BAKES = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const BAKING = new WeakMap<BaseAudioContext, Promise<void>>();
let bakeInTools = false;
export const setBakeInTools = (on: boolean) => { bakeInTools = on; };
/** A recording at `at` seconds into the sound, at `v`; `gate`: cut at `d` the way `electric` cuts (held to 75%, then a
 *  fade), else it plays to its end (it has its own). */
function replay(c: C, b: AudioBuffer, at: number, d: number, v: number, gate: boolean) {
  const t = c.t + at, s = c.ac.createBufferSource(); s.buffer = b;
  const g = c.ac.createGain();
  if (gate) { g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + d * 0.75); g.gain.linearRampToValueAtTime(0, t + d); } else g.gain.value = v;
  s.connect(g); g.connect(c.out); s.start(t); s.stop(t + d + 0.03);
  return at + d + 0.04;
}
const bassLen = (beat?: number) => (beat ? 2 : 1) * (beat ? beat / 2 : 0.175) * 0.94;
const bassKey = (f: number, d: number) => `b:${Math.round(f * 100)}:${Math.round(d * 1e4)}`;
/** Render every stroke and bass note for this context, once (resolves when they are in; never rejects). */
export function prepBand(ac: BaseAudioContext): Promise<void> {
  let p = BAKING.get(ac);
  if (p) return p;
  const offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  if (offline && !bakeInTools) return Promise.resolve();
  const sr = ac.sampleRate;
  const jobs: { key: string; secs: number; ch: 1 | 2; make: (c: C) => void }[] = [];
  for (const kind of ['down', 'up', 'mute'] as const) for (let n = 0; n < 4; n++) {
    const keep = KEEP[kind](n);
    // (held through `keep`, then faded over 50 ms past it, outside the cut, so it never runs into the next one)
    jobs.push({ key: `g:${kind}:${n}`, secs: keep, ch: 2, make: (c) => electric(c, STROKE[kind](n).notes, { ...STROKE[kind](n), d: keep + 0.05, fade: keep }) });
  }
  const bass = new Set<string>();
  for (const beat of [undefined, 0.24]) for (const root of BAND_ROOT) for (const x of [1, 2]) {
    const f = N(root) * x, d = bassLen(beat), key = bassKey(f, d);
    if (!bass.has(key)) { bass.add(key); jobs.push({ key, secs: d + 0.02, ch: 1, make: (c) => liveBass(c, f, 0, d, 1) }); }
  }
  jobs.push({ key: bassKey(N('e2'), 2.4), secs: 2.42, ch: 1, make: (c) => liveBass(c, N('e2'), 0, 2.4, 1) });
  p = (async () => {
    try {
      const at: number[] = []; let frames = 0;
      for (const j of jobs) { at.push(frames); frames += Math.ceil((j.secs + 0.12) * sr); }
      const off = new OfflineAudioContext(2, frames, sr);
      const wet = off.createGain();
      jobs.forEach((j, i) => j.make({ ac: off, t: at[i]! / sr, out: off.destination, wet }));
      const all = await off.startRendering();
      const m = new Map<string, AudioBuffer>();
      jobs.forEach((j, i) => {
        const n = Math.ceil(j.secs * sr), b = ac.createBuffer(j.ch, n, sr);
        for (let ch = 0; ch < j.ch; ch++) b.copyToChannel(all.getChannelData(ch).subarray(at[i]!, at[i]! + n), ch);
        m.set(j.key, b);
      });
      BAKES.set(ac, m);
    } catch { /* an old browser: everything stays live, as it was */ }
  })();
  BAKING.set(ac, p);
  return p;
}

// ---------- the band behind the guitar (the emo pack) ----------
// When a pet plays the riff, a drummer and a bass player play it with them: a whole bar at a time, as ONE sound cued on
// the strums' own clock (director.playGuitar), so nothing in it can drift from the strokes. The kit is made sample by
// sample, once per context (the trailer's soundtrack's kit, tools/trailer/emo-song.js): a kick with a beater and a
// pitch drop (and a knock above 100 Hz for a phone's speaker), a snare with its body, wires and crack, hats and a crash
// from six detuned squares (the 808's metal), all through a gentle saturation.
const KIT = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function kitHit(ac: BaseAudioContext, name: 'kick' | 'snare' | 'hat' | 'crash', seed: number) {
  let m = KIT.get(ac); if (!m) { m = new Map(); KIT.set(ac, m); }
  const key = `${name}:${seed}`;
  let b = m.get(key);
  if (b) return b;
  const sr = ac.sampleRate, secs = { kick: 0.5, snare: 0.45, hat: 0.1, crash: 2.4 }[name], n = Math.floor(sr * secs);
  const x = new Float32Array(n), r = rng(seed * 7919 + name.length);
  const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
  const lp1 = (f: number) => { const a = 1 - Math.exp(-2 * Math.PI * f / sr); let y = 0; return (v: number) => (y += (v - y) * a); };
  const hp1 = (f: number) => { const lp = lp1(f); return (v: number) => v - lp(v); };
  if (name === 'kick') {
    let ph = 0; const click = hp1(2500);
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += 2 * Math.PI * (48 + 120 * Math.exp(-t / 0.032) + 40 * Math.exp(-t / 0.006)) / sr;
      const v = Math.sin(ph) * env(t, 0.0015, 0.2) + Math.sin(ph * 2.4) * env(t, 0.0005, 0.012) * 0.35 + Math.sin(ph * 2.1) * env(t, 0.001, 0.05) * 0.25 + click(r() * 2 - 1) * env(t, 0.0002, 0.0025) * 0.55;
      x[i] = Math.tanh(1.7 * v) / Math.tanh(1.7);
    }
  } else if (name === 'snare') {
    let p1 = 0, p2 = 0; const wh = hp1(1700), wl = lp1(9000), cr = hp1(3000), crl = lp1(5000);
    for (let i = 0; i < n; i++) {
      const t = i / sr; p1 += 2 * Math.PI * (178 + 40 * Math.exp(-t / 0.012)) / sr; p2 += 2 * Math.PI * (329 + 30 * Math.exp(-t / 0.01)) / sr;
      const nz = r() * 2 - 1;
      const v = (Math.sin(p1) * env(t, 0.001, 0.075) * 0.75 + Math.sin(p2) * env(t, 0.001, 0.05) * 0.4) * 1.15 + wl(wh(nz)) * env(t, 0.0015, 0.16) * 0.75 + crl(cr(nz)) * env(t, 0.0005, 0.01) * 0.5;
      x[i] = Math.tanh(1.5 * v) / Math.tanh(1.5);
    }
  } else {
    // metal: six squares at inharmonic ratios, with a little noise, high-passed hard
    const ratios = [1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637], base = name === 'hat' ? 410 : 520, ph = ratios.map(() => r());
    const h1 = hp1(name === 'hat' ? 7000 : 3600), h2 = hp1(name === 'hat' ? 7000 : 3600), top = lp1(11000);
    for (let i = 0; i < n; i++) {
      const t = i / sr; let sq = 0;
      for (let k = 0; k < 6; k++) { ph[k] = ph[k]! + base * ratios[k]! / sr; sq += (ph[k]! % 1) < 0.5 ? 1 : -1; }
      const v = top(h2(h1((sq / 6) * (name === 'hat' ? 0.7 : 0.45) + (r() * 2 - 1) * (name === 'hat' ? 0.35 : 0.7))));
      x[i] = v * (name === 'hat' ? env(t, 0.0004, 0.03) : (t < 0.004 ? t / 0.004 : 1) * (0.65 * Math.exp(-t / 0.85) + 0.35 * Math.exp(-t / 0.12)));
    }
  }
  b = ac.createBuffer(1, n, sr); b.copyToChannel(x, 0); m.set(key, b);
  return b;
}
const BAND_ROOT = ['e2', 'c2', 'g2', 'd2'];
/** A hit of the kit at `at` seconds into the sound, at `v`, panned. */
function kit(c: C, name: 'kick' | 'snare' | 'hat' | 'crash', at: number, v: number, pan = 0, seed = 1) {
  const s = c.ac.createBufferSource(); s.buffer = kitHit(c.ac, name, seed);
  const g = c.ac.createGain(); g.gain.value = v;
  s.connect(g);
  const o = panned(c, pan); g.connect(o.out);
  if (name === 'snare' || name === 'crash') { const w = c.ac.createGain(); w.gain.value = 0.25; g.connect(w); w.connect(c.wet); }
  s.start(c.t + at);
}
/** A bass note: a plucked string, its sine under it, a little drive (enough overtone to be heard on a phone). */
function bassNote(c: C, f: number, at: number, d: number, v: number) {
  const b = BAKES.get(c.ac)?.get(bassKey(f, d));
  if (b) { replay(c, b, at, b.duration, v, false); return; }
  void prepBand(c.ac);
  liveBass(c, f, at, d, v);
}
function liveBass(c: C, f: number, at: number, d: number, v: number) {
  const ac = c.ac, t = c.t + at;
  const sh = ac.createWaveShaper(); sh.curve = driveCurve(ac, 1.8, 0); sh.oversample = '2x';
  const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + d * 0.8); g.gain.linearRampToValueAtTime(0, t + d);
  const lp = biq(ac, 'lowpass', 2200), mid = biq(ac, 'peaking', 220, 0.9, 2.5);
  sh.connect(lp); lp.connect(mid); mid.connect(g); g.connect(c.out);
  const s = ac.createBufferSource(); s.buffer = pluckOf(ac, f, 0.42, 1.2);
  const sg = ac.createGain(); sg.gain.value = 0.7; s.connect(sg); sg.connect(sh); s.start(t); s.stop(t + d + 0.02);
  // (at the note's own time: at 0 every note's sine of a bar went off together on its downbeat, one thump)
  tone({ ...c, out: g }, { f, at, a: 0.004, hold: d * 0.6, d: d * 0.4, v: 0.27 });
}
/**
 * A bar of the band under the riff, the bar's own power chord's root in the bass: the kick on 1, the and of 2 and 3, the
 * snare on 2 and 4, eighth hats, the bass on the root in eighths (its octave on the last). `n` is the bar of the riff
 * (0..3): the first comes in on a crash, the last ends in a snare fill into the big last chord.
 * With `beat` (Thiccums' butt bounce: a landing every `beat` seconds, four to a chord, a chug on each rise that is not
 * half way between them) the bar is four landings and everything is on a landing: kick, snare, kick, snare (the punk
 * two-step), the hats and the bass on each landing.
 */
function bandBar(c: C, bar: number, beat?: number) {
  const E = beat ? beat / 2 : 0.175, chord = bar % 4, first = bar === 0, last = bar === 3;
  const on = (e: number) => !beat || e % 2 === 0;
  if (first) kit(c, 'crash', 0, 0.55, -0.35, 3);
  for (const e of beat ? [0, 4] : [0, 3, 4]) kit(c, 'kick', e * E, e === 0 ? 1 : 0.85, 0, 1 + e);
  for (const e of last ? [2] : [2, 6]) kit(c, 'snare', e * E, 0.8, 0, 1 + e);
  if (last) for (let i = 0; i < 6; i++) kit(c, 'snare', 5 * E + i * E / 2, 0.38 + i * 0.09, 0, 3 + i);
  for (let e = 0; e < 8; e++) if (on(e) && !(first && e === 0) && !(last && e >= 5)) kit(c, 'hat', e * E, e % 2 ? 0.19 : 0.28, 0.28, 1 + (e % 3));
  // (the bass 3.5 dB up and its sine 3.5 more: measured, its fundamental sat 10 dB under the kick's once each note's
  // sine played with its own note instead of all eight on the downbeat; a rock band's bass and kick share the bottom)
  for (let e = 0; e < 8; e++) if (on(e)) bassNote(c, N(BAND_ROOT[chord]!) * (e === (beat ? 6 : 7) && !last ? 2 : 1), e * E, bassLen(beat), (e % 2 ? 0.85 : 1) * 1.5);
  return 8 * E + 0.3;
}

// ---------- the sounds ----------

export const SFX: Record<string, Syn> = {
  // ----- the interface -----
  'ui.tap': (c) => tone(c, { f: [[0, 1050], [0.03, 720]], a: 0.001, d: 0.045, v: 0.3 }),
  'ui.tick': (c) => tone(c, { f: 1650, a: 0.001, d: 0.02, v: 0.2 }),
  'ui.open': (c) => { tone(c, { f: N('e5'), type: 'triangle', d: 0.08, v: 0.25 }); return tone(c, { f: N('a5'), type: 'triangle', at: 0.06, d: 0.11, v: 0.25 }); },
  'ui.close': (c) => { tone(c, { f: N('a5'), type: 'triangle', d: 0.08, v: 0.22 }); return tone(c, { f: N('e5'), type: 'triangle', at: 0.06, d: 0.11, v: 0.22 }); },
  'ui.on': (c) => { tone(c, { f: N('a5'), d: 0.06, v: 0.25 }); return tone(c, { f: N('e6'), at: 0.05, d: 0.1, v: 0.25 }); },
  'ui.off': (c) => { tone(c, { f: N('e6'), d: 0.06, v: 0.22 }); return tone(c, { f: N('a5'), at: 0.05, d: 0.1, v: 0.22 }); },
  'ui.copy': (c) => { click(c, 2600, 0.25); return click(later(c, 0.07), 3400, 0.25) + 0.07; },
  'ui.error': (c) => {
    tone(c, { f: 155, type: 'sawtooth', lp: 700, d: 0.09, v: 0.35 });
    return tone(c, { f: 138, type: 'sawtooth', lp: 700, at: 0.13, d: 0.14, v: 0.35 });
  },
  'ui.swipe': (c) => whoosh(c, 0.16, 700, 2600, 0.14),

  // ----- transactions -----
  // the wallet is being asked: a small rising question
  'tx.ask': (c) => { tone(c, { f: [[0, N('a4')], [0.1, N('c5')]], type: 'triangle', d: 0.12, v: 0.25 }); return tone(c, { f: [[0, N('c5')], [0.1, N('e5')]], type: 'triangle', at: 0.11, d: 0.16, v: 0.25 }); },
  // signed, on its way
  'tx.signed': (c) => { tone(c, { f: N('e6'), d: 0.05, v: 0.2 }); return tone(c, { f: N('a6'), at: 0.05, d: 0.09, v: 0.2 }); },
  // it landed
  'tx.ok': (c) => arp(c, [N('e5'), N('g5'), N('c6'), N('e6')], 0.07, 0.2, 0.5),
  // it did not
  'tx.fail': (c) => { tone(c, { f: N('e4'), type: 'triangle', d: 0.2, v: 0.3 }); tone(c, { f: N('eb4'), type: 'triangle', at: 0.17, d: 0.2, v: 0.3 }); return tone(c, { f: N('c4'), type: 'triangle', at: 0.34, d: 0.34, v: 0.3 }); },
  coin: (c, o) => { const n = o.n ?? 1, gap = o.gap ?? 0.09; for (let i = 0; i < n; i++) coin(c, i * gap, 1 + (jit(c, i) - 0.5) * 0.12); return n * gap + 0.5; },
  // EMO going into the fire
  burn: (c) => {
    hiss(c, { f: [[0, 260], [0.35, 2400], [0.95, 380]], kind: 'lowpass', q: 0.9, a: 0.3, d: 0.7, v: 0.4 });
    for (let i = 0; i < 9; i++) click(later(c, 0.08 + jit(c, i) * 0.8), 1800 + jit(c, i + 20) * 2600, 0.12 + jit(c, i + 40) * 0.12, 0.006);
    return 1.05;
  },
  mint: (c) => { arp(c, [N('c5'), N('e5'), N('g5'), N('c6')], 0.09, 0.2, 0.4); const w = echoing(later(c, 0.42), 0.35); chime(w, N('c6'), 0.16, 1.1); chime(w, N('e6'), 0.16, 1.1); chime(w, N('g6'), 0.16, 1.1); return 1.6; },
  crown: (c) => {
    arp(c, [N('a5'), N('c#6'), N('e6'), N('a6')], 0.065, 0.18, 0.6);
    hiss(echoing(c, 0.3), { f: 7500, kind: 'highpass', at: 0.2, a: 0.2, d: 0.7, v: 0.05 });
    return 1.1;
  },

  // ----- messages -----
  'notify.chat': (c) => tone(c, { f: [[0, 520], [0.04, 930]], a: 0.002, d: 0.08, v: 0.28 }),
  'notify.dm': (c) => { const w = echoing(c, 0.25); chime(w, N('a5'), 0.22, 0.35); return chime(w, N('e6'), 0.22, 0.5, 0.1) + 0.1; },
  'notify.mention': (c) => { const w = echoing(c, 0.25); chime(w, N('e6'), 0.2, 0.3); chime(w, N('a6'), 0.2, 0.3, 0.09); return chime(w, N('e6'), 0.2, 0.5, 0.18) + 0.18; },
  'notify.bell': (c) => { const w = echoing(c, 0.3); bell(w, { f: N('g6'), d: 0.7, v: 0.2, ratio: 3.5, index: 1.4 }); return bell(w, { f: N('d7'), at: 0.02, d: 0.5, v: 0.1, ratio: 3.5, index: 1 }); },

  // ----- getting about -----
  step: (c, o) => { tone(c, { f: [[0, 170 * k(o)], [0.05, 95 * k(o)]], a: 0.002, d: 0.06, v: 0.3 }); return hiss(c, { f: 700, kind: 'lowpass', a: 0.001, d: 0.03, v: 0.12 }); },
  hop: (c, o) => tone(c, { f: [[0, 260 * k(o)], [0.07, 430 * k(o)]], a: 0.004, d: 0.08, v: 0.22 }),
  land: (c, o) => thud(c, 130 * k(o), 0.5, 0.13),
  jump: (c, o) => tone(c, { f: [[0, 300 * k(o)], [0.24, 880 * k(o)]], a: 0.01, d: 0.24, v: 0.22 }),
  leap: (c, o) => { const d = o.dur ?? 0.6; whoosh(c, d, 300, 1500, 0.16); return tone(c, { f: [[0, 260], [d * 0.5, 1150], [d, 520]], a: 0.02, hold: d * 0.5, d: d * 0.5, v: 0.16 }); },
  whoosh: (c, o) => whoosh(c, o.dur ?? 0.3, 420 * k(o), 2400 * k(o), 0.3),
  thud: (c, o) => thud(c, 105 * k(o), 0.7, 0.18),
  boing: (c, o) => tone(c, { f: [[0, 170 * k(o)], [0.09, 520 * k(o)], [0.42, 300 * k(o)]], vib: [17, 34 * k(o)], a: 0.004, d: 0.42, v: 0.4 }),
  bonk: (c, o) => { tone(c, { f: [[0, 400 * k(o)], [0.06, 300 * k(o)]], a: 0.001, d: 0.09, v: 0.45 }); return tone(c, { f: 1200 * k(o), a: 0.001, d: 0.02, v: 0.12 }); },
  pop: (c, o) => tone(c, { f: [[0, 320 * k(o)], [0.03, 1250 * k(o)]], a: 0.001, d: 0.05, v: 0.35 }),
  squeak: (c, o) => tone(c, { f: [[0, 900 * k(o)], [0.06, 1650 * k(o)], [0.13, 1150 * k(o)]], type: 'triangle', a: 0.005, d: 0.13, v: 0.22 }),
  puff: (c) => hiss(c, { f: [[0, 1300], [0.25, 320]], kind: 'lowpass', a: 0.015, d: 0.26, v: 0.3 }),
  dust: (c) => hiss(c, { f: 700, q: 0.7, a: 0.01, d: 0.18, v: 0.2 }),
  slide: (c, o) => { const d = o.dur ?? 0.5; return hiss(c, { f: [[0, 180], [d, 320]], kind: 'lowpass', am: [23, 0.5], a: d * 0.2, hold: d * 0.5, d: d * 0.3, v: 0.5 }); },
  sparkle: (c, o) => {
    const n = o.n ?? 4, w = echoing(c, 0.35);
    for (let i = 0; i < n; i++) chime(w, pick(c, PENTA, i) , 0.11, 0.35, i * (0.05 + jit(c, i + 9) * 0.05));
    return n * 0.1 + 0.4;
  },
  heart: (c) => { const w = echoing(c, 0.25); tone(w, { f: N('a5'), type: 'triangle', a: 0.01, d: 0.25, v: 0.2 }); return tone(w, { f: N('c#6'), type: 'triangle', at: 0.09, a: 0.01, d: 0.34, v: 0.2 }); },
  stars: (c) => { const w = echoing(c, 0.3); for (let i = 0; i < 5; i++) tone(w, { f: 1500 + jit(c, i) * 1500, vib: [7 + i, 60], at: i * 0.13, a: 0.02, d: 0.3, v: 0.08 }); return 1; },

  // ----- dinner -----
  'bowl.drop': (c) => { bell(c, { f: 1180, at: 0, d: 0.16, v: 0.3, ratio: 1.52, index: 1.4 }); bell(c, { f: 1180, at: 0.11, d: 0.1, v: 0.12, ratio: 1.52, index: 1 }); return thud(c, 150, 0.35, 0.09) + 0.2; },
  crumbs: (c, o) => { const n = o.n ?? 5; for (let i = 0; i < n; i++) click(later(c, jit(c, i) * 0.12), 2400 + jit(c, i + 7) * 2400, 0.14, 0.008); return 0.16; },
  bite: (c, o) => { for (let i = 0; i < 3; i++) hiss(c, { f: (1500 + jit(c, i) * 900) * k(o), q: 1.6, at: i * 0.028, a: 0.001, d: 0.022, v: 0.4 }); return 0.1; },
  sniff: (c) => { hiss(c, { f: [[0, 1400], [0.1, 2600]], q: 2.5, a: 0.03, d: 0.09, v: 0.3 }); return hiss(c, { f: [[0, 1500], [0.1, 2800]], q: 2.5, at: 0.3, a: 0.03, d: 0.09, v: 0.3 }); },
  lick: (c, o) => { const n = o.n ?? 1, gap = o.gap ?? 0.27; for (let i = 0; i < n; i++) hiss(c, { f: [[0, 900], [0.15, 2700]], q: 4.5, at: i * gap, a: 0.02, d: 0.14, v: 0.45 }); return n * gap + 0.05; },
  gulp: (c) => { tone(c, { f: [[0, 270], [0.08, 125]], a: 0.004, d: 0.09, v: 0.45 }); return tone(c, { f: [[0, 140], [0.06, 235]], at: 0.1, a: 0.004, d: 0.07, v: 0.35 }); },
  flop: (c) => { hiss(c, { f: 1500, kind: 'lowpass', a: 0.001, d: 0.05, v: 0.4 }); return tone(c, { f: [[0, 210], [0.06, 120]], a: 0.002, d: 0.08, v: 0.3 }); },
  tummy: (c) => { hiss(c, { f: 130, kind: 'lowpass', am: [13, 0.8], a: 0.08, hold: 0.3, d: 0.3, v: 0.9 }); return tone(c, { f: [[0, 74], [0.35, 58], [0.68, 66]], a: 0.08, hold: 0.3, d: 0.3, v: 0.3 }); },

  // ----- the other end -----
  strain: (c, o) => tone(c, { f: [[0, 300 * k(o)], [0.2, 370 * k(o)]], vib: [31, 14], type: 'triangle', a: 0.03, d: 0.2, v: 0.14 }),
  plop: (c) => { tone(c, { f: [[0, 470], [0.09, 125]], a: 0.002, d: 0.1, v: 0.5 }); return hiss(c, { f: 500, kind: 'lowpass', at: 0.05, a: 0.004, d: 0.07, v: 0.25 }); },
  phew: (c) => hiss(c, { f: [[0, 1700], [0.34, 650]], q: 1.4, a: 0.05, d: 0.32, v: 0.22 }),
  scoop: (c) => hiss(c, { f: [[0, 2200], [0.15, 3600]], q: 3, am: [48, 0.6], a: 0.01, d: 0.15, v: 0.35 }),

  // ----- bath time -----
  'tub.land': (c) => { thud(c, 92, 0.75, 0.2); return bell(c, { f: 318, d: 0.4, v: 0.16, ratio: 2.4, index: 0.8 }); },
  splash: (c) => {
    hiss(c, { f: [[0, 3400], [0.45, 520]], kind: 'lowpass', a: 0.006, d: 0.5, v: 0.5 });
    hiss(c, { f: 5200, kind: 'highpass', a: 0.004, d: 0.22, v: 0.14 });
    for (let i = 0; i < 5; i++) drop(c, 650 + jit(c, i) * 900, 0.12, 0.12 + jit(c, i + 5) * 0.4);
    return 0.65;
  },
  drops: (c, o) => { const n = o.n ?? 3; for (let i = 0; i < n; i++) drop(c, 700 + jit(c, i) * 900, 0.15, jit(c, i + 3) * 0.16); return 0.25; },
  bubbles: (c, o) => {
    const d = o.dur ?? 1, n = Math.round(d * 8);
    for (let i = 0; i < n; i++) { const f = 480 + jit(c, i) * 620; tone(c, { f: [[0, f], [0.06, f * 1.8]], at: (i + jit(c, i + 31)) * (d / n), a: 0.004, d: 0.07, v: 0.13 }); }
    return d + 0.1;
  },
  scrub: (c, o) => { const n = o.n ?? 6, gap = o.gap ?? 0.15; for (let i = 0; i < n; i++) hiss(c, { f: i % 2 ? 3100 : 2300, q: 2.2, at: i * gap, a: 0.03, d: 0.1, v: 0.3 }); return n * gap + 0.05; },
  shake: (c) => { hiss(c, { f: 2600, kind: 'highpass', am: [23, 0.9], a: 0.03, hold: 0.3, d: 0.2, v: 0.2 }); for (let i = 0; i < 6; i++) drop(c, 900 + jit(c, i) * 1100, 0.1, 0.08 + jit(c, i + 4) * 0.4); return 0.6; },

  // ----- play -----
  roll: (c, o) => { const d = o.dur ?? 0.6; return hiss(c, { f: 260, kind: 'lowpass', am: [11, 0.7], a: d * 0.2, hold: d * 0.4, d: d * 0.4, v: 0.45 }); },
  pat: (c, o) => { const n = o.n ?? 1, gap = o.gap ?? 0.17; for (let i = 0; i < n; i++) { tone(c, { f: [[0, 250 * k(o)], [0.05, 150 * k(o)]], at: i * gap, a: 0.002, d: 0.06, v: 0.35 }); hiss(c, { f: 900, kind: 'lowpass', at: i * gap, a: 0.001, d: 0.04, v: 0.2 }); } return n * gap; },
  kick: (c, o) => { hiss(c, { f: 1200 * k(o), q: 1, a: 0.001, d: 0.05, v: 0.5 }); return tone(c, { f: [[0, 190 * k(o)], [0.08, 72 * k(o)]], a: 0.001, d: 0.11, v: 0.55 }); },
  bounce: (c, o) => tone(c, { f: [[0, 340 * k(o)], [0.08, 165 * k(o)]], a: 0.002, d: 0.1, v: 0.4 }),
  purr: (c, o) => {
    const d = o.dur ?? 1.2;
    hiss(c, { f: 240, kind: 'lowpass', am: [25, 1], a: 0.15, hold: d - 0.4, d: 0.25, v: 0.5 });
    return tone(c, { f: 52, type: 'triangle', a: 0.15, hold: d - 0.4, d: 0.25, v: 0.12 });
  },

  // ----- sleep -----
  // settling down: three notes falling
  sleep: (c) => arp(c, [N('g5'), N('e5'), N('c5')], 0.16, 0.16, 0.6),
  snore: (c, o) => {
    // in: a low rattle; out: a soft whistle of breath
    hiss(c, { f: [[0, 300 * k(o)], [0.8, 520 * k(o)]], q: 1.6, am: [27, 0.9], a: 0.25, hold: 0.35, d: 0.3, v: 0.3 });
    hiss(c, { f: [[0, 1250], [0.9, 760]], q: 6, at: 1.25, a: 0.2, hold: 0.3, d: 0.5, v: 0.14 });
    return 2.3;
  },
  // waking: two notes rising
  wake: (c) => arp(c, [N('c5'), N('e5'), N('a5')], 0.11, 0.17, 0.45),

  // ----- the end, and after -----
  die: (c) => {
    const notes = [N('a4'), N('g4'), N('f4'), N('e4')];
    notes.forEach((f, i) => tone(echoing(c, 0.35), { f: i === 3 ? [[0, f], [0.5, f * 0.94]] : f, type: 'triangle', lp: 1400, at: i * 0.26, a: 0.02, d: i === 3 ? 0.7 : 0.3, v: 0.3 }));
    return 1.6;
  },
  grave: (c) => { thud(c, 78, 0.85, 0.24); hiss(c, { f: 300, q: 0.8, a: 0.002, d: 0.14, v: 0.35 }); return bell(echoing(c, 0.5), { f: N('a2'), d: 1.4, v: 0.22, ratio: 2, index: 1.2, bite: 0.5 }); },
  ghost: (c) => tone(echoing(c, 0.5), { f: [[0, 520], [0.5, 790], [1.2, 610]], vib: [5.2, 22], a: 0.25, hold: 0.4, d: 0.6, v: 0.12 }),
  revive: (c) => {
    const up = ['a4', 'c5', 'd5', 'e5', 'g5', 'a5', 'c6', 'e6', 'a6'].map(N);
    const w = echoing(c, 0.4);
    up.forEach((f, i) => chime(w, f, 0.14, 0.5, i * 0.05));
    hiss(w, { f: 6800, kind: 'highpass', at: 0.2, a: 0.3, d: 0.9, v: 0.045 });
    ['a5', 'c#6', 'e6'].forEach((n) => chime(w, N(n), 0.13, 1.2, 0.5));
    return 1.8;
  },

  // ----- the dreidel -----
  'dreidel.drop': (c) => knock(c, 560, 0.45),
  'dreidel.flick': (c) => { whoosh(c, 0.12, 900, 3000, 0.2); return click(c, 2100, 0.3); },
  'dreidel.spin': (c, o) => {
    const d = o.dur ?? 2.8;
    hiss(c, { f: [[0, 2100], [d, 1300]], q: 5, am: [[[0, 30], [d, 8]], 0.85], a: 0.05, hold: d * 0.75, d: d * 0.25, v: 0.3 });
    return tone(c, { f: [[0, 250], [d, 150]], type: 'triangle', a: 0.05, hold: d * 0.75, d: d * 0.25, v: 0.06 });
  },
  'dreidel.topple': (c) => { knock(c, 700, 0.4); knock(c, 610, 0.28, 0.075); return knock(c, 540, 0.18, 0.19); },
  badge: (c) => { const w = echoing(c, 0.3); chime(w, N('c6'), 0.2, 0.5); return chime(w, N('g6'), 0.16, 0.6, 0.02); },
  // gimel takes the pot
  'dreidel.all': (c) => arp(c, [N('c5'), N('e5'), N('g5'), N('c6'), N('e6'), N('g6')], 0.065, 0.19, 0.6),
  // hei takes half
  'dreidel.half': (c) => arp(c, [N('c5'), N('e5'), N('g5')], 0.09, 0.19, 0.45),
  // nun: nothing
  'dreidel.none': (c) => tone(c, { f: [[0, N('e4')], [0.3, N('c4')]], type: 'triangle', a: 0.02, d: 0.34, v: 0.28 }),
  // shin: put one in
  'dreidel.pay': (c) => { tone(c, { f: N('e5'), type: 'triangle', d: 0.14, v: 0.26 }); return tone(c, { f: N('a4'), type: 'triangle', at: 0.15, d: 0.3, v: 0.26 }); },

  // ----- the darbuka -----
  'drum.dum': (c, o) => { tone(c, { f: [[0, 165 * k(o)], [0.12, 78 * k(o)]], a: 0.001, d: 0.24, v: 0.8 }); return hiss(c, { f: 900, q: 1.2, a: 0.0005, d: 0.012, v: 0.4 }); },
  // the emo pack's electric guitar (director.playGuitar, buttGuitar): `n` picks the power chord of the emo four, E5 C5 G5
  // D5 (0..3), `dur` how long it rings (to the next stroke; the last big chord 2.6 s). An open down-stroke hits all four
  // strings hard; an up-stroke catches the top three, lighter; a palm-muted chug is the bottom three, short and dull.
  'guitar.down': (c, o) => stroke(c, 'down', o.n ?? 0, o.dur ?? 0.9),
  'guitar.up': (c, o) => stroke(c, 'up', o.n ?? 0, o.dur ?? 0.5),
  'guitar.mute': (c, o) => stroke(c, 'mute', o.n ?? 0, Math.min(o.dur ?? 0.14, 0.16)),
  // the band behind the riff (director.playGuitar): a whole bar of drums and bass (`n` the bar of the riff, 0..3), and
  // the last big chord's crash, kick and bass ringing with it
  'band.bar': (c, o) => bandBar(c, o.n ?? 0, o.gap),
  'band.end': (c) => { kit(c, 'crash', 0, 0.75, -0.3, 5); kit(c, 'crash', 0.004, 0.5, 0.35, 6); kit(c, 'kick', 0, 1, 0, 2); bassNote(c, N('e2'), 0, 2.4, 1); return 2.6; },
  'drum.tek': (c, o) => { hiss(c, { f: 3300 * k(o), q: 3.2, a: 0.0005, d: 0.05, v: 0.5 }); return tone(c, { f: 830 * k(o), a: 0.001, d: 0.04, v: 0.25 }); },

  // ----- the hen -----
  cluck: (c, o) => {
    const n = o.n ?? 2;
    for (let i = 0; i < n; i++) { const up = 1 + jit(c, i) * 0.25; coo(c, { f: [[0, 430 * up], [0.03, 640 * up], [0.08, 390 * up]], bright: 3, wah: [[0, 900], [0.04, 1700], [0.08, 1100]], at: i * (o.gap ?? 0.16), a: 0.004, d: 0.08, v: 0.6 }); }
    return n * (o.gap ?? 0.16) + 0.1;
  },
  squawk: (c) => coo(c, { f: [[0, 620], [0.08, 1100], [0.3, 700]], bright: 3.2, wah: [[0, 1100], [0.1, 2100], [0.3, 1400]], pulse: [31, 0.45], a: 0.01, hold: 0.15, d: 0.16, v: 0.6 }),
  flaps: (c, o) => { const n = o.n ?? 4, gap = o.gap ?? 0.12; for (let i = 0; i < n; i++) flap(c, i * gap, 1, 0.3); return n * gap + 0.12; },

  // ----- the falcon -----
  wings: (c, o) => { const n = o.n ?? 3, gap = o.gap ?? 0.22; for (let i = 0; i < n; i++) flap(c, i * gap, 1.7, 0.4); return n * gap + 0.2; },
  'falcon.cry': (c) => coo(echoing(c, 0.4), { f: [[0, 1900], [0.12, 2500], [0.7, 1500]], bright: 2.4, wah: [[0, 2400], [0.2, 3200], [0.7, 2200]], trill: [24, 70], air: 0.08, a: 0.03, hold: 0.4, d: 0.3, v: 0.35 }),

  // ----- the frok's stunts -----
  catch: (c) => { thud(c, 150, 0.35, 0.08); return click(c, 2400, 0.2); },
  shutter: (c) => { click(c, 3600, 0.4, 0.01); tone(c, { f: 2300, a: 0.001, d: 0.012, v: 0.12 }); click(later(c, 0.055), 2500, 0.32, 0.014); return 0.09; },
  flash: (c) => { hiss(c, { f: 5200, kind: 'highpass', a: 0.002, d: 0.26, v: 0.2 }); return tone(c, { f: [[0, 2600], [0.2, 6200]], a: 0.004, d: 0.22, v: 0.05 }); },
  'slap.wind': (c, o) => whoosh(c, o.dur ?? 0.45, 220, 1300, 0.4, 0.9),
  'slap.hit': (c) => {
    hiss(c, { f: 1900, q: 0.7, a: 0.0005, d: 0.09, v: 1 });
    hiss(c, { f: 5000, kind: 'highpass', a: 0.0005, d: 0.03, v: 0.4 });
    return tone(c, { f: [[0, 230], [0.1, 85]], a: 0.001, d: 0.14, v: 0.6 });
  },
  servo: (c, o) => { const d = o.dur ?? 0.6; return tone(c, { f: [[0, 92 * k(o)], [d, 150 * k(o)]], type: 'sawtooth', lp: 950, vib: [43, 5], a: 0.04, hold: d - 0.1, d: 0.08, v: 0.18 }); },
  clank: (c) => { bell(c, { f: 430, d: 0.26, v: 0.4, ratio: 3.73, index: 2.4, bite: 0.3 }); return click(c, 2600, 0.35, 0.02); },
  squeeze: (c) => tone(c, { f: [[0, 520], [0.18, 980]], type: 'triangle', vib: [34, 26], a: 0.01, d: 0.2, v: 0.25 }),
  match: (c) => { hiss(c, { f: 4100, q: 2, am: [70, 0.5], a: 0.005, d: 0.12, v: 0.35 }); return hiss(c, { f: [[0, 600], [0.2, 2500]], kind: 'lowpass', at: 0.12, a: 0.03, d: 0.26, v: 0.35 }); },
  fire: (c, o) => {
    const d = o.dur ?? 1;
    hiss(c, { f: 760, kind: 'lowpass', am: [9, 0.5], a: 0.12, hold: Math.max(0, d - 0.3), d: 0.25, v: 0.3 });
    const n = Math.round(d * 13);
    for (let i = 0; i < n; i++) click(later(c, jit(c, i) * d), 1500 + jit(c, i + 50) * 3000, 0.08 + jit(c, i + 90) * 0.16, 0.005);
    return d + 0.1;
  },
  gush: (c) => { hiss(c, { f: [[0, 900], [0.15, 3000], [1, 1400]], kind: 'lowpass', a: 0.06, hold: 0.45, d: 0.5, v: 0.6 }); return hiss(c, { f: 4500, kind: 'highpass', a: 0.06, hold: 0.4, d: 0.4, v: 0.1 }); },
  sizzle: (c) => hiss(c, { f: 5200, kind: 'highpass', a: 0.01, d: 0.9, v: 0.2 }),
  chatter: (c) => { for (let i = 0; i < 8; i++) knock(c, 1500 + (i % 2) * 180, 0.14, i * 0.06); return 0.6; },

  // ----- Sahur's bat on Sahur -----
  tung: (c, o) => {
    const f = 196 * k(o);
    tone(c, { f: [[0, f * 1.12], [0.04, f]], a: 0.001, d: 0.2, v: 0.9 });
    tone(c, { f: f * 2.76, a: 0.001, d: 0.06, v: 0.3 });
    tone(c, { f: f * 5.4, a: 0.001, d: 0.025, v: 0.14 });
    hiss(c, { f: 1100, q: 2.5, a: 0.0005, d: 0.02, v: 0.5 });
    return 0.24;
  },

  // ----- Fight Club -----
  'fight.bell': (c, o) => {
    const n = o.n ?? 2, w = echoing(c, 0.3);
    for (let i = 0; i < n; i++) { bell(w, { f: 1170, at: i * 0.2, d: 1.1, v: 0.3, ratio: 1.41, index: 2.6, bite: 0.5 }); bell(w, { f: 2350, at: i * 0.2, d: 0.5, v: 0.1, ratio: 1.41, index: 2 }); }
    return n * 0.2 + 1.1;
  },
  'fight.hit': (c, o) => {
    hiss(c, { f: 1400 * k(o), q: 0.8, a: 0.0005, d: 0.07, v: 0.8 });
    return tone(c, { f: [[0, 200 * k(o)], [0.09, 70 * k(o)]], a: 0.001, d: 0.13, v: 0.7 });
  },
  'fight.swing': (c) => whoosh(c, 0.2, 500, 2400, 0.3),
  'fight.block': (c) => { knock(c, 380, 0.5); return hiss(c, { f: 800, q: 1, a: 0.001, d: 0.05, v: 0.3 }); },
  'fight.crowd': (c, o) => {
    const d = o.dur ?? 1.6;
    hiss(c, { f: [[0, 600], [d * 0.4, 1050], [d, 700]], q: 0.6, am: [6.5, 0.35], a: d * 0.3, hold: d * 0.3, d: d * 0.4, v: 0.3 });
    return hiss(c, { f: [[0, 1500], [d * 0.4, 2400], [d, 1700]], q: 1.2, am: [8.3, 0.4], a: d * 0.3, hold: d * 0.3, d: d * 0.4, v: 0.12 });
  },
  'fight.ko': (c) => { thud(c, 70, 1, 0.32); return hiss(c, { f: 260, q: 0.7, a: 0.002, d: 0.22, v: 0.4 }); },
  'fight.win': (c) => { arp(c, [N('e5'), N('g5'), N('b5'), N('e6')], 0.1, 0.22, 0.4); const w = echoing(later(c, 0.45), 0.35); ['e5', 'g#5', 'b5', 'e6'].forEach((n) => chime(w, N(n), 0.16, 1.3)); return 1.9; },
  'fight.lose': (c) => { ['e4', 'eb4', 'd4', 'c#4'].forEach((n, i) => tone(c, { f: i === 3 ? [[0, N(n)], [0.6, N(n) * 0.93]] : N(n), type: 'sawtooth', lp: 900, vib: i === 3 ? [5.5, 5] : undefined, at: i * 0.3, a: 0.03, d: i === 3 ? 0.8 : 0.3, v: 0.22 })); return 1.8; },
};

// the voices, as sounds of their own: 'voice.happy' with `who`
for (const [mood, fn] of Object.entries(VOICE)) SFX[`voice.${mood}`] = (c, o) => fn(c, o.who, k(o));

/** Which sounds are part of the interface (their own volume share: quieter than the room). */
/** Whose measured levels a pet's sounds take (its own, unless its throat borrows another's). */
export const levelsOf = (who?: string) => (who ? THROATS[who]?.levels ?? who : who);
export const isUi = (name: string) => name.startsWith('ui.') || name.startsWith('tx.') || name.startsWith('notify.');

export type { F };
export { mul, scaled };
