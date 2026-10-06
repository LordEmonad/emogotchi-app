/**
 * The Thiccums lab, at /thiccums: LOCAL ONLY. App.tsx loads it only in dev builds (a production build has neither the
 * route nor this chunk), and nothing links to it. Nothing on chain, no wallet, no collection.
 *
 * Thiccums (the seal with the bouncy butt, traced line for line off thiccumsgotchi/p2TKtZDM_400x400.jpg) on the live rig,
 * in a real room: a button for every animation he has (the shared ones, his own seal ways and the butt bounce), a chip
 * for every item that is live in the shop (the five outfits one at a time, the emo hair, one head piece at a time, the
 * Star of David, the five rooms, the three toys, the three Pet moves), crown / night / sad / grubby, and under the stage
 * the nine wallet moods, drawn live by the rig in what he wears.
 *
 * `?costume=witch|pumpkin|mummy|zombie|bisht&hair=1&head=kippah|keffiyeh&star=1&scene=plain|halloween|backrooms|kotel|majlis
 *  &toy=yarn|dreidel|darbuka&pet=pet|kapparot|falcon&crown=1&night=1&sad=1&dirty=1&moods=0` sets it up from the URL (what
 * the headless checks drive); `window.__lab = { thiccums }` is the director.
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
import type { ThiccWays } from './ways';

type Act = { label: string; run: (d: Director) => Promise<unknown>; own?: boolean };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ways = (d: Director) => d.own as ThiccWays;
const ACTS: Act[] = [
  { label: 'Butt bounce', run: (d) => ways(d).bounce(), own: true },
  { label: 'Feed', run: (d) => d.feed() },
  { label: 'Play', run: (d) => d.play() },
  { label: 'Pet', run: (d) => d.pet(1) },
  { label: 'Wash', run: (d) => d.wash() },
  { label: 'Poop', run: (d) => d.poop() },
  { label: 'Clean', run: (d) => d.clean() },
  { label: 'Sleep', run: (d) => d.sleep() },
  { label: 'Wake', run: (d) => d.wake() },
  { label: 'Walk left', run: (d) => d.walk(160) },
  { label: 'Walk right', run: (d) => d.walk(440) },
  { label: 'Rumble', run: (d) => d.rumble() },
  { label: 'Yawn', run: (d) => d.yawn() },
  { label: 'Die', run: (d) => d.die() },
  { label: 'Revive', run: (d) => d.revive() },
];
const OUTFIT_LABEL: Record<string, string> = { witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie', bisht: 'Bisht' };
const ROOMS: { key: SceneName | null; label: string }[] = [
  { key: null, label: 'Plain room' }, { key: 'halloween', label: 'Spooky theme' }, { key: 'backrooms', label: 'Backrooms' },
  { key: 'kotel' as SceneName, label: 'Western Wall' }, { key: 'majlis' as SceneName, label: 'Majlis' },
];
const TOYS: { key: Toy; label: string }[] = [{ key: 'yarn', label: 'Ball' }, { key: 'dreidel', label: 'Dreidel' }, { key: 'darbuka' as Toy, label: 'Darbuka' }];
const MOVES: { key: PetMove; label: string }[] = [{ key: 'pet', label: 'Plain pet' }, { key: 'kapparot', label: 'Kapparot hen' }, { key: 'falcon' as PetMove, label: 'Falcon' }];
type Head = 'kippah' | 'keffiyeh' | null;
const isOutfit = (s: string | null): s is Costume => !!s && (OUTFITS as readonly string[]).includes(s);

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

/** One wallet mood, drawn live (the portrait's pose, NftArt's poseState), at the cat's size: he is as wide as her box. */
const SIZE = 1024; const W = 620; const H = W * 230 / 200; const FLOOR = 870;
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
    // a portrait holds still: the butt's spring off (a pose that moves the body would otherwise catch it mid-wobble)
    (rig.own as { jiggle?: { destroy(): void } } | null)?.jiggle?.destroy();
    poseState(rig, state, crown, costume);
    const t = setTimeout(() => { rig.still(); onReady?.(); }, 1600);
    return () => clearTimeout(t);
  }, [rig, state, crown, costume, onReady]);
  const dead = state === 'dead';
  const w = Math.round(W * (costume ? 0.9 : 1)); const h = w * 230 / 200;
  return (
    <div ref={box} className="nft-art" data-state={state} data-night={state === 'sleeping' ? 'on' : 'off'} style={{ aspectRatio: '1 / 1' }}>
      <div className="nft-world" style={{ width: SIZE, height: SIZE, transform: `scale(${k})` }}>
        <div className="nft-wall" /><div className="nft-dots" />
        {state === 'sleeping' && <div className="nft-moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />}
        <div className="nft-floor" style={{ top: FLOOR - 40 }} />
        <div className="nft-rug" style={{ top: FLOOR - 6 }} />
        <div className="nft-cat" style={{ width: w, height: h, left: (SIZE - w) / 2, top: FLOOR - h * (212 / 230) + (dead ? -70 : 0) }}>
          <Pet onRig={setRig} character="thiccums" style={{ width: '100%', height: '100%' }} />
        </div>
        {dead && <div className="nft-prop" style={{ left: 512 + 250 - 75, top: FLOOR + 26 - 161, width: 150, height: 161 }} dangerouslySetInnerHTML={{ __html: PROPS.grave }} />}
        {state === 'grubby' && <div className="nft-prop" style={{ left: 512 - 300 - 75, top: FLOOR + 22 - 135, width: 150, height: 135 }} dangerouslySetInnerHTML={{ __html: PROPS.poop }} />}
        {(state === 'hungry' || state === 'bored') && (
          <div className="nft-thought" style={{ left: 512 + 240, top: FLOOR - H - 10 }}>
            <div className="thought-cloud" dangerouslySetInnerHTML={{ __html: PROPS.thought }} />
            <div className="thought-icon" dangerouslySetInnerHTML={{ __html: PROPS[state === 'hungry' ? 'bowl' : 'yarn'] }} />
          </div>
        )}
        {state === 'happy' && <><div className="nft-prop" style={{ left: 512 + 250, top: 170, width: 70, height: 70 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /><div className="nft-prop" style={{ left: 512 + 320, top: 110, width: 48, height: 48 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /></>}
      </div>
    </div>
  );
}

/**
 * His card, for the art tools (the site's /nft?card= page must never know him): /thiccums?card=<mood>[&crown=1][&costume=a,b]
 * [&bare=1], the same 1024 frame and the same ready flag the bake, portrait and brand tools wait for. DEV ONLY like the lab.
 */
const CARD = new URLSearchParams(location.search);
const cardState = CARD.get('card') as NftState | null;
const onCardReady = () => { (window as unknown as { __card_ready?: boolean }).__card_ready = true; };
function ThiccumsCard({ state }: { state: NftState }) {
  return <div className={`card-only ${CARD.has('bare') ? 'is-bare' : ''}`}><MoodTile state={state} crown={CARD.has('crown')} costume={CARD.get('costume') ?? undefined} onReady={onCardReady} /></div>;
}

export function ThiccumsLab() {
  return cardState && (NFT_STATES as readonly string[]).includes(cardState) ? <ThiccumsCard state={cardState} /> : <ThiccumsLabPage />;
}

function ThiccumsLabPage() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [d, setD] = useState<Director | null>(null);
  const [outfit, setOutfit] = useState<Costume | null>(() => { const v = params.get('costume'); return isOutfit(v) ? v : null; });
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [head, setHead] = useState<Head>(() => { const v = params.get('head'); return v === 'kippah' || v === 'keffiyeh' ? v : null; });
  const [star, setStar] = useState(params.get('star') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => { const v = params.get('scene'); return v && v !== 'plain' ? (v as SceneName) : null; });
  const [toy, setToy] = useState<Toy>(() => { const v = params.get('toy'); return v === 'dreidel' || v === 'darbuka' ? (v as Toy) : 'yarn'; });
  const [petMove, setPetMove] = useState<PetMove>(() => { const v = params.get('pet'); return v === 'kapparot' || v === 'falcon' ? (v as PetMove) : 'pet'; });
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [night, setNight] = useState(params.get('night') === '1');
  const [sad, setSad] = useState(params.get('sad') === '1');
  const [dirty, setDirty] = useState(params.get('dirty') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown }).__lab = { thiccums: d };
    (window as unknown as { __pet?: unknown }).__pet = d ? { director: d, dispatch: () => {} } : undefined;
  }, [d]);
  const worn = useMemo<Costume[]>(() => [...(outfit ? [outfit] : []), ...(head ? [head as Costume] : []), ...(star ? ['starofdavid' as const] : [])], [outfit, head, star]);
  useEffect(() => { d?.setCostumes(worn); }, [d, worn]);
  useEffect(() => { d?.setHair(hair); }, [d, hair]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  useEffect(() => { d?.setSad(sad); }, [d, sad]);
  useEffect(() => { d?.setDirty(dirty); }, [d, dirty]);
  useEffect(() => { d?.setToy(toy); }, [d, toy]);
  useEffect(() => { d?.setPetMove(petMove); }, [d, petMove]);
  const portraitCostume = [...worn, ...(hair ? ['emohair'] : [])].join(',') || undefined;

  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };
  const label = (a: Act) => (a.label === 'Play' ? `Play (${TOYS.find((t) => t.key === toy)?.label.toLowerCase()})` : a.label === 'Pet' && petMove !== 'pet' ? `Pet (${MOVES.find((m) => m.key === petMove)?.label.toLowerCase()})` : a.label);

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab sahur-lab seal-lab thicc-lab">
        <h1>Thiccums</h1>
        <p className="lead">A seal with a bouncy butt, traced line for line off the reference. Every animation the pets have, done his way, and every item that is live in the shop on him. Press anything; the butt bounces on whatever he does (and on its own, on the pink button). The nine wallet moods are below. <b>Local test page only: not on the site, nothing on chain.</b></p>
        <div className="lab-controls hlab-controls">
          <span className="judaica-mix-label">Outfit:</span>
          {OUTFITS.map((c) => <button key={c} className={`chip-btn ${outfit === c ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === c ? null : c))}>{OUTFIT_LABEL[c] ?? c}</button>)}
          <span className="hlab-sep" />
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)}>Emo hair</button>
          <button className={`chip-btn ${head === 'kippah' ? 'is-on' : ''}`} onClick={() => setHead((v) => (v === 'kippah' ? null : 'kippah'))} title="One head piece at a time">Kippah</button>
          <button className={`chip-btn ${head === 'keffiyeh' ? 'is-on' : ''}`} onClick={() => setHead((v) => (v === 'keffiyeh' ? null : 'keffiyeh'))} title="One head piece at a time">Keffiyeh</button>
          <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
        </div>
        <div className="lab-controls hlab-controls">
          <span className="judaica-mix-label">Room:</span>
          {ROOMS.map((r) => <button key={r.label} className={`chip-btn ${scene === r.key ? 'is-on' : ''}`} onClick={() => setScene(r.key)}>{r.label}</button>)}
          <span className="hlab-sep" />
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
        <section className="hlab-booth" data-character="thiccums" data-busy={busy ?? ''}>
          <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene} character="thiccums" /></div>
          <div className="lab-actions">
            {ACTS.map((a) => (
              <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : a.own ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{label(a)}</button>
            ))}
            <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
            <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
          </div>
        </section>
        {moods && (
          <>
            <h2>Wallet moods</h2>
            <p className="lead">The nine states a contract would pick from, drawn live by the rig in what he wears; the crown chip applies here too.</p>
            <div className="hlab-moods">
              <div className="hlab-moodset" data-character="thiccums">
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
