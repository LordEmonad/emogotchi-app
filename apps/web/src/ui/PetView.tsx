import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { PropName } from '../scene/props';
import type { DirectorState } from '../scene/director';
import { MON_TO_NAME, MON_TO_REVIVE, TIME_SCALE, DAY, clockOf, dayOf, type Game, type PaidAction, type Stunt, need } from '../game/state';
import type { Character } from '../pet/Pet';
import { PETS, collectionOf, petHref } from '../pets';
import type { Collection } from '@emo-pets/chain';
import type { AllCounts } from '../game/chain';
import { ITEM_KINDS, type ItemKind } from '../items';

export type CatTab = { id: number; col: Collection; name: string; alive: boolean; crowned: boolean };
/** One item in the Items menu: something the wallet holds (or this pet wears). `fits`: this pet can use it (the emo hair is
 *  not drawn on a cat); `held`: copies in the wallet (one copy dresses any number of pets). */
export type ItemRow = { id: number; kind: ItemKind; label: string; icon: PropName; on: boolean; held: number; fits: boolean; toggle: () => void | Promise<void> };
type Props = {
  stage: ReactNode;
  g: Game;
  d: DirectorState;
  name: string;
  onName: (name: string) => void;
  act: (a: PaidAction | 'wake' | Stunt) => void;
  /** which pet this is: the cat (paid care), inversebrah (free care, four abuses) or Sahur (free care, one stunt) */
  character?: Character;
  /** live mode: the wallet's cats, for switching between them */
  tabs?: CatTab[];
  /** every item the wallet holds (or this pet wears), for the Items menu: one tap puts it on or takes it off (a transaction) */
  items?: ItemRow[];
  /** the hen is on this pet: its Kapparot button (a pet, on chain, gas only; a tap on the pet stays the quick nuzzle) */
  kapparot?: () => void;
  /** the Habibi pack's falcon: while it is on the pet, a button plays it (a tap on the pet stays the quick nuzzle) */
  falcon?: () => void;
  /** the emo pack's flip phone: while it is on the pet, a button plays the mirror selfie (a tap stays the quick nuzzle) */
  selfie?: () => void;
  /** the item shop, when this build has one */
  shopHref?: string;
  activeId?: number | null;
  onTab?: (id: number, col: Collection) => void;
  /** live mode: the "All" tab; when it is on, every button acts on every pet in the wallet (every kind; the cats' care is paid, the rest free) */
  all?: { on: boolean; counts: AllCounts };
  onAll?: () => void;
  /** live mode: a line under the stage while a transaction is in flight, or why actions are locked */
  pending?: string | null;
  /** the wallet was asked and has not answered: show the way out */
  stuck?: { onOpenWallet?: () => void; onGiveUp: () => void } | null;
  /** live mode: make a shareable picture of this cat */
  onShare?: () => void;
  /** live mode, your own pet: send it to someone (ui/SendSheet.tsx) */
  onSend?: () => void;
  /** live mode, a wallet that holds items: send one of them to someone */
  onSendItem?: () => void;
  shareNote?: string | null;
  /** live mode: no actions (not our cat, wrong chain, transaction in flight) */
  locked?: boolean;
  /** live: who owns this pet, as a link to their profile ("yours" on your own) */
  owner?: { href: string; label: string };
  live?: boolean;
};

const BUSY_MOOD: Record<string, string> = { feed: 'eating', wash: 'bathing', play: 'playing', poop: 'busy…', clean: 'relieved', pet: 'purring', wake: 'waking up', walk: 'wandering', wander: 'wandering', rumble: 'hungry', sleep: 'dozing off', tour: 'showing off', die: 'fading…', revive: 'coming back', screenshot: 'posing', slap: 'slapped', squeeze: 'squeezed', burn: 'on fire', tung: 'tung tung tung', ...(__THICCUMS__ ? { show: 'bouncing' } : {}) };
const NEED_MOOD: Record<NonNullable<ReturnType<typeof need>>, string> = { food: 'hungry', clean: 'grubby', fun: 'bored', energy: 'sleepy', poop: 'grossed out' };

