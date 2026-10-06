// The sound engine: one audio context, three volumes (music, effects, the interface), a reverb, and the player that
// keeps a tune going a beat ahead. It starts as soon as the browser lets it: at once where a press on the page before
// already counts (Chrome carries it from page to page), otherwise at the visitor's first press of anything. It goes
// quiet when the tab is hidden, picks itself up again when a phone has taken the sound away from it, and remembers its
// settings in this browser.

import type { CueOpts, MusicWish, Sink, Stop } from './cue';
import { impulse, type C } from './dsp';
import { barSeconds, holdTunes, prepare, prepared, scheduleBar, sendOf, songFor, start, sweep, warm, type Playing, type Song } from './music';
import { LEVEL } from './levels';
import { isUi, levelsOf, SFX } from './sfx';

export type Prefs = { on: boolean; music: number; sfx: number };
const KEY = 'emogotchi.sound';
const DEFAULTS: Prefs = { on: true, music: 0.6, sfx: 0.7 };

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    if (p && typeof p === 'object') return { on: p.on !== false, music: clamp(p.music ?? DEFAULTS.music), sfx: clamp(p.sfx ?? DEFAULTS.sfx) };
  } catch { /* no storage: the defaults */ }
  return { ...DEFAULTS };
}
const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5);

// how loud each bus is with its slider at the top: the music sits well under the effects, and the whole site well
// under whatever else the visitor is listening to
const TOP = { master: 0.9, music: 0.12, sfx: 0.8, ui: 0.42 };
// a slider's travel is heard evenly when the gain goes with its square
const curve = (x: number) => x * x;

/** The chain every sound goes through, live or offline: buses into a limiter. */
export function buildGraph(ac: BaseAudioContext, prefs: Prefs) {
  const master = ac.createGain();
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -9; limit.knee.value = 8; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.2;
  master.connect(limit); limit.connect(ac.destination);
  // `music` is where the tunes come in; `musicVol` is their volume, after the warmth (which must see them at full level)
  const music = ac.createGain(), musicVol = ac.createGain(), sfx = ac.createGain(), ui = ac.createGain();
  for (const b of [musicVol, sfx, ui]) b.connect(master);
  // the music goes through a little warmth on its way: its top shaved, its low middle lifted (what a phone's small
  // speaker gives back least), and its peaks rounded off the way tape does
  const warm = ac.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) { const x = (i / 512 - 1) * 1.6; curve[i] = Math.tanh(x) / 1.6 * 1.18; }
  warm.curve = curve;
  const low = ac.createBiquadFilter(); low.type = 'peaking'; low.frequency.value = 320; low.Q.value = 0.7; low.gain.value = 2.5;
  const top = ac.createBiquadFilter(); top.type = 'highshelf'; top.frequency.value = 6500; top.gain.value = -3;
  const pre = ac.createGain(), post = ac.createGain(); pre.gain.value = 0.25; post.gain.value = 4;
  // `duck` and `duckV`: the music (and its share of the room) stepping aside for a moment ('music.duck': a pet playing
  // the guitar, whose riff is the music while it lasts)
  const duck = ac.createGain(), duckV = ac.createGain();
  music.connect(pre); pre.connect(warm); warm.connect(post); post.connect(low); low.connect(top); top.connect(duck); duck.connect(musicVol);
  // one room for everything (a second reverb would be a second convolution on the audio thread for ever). What is sent
  // to it follows each volume (applyPrefs), so turning the music down takes its echo with it.
  const verb = ac.createConvolver(); verb.buffer = impulse(ac);
  const back = ac.createGain(); back.gain.value = 0.4; verb.connect(back); back.connect(master);
  const verbSfx = ac.createGain(), verbMusic = ac.createGain();
  verbSfx.connect(verb); verbMusic.connect(duckV); duckV.connect(verb);
  const g = { ac, master, music, musicVol, sfx, ui, verbSfx, verbMusic, duck, duckV };
  applyPrefs(g, prefs, 0);
  return g;
}
export type Graph = ReturnType<typeof buildGraph>;

export function applyPrefs(g: Graph, p: Prefs, ms = 120) {
  const t = g.ac.currentTime, tc = ms / 1000 / 3;
  const set = (n: GainNode, v: number) => { if (ms) n.gain.setTargetAtTime(v, t, tc); else n.gain.value = v; };
  set(g.master, p.on ? TOP.master : 0);
  set(g.musicVol, TOP.music * curve(p.music));
  set(g.sfx, TOP.sfx * curve(p.sfx));
  set(g.ui, TOP.ui * curve(p.sfx));
  set(g.verbSfx, TOP.sfx * curve(p.sfx));
  set(g.verbMusic, TOP.music * curve(p.music));
}

