/**
 * The Jewish pack lab, at /judaica (also /jewish; unlisted): the pack's items on all four pets at once (the cat, the frok, Sahur
 * ), live.
 * The kippah (with the payot that come with it), the Star of David on a chain, the Western Wall room and the dreidel,
 * which `play()` brings out instead of the ball of yarn. Three stages side by side with a button for every animation
 * each pet has, and under them the nine wallet moods of each, drawn live by the rig in what they wear. Nothing on
 * chain, no wallet: this is where the pack gets approved before any of it is an item.
 *
 * The other outfits are here too (one at a time, the site's rule) so the clashes can be checked: the witch hat and the
 * pumpkin cover the kippah, the Star of David goes over any of them.
 *
 * `?kippah=0&star=0&scene=kotel|plain|halloween|backrooms&toy=yarn|dreidel&costume=witch&hair=1&crown=1&night=1&sad=1&dirty=1&moods=0&only=cat|frog|sahur`
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
  { label: 'Feed', run: (d) => d.feed() },
  { label: 'Wash', run: (d) => d.wash() },
  { label: 'Pet', run: (d) => d.pet(1) },
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
const ACTS = {
  cat: [...COMMON, { label: 'Hair flick', run: (d) => d.hairflick() }],
  frog: [...COMMON, { label: 'Screenshot', run: (d) => d.screenshot() }, { label: 'Slap', run: (d) => d.slap() }, { label: 'Squeeze', run: (d) => d.squeeze() }, { label: 'Burn', run: (d) => d.burn() }],
  // his own list, with Play first like the others
  sahur: [...SAHUR_ACTS.filter((a) => a.label === 'Play'), ...SAHUR_ACTS.filter((a) => a.label !== 'Play')],
} as Record<Drawing, Act[]>;   // (a lab: its own booths only)
const PETS: { character: Drawing; title: string }[] = [
  { character: 'cat', title: 'Emogotchi' },
  { character: 'frog', title: 'Inversegotchi' },
  { character: 'sahur', title: 'Tung Tung Tung Sahur' },
];
const OUTFIT_LABEL: Record<string, string> = { witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie' };
const ROOMS: { key: SceneName | null; label: string }[] = [
  { key: 'kotel', label: 'Western Wall' }, { key: null, label: 'Plain room' }, { key: 'halloween', label: 'Spooky theme' }, { key: 'backrooms', label: 'Backrooms' },
];
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

/** The pack's pictures (public/brand): the four item cards (tools/items/build-art.mjs) and the promo (1600x900). */
const PACK_CARDS = [
  { file: 'item-kippah.png', label: 'Kippah' },
  { file: 'item-starofdavid.png', label: 'Star of David' },
  { file: 'item-kotel.png', label: 'Western Wall theme' },
  { file: 'item-dreidel.png', label: 'Dreidel' },
  { file: 'item-kapparot.png', label: 'Kapparot hen' },
];
const PACK_POSTERS = [
  { file: 'jewish-pack.png', label: 'The pack, no text' },
  { file: 'jewish-pack-title.png', label: 'The pack, with its title' },
];
function PackPic({ file, label }: { file: string; label: string }) {
  const src = `/brand/${file}`;
  return (
    <figure>
      <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={label} loading="lazy" /></a>
      <figcaption>{label} · <a href={src} download={file}>Save</a></figcaption>
    </figure>
  );
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
            {a.label === 'Play' ? (toy === 'dreidel' ? 'Play (dreidel)' : 'Play (yarn)') : a.label === 'Pet' ? (petMove === 'kapparot' ? 'Pet (kapparot)' : 'Pet') : a.label}
          </button>
        ))}
        <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, ACTS[character], setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
      </div>
    </section>
  );
}

