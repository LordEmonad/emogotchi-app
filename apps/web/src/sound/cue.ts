// Sound cues. The rest of the site only ever says what happened ("the bowl landed", "a transaction went through",
// "this page is a pet's room at night"); the sound engine decides what that sounds like. The engine is a chunk of its
// own (sound/boot.ts) that only a build with sound switched on (`__SOUND__`) ever loads: with no engine every call here
// does nothing, and this file is all of sound that such a build carries.

/** How one cue is played. Everything is optional. */
export type CueOpts = {
  /** loudness, 1 = as written */
  v?: number;
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** pitch, 1 = as written */
  rate?: number;
  /** whose voice or body: 'cat' | 'frog' | 'sahur' | 'thiccums' | 'r3tards' | 'seal' */
  who?: string;
  /** seconds, for sounds that last as long as what they go with (a spin, a slide) */
  dur?: number;
  /** how many (coins, flaps, sparkles) */
  n?: number;
  /** seconds between repeats, with `n` */
  gap?: number;
  /** seconds from now */
  delay?: number;
};

/** Stops a sound that is still going (a loop, a long tail). Safe to call at any time, more than once. */
export type Stop = (fadeMs?: number) => void;
const NOOP: Stop = () => {};

/** What music a page wants. The page on top (the last to ask) is heard. */
export type MusicWish =
  | { place: 'room'; who: string; scene: string | null; asleep: boolean; dead: boolean }
  | { place: 'town'; phase: 'dawn' | 'day' | 'dusk' | 'night'; season: string }
  | { place: 'tavern'; fight: boolean };

export type Sink = {
  cue: (name: string, o?: CueOpts) => Stop;
  music: (wish: MusicWish | null) => void;
};

/** False under a test driver: the headless tools film and screenshot the site, and neither a speaker in the corner of
 *  every room nor an audio engine belongs in their pictures. `?sound=1` switches it on there too (the sound checks). */
export const audible = () => !(navigator.webdriver && !/[?&]sound=1\b/.test(location.search));

let sink: Sink | null = null;
const wishes: { id: number; wish: MusicWish }[] = [];
let ids = 0;

/** Play a sound by name. Returns a stop for the ones that go on. */
export function cue(name: string, o?: CueOpts): Stop {
  // (never throws: a sound is asked for in the middle of transactions and animations, and none of them may fail for it)
  try { return sink ? sink.cue(name, o) : NOOP; } catch { return NOOP; }
}

/** The engine, once it has loaded, takes the cues from here on and hears what music is wanted now. */
export function setSink(s: Sink | null) { sink = s; try { s?.music(wishes[wishes.length - 1]?.wish ?? null); } catch { /* no music, then */ } }

/** Ask for music; returns how to change the wish and how to take it back. `under`: beneath every other wish, heard
 *  only while nothing else asks (the early wish made from the page's address, before the page itself is there). */
export function wishMusic(wish: MusicWish, under = false) {
  const mine = { id: ++ids, wish };
  if (under) wishes.unshift(mine); else wishes.push(mine);
  const tell = () => { try { sink?.music(wishes[wishes.length - 1]?.wish ?? null); } catch { /* no music, then */ } };
  tell();
  return {
    set(next: MusicWish) { mine.wish = next; tell(); },
    drop() { const i = wishes.indexOf(mine); if (i >= 0) wishes.splice(i, 1); tell(); },
  };
}
