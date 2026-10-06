/**
 * Emonadgotchi's lab, at /emonadgotchi: LOCAL ONLY. App.tsx loads it only in dev builds (a production build has neither the
 * route nor this chunk), and nothing links to it. Nothing on chain, no wallet, no collection.
 *
 * Emonad (the $EMO mascot, his own drawing's front view) on the pet rig, in a real room: a button for every animation, a
 * chip for every item in the shop (the six outfits one at a time, the three head pieces one at a time, the Star of David,
 * the lip piercings; the emo hair and the wristbands are his own look already), the six rooms, the four toys, the four Pet
 * moves, crown / night / sad / grubby, and under the stage the nine wallet moods drawn live by the rig in what he wears.
 *
 * `?costume=witch|pumpkin|mummy|zombie|bisht|emofit&head=kippah|keffiyeh|beanie&star=1&lip=1&scene=plain|halloween|backrooms|kotel
 *  |majlis|emoroom&toy=yarn|dreidel|darbuka|guitar&pet=pet|kapparot|falcon|selfie&crown=1&night=1&sad=1&dirty=1&moods=0&reel=1`
 * sets it up from the URL (what the headless checks drive); `window.__lab = { emonad }` is the director.
 *
 * The Showreel (or `?reel=1`): one loop through every item, room, toy, Pet move and action, a look and a room per beat
 * (reel.ts REEL), round and round until it is switched off. For seeing every combination in one go, and for filming.
 */
import './register';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../ui/Header';
import { SiteFooter } from '../ui/SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director, PetMove, Toy } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import { Pet, OUTFITS, type Costume, type PetRig } from '../pet/Pet';
import { PROPS } from '../scene/props';
import { EMPTY_WALLET } from '../wallet';
import { NFT_STATES, NFT_STATE_LABEL, poseState, type NftState } from '../ui/NftArt';
import { ACTS, REEL, act, wait, type Act, type Beat, type Head } from './reel';