export function PetView({ stage, g, d, name, onName, act, tabs = [], activeId = null, onTab, all, onAll, onShare, onSend, onSendItem, shareNote = null, pending = null, stuck = null, locked = false, live = false, items = [], kapparot, falcon, selfie, shopHref, character = 'cat', owner }: Props) {
  const col = collectionOf(character);
  const frok = character === 'frog';
  const sahur = character === 'sahur';
  const thicc = __THICCUMS__ && character === 'thiccums';
  const free = PETS[col].free;                       // inversebrah's and Sahur's care is gas only; the cat's is 1 MON
  const PET = PETS[col].kind;                        // in copy he is a frok, never a frog
  const he = PETS[col].he;
  const cost = free ? 'free' : undefined;
  // the buttons wait for an action (and for a transaction), never for the pet's own pottering about: an action asked for
  // while it wanders plays as soon as it stops (director.isActing)
  const busy = locked || (d.busy !== null && d.busy !== 'wander' && d.busy !== 'rumble') || d.queued > 0;
  const every = all?.on ? all.counts : null;
  const dead = !g.alive;
  const n = need(g);
  const avg = (g.stats.food + g.stats.clean + g.stats.fun + g.stats.energy) / 4;
  const mood = dead ? 'gone' : g.sleeping ? 'sleeping' : d.busy ? (BUSY_MOOD[d.busy] ?? 'busy') : n ? NEED_MOOD[n] : avg > 78 ? 'happy' : avg > 55 ? 'content' : 'meh';
  const day = dayOf(g.t);

  // The name field belongs to the pet it was opened for: on another pet it is closed (a name being typed was for the
  // last one; committing it would have named this one). It used to be closed by an effect on every switch, which in
  // development (StrictMode runs effects twice) also closed the field ?name=1 had just opened (2026-09-29).
  const petId = `${col}:${activeId ?? ''}`;
  const [editingFor, setEditingFor] = useState<string | null>(null);
  if (editingFor !== null && editingFor !== petId) setEditingFor(null);   // switched away: coming back finds it closed
  const editing = editingFor === petId;
  const setEditing = (on: boolean) => setEditingFor(on ? petId : null);
  const [draft, setDraft] = useState('');
  // ?name=1 (Emotown's gate notice links here: "Name your pet"): open the name field once it can be edited, on the pet
  // the link names (the page can show another pet first)
  const askedName = useRef(typeof location !== 'undefined' && new URLSearchParams(location.search).has('name'));
  useEffect(() => {
    if (!askedName.current || activeId == null || location.pathname.replace(/\/$/, '') !== petHref(col, activeId)) return;
    if (live && !dead && !locked && !name) { askedName.current = false; setDraft(''); setEditingFor(`${col}:${activeId}`); }
  }, [live, dead, locked, name, activeId, col]);
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const valid = (s: string) => s.trim().length > 0 && bytes(s.trim()) <= 32 && s.trim() !== name;
  const commit = () => { const next = draft.trim(); if (!valid(next)) return; setEditing(false); onName(next); };

  return (
    <main className="petview">
      {tabs.length > 1 && <PetTabs tabs={tabs} activeKey={petId} allOn={!!all?.on} all={all ? { total: all.counts.total, onAll } : undefined} onTab={onTab} label={new Set(tabs.map((t) => t.col)).size > 1 ? 'Your pets' : `Your ${PET}s`} />}
      <div className={`shell ${dead ? 'is-dead' : ''}`}>{stage}</div>
      {pending && <p className={`pending-line ${locked ? '' : 'is-info'}`} aria-live="polite">{pending}</p>}
      {stuck && (
        <div className="stuck-line" role="alert">
          <p>Your wallet hasn’t answered. Some wallets open without showing the request — bring it to the front and look, or give up and try again.</p>
          <div className="stuck-actions">
            {stuck.onOpenWallet && <button className="btn btn-sm btn-pink" onClick={stuck.onOpenWallet}>Open my wallet</button>}
            <button className="btn btn-sm btn-ghost" onClick={stuck.onGiveUp}>Give up</button>
          </div>
          <p className="stuck-hint">If it keeps happening, open <b>emogotchi.emonad.lol</b> inside your wallet’s own browser instead — that path doesn’t use WalletConnect at all.</p>
        </div>
      )}

      <div className="nameplate">
        {editing ? (
          <span className="name-edit">
            <input className="name-input" autoFocus value={draft} maxLength={32} placeholder={`Name your ${PET}`} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
            <button className="name-ok" onMouseDown={(e) => e.preventDefault()} onClick={commit} disabled={!valid(draft)} title={bytes(draft.trim()) > 32 ? 'Too long: names are 32 bytes on chain' : undefined}>Name it · {MON_TO_NAME} MON</button>
            <button className="name-cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)}>✕</button>
          </span>
        ) : (
          <button className="name-btn" onClick={() => { setDraft(name); setEditing(true); }} disabled={dead || locked} title={name ? `Rename · ${MON_TO_NAME} MON` : `Name your ${PET} · ${MON_TO_NAME} MON`}>
            {name || <span className="name-empty">{locked ? 'Unnamed' : `Name your ${PET}`}</span>}{!locked && <span className="name-pen" aria-hidden>✎</span>}{!name && !locked && <span className="name-cost">{MON_TO_NAME} MON</span>}
          </button>
        )}
        <span className="name-sep">·</span>
        <span className="name-day tnum" title={live ? `Days since this ${PET}'s clock started` : `Demo clock: one day passes every ${Math.round(DAY / TIME_SCALE / 60)} minutes`}>{dead && g.diedOnDay ? `Died on day ${g.diedOnDay}` : live ? `Day ${day}` : `Day ${day} · ${clockOf(g.t)}`}</span>
        <span className="name-sep">·</span>
        <span className={`name-mood mood-${mood.replace(/[\s…]/g, '-')}`}>{mood}</span>
        {owner && <><span className="name-sep">·</span><a className="name-owner" href={owner.href} title="Their profile">{owner.label}</a></>}
        {!dead && character === 'cat' && g.record.deaths === 0 && <span className="name-mood is-pristine" title="Deaths are counted on the cat, on chain, forever. This one has none.">never died</span>}
        {!dead && items.length > 0 && (<>
          <span className="name-sep">·</span>
          <ItemsMenu items={items} busy={busy} pet={PET} many={PETS[col].many} shopHref={live ? shopHref : undefined} />
        </>)}
        {items.length === 0 && shopHref && live && !dead && (<>
          <span className="name-sep">·</span>
          <a className="outfit-link" href={shopHref}>Items</a>
        </>)}
      </div>

      {/* keyed by the pet: switching to a pet with fuller meters is not a meter going up (no "just cared for" bump) */}
      <section key={petId} className={`grid grid-cols-4 gap-2 sm:gap-3 ${dead ? 'meters-dead' : ''}`}>
        <Meter icon="bowl" label="Food" v={g.stats.food} />
        <Meter icon="sponge" label="Clean" v={g.stats.clean} />
        <Meter icon="yarn" label="Fun" v={g.stats.fun} />
        <Meter icon="moon" label="Energy" v={g.stats.energy} />
      </section>

      {dead ? (<>
        <section className="revive">
          <div className="revive-text">
            <b>{name || (character === 'cat' ? 'Your Emogotchi' : PETS[col].one)} is gone.</b>
            <span>{he === 'he' ? 'He' : 'It'} went a whole day with no food and nobody came. A ghost in your wallet is not a good look.</span>
          </div>
          <button className="btn btn-pink btn-lg revive-btn" onClick={() => act('revive')} disabled={busy}>
            <Icon name="flame" size={22} /> {free ? 'Revive · free' : `Revive · ${MON_TO_REVIVE.toLocaleString()} MON`}
          </button>
          <span className="revive-fine">{free ? 'Comes back with every meter at 60, for nothing but gas; the death stays on his record forever.' : 'Comes back with every meter at 60. Half of the MON buys EMO and burns it; the death stays on its record forever.'}</span>
        </section>
        <section className="record" aria-label="Lifetime record">
          <span className="record-title">On chain forever</span>
          <Stat n={g.record.feeds} l="feeds" /><Stat n={g.record.washes} l="washes" /><Stat n={g.record.plays} l="plays" /><Stat n={g.record.naps} l="naps" />
          <Stat n={g.record.cleanups} l="cleanups" /><Stat n={g.record.pets} l="pets" /><Stat n={g.record.deaths} l="deaths" /><Stat n={g.burnedEmo} l="EMO burned" />
          {frok && <><Stat n={g.record.screenshots} l="screenshots" /><Stat n={g.record.slaps} l="slaps" /><Stat n={g.record.squeezes} l="squeezes" /><Stat n={g.record.burns} l="burns" /></>}
          {sahur && <Stat n={g.record.tungs} l="tung tung tungs" />}{thicc && <Stat n={g.record.bounces ?? 0} l="bounces" />}
        </section>
      </>) : (
        <>
          {every ? (<>
            <section className="grid grid-cols-4 gap-2 sm:gap-3">
              <Action icon="bowl" label="Feed all" onClick={() => act('feed')} disabled={busy || every.feed === 0} cost={every.mon.feed ? `${every.mon.feed} MON` : 'free'} active={d.busy === 'feed'} />
              <Action icon="sponge" label="Wash all" onClick={() => act('wash')} disabled={busy || every.wash === 0} cost={every.mon.wash ? `${every.mon.wash} MON` : 'free'} active={d.busy === 'wash'} />
              <Action icon="yarn" label="Play all" onClick={() => act('play')} disabled={busy || every.play === 0} cost={every.mon.play ? `${every.mon.play} MON` : 'free'} active={d.busy === 'play'} />
              <Action icon="moon" label="Sleep all" onClick={() => act('sleep')} disabled={busy || every.sleep === 0} cost={every.mon.sleep ? `${every.mon.sleep} MON` : 'free'} active={d.busy === 'sleep'} />
            </section>
            <div className={`clean-row ${every.clean > 0 ? 'is-on' : ''}`} aria-hidden={every.clean === 0}>
              <button onClick={() => act('clean')} disabled={busy || every.clean === 0} className="clean-btn">
                <Icon name="scoop" size={26} /><span>{every.clean === 1 ? 'Clean up the poop' : `Clean up ${every.clean} poops`}</span><span className="cost">{every.mon.clean ? `${every.mon.clean} MON` : 'free'}</span>
              </button>
            </div>
          </>) : (<>
            <section className="grid grid-cols-4 gap-2 sm:gap-3">
              <Action icon="bowl" label="Feed" onClick={() => act('feed')} disabled={busy || g.sleeping} active={d.busy === 'feed'} cost={cost} />
              <Action icon="sponge" label="Wash" onClick={() => act('wash')} disabled={busy || g.sleeping} active={d.busy === 'wash'} cost={cost} />
              <Action icon="yarn" label="Play" onClick={() => act('play')} disabled={busy || g.sleeping} active={d.busy === 'play'} cost={cost} />
              {g.sleeping
                ? <Action icon="sun" label="Wake" onClick={() => act('wake')} disabled={busy} free active={d.busy === 'wake'} />
                : <Action icon="moon" label="Sleep" onClick={() => act('sleep')} disabled={busy || (live && g.stats.energy >= 100)} active={d.busy === 'sleep'} cost={cost} />}
            </section>
            <div className={`clean-row ${d.poop ? 'is-on' : ''}`} aria-hidden={!d.poop}>
              <button onClick={() => act('clean')} disabled={busy || !d.poop} className="clean-btn">
                <Icon name="scoop" size={26} /><span>Clean up the poop</span><span className="cost">{free ? 'free' : '1 MON'}</span>
              </button>
            </div>
            {frok && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row" aria-label="Abuse">
                <Action icon="camera" label="Screenshot" onClick={() => act('screenshot')} disabled={busy || g.sleeping} free active={d.busy === 'screenshot'} />
                <Action icon="pow" label="Slap" onClick={() => act('slap')} disabled={busy || g.sleeping} free active={d.busy === 'slap'} />
                <Action icon="clawjaw" label="Squeeze" onClick={() => act('squeeze')} disabled={busy || g.sleeping} free active={d.busy === 'squeeze'} wide />
                <Action icon="fire" label="Burn" onClick={() => act('burn')} disabled={busy || g.sleeping} free active={d.busy === 'burn'} />
              </section>
            )}
            {sahur && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row stunt-row-one" aria-label="His stunt">
                <Action icon="tung" label="Tung tung tung" onClick={() => act('tung')} disabled={busy || g.sleeping} free active={d.busy === 'tung'} wide />
              </section>
            )}
            {thicc && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row stunt-row-one" aria-label="His stunt">
                <Action icon="sparkle" label="Butt bounce" onClick={() => act('bounce')} disabled={busy || g.sleeping} free active={d.busy === 'show'} wide />
              </section>
            )}
            {kapparot && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row stunt-row-one" aria-label="Kapparot">
                <Action icon="hen" label="Kapparot" onClick={kapparot} disabled={busy || g.sleeping} free active={d.busy === 'pet'} wide />
              </section>
            )}
            {falcon && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row stunt-row-one" aria-label="The falcon">
                <Action icon="falcon" label="Call the falcon" onClick={falcon} disabled={busy || g.sleeping} free active={d.busy === 'pet'} wide />
              </section>
            )}
            {selfie && (
              <section className="grid grid-cols-4 gap-2 sm:gap-3 stunt-row stunt-row-one" aria-label="The mirror selfie">
                <Action icon="heart" label="Mirror selfie" onClick={selfie} disabled={busy || g.sleeping} free active={d.busy === 'pet'} wide />
              </section>
            )}
          </>)}
          {(onShare || onSend) && (
            <div className="share-row">
              {onShare && <button className="btn btn-sm btn-ghost" onClick={onShare}>{shareNote ?? `Share this ${PET}`}</button>}
              {onSend && <button className="btn btn-sm btn-ghost" onClick={onSend}>Send this {PET}</button>}
              {onSendItem && <button className="btn btn-sm btn-ghost" onClick={onSendItem}>Send an item</button>}
            </div>
          )}
          <section className="record" aria-label="Lifetime record">
            <span className="record-title">On chain forever</span>
            <Stat n={g.record.feeds} l="feeds" /><Stat n={g.record.washes} l="washes" /><Stat n={g.record.plays} l="plays" /><Stat n={g.record.naps} l="naps" />
            <Stat n={g.record.cleanups} l="cleanups" /><Stat n={g.record.pets} l="pets" /><Stat n={g.record.deaths} l="deaths" /><Stat n={g.burnedEmo} l="EMO burned" />
            {frok && <><Stat n={g.record.screenshots} l="screenshots" /><Stat n={g.record.slaps} l="slaps" /><Stat n={g.record.squeezes} l="squeezes" /><Stat n={g.record.burns} l="burns" /></>}
            {sahur && <Stat n={g.record.tungs} l="tung tung tungs" />}{thicc && <Stat n={g.record.bounces ?? 0} l="bounces" />}
          </section>
          {!live && <p className="caption demo-clock">Demo clock: a day passes every {Math.round(DAY / TIME_SCALE / 60)} minutes, so you can watch a whole life. On chain, a day is a day.</p>}
          {frok
            ? <p className="caption">Everything you do to him is <span className="text-ink">free</span>, gas only, and every abuse is counted on his record forever. Naming him is <span className="text-ink">10 MON</span>, and 80% of it buys <span className="text-pink">EMO</span> and burns it. The first pet each day is +5 fun. Tap him.</p>
            : sahur || thicc
            ? <p className="caption">Everything you do to him is <span className="text-ink">free</span>, gas only, and every {sahur ? 'tung tung tung' : __THICCUMS__ ? 'butt bounce' : ''} is counted on his record forever. Naming him is <span className="text-ink">10 MON</span>, and 80% of it buys <span className="text-pink">EMO</span> and burns it. The first pet each day is +5 fun. Tap him.</p>
            : free
            ? <p className="caption">Everything you do to him is <span className="text-ink">free</span>, gas only. Naming him is <span className="text-ink">10 MON</span>, and 80% of it buys <span className="text-pink">EMO</span> and burns it. The first pet each day is +5 fun. Tap him.</p>
            : <p className="caption">Every interaction costs <span className="text-ink">1 MON</span>. 80% of it buys <span className="text-pink">EMO</span> and burns it on the spot. Petting only costs gas, and the first pet each day is +5 fun. Tap the cat.</p>}
        </>
      )}
    </main>
  );
}

