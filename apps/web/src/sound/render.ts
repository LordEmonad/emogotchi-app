// Offline renders of the sounds and the tunes, for the sound lab's pictures and tools/sound-check.mjs: the same code
// that plays live, run on an OfflineAudioContext through the same buses at the default volumes, so the numbers are
// what a visitor's speakers get.

import type { CueOpts, MusicWish } from './cue';
import { buildGraph, play, type Prefs } from './engine';
import { barSeconds, prepare, scheduleBar, songFor, start } from './music';

export type Rendered = { data: Float32Array; sr: number; peak: number; loud: number; len: number; centroid: number };
const SR = 44100;
const AT_DEFAULTS: Prefs = { on: true, music: 0.6, sfx: 0.7 };
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);

function measure(buf: AudioBuffer): Rendered {
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const data = new Float32Array(a.length);
  let peak = 0, end = 0;
  for (let i = 0; i < a.length; i++) {
    const l = a[i]!, r = b[i]!;
    const p = Math.max(Math.abs(l), Math.abs(r));
    if (p > peak) peak = p;
    data[i] = (l + r) / 2;
    if (p > 0.001) end = i;
  }
  // loudness: the loudest 300 ms, as RMS
  const win = Math.floor(SR * 0.3);
  let sum = 0, best = 0;
  for (let i = 0; i < data.length; i++) { sum += data[i]! * data[i]!; if (i >= win) sum -= data[i - win]! * data[i - win]!; if (sum > best) best = sum; }
  // where its energy sits (a rough brightness), from zero crossings of the loud part
  let cross = 0, n = 0;
  for (let i = 1; i <= end; i++) { if (Math.abs(data[i]!) > peak * 0.05) { n++; if ((data[i]! >= 0) !== (data[i - 1]! >= 0)) cross++; } }
  return { data: data.subarray(0, Math.min(data.length, end + Math.floor(SR * 0.05))), sr: SR, peak: db(peak), loud: db(Math.sqrt(best / win)), len: end / SR, centroid: n ? (cross / n) * SR / 2 : 0 };
}

export async function renderSfx(name: string, o: CueOpts = {}, seconds = 4): Promise<Rendered | null> {
  const ac = new OfflineAudioContext(2, SR * seconds, SR);
  const g = buildGraph(ac, AT_DEFAULTS);
  if (!play(g, name, o, 0.02)) return null;
  return measure(await ac.startRendering());
}

export async function renderSong(wish: MusicWish, bars = 8, fromBar = 0, solo?: number): Promise<Rendered> {
  const whole = songFor(wish);
  // one part by itself (how loud each is in the mix), or the whole tune
  const song = solo === undefined ? whole : { ...whole, parts: whole.parts.filter((_p, i) => i === solo) };
  const len = barSeconds(song);
  await prepare(SR, whole);   // the kept notes, as the live player has them
  const ac = new OfflineAudioContext(2, Math.ceil(SR * (len * bars + 2.5)), SR);
  const g = buildGraph(ac, AT_DEFAULTS);
  const p = start(ac, song, g.music, g.verbMusic);
  for (let i = 0; i < bars; i++) scheduleBar(ac, p, fromBar + i, 0.05 + i * len);
  return measure(await ac.startRendering());
}

// ---------- pictures ----------

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]!; re[i] = re[j]!; re[j] = tr; const ti = im[i]!; im[i] = im[j]!; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const h = i + k + len / 2;
        const ur = re[i + k]!, ui = im[i + k]!, xr = re[h]!, xi = im[h]!;
        const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[h] = ur - vr; im[h] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Draw a sound: its spectrogram (low notes at the bottom, 60 Hz to 16 kHz, brighter = louder) with the waveform over the top strip. */
export function draw(canvas: HTMLCanvasElement, r: Rendered, w = 320, h = 120, seconds?: number) {
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0d0716'; g.fillRect(0, 0, w, h);
  const N = 2048, total = Math.max(r.data.length, seconds ? Math.floor(seconds * r.sr) : 0, N);
  const img = g.createImageData(w, h);
  const re = new Float32Array(N), im = new Float32Array(N);
  const lo = Math.log(60), hi = Math.log(16000);
  for (let x = 0; x < w; x++) {
    const mid = Math.floor((x / w) * total);
    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) { const s = mid - N / 2 + i; re[i] = (s >= 0 && s < r.data.length ? r.data[s]! : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)); }
    fft(re, im);
    for (let y = 0; y < h; y++) {
      const f = Math.exp(lo + (1 - y / h) * (hi - lo));
      const bin = Math.min(N / 2 - 1, Math.round((f / r.sr) * N));
      const mag = Math.hypot(re[bin]!, im[bin]!) / (N / 4);
      const v = Math.max(0, Math.min(1, (db(mag) + 85) / 70));
      const o = (y * w + x) * 4;
      img.data[o] = 30 + 225 * Math.pow(v, 0.8); img.data[o + 1] = 12 + 190 * Math.pow(v, 2.2); img.data[o + 2] = 40 + 120 * Math.sqrt(v); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // the waveform, along the top
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1; g.beginPath();
  const strip = 22;
  for (let x = 0; x < w; x++) {
    const a = Math.floor((x / w) * total), b = Math.floor(((x + 1) / w) * total);
    let mx = 0;
    for (let i = a; i < b && i < r.data.length; i++) mx = Math.max(mx, Math.abs(r.data[i]!));
    g.moveTo(x + 0.5, strip / 2 - mx * strip / 2); g.lineTo(x + 0.5, strip / 2 + mx * strip / 2 + 0.5);
  }
  g.stroke();
}

/** A WAV file of a render (16-bit mono), to listen to or keep. */
export function wav(r: Rendered) {
  const n = r.data.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, r.sr, true); v.setUint32(28, r.sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, r.data[i]!)) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}