/** Measuring mode (tools/sound-levels.mjs): every sound as written, before LEVEL evens them out. */
let raw = false;
export const setRaw = (on: boolean) => { raw = on; };

/**
 * The music stepping aside: down to a sixth of itself over a third of a second, back up over most of a second at
 * `t + dur` (if `dur` is given; live, a held duck comes back when its Stop is called, cue below). Its level is fixed:
 * a cue's `v` (which a scene sets by where the pet stands) is not looked at.
 */
const DUCK_TO = 0.16;
function duckAt(g: Graph, down: boolean, t: number, v = DUCK_TO) {
  for (const n of [g.duck, g.duckV]) { n.gain.cancelScheduledValues(t); n.gain.setTargetAtTime(down ? v : 1, t, down ? 0.11 : 0.3); }
}
/** Make one sound on a graph at time `t`. Returns how long it lasts and its output (to stop it early). */
export function play(g: Graph, name: string, o: CueOpts, t: number) {
  if (name === 'music.duck') {
    // (offline: the sound lab, the trailer, the studio tool; a duck there lasts `dur`)
    duckAt(g, true, t); if (o.dur) duckAt(g, false, t + o.dur);
    const out = g.ac.createGain(), wet = g.ac.createGain();
    return { len: o.dur ?? 0, out, tail: out as AudioNode, wet };
  }
  const syn = SFX[name];
  if (!syn) return null;
  const { ac } = g;
  const out = ac.createGain(); out.gain.value = (o.v ?? 1) * (raw ? 1 : LEVEL[`${name}:${levelsOf(o.who)}`] ?? LEVEL[name] ?? 1);
  const bus = isUi(name) ? g.ui : g.sfx;
  let tail: AudioNode = out;
  if (o.pan && typeof ac.createStereoPanner === 'function') { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); tail = p; }
  tail.connect(bus);
  const wet = ac.createGain(); wet.gain.value = 1; wet.connect(g.verbSfx);
  // a touch of the room on everything that is in it (not on the interface's own sounds)
  if (bus === g.sfx) { const s = ac.createGain(); s.gain.value = 0.1; out.connect(s); s.connect(g.verbSfx); }
  const c: C = { ac, t, out, wet };
  const len = syn(c, o);
  return { len, out, tail, wet };
}

// ---------- live ----------

let prefs = load();
let graph: Graph | null = null;
let unlocked = false;
const subs = new Set<() => void>();
export const getPrefs = () => prefs;
export function subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not kept, still applied */ }
  if (graph) applyPrefs(graph, prefs);
  if (prefs.on) wake(); else if (graph && graph.ac.state === 'running') setTimeout(() => { if (!prefs.on && graph?.ac.state === 'running') void (graph.ac as AudioContext).suspend(); }, 250);
  for (const s of subs) s();
}
/** True once the browser lets us make sound (after the first press). */
export const isUnlocked = () => unlocked;
let startedAt = -1e9, pressedAt = -1e9;
/** True for a moment after a press has started the sound: that press is still being handled (the speaker's own). */
export const justStarted = () => performance.now() - startedAt < 800;

const mark = (name: string) => { try { performance.mark(`snd:${name}`); } catch { /* no marks */ } };
function setUnlocked(on: boolean) {
  if (on === unlocked) return;
  unlocked = on;
  if (on) { if (performance.now() - pressedAt < 1500) startedAt = performance.now(); mark('running'); tick(); }
  for (const s of subs) s();
}
function ensure(): Graph | null {
  if (graph) return graph;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    const ac = new AC({ latencyHint: 'interactive' });
    graph = buildGraph(ac, prefs);
    ac.addEventListener('statechange', () => { if (graph?.ac === ac) setUnlocked(ac.state === 'running'); });
    try { localStorage.setItem(RATE, String(ac.sampleRate)); } catch { /* not remembered */ }
    // (a context made where sound is already allowed is running from the start, and says nothing about it)
    setUnlocked(ac.state === 'running');
  } catch { graph = null; }
  return graph;
}
/** The rate this device's sound ran at last time (the notes kept for it can be brought in before any sound is allowed). */
const RATE = 'emogotchi.sound.rate';
const lastRate = () => { try { const r = Number(localStorage.getItem(RATE)); return r >= 8000 && r <= 192000 ? r : 0; } catch { return 0; } };

