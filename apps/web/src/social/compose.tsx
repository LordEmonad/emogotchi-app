/**
 * What the two composers share (the town square, ChatPanel.tsx, and DMs, Inbox.tsx), and how a message shows its
 * extras (2026-09-28: "gifs and emojis ... react to messages and reply to specific messages"):
 *
 *  - a GIF, which is KLIPY's and only ever an image off static.klipy.com: rules.ts gifUrl is checked again here before
 *    any <img> is made, the image carries no referrer, and one that will not load leaves a quiet placeholder,
 *  - a reply's quote (the start of what it answers, as plain text, or "deleted" once the original is gone),
 *  - the emoji and GIF buttons, whose pickers load only when first opened (EmojiPicker.tsx, GifPicker.tsx).
 *
 * Emoji are plain text: the picker only types characters into the box.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { REACTION_PRESETS, gifUrl, type Gif, type Reactions, type ReplyQuote } from './rules';

const EmojiPicker = lazy(() => import('./EmojiPicker'));
const GifPicker = lazy(() => import('./GifPicker'));

/** A GIF in a message: at most `max` wide and `maxH` tall, the space kept while it loads. */
export function GifView({ g, max = 240, maxH = 260, still = false }: { g: Gif; max?: number; maxH?: number; still?: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = gifUrl(still && g.still ? g.still : g.url);
  if (!src) return null;
  const w = Math.max(60, Math.round(Math.min(max, g.w, (maxH * g.w) / g.h)));
  const h = Math.round((w * g.h) / g.w);
  return (
    <span className="so-gif" style={{ width: w, height: h }}>
      {broken
        ? <i>GIF unavailable</i>
        : <img src={src} width={w} height={h} alt="GIF" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} />}
    </span>
  );
}

/** A reply's quote over the message: who it answers and the start of what they said; a tap jumps to it. */
export function Quote({ q, name, hidden = false, onJump }: { q: ReplyQuote; name: string; hidden?: boolean; onJump?: () => void }) {
  if (q.gone) return <span className="so-rq gone">Replying to a deleted message</span>;
  if (hidden) return <span className="so-rq gone">Replying to someone you blocked</span>;
  const what = q.t ? (q.g ? `${q.t} · GIF` : q.t) : q.g ? 'GIF' : '';
  const body = <><b>{name}</b><span>{what}</span></>;
  return onJump ? <button type="button" className="so-rq" onClick={onJump} title="Show the message this answers">{body}</button> : <span className="so-rq">{body}</span>;
}

/** Above the box while replying: whom, and a way out. */
export function ReplyBar({ name, text, gif, onCancel }: { name: string; text: string; gif: boolean; onCancel: () => void }) {
  return (
    <div className="so-replybar">
      <span>Replying to <b>{name}</b><em>{text || (gif ? 'GIF' : '')}</em></span>
      <button type="button" onClick={onCancel} aria-label="Cancel the reply">×</button>
    </div>
  );
}

/** The GIF about to be sent, with a way to take it off again. */
export function GifChip({ g, onRemove }: { g: Gif; onRemove: () => void }) {
  return (
    <div className="so-gifchip">
      <GifView g={g} max={120} maxH={90} />
      <button type="button" onClick={onRemove} aria-label="Remove the GIF">×</button>
    </div>
  );
}

/** Type `add` at the cursor (or over the selection), and put the cursor after it. */
export function insertAt(el: HTMLTextAreaElement | null, value: string, add: string, set: (v: string) => void) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  set(value.slice(0, start) + add + value.slice(end));
  // on a phone, focusing the box opens the keyboard over the picker: only a mouse gets the cursor back
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  requestAnimationFrame(() => { if (el && fine) { el.focus(); const p = start + add.length; el.setSelectionRange(p, p); } });
}

/**
 * The emoji and GIF buttons, and whichever picker is open above the box. `box` is the textarea the emoji go into.
 * `gifs` shows the GIF button (the Worker has a KLIPY key: `me.gifs`).
 */
