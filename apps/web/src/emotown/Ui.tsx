/**
 * Emotown's interface over the street: the pet card, the ticker of what just happened on chain, the map of the whole
 * street, and the finder. Everything here reads the sim; nothing here draws the town.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chainCfg } from '../game/chain';
import { ITEM_LABEL, costumePortrait, plainPortrait, portraitSetOf, sceneOf } from '../items';
import { PETS, fallbackName, petHref } from '../pets';
import type { Camera } from './camera';
import type { LiveEvent } from './data';
import type { FightResult } from '../fight/town/FightTown';
import { BASE, LANDMARK, LANDMARKS, TOWN } from './layout';
import { Avatar } from '../social/ui';
import { CarePanel } from './Care';
import { usePets } from '../social/profile';
import { RoleMarks } from '../social/RoleMarks';
import { keyOf } from './sim';
import type { Resident, TownSim } from './sim';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const nameOf = (r: Resident) => r.view?.name || fallbackName(r.col, r.id);
const MOOD: Record<string, string> = { content: 'Content', happy: 'Happy', hungry: 'Hungry', grubby: 'Grubby', bored: 'Bored', sleepy: 'Sleepy', sleeping: 'Asleep', sad: 'Sad', dead: 'A ghost' };
const DID: Record<string, string> = {
  feed: 'fed', play: 'played with', wash: 'washed', sleep: 'put to bed', clean: 'cleaned up after', wake: 'woken up', name: 'named', revive: 'revived',
  pet: 'petted', mint: 'moved in', screenshot: 'screenshotted', slap: 'slapped', squeeze: 'squeezed', burn: 'set on fire', tung: 'tung tung tung',
};
export function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 50) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const h = Math.round(s / 3600); return `${h} hour${h === 1 ? '' : 's'} ago`;
}

// ------------------------------------------------------------------ the card
export const PetCard = memo(function PetCard({ r, version, following, onFollow, onClose, onOwner, ownerName, mine, onCared, onSent }: { r: Resident; version: number; following: boolean; onFollow: () => void; onClose: () => void; onOwner?: (address: string) => void; ownerName?: string | null; mine?: boolean; onCared?: (e: LiveEvent) => void; onSent?: (to: string) => void }) {
  void version;
  const v = r.view; const meta = PETS[r.col];
  const dressed = portraitSetOf(r.worn, r.character);   // its outfit, else the pack's accessories, else the emo hair
  const mood = v ? (v.alive ? v.mood : 'dead') : 'content';
  const portrait = dressed ? costumePortrait(dressed, mood, !!v?.crowned, r.character) : plainPortrait(mood, !!v?.crowned, r.character);
  const worn = r.worn.map((id) => ITEM_LABEL[id]).filter(Boolean);
  const neverDied = !!v && v.alive && v.deaths === 0 && v.revives === 0;
  const tokenLink = chainCfg?.explorer ? `${chainCfg.explorer}/nft/${r.col === 'cat' ? chainCfg.contract : r.col === 'frok' ? chainCfg.inverse : __THICCUMS__ && r.col === 'thiccums' ? chainCfg.thiccums : __R3TARDS__ && r.col === 'r3tards' ? chainCfg.r3tards : __EMONAD__ && r.col === 'emonad' ? chainCfg.emonad : chainCfg.sahur}/${r.id}` : null;
  const ownerLink = chainCfg?.explorer && v ? `${chainCfg.explorer}/address/${v.owner}` : null;
  const stunts = !v ? [] : r.col === 'frok' ? [['Screenshots', v.screenshots], ['Slaps', v.slaps], ['Squeezes', v.squeezes], ['Set on fire', v.burns]] : r.col === 'sahur' ? [['Tung tung tungs', v.tungs]] : __THICCUMS__ && r.col === 'thiccums' ? [['Butt bounces', v.bounces ?? 0]] : [];
  return (
    <aside className="town-ui town-card" role="dialog" aria-label={nameOf(r)}>
      <button className="tc-close" onClick={onClose} aria-label="Close">×</button>
      <div className="tc-head">
        <img className="tc-portrait" src={portrait} alt="" />
        <div className="tc-title">
          <h2>{nameOf(r)}</h2>
          <p className="tc-sub"><span className="dot" style={{ background: meta.color }} />{meta.brand} #{r.id}</p>
          <div className="tc-chips">
            <span className={`chip chip-${mood}`}>{MOOD[mood] ?? mood}</span>
            {v?.crowned && <span className="chip chip-crown">👑 Crowned</span>}
            {neverDied && <span className="chip chip-gold">Never died</span>}
            {v && v.revives > 0 && <span className="chip">Revived {v.revives}×</span>}
          </div>
        </div>
      </div>
      {v ? (
        <>
          {v.alive && (
            <div className="tc-meters">
              {([['Food', v.food], ['Clean', v.clean], ['Fun', v.fun], ['Energy', v.energy]] as const).map(([k, n]) => (
                <div key={k} className="tc-meter"><span>{k}</span><i><b style={{ width: `${Math.max(0, Math.min(100, n))}%`, background: n < 20 ? '#E84D7F' : n < 35 ? '#F2B14A' : '#8FD16A' }} /></i><em>{Math.round(n)}</em></div>
              ))}
            </div>
          )}
          {mine && onCared && <CarePanel r={r} onDone={onCared} onSent={onSent} />}
          <div className="tc-nums">
            <div><b>{v.score.toFixed(1)}</b><span>care score</span></div>
            <div><b>{v.streak}</b><span>day streak</span></div>
            <div><b>{v.day}</b><span>{v.day === 1 ? 'day old' : 'days old'}</span></div>
          </div>
          <dl className="tc-record">
            {([['Fed', v.feeds], ['Washed', v.washes], ['Played', v.plays], ['Naps', v.naps], ['Cleaned', v.cleanups], ['Petted', v.pets], ...stunts, ['Died', v.deaths], ['Revived', v.revives]] as [string, number][]).map(([k, n]) => <div key={k}><dt>{k}</dt><dd>{n.toLocaleString()}</dd></div>)}
          </dl>
          {(worn.length > 0 || sceneOf(r.worn)) && <p className="tc-line"><span>Wearing</span>{worn.join(', ')}</p>}
          {r.last && <p className="tc-line"><span>Last</span>{DID[r.last.what] ?? r.last.what} {ago(r.last.ts)}</p>}
          <p className="tc-line"><span>Owner</span>{onOwner ? <button type="button" className="tc-owner" onClick={() => onOwner(v.owner.toLowerCase())}>{ownerName || short(v.owner)}<RoleMarks address={v.owner} /></button> : ownerLink ? <a href={ownerLink} target="_blank" rel="noreferrer">{short(v.owner)}</a> : short(v.owner)}</p>
        </>
      ) : <p className="tc-line">Reading it off the chain…</p>}
      <div className="tc-actions">
        <a className="tc-btn primary" href={petHref(r.col, r.id)}>Visit {meta.his === 'its' ? 'its' : 'his'} room</a>
        {/* Watch keeps the camera on this pet; following is for OWNERS (the owner's card, below) */}
        <button className={`tc-btn${following ? ' on' : ''}`} onClick={onFollow} title="Keep the camera on this pet">{following ? 'Watching' : 'Watch'}</button>
      </div>
      {v && onOwner && <button type="button" className="tc-btn tc-owner-btn" onClick={() => onOwner(v.owner.toLowerCase())}>Follow owner{ownerName ? ` · ${ownerName}` : ''}</button>}
      <p className="tc-foot"><i className="live" />Live from Monad{tokenLink && <> · <a href={tokenLink} target="_blank" rel="noreferrer">the token</a></>}</p>
    </aside>
  );
});