/** Start the context if it is not going (and the page is in front, unless a press says so: a press is proof of that). */
function wake(pressed = false) {
  if (!prefs.on || (document.hidden && !pressed)) return;
  const g = ensure(); if (!g) return;
  const ac = g.ac as AudioContext;
  if (ac.state === 'running') return;
  if (pressed) {
    // the oldest way to open a phone's sound, and still what some need: something played inside the press itself
    try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch { /* resume() is the other way */ }
  }
  void ac.resume().catch(() => {});
}

// A context can go dead under us, on phones above all: a call, another app's sound or the home-screen app going to the
// background leaves it "interrupted", or "running" with its clock standing still, and resume() then does nothing.
// So its clock is watched, and a press that finds it dead (or still not started a while after an earlier press asked)
// throws the context away and makes a new one.
let clockAt = -1, still = 0, stuck = false, askedAt = 0;
function health() {
  const g = graph; if (!g) return;
  setUnlocked(g.ac.state === 'running');
  if (g.ac.state === 'running' && !document.hidden) {
    // (counted in looks, not in time: a laptop that slept has let a long time go by between two looks)
    if (g.ac.currentTime !== clockAt) { clockAt = g.ac.currentTime; still = 0; stuck = false; }
    else if (++still >= 12) stuck = true;
    askedAt = 0;
  } else still = 0;
}
function rebuild() {
  const old = graph;
  graph = null; live = null; nowPlaying = null; voices = 0; ducks = 0; era++; last.clear(); stuck = false; askedAt = 0; clockAt = -1; still = 0; preparing = null; warming = null;
  setUnlocked(false);
  try { void (old?.ac as AudioContext | undefined)?.close().catch(() => {}); } catch { /* gone */ }
  mark('rebuilt');
}
/** Whether this event is a press the browser counts (a tap, a click, a key): a swipe's touches are not, and neither is
 *  the first half of a tap. Asked of the browser where it says; otherwise only a click or a key is trusted. */
function counts(e: Event) {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : e.type === 'click' || e.type === 'keydown';
}
function press(e: Event) {
  if (!prefs.on) return;
  // Only a real press can start sound, so only a real press is acted on: a swipe down the page before any tap used to
  // make a context that could not start, and every later swipe then took it for dead and built another.
  if (!counts(e)) return;
  const now = performance.now();
  pressedAt = now;
  if (graph && (stuck || (graph.ac.state !== 'running' && askedAt && now - askedAt > 1500))) rebuild();
  if (graph && graph.ac.state !== 'running' && !askedAt) askedAt = now;
  wake(true);
}

/** Start now if the browser allows it, and otherwise at the first press of anything. */
export function arm() {
  mark('boot');
  for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'touchend', 'click', 'keydown'] as const) window.addEventListener(ev, press, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!graph) return;
    const ac = graph.ac as AudioContext;
    if (document.hidden) { if (ac.state === 'running') void ac.suspend(); }
    else if (unlocked || ac.state !== 'running') wake();
  });
  // a page brought back whole (the back button's cache) comes back with its sound stopped
  window.addEventListener('pageshow', (e) => { if (e.persisted) wake(); });
  // A press on the page before this one already counts in Chrome (it carries from page to page), so there the sound
  // starts with the page. Where it does not count, making a context now would only earn a warning: wait for the press.
  // An installed app on Android is allowed sound from the start as well.
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean }; standalone?: boolean };
  const installed = (window.matchMedia?.('(display-mode: standalone)').matches ?? false) && nav.standalone === undefined && /Android/i.test(nav.userAgent);
  if (nav.userActivation?.hasBeenActive || installed) wake();
}

// ----- effects -----

const NOOP: Stop = () => {};
const BODY: Record<string, number> = { cat: 1, frog: 1.1, sahur: 0.7, thiccums: 0.78, seal: 0.78, r3tards: 1.3 };
const HEAVY = new Set(['step', 'hop', 'land', 'jump', 'thud']);
let voices = 0;
/** which context the voices are counted on (a new one starts the count again) */
let era = 0;
let firstCue = false;
const last = new Map<string, number>();
const MAX_VOICES = 28;

