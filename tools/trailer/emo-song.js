// The emo pack trailer's soundtrack: an emo-pop song on the film's own grid, made in the browser, nothing recorded.
// Served to compose.js by render.mjs as /emo-song.js; renderSong(T, t0, t1, { only }) returns film seconds [t0, t1) as
// stereo arrays.
//
// The grid is the pets' riff's: a beat is T.beat frames (21: 350 ms, 171.4 bpm), eighths 175 ms, four beats a bar, a
// chord a bar: E5 C5 G5 D5. Where the pets play on screen the rhythm guitars play exactly their strokes (RIFF), so the
// riff in the film is theirs.
//
// The sound, and why:
// - rhythm guitars: power chords of modelled strings (Karplus-Strong with a pick-position comb, strummed string by string),
//   the SUM of each chord through two stages of distortion, a mid scoop and a speaker cabinet (distorting the strings
//   apart is what makes a synth guitar sound fake); two takes of every part, panned hard left and right, each played a
//   little differently (timing, tuning, which string variant): the double-tracked wall of an emo record;
// - a lead guitar with a hook over the choruses, lightly driven, a dotted-eighth ping-pong delay and a plate;
// - a clean guitar (chorus and plate) with add9 and maj7 colours for the quiet parts;
// - a picked bass with a sine under it; a kit synthesized sample by sample (kick with a click and a pitch drop, snare
//   with body and wires, metallic hats and crash from detuned squares, toms), a short room and parallel compression;
// - booms, reverse cymbals and risers into the drops; the rain for the bedroom; a look-ahead limiter at the very end is
//   compose.js mixAll's.
// Levels are measured, not guessed: render.mjs song prints every stem's level in every section.

const SR = 48000;
const HZ = (m) => 440 * 2 ** ((m - 69) / 12);
const N = (nm) => { const m = /^([a-g])(#?)(-?\d)$/.exec(nm); return HZ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12); };

// ---------------------------------------------------------------- small DSP, in plain arrays

/** a seeded random source (every take of every part is the same each render) */
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** an RBJ biquad over an array, in place */
function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const w = 2 * Math.PI * f / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) { const v = x[i]; const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
/** a plucked string: Karplus-Strong tuned to a fraction of a sample, the pick's position as a comb on the excitation */
function string(f, secs, { bright = 0.6, mute = false, seed = 1, pick = 0.14, sustain = 1 } = {}) {
  const n = Math.floor(SR * secs), out = new Float32Array(n);
  const want = SR / f - 0.5, D = Math.floor(want), w = want - D, L = D + 1;
  const r = rng(seed + Math.round(f * 13));
  const exc = new Float32Array(L); let lp = 0;
  const a = 0.12 + 0.78 * bright;
  for (let i = 0; i < L; i += 1) { lp += ((r() * 2 - 1) - lp) * a; exc[i] = lp; }
  const k = Math.max(1, Math.round(pick * L));
  const line = new Float32Array(L);
  for (let i = 0; i < L; i += 1) line[i] = exc[i] - 0.92 * exc[(i - k + L) % L];
  // the loss per trip: open strings ring for seconds (a low string longer), a palm-muted one dies in a tenth of a second
  const loss = mute ? 0.93 : Math.min(0.99965, 0.9993 - 0.0000009 * f) ** (1 / sustain);
  const c0 = mute ? 0.32 : 0.5;
  let p = 0, prev = 0;
  for (let i = 0; i < n; i += 1) {
    const y = line[(p + 1) % L] * (1 - w) + line[p] * w;
    out[i] = y;
    line[p] = (c0 * y + (1 - c0) * prev) * loss; prev = y; p = (p + 1) % L;
  }
  const atk = Math.round(SR * (mute ? 0.0015 : 0.0025));
  for (let i = 0; i < atk && i < n; i += 1) out[i] *= i / atk;
  if (mute) biquad(out, 'lp', 1400, 0.6);
  let pk = 0; for (let i = 0; i < Math.min(n, SR * 0.1); i += 1) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < n; i += 1) out[i] /= pk;
  return out;
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---------------------------------------------------------------- the kit, sample by sample
function noiseArr(n, seed) { const r = rng(seed), x = new Float32Array(n); for (let i = 0; i < n; i += 1) x[i] = r() * 2 - 1; return x; }
const KIT = {
  kick(seed) {
    const n = Math.floor(SR * 0.62), x = new Float32Array(n); let ph = 0;
    const click = biquad(noiseArr(n, seed), 'hp', 2500, 0.7);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR, f = 47 + 125 * Math.exp(-t / 0.032) + 40 * Math.exp(-t / 0.006);
      ph += 2 * Math.PI * f / SR;
      const body = Math.sin(ph) * env(t, 0.0015, 0.22), beater = Math.sin(ph * 2.4) * env(t, 0.0005, 0.012) * 0.35;
      x[i] = Math.tanh(1.7 * (body + beater + click[i] * env(t, 0.0002, 0.0025) * 0.55)) / Math.tanh(1.7);
    }
    return x;
  },
  snare(seed) {
    const n = Math.floor(SR * 0.55), x = new Float32Array(n);
    const wires = biquad(biquad(noiseArr(n, seed), 'hp', 1700, 0.7), 'lp', 9500, 0.7);
    const crack = biquad(noiseArr(n, seed + 7), 'bp', 3800, 0.9);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / SR; p1 += 2 * Math.PI * (178 + 40 * Math.exp(-t / 0.012)) / SR; p2 += 2 * Math.PI * (329 + 30 * Math.exp(-t / 0.01)) / SR;
      const body = Math.sin(p1) * env(t, 0.001, 0.075) * 0.75 + Math.sin(p2) * env(t, 0.001, 0.05) * 0.4;
      x[i] = Math.tanh(1.5 * (body * 1.15 + wires[i] * env(t, 0.0015, 0.16) * 0.7 + crack[i] * env(t, 0.0005, 0.01) * 0.5)) / Math.tanh(1.5);
    }
    return x;
  },
  /** metal: six squares at inharmonic ratios (the 808's hat), high-passed */
  metal(n, base, seed) {
    const ratios = [1, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637], x = new Float32Array(n), r = rng(seed);
    const ph = ratios.map(() => r());
    for (let i = 0; i < n; i += 1) { let s = 0; for (let k = 0; k < 6; k += 1) { ph[k] += base * ratios[k] / SR; s += (ph[k] % 1) < 0.5 ? 1 : -1; } x[i] = s / 6; }
    return x;
  },
  hat(seed, open = false) {
    const n = Math.floor(SR * (open ? 0.5 : 0.09)), x = KIT.metal(n, 410, seed), nz = noiseArr(n, seed + 3);
    for (let i = 0; i < n; i += 1) x[i] = x[i] * 0.7 + nz[i] * 0.35;
    biquad(x, 'hp', 7200, 0.8); biquad(x, 'hp', 7200, 0.8); biquad(x, 'peak', 10500, 1.2, 4);
    for (let i = 0; i < n; i += 1) x[i] *= env(i / SR, 0.0004, open ? 0.24 : 0.028);
    return x;
  },
  crash(seed) {
    const n = Math.floor(SR * 2.8), x = KIT.metal(n, 520, seed), nz = noiseArr(n, seed + 11);
    for (let i = 0; i < n; i += 1) x[i] = x[i] * 0.45 + nz[i] * 0.7;
    biquad(x, 'hp', 3600, 0.7); biquad(x, 'lp', 13000, 0.6); biquad(x, 'peak', 6500, 0.8, 3);
    for (let i = 0; i < n; i += 1) { const t = i / SR; x[i] *= (t < 0.004 ? t / 0.004 : 1) * (0.65 * Math.exp(-t / 0.9) + 0.35 * Math.exp(-t / 0.12)); }
    return x;
  },
  tom(seed, f0) {
    const n = Math.floor(SR * 0.7), x = new Float32Array(n), nz = biquad(noiseArr(n, seed), 'lp', 3000); let ph = 0;
    for (let i = 0; i < n; i += 1) { const t = i / SR; ph += 2 * Math.PI * (f0 * (1 + 0.55 * Math.exp(-t / 0.03))) / SR; x[i] = Math.tanh(1.4 * (Math.sin(ph) * env(t, 0.001, 0.26) + nz[i] * env(t, 0.0005, 0.02) * 0.4)); }
    return x;
  },
  /** an impact: a sub falling away under a thump (a trailer's boom) */
  boom(seed) {
    const n = Math.floor(SR * 2.6), x = new Float32Array(n), nz = biquad(noiseArr(n, seed), 'lp', 900); let ph = 0;
    for (let i = 0; i < n; i += 1) { const t = i / SR; ph += 2 * Math.PI * (32 + 38 * Math.exp(-t / 0.35)) / SR; x[i] = Math.tanh(1.3 * (Math.sin(ph) * env(t, 0.004, 0.9) + nz[i] * env(t, 0.002, 0.08) * 0.6)); }
    return x;
  },
};

