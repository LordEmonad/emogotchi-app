/**
 * The small pieces every social screen shares: a person's avatar (their pet's head), their name, what they wrote
 * rendered SAFELY, and the one door out to another website.
 *
 * SafeText is the only way user text reaches the page: it splits the text with rules.ts and returns React text nodes,
 * buttons and internal links. Nothing here, or anywhere in social/, uses innerHTML (this origin holds passkey keys).
 * A link in someone's message is never a real link: it is a button that asks first, shows the whole address, and only
 * then opens it, in a new tab with no opener and no referrer.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { CatView } from '@emo-pets/chain';
import { PORTRAIT_DIR, costumeOf, hairOf } from '../items';
import { characterOf } from '../pets';
import { segments } from './rules';
import { picUrl } from './pics';
import { BANNER_SRC } from './banners';
import { social } from './store';
import type { Card, PetRef, Profile } from './types';
import { RoleMarks } from './RoleMarks';

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const nameOf = (c: { name?: string | null; n?: string | null; address?: string; a?: string }) => c.name ?? c.n ?? short((c.address ?? c.a ?? '0x0000000000').toLowerCase());
export const profileHref = (c: { name?: string | null; address: string }) => `/u/${c.name ?? c.address}`;
export const useSocial = () => useSyncExternalStore(social.subscribe, social.get);

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The dressed heads that exist for every pet (the cat has no emo hair item: `hairOf` never says so for her). */
const AVATAR_SETS = new Set<string>(['witch', 'pumpkin', 'mummy', 'zombie', 'bisht', 'emohair']);
/** A pet's head, 160 px (tools/social-avatars.mjs), in its current mood, crown and outfit when those are known. */
export function avatarSrc(pet: PetRef | null, view?: CatView | null, worn?: readonly number[]): string | null {
  if (!pet) return null;
  const ch = characterOf(pet.col);
  const mood = view ? (view.alive ? view.mood : 'dead') : 'content';
  const dressed = costumeOf(worn) ?? (hairOf(worn, ch) ? 'emohair' : null);
  // only a set that has been drawn (tools/social-avatars.mjs): an outfit added later shows the plain head until its
  // heads are made, never a missing file
  const costume = dressed && AVATAR_SETS.has(dressed) ? dressed : null;
  return `/social/av/${PORTRAIT_DIR[ch]}${costume ? costume + '/' : ''}${mood}${view?.crowned ? '-crown' : ''}.webp`;
}

/**
 * A person's face: the picture they uploaded when there is one (`pic`), else their pet's head. If the picture cannot
 * be had (taken down a moment ago, or pictures switched off), it falls back to the pet by itself.
 */
export function Avatar({ pet, view, worn, pic, size = 36, className = '', title, eager }: { pet: PetRef | null; view?: CatView | null; worn?: readonly number[]; pic?: string | null; size?: number; className?: string; title?: string; eager?: boolean }) {
  // What could not be had is passed over for the next best: the uploaded picture, the pet's head as it is dressed, its
  // head in the same mood undressed, its plain head. (A dressed head whose file did not exist used to be a blank
  // circle: every cat, frok and Sahur in a bisht, until 2026-10-02.)
  const [failed, setFailed] = useState<readonly string[]>([]);
  const mine = pic ? picUrl(pic) : null;
  const choices = [mine, avatarSrc(pet, view, worn), avatarSrc(pet, view), avatarSrc(pet)].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const src = choices.find((c) => !failed.includes(c)) ?? null;
  const usePic = !!mine && src === mine;
  // (no `key` on the image: when the face changes, say its mood once the chain has answered, the browser keeps the one
  // on screen until the next has loaded, where a new element blinked out to an empty circle first)
  return (
    <span className={`so-av${usePic ? ' is-pic' : ''} ${className}`} style={{ width: size, height: size }} title={title}>
      {src ? <img src={src} alt="" width={size} height={size} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed((f) => (f.includes(src) ? f : [...f, src]))} /> : <i aria-hidden>✦</i>}
    </span>
  );
}

