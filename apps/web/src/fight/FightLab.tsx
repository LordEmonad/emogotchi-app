/**
 * The Fight Club lab, at /fightlab (DEV ONLY, the sandbox's): two pets in the ring, any against any, a whole fight from
 * a seed and a chosen winner, and every beat on its own button, for the operator to review. `?l=cat&r=sahur&w=0&seed=…`
 * sets it up; `window.__fight` (dev) is { director, fighters, plan } for the headless checks.
 */
import { useMusic } from '../sound/useMusic';
import { useEffect, useMemo, useState } from 'react';
import type { Costume } from '../pet/Pet';
import type { FightChar } from './fightDirector';
import { Arena } from './Arena';
import { planFight, type Fighter, type FightDirector } from './fightDirector';
import './arena.css';

const NAMES: Record<FightChar, string> = { cat: 'Cat', frog: 'inversebrah', sahur: 'Tung Tung Tung Sahur' };
const OUTFITS: (Costume | 'none')[] = ['none', 'witch', 'pumpkin', 'mummy', 'zombie'];
const randomSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

export function FightLab() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const pick = (v: string | null, d: FightChar): FightChar => (v === 'cat' || v === 'frog' || v === 'sahur' ? v : d);
  const [left, setLeft] = useState<FightChar>(pick(q.get('l'), 'cat'));
  const [right, setRight] = useState<FightChar>(pick(q.get('r'), 'sahur'));
  const [winner, setWinner] = useState<'0' | '1' | 'seed'>((q.get('w') as '0' | '1' | null) ?? 'seed');
  const [seed, setSeed] = useState(q.get('seed') ?? randomSeed());
  const [d, setD] = useState<FightDirector | null>(null);
  const [fighters, setFighters] = useState<[Fighter, Fighter] | null>(null);
  const [busy, setBusy] = useState(false);
  useMusic({ place: 'tavern', fight: busy });
  const [looks, setLooks] = useState({ belt: [false, false], eye: [false, false] });
  const [crown, setCrown] = useState([false, false]);
  const [outfit, setOutfit] = useState<(Costume | 'none')[]>(['none', 'none']);

  // the chain's rule: the winner is random % 2 (0 = the challenger, on the left)
  const won: 0 | 1 = winner === 'seed' ? (Number(BigInt(`0x${seed.replace(/^0x/, '') || '0'}`) % 2n) as 0 | 1) : (Number(winner) as 0 | 1);
  const plan = useMemo(() => planFight(seed, won), [seed, won]);

  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __fight?: unknown }).__fight = { director: d, fighters, plan }; }, [d, fighters, plan]);
  useEffect(() => { fighters?.forEach((f, i) => f.rig.setCrown(crown[i]!)); }, [fighters, crown]);
  useEffect(() => { fighters?.forEach((f, i) => { const o = outfit[i]; f.rig.setCostumes(o && o !== 'none' ? [o] : []); }); }, [fighters, outfit]);

  const run = async (f: () => Promise<unknown>) => { if (busy || !d) return; setBusy(true); try { await f(); } finally { setBusy(false); } };
  const look = (kind: 'belt' | 'eye', i: 0 | 1) => {
    if (!fighters) return;
    const next = { belt: [...looks.belt], eye: [...looks.eye] }; next[kind][i] = !next[kind][i];
    setLooks(next);
    if (kind === 'belt') fighters[i].looks.setBelt(next.belt[i]!); else fighters[i].looks.setBlackEye(next.eye[i]!);
  };
  const Chars = ({ v, set }: { v: FightChar; set: (c: FightChar) => void }) => (
    <div className="fl-row">{(['cat', 'frog', 'sahur'] as const).map((c) => <button key={c} className={`chip-btn${v === c ? ' is-on' : ''}`} onClick={() => set(c)}>{NAMES[c]}</button>)}</div>
  );

  return (
    <div className="page fl-page">
      <h1 className="fl-title">Fight Club lab <small>sandbox · nothing here is live</small></h1>
      <div className="fl-grid">
        <div className="fl-ring">
          <Arena key={`${left}-${right}`} left={left} right={right} onDirector={(dd, ff) => { setD(dd); setFighters(ff); setLooks({ belt: [false, false], eye: [false, false] }); }} />
          <div className="fl-actions">
            <button className="btn btn-pink" disabled={busy || !d} onClick={() => void run(() => d!.play(plan))}>Fight!</button>
            <button className="btn btn-ghost" disabled={busy || !d} onClick={() => { d?.reset(); setLooks({ belt: [false, false], eye: [false, false] }); }}>Reset</button>
          </div>
        </div>
        <div className="fl-panel">
          <section><h2>Left corner (the challenger)</h2><Chars v={left} set={setLeft} /></section>
          <section><h2>Right corner</h2><Chars v={right} set={setRight} /></section>
          <section>
            <h2>Who wins</h2>
            <div className="fl-row">
              <button className={`chip-btn${winner === 'seed' ? ' is-on' : ''}`} onClick={() => setWinner('seed')}>By the random number ({won === 0 ? 'left' : 'right'})</button>
              <button className={`chip-btn${winner === '0' ? ' is-on' : ''}`} onClick={() => setWinner('0')}>Left</button>
              <button className={`chip-btn${winner === '1' ? ' is-on' : ''}`} onClick={() => setWinner('1')}>Right</button>
            </div>
            <div className="fl-row fl-seed"><code title={seed}>{seed.slice(0, 18)}…</code><button className="chip-btn" onClick={() => setSeed(randomSeed())}>New random number</button></div>
            <p className="fl-plan">{plan.blows.map((b, i) => <span key={i} className={b.big ? 'big' : b.land ? 'hit' : 'miss'}>{b.by === 0 ? 'L' : 'R'} {b.big ? 'FINISHER' : b.land ? 'hits' : 'misses'}</span>)}</p>
          </section>
          <section>
            <h2>One beat at a time</h2>
            <div className="fl-row">
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.intro())}>Walk in</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.blow({ by: 0, land: true }))}>Left hits</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.blow({ by: 1, land: true }))}>Right hits</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.blow({ by: 0, land: false }))}>Left misses</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.blow({ by: 1, land: false }))}>Right misses</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.finish(0))}>Left KOs</button>
              <button className="chip-btn" disabled={busy} onClick={() => void run(() => d!.finish(1))}>Right KOs</button>
            </div>
          </section>
          <section>
            <h2>Looks</h2>
            <div className="fl-row">
              <button className={`chip-btn${looks.belt[0] ? ' is-on' : ''}`} onClick={() => look('belt', 0)}>Belt left</button>
              <button className={`chip-btn${looks.belt[1] ? ' is-on' : ''}`} onClick={() => look('belt', 1)}>Belt right</button>
              <button className={`chip-btn${looks.eye[0] ? ' is-on' : ''}`} onClick={() => look('eye', 0)}>Black eye left</button>
              <button className={`chip-btn${looks.eye[1] ? ' is-on' : ''}`} onClick={() => look('eye', 1)}>Black eye right</button>
              <button className={`chip-btn${crown[0] ? ' is-on' : ''}`} onClick={() => setCrown([!crown[0], crown[1]!])}>Crown left</button>
              <button className={`chip-btn${crown[1] ? ' is-on' : ''}`} onClick={() => setCrown([crown[0]!, !crown[1]])}>Crown right</button>
            </div>
            {([0, 1] as const).map((i) => (
              <div key={i} className="fl-row"><span className="fl-lab">{i === 0 ? 'Left' : 'Right'} outfit</span>
                {OUTFITS.map((o) => <button key={o} className={`chip-btn${outfit[i] === o ? ' is-on' : ''}`} onClick={() => { const n = [...outfit]; n[i] = o; setOutfit(n); }}>{o}</button>)}
              </div>
            ))}
          </section>
        </div>
      </div>
      <style>{`
        .fl-page { max-width: 1280px; padding-top: 24px; }
        .fl-title { font-size: 26px; margin: 0 0 16px; } .fl-title small { font-size: 13px; font-weight: 600; color: rgba(248,248,255,.5); margin-left: 8px; }
        .fl-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
        @media (max-width: 900px) { .fl-grid { grid-template-columns: 1fr; } }
        .fl-actions { display: flex; gap: 10px; margin-top: 12px; }
        .fl-panel section { margin-bottom: 16px; } .fl-panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: rgba(248,248,255,.55); margin: 0 0 8px; }
        .fl-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; align-items: center; }
        .fl-lab { font-size: 12px; color: rgba(248,248,255,.6); margin-right: 4px; }
        .fl-seed code { font-size: 12px; color: rgba(248,248,255,.7); }
        .fl-plan { display: flex; flex-wrap: wrap; gap: 4px; font-size: 12px; margin: 6px 0 0; }
        .fl-plan span { padding: 3px 7px; border-radius: 8px; background: rgba(248,248,255,.07); } .fl-plan .hit { background: rgba(232,77,127,.2); } .fl-plan .big { background: #E84D7F; color: #1a0620; font-weight: 800; }
      `}</style>
    </div>
  );
}