export function ComposeTools({ box, value, onText, gifs, onGif, disabled = false }: { box: RefObject<HTMLTextAreaElement | null>; value: string; onText: (v: string) => void; gifs: boolean; onGif: (g: Gif) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<null | 'emoji' | 'gif'>(null);
  const [room, setRoom] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value); valueRef.current = value;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [open]);
  // The picker opens upward over the list above the box and stops at that list's top: past it, the panel's own edge
  // cut the picker's top off, search box and all (every phone, 2026-09-29). Measured again whenever the box or the list
  // changes size (a longer message, a reply bar, the phone's sheet growing while a picker is open).
  useLayoutEffect(() => {
    if (!open) { setRoom(null); return; }
    const compose = host.current?.closest<HTMLElement>('.so-compose');
    if (!compose) return;
    const list = compose.parentElement?.querySelector<HTMLElement>('.so-chat-list, .so-drawer-body');
    const fit = () => {
      const top = Math.max(0, list ? list.getBoundingClientRect().top : 0);
      setRoom(Math.max(120, Math.floor(compose.getBoundingClientRect().top - top - 8)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(compose);
    if (list) ro.observe(list);
    addEventListener('resize', fit);
    return () => { ro.disconnect(); removeEventListener('resize', fit); };
  }, [open]);
  const pop = (what: ReactNode) => (
    <div className="so-pick" role="dialog" aria-label={open === 'gif' ? 'GIFs' : 'Emoji'} style={room ? { height: `min(370px, 54vh, ${room}px)` } : undefined}>
      <Suspense fallback={<p className="so-pick-note">Opening…</p>}>{what}</Suspense>
    </div>
  );
  return (
    <div className="so-tools" ref={host}>
      <button type="button" className={`so-tool${open === 'emoji' ? ' on' : ''}`} disabled={disabled} onClick={() => setOpen(open === 'emoji' ? null : 'emoji')} aria-label="Emoji" title="Emoji">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.9" /><circle cx="9" cy="10" r="1.25" fill="currentColor" /><circle cx="15" cy="10" r="1.25" fill="currentColor" /><path d="M8.2 14.2c1 1.4 2.3 2.1 3.8 2.1s2.8-.7 3.8-2.1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
      </button>
      {gifs && (
        <button type="button" className={`so-tool gif${open === 'gif' ? ' on' : ''}`} disabled={disabled} onClick={() => setOpen(open === 'gif' ? null : 'gif')} aria-label="GIF" title="GIF"><span className="so-gif-ico">GIF</span></button>
      )}
      {open === 'emoji' && pop(<EmojiPicker onPick={(e) => insertAt(box.current, valueRef.current, e, onText)} />)}
      {open === 'gif' && pop(<GifPicker onPick={(g) => { onGif(g); setOpen(null); }} />)}
    </div>
  );
}

// ---------------------------------------------------------------- reactions (2026-09-28: "like how you can on x")

/**
 * A message's reactions as pills, most given first: the emoji and how many. Yours is lit; a tap on yours takes it back,
 * a tap on another makes it yours (one reaction per person, like X). Signed out, a tap asks you to sign in (`onPick`
 * decides).
 */
export function ReactionPills({ rx, mine, onPick }: { rx: Reactions | undefined; mine: string | null; onPick: (emoji: string | null) => void }) {
  if (!rx?.length) return null;
  return (
    <div className="so-rx">
      {rx.map(([e, n]) => (
        <button key={e} type="button" className={`so-rx-pill${mine === e ? ' mine' : ''}`} aria-pressed={mine === e} aria-label={`${e} ${n}${mine === e ? ', yours: tap to take it back' : ''}`} onClick={() => onPick(mine === e ? null : e)}>
          <span className="so-rx-e">{e}</span><span className="so-rx-n">{n}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Scroll the message list `el` sits in (the square's, a DM thread's) just far enough to show `el` whole, its top first
 * when it is taller than the list. Only that list moves: never the page, the panel or the town around it. What opens
 * under the last message (the reaction row, the full picker, a message's menu) used to open out of sight.
 */
export function revealInList(el: HTMLElement | null) {
  const list = el?.closest<HTMLElement>('.so-chat-list, .so-drawer-body');
  if (!el || !list) return;
  const r = el.getBoundingClientRect(), l = list.getBoundingClientRect();
  if (r.bottom > l.bottom - 6) list.scrollTop += Math.min(r.bottom - l.bottom + 6, r.top - l.top - 6);
  else if (r.top < l.top + 6) list.scrollTop -= l.top + 6 - r.top;
}

/** The react button's pop-up: the quick row, like X's, and "+" for any emoji from the full picker. */
export function ReactBar({ mine, onPick, onClose }: { mine: string | null; onPick: (emoji: string | null) => void; onClose: () => void }) {
  const [full, setFull] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  // Shown whole as it opens and as it turns into the full picker, which is never taller than the list can show (300
  // at most: a phone's list is shorter than that).
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const list = el.closest<HTMLElement>('.so-chat-list, .so-drawer-body');
    el.style.height = full && list ? `${Math.max(180, Math.min(300, list.clientHeight - 16))}px` : '';
    revealInList(el);
  }, [full]);
  useEffect(() => {
    // a press on the react button itself is left to the button, which toggles the row (closing here first would have it
    // reopen at once)
    const down = (e: PointerEvent) => { const t = e.target as Element; if (!host.current?.contains(t) && !t.closest?.('.so-act.react')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const pick = (e: string) => { onPick(mine === e ? null : e); onClose(); };
  return (
    <div className={`so-reactbar${full ? ' full' : ''}`} ref={host} role="dialog" aria-label="React" onPointerDown={(e) => e.stopPropagation()}>
      {full
        ? <Suspense fallback={<p className="so-pick-note">Opening…</p>}><EmojiPicker onPick={pick} /></Suspense>
        : (
          <div className="so-reactbar-row">
            {REACTION_PRESETS.map((e) => <button key={e} type="button" className={mine === e ? 'mine' : ''} aria-label={`React ${e}`} onClick={() => pick(e)}>{e}</button>)}
            <button type="button" className="more" aria-label="Any emoji" title="Any emoji" onClick={() => setFull(true)}>+</button>
          </div>
        )}
    </div>
  );
}

/** The react button itself: a face with a plus, like X's. */
export function ReactIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><path d="M20 12.2A8 8 0 1 1 12 4.1" /><circle cx="9.2" cy="10.4" r="1" fill="currentColor" stroke="none" /><circle cx="14.2" cy="10.4" r="1" fill="currentColor" stroke="none" /><path d="M8.6 14.3c.9 1.1 2 1.7 3.3 1.7s2.4-.6 3.3-1.7" /><path d="M18.5 2.8v5M16 5.3h5" /></svg>;
}
