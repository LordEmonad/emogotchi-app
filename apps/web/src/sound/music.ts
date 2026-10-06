// The music. Nothing is a recording: every tune is written here as notes, and played by small synthesized
// instruments (dsp.ts) a bar at a time. One family of tunes, in keeping with the site: a music box over soft chords in
// a minor key, a little sad, never busy.
//
//   a pet's room      the room tune, in the pet's own instrument and key (cat: music box; frok: marimba; Sahur:
//                     wooden bars; Thiccums: vibraphone; the r3tard: a toy piano slightly out of tune)
//   asleep            a lullaby in 6/8, the same instrument, nothing else
//   dead              a held chord and a far bell
//   a room theme      its own tune: a waltz for the Spooky theme, tape-warped muzak and a hum for the Backrooms, a
//                     clarinet over a drone at the Western Wall, an oud and a soft darbuka in the Majlis, a clean
//                     guitar twinkling over the rain in the emo bedroom
//   Emotown           a slow beat with the music box over it, by the time of day (birds at dawn, crickets at night)
//   Emo's Tavern      a lute waltz; a fight brings the drums in
//
// A tune is a list of parts; a part says which instrument and, for any bar, which notes. Times are in steps (16 to a
// bar of 4/4, 12 to a bar of 3/4 or 6/8).

import type { MusicWish } from './cue';
import { bell, coarse, hiss, hz, midi, panned, pluck, rng, tone, type C } from './dsp';
import { keepNote, keptNotes, shapeOf, unpackInto } from './kept';

type Note = { s: number; n: number; d: number; v?: number };
type Inst = (c: C, f: number, sec: number, v: number) => void;
type Part = {
  inst: keyof typeof INST; v: number;
  /** share sent to the reverb */
  wet?: number;
  /** share sent to the echo (a soft repeat every dotted eighth, side to side: what makes a music box sound like a room) */
  echo?: number;
  notes: (bar: number, r: () => number) => Note[];
};
export type Song = {
  id: string; bpm: number; steps: 12 | 16; swing?: number; parts: Part[]; transpose?: number;
  /** the whole tune louder or quieter, so the tunes sit at one level against each other (measured: tools/sound-check.mjs songs) */
  gain?: number;
};

// ---------- instruments ----------

/** Where a note sits between the ears, by its pitch: neighbouring notes a little apart, so a run of them has width. */
const place = (f: number, wide = 0.3) => Math.sin(Math.log2(Math.max(f, 1)) * 12 * 2.4) * wide;
/** A struck bar or tooth as its own partials: the note (two of it, a hair apart, for a slow shimmer), its octave, and
 *  the high ring of the strike, each dying at its own pace. Fuller and truer than one FM pair. */
function struck(c: C, f: number, v: number, o: { d: number; ring: number; ringD: number; ringV: number; oct?: number; thump?: number }) {
  tone(c, { f: f * 1.0012, a: 0.004, d: o.d, v: v * 0.4 });
  tone(c, { f: f * 0.9988, a: 0.004, d: o.d * 0.92, v: v * 0.34 });
  if (o.oct) tone(c, { f: f * 2, a: 0.004, d: o.d * 0.45, v: v * o.oct });
  // the strike's ring: soft-fronted, and never up where a small speaker turns it into a tick
  const ring = f * o.ring < 6500 ? o.ring : f * 4 < 6500 ? 4 : 0;
  if (ring) tone(c, { f: f * ring, a: 0.004, d: o.ringD, v: v * o.ringV });
  if (o.thump) hiss(c, { f: 700, kind: 'lowpass', a: 0.001, d: 0.03, v: v * o.thump });
}