// ---------------------------------------------------------------- the song's notes
// power chords as a guitar plays them (root, fifth, octave)
const CHORDS = [['e2', 'b2', 'e3'], ['c3', 'g3', 'c4'], ['g2', 'd3', 'g3'], ['d3', 'a3', 'd4']].map((c) => c.map(N));
const ROOTS = ['e1', 'c2', 'g1', 'd2'].map(N);
// a bar of the riff, as the pets play it: [eighth, 'down' | 'up', palm-muted] (the director's STRUM_MUTE)
const RIFF = [[0, 'down', false], [2, 'down', true], [3, 'up', true], [5, 'up', false], [6, 'down', true], [7, 'up', false]];
// the verse: palm-muted eighths, the first of each half open
const CHUG = [0, 1, 2, 3, 4, 5, 6, 7].map((e) => [e, 'down', !(e === 0 || e === 4)]);
// the clean guitar's arpeggios, a bar a chord, with their colours (Em add9, Cmaj7, G6/9, Dsus2)
const TWINKLE = [
  ['e3', 'b3', 'f#4', 'g4', 'b4', 'g4', 'f#4', 'b3'],
  ['c3', 'g3', 'b3', 'e4', 'g4', 'e4', 'b3', 'g3'],
  ['g2', 'd3', 'a3', 'b3', 'd4', 'b3', 'a3', 'd3'],
  ['d3', 'a3', 'e4', 'f#4', 'a4', 'f#4', 'e4', 'a3'],
].map((b) => b.map(N));
// the hook: two phrases of four bars, a note an eighth ('.' rests, '-' holds)
const HOOK = [
  ['b4 . e5 . d5 b4 g4 .', 'e5 . e5 d5 c5 . b4 .', 'd5 . g5 . f#5 d5 b4 .', 'a4 . f#5 . e5 d5 a4 .'],
  ['b4 . e5 . g5 f#5 e5 .', 'e5 . g5 . f#5 e5 d5 .', 'd5 . b5 . a5 g5 d5 .', 'f#5 . a5 . g5 f#5 e5 -'],
];