// ------------------------------------------------------------------ the ticker
export type Tick = { id: number; at: number; icon: string; text: string; key: string | null };
export function tickFor(e: LiveEvent, name: (col: string, id: number) => string, id: number): Tick | null {
  const at = Date.now();
  const n = 'id' in e && 'col' in e ? name(e.col, e.id) : '';
  const key = 'id' in e && 'col' in e ? `${e.col}:${e.id}` : null;
  const t = (icon: string, text: string): Tick => ({ id, at, icon, text, key });
  switch (e.kind) {
    case 'care': return ({ feed: t('🍜', `${n} had dinner`), play: t('🧶', `${n} played`), wash: t('🫧', `${n} had a bath`), sleep: t('🌙', `${n} went to bed`), clean: t('🧹', `${n}'s mess got cleaned up`), wake: t('☀️', `${n} woke up`), revive: t('✨', `${n} came back to life`), name: null } as Record<string, Tick | null>)[e.what] ?? null;
    case 'pet': return t('💗', `${n} got petted`);
    case 'stunt': return ({ screenshot: t('📸', `${n} took a screenshot`), slap: t('🖐️', `${n} got slapped`), squeeze: t('🦾', `${n} got squeezed`), burn: t('🔥', `${n} caught fire`), tung: t('🪵', `${n}: tung tung tung`), ...(__THICCUMS__ ? { bounce: t('🦭', `${n} bounced that butt`) } : {}) } as Record<string, Tick>)[e.what] ?? null;
    case 'named': return t('🏷️', `Meet ${e.name || n}`);
    case 'mint': return t('🎉', `${PETS[e.col].kind === 'cat' ? 'A cat' : PETS[e.col].kind === 'frok' ? 'A new inversebrah' : __THICCUMS__ && e.col === 'thiccums' ? 'A new Thiccums' : __R3TARDS__ && e.col === 'r3tards' ? 'A new r3tard' : __EMONAD__ && e.col === 'emonad' ? 'A new Emonad' : 'A new Sahur'} moved to Emotown`);
    case 'burn': return e.emo >= 1 ? t('🔥', `${Math.round(e.emo).toLocaleString()} EMO burned`) : null;
    case 'claim': return t('🎁', `Someone got the ${ITEM_LABEL[e.item] ?? 'new item'}`);
    case 'dress': return e.on ? t('✨', `${n} put on the ${ITEM_LABEL[e.item] ?? 'item'}`) : null;
    case 'crown': return e.won ? t('👑', `${n} won a crown`) : null;
  }
  return null;
}
/** A fight decided in the ring (fight/town/FightTown.tsx reads the Fought logs); a tap finds the winner. */
export function tickForFight(f: FightResult, id: number): Tick {
  return { id, at: Date.now(), icon: '🥊', text: `${f.winner.name} beat ${f.loser.name} · won ${f.payout} MON`, key: `${f.winner.col}:${f.winner.id}` };
}
export const Ticker = memo(function Ticker({ items, onPick }: { items: Tick[]; onPick: (t: Tick) => void }) {
  return (
    <div className="town-ui town-ticker" aria-live="polite">
      {items.slice(0, 4).map((t, i) => (
        <button key={t.id} className="tk" style={{ opacity: 1 - i * 0.2 }} onClick={() => onPick(t)} disabled={!t.key}>
          <span className="tk-icon">{t.icon}</span><span className="tk-text">{t.text}</span>
        </button>
      ))}
    </div>
  );
});