const INST = {
  // a comb's tooth: the note, its octave and the bright "ting" of the pin letting go
  musicbox: (c, f, _s, v0) => {
    const v = v0 * 2;
    const o = panned(c, place(f));
    struck(o, f, v, { d: 1.7, ring: 6.27, ringD: 0.14, ringV: 0.06, oct: 0.13 });
    tone(o, { f: f * 3.01, a: 0.002, d: 0.3, v: v * 0.04 });
  },
  // wooden bars over tubes: a round knock, and the tube singing on after it
  marimba: (c, f, _s, v0) => {
    const v = v0 * 2;
    const o = panned(c, place(f));
    struck(o, f, v * 1.25, { d: 0.55, ring: 4, ringD: 0.07, ringV: 0.22, thump: 0.3 });
    tone(o, { f, a: 0.02, d: 0.9, v: v * 0.2 });
  },
  // a log's own note: hollow, with the knock on it and the log's body under it
  woodbar: (c, f, _s, v0) => {
    const v = v0 * 1.4;
    const o = panned(c, place(f));
    tone(o, { f, type: 'triangle', a: 0.002, d: 0.6, v: v * 1.3 });
    tone(o, { f: f * 1.003, a: 0.002, d: 0.5, v: v * 0.5 });
    tone(o, { f: f * 2.76, a: 0.001, d: 0.06, v: v * 0.4 });
    tone(o, { f: f / 2, a: 0.004, d: 0.3, v: v * 0.35 });
    hiss(o, { f: f * 3, q: 3, a: 0.0005, d: 0.014, v: v * 0.5 });
  },
  // metal bars with the motor on: long, with a slow shimmer
  vibes: (c, f, _s, v) => {
    const g = c.ac.createGain(); g.gain.value = 0.8; g.connect(panned(c, place(f)).out);
    const l = c.ac.createOscillator(), lg = c.ac.createGain(); l.frequency.value = 5.2; lg.gain.value = 0.2; l.connect(lg); lg.connect(g.gain); l.start(c.t); l.stop(c.t + 2.8);
    struck({ ...c, out: g }, f, v * 2.25, { d: 2.5, ring: 4, ringD: 0.4, ringV: 0.12, oct: 0.05 });
  },
  // a toy piano: rods that do not quite agree
  toy: (c, f, _s, v0) => {
    const v = v0 * 2.2;
    const o = panned(c, place(f));
    bell(o, { f: f * 0.994, d: 0.8, v: v * 0.42, ratio: 3.01, index: 0.8, bite: 0.2 });
    bell(o, { f: f * 1.007, d: 0.7, v: v * 0.42, ratio: 3.01, index: 0.7, bite: 0.2 });
    tone(o, { f, a: 0.002, d: 0.9, v: v * 0.3 });
  },
  // an electric piano, one voice to each side, a hair apart: wide and warm
  epiano: (c, f, _s, v) => {
    for (const [side, det] of [[-0.45, 0.9985], [0.45, 1.0015]] as const) {
      const o = panned(c, side);
      bell(o, { f: f * det, d: 1.9, v: v * 0.27, ratio: 1, index: 0.85, bite: 0.3 });
    }
    bell(c, { f, d: 0.09, v: v * 0.07, ratio: 14, index: 0.5 });
    tone(c, { f, a: 0.004, d: 1.2, v: v * 0.1 });
  },
  // the same piano on a tape that has seen better days, heard through a wall
  muzak: (c, f, _s, v) => {
    const fl = c.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1500; fl.connect(c.out);
    const os = c.ac.createOscillator(), g = c.ac.createGain(), mod = c.ac.createOscillator(), mg = c.ac.createGain();
    const wow = c.ac.createOscillator(), wg = c.ac.createGain();
    wow.frequency.value = 0.7; wg.gain.value = f * 0.008; wow.connect(wg); wg.connect(os.frequency); wg.connect(mod.frequency);
    os.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 0.9, c.t); mg.gain.exponentialRampToValueAtTime(f * 0.03, c.t + 0.8);
    mod.connect(mg); mg.connect(os.frequency);
    g.gain.setValueAtTime(0, c.t); g.gain.linearRampToValueAtTime(v * 0.75, c.t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.t + 2.4);
    os.connect(g); g.connect(fl);
    for (const o of [os, mod, wow]) { o.start(c.t); o.stop(c.t + 2.45); }
  },
  // held strings: four voices a little apart, two to each side, opening slowly, with the note itself under them
  pad: (c, f, s, v) => {
    const t = c.t, a = Math.min(0.9, s * 0.35), end = t + a + Math.max(0, s - 0.9) + 1.5;
    const g = c.ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.13, t + a);
    g.gain.setValueAtTime(v * 0.13, t + a + Math.max(0, s - 0.9)); g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(c.out);
    for (const side of [-1, 1]) {
      const fl = c.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.6;
      coarse(fl.frequency);
      fl.frequency.setValueAtTime(480, t); fl.frequency.exponentialRampToValueAtTime(1250, t + Math.min(1.2, s * 0.5)); fl.frequency.exponentialRampToValueAtTime(650, end);
      fl.connect(panned({ ...c, out: g }, side * 0.55).out);
      for (const det of [4, 11]) {
        const os = c.ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = side * det;
        os.connect(fl); os.start(t); os.stop(end + 0.05);
      }
    }
    const body = c.ac.createOscillator(), bg = c.ac.createGain(); body.type = 'triangle'; body.frequency.value = f; bg.gain.value = 1.1;
    body.connect(bg); bg.connect(g); body.start(t); body.stop(end + 0.05);
  },
  // a pipe organ's quiet stop
  organ: (c, f, s, v) => { for (const [m, a] of [[1, 0.5], [2, 0.22], [3, 0.1], [4, 0.06]] as const) tone(c, { f: f * m, a: 0.03, hold: Math.max(0, s - 0.06), d: 0.12, v: v * a }); },
  // a round bass with enough overtone to be heard on a phone's speaker, where the note itself is not
  bass: (c, f, s, v) => {
    const d = Math.max(0.16, s * 0.55);
    // (a soft front: on a phone, where the note itself is not heard, a hard one is only a tick)
    tone(c, { f, a: 0.022, hold: Math.max(0, s * 0.45), d, v: v * 0.36 });
    tone(c, { f, type: 'sawtooth', lp: [[0, f * 6], [0.25, f * 3]], a: 0.022, hold: Math.max(0, s * 0.3), d, v: v * 0.2 });
    tone(c, { f: f * 2, type: 'triangle', a: 0.022, d: d * 0.8, v: v * 0.1 });
  },
  // a plucked string: an oud, a lute, a harp
  pluck: (c, f, s, v) => { pluck(panned(c, place(f, 0.22)), { f, v: v * 2.4, bright: 0.45, d: Math.min(1.5, Math.max(0.5, s + 0.4)) }); },
  // a reed flute, with its breath
  ney: (c, f, s, v) => {
    tone(c, { f: [[0, f * 0.985], [0.09, f]], type: 'triangle', vib: [5, f * 0.006], lp: f * 3.2, a: 0.09, hold: Math.max(0, s - 0.12), d: 0.2, v: v * 0.6 });
    tone(c, { f: [[0, f * 0.985], [0.09, f]], vib: [5, f * 0.006], a: 0.09, hold: Math.max(0, s - 0.12), d: 0.2, v: v * 0.25 });
    hiss(c, { f: f * 2, q: 2.2, a: 0.07, hold: Math.max(0, s - 0.12), d: 0.18, v: v * 0.11 });
  },
  // a clarinet: hollow, close to a voice, with a little air in it
  clarinet: (c, f, s, v) => {
    tone(c, { f: [[0, f * 0.98], [0.07, f]], type: 'square', vib: [5.3, f * 0.005], lp: [[0, f * 1.8], [0.14, f * 3.2]], a: 0.07, hold: Math.max(0, s - 0.1), d: 0.18, v: v * 0.3 });
    tone(c, { f: [[0, f * 0.98], [0.07, f]], vib: [5.3, f * 0.005], a: 0.07, hold: Math.max(0, s - 0.1), d: 0.18, v: v * 0.22 });
    hiss(c, { f: f * 3, q: 1.5, a: 0.06, hold: Math.max(0, s - 0.1), d: 0.15, v: v * 0.035 });
  },
  // a wavering sine that slides into each note
  theremin: (c, f, s, v) => { tone(c, { f: [[0, f * 0.92], [0.14, f]], vib: [6.1, f * 0.011], a: 0.1, hold: Math.max(0, s - 0.14), d: 0.25, v: v * 0.6 }); },
  // short brass stabs
  brass: (c, f, s, v) => { for (const det of [-6, 6]) tone(panned(c, det / 20), { f, type: 'sawtooth', det, lp: [[0, f * 1.5], [0.05, f * 5], [Math.max(0.1, s), f * 2.2]], a: 0.02, hold: Math.max(0, s - 0.08), d: 0.1, v: v * 0.77 }); },
  // a soft, deep kick: the drop for a real speaker, a round knock above it for a small one, no click on its front
  kick: (c, _f, _s, v) => { tone(c, { f: [[0, 130], [0.1, 48]], a: 0.004, d: 0.26, v: v * 0.9 }); tone(c, { f: [[0, 210], [0.07, 95]], type: 'triangle', a: 0.004, d: 0.13, v: v * 0.4 }); },
  snare: (c, _f, _s, v) => { hiss(c, { f: 1700, q: 0.7, a: 0.003, d: 0.14, v: v * 1.5 }); tone(c, { f: [[0, 210], [0.05, 160]], a: 0.003, d: 0.08, v: v * 0.9 }); },
  // a brush on a snare: all breath, no crack
  brush: (c, _f, _s, v) => { const o = panned(c, -0.15); hiss(o, { f: 1500, q: 0.6, a: 0.007, d: 0.13, v: v * 1.3 }); hiss(o, { f: 4500, q: 0.8, a: 0.009, d: 0.07, v: v * 0.35 }); tone(o, { f: [[0, 190], [0.06, 150]], a: 0.005, d: 0.08, v: v * 0.5 }); },
  rim: (c, _f, _s, v) => { const o = panned(c, -0.2); tone(o, { f: 1700, a: 0.002, d: 0.03, v: v * 1.1 }); tone(o, { f: 430, a: 0.002, d: 0.04, v: v * 0.6 }); hiss(o, { f: 2600, q: 2, a: 0.002, d: 0.02, v: v * 0.9 }); },
  // a shaker more than a cymbal: a soft "ts"
  hat: (c, _f, s, v) => { hiss(panned(c, 0.3), { f: 7800, q: 1.1, a: 0.005, d: s > 0.2 ? 0.14 : 0.045, v: v * 1.6 }); },
  jingle: (c, _f, _s, v) => { const o = panned(c, 0.35); for (const f of [5200, 6900, 8100]) tone(o, { f, a: 0.003, d: 0.09, v: v * 0.12 }); hiss(o, { f: 8000, kind: 'highpass', a: 0.004, d: 0.05, v: v * 0.24 }); },
  dum: (c, _f, _s, v) => { tone(c, { f: [[0, 165], [0.12, 78]], a: 0.003, d: 0.24, v: v * 1.3 }); tone(c, { f: [[0, 330], [0.06, 160]], type: 'triangle', a: 0.003, d: 0.08, v: v * 0.3 }); hiss(c, { f: 900, q: 1.2, a: 0.002, d: 0.014, v: v * 0.5 }); },
  tek: (c, _f, _s, v) => { const o = panned(c, 0.2); hiss(o, { f: 3300, q: 3.2, a: 0.002, d: 0.05, v: v * 1.5 }); tone(o, { f: 830, a: 0.002, d: 0.04, v: v * 0.75 }); },
  // ----- what is in the air -----
  cricket: (c, _f, _s, v) => { const o = panned(c, place(c.t * 300 + 200, 0.7)); for (let i = 0; i < 3; i++) tone(o, { f: 4350, at: i * 0.038, a: 0.004, d: 0.02, v: v * 1.8 }); },
  bird: (c, f, _s, v) => { tone(panned(c, place(f * 3, 0.6)), { f: [[0, f], [0.05, f * 1.28], [0.1, f * 1.05]], a: 0.008, d: 0.1, v: v * 1.8 }); },
  owl: (c, _f, _s, v) => { for (const [at, d] of [[0, 0.24], [0.42, 0.14], [0.62, 0.34]] as const) tone(c, { f: [[0, 372], [d, 342]], lp: 900, at, a: 0.04, hold: d * 0.5, d: d * 0.5, v: v * 0.5 }); },
  wind: (c, _f, s, v) => { hiss(c, { f: [[0, 380], [s * 0.5, 720], [s, 420]], q: 2.2, a: s * 0.4, hold: s * 0.1, d: s * 0.5, v: v * 1.1 }); },
  // strip lights: mains hum and its buzz
  hum: (c, _f, s, v) => {
    tone(c, { f: 120, a: 0.4, hold: s, d: 0.6, v: v * 0.3 });
    tone(c, { f: 180, a: 0.4, hold: s, d: 0.6, v: v * 0.1 });
    tone(c, { f: 60, type: 'sawtooth', lp: 2400, a: 0.4, hold: s, d: 0.6, v: v * 0.06 });
  },
  // ----- the emo bedroom's -----
  // a clean electric guitar, the twinkling kind: two strings' worth a hair apart and to either side (a chorus pedal),
  // the pickup's round body under them, a soft pick (no click at the front) and the amp rolling the top off. Always the
  // same length: it is a kept note, made once.
  gtr: (c, f, _s, v0) => {
    const v = v0 * 2;
    const amp = c.ac.createBiquadFilter(); amp.type = 'lowpass'; amp.Q.value = 0.5; amp.frequency.value = Math.min(4200, Math.max(1800, f * 7));
    const pick = c.ac.createGain(); pick.gain.setValueAtTime(0, c.t); pick.gain.linearRampToValueAtTime(1, c.t + 0.005);
    amp.connect(pick); pick.connect(c.out);
    const o = { ...c, out: amp }, at = place(f, 0.2);
    pluck(panned(o, at - 0.22), { f: f * 0.9986, v: v * 0.5, bright: 0.62, d: 1.55 });
    pluck(panned(o, at + 0.22), { f: f * 1.0014, v: v * 0.5, bright: 0.62, d: 1.55 });
    tone(panned(o, at), { f, type: 'triangle', a: 0.008, d: 0.7, v: v * 0.1 });
  },
  // rain on the window: a dark wash of it and a little fizz on top, each note crossfading into the next at equal power
  // (two rains overlapping are never louder than one), so it runs on without a seam however long the tune plays
  rain: (c, _f, s, v) => {
    const fade = Math.min(1.5, s * 0.4), t = c.t;
    const g = c.ac.createGain(); g.connect(c.out);
    const up = new Float32Array(24), down = new Float32Array(24);
    for (let i = 0; i < 24; i++) { up[i] = Math.sin((i / 23) * Math.PI / 2) * v; down[i] = Math.cos((i / 23) * Math.PI / 2) * v; }
    g.gain.setValueCurveAtTime(up, t, fade);
    g.gain.setValueCurveAtTime(down, t + s, fade);
    const o = { ...c, out: g };
    hiss(panned(o, -0.25), { f: 1100, q: 0.5, kind: 'lowpass', a: 0.002, hold: s + fade, d: 0.04, v: 0.9 });
    hiss(panned(o, 0.25), { f: 3600, q: 0.8, a: 0.002, hold: s + fade, d: 0.04, v: 0.2 });
  },
} satisfies Record<string, Inst>;