/** A profile's banner as a CSS background: their uploaded one over Emotown's (which shows if theirs cannot load). */
export const bannerBg = (p: Pick<Profile, 'banner' | 'bannerPic'>) => (p.bannerPic ? `url(${picUrl(p.bannerPic)}), url(${BANNER_SRC(p.banner)})` : `url(${BANNER_SRC(p.banner)})`);

// ------------------------------------------------------------------ the door out
type Leaving = { href: string | null; text: string; from: string | null };
let leaving: Leaving | null = null;
const leaveSubs = new Set<() => void>();
export function askToOpen(text: string, href: string | null, from: string | null = null) { leaving = { text, href, from }; for (const f of leaveSubs) f(); }
const closeLeaving = () => { leaving = null; for (const f of leaveSubs) f(); };

/** Mounted once per page: the warning before any link someone else wrote is opened. */
export function LinkGate() {
  const l = useSyncExternalStore((f) => { leaveSubs.add(f); return () => { leaveSubs.delete(f); }; }, () => leaving);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCopied(false); if (!l) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLeaving(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [l]);
  if (!l) return null;
  let host = '';
  try { host = l.href ? new URL(l.href).host : ''; } catch { /* no host */ }
  return (
    <div className="modal-back so-leave" onPointerDown={(e) => { if (e.target === e.currentTarget) closeLeaving(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Leaving Emotown">
        <div className="modal-head"><h2>{l.href ? 'Leaving Emotown' : 'Not a web link'}</h2><button className="modal-x" onClick={closeLeaving} aria-label="Close">✕</button></div>
        <p className="modal-sub">{l.from ? <>This link was written by <b>{l.from}</b>. </> : null}Emotown does not check links. Nobody real will ever ask for your recovery phrase, and a site that does is stealing.</p>
        <div className="so-leave-url" translate="no">{l.href ?? l.text}</div>
        {host && <p className="so-leave-host">Opens <b>{host}</b></p>}
        <div className="pk-actions">
          <button className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(l.href ?? l.text).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Copied' : 'Copy'}</button>
          {l.href ? <button className="btn btn-pink" onClick={() => { window.open(l.href!, '_blank', 'noopener,noreferrer'); closeLeaving(); }}>Open it</button> : <button className="btn btn-pink" onClick={closeLeaving}>OK</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * Someone's words, as text. Links become inert buttons (see LinkGate); an @mention of someone who exists becomes a
 * link to their profile (or `onMention`, which the town uses to open their card in place).
 */
export function SafeText({ text, mentions = [], from = null, onMention }: { text: string; mentions?: { n: string; a: string }[]; from?: string | null; onMention?: (address: string, name: string) => void }) {
  const known = Object.fromEntries(mentions.map((m) => [m.n.toLowerCase(), m.a]));
  const out: ReactNode[] = [];
  segments(text, known).forEach((s, i) => {
    if (s.kind === 'text') out.push(s.v);
    else if (s.kind === 'link') out.push(<button key={i} type="button" className="so-link" onClick={(e) => { e.stopPropagation(); askToOpen(s.v, s.href, from); }} title="Written by someone in Emotown. Tap to see where it goes.">{s.v}</button>);
    else {
      const name = s.v.slice(1);
      out.push(onMention
        ? <button key={i} type="button" className="so-mention" onClick={(e) => { e.stopPropagation(); onMention(s.address, name); }}>{s.v}</button>
        : <a key={i} className="so-mention" href={`/u/${name}`}>{s.v}</a>);
    }
  });
  return <>{out}</>;
}

/** Who someone is, in one line: their pet's head and their name. */
export function Who({ card, size = 28, onClick }: { card: Card; size?: number; onClick?: () => void }) {
  const body = <><Avatar pet={card.pet} pic={card.pic} size={size} /><span className="so-who-name">{nameOf(card)}</span><RoleMarks address={card.address} /></>;
  return onClick ? <button type="button" className="so-who" onClick={onClick}>{body}</button> : <span className="so-who">{body}</span>;
}