let ducks = 0;
const cue: Sink['cue'] = (name, o = {}) => {
  const g = graph;
  if (!g || !prefs.on || g.ac.state !== 'running' || (o.v !== undefined && o.v <= 0.001)) return NOOP;
  if (name === 'music.duck') {
    // held until its Stop (a room taken down calls it: director.destroy), and never longer than `dur` (default 30 s),
    // so the music cannot be left down; two at once (two pets playing in town) keep it down until both are done
    ducks++; duckAt(g, true, g.ac.currentTime);
    const mine = era; let done = false;
    const up = () => { if (done) return; done = true; clearTimeout(timer); if (mine !== era) return; ducks = Math.max(0, ducks - 1); if (!ducks) duckAt(g, false, g.ac.currentTime); };
    const timer = setTimeout(up, (o.dur ?? 30) * 1000);
    return () => up();
  }
  const now = g.ac.currentTime;
  // the same sound twice within a moment is one sound (two hearts bursts, a double tap), and a crowded moment drops
  // what is quiet rather than piling up
  const when = now + 0.005 + (o.delay ?? 0);
  const prev = last.get(name);
  if (prev !== undefined && Math.abs(when - prev) < 0.03) return NOOP;
  if (voices >= MAX_VOICES && (o.v ?? 1) < 0.8) return NOOP;
  last.set(name, when);
  // a heavy pet's steps and landings are lower, a light one's higher
  const body = BODY[o.who ?? ''];
  if (body && HEAVY.has(name)) o = { ...o, rate: (o.rate ?? 1) * body };
  const made = play(g, name, o, when);
  if (!made) { if (import.meta.env.DEV) console.warn(`[sound] no sound called "${name}"`); return NOOP; }
  voices++;
  const mine = era;
  let done = false;
  const end = () => { if (done) return; done = true; if (mine === era && voices > 0) voices--; try { made.tail.disconnect(); made.out.disconnect(); made.wet.disconnect(); } catch { /* already gone */ } };
  const timer = setTimeout(end, ((o.delay ?? 0) + made.len + 2.2) * 1000);
  if (!firstCue) { firstCue = true; mark('cue'); }
  return (fadeMs = 120) => {
    if (done) return;
    try {
      const t = g.ac.currentTime;
      made.out.gain.cancelScheduledValues(t); made.out.gain.setTargetAtTime(0, t, fadeMs / 1000 / 3);
      (made.wet as GainNode).gain.setTargetAtTime(0, t, fadeMs / 1000 / 3);
    } catch { /* its context was replaced */ }
    clearTimeout(timer); setTimeout(end, fadeMs + 80);
  };
};

// ----- music -----

/** A tune under way: which bar and beat comes next, and when. It is scheduled a beat (four steps) at a time. */
type Live = { p: Playing; bar: number; beat: number; next: number; beatLen: number; beats: number };
let pageWish: MusicWish | null = null, labWish: MusicWish | null = null;
let wish: MusicWish | null = null;
let live: Live | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const FADE = 1.6;
/** a page's first tune comes up quickly (there is nothing to cross over from) */
const FIRST = 0.5;
let nowPlaying: string | null = null;
export const playing = () => nowPlaying;

function fadeOut(l: Live, sec = FADE) {
  const g = graph!; const t = g.ac.currentTime;
  for (const n of [l.p.out, sendOf(l.p)]) { n.gain.cancelScheduledValues(t); n.gain.setValueAtTime(n.gain.value, t); n.gain.linearRampToValueAtTime(0, t + sec); }
  setTimeout(() => { try { l.p.out.disconnect(); sendOf(l.p).disconnect(); } catch { /* gone */ } }, (sec + barSeconds(l.p.song) + 3) * 1000);
}
let starts = 0;
/** How many times a tune has been begun on this page (the checks count them: a room swapped for its like must not add one). */
export const tuneStarts = () => starts;
function begin(song: Song) {
  starts++;
  const g = graph!; const t = g.ac.currentTime;
  const p = start(g.ac, song, g.music, g.verbMusic);
  for (const n of [p.out, sendOf(p)]) { n.gain.setValueAtTime(0, t); n.gain.linearRampToValueAtTime(1, t + (live ? FADE : FIRST)); }
  const beats = song.steps / 4;
  return { p, bar: 0, beat: 0, next: t + 0.06, beatLen: barSeconds(song) / beats, beats } satisfies Live;
}
let preparing: string | null = null, warming: string | null = null;
let wantedId: string | null = null, wantedAt = -1e9;
const SETTLE = 200;
const tried = new Map<string, { n: number; at: number }>();
let begun = false;
/**
 * Keep the tune a little ahead of the clock, and change tunes when the wish does. A tune begins at once: its struck
 * notes are played from recordings where those exist already (kept from an earlier page, or made a moment ago) and made
 * live until they do (music.ts prepare, which works on in the background).
 */