// ---------- writing tunes ----------

/** "e5 . a5 _ c6 b5 a5 ." -> notes. A token is `each` steps: a note, `.` a rest, `_` the last note held on. */
function line(text: string, each: number, v = 1): Note[] {
  const out: Note[] = [];
  text.trim().split(/\s+/).forEach((tok, i) => {
    if (tok === '.') return;
    if (tok === '_') { const last = out[out.length - 1]; if (last) last.d += each; return; }
    out.push({ s: i * each, n: midi(tok), d: each, v });
  });
  return out;
}
/** One line per bar, round and round. */
const lines = (bars: readonly string[], each: number) => { const made = bars.map((b) => line(b, each)); return (bar: number) => made[bar % made.length]!.map((n) => ({ ...n })); };

const QUAL: Record<string, readonly number[]> = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], sus4: [0, 5, 7], dim: [0, 3, 6] };
/** A chord's four notes, low to high (a triad's fourth is its root again, an octave up). */
type Ch = readonly [number, number, number, number];
/** 'Am7' -> its notes from the root in octave 3. */
function chord(name: string): Ch {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name);
  const q = m ? QUAL[m[3]!] : undefined;
  if (!m || !q) throw new Error(`not a chord: ${name}`);
  const root = midi(`${m[1]!.toLowerCase()}${m[2]}3`);
  return [root + q[0]!, root + q[1]!, root + q[2]!, root + (q[3] ?? 12)];
}
const chords = (names: readonly string[]) => { const made = names.map(chord); return (bar: number): Ch => made[bar % made.length]!; };
const at = (steps: readonly number[], n: number, d: number, v = 1): Note[] => steps.map((s) => ({ s, n, d, v }));

/**
 * A chord as a pianist's left hand would take it: its notes gathered close round middle C, each in the octave nearest
 * to it, so from chord to chord the hand hardly moves; a four-note chord without its root (the bass has that).
 */
function voicing(name: string): number[] {
  const c = chord(name);
  const four = c[3] - c[0] !== 12;
  const notes = four ? [c[1], c[2], c[3]] : [c[0], c[1], c[2]];
  return notes.map((n) => { const pc = ((n % 12) + 12) % 12; return pc + 12 * Math.round((60 - pc) / 12); }).sort((a, b) => a - b);
}
/** A chord's root where a bass plays it (E2 to D#3). */
const low = (name: string) => { const r = chord(name)[0]; return 40 + ((((r - 40) % 12) + 12) % 12); };
/** The note a step under `n` in the white-note scale (A minor, C major): what a bass plays on its way to `n`. */
const below = (n: number) => ([0, 2, 4, 5, 7, 9, 11].includes((((n - 1) % 12) + 12) % 12) ? n - 1 : n - 2);
/** A chord rolled from the bottom, as fingers do it: each note a moment after the last. */
const strum = (notes: readonly number[], s: number, d: number, v = 1, gap = 0.11): Note[] => notes.map((n, i) => ({ s: s + i * gap, n, d, v: v * (1 - i * 0.05) }));
/** A bass line under a chord: the root, its fifth, and a step on the way to the next root. */
function bassLine(root: number, next: number): Note[] {
  const fifth = root + 7 <= 52 ? root + 7 : root - 5;
  return [{ s: 0, n: root, d: 6 }, { s: 10, n: fifth, d: 3, v: 0.75 }, { s: 14, n: next === root ? fifth : below(next), d: 2, v: 0.7 }];
}

// ---------- the room ----------

const ROOM_NAMES = ['Am7', 'F', 'C', 'G', 'Am7', 'F', 'Dm7', 'E7', 'Am7', 'F', 'C', 'G', 'F', 'G', 'Am7', 'Am7'] as const;
const ROOM_V = ROOM_NAMES.map(voicing);
const ROOM_ROOT = ROOM_NAMES.map(low);
const ROOM_MEL = lines([
  'e5 . a5 . c6 b5 a5 .',
  'f5 . a5 . c6 . a5 f5',
  'e5 . g5 . c6 . e6 d6',
  'd6 . b5 . g5 . d5 .',
  'e5 . a5 . c6 b5 a5 .',
  'f5 . a5 c6 f6 . e6 .',
  'd6 . a5 . f5 . d5 .',
  'e5 . g#5 . b5 . e6 .',
  'a5 . . e5 a5 b5 c6 .',
  'c6 . a5 . f5 . . .',
  'g5 . . e5 g5 c6 e6 .',
  'd6 . b5 . g5 . . .',
  'a5 . c6 . f6 e6 c6 .',
  'b5 . d6 . g6 . d6 b5',
  'c6 . b5 . a5 . e5 .',
  'a5 . . . . . . .',
], 2);

/** Each pet's own instrument, key (semitones from A minor) and pace. */
const PET: Record<string, { lead: keyof typeof INST; key: number; bpm: number }> = {
  cat: { lead: 'musicbox', key: 0, bpm: 72 },
  frog: { lead: 'marimba', key: -2, bpm: 76 },
  sahur: { lead: 'woodbar', key: -5, bpm: 68 },
  thiccums: { lead: 'vibes', key: 2, bpm: 74 },
  seal: { lead: 'vibes', key: 2, bpm: 74 },
  r3tards: { lead: 'toy', key: -3, bpm: 70 },
};

/**
 * The room tune: 16 bars, round and round, three ways. The first time through, the tune whole; the second, only its
 * main notes over a flowing run of the chord; the third opens on the chords alone, the drums out, and the tune comes
 * back for the second half. So it is 48 bars (about two and a half minutes) before anything repeats exactly.
 */
function roomSong(who: string): Song {
  const p = PET[who] ?? PET.cat!;
  const pass = (bar: number) => Math.floor(bar / 16) % 3;
  const v = (bar: number) => ROOM_V[bar % 16]!;
  return {
    id: `room:${who}`, bpm: p.bpm, steps: 16, swing: 0.12, transpose: p.key,
    parts: [
      // the tune
      { inst: p.lead, v: 0.9, wet: 0.32, echo: 0.3, notes: (bar) => {
        const all = ROOM_MEL(bar);
        if (pass(bar) === 1) return all.filter((n) => n.s % 4 === 0).map((n) => ({ ...n, d: 4, v: 0.9 }));
        if (pass(bar) === 2 && bar % 16 < 8) return [];
        return all.map((n) => ({ ...n, v: n.s % 8 === 0 ? 1 : 0.8 }));
      } },
      // under it, the same instrument picking out the chord: four notes off the beat, or a flowing run of eight
      { inst: p.lead, v: 0.26, wet: 0.3, echo: 0.2, notes: (bar) => {
        const c = v(bar);
        if (pass(bar) === 1) return [c[0]!, c[1]!, c[2]!, c[0]! + 12, c[2]!, c[1]!, c[2]!, c[1]!].map((n, i) => ({ s: i * 2, n, d: 2, v: i === 0 ? 1 : 0.8 }));
        return [{ s: 2, n: c[1]!, d: 2 }, { s: 6, n: c[2]!, d: 2 }, { s: 10, n: c[0]! + 12, d: 2 }, { s: 14, n: c[2]!, d: 2 }];
      } },
      // the chords on an electric piano, rolled, low and soft: the warmth in the middle
      { inst: 'epiano', v: 0.55, wet: 0.3, notes: (bar) => {
        const c = v(bar);
        return [...strum(c, 0, 8), ...strum(c.slice(1), 10, 4, 0.65), ...(bar % 4 === 3 ? [{ s: 14, n: c[2]!, d: 2, v: 0.5 }] : [])];
      } },
      { inst: 'pad', v: 0.7, wet: 0.4, notes: (bar) => v(bar).map((n) => ({ s: 0, n, d: 16 })) },
      { inst: 'bass', v: 0.8, notes: (bar) => bassLine(ROOM_ROOT[bar % 16]!, ROOM_ROOT[(bar + 1) % 16]!) },
      // the drums sit out the opening of the third pass, and never play the same bar four times running
      { inst: 'kick', v: 0.78, notes: (bar) => (pass(bar) === 2 && bar % 16 < 4 ? [] : at(bar % 4 === 1 ? [0, 7, 10] : bar % 4 === 3 ? [0, 10, 13] : [0, 10], 0, 1)) },
      { inst: 'brush', v: 0.5, wet: 0.2, notes: (bar) => (pass(bar) === 2 && bar % 16 < 4 ? [] : [{ s: 4, n: 0, d: 1 }, { s: 12, n: 0, d: 1 }, ...(bar % 8 === 7 ? [{ s: 14, n: 0, d: 1, v: 0.5 }, { s: 15, n: 0, d: 1, v: 0.6 }] : [])]) },
      { inst: 'hat', v: 0.36, notes: (bar, r) => (pass(bar) === 2 && bar % 16 < 2 ? [] : [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, n: 0, d: 1, v: s % 4 === 2 ? 1 : 0.5 + r() * 0.2 }))) },
    ],
  };
}