// ------------------------------------------------------------------ the map
export const Minimap = memo(function Minimap({ sim, cam, me, onJump }: { sim: TownSim; cam: Camera; me: string | null; onJump: (x: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = canvas.current; const t = track.current; if (!c || !t) return;
      const w = t.clientWidth; const h = t.clientHeight; const dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d'); if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const now = Date.now();
      const mine: { x: number; y: number }[] = [];
      for (const r of sim.residents.values()) {
        const p = sim.pos(r, now); const x = (p.x / TOWN.w) * w; const y = 4 + ((p.y - 762) / 170) * (h - 8);
        if (me && r.view?.owner.toLowerCase() === me) { mine.push({ x, y }); continue; }
        g.fillStyle = r.view && !r.view.alive ? 'rgba(234, 198, 234, 0.55)' : PETS[r.col].color;
        g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
      }
      for (const m of mine) { g.fillStyle = '#FFF4DA'; g.strokeStyle = '#E84D7F'; g.lineWidth = 2; g.beginPath(); g.arc(m.x, m.y, 4, 0, Math.PI * 2); g.fill(); g.stroke(); }
    };
    const place = () => { const v = view.current; if (!v) return; v.style.left = `${(cam.x / TOWN.w) * 100}%`; v.style.width = `${(cam.viewW / TOWN.w) * 100}%`; };
    const off = cam.subscribe(place); place(); draw();
    const i = setInterval(draw, 500);
    return () => { off(); clearInterval(i); };
  }, [sim, cam, me]);
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = track.current; if (!t) return;
    const r = t.getBoundingClientRect(); onJump(((e.clientX - r.left) / r.width) * TOWN.w);
  };
  return (
    <div className="town-ui town-map">
      <div ref={track} className="map-track" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={(e) => { if (e.buttons) scrub(e); }}>
        {LANDMARKS.map((l) => <span key={l.id} className="map-mark" style={{ left: `${(((l.x0 + l.x1) / 2) / TOWN.w) * 100}%` }} title={`${l.name}: ${l.blurb}`}>{l.icon}</span>)}
        <canvas ref={canvas} className="map-dots" />
        <div ref={view} className="map-view" />
      </div>
    </div>
  );
});

