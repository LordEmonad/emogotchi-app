/**
 * The Habibi pack lab, at /habibi (DEV ONLY until the pack is announced; unlisted): the pack's items on all four pets at
 * once (the cat, the frok and Sahur), live.
 * The keffiyeh (the red-and-white shemagh with its black agal cord), the bisht (the gold-trimmed cloak; an outfit, worn one
 * at a time like the witch's), the Majlis room (a majlis at night with Dubai through its window), the darbuka, which
 * `play()` brings out instead of the ball of yarn, and the falcon, which turns Pet into the falcon landing on the pet.
 * Four stages side by side with a button for every animation each pet has, and under them the nine wallet moods of each,
 * drawn live by the rig in what they wear. Nothing on chain, no wallet: this is where the pack gets approved before any
 * of it is an item.
 *
 * The other items are here too so the clashes can be checked: the other outfits (one at a time, the site's rule, and the
 * bisht is one of them), the emo hair, the Jewish pack's kippah (a head piece: ONE of kippah / keffiyeh at a time) and
 * Star of David, the dreidel and the kapparot hen (one toy, one Pet move at a time).
 *
 * `?keffiyeh=0&bisht=0&costume=witch&scene=majlis|plain|halloween|backrooms|kotel&toy=yarn|dreidel|darbuka&pet=pet|kapparot|falcon
 *  &kippah=1&star=1&hair=1&crown=1&night=1&sad=1&dirty=1&moods=0&only=cat|frog|sahur`
 * sets the page up from the URL (the headless checks drive it); `window.__lab = { cat, frog, sahur }` holds the
 * directors in dev builds.
 */
