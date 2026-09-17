import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { PropName } from '../scene/props';
import type { DirectorState } from '../scene/director';
import { MON_TO_NAME, MON_TO_REVIVE, TIME_SCALE, DAY, clockOf, dayOf, type Game, type PaidAction, need } from '../game/state';
import type { AllCounts } from '../game/chain';

export type CatTab = { id: number; name: string; alive: boolean; crowned: boolean };
type Props = {
  stage: ReactNode;
  g: Game;
  d: DirectorState;
  name: string;
  onName: (name: string) => void;
  act: (a: PaidAction | 'wake') => void;
  /** live mode: the wallet's cats, for switching between them */
  tabs?: CatTab[];
  /** our cat wears a costume, or could: one tap puts it on or takes it off (a transaction) */
  outfit?: { on: boolean; label: string; toggle: () => void | Promise<void> };
  /** the item shop, when this build has one */
  shopHref?: string;
  activeId?: number | null;
  onTab?: (id: number) => void;
  /** live mode: the "All" tab; when it is on, every button acts on every cat in the wallet */
  all?: { on: boolean; counts: AllCounts };
  onAll?: () => void;
  /** live mode: a line under the stage while a transaction is in flight, or why actions are locked */
  pending?: string | null;
  /** live mode: make a shareable picture of this cat */
  onShare?: () => void;
  shareNote?: string | null;
  /** live mode: no actions (not our cat, wrong chain, transaction in flight) */
  locked?: boolean;
  live?: boolean;
};

const BUSY_MOOD: Record<string, string> = { feed: 'eating', wash: 'bathing', play: 'playing', poop: 'busy…', clean: 'relieved', pet: 'purring', wake: 'waking up', walk: 'wandering', wander: 'wandering', rumble: 'hungry', sleep: 'dozing off', tour: 'showing off', die: 'fading…', revive: 'coming back' };
const NEED_MOOD: Record<NonNullable<ReturnType<typeof need>>, string> = { food: 'hungry', clean: 'grubby', fun: 'bored', energy: 'sleepy', poop: 'grossed out' };

