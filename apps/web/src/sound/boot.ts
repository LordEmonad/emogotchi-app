// Switches sound on for the page: the engine takes the cues (sound/cue.ts), waits for the first press, and gives
// every button on the site its small tap. Loaded by main.tsx, only in a build with sound (`__SOUND__`).

import { cue, setSink, wishMusic, type MusicWish } from './cue';
import { season, timeOfDay } from '../emotown/time';
import { arm, getPrefs, isUnlocked, playing, sink, tuneStarts } from './engine';

// what counts as a button for the tap sound; anything inside `[data-quiet]` keeps silent (and so does a pet's room:
// what is pressed in there makes its own sound)
const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], [role="switch"], summary, select, input[type="checkbox"], input[type="radio"], label.chip, .chip';
const SILENT = '[data-quiet], .stage, .town-scroll, .pocket-room';

let booted = false;
export function boot() {
  if (booted) return; booted = true;
  const live = sink();
  // dev builds keep a list of what was asked for and when (tools/sound-cues.mjs reads it: which sounds an action makes)
  const heard: { name: string; t: number; delay: number; v: number }[] = [];
  if (import.meta.env.DEV) Object.assign(window, { __cues: heard, __soundState: () => ({ running: isUnlocked(), playing: playing(), prefs: getPrefs(), starts: tuneStarts() }) });
  setSink(import.meta.env.DEV ? { music: live.music, cue: (name, o) => { heard.push({ name, t: Math.round(performance.now()), delay: o?.delay ?? 0, v: o?.v ?? 1 }); if (heard.length > 4000) heard.splice(0, 1000); return live.cue(name, o); } } : live);
  arm();
  // The town's and the tavern's music is known from the address alone, so it is asked for now and not when the page's
  // own (large) code has arrived; the page then asks for the same tune and nothing changes. The early wish is taken
  // back after a while either way.
  const at = location.pathname.replace(/\/+$/, '');
  const early: MusicWish | null = at === '/emotown' || at === '/town' ? { place: 'town', phase: timeOfDay(), season: season() } : at === '/fightclub' ? { place: 'tavern', fight: false } : null;
  if (early) { const held = wishMusic(early, true); setTimeout(() => held.drop(), 20000); }
  // a sheet, a dialog or a menu coming up or going away says so (whichever page made it: they are found as they are
  // added to the page and taken off it)
  const SHEET = '.modal-back, [role="dialog"], [role="menu"]';
  const sheet = (n: Node) => n instanceof Element && (n.matches(SHEET) || !!n.firstElementChild?.matches(SHEET));
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.target instanceof Element && m.target.closest('[data-quiet]')) continue;   // (the sound control's own mixer)
      for (const n of m.addedNodes) if (sheet(n)) { cue('ui.open'); return; }
      for (const n of m.removedNodes) if (sheet(n)) { cue('ui.close'); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pointerdown', (e) => {
    const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (!el || el.closest(SILENT)) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    cue('ui.tap');
  }, { capture: true, passive: true });
}