// ---------- asleep: a lullaby in 6/8 ----------

const LULL_NAMES = ['Am', 'Am', 'F', 'C', 'Am', 'Am', 'E', 'Am'] as const;
const LULL_V = LULL_NAMES.map(voicing);
const LULL_ROOT = LULL_NAMES.map(low);
const LULL_MEL = lines([
  'e5 _ a5 c6 _ b5',
  'a5 _ _ e5 _ _',
  'f5 _ a5 c6 _ a5',
  'g5 _ _ e5 _ _',
  'e5 _ a5 c6 _ b5',
  'a5 _ c6 e6 _ d6',
  'c6 _ b5 a5 _ g#5',
  'a5 _ _ _ _ _',
], 2);

function lullaby(who: string): Song {
  const p = PET[who] ?? PET.cat!;
  return {
    id: `lullaby:${who}`, bpm: 66, steps: 12, transpose: p.key, gain: 1.25,
    parts: [
      { inst: p.lead, v: 0.6, wet: 0.45, echo: 0.35, notes: (bar) => (Math.floor(bar / 8) % 2 === 1 && bar % 8 < 4 ? [] : LULL_MEL(bar)) },
      // a rocking figure under it: low, high, middle
      { inst: p.lead, v: 0.3, wet: 0.45, echo: 0.2, notes: (bar) => { const c = LULL_V[bar % 8]!; return [{ s: 0, n: c[0]!, d: 4 }, { s: 4, n: c[2]!, d: 4, v: 0.8 }, { s: 8, n: c[1]!, d: 4, v: 0.8 }]; } },
      { inst: 'epiano', v: 0.3, wet: 0.4, notes: (bar) => strum(LULL_V[bar % 8]!, 0, 12, 1, 0.16) },
      { inst: 'pad', v: 0.6, wet: 0.4, notes: (bar) => LULL_V[bar % 8]!.map((n) => ({ s: 0, n, d: 12 })) },
      { inst: 'bass', v: 0.45, notes: (bar) => [{ s: 0, n: LULL_ROOT[bar % 8]!, d: 10 }] },
    ],
  };
}

// ---------- dead: a held chord, a far bell ----------

function dirge(): Song {
  const far = ['a4', 'c5', 'e5', 'g5', 'a5'].map(midi);
  return {
    id: 'dead', bpm: 50, steps: 16, gain: 1.8,
    parts: [
      { inst: 'pad', v: 0.7, wet: 0.5, notes: () => [midi('a2'), midi('e3'), midi('a3')].map((n) => ({ s: 0, n, d: 16 })) },
      { inst: 'musicbox', v: 0.35, wet: 0.7, echo: 0.5, notes: (_b, r) => (r() < 0.55 ? [{ s: Math.floor(r() * 12), n: far[Math.floor(r() * far.length)]!, d: 4 }] : []) },
      { inst: 'wind', v: 0.5, wet: 0.3, notes: (bar) => (bar % 3 === 0 ? [{ s: 2, n: 0, d: 14 }] : []) },
    ],
  };
}

// ---------- the Spooky theme: a waltz ----------

function spooky(): Song {
  const ch = chords(['Am', 'Am', 'Dm', 'Am', 'E', 'E', 'Am', 'Am', 'Am', 'Am', 'Dm', 'Dm', 'E', 'E', 'Am', 'Am']);
  const mel = lines([
    'a4 c5 e5', 'a5 _ g#5', 'f5 d5 f5', 'e5 _ _', 'e5 g#5 b5', 'd6 _ c6', 'b5 a5 g#5', 'a5 _ _',
    'a5 e5 c5', 'a4 _ _', 'd5 f5 a5', 'd6 _ _', 'e6 d6 b5', 'g#5 _ e5', 'a5 _ _', '. . .',
  ], 4);
  return {
    id: 'spooky', bpm: 126, steps: 12,
    parts: [
      { inst: 'theremin', v: 0.6, wet: 0.45, echo: 0.25, notes: (bar) => (Math.floor(bar / 16) % 2 === 1 && bar % 16 < 8 ? [] : mel(bar)) },
      { inst: 'organ', v: 0.38, wet: 0.3, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 5 }] },
      { inst: 'bass', v: 0.5, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 6 }] },
      { inst: 'musicbox', v: 0.3, wet: 0.35, echo: 0.2, notes: (bar) => { const c = ch(bar); return [4, 8].flatMap((s) => [c[1] + 12, c[2] + 12].map((n) => ({ s, n, d: 2, v: s === 4 ? 1 : 0.8 }))); } },
      { inst: 'pad', v: 0.6, wet: 0.4, notes: (bar) => ch(bar).slice(0, 3).map((n) => ({ s: 0, n: n + 12, d: 12 })) },
      { inst: 'owl', v: 0.4, wet: 0.6, notes: (bar) => (bar % 16 === 7 ? [{ s: 2, n: 0, d: 8 }] : []) },
      { inst: 'wind', v: 0.5, wet: 0.3, notes: (bar) => (bar % 4 === 1 ? [{ s: 0, n: 0, d: 22 }] : []) },
    ],
  };
}

// ---------- the Backrooms: muzak through a wall, under strip lights ----------

function backrooms(): Song {
  const ch = chords(['Cmaj7', 'Am7', 'Fmaj7', 'Gsus4']);
  const mel = lines(['e5 _ _ _ g5 _ _ _', '. . . . . . . .', 'a5 _ _ _ c6 _ b5 _', 'g5 _ _ _ . . . .'], 2);
  return {
    id: 'backrooms', bpm: 54, steps: 16, gain: 1.3,
    parts: [
      { inst: 'hum', v: 0.5, notes: () => [{ s: 0, n: 0, d: 16 }] },
      { inst: 'muzak', v: 0.5, wet: 0.6, notes: (bar) => { const c = ch(bar); return [0, 3, 6, 9].map((s, i) => ({ s, n: c[i % c.length]! + 12, d: 6, v: 1 - i * 0.1 })); } },
      { inst: 'muzak', v: 0.45, wet: 0.7, notes: (bar) => (Math.floor(bar / 4) % 2 === 0 ? [] : mel(bar)) },
      { inst: 'bass', v: 0.4, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 12 }] },
    ],
  };
}

// ---------- the Western Wall: a clarinet over a drone ----------

function kotel(): Song {
  const ch = chords(['D', 'D', 'Gm', 'D', 'D', 'D', 'Cm', 'D']);
  const mel = lines([
    'd5 _ eb5 f#5 g5 _ f#5 eb5',
    'd5 _ _ _ . . a4 c5',
    'd5 _ f#5 g5 a5 _ bb5 a5',
    'g5 f#5 eb5 _ d5 _ _ _',
    'a5 _ bb5 a5 g5 _ f#5 g5',
    'a5 _ _ _ . . g5 f#5',
    'eb5 _ g5 _ f#5 eb5 d5 c5',
    'd5 _ _ _ _ _ . .',
  ], 2);
  return {
    id: 'kotel', bpm: 63, steps: 16,
    parts: [
      { inst: 'clarinet', v: 0.75, wet: 0.45, echo: 0.22, notes: (bar) => (bar % 16 < 8 ? mel(bar) : []) },
      { inst: 'pluck', v: 0.55, wet: 0.35, notes: (bar) => { const c = ch(bar); return [{ s: 0, n: c[0], d: 4 }, { s: 4, n: c[2], d: 4, v: 0.8 }, { s: 8, n: c[0] + 12, d: 4, v: 0.9 }, { s: 12, n: c[1] + 12, d: 4, v: 0.8 }]; } },
      // the second time round the strings answer the clarinet
      { inst: 'pluck', v: 0.45, wet: 0.45, echo: 0.3, notes: (bar) => (bar % 16 >= 8 ? [{ s: 2, n: ch(bar)[2] + 12, d: 2 }, { s: 6, n: ch(bar)[0] + 24, d: 2 }, { s: 10, n: ch(bar)[2] + 12, d: 2 }] : []) },
      { inst: 'pad', v: 0.75, wet: 0.4, notes: () => [midi('d3'), midi('a3'), midi('d4')].map((n) => ({ s: 0, n, d: 16 })) },
      { inst: 'bass', v: 0.5, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 14 }] },
    ],
  };
}

