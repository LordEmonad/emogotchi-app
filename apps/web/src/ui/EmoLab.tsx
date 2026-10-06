/**
 * The emo pack lab, at /emopack (DEV ONLY: nothing of it is on chain or on the site yet). The pack's items on all five
 * pets at once, live: the beanie (a black knit beanie with black emo hair under it, swept over one eye; a head piece,
 * one at a time with the kippah and the keffiyeh, and it covers the emo hair), the emo clothes (an outfit, cut for each
 * pet), the wristbands (purple, a white stripe; the cat wears hers already), the lip piercings, the emo bedroom (a room), the
 * guitar, which `play()` brings out instead of the ball, and the mirror selfie, which turns Pet into the pet's selfie.
 * Five stages with a button for every animation each pet has, and under them the nine wallet moods of each, drawn live
 * in what they wear. The other items are here too, to check the clashes.
 *
 * `?beanie=0&fit=0&wrist=0&lip=0&costume=witch&scene=emoroom|plain|halloween|backrooms|kotel|majlis&toy=guitar|yarn|dreidel|darbuka
 *  &pet=selfie|pet|kapparot|falcon&head=kippah|keffiyeh&star=1&hair=1&crown=1&night=1&sad=1&dirty=1&moods=0&only=cat|frog|sahur|thiccums|r3tards`
 * sets the page up from the URL (the headless checks drive it); `window.__lab = { cat, frog, sahur, thiccums, r3tards }`
 * holds the directors.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director, PetMove, Toy } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import { OUTFITS, type Drawing, type Costume } from '../pet/Pet';
import { EMPTY_WALLET } from '../wallet';
import { NftArt, NFT_STATES, NFT_STATE_LABEL } from './NftArt';
import { SAHUR_ACTS } from './SahurLab';

type Act = { label: string; run: (d: Director) => Promise<unknown> };
const COMMON: Act[] = [
  { label: 'Play', run: (d) => d.play() },
  { label: 'Pet', run: (d) => d.pet(1) },
  { label: 'Feed', run: (d) => d.feed() },
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
/** Play and Pet first (the guitar and the selfie), then everything else each pet has. */
const first = (acts: Act[]) => [...['Play', 'Pet'].flatMap((l) => acts.filter((a) => a.label === l)), ...acts.filter((a) => a.label !== 'Play' && a.label !== 'Pet')];
const ACTS = {
  cat: [...COMMON, { label: 'Hair flick', run: (d) => d.hairflick() }],
  frog: [...COMMON, { label: 'Screenshot', run: (d) => d.screenshot() }, { label: 'Slap', run: (d) => d.slap() }, { label: 'Squeeze', run: (d) => d.squeeze() }, { label: 'Burn', run: (d) => d.burn() }],
  sahur: first(SAHUR_ACTS),
  thiccums: [...COMMON, { label: 'Butt bounce', run: (d) => (d.own as unknown as { bounce: () => Promise<unknown> }).bounce() }],
  r3tards: COMMON,
} as Record<Drawing, Act[]>;   // (a lab: its own booths only)
const PETS: { character: Drawing; title: string }[] = [
  { character: 'cat', title: 'Emogotchi' },
  { character: 'frog', title: 'Inversegotchi' },
  { character: 'sahur', title: 'Tung Tung Tung Sahur' },
  { character: 'thiccums', title: 'Thiccumsgotchi' },
  { character: 'r3tards', title: 'r3tardgotchi' },
];
const OUTFIT_LABEL: Record<string, string> = { emofit: 'Emo clothes', bisht: 'Bisht', witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie' };
const EMOROOM = 'emoroom' as SceneName;
const ROOMS: { key: SceneName | null; label: string }[] = [
  { key: EMOROOM, label: 'Emo bedroom' }, { key: null, label: 'Plain room' }, { key: 'halloween', label: 'Spooky theme' }, { key: 'backrooms', label: 'Backrooms' },
  { key: 'kotel' as SceneName, label: 'Western Wall' }, { key: 'majlis' as SceneName, label: 'Majlis' },
];
const TOYS: { key: Toy; label: string }[] = [{ key: 'guitar', label: 'Guitar' }, { key: 'yarn', label: 'Ball' }, { key: 'dreidel', label: 'Dreidel' }, { key: 'darbuka', label: 'Darbuka' }];
const MOVES: { key: PetMove; label: string }[] = [{ key: 'selfie', label: 'Mirror selfie' }, { key: 'pet', label: 'Plain pet' }, { key: 'kapparot', label: 'Kapparot hen' }, { key: 'falcon', label: 'Falcon' }];
const TOY_LABEL: Record<string, string> = { guitar: 'Play (guitar)', yarn: 'Play (ball)', dreidel: 'Play (dreidel)', darbuka: 'Play (darbuka)' };
const MOVE_LABEL: Record<string, string> = { selfie: 'Pet (selfie)', pet: 'Pet', kapparot: 'Pet (kapparot)', falcon: 'Pet (falcon)' };
type Head = 'beanie' | 'kippah' | 'keffiyeh' | null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isOutfit = (s: string | null): s is Costume => !!s && (OUTFITS as readonly string[]).includes(s);
const isCharacter = (s: string | null): s is Drawing => !!s && PETS.some((p) => p.character === s);
const isScene = (s: string | null): s is SceneName => !!s && ROOMS.some((r) => r.key === s);

/**
 * The run-through: every animation the pet has, numbered, in an order that leaves the room tidy (the guitar and the
 * selfie first, a quick tap, everything else, its own moves), then the pack's own again crowned (the crown sits on
 * the beanie, the patch and the rings go gold). The booth shows "step n of m" under the stage, so a look can be
 * reported by its number. Each step starts from the middle of the room.
 */
function runList(character: Drawing, toy: Toy, petMove: PetMove): Act[] {
  const name = (a: Act) => (a.label === 'Play' ? TOY_LABEL[toy] ?? 'Play' : a.label === 'Pet' ? MOVE_LABEL[petMove] ?? 'Pet' : a.label);
  const acts = first(ACTS[character]).map((a) => ({ label: name(a), run: a.run }));
  const at = acts.findIndex((a) => a.label === (MOVE_LABEL[petMove] ?? 'Pet'));
  acts.splice(at + 1, 0, { label: 'Tap on the pet (a quick pet)', run: (d) => d.pet(1, { quick: true }) });
  const crowned = (label: string, fn: (d: Director) => Promise<unknown>): Act => ({ label: `${label}, crowned`, run: async (d) => { d.setCrown(true); await wait(400); await fn(d); } });
  return [...acts, crowned(TOY_LABEL[toy] ?? 'Play', (d) => d.play()), crowned(MOVE_LABEL[petMove] ?? 'Pet', (d) => d.pet(1)), crowned('Yawn', (d) => d.yawn())];
}
async function runThrough(d: Director, steps: Act[], onStep: (i: number) => void, stop: { current: boolean }, crown: boolean) {
  try {
    for (let i = 0; i < steps.length && !stop.current; i += 1) {
      // every step starts from the middle of the room (the walks excepted), so each one is seen as it was made
      if (!/^Walk/.test(steps[i]!.label) && Math.abs(d.getState().x - 300) > 40 && !d.getState().dead) { try { await d.walk(300); } catch { /* */ } }
      if (stop.current) break;
      onStep(i);
      try { await steps[i]!.run(d); } catch { /* the lab just shows it */ }
      await wait(700);
    }
  } finally { d.setCrown(crown); onStep(-1); }
}

function Booth({ character, title, worn, hair, crown, night, sad, dirty, scene, toy, petMove, onDirector, go }: {
  character: Drawing; title: string; worn: Costume[]; hair: boolean; crown: boolean; night: boolean; sad: boolean; dirty: boolean;
  scene: SceneName | null; toy: Toy; petMove: PetMove; onDirector: (c: Drawing, d: Director | null) => void; go: number;
}) {
  const [d, setD] = useState<Director | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const stop = useRef(false);
  const steps = useMemo(() => runList(character, toy, petMove), [character, toy, petMove]);
  useEffect(() => { onDirector(character, d); }, [d, character, onDirector]);
  useEffect(() => { d?.setCostumes(worn); }, [d, worn]);
  useEffect(() => { d?.setHair(hair); }, [d, hair]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  useEffect(() => { d?.setSad(sad); }, [d, sad]);
  useEffect(() => { d?.setDirty(dirty); }, [d, dirty]);
  useEffect(() => { d?.setToy(toy); }, [d, toy]);
  useEffect(() => { d?.setPetMove(petMove); }, [d, petMove]);
  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };
  const through = async () => {
    if (!d || busy) return;
    stop.current = false; setBusy('Run-through');
    try { await runThrough(d, steps, setStep, stop, crown); } finally { setBusy(null); }
  };
  // the page's "Run through everything, all five" starts every booth's own run-through
  const goRef = useRef(go);
  useEffect(() => { if (go !== goRef.current) { goRef.current = go; void through(); } });   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="hlab-booth" data-character={character} data-busy={busy ?? ''}>
      <h2>{title}</h2>
      <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene} character={character} /></div>
      <div className={`emo-step ${step >= 0 ? 'is-on' : ''}`} aria-live="polite">
        {step >= 0 ? <><b>Step {step + 1} of {steps.length}</b> · {steps[step]?.label}</> : busy && busy !== 'Run-through' ? <>Playing: {busy}</> : <>Press <b>Run through everything</b> to see every animation, numbered.</>}
      </div>
      <div className="lab-actions">
        <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => void through()}>{busy === 'Run-through' ? 'Running through…' : 'Run through everything'}</button>
        {busy === 'Run-through' && <button className="btn btn-sm btn-ghost" onClick={() => { stop.current = true; }}>Stop after this step</button>}
        {ACTS[character].map((a) => (
          <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>
            {a.label === 'Play' ? TOY_LABEL[toy] ?? 'Play' : a.label === 'Pet' ? MOVE_LABEL[petMove] ?? 'Pet' : a.label}
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
      </div>
      <details className="emo-steps">
        <summary>The {steps.length} steps</summary>
        <ol>{steps.map((s, i) => <li key={s.label} className={i === step ? 'is-on' : ''}>{s.label}</li>)}</ol>
      </details>
    </section>
  );
}

export function EmoLab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [head, setHead] = useState<Head>(() => { const v = params.get('head'); return v === 'kippah' || v === 'keffiyeh' ? v : params.get('beanie') === '0' ? null : 'beanie'; });
  const [outfit, setOutfit] = useState<Costume | null>(() => { const v = params.get('costume'); if (isOutfit(v)) return v; return params.get('fit') === '0' ? null : 'emofit'; });
  const [wrist, setWrist] = useState(params.get('wrist') !== '0');
  const [lip, setLip] = useState(params.get('lip') !== '0');
  const [star, setStar] = useState(params.get('star') === '1');
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => { const v = params.get('scene'); return v === 'plain' ? null : isScene(v) ? v : EMOROOM; });
  const [toy, setToy] = useState<Toy>(() => { const v = params.get('toy'); return TOYS.some((t) => t.key === v) ? (v as Toy) : 'guitar'; });
  const [petMove, setPetMove] = useState<PetMove>(() => { const v = params.get('pet'); return MOVES.some((m) => m.key === v) ? (v as PetMove) : 'selfie'; });
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [night, setNight] = useState(params.get('night') === '1');
  const [sad, setSad] = useState(params.get('sad') === '1');
  const [dirty, setDirty] = useState(params.get('dirty') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const [only, setOnly] = useState<Drawing | null>(() => { const v = params.get('only'); return isCharacter(v) ? v : null; });
  const pets = only ? PETS.filter((p) => p.character === only) : PETS;
  const [go, setGo] = useState(0);
  const pick = (c: Drawing | null) => {
    setOnly(c);
    const q = new URLSearchParams(location.search); if (c) q.set('only', c); else q.delete('only');
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
  };
  const [dirs, setDirs] = useState<Partial<Record<Drawing, Director | null>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const onDirector = useMemo(() => (c: Drawing, d: Director | null) => setDirs((cur) => (cur[c] === d ? cur : { ...cur, [c]: d })), []);
  // the handle the headless checks drive (dev builds only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown }).__lab = dirs;
  }, [dirs]);

  const worn = useMemo<Costume[]>(() => [...(outfit ? [outfit] : []), ...(head ? [head as Costume] : []), ...(wrist ? ['wristbands' as const] : []), ...(lip ? ['piercings' as const] : []), ...(star ? ['starofdavid' as const] : [])], [outfit, head, wrist, lip, star]);
  // the portrait grid draws the list as one string, so NftArt can stay a plain component
  const portraitCostume = [...worn, ...(hair ? ['emohair'] : [])].join(',') || undefined;
  const ready = pets.every((p) => dirs[p.character]);
  const together = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!ready || busy) return;
    setBusy(label);
    try { await Promise.all(pets.map((p) => fn(dirs[p.character]!))); } finally { setBusy(null); }
  };
  const headChip = (h: Exclude<Head, null>, label: string, title?: string) => <button className={`chip-btn ${head === h ? 'is-on' : ''}`} title={title} onClick={() => setHead((v) => (v === h ? null : h))}>{label}</button>;

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab halloween-lab judaica-lab habibi-lab emo-lab">
        <h1>The emo pack</h1>
        <div className="lab-controls hlab-controls emo-pick">
          <span className="judaica-mix-label">Show:</span>
          <button className={`chip-btn ${only === null ? 'is-on' : ''}`} onClick={() => pick(null)}>All five</button>
          {PETS.map((p) => <button key={p.character} className={`chip-btn ${only === p.character ? 'is-on' : ''}`} onClick={() => pick(p.character)}>{p.title}</button>)}
        </div>
        <p className="lead">The beanie with black emo hair under it, the emo clothes, the wristbands, the lip piercings, the emo bedroom, a guitar the pets strum instead of the ball, and the mirror selfie, which turns Pet into a selfie. All five pets, live: turn things on and off, press anything; the nine wallet moods of each are below. <b>Local test page only: nothing here is on chain.</b></p>
        <div className="lab-controls hlab-controls">
          {headChip('beanie', 'Beanie + hair')}
          <button className={`chip-btn ${outfit === 'emofit' ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === 'emofit' ? null : 'emofit'))}>Emo clothes</button>
          <button className={`chip-btn ${wrist ? 'is-on' : ''}`} onClick={() => setWrist((v) => !v)} title="The cat wears hers already">Wristbands</button>
          <button className={`chip-btn ${lip ? 'is-on' : ''}`} onClick={() => setLip((v) => !v)}>Lip piercings</button>
          <span className="hlab-sep" />
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
          <span className="hlab-sep" />
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void together('play', (d) => d.play())}>{busy === 'play' ? 'Playing…' : 'Play, all five'}</button>
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void together('pet', (d) => d.pet(1))}>{busy === 'pet' ? 'Petting…' : 'Pet, all five'}</button>
          {pets.length > 1 && <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => setGo((g) => g + 1)}>Run through everything, all five</button>}
        </div>
        <div className="lab-controls hlab-controls judaica-mix">
          <span className="judaica-mix-label">With other items:</span>
          {OUTFITS.filter((c) => c !== 'emofit').map((c) => <button key={c} className={`chip-btn ${outfit === c ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === c ? null : c))}>{OUTFIT_LABEL[c] ?? c}</button>)}
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)} title="Not drawn on the cat (her own mop is the look); the beanie covers it">Emo hair</button>
          {headChip('kippah', 'Kippah', 'One head piece at a time: it takes the beanie off')}
          {headChip('keffiyeh', 'Keffiyeh', 'One head piece at a time: it takes the beanie off')}
          <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
        </div>
        <div className={`hlab-stages judaica-stages emo-stages n${pets.length}`}>
          {pets.map((p) => (
            <Booth key={p.character} character={p.character} title={p.title} worn={worn} hair={hair && p.character !== 'cat'} crown={crown} night={night}
              sad={sad} dirty={dirty} scene={scene} toy={toy} petMove={petMove} onDirector={onDirector} go={go} />
          ))}
        </div>
        {moods && (
          <>
            <h2>Wallet moods</h2>
            <p className="lead">The nine states the contract picks from, drawn live by the rig in what they wear; the crown chip above applies here too.</p>
            <div className="hlab-moods">
              {pets.map(({ character: ch, title }) => (
                <div key={ch} className="hlab-moodset" data-character={ch}>
                  <h3>{title}</h3>
                  <div className="lab-grid hlab-grid">
                    {NFT_STATES.map((s) => (
                      <figure key={`${ch}-${s}`}>
                        <div className="hlab-tile"><NftArt state={s} still crown={crown} costume={ch === 'cat' ? portraitCostume?.replace(/,?emohair/, '') || undefined : portraitCostume} character={ch} /></div>
                        <figcaption>{NFT_STATE_LABEL[s]}{crown ? ' · crowned' : ''}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