// the twin guitar over the band's chorus (the third trailer): the hook's second phrase a diatonic third higher in E minor,
// the pop-punk two-guitar harmony (a note-for-note shadow, so it can never fight the hook's rhythm)
const THIRD = { e: 'g', 'f#': 'a', g: 'b', a: 'c', b: 'd', c: 'e', d: 'f#' };
const third = (nm) => { const m = /^([a-g]#?)(\d)$/.exec(nm); if (!m) return nm; const up = THIRD[m[1]]; const oct = Number(m[2]) + (['c', 'd'].includes(up) && !['c', 'd'].includes(m[1]) || (m[1] === 'b' && up === 'd') || (m[1] === 'a' && up === 'c') ? 1 : 0); return `${up}${oct}`; };

/** every note and hit of the song, in film seconds: [{ t, stem, ... }] */
function arrange(T) {
  const B = T.beat / 60, E = B / 2, BAR = 4 * B, ev = [];
  const at = (t, stem, o) => ev.push({ t, stem, ...o });
  const hit = (t, k, v = 1, o = {}) => at(t, 'drums', { k, v, ...o });
  const r = rng(77);
  const jit = (ms) => (r() * 2 - 1) * ms / 1000;
  const guitarBar = (t, chord, pattern, v = 1) => pattern.forEach(([e, dir, mute], j) => {
    const next = pattern[j + 1]?.[0] ?? 8;
    at(t + e * E, 'gtr', { chord, dir, mute, dur: (next - e) * E + 0.02, v: v * (mute ? 0.85 : 1) * (e === 0 ? 1.06 : 1) });
  });
  const bassBar = (t, chord, eighths = true, v = 1) => {
    for (let e = 0; e < 8; e += eighths ? 1 : 2) at(t + e * E, 'bass', { f: ROOTS[chord] * (eighths && e === 7 ? 2 : 1), dur: (eighths ? E : 2 * E) * 0.94, v: v * (e % 2 ? 0.86 : 1) });
  };
  const beat = (t, { crash = false, hats = 8, open = false, fill = false, soft = 1, kick = [0, 3, 4], last = false } = {}) => {
    if (crash) hit(t, 'crash', 0.9);
    for (const e of kick) if (!(fill && e >= 4)) hit(t + e * E + jit(2), 'kick', (e === 0 ? 1 : 0.88) * soft);
    for (const e of fill ? [2] : [2, 6]) hit(t + e * E + jit(2), 'snare', soft * (e === 6 ? 1 : 0.96));
    const step = 8 / hats;
    for (let h = 0; h < hats; h += 1) {
      const e = h * step;
      if ((fill && e >= 4) || (crash && h === 0)) continue;
      const off = e % 2 === 1;
      hit(t + e * E + jit(3), open && off ? 'hatO' : 'hatC', soft * (h % (hats / 4) === 0 ? 0.75 : 0.5) * (0.9 + r() * 0.2));
    }
    if (fill) {
      // the last two beats: sixteenths down the toms into a snare flam
      const toms = ['snare', 'snare', 'tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'tom3'];
      toms.forEach((k, i) => hit(t + 4 * E + i * E / 2, k, (0.6 + i * 0.05) * soft));
      if (last) hit(t + 7.5 * E, 'kick', 0.9 * soft);
    }
  };
  const lead = (t, bar, phrase, harm = false) => {
    const notes = HOOK[phrase][bar % 4].split(' ');
    notes.forEach((nm, e) => {
      if (nm === '.' || nm === '-') return;
      // a note lasts through its holds ('-'); one held to the bar's end rings on into the next
      let len = 1; while (notes[e + len] === '-') len += 1;
      const dur = len * E * 0.96 + (e + len >= 8 && notes[7] === '-' ? 0.5 : 0), v = e % 2 ? 0.88 : 1;
      at(t + e * E, 'lead', { f: N(nm), dur, v, harmed: harm });
      // (the harmony: the second guitar, panned the other way, a touch softer, a hair late)
      if (harm) at(t + e * E + 0.007, 'lead', { f: N(third(nm)), dur, v: v * 0.74, harm: true });
    });
  };
  const twinkle = (t, chord, v = 1) => TWINKLE[chord].forEach((f, e) => at(t + e * E + jit(4), 'clean', { f, dur: 2.2, v: v * (1 - e * 0.03) }));

  for (const s of T.song ?? []) {
    const t0 = s.at * B, bars = Math.round(s.beats / 4);
    const next = (T.song.find((k) => k.at === s.at + s.beats) ?? {}).kind;
    const k = s.kind;
    if (k === 'intro') {
      at(t0, 'fx', { fx: 'rain', dur: s.beats * B + 1.2, v: 1 });
      for (let b = 0; b < bars; b += 1) twinkle(t0 + b * BAR, b % 2 === 0 ? 0 : 1, 0.9);
      at(t0 + s.beats * B - 1.4, 'fx', { fx: 'swell', dur: 1.4, v: 0.7 });
    } else if (k === 'phase') {
      // a hit on each word, a beat apart; the last ("PHASE.") the biggest, left ringing; then a roll and a riser into the drop
      const nw = s.words ?? 4;
      for (let w = 0; w < nw; w += 1) {
        const t = t0 + w * B, big = w === nw - 1;
        hit(t, 'kick', 1); hit(t, 'snare', big ? 1 : 0.85);
        if (big) { hit(t, 'crash', 1); at(t, 'fx', { fx: 'boom', v: 0.9 }); }
        at(t, 'gtr', { chord: 0, dir: 'down', mute: !big, dur: big ? 2 * B : B * 0.45, v: big ? 1.1 : 0.9 });
        at(t, 'bass', { f: ROOTS[0], dur: big ? 2 * B : B * 0.45, v: 1 });
      }
      for (let i = 0; i < 8; i += 1) hit(t0 + 6 * B + i * E / 2, 'snare', 0.32 + i * 0.085);
      at(t0 + 5 * B, 'fx', { fx: 'riser', dur: 3 * B, v: 0.8 });
      at(t0 + 8 * B, 'fx', { fx: 'revcrash', v: 0.9 });
    } else if (k === 'drop' || k === 'drop2' || k === 'riff' || k === 'band') {
      const chorus = k === 'riff' || k === 'band';
      if (k === 'drop' || k === 'riff') at(t0, 'fx', { fx: 'boom', v: k === 'riff' ? 1 : 0.9 });
      for (let b = 0; b < bars; b += 1) {
        const t = t0 + b * BAR, last = b === bars - 1 && next !== k;
        beat(t, { crash: b === 0 || chorus || b % 2 === 0, hats: k === 'band' ? 16 : 8, open: chorus, fill: last && next !== 'band' && next !== 'riff' && next !== 'ring', kick: k === 'band' ? [0, 3, 4, 7] : [0, 3, 4] });
        guitarBar(t, b % 4, RIFF, 1);
        bassBar(t, b % 4, true, 1);
        if (k === 'drop') lead(t, b, 0);
        if (k === 'drop2') lead(t, b, 1);
        if (k === 'riff') lead(t, b, 0);
        if (k === 'band') lead(t, b + 2, 1);
      }
      if (next === 'pickup' || next === 'break') at(t0 + s.beats * B - 1.4, 'fx', { fx: 'down', dur: 1.4, v: 0.5 });
    } else if (k === 'verse' || k === 'verse2') {
      const soft = k === 'verse2' ? 0.72 : 0.85;
      for (let b = 0; b < bars; b += 1) {
        const t = t0 + b * BAR, last = b === bars - 1;
        beat(t, { crash: b === 0, hats: 8, soft, kick: [0, 4], fill: last && k === 'verse' });
        guitarBar(t, b % 4, CHUG, k === 'verse2' ? 0.62 : 0.72);
        bassBar(t, b % 4, true, 0.85);
        twinkle(t, b % 4, k === 'verse2' ? 1.05 : 0.95);
      }
      if (k === 'verse') at(t0 + s.beats * B - 2 * B, 'fx', { fx: 'riser', dur: 2 * B, v: 0.55 });
    } else if (k === 'break') {
      // the bedroom: the band drops out; rain, the clean guitar, a heartbeat on the kick
      at(t0, 'fx', { fx: 'rain', dur: s.beats * B + 0.6, v: 0.9 });
      for (let b = 0; b < bars; b += 1) { twinkle(t0 + b * BAR, b % 2 === 0 ? 0 : 1, 1); hit(t0 + b * BAR, 'kick', 0.3); hit(t0 + b * BAR + 2 * B, 'kick', 0.2); at(t0 + b * BAR, 'bass', { f: ROOTS[b % 2 === 0 ? 0 : 1], dur: BAR * 0.95, v: 0.6 }); }
    } else if (k === 'pickup') {
      // half time while the guitar falls and is picked up; a tom build and a riser into the chorus
      for (let b = 0; b < bars; b += 1) {
        const t = t0 + b * BAR;
        hit(t, 'kick', 0.95); hit(t + 2 * B, 'snare', 0.8);
        for (let h = 0; h < 8; h += 1) hit(t + h * E, 'hatC', 0.35);
        at(t, 'bass', { f: ROOTS[0], dur: BAR * 0.95, v: 0.8 });
        if (b === bars - 1) {
          for (let i = 0; i < 8; i += 1) hit(t + 2 * B + i * E / 2, ['tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'tom3', 'snare', 'snare'][i], 0.55 + i * 0.06);
          at(t, 'fx', { fx: 'riser', dur: BAR, v: 0.75 });
          at(t0 + s.beats * B, 'fx', { fx: 'revcrash', v: 0.9 });
        }
      }
    } else if (k === 'ring') {
      const t = t0 + (s.hit ?? 0) * B;
      hit(t, 'kick', 1); hit(t, 'crash', 1); at(t, 'fx', { fx: 'boom', v: 0.95 });
      at(t, 'gtr', { chord: 0, dir: 'down', mute: false, dur: 2.8, v: 1.1 });
      at(t, 'bass', { f: ROOTS[0], dur: 2.6, v: 1 });
      at(t, 'lead', { f: N('b4'), dur: 2.6, v: 0.8 }); at(t, 'lead', { f: N('e5'), dur: 2.6, v: 0.7 });
    } else if (k === 'xform') {
      // the transformation (the third trailer): the diary's clean guitar under the plain pet; then a piece of the look on
      // each of `pops` beats (a palm-muted E5, a kick and a snare, each a little harder, a riser over them); on `flip` the
      // room goes dark into the emo bedroom: a boom, the crash, the chord left ringing; then a heartbeat and a swell
      const pops = s.pops ?? [2, 3, 4, 5], flip = s.flip ?? 6;
      at(t0, 'fx', { fx: 'rain', dur: pops[0] * B + 0.5, v: 0.8 });
      twinkle(t0, 0, 0.8);
      pops.forEach((p, i) => {
        const t = t0 + p * B, v = 0.72 + i * 0.09;
        hit(t, 'kick', v); hit(t, 'snare', v * 0.92);
        at(t, 'gtr', { chord: 0, dir: 'down', mute: true, dur: B * 0.42, v: 0.8 + i * 0.07 });
        at(t, 'bass', { f: ROOTS[0], dur: B * 0.42, v: 0.8 });
        hit(t + E, 'hatC', 0.4);
      });
      at(t0 + pops[0] * B, 'fx', { fx: 'riser', dur: (flip - pops[0]) * B, v: 0.7 });
      const tf = t0 + flip * B;
      hit(tf, 'kick', 1); hit(tf, 'crash', 1); at(tf, 'fx', { fx: 'boom', v: 1 });
      at(tf, 'gtr', { chord: 0, dir: 'down', mute: false, dur: (s.beats - flip) * B - 0.1, v: 1.05 });
      at(tf, 'bass', { f: ROOTS[0], dur: (s.beats - flip) * B - 0.1, v: 0.95 });
      at(tf, 'lead', { f: N('e5'), dur: (s.beats - flip) * B * 0.8, v: 0.55 });
      for (let b = flip + 2; b < s.beats; b += 2) hit(t0 + b * B, 'kick', 0.42);
      at(t0 + s.beats * B - 1.6, 'fx', { fx: 'swell', dur: 1.6, v: 0.75 });
    } else if (k === 'slow') {
      // under slow motion: the last chord hit at normal speed (`hit`), left to ring; time stretches: no drums, a slow
      // heartbeat, the chord and a low E drone, a reverse cymbal into `release` (beats in), where the guitar flies: a whoosh
      const th = t0 + (s.hit ?? 0) * B, rel = t0 + (s.release ?? s.beats - 2) * B;
      hit(th, 'kick', 1); hit(th, 'crash', 1); at(th, 'fx', { fx: 'boom', v: 1 });
      at(th, 'gtr', { chord: 0, dir: 'down', mute: false, dur: s.beats * B - (s.hit ?? 0) * B, v: 1.1 });
      at(th, 'bass', { f: ROOTS[0], dur: s.beats * B - (s.hit ?? 0) * B, v: 0.95 });
      at(th, 'lead', { f: N('b4'), dur: 3.2, v: 0.6 }); at(th, 'lead', { f: N('e5'), dur: 3.6, v: 0.55 });
      for (let b = (s.hit ?? 0) + 3; b < s.beats - 1; b += 3) { hit(t0 + b * B, 'kick', 0.5); hit(t0 + b * B + 0.16, 'kick', 0.34); }
      at(rel, 'fx', { fx: 'revcrash', v: 1 });
      at(rel, 'fx', { fx: 'whoosh', dur: 1.5, v: 0.9 });   // (slowed three times: the flight off the top takes 1.5 s)
    } else if (k === 'build') {
      // a bar's fill into the band: the kick on one, then sixteenths from the snare down the toms, louder all the way, a riser
      hit(t0, 'kick', 1); hit(t0, 'crash', 0.8);
      at(t0, 'gtr', { chord: 3, dir: 'down', mute: false, dur: 2 * B - 0.05, v: 0.95 });
      at(t0, 'bass', { f: ROOTS[3], dur: 2 * B - 0.05, v: 0.9 });
      const roll = ['snare', 'snare', 'snare', 'snare', 'tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'tom3', 'snare', 'snare'];
      roll.forEach((x, i) => hit(t0 + B + i * E / 2, x, 0.5 + i * 0.045));
      for (let i = 0; i < 4; i += 1) at(t0 + 2 * B + i * E, 'gtr', { chord: 3, dir: 'down', mute: true, dur: E * 0.9, v: 0.78 + i * 0.05 });
      at(t0, 'fx', { fx: 'riser', dur: s.beats * B, v: 0.85 });
      at(t0 + s.beats * B, 'fx', { fx: 'revcrash', v: 1 });
    } else if (k === 'band3') {
      // the band's chorus (the third trailer's climax: all five in one room): the riff, sixteenth hats, the crash every
      // bar, the hook with its twin a third above
      at(t0, 'fx', { fx: 'boom', v: 1 });
      for (let b = 0; b < bars; b += 1) {
        const t = t0 + b * BAR;
        beat(t, { crash: true, hats: 16, open: true, kick: [0, 3, 4, 7] });
        guitarBar(t, b % 4, RIFF, 1.04);
        bassBar(t, b % 4, true, 1);
        lead(t, b, 1, true);
      }
    } else if (k === 'dirge') {
      // the death (the Emonadgotchi cut): a low hit on each of `words` words (the last with a boom), then the band gone:
      // a low drone, the clean guitar far off, a heartbeat slowing to nothing, a reverse cymbal into what follows
      const nw = s.words ?? 4, end = t0 + s.beats * B;
      for (let w = 0; w < nw; w += 1) {
        const t = t0 + w * B, last = w === nw - 1;
        hit(t, 'kick', 0.95); hit(t, 'tom3', last ? 0.9 : 0.65);
        at(t, 'bass', { f: ROOTS[0], dur: last ? 2 * B : B * 0.7, v: 0.9 });
        if (last) { at(t, 'fx', { fx: 'boom', v: 0.85 }); at(t, 'gtr', { chord: 0, dir: 'down', mute: false, dur: 3 * B, v: 0.85 }); }
      }
      const d0 = t0 + nw * B;
      at(d0, 'bass', { f: ROOTS[0], dur: end - d0 - 0.2, v: 0.55 });
      twinkle(d0 + B, 1, 0.6);
      for (const [b, v] of [[1, 0.6], [1.45, 0.42], [3.2, 0.5], [3.65, 0.34], [5.6, 0.38], [6.05, 0.24]]) if (d0 + b * B < end - B) hit(d0 + b * B, 'kick', v);
      at(end - 1.5 * B, 'fx', { fx: 'revcrash', v: 0.9 });
    } else if (k === 'revive') {
      // brought back: a boom, the crash and the chord on `hit` (beats in: where he comes back), the lead's E ringing,
      // a riser into what follows
      const t = t0 + (s.hit ?? 0) * B;
      hit(t, 'kick', 1); hit(t, 'crash', 1); at(t, 'fx', { fx: 'boom', v: 1 });
      at(t, 'gtr', { chord: 0, dir: 'down', mute: false, dur: s.beats * B - (s.hit ?? 0) * B - 0.1, v: 1.05 });
      at(t, 'bass', { f: ROOTS[0], dur: s.beats * B - (s.hit ?? 0) * B - 0.1, v: 0.95 });
      at(t, 'lead', { f: N('e5'), dur: 2.4, v: 0.7 }); at(t, 'lead', { f: N('b4'), dur: 2.2, v: 0.55 });
      for (let b = (s.hit ?? 0) + 2; b < s.beats - 2; b += 2) hit(t0 + b * B, 'kick', 0.5);
      const rs = Math.max(s.hit ?? 0, s.beats - 3);
      for (let i = 0; i < 8; i += 1) hit(t0 + (s.beats - 2) * B + i * E / 2, 'snare', 0.35 + i * 0.08);
      at(t0 + rs * B, 'fx', { fx: 'riser', dur: (s.beats - rs) * B, v: 0.8 });
      at(t0 + s.beats * B, 'fx', { fx: 'revcrash', v: 0.9 });
    } else if (k === 'outro') {
      hit(t0, 'kick', 1); hit(t0, 'crash', 1); at(t0, 'fx', { fx: 'boom', v: 1 });
      at(t0, 'gtr', { chord: 0, dir: 'down', mute: false, dur: 3.6, v: 1.1 });
      at(t0, 'bass', { f: ROOTS[0], dur: 3.2, v: 1 });
      at(t0, 'lead', { f: N('e5'), dur: 3.4, v: 0.8 });
      // the clean guitar again as the card stays, and the rain
      for (let b = 0; b < 2; b += 1) twinkle(t0 + 6 * B + b * BAR, b, 0.8 - b * 0.15);
      at(t0 + 2 * B, 'fx', { fx: 'rain', dur: s.beats * B - 2 * B + 1, v: 0.7 });
    }
  }
  return ev;
}

// ---------------------------------------------------------------- the studio: buses, amps, rooms
function curve(k, asym = 0) {
  const n = 4096, c = new Float32Array(n); let mx = 0;
  for (let i = 0; i < n; i += 1) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * (x + asym)) - Math.tanh(k * asym); mx = Math.max(mx, Math.abs(c[i])); }
  for (let i = 0; i < n; i += 1) c[i] /= mx;
  return c;
}
function eq(ac, type, f, q = 0.7, g = 0) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; }
function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].connect(nodes[i + 1]); return [nodes[0], nodes[nodes.length - 1]]; }
/** a stereo room: decaying noise, darker as it dies (seconds, how bright) */
function room(ac, secs, bright = 0.5, seed = 5) {
  const n = Math.floor(SR * secs), b = ac.createBuffer(2, n, SR);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = b.getChannelData(ch), r = rng(seed + ch * 31); let lp = 0;
    const pre = Math.floor(SR * 0.012);
    for (let i = 0; i < n; i += 1) { const t = i / n; lp += ((r() * 2 - 1) - lp) * (bright * (1 - t * 0.85) + 0.05); d[i] = i < pre ? 0 : lp * (1 - t) ** 2.2; }
  }
  const c = ac.createConvolver(); c.buffer = b; return c;
}
/** an amp: two stages of drive with a tone stack between, a mid scoop, a 4x12's top end */
function amp(ac, out, { drive = 6, drive2 = 4, scoop = -1, presence = -2 } = {}) {
  const pre = ac.createGain(); pre.gain.value = 0.7;
  const s1 = ac.createWaveShaper(); s1.curve = curve(drive, 0.08); s1.oversample = '4x';
  const s2 = ac.createWaveShaper(); s2.curve = curve(drive2, -0.04); s2.oversample = '4x';
  // (voiced by measurement: the first voicing put the sections' 1-4 kHz octaves 4-5 dB over a rock mix's and their
  // 125-500 Hz ones 4-5 dB under it: thin and harsh; so less push before the drive, body after it, a darker cabinet)
  const [inp] = chain(pre, eq(ac, 'highpass', 70, 0.7), eq(ac, 'peaking', 800, 0.7, 3), s1, eq(ac, 'peaking', 650, 0.8, -1.5), s2,
    eq(ac, 'highpass', 70, 0.7), eq(ac, 'peaking', 140, 0.8, 4.5), eq(ac, 'peaking', 260, 0.9, 3), eq(ac, 'peaking', 520, 1.1, scoop),
    eq(ac, 'peaking', 2400, 0.9, presence), eq(ac, 'lowpass', 4300, 0.7), eq(ac, 'lowpass', 6500, 0.5), out);
  return inp;
}