// ---------- the Majlis: an oud, a ney, a darbuka kept low ----------

function majlis(): Song {
  const ch = chords(['G', 'G', 'Cm', 'G', 'G', 'Cm', 'Ab', 'G']);
  const mel = lines([
    'g4 ab4 b4 c5 d5 _ c5 b4',
    'c5 b4 ab4 g4 g4 _ . .',
    'd5 eb5 d5 c5 b4 c5 d5 _',
    'c5 b4 ab4 b4 g4 _ _ .',
    'g5 _ f5 eb5 d5 _ c5 d5',
    'eb5 d5 c5 b4 c5 _ . .',
    'c5 _ eb5 c5 ab4 _ c5 ab4',
    'ab4 _ g4 _ _ _ . .',
  ], 2);
  const ney = lines(['d5 _ _ _', 'd5 _ _ .', 'eb5 _ _ _', 'd5 _ _ .', 'g5 _ _ _', 'eb5 _ _ .', 'c5 _ _ _', 'b4 _ _ .'], 4);
  return {
    id: 'majlis', bpm: 88, steps: 16, gain: 1.5,
    parts: [
      { inst: 'pluck', v: 0.85, wet: 0.3, echo: 0.22, notes: (bar) => (bar % 16 < 8 || bar % 2 === 0 ? mel(bar) : []) },
      { inst: 'ney', v: 0.55, wet: 0.5, echo: 0.2, notes: (bar) => (bar % 16 >= 8 ? ney(bar) : []) },
      { inst: 'pluck', v: 0.42, wet: 0.2, notes: (bar) => { const c = ch(bar); return [{ s: 0, n: c[0] - 12, d: 6 }, { s: 8, n: c[2] - 12, d: 6, v: 0.8 }]; } },
      { inst: 'dum', v: 0.3, notes: () => at([0, 8], 0, 1) },
      { inst: 'tek', v: 0.26, notes: (_b, r) => [{ s: 2, n: 0, d: 1 }, { s: 6, n: 0, d: 1 }, { s: 12, n: 0, d: 1 }, { s: 10, n: 0, d: 1, v: 0.45 }, ...(r() < 0.5 ? [{ s: 14, n: 0, d: 1, v: 0.45 }] : [])] },
      { inst: 'pad', v: 0.45, wet: 0.4, notes: (bar) => [ch(bar)[0], ch(bar)[2], ch(bar)[0] + 12].map((n) => ({ s: 0, n, d: 16 })) },
      { inst: 'bass', v: 0.45, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 7 }, { s: 8, n: ch(bar)[0] - 12, d: 6, v: 0.8 }] },
    ],
  };
}

// ---------- the emo bedroom: a clean guitar twinkling in E minor, rain on the window ----------

/**
 * "Rain on the window": the emo bedroom's song. Written to sit with the pets' own riff (director.playGuitar: E5 C5 G5
 * D5, eighths of 175 ms): the same key and the same four chords, coloured the way a clean emo guitar colours them (Em9,
 * Cmaj7, G6, D over F#; ninths and major sevenths, a little sad and a little sweet), and exactly half the riff's tempo
 * (85.7 bpm: a sixteenth here is one of the riff's eighths), so a pet picking the guitar up comes in on the room's own
 * pulse. (While a pet plays, the music steps aside: engine.ts 'music.duck'.) 4/4, 16 bars, three ways round (48 bars,
 * about 2 minutes 15 before it repeats):
 *   1. the twinkle alone in the rain, the held strings coming in on the fifth bar, the bass on the ninth;
 *   2. a soft half-time beat (the kick, a brush on three, a shaker in eighths) and a second guitar singing up high with
 *      the echo, two long notes a bar;
 *   3. it opens bare (the twinkle and the rain), the electric piano rolls the chords in, and from the ninth bar the beat
 *      is a backbeat with the snare on two and four, a fill at the end, and back to the rain.
 */
function emoroom(): Song {
  const names = ['Em7', 'Cmaj7', 'G6', 'D', 'Em7', 'Cmaj7', 'Am7', 'B7', 'Cmaj7', 'G', 'Am7', 'Em7', 'Cmaj7', 'G6', 'D', 'Dsus4'] as const;
  const V = names.map(voicing);
  // the bass under them (D over F#, G over B: the bass walking where the chords would jump)
  const ROOT = ['e2', 'c3', 'g2', 'f#2', 'e2', 'c3', 'a2', 'b2', 'c3', 'b2', 'a2', 'e2', 'c3', 'g2', 'd3', 'd3'].map(midi);
  // and the note it climbs to: the chord's own fifth (a fifth over F# or B would be the major seventh of D or G)
  const FIFTH = ['b2', 'g3', 'd3', 'a2', 'b2', 'g3', 'e3', 'f#3', 'g3', 'd3', 'e3', 'b2', 'g3', 'd3', 'a3', 'a3'].map(midi);
  const pass = (bar: number) => Math.floor(bar / 16) % 3, at16 = (bar: number) => bar % 16;
  const bare = (bar: number) => pass(bar) === 2 && at16(bar) < 4;
  // the twinkle: an eighth a token, the thumb on the bar's root, the fingers ringing the ninths and sevenths over it
  const figure = lines([
    'e3 b3 f#4 g4 b4 g4 f#4 b3',
    'c3 g3 b3 e4 g4 e4 b3 g3',
    'g2 d3 b3 e4 g4 e4 b3 d3',
    'f#2 d3 a3 e4 f#4 e4 a3 d3',
    'e3 b3 f#4 g4 b4 d5 b4 g4',
    'c3 g3 b3 e4 g4 b4 g4 e4',
    'a2 e3 g3 c4 e4 c4 g3 e3',
    'b2 f#3 a3 d#4 f#4 d#4 b3 a3',
    'c3 g3 e4 b4 g4 e4 b3 g3',
    'b2 g3 d4 b4 g4 d4 b3 g3',
    'a2 e3 c4 g4 e4 c4 g3 e3',
    'e3 b3 g4 f#4 b4 f#4 g4 b3',
    'c3 g3 b3 e4 g4 b4 e5 b4',
    'g2 d3 g3 b3 e4 b3 g3 d3',
    'd3 a3 d4 f#4 a4 f#4 d4 a3',
    'd3 a3 d4 g4 a4 g4 f#4 a3',
  ], 2);
  // the second guitar's tune: two long notes a bar, over the chords' own notes, leaning on the sevenths
  const lead = lines([
    'b4 g4', 'e5 _', 'd5 b4', 'a4 f#4', 'g4 b4', 'e5 g5', 'e5 c5', 'b4 d#5',
    'e5 _', 'd5 b4', 'c5 a4', 'g4 b4', 'e5 g5', 'd5 e5', 'f#5 a5', 'g5 f#5',
  ], 8);
  // the beats: a soft half-time the second time round (from its fifth bar), a backbeat the third (from its ninth)
  const half = (bar: number) => pass(bar) === 1 && at16(bar) >= 4;
  const back = (bar: number) => pass(bar) === 2 && at16(bar) >= 8;
  const fill = (bar: number) => pass(bar) === 2 && at16(bar) === 15;
  return {
    id: 'emoroom', bpm: 600 / 7, steps: 16, gain: 1.4,
    parts: [
      // the twinkle: the thumb's note a touch louder, the open strings a touch softer
      { inst: 'gtr', v: 1.2, wet: 0.3, echo: 0.12, notes: (bar) => figure(bar).map((n) => ({ ...n, v: n.s === 0 ? 1 : n.s % 8 === 0 ? 0.86 : 0.72 })) },
      // the second guitar, up high, with the echo (the second time round, and the third once it has built)
      { inst: 'gtr', v: 1.05, wet: 0.42, echo: 0.4, notes: (bar) => (pass(bar) === 1 || (pass(bar) === 2 && at16(bar) >= 8) ? lead(bar) : []) },
      // held strings (from the fifth bar the first time; not while it is bare)
      { inst: 'pad', v: 0.46, wet: 0.4, notes: (bar) => (bare(bar) || (pass(bar) === 0 && at16(bar) < 4) ? [] : V[at16(bar)]!.map((n) => ({ s: 0, n, d: 16 }))) },
      // the electric piano rolls the chords in, the third time round
      { inst: 'epiano', v: 0.38, wet: 0.35, notes: (bar) => (pass(bar) === 2 && at16(bar) >= 4 ? [...strum(V[at16(bar)]!, 0, 8, 0.9, 0.13), ...strum(V[at16(bar)]!.slice(1), 8, 8, 0.6, 0.13)] : []) },
      // the bass: the root on the one and on the and of two, then the chord's fifth (its octave under the backbeat)
      // (from the ninth bar the first time)
      { inst: 'bass', v: 0.5, notes: (bar) => (bare(bar) || (pass(bar) === 0 && at16(bar) < 8) ? [] : [{ s: 0, n: ROOT[at16(bar)]!, d: 6 }, { s: 6, n: ROOT[at16(bar)]!, d: 4, v: 0.75 }, { s: 10, n: back(bar) ? ROOT[at16(bar)]! + 12 : FIFTH[at16(bar)]!, d: 5, v: 0.65 }]) },
      // the kick: on the one and the and of three (half time), on the one, the and of two and three (the backbeat)
      { inst: 'kick', v: 0.55, notes: (bar) => (half(bar) ? at([0, 10], 0, 1) : back(bar) ? at(fill(bar) ? [0, 6] : [0, 6, 8], 0, 1) : []) },
      // the brush on three (half time); the snare on two and four (the backbeat), and the fill into the start again
      { inst: 'brush', v: 0.4, wet: 0.2, notes: (bar) => (half(bar) ? [{ s: 8, n: 0, d: 1 }, ...(at16(bar) % 4 === 3 ? [{ s: 14, n: 0, d: 1, v: 0.5 }, { s: 15, n: 0, d: 1, v: 0.6 }] : [])] : []) },
      { inst: 'snare', v: 0.3, wet: 0.25, notes: (bar) => (back(bar) ? (fill(bar) ? [{ s: 4, n: 0, d: 1 }, ...[8, 9, 10, 11, 12, 13, 14, 15].map((s, i) => ({ s, n: 0, d: 1, v: 0.35 + i * 0.08 }))] : at([4, 12], 0, 1)) : []) },
      // the shaker in eighths, the off-beats softer
      { inst: 'hat', v: 0.28, notes: (bar, r) => (half(bar) || back(bar) ? [0, 2, 4, 6, 8, 10, 12, 14].filter((s) => !(fill(bar) && s >= 8)).map((s) => ({ s, n: 0, d: 1, v: (s % 4 === 0 ? 0.75 : 0.5) + r() * 0.2 })) : []) },
      // the rain on the window, a note every two bars, crossfading into the next
      { inst: 'rain', v: 0.54, wet: 0.15, notes: (bar) => (bar % 2 === 0 ? [{ s: 0, n: 0, d: 32 }] : []) },
    ],
  };
}

