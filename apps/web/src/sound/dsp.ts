// The building blocks every sound and instrument is made of. Nothing here is a recording: each sound is a few
// oscillators and some filtered noise with an envelope, scheduled on a Web Audio context. They take any
// BaseAudioContext, so the same code plays live and renders offline (the sound lab's pictures, tools/sound-check.mjs).

/** Where one sound is being made: the context, the moment it starts, its output and the reverb's input. */
export type C = { ac: BaseAudioContext; t: number; out: AudioNode; wet: AudioNode };

/** A value, or [seconds from the start, value] points it moves through (the first at 0). */
export type F = number | readonly [readonly [number, number], ...(readonly [number, number])[]];

/**
 * A filter whose cutoff moves is worked out afresh for every sample unless told otherwise, and that is the dearest
 * thing a note can ask of the audio thread (measured: six such filters under the held strings were a third of the
 * whole tune's cost). Once every 128 samples (3 ms) is as smooth to the ear.
 */
export function coarse(p: AudioParam) { try { p.automationRate = 'k-rate'; } catch { /* an old browser: as it was */ } return p; }

const NOISE = new WeakMap<BaseAudioContext, AudioBuffer>();
/** Two seconds of white noise, made once per context. */
export function noiseOf(ac: BaseAudioContext) {
  let b = NOISE.get(ac);
  if (!b) {
    b = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate);
    const d = b.getChannelData(0);
    // a fixed sequence: an offline render of a sound is the same every time
    let s = 0x2f6e2b1;
    for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1; }
    NOISE.set(ac, b);
  }
  return b;
}

/** Move a parameter through `f` from time `t`. Frequencies ramp exponentially (how pitch is heard). */
export function ramp(p: AudioParam, f: F, t: number, exp = true) {
  if (typeof f === 'number') { p.setValueAtTime(f, t); return; }
  p.setValueAtTime(f[0][1], t + f[0][0]);
  for (const [at, v] of f.slice(1)) {
    if (exp) p.exponentialRampToValueAtTime(Math.max(v, 0.001), t + at);
    else p.linearRampToValueAtTime(v, t + at);
  }
}
/** `f` with every value multiplied (a pitch change). */
export const mul = (f: F, k: number): F => (typeof f === 'number' ? f * k : (f.map(([t, v]) => [t, v * k] as const) as unknown as F));

type Env = { at?: number; a?: number; hold?: number; d: number; v?: number; to?: AudioNode };
/** A gain that rises to `v` over `a`, stays for `hold`, and dies away over `d`. Returns it and when it is silent. */
export function env(c: C, o: Env) {
  const t = c.t + (o.at ?? 0), a = o.a ?? 0.004, v = o.v ?? 0.5;
  const g = c.ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + (o.hold ?? 0) + o.d);
  g.connect(o.to ?? c.out);
  return { g, t, end: t + a + (o.hold ?? 0) + o.d + 0.02 };
}

type Tone = Env & {
  f: F; type?: OscillatorType;
  /** vibrato: [times a second, how many Hz either way] */
  vib?: readonly [number, number];
  /** a low-pass over it: where it cuts */
  lp?: F;
  /** cents off pitch */
  det?: number;
};
/** One oscillator with an envelope. */
export function tone(c: C, o: Tone) {
  const e = env(c, o);
  const os = c.ac.createOscillator();
  os.type = o.type ?? 'sine';
  ramp(os.frequency, o.f, e.t);
  if (o.det) os.detune.value = o.det;
  if (o.vib) {
    const l = c.ac.createOscillator(), lg = c.ac.createGain();
    l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
    l.connect(lg); lg.connect(os.frequency); l.start(e.t); l.stop(e.end);
  }
  if (o.lp !== undefined) {
    const fl = c.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.7; ramp(coarse(fl.frequency), o.lp, e.t);
    os.connect(fl); fl.connect(e.g);
  } else os.connect(e.g);
  os.start(e.t); os.stop(e.end);
  return e.end - c.t;
}

type Hiss = Env & {
  f: F; q?: number; kind?: BiquadFilterType;
  /** tremble: [times a second, 0..1 how deep] (a purr, a flutter); the rate may move */
  am?: readonly [F, number];
};
/** Filtered noise with an envelope: every whoosh, splash, crunch and breath. */
export function hiss(c: C, o: Hiss) {
  const e = env(c, o);
  const src = c.ac.createBufferSource();
  src.buffer = noiseOf(c.ac); src.loop = true;
  const fl = c.ac.createBiquadFilter();
  fl.type = o.kind ?? 'bandpass'; fl.Q.value = o.q ?? 1;
  ramp(coarse(fl.frequency), o.f, e.t);
  src.connect(fl);
  if (o.am) {
    const m = c.ac.createGain(); m.gain.value = 1 - o.am[1] / 2;
    const l = c.ac.createOscillator(), lg = c.ac.createGain();
    ramp(l.frequency, o.am[0], e.t); lg.gain.value = o.am[1] / 2;
    l.connect(lg); lg.connect(m.gain); l.start(e.t); l.stop(e.end);
    fl.connect(m); m.connect(e.g);
  } else fl.connect(e.g);
  // start somewhere else in the noise each time, so two of the same sound never line up
  src.start(e.t, ((e.t * 7.31) % 1.7 + 1.7) % 1.7); src.stop(e.end);
  return e.end - c.t;
}