const CACHE = new Map();
const cached = (key, make) => { let v = CACHE.get(key); if (!v) { v = make(); CACHE.set(key, v); } return v; };
const toBuf = (ac, x) => { const b = ac.createBuffer(1, x.length, SR); b.copyToChannel(x, 0); return b; };

// the stems' levels (set by measurement: render.mjs song)
const LEVEL = { drums: 0.56, bass: 0.6, gtr: 0.44, lead: 0.48, clean: 0.66, fx: 0.38 };

/** film seconds [t0, t1) of the song: { L, R, made } (`only` a stem: that stem alone, through its own bus) */
export async function renderSong(T, t0, t1, { only = null } = {}) {
  const all = arrange(T).filter((e) => e.t >= t0 - 0.001 && e.t < t1 && (!only || e.stem === only));
  const total = Math.ceil((t1 - t0) * SR);
  const ac = new OfflineAudioContext(2, total + SR * 4, SR);
  const at = (t) => Math.max(0, t - t0 + 0.01);

  // the master: a gentle glue over everything
  const glue = ac.createDynamicsCompressor(); glue.threshold.value = -16; glue.ratio.value = 2; glue.knee.value = 8; glue.attack.value = 0.02; glue.release.value = 0.2;
  // a gentle tilt after it (the third trailer's mix measured its 4 kHz octave 3 dB under its loudest, a rock record's sits
  // 10 or more under): 2 dB off the top, 1 dB on the bottom
  { const hs = ac.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 5000; hs.gain.value = -2;
    const ls = ac.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 120; ls.gain.value = 1;
    // and the upper mids taken down: the loud stretches measured 2 kHz 4-5 dB over a rock record's balance (harsh)
    const mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1900; mid.Q.value = 0.75; mid.gain.value = -3;
    glue.connect(mid); mid.connect(hs); hs.connect(ls); ls.connect(ac.destination); }
  const plate = room(ac, 2.4, 0.55, 21), plateIn = ac.createGain(); plateIn.connect(plate); const plateOut = ac.createGain(); plateOut.gain.value = 0.9; plate.connect(plateOut); plateOut.connect(glue);
  const roomR = room(ac, 0.7, 0.7, 9), roomIn = ac.createGain(); roomIn.connect(roomR); const roomOut = ac.createGain(); roomOut.gain.value = 0.8; roomR.connect(roomOut); roomOut.connect(glue);
  const bus = (name, pan = 0) => { const g = ac.createGain(); g.gain.value = LEVEL[name]; const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(glue); return g; };

  // drums: dry, plus a squashed copy under it, plus the room (snare and toms most)
  const drums = bus('drums');
  const squash = ac.createDynamicsCompressor(); squash.threshold.value = -30; squash.ratio.value = 8; squash.attack.value = 0.003; squash.release.value = 0.12;
  const squashOut = ac.createGain(); squashOut.gain.value = 0.35; squash.connect(squashOut); squashOut.connect(drums);
  // bass: a little drive, the low end kept tidy
  const bass = bus('bass');
  const bassIn = ac.createGain();
  { const sh = ac.createWaveShaper(); sh.curve = curve(1.8); sh.oversample = '2x'; chain(bassIn, eq(ac, 'highpass', 32, 0.7), sh, eq(ac, 'lowpass', 2400, 0.7), eq(ac, 'peaking', 220, 0.9, 2.5), eq(ac, 'peaking', 800, 1, 1.5), bass); }
  // rhythm guitars: two takes, two amps, hard left and right
  const gtrL = bus('gtr', -0.82), gtrR = bus('gtr', 0.82);
  const ampL = amp(ac, gtrL), ampR = amp(ac, gtrR, { drive: 6.5, drive2: 3.6, presence: -1.2, scoop: -1.6 });
  // the lead: a light drive, a dotted-eighth ping-pong, the plate
  const lead = bus('lead');
  const leadIn = ac.createGain();
  { const sh = ac.createWaveShaper(); sh.curve = curve(2.6, 0.05); sh.oversample = '4x';
    chain(leadIn, eq(ac, 'highpass', 180), eq(ac, 'peaking', 1400, 0.8, 4), sh, eq(ac, 'lowpass', 4600, 0.7), eq(ac, 'peaking', 2400, 1, 2), lead);
    const B = T.beat / 60, dly = (B * 3) / 4;
    const dL = ac.createDelay(2), dR = ac.createDelay(2); dL.delayTime.value = dly; dR.delayTime.value = dly;
    const fb = ac.createGain(); fb.gain.value = 0.34; const tone = eq(ac, 'lowpass', 2800);
    const pL = ac.createStereoPanner(), pR = ac.createStereoPanner(); pL.pan.value = -0.7; pR.pan.value = 0.7;
    const send = ac.createGain(); send.gain.value = 0.28; lead.connect(send); send.connect(dL);
    dL.connect(pL); dL.connect(dR); dR.connect(pR); dR.connect(tone); tone.connect(fb); fb.connect(dL);
    const wet = ac.createGain(); wet.gain.value = 0.7; pL.connect(wet); pR.connect(wet); wet.connect(glue);
    const ps = ac.createGain(); ps.gain.value = 0.22; lead.connect(ps); ps.connect(plateIn); }
  // the clean guitar: chorus (two moving delays, left and right) and the plate
  const clean = bus('clean');
  const cleanIn = ac.createGain();
  { chain(cleanIn, eq(ac, 'highpass', 120), eq(ac, 'peaking', 3200, 1, 2.5), clean);
    for (const [base, rate, pan] of [[0.011, 0.7, -0.6], [0.017, 0.93, 0.6]]) {
      const d = ac.createDelay(0.05); d.delayTime.value = base;
      const lfo = ac.createOscillator(); lfo.frequency.value = rate; const depth = ac.createGain(); depth.gain.value = 0.0022; lfo.connect(depth); depth.connect(d.delayTime); lfo.start(0);
      const p = ac.createStereoPanner(); p.pan.value = pan; const g = ac.createGain(); g.gain.value = 0.55 * LEVEL.clean;
      cleanIn.connect(d); d.connect(p); p.connect(g); g.connect(glue);
    }
    const ps = ac.createGain(); ps.gain.value = 0.45; clean.connect(ps); ps.connect(plateIn); }
  const fx = bus('fx');

  const play = (buf, when, dest, v = 1, { stop = null, fade = 0.012, rate = 1, pan = 0 } = {}) => {
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = v;
    let tail = g;
    if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    s.connect(g); tail.connect(dest);
    s.start(when);
    if (stop !== null) { g.gain.setValueAtTime(v, Math.max(when, stop - fade)); g.gain.linearRampToValueAtTime(0, stop); s.stop(stop + 0.01); }
    return g;
  };
  const sends = (g, toRoom = 0, toPlate = 0) => { if (toRoom) { const x = ac.createGain(); x.gain.value = toRoom; g.connect(x); x.connect(roomIn); } if (toPlate) { const x = ac.createGain(); x.gain.value = toPlate; g.connect(x); x.connect(plateIn); } };

  // the kit's pieces, a few takes of each so no two hits are the same sample
  const kit = (k, seed) => cached(`${k}:${seed}`, () => toBuf(ac, k === 'kick' ? KIT.kick(seed) : k === 'snare' ? KIT.snare(seed) : k === 'hatC' ? KIT.hat(seed) : k === 'hatO' ? KIT.hat(seed, true)
    : k === 'crash' ? KIT.crash(seed) : k === 'tom1' ? KIT.tom(seed, 150) : k === 'tom2' ? KIT.tom(seed, 112) : k === 'tom3' ? KIT.tom(seed, 84) : KIT.boom(seed)));
  const rv = rng(3);
  let made = 0;
  for (const e of all) {
    const when = at(e.t);
    made += 1;
    if (e.stem === 'drums') {
      const take = Math.floor(rv() * 4) + 1;
      const pan = { hatC: 0.28, hatO: 0.28, crash: -0.35, tom1: -0.25, tom2: 0.05, tom3: 0.3 }[e.k] ?? 0;
      const lvl = { kick: 1, snare: 0.82, hatC: 0.3, hatO: 0.26, crash: 0.42, tom1: 0.7, tom2: 0.7, tom3: 0.75 }[e.k] ?? 1;
      const g = play(kit(e.k, take), when, drums, e.v * lvl, { pan });
      g.connect(squash);
      if (e.k === 'snare' || e.k.startsWith('tom')) sends(g, 0.5);
      if (e.k === 'crash') { const s2 = play(kit('crash', take + 10), when, drums, e.v * lvl * 0.8, { pan: 0.4 }); s2.connect(squash); }
    } else if (e.stem === 'bass') {
      const b = cached(`bass:${e.f.toFixed(2)}`, () => {
        const x = string(e.f, 1.6, { bright: 0.42, seed: 3, pick: 0.2, sustain: 1.3 });
        for (let i = 0; i < x.length; i += 1) x[i] = x[i] * 0.8 + Math.sin(2 * Math.PI * e.f * i / SR) * env(i / SR, 0.004, 0.6) * 0.36;
        return toBuf(ac, x);
      });
      play(b, when, bassIn, e.v * 0.9, { stop: when + e.dur, fade: 0.02 });
    } else if (e.stem === 'gtr') {
      // two takes, each strummed string by string, a little apart in time and tune
      const strings = CHORDS[e.chord];
      const use = e.dir === 'up' ? strings.slice(1).reverse() : e.mute ? strings.slice(0, 2) : strings;
      for (const [side, inp] of [[0, ampL], [1, ampR]]) {
        const lag = side ? 0.004 + rv() * 0.004 : rv() * 0.003;
        use.forEach((f, j) => {
          const variant = 1 + Math.floor(rv() * 3) + side * 3;
          const buf = cached(`gtr:${f.toFixed(2)}:${e.mute ? 'm' : 'o'}:${variant}`, () => toBuf(ac, string(f, e.mute ? 0.4 : 2.6, { bright: e.mute ? 0.4 : 0.72, mute: e.mute, seed: variant * 101, pick: 0.13 })));
          const t = when + lag + j * (e.dir === 'up' ? 0.005 : 0.008);
          play(buf, t, inp, e.v * (e.mute ? 0.9 : 0.62) * (e.dir === 'up' ? 0.8 : 1), { stop: when + e.dur, fade: 0.015, rate: 1 + (side ? 0.0016 : -0.0012) });
        });
      }
    } else if (e.stem === 'lead') {
      const buf = cached(`lead:${e.f.toFixed(2)}`, () => toBuf(ac, string(e.f, 2.2, { bright: 0.8, seed: 9, pick: 0.2, sustain: 2.2 })));
      if (e.harm) {
        // the twin: its own take of the string, through the same lead amp, panned right (the hook sits in the middle)
        const hb = cached(`harm:${e.f.toFixed(2)}`, () => toBuf(ac, string(e.f, 2.2, { bright: 0.76, seed: 29, pick: 0.17, sustain: 2.2 })));
        play(hb, when, leadIn, e.v * 0.8, { stop: when + e.dur, fade: 0.04, pan: 0.55 });
      } else {
        play(buf, when, leadIn, e.v * 0.8, { stop: when + e.dur, fade: 0.04, pan: e.harmed ? -0.35 : 0 });
        // an octave under it, quieter: the lead's double
        const lo = cached(`lead:${(e.f / 2).toFixed(2)}`, () => toBuf(ac, string(e.f / 2, 2.2, { bright: 0.7, seed: 19, pick: 0.2, sustain: 2.2 })));
        play(lo, when + 0.006, leadIn, e.v * 0.34, { stop: when + e.dur, fade: 0.04 });
      }
    } else if (e.stem === 'clean') {
      const buf = cached(`clean:${e.f.toFixed(2)}`, () => toBuf(ac, string(e.f, 2.6, { bright: 0.86, seed: 13, pick: 0.11, sustain: 2.4 })));
      play(buf, when, cleanIn, e.v * 0.5, { stop: when + e.dur, fade: 0.25 });
    } else if (e.stem === 'fx') {
      if (e.fx === 'boom') { const g = play(kit('boom', 1), when, fx, e.v * 1.1); sends(g, 0, 0.25); }
      else if (e.fx === 'revcrash') {
        const b = cached('revcrash', () => { const x = KIT.crash(5); const n = Math.floor(SR * 1.4); const y = new Float32Array(n); for (let i = 0; i < n; i += 1) y[i] = x[n - 1 - i] * (i / n) ** 1.5; return toBuf(ac, y); });
        const g = play(b, Math.max(0, when - 1.4), fx, e.v * 0.7, { pan: -0.2 }); sends(g, 0, 0.3);
      } else if (e.fx === 'rain') {
        const n = Math.floor(SR * e.dur), b = cached(`rain:${n}`, () => { const x = biquad(biquad(noiseArr(n, 4), 'lp', 3600), 'hp', 450); const r = rng(8);
          // (no drops: single-sample drops read as clicks, which the operator has heard and disliked in the music before;
          // the rain swells and eases instead, slowly and unevenly)
          let fl = 0.5; for (let i = 0; i < n; i += 1) { const t = i / SR; if (i % 512 === 0) fl += ((0.55 + r() * 0.45) - fl) * 0.08; x[i] *= Math.min(1, t / 0.8, (e.dur - t) / 0.9) * 0.6 * (0.7 + 0.5 * fl); } return toBuf(ac, x); });
        play(b, when, fx, e.v * 0.55);
      } else if (e.fx === 'whoosh') {
        // a thing flying past: noise through a band that sweeps up then away, swelling and gone
        const n = Math.floor(SR * e.dur), b = cached(`whoosh:${n}`, () => { const x = noiseArr(n, 12), y = new Float32Array(n); let lp = 0, bp = 0;
          for (let i = 0; i < n; i += 1) { const t = i / n, f = 300 + 3800 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 2; const a = Math.min(0.9, 2 * Math.PI * f / SR); lp += (x[i] - lp) * a; bp += (lp - bp) * a * 0.6; y[i] = (lp - bp) * Math.sin(Math.PI * t) ** 1.4 * 2.2; }
          return toBuf(ac, y); });
        const g = play(b, when, fx, e.v, { pan: 0.3 }); sends(g, 0, 0.3);
      } else if (e.fx === 'riser' || e.fx === 'swell' || e.fx === 'down') {
        const n = Math.floor(SR * e.dur), up = e.fx !== 'down';
        const b = cached(`${e.fx}:${n}`, () => { const x = noiseArr(n, 6); const y = new Float32Array(n);
          // a band sweeping up (or down), louder as it goes
          let lp = 0, bp = 0;
          for (let i = 0; i < n; i += 1) { const t = i / n, f = up ? 250 * (40 ** t) : 6000 * (0.05 ** t); const a = Math.min(0.9, 2 * Math.PI * f / SR); lp += (x[i] - lp) * a; bp += (lp - bp) * a * 0.5; y[i] = (lp - bp) * (up ? t ** 1.6 : (1 - t) ** 1.3) * 1.6; }
          return toBuf(ac, y); });
        const g = play(b, when, fx, e.v * (e.fx === 'swell' ? 0.6 : 0.8)); sends(g, 0, 0.35);
      }
    }
  }
  const buf = await ac.startRendering();
  const a = buf.getChannelData(0), b = buf.getChannelData(1);
  const L = new Float32Array(total), R = new Float32Array(total);
  L.set(a.subarray(0, total)); R.set(b.subarray(0, total));
  return { L, R, made };
}
export const STEMS = ['drums', 'bass', 'gtr', 'lead', 'clean', 'fx'];