// ---------- Emotown ----------

function town(phase: 'dawn' | 'day' | 'dusk' | 'night', season: string): Song {
  const night = phase === 'night';
  // (sixths where a major seventh would sit a semitone under the tune)
  const names = night ? ['Am7', 'F6', 'Dm7', 'E7', 'Am7', 'F6', 'Dm7', 'E7'] : ['Fmaj7', 'Em7', 'Dm7', 'C6', 'Fmaj7', 'Em7', 'G7', 'C6'];
  const V = names.map(voicing); const ROOT = names.map(low);
  const mel = night
    ? lines(['e5 . a5 . c6 . b5 .', 'a5 . . f5 . . e5 .', 'f5 . a5 . d6 . c6 .', 'b5 . g#5 . e5 . . .', 'c6 . b5 a5 . e5 . .', 'a5 . f5 . c5 . . .', 'd5 . f5 a5 . c6 . .', 'b5 . . g#5 . . e5 .'], 2)
    : lines(['a5 . g5 e5 . . c5 .', 'g5 . e5 d5 . . b4 .', 'f5 . e5 d5 . a4 . .', 'e5 . d5 c5 . . . .', 'c6 . a5 g5 . e5 . .', 'b5 . g5 e5 . d5 . .', 'a5 . f5 d5 . b4 d5 .', 'e5 . . g5 . . . .'], 2);
  const drums = phase === 'day' || night;
  const birds = [101, 103, 105, 99];   // high notes, as MIDI numbers
  const parts: Part[] = [
    // the music box sits out every other eight bars
    { inst: 'musicbox', v: 0.8, wet: 0.4, echo: 0.3, notes: (bar) => (Math.floor(bar / 8) % 2 === 1 ? [] : mel(bar)) },
    // the chords, rolled, on the first beat and pushed again before the third; while the music box rests, a third time
    { inst: 'epiano', v: 0.62, wet: 0.3, notes: (bar) => { const c = V[bar % 8]!; return [...strum(c, 0, 6), ...strum(c.slice(1), 10, 4, 0.7), ...(Math.floor(bar / 8) % 2 === 1 ? [{ s: 6, n: c[2]! + 12, d: 3, v: 0.5 }, { s: 14, n: c[1]! + 12, d: 2, v: 0.45 }] : [])]; } },
    { inst: 'bass', v: 0.75, notes: (bar) => bassLine(ROOT[bar % 8]!, ROOT[(bar + 1) % 8]!) },
    // held strings under it all (more of them when there are no drums to carry it)
    { inst: 'pad', v: drums ? 0.45 : 0.7, wet: 0.4, notes: (bar) => V[bar % 8]!.map((n) => ({ s: 0, n, d: 16 })) },
  ];
  if (drums) {
    parts.push(
      { inst: 'kick', v: night ? 0.7 : 0.82, notes: (bar) => at(bar % 4 === 1 ? [0, 7, 10] : bar % 4 === 3 ? [0, 10, 13] : [0, 10], 0, 1) },
      { inst: 'brush', v: night ? 0.42 : 0.56, wet: 0.2, notes: (bar) => [{ s: 4, n: 0, d: 1 }, { s: 12, n: 0, d: 1 }, ...(bar % 8 === 7 ? [{ s: 14, n: 0, d: 1, v: 0.5 }, { s: 15, n: 0, d: 1, v: 0.6 }] : [])] },
      { inst: 'hat', v: night ? 0.27 : 0.37, notes: (_b, r) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ s, n: 0, d: 1, v: s % 4 === 2 ? 1 : 0.5 + r() * 0.25 })) },
    );
  }
  if (season === 'winter') parts.push({ inst: 'jingle', v: 0.5, notes: () => at([2, 6, 10, 14], 0, 1) });
  // what is in the air: crickets at night, birds otherwise (more of them at dawn), the wind in winter
  if (night) parts.push({ inst: 'cricket', v: 0.12, wet: 0.2, notes: (_b, r) => [0, 3, 6, 9, 12].filter(() => r() < 0.8).map((s) => ({ s: s + r(), n: 0, d: 1, v: 0.6 + r() * 0.4 })) });
  else if (season !== 'winter') parts.push({ inst: 'bird', v: 0.14, wet: 0.5, notes: (_b, r) => (r() < (phase === 'dawn' ? 0.8 : 0.35) ? [0, 1, 2].slice(0, 1 + Math.floor(r() * 3)).map((i) => ({ s: Math.floor(r() * 10) + i * 0.9, n: birds[Math.floor(r() * birds.length)]!, d: 1 })) : []) });
  if (season === 'winter') parts.push({ inst: 'wind', v: 0.4, wet: 0.2, notes: (bar) => (bar % 2 === 0 ? [{ s: 0, n: 0, d: 30 }] : []) });
  return { id: `town:${phase}:${season === 'winter' ? 'winter' : 'x'}`, bpm: night ? 70 : phase === 'day' ? 80 : 74, steps: 16, swing: 0.16, parts };
}

// ---------- Emo's Tavern ----------