export function PetView({ stage, g, d, name, onName, act, tabs = [], activeId = null, onTab, all, onAll, onShare, shareNote = null, pending = null, locked = false, live = false, outfit, shopHref }: Props) {
  const busy = d.busy !== null || locked;
  const every = all?.on ? all.counts : null;
  const dead = !g.alive;
  const n = need(g);
  const avg = (g.stats.food + g.stats.clean + g.stats.fun + g.stats.energy) / 4;
  const mood = dead ? 'gone' : g.sleeping ? 'sleeping' : d.busy ? (BUSY_MOOD[d.busy] ?? 'busy') : n ? NEED_MOOD[n] : avg > 78 ? 'happy' : avg > 55 ? 'content' : 'meh';
  const day = dayOf(g.t);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const valid = (s: string) => s.trim().length > 0 && bytes(s.trim()) <= 32 && s.trim() !== name;
  const commit = () => { const next = draft.trim(); if (!valid(next)) return; setEditing(false); onName(next); };

  return (
    <main className="petview">
      {tabs.length > 1 && (
        <div className="cat-tabs" role="tablist" aria-label="Your cats">
          {all && <button role="tab" aria-selected={all.on} className={`cat-tab cat-tab-all ${all.on ? 'is-on' : ''}`} onClick={onAll}>All <span className="tnum">· {all.counts.total}</span></button>}
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === activeId} className={`cat-tab ${t.id === activeId && !all?.on ? 'is-on' : ''} ${t.alive ? '' : 'is-dead'}`} onClick={() => onTab?.(t.id)}>
              {t.crowned && <span className="cat-tab-crown" aria-label="wears the crown">♛</span>}<span className="tnum">#{t.id}</span>{t.name && <span className="cat-tab-name">{t.name}</span>}
            </button>
          ))}
        </div>
      )}
      <div className={`shell ${dead ? 'is-dead' : ''}`}>{stage}</div>
      {pending && <p className={`pending-line ${locked ? '' : 'is-info'}`} aria-live="polite">{pending}</p>}

      <div className="nameplate">
        {editing ? (
          <span className="name-edit">
            <input className="name-input" autoFocus value={draft} maxLength={32} placeholder="Name your cat" onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
            <button className="name-ok" onMouseDown={(e) => e.preventDefault()} onClick={commit} disabled={!valid(draft)} title={bytes(draft.trim()) > 32 ? 'Too long: names are 32 bytes on chain' : undefined}>Name it · {MON_TO_NAME} MON</button>
            <button className="name-cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)}>✕</button>
          </span>
        ) : (
          <button className="name-btn" onClick={() => { setDraft(name); setEditing(true); }} disabled={dead || locked} title={name ? `Rename · ${MON_TO_NAME} MON` : `Name your cat · ${MON_TO_NAME} MON`}>
            {name || <span className="name-empty">{locked ? 'Unnamed' : 'Name your cat'}</span>}{!locked && <span className="name-pen" aria-hidden>✎</span>}{!name && !locked && <span className="name-cost">{MON_TO_NAME} MON</span>}
          </button>
        )}
        <span className="name-sep">·</span>
        <span className="name-day tnum" title={live ? 'Days since this cat\'s clock started' : `Demo clock: one day passes every ${Math.round(DAY / TIME_SCALE / 60)} minutes`}>{dead && g.diedOnDay ? `Died on day ${g.diedOnDay}` : live ? `Day ${day}` : `Day ${day} · ${clockOf(g.t)}`}</span>
        <span className="name-sep">·</span>
        <span className={`name-mood mood-${mood.replace(/[\s…]/g, '-')}`}>{mood}</span>
        {outfit && !dead && (<>
          <span className="name-sep">·</span>
          <button className={`outfit-btn ${outfit.on ? 'is-on' : ''}`} onClick={() => void outfit.toggle()} disabled={busy} title={outfit.on ? `Take the ${outfit.label.toLowerCase()} off · gas only` : `Put the ${outfit.label.toLowerCase()} on · gas only`}>
            <Icon name="heart" size={12} /> {outfit.on ? `${outfit.label} on` : `Wear ${outfit.label.toLowerCase()}`}
          </button>
        </>)}
        {!outfit && shopHref && live && !dead && (<>
          <span className="name-sep">·</span>
          <a className="outfit-link" href={shopHref}>Items</a>
        </>)}
      </div>

      <section className={`grid grid-cols-4 gap-2 sm:gap-3 ${dead ? 'meters-dead' : ''}`}>
        <Meter icon="bowl" label="Food" v={g.stats.food} />
        <Meter icon="sponge" label="Clean" v={g.stats.clean} />
        <Meter icon="yarn" label="Fun" v={g.stats.fun} />
        <Meter icon="moon" label="Energy" v={g.stats.energy} />
      </section>

      {dead ? (<>
        <section className="revive">
          <div className="revive-text">
            <b>{name || 'Your Emogotchi'} is gone.</b>
            <span>It went a whole day with no food and nobody came. A ghost in your wallet is not a good look.</span>
          </div>
          <button className="btn btn-pink btn-lg revive-btn" onClick={() => act('revive')} disabled={busy}>
            <Icon name="flame" size={22} /> Revive · {MON_TO_REVIVE.toLocaleString()} MON
          </button>
          <span className="revive-fine">Comes back with every meter at 60. Half of the MON buys EMO and burns it; the death stays on its record forever.</span>
        </section>
        <section className="record" aria-label="Lifetime record">
          <span className="record-title">On chain forever</span>
          <Stat n={g.record.feeds} l="feeds" /><Stat n={g.record.washes} l="washes" /><Stat n={g.record.plays} l="plays" /><Stat n={g.record.naps} l="naps" />
          <Stat n={g.record.cleanups} l="cleanups" /><Stat n={g.record.pets} l="pets" /><Stat n={g.record.deaths} l="deaths" /><Stat n={g.burnedEmo} l="EMO burned" />
        </section>
      </>) : (
        <>
          {every ? (<>
            <section className="grid grid-cols-4 gap-2 sm:gap-3">
              <Action icon="bowl" label="Feed all" onClick={() => act('feed')} disabled={busy || every.feed === 0} cost={`${every.feed} MON`} active={d.busy === 'feed'} />
              <Action icon="sponge" label="Wash all" onClick={() => act('wash')} disabled={busy || every.wash === 0} cost={`${every.wash} MON`} active={d.busy === 'wash'} />
              <Action icon="yarn" label="Play all" onClick={() => act('play')} disabled={busy || every.play === 0} cost={`${every.play} MON`} active={d.busy === 'play'} />
              <Action icon="moon" label="Sleep all" onClick={() => act('sleep')} disabled={busy || every.sleep === 0} cost={`${every.sleep} MON`} active={d.busy === 'sleep'} />
            </section>
            <div className={`clean-row ${every.clean > 0 ? 'is-on' : ''}`} aria-hidden={every.clean === 0}>
              <button onClick={() => act('clean')} disabled={busy || every.clean === 0} className="clean-btn">
                <Icon name="scoop" size={26} /><span>{every.clean === 1 ? 'Clean up the poop' : `Clean up ${every.clean} poops`}</span><span className="cost">{every.clean} MON</span>
              </button>
            </div>
          </>) : (<>
            <section className="grid grid-cols-4 gap-2 sm:gap-3">
              <Action icon="bowl" label="Feed" onClick={() => act('feed')} disabled={busy || g.sleeping} active={d.busy === 'feed'} />
              <Action icon="sponge" label="Wash" onClick={() => act('wash')} disabled={busy || g.sleeping} active={d.busy === 'wash'} />
              <Action icon="yarn" label="Play" onClick={() => act('play')} disabled={busy || g.sleeping} active={d.busy === 'play'} />
              {g.sleeping
                ? <Action icon="sun" label="Wake" onClick={() => act('wake')} disabled={busy} free active={d.busy === 'wake'} />
                : <Action icon="moon" label="Sleep" onClick={() => act('sleep')} disabled={busy || (live && g.stats.energy >= 100)} active={d.busy === 'sleep'} />}
            </section>
            <div className={`clean-row ${d.poop ? 'is-on' : ''}`} aria-hidden={!d.poop}>
              <button onClick={() => act('clean')} disabled={busy || !d.poop} className="clean-btn">
                <Icon name="scoop" size={26} /><span>Clean up the poop</span><span className="cost">1 MON</span>
              </button>
            </div>
          </>)}
          {onShare && (
            <div className="share-row">
              <button className="btn btn-sm btn-ghost" onClick={onShare}>{shareNote ?? 'Share this cat'}</button>
            </div>
          )}
          <section className="record" aria-label="Lifetime record">
            <span className="record-title">On chain forever</span>
            <Stat n={g.record.feeds} l="feeds" /><Stat n={g.record.washes} l="washes" /><Stat n={g.record.plays} l="plays" /><Stat n={g.record.naps} l="naps" />
            <Stat n={g.record.cleanups} l="cleanups" /><Stat n={g.record.pets} l="pets" /><Stat n={g.record.deaths} l="deaths" /><Stat n={g.burnedEmo} l="EMO burned" />
          </section>
          {!live && <p className="caption demo-clock">Demo clock: a day passes every {Math.round(DAY / TIME_SCALE / 60)} minutes, so you can watch a whole life. On chain, a day is a day.</p>}
          <p className="caption">Every interaction costs <span className="text-ink">1 MON</span>. 80% of it buys <span className="text-pink">EMO</span> and burns it on the spot. Petting only costs gas, and the first pet each day is +5 fun. Tap the cat.</p>
        </>
      )}
    </main>
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

function Action({ icon, label, onClick, disabled, free, active, cost }: { icon: PropName; label: string; onClick: () => void; disabled?: boolean; free?: boolean; active?: boolean; cost?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`action ${active ? 'is-active' : ''}`}>
      <span className="action-disc"><Icon name={icon} size={34} /></span>
      <span className="action-label">{label}</span>
      <span className="cost">{free ? 'free' : cost ?? '1 MON'}</span>
    </button>
  );
}