function tick() {
  const g = graph;
  const want = wish && prefs.on && prefs.music > 0.001 ? songFor(wish) : null;
  // when the wish last changed (noted whether or not sound is allowed yet: a first press, long after, starts at once)
  if ((want?.id ?? null) !== wantedId) { wantedId = want?.id ?? null; wantedAt = performance.now(); setTimeout(tick, SETTLE + 5); }
  if (!g || g.ac.state !== 'running') {
    // no sound allowed yet: have the tune's kept notes in memory for the moment it is
    const rate = g?.ac.sampleRate ?? lastRate();
    if (want && rate && warming !== want.id) { warming = want.id; void warm(rate, want).catch(() => {}); }
    return;
  }
  holdTunes(g.ac.sampleRate, [want, live?.p.song]);
  // A change of tune is acted on once the wish has held still for a moment: a room that has just opened says what it
  // is in two or three steps (the pet, then that it is asleep, then its room theme), and each step used to start a tune
  // that the next one faded out again. (A first press finds a wish that has long been still, and starts at once.)
  if ((want?.id ?? null) !== (live?.p.song.id ?? null) && performance.now() - wantedAt >= SETTLE) {
    if (live) fadeOut(live);
    live = want ? begin(want) : null;
    nowPlaying = want?.id ?? null;
    if (live && !begun) { begun = true; mark('music'); }
    for (const s of subs) s();
  }
  // the playing tune's notes are made behind it (and made again if they were ever let go); a tune whose notes will not
  // make is not asked for over and over
  const song = live?.p.song;
  if (song && !prepared(g.ac.sampleRate, song) && preparing !== song.id) {
    const tries = tried.get(song.id) ?? { n: 0, at: -1e9 };
    if (tries.n < 3 && performance.now() - tries.at > 10_000) {
      tried.set(song.id, { n: tries.n + 1, at: performance.now() });
      const id = song.id; preparing = id;
      void prepare(g.ac.sampleRate, song).catch(() => {}).then(() => { if (preparing === id) preparing = null; if (prepared(g.ac.sampleRate, song)) { tried.delete(id); mark('notes'); } });
    }
  }
  if (!live) return;
  const t = g.ac.currentTime;
  // a tab that slept (a laptop lid, a long pause) does not play the bars it missed
  if (live.next < t - 0.2) live.next = t + 0.1;
  while (live.next < t + 0.45) {
    scheduleBar(g.ac, live.p, live.bar, live.next - live.beat * live.beatLen, live.beat * 4, live.beat * 4 + 4);
    live.next += live.beatLen;
    if (++live.beat >= live.beats) { live.beat = 0; live.bar++; }
  }
  sweep(live.p, t);
}
const music: Sink['music'] = (w) => pageMusic(w);

export function sink(): Sink {
  if (!timer) timer = setInterval(() => { health(); tick(); }, 120);
  return { cue, music };
}

/** For the sound lab: play one sound now, whatever the throttles say. */
export function audition(name: string, o: CueOpts = {}) {
  wake();
  const g = graph; if (!g) return;
  play(g, name, o, g.ac.currentTime + 0.02);
}
/** For the sound lab: ask for a tune over whatever the page wants (null gives the page its wish back). */
export function auditionMusic(w: MusicWish | null) { labWish = w; wake(); wish = labWish ?? pageWish; tick(); }
let dropping: ReturnType<typeof setTimeout> | null = null;
function pageMusic(w: MusicWish | null) {
  if (dropping) { clearTimeout(dropping); dropping = null; }
  // a wish taken back is acted on a moment later: a page that swaps one room for another (two pets of a kind, a pack's
  // try-on) takes its wish back and makes the same one again, and the tune must not fade out and start over itself
  if (w === null && pageWish) { dropping = setTimeout(() => { dropping = null; pageWish = null; wish = labWish ?? pageWish; tick(); }, 700); return; }
  pageWish = w; wish = labWish ?? pageWish; tick();
}