function tavern(): Song {
  const ch = chords(['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'A', 'Dm']);
  const mel = lines(['d5 f5 a5', 'bb5 _ a5', 'a5 f5 c5', 'e5 _ g5', 'f5 a5 d6', 'd6 bb5 g5', 'a5 c#6 e6', 'd6 _ _'], 4);
  return {
    id: 'tavern', bpm: 112, steps: 12,
    parts: [
      { inst: 'ney', v: 0.5, wet: 0.35, echo: 0.2, notes: (bar) => (Math.floor(bar / 8) % 2 === 0 ? mel(bar) : []) },
      { inst: 'pad', v: 0.7, wet: 0.35, notes: (bar) => ch(bar).slice(0, 3).map((n) => ({ s: 0, n, d: 12 })) },
      { inst: 'pluck', v: 0.7, wet: 0.25, notes: (bar) => { const c = ch(bar); return [c[0] - 12, c[2], c[0] + 12, c[1] + 12, c[2], c[1] + 12].map((n, i) => ({ s: i * 2, n, d: 2, v: i === 0 ? 1 : 0.7 })); } },
      { inst: 'bass', v: 0.5, notes: (bar) => [{ s: 0, n: ch(bar)[0] - 12, d: 10 }] },
    ],
  };
}

function fight(): Song {
  const ch = chords(['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B']);
  const mel = lines([
    'e5 . g5 a5 b5 . a5 g5', 'e5 . . d5 e5 . . .', 'c5 . e5 g5 c6 . b5 g5', 'a5 . f#5 . d5 . . .',
    'e5 . g5 a5 b5 . a5 g5', 'e5 . . g5 b5 . . .', 'c6 . b5 g5 e5 . g5 .', 'f#5 . d#5 . b4 . . .',
  ], 2);
  return {
    id: 'fight', bpm: 132, steps: 16, gain: 1.55,
    parts: [
      { inst: 'brass', v: 0.7, wet: 0.25, echo: 0.15, notes: (bar) => (Math.floor(bar / 8) % 2 === 0 && bar % 8 < 4 ? [] : mel(bar)) },
      { inst: 'pluck', v: 0.3, wet: 0.2, notes: (bar) => ch(bar).map((n) => ({ s: 0, n: n + 12, d: 4 })) },
      { inst: 'pad', v: 0.4, wet: 0.3, notes: (bar) => ch(bar).slice(0, 3).map((n) => ({ s: 0, n, d: 16 })) },
      { inst: 'bass', v: 0.8, notes: (bar) => { const r = ch(bar)[0] - 12; return [0, 0, 12, 0, 0, 12, 7, 10].map((x, i) => ({ s: i * 2, n: r + x, d: 2, v: i % 2 ? 0.8 : 1 })); } },
      { inst: 'kick', v: 0.75, notes: () => at([0, 8, 10], 0, 1) },
      { inst: 'snare', v: 0.45, notes: (bar) => at(bar % 4 === 3 ? [4, 12, 14, 15] : [4, 12], 0, 1) },
      { inst: 'hat', v: 0.55, notes: () => Array.from({ length: 16 }, (_x, s) => ({ s, n: 0, d: 1, v: s % 4 === 0 ? 1 : s % 2 ? 0.45 : 0.7 })) },
    ],
  };
}

// ---------- which tune a page wants ----------

const MADE = new Map<string, Song>();
const keep = (id: string, make: () => Song) => { let s = MADE.get(id); if (!s) { s = make(); MADE.set(id, s); } return s; };

export function songFor(w: MusicWish): Song {
  if (w.place === 'town') return keep(`town:${w.phase}:${w.season === 'winter' ? 'winter' : 'x'}`, () => town(w.phase, w.season));
  if (w.place === 'tavern') return w.fight ? keep('fight', fight) : keep('tavern', tavern);
  if (w.dead) return keep('dead', dirge);
  if (w.asleep) return keep(`lullaby:${w.who}`, () => lullaby(w.who));
  if (w.scene === 'halloween') return keep('spooky', spooky);
  if (w.scene === 'backrooms') return keep('backrooms', backrooms);
  if (w.scene === 'kotel') return keep('kotel', kotel);
  if (w.scene === 'majlis') return keep('majlis', majlis);
  if (w.scene === 'emoroom') return keep('emoroom', emoroom);
  return keep(`room:${w.who}`, () => roomSong(w.who));
}

/** Every tune, for the sound lab. */
export const SONGS: { label: string; wish: MusicWish }[] = [
  ...(['cat', 'frog', 'sahur', 'thiccums', 'r3tards'] as const).map((who) => ({ label: `Room · ${who}`, wish: { place: 'room', who, scene: null, asleep: false, dead: false } as MusicWish })),
  { label: 'Asleep (lullaby)', wish: { place: 'room', who: 'cat', scene: null, asleep: true, dead: false } },
  { label: 'Dead', wish: { place: 'room', who: 'cat', scene: null, asleep: false, dead: true } },
  { label: 'Spooky theme', wish: { place: 'room', who: 'cat', scene: 'halloween', asleep: false, dead: false } },
  { label: 'Backrooms', wish: { place: 'room', who: 'cat', scene: 'backrooms', asleep: false, dead: false } },
  { label: 'Western Wall', wish: { place: 'room', who: 'cat', scene: 'kotel', asleep: false, dead: false } },
  { label: 'Majlis', wish: { place: 'room', who: 'cat', scene: 'majlis', asleep: false, dead: false } },
  { label: 'Emo bedroom', wish: { place: 'room', who: 'cat', scene: 'emoroom', asleep: false, dead: false } },
  ...(['dawn', 'day', 'dusk', 'night'] as const).map((phase) => ({ label: `Emotown · ${phase}`, wish: { place: 'town', phase, season: 'summer' } as MusicWish })),
  { label: 'Emotown · winter day', wish: { place: 'town', phase: 'day', season: 'winter' } },
  { label: "Emo's Tavern", wish: { place: 'tavern', fight: false } },
  { label: 'A fight', wish: { place: 'tavern', fight: true } },
];

// ---------- playing a bar ----------

/** A tune being played: its own output, one gain per part with its shares of reverb and echo, and the notes still sounding. */
export type Playing = { song: Song; out: GainNode; send: GainNode; parts: { dry: GainNode; wet: GainNode; echo: GainNode }[]; notes: { tap: AudioNode; until: number }[] };

export function start(ac: BaseAudioContext, song: Song, to: AudioNode, reverb: AudioNode): Playing {
  const out = ac.createGain(); out.connect(to);
  const send = ac.createGain(); send.connect(reverb);
  // the echo: a repeat every dotted eighth, first to one side then the other, each duller and quieter than the last
  const step = 60 / song.bpm / 4;
  const echoIn = ac.createGain();
  const dull = ac.createBiquadFilter(); dull.type = 'lowpass'; dull.frequency.value = 2400;
  const a = ac.createDelay(2), b = ac.createDelay(2), back = ac.createGain(), level = ac.createGain();
  a.delayTime.value = step * 3; b.delayTime.value = step * 3; back.gain.value = 0.32; level.gain.value = 0.8;
  echoIn.connect(dull); dull.connect(a); a.connect(b); b.connect(back); back.connect(dull);
  const side = (n: AudioNode, p: number) => {
    if (typeof ac.createStereoPanner !== 'function') { n.connect(level); return; }
    const sp = ac.createStereoPanner(); sp.pan.value = p; n.connect(sp); sp.connect(level);
  };
  side(a, -0.55); side(b, 0.55);
  level.connect(out);
  const tail = ac.createGain(); tail.gain.value = 0.25; level.connect(tail); tail.connect(send);
  // the reverb's share follows the tune's own level, so a tune fading out takes its echo with it
  const k = song.gain ?? 1;
  const parts = song.parts.map((p) => {
    const dry = ac.createGain(); dry.gain.value = p.v * k; dry.connect(out);
    const wet = ac.createGain(); wet.gain.value = p.v * k * (p.wet ?? 0); wet.connect(send);
    const echo = ac.createGain(); echo.gain.value = p.v * k * (p.echo ?? 0); echo.connect(echoIn);
    return { dry, wet, echo };
  });
  return { song, out, send, parts, notes: [] };
}
export const sendOf = (p: Playing) => p.send;

/** How long one bar of a tune lasts, in seconds. */
export const barSeconds = (song: Song) => (60 / song.bpm / 4) * song.steps;

// ----- notes made once and kept -----
// A struck or plucked note is the same every time it is played, so it is rendered once, off to the side, when a tune
// is first wanted, and from then on played back as a recording: one buffer and one gain a note, where making it live is
// a dozen oscillators and envelopes. (Measured, the room tune made live: 125 new audio nodes a second, 500 to 1,000
// alive at once, 11-16% of the audio thread on an M3. A phone has a fraction of that, and when it runs out the sound
// breaks up: the operator heard it as "weird ambient sort of clicking".) Held notes (strings, bass, winds) are still
// made as they play: there are few of them.
//
// A tune does not wait for them: it begins at once, each note made live until its recording is there (scheduleBar
// takes whichever exists), and the recordings are kept in the browser (kept.ts), so on every later page they are
// simply read back.

/** How many seconds of each kept instrument's note are worth keeping (for the held strings: the note and its fade). */
const KEPT: Partial<Record<keyof typeof INST, number | ((sec: number) => number)>> = {
  musicbox: 1.35, marimba: 1.05, woodbar: 0.75, vibes: 2.3, toy: 0.95, epiano: 1.75, gtr: 1.65,
  kick: 0.36, snare: 0.3, brush: 0.3, rim: 0.12, hat: 0.2, jingle: 0.16, dum: 0.32, tek: 0.12, cricket: 0.16, bird: 0.16,
  // the held strings too: twelve oscillators a chord, for every second of every tune, were the dearest thing in it
  pad: (sec) => sec + 1.65,
};
const SAMPLES = new Map<string, AudioBuffer>();
const READY = new Map<string, Promise<void>>();
/** which kept notes each tune uses, for every tune whose notes are in memory or being made, oldest first */
const USES = new Map<string, Set<string>>();
/** the tunes whose notes are all there */
const DONE = new Set<string>();
/** the tunes playing or wanted now (the engine says): never let go, whatever else is made meanwhile */
let HELD = new Set<string>();
const tuneId = (rate: number, song: Song) => `${rate}|${song.id}`;
export function holdTunes(rate: number, songs: (Song | null | undefined)[]) { HELD = new Set(songs.filter((x): x is Song => !!x).map((x) => tuneId(rate, x))); }
const sampleKey = (rate: number, inst: string, f: number, sec: number) =>
  `${rate}|${inst}|${Math.round(f * 10)}|${inst === 'pad' ? Math.round(sec * 20) : inst === 'hat' && sec > 0.2 ? 'open' : ''}`;

/** Let the main thread breathe (a page is loading, a pet is moving) between two pieces of work on big buffers. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

async function bake(rate: number, key: string, inst: keyof typeof INST, f: number, sec: number) {
  const k = KEPT[inst]!;
  const len = typeof k === 'number' ? k : k(sec);
  const ac = new OfflineAudioContext(2, Math.ceil(rate * len), rate);
  const out = ac.createGain(); out.connect(ac.destination);
  (INST[inst] as Inst)({ ac, t: 0, out, wet: ac.createGain() }, f, sec, 1);
  const buf = await ac.startRendering();
  // its end fades out (nothing is cut off sharply, which would be a click)
  const n = Math.min(buf.length, Math.floor(rate * 0.04));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[buf.length - 1 - i] = d[buf.length - 1 - i]! * (i / n); }
  // a note that is the same on both sides is kept as one side (half the memory, and half of what the browser stores)
  const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  let same = true;
  for (let i = 0; i < l.length; i += 3) if (Math.abs(l[i]! - r[i]!) > 1e-6) { same = false; break; }
  let kept = buf;
  if (same && buf.numberOfChannels > 1) { const mono = blank(rate, 1, buf.length); if (mono) { mono.getChannelData(0).set(l); kept = mono; } }
  SAMPLES.set(key, kept);
  void keepNote(key, { rate, ch: same ? [l] : [l, r] });
}
/** An empty buffer made off any context (null where the browser cannot). */
function blank(rate: number, channels: number, length: number): AudioBuffer | null {
  try { return new AudioBuffer({ length, numberOfChannels: channels, sampleRate: rate }); } catch { return null; }
}
/** Every kept note a tune will want, and those among them not in memory yet. */
function wanted(rate: number, song: Song) {
  const step = 60 / song.bpm / 4;
  const all = new Set<string>();
  const need = new Map<string, [keyof typeof INST, number, number]>();
  for (let bar = 0; bar < 96; bar++) {
    const r = rng(bar * 7919 + 17);
    for (const part of song.parts) {
      const notes = part.notes(bar, r);
      if (KEPT[part.inst] === undefined) continue;
      for (const n of notes) {
        const f = n.n ? hz(n.n + (song.transpose ?? 0)) : 0;
        const key = sampleKey(rate, part.inst, f, n.d * step);
        all.add(key);
        if (!SAMPLES.has(key)) need.set(key, [part.inst, f, n.d * step]);
      }
    }
  }
  return { all, need };
}
/**
 * Take from the browser's store the notes that were made on an earlier page; what is found is no longer needed. They
 * are unpacked a note at a time, straight into the buffer they will be played from, with a breath between: all of a
 * tune at once was a long stall on a phone, at the very moment its page was loading.
 */
async function fromStore(need: Map<string, unknown>) {
  if (!need.size) return;
  const found = await keptNotes([...need.keys()]);
  let since = performance.now();
  for (const key of [...found.keys()]) {
    const note = found.get(key)!; found.delete(key);
    const shape = shapeOf(note);
    const buf = blank(shape.rate, shape.channels, shape.length);
    if (!buf) continue;
    for (let ch = 0; ch < shape.channels; ch++) unpackInto(note, ch, buf.getChannelData(ch));
    SAMPLES.set(key, buf); need.delete(key);
    if (performance.now() - since > 6) { await breathe(); since = performance.now(); }
  }
}
/**
 * Before any sound is allowed (no press yet): bring a tune's notes in from the store, if an earlier page made them, so
 * the first press starts it from its recordings. Nothing is rendered here: a visitor who never presses costs nothing.
 */
export async function warm(rate: number, song: Song) {
  const { all, need } = wanted(rate, song);
  const id = tuneId(rate, song);
  // (counted as in use from now on, so another tune being made meanwhile does not throw these away)
  if (!USES.has(id)) USES.set(id, all);
  await fromStore(need);
}

/** Let go of the tunes not wanted any more: the two newest are kept, and whatever is playing or wanted. */
function letGo() {
  const idle = [...USES.keys()].filter((id) => !HELD.has(id) && !MAKING.has(id));
  for (const old of idle.slice(0, Math.max(0, idle.length - 2))) { USES.delete(old); DONE.delete(old); READY.delete(old); }
  const live = new Set<string>(); for (const set of USES.values()) for (const k of set) live.add(k);
  for (const k of [...SAMPLES.keys()]) if (!live.has(k)) SAMPLES.delete(k);
}
/** the tunes whose notes are being made right now */
const MAKING = new Set<string>();
/** how many notes are rendered at once: fewer on a small device, which is also playing the tune live meanwhile */
const AT_ONCE = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 4) ? 4 : 2;

/** Make and keep every note a tune will want, for a context of this sample rate. Resolves when they are all there. */
export function prepare(rate: number, song: Song): Promise<void> {
  const id = tuneId(rate, song);
  let p = READY.get(id);
  if (!p) {
    p = (async () => {
      MAKING.add(id);
      try {
        const { all, need } = wanted(rate, song);
        // in use from this moment (newest last): a tune being made is never thrown away by another one finishing
        USES.delete(id); USES.set(id, all);
        await fromStore(need);
        // (made in the order the tune wants them: its first bars' notes are ready first, the tune having begun already)
        const list = [...need];
        for (let i = 0; i < list.length; i += AT_ONCE) await Promise.all(list.slice(i, i + AT_ONCE).map(([key, [inst, f, sec]]) => bake(rate, key, inst, f, sec).catch(() => {})));
        // all there, unless something took them meanwhile (then it is not called done, and is asked for again)
        let whole = true; for (const k of all) if (!SAMPLES.has(k)) { whole = false; break; }
        if (whole) DONE.add(id); else READY.delete(id);
      } catch { READY.delete(id); }
      finally { MAKING.delete(id); letGo(); }
    })();
    READY.set(id, p);
  }
  return p;
}
/** True while a tune's kept notes are all there (they are let go when two other tunes have been played since). */
export const prepared = (rate: number, song: Song) => DONE.has(tuneId(rate, song));

const DRUMS = new Set<string>(['kick', 'snare', 'brush', 'rim', 'hat', 'jingle', 'dum', 'tek']);
/** A number from 0 to 1 that is always the same for the same note of the same bar. */
const chance = (bar: number, part: number, s: number, salt: number) => { const x = Math.sin((bar * 131.7 + part * 17.3 + s * 7.31 + salt * 3.7) * 12.9898) * 43758.5453; return x - Math.floor(x); };

/**
 * Put one bar's notes on the context, the bar starting at `t`; or only those that start in steps [from, to) of it (the
 * live player goes a beat at a time, so no frame ever has a whole bar's notes to make). No two notes are played quite
 * alike: each lands a few milliseconds early or late and a little louder or softer, as hands do.
 */
export function scheduleBar(ac: BaseAudioContext, p: Playing, bar: number, t: number, from = 0, to = Infinity) {
  const { song } = p;
  const step = 60 / song.bpm / 4;
  const r = rng(bar * 7919 + 17);   // the same bar is the same notes however many times it is asked for
  song.parts.forEach((part, i) => {
    const io = p.parts[i]!;
    const drum = DRUMS.has(part.inst);
    for (const n of part.notes(bar, r)) {
      if (n.s < from || n.s >= to) continue;
      // swing: every second 16th comes late
      const late = song.swing && Math.round(n.s) % 2 === 1 ? song.swing * step : 0;
      const when = Math.max(0, t + n.s * step + late + (chance(bar, i, n.s, 1) - 0.5) * (drum ? 0.006 : 0.016));
      const v = (n.v ?? 1) * (1 + (chance(bar, i, n.s, 2) - 0.5) * (drum ? 0.12 : 0.18));
      const f = n.n ? hz(n.n + (song.transpose ?? 0)) : 0;
      const sec = n.d * step;
      // each note goes to the part's own gains: dry, its share of the reverb, its share of the echo
      const tap = ac.createGain(); tap.connect(io.dry); tap.connect(io.wet);
      if (part.echo) tap.connect(io.echo);
      const kept = KEPT[part.inst] === undefined ? undefined : SAMPLES.get(sampleKey(ac.sampleRate, part.inst, f, sec));
      if (kept) {
        const src = ac.createBufferSource(); src.buffer = kept;
        tap.gain.value = v; src.connect(tap); src.start(when);
        p.notes.push({ tap, until: when + kept.duration + 0.1 });
      } else {
        (INST[part.inst] as Inst)({ ac, t: when, out: tap, wet: io.wet }, f, sec, v);
        p.notes.push({ tap, until: when + sec + 3.4 });
      }
    }
  });
}

/** Take the notes that have finished out of the graph. Nothing else does: left in, they are worked through for ever. */
export function sweep(p: Playing, now: number) {
  if (!p.notes.length) return;
  const keep: Playing['notes'] = [];
  for (const n of p.notes) { if (n.until < now) { try { n.tap.disconnect(); } catch { /* gone already */ } } else keep.push(n); }
  p.notes = keep;
}