import { useEffect, useMemo, useState } from 'react';
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
/** Play and Pet first (the pack's toy and the falcon), then everything else each pet has. */
const first = (acts: Act[]) => [...['Play', 'Pet'].flatMap((l) => acts.filter((a) => a.label === l)), ...acts.filter((a) => a.label !== 'Play' && a.label !== 'Pet')];
const ACTS = {
  cat: [...COMMON, { label: 'Hair flick', run: (d) => d.hairflick() }],
  frog: [...COMMON, { label: 'Screenshot', run: (d) => d.screenshot() }, { label: 'Slap', run: (d) => d.slap() }, { label: 'Squeeze', run: (d) => d.squeeze() }, { label: 'Burn', run: (d) => d.burn() }],
  sahur: first(SAHUR_ACTS),
} as Record<Drawing, Act[]>;   // (a lab: its own booths only)
const PETS: { character: Drawing; title: string }[] = [
  { character: 'cat', title: 'Emogotchi' },
  { character: 'frog', title: 'Inversegotchi' },
  { character: 'sahur', title: 'Tung Tung Tung Sahur' },
];
const OUTFIT_LABEL: Record<string, string> = { bisht: 'Bisht', witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie' };
const ROOMS: { key: SceneName | null; label: string }[] = [
  { key: 'majlis' as SceneName, label: 'Majlis' }, { key: null, label: 'Plain room' }, { key: 'halloween', label: 'Spooky theme' }, { key: 'backrooms', label: 'Backrooms' }, { key: 'kotel', label: 'Western Wall' },
];
const TOYS: { key: Toy; label: string }[] = [{ key: 'darbuka' as Toy, label: 'Darbuka' }, { key: 'yarn', label: 'Yarn' }, { key: 'dreidel', label: 'Dreidel' }];
const MOVES: { key: PetMove; label: string }[] = [{ key: 'falcon' as PetMove, label: 'Falcon' }, { key: 'pet', label: 'Plain pet' }, { key: 'kapparot', label: 'Kapparot hen' }];
const TOY_LABEL: Record<string, string> = { darbuka: 'Play (darbuka)', yarn: 'Play (yarn)', dreidel: 'Play (dreidel)' };
const MOVE_LABEL: Record<string, string> = { falcon: 'Pet (falcon)', pet: 'Pet', kapparot: 'Pet (kapparot)' };
type Head = 'keffiyeh' | 'kippah' | null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isOutfit = (s: string | null): s is Costume => !!s && (OUTFITS as readonly string[]).includes(s);
const isCharacter = (s: string | null): s is Drawing => s === 'cat' || s === 'frog' || s === 'sahur';

/** Everything the pet has, back to back, tidying up after the actions that leave something behind. */
async function playAll(d: Director, acts: Act[], setBusy: (l: string | null) => void) {
  const seq = acts.filter((a) => !['Wake', 'Clean', 'Revive'].includes(a.label));
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

function Booth({ character, title, worn, hair, crown, night, sad, dirty, scene, toy, petMove, onDirector }: {
  character: Drawing; title: string; worn: Costume[]; hair: boolean; crown: boolean; night: boolean; sad: boolean; dirty: boolean;
  scene: SceneName | null; toy: Toy; petMove: PetMove; onDirector: (c: Drawing, d: Director | null) => void;
}) {
  const [d, setD] = useState<Director | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
  return (
    <section className="hlab-booth" data-character={character} data-busy={busy ?? ''}>
      <h2>{title}</h2>
      <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene} character={character} /></div>
      <div className="lab-actions">
        {ACTS[character].map((a) => (
          <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>
            {a.label === 'Play' ? TOY_LABEL[toy] ?? 'Play' : a.label === 'Pet' ? MOVE_LABEL[petMove] ?? 'Pet' : a.label}
          </button>
        ))}
        <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, ACTS[character], setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
      </div>
    </section>
  );
}

export function HabibiLab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [head, setHead] = useState<Head>(() => (params.get('kippah') === '1' ? 'kippah' : params.get('keffiyeh') === '0' ? null : 'keffiyeh'));
  const [star, setStar] = useState(params.get('star') === '1');
  // the bisht is an outfit: one at a time with the witch, the pumpkin, the mummy and the zombie
  const [outfit, setOutfit] = useState<Costume | null>(() => {
    const v = params.get('costume');
    if (isOutfit(v)) return v;
    return params.get('bisht') === '0' ? null : ('bisht' as Costume);
  });
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => {
    const v = params.get('scene');
    return v === 'plain' ? null : v === 'halloween' || v === 'backrooms' || v === 'kotel' ? v : ('majlis' as SceneName);   // the Majlis by default
  });
  const [toy, setToy] = useState<Toy>(() => { const v = params.get('toy'); return v === 'yarn' || v === 'dreidel' ? v : ('darbuka' as Toy); });
  // the falcon: worn, it turns Pet into the falcon landing on the pet (a tap on the pet stays the quick nuzzle)
  const [petMove, setPetMove] = useState<PetMove>(() => { const v = params.get('pet'); return v === 'pet' || v === 'kapparot' ? v : ('falcon' as PetMove); });
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [night, setNight] = useState(params.get('night') === '1');
  const [sad, setSad] = useState(params.get('sad') === '1');
  const [dirty, setDirty] = useState(params.get('dirty') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const only = params.get('only');
  const pets = isCharacter(only) ? PETS.filter((p) => p.character === only) : PETS;
  const [dirs, setDirs] = useState<Partial<Record<Drawing, Director | null>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const onDirector = useMemo(() => (c: Drawing, d: Director | null) => setDirs((cur) => (cur[c] === d ? cur : { ...cur, [c]: d })), []);
  // the handle the headless checks drive (dev builds only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown }).__lab = dirs;
  }, [dirs]);

  const worn = useMemo<Costume[]>(() => [...(outfit ? [outfit] : []), ...(head ? [head as Costume] : []), ...(star ? ['starofdavid' as const] : [])], [outfit, head, star]);
  // the portrait grid draws the list as one string, so NftArt can stay a plain component
  const portraitCostume = [...worn, ...(hair ? ['emohair'] : [])].join(',') || undefined;
  const ready = pets.every((p) => dirs[p.character]);
  const all = async () => {
    if (!ready || busy) return;
    setBusy('all');
    try { await Promise.all(pets.map((p) => playAll(dirs[p.character]!, ACTS[p.character], () => {}))); } finally { setBusy(null); }
  };
  const together = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!ready || busy) return;
    setBusy(label);
    try { await Promise.all(pets.map((p) => fn(dirs[p.character]!))); } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab halloween-lab judaica-lab habibi-lab">
        <h1>The Habibi pack</h1>
        <p className="lead">The keffiyeh with its agal, the bisht, the Majlis as a room, a darbuka the pets drum instead of the ball of yarn, and the falcon, which turns Pet into a falcon landing on the pet. All four pets, live: turn things on and off, press anything; the nine wallet moods of each are below. The seal is not live yet: it is here so everything is checked on it too.</p>
        <div className="lab-controls hlab-controls">
          <button className={`chip-btn ${head === 'keffiyeh' ? 'is-on' : ''}`} onClick={() => setHead((v) => (v === 'keffiyeh' ? null : 'keffiyeh'))}>Keffiyeh + agal</button>
          <button className={`chip-btn ${outfit === 'bisht' ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === 'bisht' ? null : ('bisht' as Costume)))}>Bisht</button>
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
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void together('play', (d) => d.play())}>{busy === 'play' ? 'Playing…' : 'Play, all four'}</button>
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void together('pet', (d) => d.pet(1))}>{busy === 'pet' ? 'Petting…' : 'Pet, all four'}</button>
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void all()}>{busy === 'all' ? 'Playing everything…' : 'Play everything, all four'}</button>
        </div>
        <div className="lab-controls hlab-controls judaica-mix">
          <span className="judaica-mix-label">With other items:</span>
          {OUTFITS.filter((c) => c !== ('bisht' as Costume)).map((c) => <button key={c} className={`chip-btn ${outfit === c ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === c ? null : c))}>{OUTFIT_LABEL[c] ?? c}</button>)}
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)} title="Drawn on inversebrah and Sahur">Emo hair</button>
          <button className={`chip-btn ${head === 'kippah' ? 'is-on' : ''}`} onClick={() => setHead((v) => (v === 'kippah' ? null : 'kippah'))} title="One head piece at a time: it takes the keffiyeh off">Kippah</button>
          <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
        </div>
        <div className={`hlab-stages judaica-stages n${pets.length}`}>
          {pets.map((p) => (
            <Booth key={p.character} character={p.character} title={p.title} worn={worn} hair={hair && p.character !== 'cat'} crown={crown} night={night}
              sad={sad} dirty={dirty} scene={scene} toy={toy} petMove={petMove} onDirector={onDirector} />
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