// Every item the wallet holds, behind one button, by kind (the shop's order: outfits, headwear, accessories, rooms, toys,
// companions): with a button each they filled the nameplate and pushed the care buttons down the screen. The menu floats
// over the page, so nothing below it moves. An item this pet cannot use is listed greyed, so the menu is the inventory.
function ItemsMenu({ items, busy, pet, many, shopHref }: { items: ItemRow[]; busy: boolean; pet: string; many: string; shopHref?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // as tall as the screen has room for under the button (a long list scrolls inside it), never shorter than a few rows
  useLayoutEffect(() => {
    const el = pop.current; if (!open || !el) return;
    el.style.maxHeight = `${Math.max(220, Math.min(440, window.innerHeight - el.getBoundingClientRect().top - 12))}px`;
    if (el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  const worn = items.filter((x) => x.on).length;
  const pick = (t: ItemRow) => { setOpen(false); void t.toggle(); };
  const verb = (k: ItemKind) => (k === 'outfit' || k === 'head' || k === 'neck' ? 'Wear' : 'Use');
  const row = (t: ItemRow) => {
    const name = t.label.toLowerCase();
    const text = !t.fits ? t.label : t.on ? `${t.label} on` : `${verb(t.kind)} ${name}`;
    const title = !t.fits ? `Not drawn on ${many}` : t.on ? (t.kind === 'room' ? 'Back to the plain room · gas only' : `Take the ${name} off · gas only`)
      : t.kind === 'toy' || t.kind === 'companion' ? `Give your ${pet} the ${name} · gas only` : `${t.kind === 'room' ? 'Use' : 'Put'} the ${name}${t.kind === 'room' ? '' : ' on'} · gas only`;
    return (
      <button key={t.id} role="menuitemcheckbox" aria-checked={t.on} className={`items-row ${t.on ? 'is-on' : ''} ${t.fits ? '' : 'is-na'}`} onClick={() => pick(t)} disabled={busy || !t.fits} title={title}>
        <Icon name={t.icon} size={16} /><span className="items-row-text">{text}</span>
        {!t.fits && <span className="items-row-note">not for {many}</span>}
        {t.fits && t.held > 1 && <span className="items-row-n tnum" title={`${t.held} in your wallet`}>×{t.held}</span>}
        {t.on && <span className="items-row-tick" aria-hidden>✓</span>}
      </button>
    );
  };
  return (
    <span className="items-dd" ref={box}>
      <button className={`outfit-btn items-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="heart" size={12} /> Items{worn > 0 && <span className="items-count tnum">{worn} on</span>}<span className="items-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="items-pop" role="menu" ref={pop}>
          {ITEM_KINDS.map(({ kind, title }) => {
            const list = items.filter((t) => t.kind === kind);
            return list.length === 0 ? null : <div key={kind} role="group" aria-label={title}><div className="items-head">{title}</div>{list.map(row)}</div>;
          })}
          {shopHref && <a className="items-shop" href={shopHref}>Item shop</a>}
        </div>
      )}
    </span>
  );
}

/**
 * The wallet's pets, one tab each, in a row that scrolls sideways. A wallet can hold a lot of pets (the operator's does):
 * the tab on screen is always scrolled into view, and on a screen with a mouse (where a sideways row has no easy way to
 * scroll) arrows at either end page through it.
 */
function PetTabs({ tabs, activeKey, allOn, all, onTab, label }: { tabs: CatTab[]; activeKey: string; allOn: boolean; all?: { total: number; onAll?: () => void }; onTab?: (id: number, col: Collection) => void; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => { const el = row.current; if (!el) return; setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }); };
  useLayoutEffect(() => {
    const el = row.current; if (!el) return;
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);
  useEffect(() => {
    const el = row.current; if (!el) return;
    const on = el.querySelector<HTMLElement>('.cat-tab.is-on');
    if (!on) return;
    const l = on.offsetLeft - el.offsetLeft; const r = l + on.offsetWidth;
    if (l < el.scrollLeft + 24) el.scrollTo({ left: Math.max(0, l - 48), behavior: 'smooth' });
    else if (r > el.scrollLeft + el.clientWidth - 24) el.scrollTo({ left: r - el.clientWidth + 48, behavior: 'smooth' });
  }, [activeKey, allOn]);
  const page = (dir: 1 | -1) => { const el = row.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' }); };
  return (
    <div className="cat-tabs-wrap" data-left={edge.l ? 'on' : 'off'} data-right={edge.r ? 'on' : 'off'}>
      <div className="cat-tabs" role="tablist" aria-label={label} ref={row} onScroll={measure}>
        {all && <button role="tab" aria-selected={allOn} className={`cat-tab cat-tab-all ${allOn ? 'is-on' : ''}`} onClick={all.onAll}>All <span className="tnum">· {all.total}</span></button>}
        {tabs.map((t) => {
          const on = `${t.col}:${t.id}` === activeKey;
          return (
            <button key={`${t.col}:${t.id}`} role="tab" aria-selected={on && !allOn} className={`cat-tab ${on && !allOn ? 'is-on' : ''} ${t.alive ? '' : 'is-dead'} ${t.col !== 'cat' ? `is-frok is-${t.col}` : ''}`} onClick={() => onTab?.(t.id, t.col)}>
              {t.crowned && <span className="cat-tab-crown" aria-label="wears the crown">♛</span>}{PETS[t.col].mark && <span className="cat-tab-kind" aria-label={PETS[t.col].one}>{PETS[t.col].mark}</span>}<span className="tnum">#{t.id}</span>{t.name && <span className="cat-tab-name">{t.name}</span>}
            </button>
          );
        })}
      </div>
      <button className="cat-tabs-arrow is-left" onClick={() => page(-1)} aria-label="Earlier pets" tabIndex={-1}>‹</button>
      <button className="cat-tabs-arrow is-right" onClick={() => page(1)} aria-label="More pets" tabIndex={-1}>›</button>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <span className="record-stat"><b className="tnum">{n.toLocaleString()}</b><small>{l}</small></span>;
}

function Meter({ icon, label, v }: { icon: PropName; label: string; v: number }) {
  const low = v < 35;
  const segs = 5; const filled = Math.round((v / 100) * segs * 2) / 2;
  const prev = useRef(v); const [bump, setBump] = useState(0);
  useEffect(() => { if (v - prev.current > 5) setBump((b) => b + 1); prev.current = v; }, [v]);
  useEffect(() => { if (!bump) return; const id = setTimeout(() => setBump(0), 900); return () => clearTimeout(id); }, [bump]);
  return (
    <div className={`meter ${low ? 'is-low' : ''} ${bump ? 'is-bump' : ''}`}>
      <div className="meter-head"><Icon name={icon} size={20} /><span className="meter-label">{label}</span></div>
      <div className="meter-segs" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {Array.from({ length: segs }, (_, i) => { const f = Math.max(0, Math.min(1, filled - i)); return <span key={i} className="seg"><span className="seg-fill" style={{ width: `${f * 100}%` }} /></span>; })}
      </div>
    </div>
  );
}

function Action({ icon, label, onClick, disabled, free, active, cost, wide }: { icon: PropName; label: string; onClick: () => void; disabled?: boolean; free?: boolean; active?: boolean; cost?: string; wide?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`action ${active ? 'is-active' : ''}`}>
      <span className="action-disc"><Icon name={icon} size={34} className={wide ? 'is-wide' : ''} /></span>
      <span className="action-label">{label}</span>
      <span className="cost">{free ? 'free' : cost ?? '1 MON'}</span>
    </button>
  );
}