type Bell = Env & {
  f: number;
  /** the modulator's pitch as a multiple of the note's (whole numbers ring true, others clang) */
  ratio?: number;
  /** how hard it is struck: brighter */
  index?: number;
  /** how fast the brightness dies, as a share of `d` */
  bite?: number;
};
/** A struck bell or bar (two-operator FM): music boxes, chimes, coins, clanks, electric pianos. */
export function bell(c: C, o: Bell) {
  const e = env(c, o);
  const car = c.ac.createOscillator(), mod = c.ac.createOscillator(), mg = c.ac.createGain();
  car.frequency.setValueAtTime(o.f, e.t);
  mod.frequency.setValueAtTime(o.f * (o.ratio ?? 3.5), e.t);
  const depth = o.f * (o.index ?? 1.2);
  mg.gain.setValueAtTime(depth, e.t);
  mg.gain.exponentialRampToValueAtTime(Math.max(depth * 0.02, 0.01), e.t + (o.a ?? 0.004) + o.d * (o.bite ?? 0.35));
  mod.connect(mg); mg.connect(car.frequency); car.connect(e.g);
  car.start(e.t); mod.start(e.t); car.stop(e.end); mod.stop(e.end);
  return e.end - c.t;
}

type Coo = Env & {
  /** the pitch, as it moves */
  f: F;
  /** how bright: the low-pass sits at this many times the pitch (2 = round and soft, 4 = reedy) */
  bright?: number;
  /** the mouth opening and closing: a resonance that moves through these Hz (the "ew" in "mew", a "wah") */
  wah?: F;
  /** a flutter in the pitch: [times a second, Hz either way] (a trill, a wobble) */
  trill?: readonly [number, number];
  /** a soft pulsing of loudness: [times a second, 0..1 how deep]; a sine, so it rolls and never buzzes (a croak) */
  pulse?: readonly [number, number];
  /** breath mixed in, 0..1 */
  air?: number;
};
/**
 * A soft little voice: every pet's mews, croaks, barks and mumbles, and the birds. A saw rounded off by a low-pass that
 * follows the pitch (so no fizz on top, whatever the note), a sine under it for body, and a moving resonance for the
 * mouth. (The first voices were a raw saw through two sharp band-passes with a square tremble: the operator heard them
 * as "too robotic or buzzy".)
 */
export function coo(c: C, o: Coo) {
  const e = env(c, { ...o, a: o.a ?? 0.018 });
  const bright = o.bright ?? 2.6;
  const saw = c.ac.createOscillator(), body = c.ac.createOscillator();
  saw.type = 'sawtooth'; body.type = 'sine';
  ramp(saw.frequency, o.f, e.t); ramp(body.frequency, o.f, e.t);
  if (o.trill) {
    const l = c.ac.createOscillator(), lg = c.ac.createGain();
    l.frequency.value = o.trill[0]; lg.gain.value = o.trill[1];
    l.connect(lg); lg.connect(saw.frequency); lg.connect(body.frequency); l.start(e.t); l.stop(e.end);
  }
  const lp = c.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
  ramp(coarse(lp.frequency), mul(o.f, bright), e.t);
  const sg = c.ac.createGain(); sg.gain.value = 0.55; saw.connect(lp); lp.connect(sg);
  const bg = c.ac.createGain(); bg.gain.value = 0.6; body.connect(bg);
  let node: AudioNode = c.ac.createGain();
  sg.connect(node); bg.connect(node);
  if (o.air) {
    const air = c.ac.createBufferSource(); air.buffer = noiseOf(c.ac); air.loop = true;
    const af = c.ac.createBiquadFilter(); af.type = 'bandpass'; af.Q.value = 1.2; ramp(coarse(af.frequency), mul(o.f, 2.5), e.t);
    const ag = c.ac.createGain(); ag.gain.value = o.air;
    air.connect(af); af.connect(ag); ag.connect(node); air.start(e.t, 0.3); air.stop(e.end);
  }
  if (o.wah !== undefined) {
    const w = c.ac.createBiquadFilter(); w.type = 'peaking'; w.Q.value = 2; w.gain.value = 11;
    ramp(coarse(w.frequency), o.wah, e.t);
    node.connect(w); node = w;
  }
  if (o.pulse) {
    const m = c.ac.createGain(); m.gain.value = 1 - o.pulse[1] / 2;
    const l = c.ac.createOscillator(), lg = c.ac.createGain();
    l.frequency.value = o.pulse[0]; lg.gain.value = o.pulse[1] / 2;
    l.connect(lg); lg.connect(m.gain); l.start(e.t); l.stop(e.end);
    node.connect(m); node = m;
  }
  node.connect(e.g);
  saw.start(e.t); body.start(e.t); saw.stop(e.end); body.stop(e.end);
  return e.end - c.t;
}