const OUTFIT_LABEL: Record<string, string> = { witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie', bisht: 'Bisht', emofit: 'Emo fit' };
const HEADS: { key: Head; label: string }[] = [{ key: 'kippah', label: 'Kippah' }, { key: 'keffiyeh', label: 'Keffiyeh' }, { key: 'beanie', label: 'Beanie' }];
const ROOMS: { key: SceneName | null; label: string }[] = [
  { key: null, label: 'Plain room' }, { key: 'halloween', label: 'Spooky theme' }, { key: 'backrooms', label: 'Backrooms' },
  { key: 'kotel', label: 'Western Wall' }, { key: 'majlis', label: 'Majlis' }, { key: 'emoroom', label: 'Emo bedroom' },
];
const TOYS: { key: Toy; label: string }[] = [{ key: 'yarn', label: 'Ball' }, { key: 'dreidel', label: 'Dreidel' }, { key: 'darbuka', label: 'Darbuka' }, { key: 'guitar', label: 'Guitar' }];
const MOVES: { key: PetMove; label: string }[] = [{ key: 'pet', label: 'Plain pet' }, { key: 'kapparot', label: 'Kapparot hen' }, { key: 'falcon', label: 'Falcon' }, { key: 'selfie', label: 'Mirror selfie' }];
const isOutfit = (s: string | null): s is Costume => !!s && (OUTFITS as readonly string[]).includes(s);
const isHead = (s: string | null): s is Exclude<Head, null> => s === 'kippah' || s === 'keffiyeh' || s === 'beanie';

/** Everything he has, back to back, tidying up after the actions that leave something behind. */
async function playAll(d: Director, setBusy: (l: string | null) => void) {
  const seq = ACTS.filter((a) => !['Wake', 'Clean', 'Revive'].includes(a.label));
  setBusy('Everything');
  try {
    for (const a of seq) {
      await a.run(d);
      if (a.label === 'Poop') await d.clean();
      if (a.label === 'Sleep') { await wait(1200); await d.wake(); }
      if (a.label === 'Die') { await wait(1200); await d.revive(); }
      await wait(500);
    }
  } finally { setBusy(null); }
}

/** One wallet mood, drawn live (the portrait's pose, NftArt's poseState). He is tall: the tile shows all of him. */
const SIZE = 1024; const W = 640; const FLOOR = 900;
function MoodTile({ state, crown, costume, onReady }: { state: NftState; crown: boolean; costume?: string; onReady?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [rig, setRig] = useState<PetRig | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setK(e.contentRect.width / SIZE); });
    ro.observe(el); setK(el.clientWidth / SIZE);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!rig) return;
    rig.busy = true;
    poseState(rig, state, crown, costume);
    const t = setTimeout(() => { rig.still(); onReady?.(); }, 1600);
    return () => clearTimeout(t);
  }, [rig, state, crown, costume, onReady]);
  const dead = state === 'dead';
  const w = Math.round(W * (costume?.includes('witch') ? 0.9 : 1)); const h = w * 230 / 200;
  return (
    <div ref={box} className="nft-art" data-state={state} data-night={state === 'sleeping' ? 'on' : 'off'} style={{ aspectRatio: '1 / 1' }}>
      <div className="nft-world" style={{ width: SIZE, height: SIZE, transform: `scale(${k})` }}>
        <div className="nft-wall" /><div className="nft-dots" />
        {state === 'sleeping' && <div className="nft-moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />}
        <div className="nft-floor" style={{ top: FLOOR - 40 }} />
        <div className="nft-rug" style={{ top: FLOOR - 6 }} />
        <div className="nft-cat" style={{ width: w, height: h, left: (SIZE - w) / 2, top: FLOOR - h * (212 / 230) + (dead ? -40 : 0) }}>
          <Pet onRig={setRig} character="emonad" style={{ width: '100%', height: '100%' }} />
        </div>
        {dead && <div className="nft-prop" style={{ left: 512 + 230 - 75, top: FLOOR + 26 - 161, width: 150, height: 161 }} dangerouslySetInnerHTML={{ __html: PROPS.grave }} />}
        {state === 'grubby' && <div className="nft-prop" style={{ left: 512 - 280 - 75, top: FLOOR + 22 - 135, width: 150, height: 135 }} dangerouslySetInnerHTML={{ __html: PROPS.poop }} />}
        {(state === 'hungry' || state === 'bored') && (
          <div className="nft-thought" style={{ left: 512 + 200, top: 120 }}>
            <div className="thought-cloud" dangerouslySetInnerHTML={{ __html: PROPS.thought }} />
            <div className="thought-icon" dangerouslySetInnerHTML={{ __html: PROPS[state === 'hungry' ? 'bowl' : 'yarn'] }} />
          </div>
        )}
        {state === 'happy' && <><div className="nft-prop" style={{ left: 512 + 190, top: 170, width: 70, height: 70 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /><div className="nft-prop" style={{ left: 512 + 260, top: 110, width: 48, height: 48 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /></>}
      </div>
    </div>
  );
}

/** His card, for the art tools: /emonadgotchi?card=<mood>[&crown=1][&costume=a,b][&bare=1], the same 1024 frame and ready flag the other pets' tools wait for. */
const CARD = new URLSearchParams(location.search);
const cardState = CARD.get('card') as NftState | null;
const onCardReady = () => { (window as unknown as { __card_ready?: boolean }).__card_ready = true; };
function EgCard({ state }: { state: NftState }) {
  return <div className={`card-only ${CARD.has('bare') ? 'is-bare' : ''}`}><MoodTile state={state} crown={CARD.has('crown')} costume={CARD.get('costume') ?? undefined} onReady={onCardReady} /></div>;
}

export function EgLab() {
  return cardState && (NFT_STATES as readonly string[]).includes(cardState) ? <EgCard state={cardState} /> : <EgLabPage />;
}

function EgLabPage() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [d, setD] = useState<Director | null>(null);
  const [outfit, setOutfit] = useState<Costume | null>(() => { const v = params.get('costume'); return isOutfit(v) ? v : null; });
  const [head, setHead] = useState<Head>(() => { const v = params.get('head'); return isHead(v) ? v : null; });
  const [star, setStar] = useState(params.get('star') === '1');
  const [lip, setLip] = useState(params.get('lip') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => { const v = params.get('scene'); return v && v !== 'plain' && ROOMS.some((r) => r.key === v) ? (v as SceneName) : null; });
  const [toy, setToy] = useState<Toy>(() => { const v = params.get('toy'); return TOYS.some((t) => t.key === v) ? (v as Toy) : 'yarn'; });
  const [petMove, setPetMove] = useState<PetMove>(() => { const v = params.get('pet'); return MOVES.some((m) => m.key === v) ? (v as PetMove) : 'pet'; });
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [night, setNight] = useState(params.get('night') === '1');
  const [sad, setSad] = useState(params.get('sad') === '1');
  const [dirty, setDirty] = useState(params.get('dirty') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const [busy, setBusy] = useState<string | null>(null);
  // the showreel: `reel` is the switch as shown, `reelOn` the switch as the loop reads it, `beat` where the loop is
  const [reel, setReel] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const reelOn = useRef(false);
  const dRef = useRef<Director | null>(null); dRef.current = d;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown }).__lab = { emonad: d };
    (window as unknown as { __pet?: unknown }).__pet = d ? { director: d, dispatch: () => {} } : undefined;
  }, [d]);
  const worn = useMemo<Costume[]>(() => [...(outfit ? [outfit] : []), ...(head ? [head as Costume] : []), ...(star ? ['starofdavid' as const] : []), ...(lip ? ['piercings' as const] : [])], [outfit, head, star, lip]);
  useEffect(() => { d?.setCostumes(worn); }, [d, worn]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  useEffect(() => { d?.setSad(sad); }, [d, sad]);
  useEffect(() => { d?.setDirty(dirty); }, [d, dirty]);
  useEffect(() => { d?.setToy(toy); }, [d, toy]);
  useEffect(() => { d?.setPetMove(petMove); }, [d, petMove]);
  const portraitCostume = worn.join(',') || undefined;

  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };
  const dress = (b: Beat) => {
    setOutfit(b.outfit ?? null); setHead(b.head ?? null); setStar(!!b.star); setLip(!!b.lip); setCrown(!!b.crown);
    setScene(b.scene ?? null); setNight(!!b.night); setToy(b.toy ?? 'yarn'); setPetMove(b.pet ?? 'pet'); setSad(false); setDirty(false);
  };
  /** Round and round the beats until the switch goes off; a move in progress is always finished (and tidied) first. */
  const startReel = async () => {
    if (reelOn.current || !dRef.current) return;
    reelOn.current = true; setReel(true); setBusy('Showreel');
    const tell = (window as unknown as { __reel?: { beat: number; loops: number } }).__reel = { beat: 0, loops: 0 };
    try {
      for (let i = 0; reelOn.current; i = (i + 1) % REEL.length) {
        const b = REEL[i]!;
        setBeat(i); tell.beat = i; dress(b);
        await wait(900);                                   // (the look and the room are on, their fades done)
        for (const name of b.acts) {
          const dd = dRef.current;
          if (!reelOn.current || !dd) break;
          await act(dd, name);
          await wait(450);
        }
        if (i === REEL.length - 1) tell.loops += 1;
      }
    } catch { /* the lab just shows it */ } finally { reelOn.current = false; setReel(false); setBeat(null); setBusy(null); }
  };
  const stopReel = () => { reelOn.current = false; setReel(false); };
  useEffect(() => () => { reelOn.current = false; }, []);
  useEffect(() => { if (d && params.get('reel') === '1') void startReel(); }, [d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const reelNote = (b: Beat) => [
    b.outfit ? (OUTFIT_LABEL[b.outfit] ?? b.outfit) : null, b.head ? HEADS.find((h) => h.key === b.head)?.label : null,
    b.star ? 'Star of David' : null, b.lip ? 'lip piercings' : null, b.crown ? 'crowned' : null,
  ].filter(Boolean).join(' + ') || 'As he is';
  const label = (a: Act) => (a.label === 'Play' ? `Play (${TOYS.find((t) => t.key === toy)?.label.toLowerCase()})` : a.label === 'Pet' && petMove !== 'pet' ? `Pet (${MOVES.find((m) => m.key === petMove)?.label.toLowerCase()})` : a.label);

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab sahur-lab seal-lab eg-lab">
        <h1>Emonadgotchi</h1>
        <p className="lead">Emonad, the $EMO mascot, as an Emogotchi pet: his own drawing on the pet rig, every animation the pets have done his way, and every item in the shop on him. The emo hair and the wristbands are already his look. Press anything.</p>
        <div className="lab-controls hlab-controls">
          <span className="judaica-mix-label">Outfit:</span>
          {OUTFITS.map((c) => <button key={c} className={`chip-btn ${outfit === c ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === c ? null : c))}>{OUTFIT_LABEL[c] ?? c}</button>)}
          <span className="hlab-sep" />
          <span className="judaica-mix-label">Head:</span>
          {HEADS.map((h) => <button key={h.key} className={`chip-btn ${head === h.key ? 'is-on' : ''}`} onClick={() => setHead((v) => (v === h.key ? null : h.key))} title="One head piece at a time">{h.label}</button>)}
          <span className="hlab-sep" />
          <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
          <button className={`chip-btn ${lip ? 'is-on' : ''}`} onClick={() => setLip((v) => !v)}>Lip piercings</button>
        </div>
        <div className="lab-controls hlab-controls">
          <span className="judaica-mix-label">Room:</span>
          {ROOMS.map((r) => <button key={r.label} className={`chip-btn ${scene === r.key ? 'is-on' : ''}`} onClick={() => setScene(r.key)}>{r.label}</button>)}
        </div>
        <div className="lab-controls hlab-controls">
          <span className="judaica-mix-label">Play:</span>
          {TOYS.map((t) => <button key={t.label} className={`chip-btn ${toy === t.key ? 'is-on' : ''}`} onClick={() => setToy(t.key)}>{t.label}</button>)}
          <span className="hlab-sep" />
          <span className="judaica-mix-label">Pet:</span>
          {MOVES.map((m) => <button key={m.label} className={`chip-btn ${petMove === m.key ? 'is-on' : ''}`} onClick={() => setPetMove(m.key)}>{m.label}</button>)}
        </div>
        <div className="lab-controls hlab-controls">
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
          <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
          <button className={`chip-btn ${sad ? 'is-on' : ''}`} onClick={() => setSad((v) => !v)}>{sad ? 'Sad' : 'Content'}</button>
          <button className={`chip-btn ${dirty ? 'is-on' : ''}`} onClick={() => setDirty((v) => !v)}>{dirty ? 'Grubby' : 'Clean'}</button>
          <button className={`chip-btn ${moods ? 'is-on' : ''}`} onClick={() => setMoods((v) => !v)}>{moods ? 'Moods shown' : 'Moods hidden'}</button>
        </div>
        <section className="hlab-booth" data-character="emonad" data-busy={busy ?? ''}>
          <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene} character="emonad" lite={params.get('lite') === '1'} /></div>
          <div className="lab-actions">
            {ACTS.map((a) => (
              <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{label(a)}</button>
            ))}
            <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
            <button className={`btn btn-sm ${reel ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || (!!busy && busy !== 'Showreel')} onClick={() => (reel ? stopReel() : void startReel())}
              title="Every item, room, toy and move in one loop, a new look and room each beat, until it is switched off">
              {reel ? 'Showreel on · stop' : busy === 'Showreel' ? 'Stopping after this move…' : 'Showreel'}
            </button>
            <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
          </div>
          {beat !== null && (
            <p className="eg-reel-note">Showreel {beat + 1} of {REEL.length}: {reelNote(REEL[beat]!)} · {ROOMS.find((r) => r.key === (REEL[beat]!.scene ?? null))?.label}{REEL[beat]!.night ? ', night' : ''}</p>
          )}
        </section>
        {moods && (
          <>
            <h2>Wallet moods</h2>
            <p className="lead">The nine states a contract would pick from, drawn live by the rig in what he wears; the crown chip applies here too.</p>
            <div className="hlab-moods">
              <div className="hlab-moodset" data-character="emonad">
                <div className="lab-grid hlab-grid">
                  {NFT_STATES.map((s) => (
                    <figure key={s}>
                      <div className="hlab-tile"><MoodTile state={s} crown={crown} costume={portraitCostume} /></div>
                      <figcaption>{NFT_STATE_LABEL[s]}{crown ? ' · crowned' : ''}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