// ------------------------------------------------------------------ the finder
export function Finder({ sim, version, onPick }: { sim: TownSim; version: number; onPick: (r: Resident) => void }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const hits = useMemo(() => {
    void version;
    const s = q.trim().toLowerCase().replace(/^#/, ''); if (!s) return [];
    const out: Resident[] = [];
    for (const r of sim.residents.values()) {
      if (nameOf(r).toLowerCase().includes(s) || String(r.id) === s) out.push(r);
      if (out.length >= 8) break;
    }
    return out;
  }, [q, sim, version]);
  if (!open) return <button className="town-ui town-find-btn" onClick={() => setOpen(true)} aria-label="Find a pet"><span aria-hidden>⌕</span><span className="lbl"> Find a pet</span></button>;
  return (
    <div className="town-ui town-find">
      <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or #number" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && hits[0]) { onPick(hits[0]); setOpen(false); setQ(''); } }} />
      <button className="tf-x" onClick={() => { setOpen(false); setQ(''); }} aria-label="Close">×</button>
      {hits.length > 0 && (
        <ul>{hits.map((r) => <li key={r.key}><button onClick={() => { onPick(r); setOpen(false); setQ(''); }}><span className="dot" style={{ background: PETS[r.col].color }} />{nameOf(r)} <em>{PETS[r.col].brand} #{r.id}</em></button></li>)}</ul>
      )}
      {q.trim() && hits.length === 0 && <p className="tf-none">Nobody by that name is in town today.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ your pets
/**
 * Your pets (operator, 2026-09-27: "needs to be a better way for users to see all their pets in town ... the star
 * cycles"): the star opens a list of every pet of yours in town, each with its face and where it is right now (tap:
 * the camera flies to it, and one indoors comes out), and below, your pets that are not in town today (read from the
 * chain when the list opens), each linking to its room.
 */
export function MyPets({ sim, me, version, onPick }: { sim: TownSim; me: string; version: number; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const mine = useMemo(() => { void version; return [...sim.residents.values()].filter((r) => r.view?.owner.toLowerCase() === me).sort((a, b) => (a.inside ? 1 : 0) - (b.inside ? 1 : 0) || nameOf(a).localeCompare(nameOf(b))); }, [sim, me, version]);
  const { pets } = usePets(open ? me : null);
  const away = pets?.filter((v) => !sim.residents.has(keyOf(v.col, v.id))) ?? null;
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  const root = typeof document !== 'undefined' ? document.querySelector('.town') : null;
  const label = mine.length === 0 ? 'My pets' : mine.length === 1 ? 'My pet' : `My pets (${mine.length})`;
  return (
    <>
      <button className={`town-find-btn town-mine-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={label}><span aria-hidden>★</span><span className="lbl"> {label}</span></button>
      {open && root && createPortal(
        <div className="town-ui so-pop town-mine" role="dialog" aria-label="Your pets">
          <header><h2>Your pets</h2><button className="tc-close" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
          {mine.length > 0 ? (
            <ul className="town-mine-list">
              {mine.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => { setOpen(false); onPick(r.key); }}>
                    <Avatar pet={{ col: r.col, id: r.id }} view={r.view} worn={r.worn} size={42} />
                    <span className="tm-text"><b>{nameOf(r)}</b><small>{whereOf(sim, r)}</small></span>
                    <span className="tm-go tm-go-btn" aria-hidden>Go</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="so-empty">None of your pets is in town today.</p>}
          {away === null && <p className="tm-note">Looking for the rest of your pets…</p>}
          {away && away.length > 0 && (
            <>
              <h3 className="tm-sub">Not in town today</h3>
              <p className="tm-note">A pet comes to town on a day it is cared for, petted or named.</p>
              <ul className="town-mine-list">
                {away.map((v) => (
                  <li key={keyOf(v.col, v.id)}>
                    <a href={petHref(v.col, v.id)}>
                      <Avatar pet={{ col: v.col, id: v.id }} view={v} size={42} />
                      <span className="tm-text"><b>{v.name || fallbackName(v.col, v.id)}</b><small>{v.alive ? 'Visit its room' : 'A ghost. Visit its room'}</small></span>
                      <span className="tm-go" aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>,
        root,
      )}
    </>
  );
}
/** Where a pet is right now, in words. */
function whereOf(sim: TownSim, r: Resident): string {
  if (r.inside) { const l = LANDMARK[r.inside]; return `${l.icon} ${l.inside ? `${l.inside[0]!.toUpperCase()}${l.inside.slice(1)}` : 'Inside'} · ${l.name}`; }
  if (r.goingIn) return `Heading into ${LANDMARK[r.goingIn].name}`;
  const x = sim.pos(r).x;
  const l = LANDMARKS.find((m) => x >= m.x0 && x < m.x1) ?? LANDMARKS[0]!;
  return `${l.icon} On the street · ${l.name}`;
}

// ------------------------------------------------------------------ the doors
/** Over every door: how many are inside. Tap it for their names; tap a name and that pet comes out. */
export const Doors = memo(function Doors({ sim, version, onPick }: { sim: TownSim; version: number; onPick: (key: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  void version;
  // a press anywhere but on a door's tag or list closes the list (on a phone its own button can end up far from the thumb)
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.door-tag')) setOpen(null); };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open]);
  return (
    <>
      {LANDMARKS.filter((l) => l.door !== undefined).map((l) => {
        const inside = sim.insideOf(l.id);
        if (!inside.length) return null;
        return (
          <div key={l.id} className="town-ui door-tag" style={{ left: l.door, top: l.doorY ?? BASE - 60 }}>
            <button onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>{l.icon} {inside.length} {l.inside}</button>
            {open === l.id && (
              <ul className="door-list">
                {inside.slice(0, 40).map((r) => <li key={r.key}><button onClick={() => { setOpen(null); onPick(r.key); }}><span className="dot" style={{ background: PETS[r.col].color }} />{nameOf(r)}</button></li>)}
                {inside.length > 40 && <li className="more">and {inside.length - 40} more</li>}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
});
