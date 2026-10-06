// The sound control: a speaker that switches all sound on and off, and beside it the mixer (music and effects, each
// with its own level). It sits in the corner of a pet's room, in Emotown's row of buttons and on Fight Club's page; the
// header's menus carry the on/off switch for every other page.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cue } from './cue';
import { getPrefs, isUnlocked, justStarted, setPrefs, subscribe } from './engine';
import './sound.css';

const Speaker = ({ on }: { on: boolean }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none" />
    {on ? <><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /><path d="M18.3 6.4a8 8 0 0 1 0 11.2" /></> : <><path d="M16 9.5l5 5" /><path d="M21 9.5l-5 5" /></>}
  </svg>
);
const Sliders = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 4v6M5 14v6M12 4v2M12 10v10M19 4v9M19 17v3" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="8" r="2" /><circle cx="19" cy="15" r="2" />
  </svg>
);

/** `side`: which way the mixer opens from the pill; `drop`: below it or above. */
export function SoundPill({ side = 'left', drop = 'down', className = '' }: { side?: 'left' | 'right'; drop?: 'down' | 'up'; className?: string }) {
  const prefs = useSyncExternalStore(subscribe, getPrefs);
  // sound that is switched on but has not been allowed to start yet (no press on this page so far) is shown as it is:
  // not sounding. The first press of anything starts it, this button included.
  const going = useSyncExternalStore(subscribe, isUnlocked);
  const on = prefs.on && going;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // the mixer stays on the screen wherever the pill is: slid sideways by however far it would have run off an edge
  useLayoutEffect(() => {
    const el = pop.current; if (!open || !el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect(); const w = document.documentElement.clientWidth;
    const dx = r.right > w - 8 ? w - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
    if (dx) el.style.transform = `translateX(${Math.round(dx)}px)`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => {
    // a press on the speaker while sound was still waiting for its first press is that press: it starts the sound
    // (the engine has, a moment ago, on this same press), it does not switch it off
    const start = prefs.on && (!isUnlocked() || justStarted());
    const next = start ? true : !prefs.on;
    setPrefs({ on: next });
    if (next) setTimeout(() => cue('ui.on'), start ? 220 : 60);
  };
  // stop the room under the pill from taking its presses (a tap in a room pets the pet)
  const hold = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div ref={box} className={`snd ${className}`} data-side={side} data-drop={drop} data-open={open || undefined} data-quiet onPointerDown={hold}>
      <button type="button" className="snd-b" aria-pressed={on} aria-label={on ? 'Sound on: switch it off' : prefs.on ? 'Sound starts with your first press: start it' : 'Sound off: switch it on'} title={on ? 'Sound on' : prefs.on ? 'Press to start sound' : 'Sound off'} onClick={toggle}><Speaker on={on} /></button>
      <button type="button" className="snd-b" aria-expanded={open} aria-label="Volume" title="Volume" onClick={() => setOpen((o) => !o)}><Sliders /></button>
      {open && (
        <div ref={pop} className="snd-pop" role="dialog" aria-label="Volume">
          <label>Music <input type="range" min={0} max={1} step={0.02} value={prefs.music} onChange={(e) => setPrefs({ music: Number(e.target.value), on: true })} /></label>
          <label>Effects <input type="range" min={0} max={1} step={0.02} value={prefs.sfx} onChange={(e) => setPrefs({ sfx: Number(e.target.value), on: true })} onPointerUp={() => cue('pop')} /></label>
        </div>
      )}
    </div>
  );
}

/** The on/off switch as a line of a menu (the header's wallet menu and the phone menu). */
export function SoundRow() {
  const prefs = useSyncExternalStore(subscribe, getPrefs);
  return <button role="menuitem" data-quiet onClick={() => { const on = !prefs.on; setPrefs({ on }); if (on) setTimeout(() => cue('ui.on'), 60); }}>{prefs.on ? 'Sound: on' : 'Sound: off'}</button>;
}