/** The same context, placed left (-1) or right (1) of the listener. */
export function panned(c: C, p: number): C {
  if (!p || typeof c.ac.createStereoPanner !== 'function') return c;
  const n = c.ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); n.connect(c.out);
  return { ...c, out: n };
}

/** The same context a little later: `later(c, 0.1)` is where to make what comes a tenth of a second on. */
export const later = (c: C, s: number): C => ({ ...c, t: c.t + s });
/** The same context, quieter or louder, through one more gain. */
export function scaled(c: C, v: number): C {
  if (v === 1) return c;
  const g = c.ac.createGain(); g.gain.value = v; g.connect(c.out);
  return { ...c, out: g };
}
/** A share of what follows also goes to the reverb (a ring in the room: chimes, cries, far things). */
export function echoing(c: C, share: number): C {
  const g = c.ac.createGain(); g.gain.value = 1; g.connect(c.out);
  const s = c.ac.createGain(); s.gain.value = share; g.connect(s); s.connect(c.wet);
  return { ...c, out: g };
}

/** A note's pitch in Hz from its MIDI number (69 = the A above middle C). */
export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'a4' -> 69, 'c#5' -> 73, 'bb3' -> 58. */
export function midi(name: string) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return SEMI[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

/** A small repeatable random source (the music uses one, so a loop's variations can be replayed). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
}

/** A reverb's impulse: noise dying away, darker as it goes. */
export function impulse(ac: BaseAudioContext, seconds = 1.9) {
  const n = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, n, ac.sampleRate);
  const r = rng(0x51f0a7);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const w = r() * 2 - 1;
      lp += (w - lp) * (0.6 - 0.45 * k);   // the tail loses its top
      d[i] = lp * Math.pow(1 - k, 2.6);
    }
  }
  return b;
}

const PLUCK = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** A plucked string (Karplus-Strong), worked out once per pitch and kept: an oud, a lute. */
export function pluckOf(ac: BaseAudioContext, f: number, bright = 0.5, seconds = 1.6) {
  let m = PLUCK.get(ac);
  if (!m) { m = new Map(); PLUCK.set(ac, m); }
  const key = `${Math.round(f * 10)}:${bright}:${seconds}`;
  let b = m.get(key);
  if (!b) {
    const sr = ac.sampleRate, n = Math.floor(sr * seconds);
    b = ac.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    // the loop is a delay line and a two-sample average (half a sample more): together one period, to a fraction of a
    // sample, or the string is out of tune with everything else
    const want = sr / f - 0.5, D = Math.floor(want), w = want - D, L = D + 1;
    const line = new Float32Array(L);
    const r = rng(Math.round(f * 97) + 11);
    // the pluck: noise, smoothed more for a duller string
    let lp = 0;
    for (let i = 0; i < L; i++) { const x = r() * 2 - 1; lp += (x - lp) * (0.25 + 0.7 * bright); line[i] = lp; }
    const loss = 0.996 - 0.0000022 * f;   // high strings die sooner
    let p = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const y = line[(p + 1) % L]! * (1 - w) + line[p]! * w;
      d[i] = y;
      line[p] = (y + prev) * 0.5 * loss; prev = y;
      p = (p + 1) % L;
    }
    // no click at either end
    for (let i = 0; i < 64 && i < n; i++) d[i] = d[i]! * (i / 64);
    const tail = Math.min(n, Math.floor(sr * 0.08));
    for (let i = 0; i < tail; i++) d[n - 1 - i] = d[n - 1 - i]! * (i / tail);
    m.set(key, b);
  }
  return b;
}
/** Play a plucked string. */
export function pluck(c: C, o: { f: number; at?: number; v?: number; bright?: number; d?: number; to?: AudioNode }) {
  const t = c.t + (o.at ?? 0), d = o.d ?? 1.4;
  const src = c.ac.createBufferSource();
  src.buffer = pluckOf(c.ac, o.f, o.bright ?? 0.5);
  const g = c.ac.createGain();
  g.gain.setValueAtTime(o.v ?? 0.5, t);
  g.gain.setValueAtTime(o.v ?? 0.5, t + d * 0.6);
  g.gain.linearRampToValueAtTime(0, t + d);
  src.connect(g); g.connect(o.to ?? c.out);
  src.start(t); src.stop(t + d + 0.02);
  return (o.at ?? 0) + d;
}