export function JudaicaLab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [kippah, setKippah] = useState(params.get('kippah') !== '0');
  const [star, setStar] = useState(params.get('star') !== '0');
  const [outfit, setOutfit] = useState<Costume | null>(() => { const v = params.get('costume'); return isOutfit(v) ? v : null; });
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => {
    const v = params.get('scene');
    return v === 'plain' ? null : v === 'halloween' || v === 'backrooms' ? v : 'kotel';   // the Western Wall by default
  });
  const [toy, setToy] = useState<Toy>(params.get('toy') === 'yarn' ? 'yarn' : 'dreidel');
  // the hen: wearing it turns Pet into kapparot (a tap on the pet stays the quick nuzzle)
  const [petMove, setPetMove] = useState<PetMove>(params.get('kapparot') === '0' ? 'pet' : 'kapparot');
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

  const worn = useMemo<Costume[]>(() => [...(outfit ? [outfit] : []), ...(kippah ? ['kippah' as const] : []), ...(star ? ['starofdavid' as const] : [])], [outfit, kippah, star]);
  // the portrait grid draws the list as one string, so NftArt can stay a plain component
  const portraitCostume = [...worn, ...(hair ? ['emohair'] : [])].join(',') || undefined;
  const ready = pets.every((p) => dirs[p.character]);
  const all = async () => {
    if (!ready || busy) return;
    setBusy('all');
    try { await Promise.all(pets.map((p) => playAll(dirs[p.character]!, ACTS[p.character], () => {}))); } finally { setBusy(null); }
  };
  const playAllToys = async () => {
    if (!ready || busy) return;
    setBusy('play');
    try { await Promise.all(pets.map((p) => dirs[p.character]!.play())); } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab halloween-lab judaica-lab">
        <h1>The Jewish pack</h1>
        <p className="lead">A kippah (it comes with payot), a Star of David on a chain, the Western Wall as a room, a dreidel the pets spin instead of the ball of yarn, and the kapparot hen, which turns Pet into kapparot. All four pets, live: turn things on and off, press anything; the nine wallet moods of each are below.</p>
        <div className="lab-controls hlab-controls">
          <button className={`chip-btn ${kippah ? 'is-on' : ''}`} onClick={() => setKippah((v) => !v)}>Kippah + payot</button>
          <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
          <button className={`chip-btn ${toy === 'dreidel' ? 'is-on' : ''}`} onClick={() => setToy((v) => (v === 'dreidel' ? 'yarn' : 'dreidel'))}>{toy === 'dreidel' ? 'Dreidel' : 'Yarn (no dreidel)'}</button>
          <button className={`chip-btn ${petMove === 'kapparot' ? 'is-on' : ''}`} onClick={() => setPetMove((v) => (v === 'kapparot' ? 'pet' : 'kapparot'))} title="Worn, it turns Pet into kapparot">{petMove === 'kapparot' ? 'Kapparot hen' : 'Pet (no hen)'}</button>
          <span className="hlab-sep" />
          {ROOMS.map((r) => <button key={r.label} className={`chip-btn ${scene === r.key ? 'is-on' : ''}`} onClick={() => setScene(r.key)}>{r.label}</button>)}
          <span className="hlab-sep" />
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
          <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
          <button className={`chip-btn ${sad ? 'is-on' : ''}`} onClick={() => setSad((v) => !v)}>{sad ? 'Sad' : 'Content'}</button>
          <button className={`chip-btn ${dirty ? 'is-on' : ''}`} onClick={() => setDirty((v) => !v)}>{dirty ? 'Grubby' : 'Clean'}</button>
          <button className={`chip-btn ${moods ? 'is-on' : ''}`} onClick={() => setMoods((v) => !v)}>{moods ? 'Moods shown' : 'Moods hidden'}</button>
        </div>
        <div className="lab-controls hlab-controls judaica-mix">
          <span className="judaica-mix-label">With other items:</span>
          {OUTFITS.map((c) => <button key={c} className={`chip-btn ${outfit === c ? 'is-on' : ''}`} onClick={() => setOutfit((cur) => (cur === c ? null : c))}>{OUTFIT_LABEL[c]}</button>)}
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)} title="Drawn on inversebrah and Sahur">Emo hair</button>
          <span className="hlab-sep" />
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void playAllToys()}>{busy === 'play' ? 'Playing…' : 'Play, all four'}</button>
          <button className="btn btn-sm btn-pink" disabled={!!busy || !ready} onClick={() => void all()}>{busy === 'all' ? 'Playing everything…' : 'Play everything, all four'}</button>
        </div>
        <div className={`hlab-stages judaica-stages n${pets.length}`}>
          {pets.map((p) => (
            <Booth key={p.character} character={p.character} title={p.title} worn={worn} hair={hair && p.character !== 'cat'} crown={crown} night={night}
              sad={sad} dirty={dirty} scene={scene} toy={toy} petMove={petMove} onDirector={onDirector} />
          ))}
        </div>
        <h2>Images</h2>
        <p className="lead">The shop card of each item (the on-chain picture, as a PNG) and the pack's picture for posting, with and without its title. Click one for full size.</p>
        <div className="judaica-pics judaica-cards">
          {PACK_CARDS.map((c) => <PackPic key={c.file} {...c} />)}
        </div>
        <div className="judaica-pics judaica-posters">
          {PACK_POSTERS.map((c) => <PackPic key={c.file} {...c} />)}
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
