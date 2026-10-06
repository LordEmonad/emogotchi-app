/**
 * The Halloween lab, at /halloween (unlisted): the three seasonal outfits (pumpkin, mummy, zombie) plus the
 * witch, on both characters at once, everywhere they show up. Two live stages side by side with a button for
 * every animation each character has, and under them the nine wallet moods of each, drawn live by the rig in
 * the outfit. This is how an outfit gets approved before it is sold: every frame of every action, every mood,
 * crowned and not, looked at. Nothing on chain, no wallet.
 *
 * One outfit at a time, as on the site (the emo hair is not an outfit and goes with any).
 * `?costume=mummy&crown=1&hair=1&scene=halloween&night=1` sets the page up from the URL, which is what the headless
 * checks drive.
 */
import { useEffect, useMemo, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import { COSTUMES, type Character, type Costume } from '../pet/Pet';
import { EMPTY_WALLET } from '../wallet';
import { NftArt, NFT_STATES, NFT_STATE_LABEL } from './NftArt';

type Act = { label: string; run: (d: Director) => Promise<unknown> };
const COMMON: Act[] = [
  { label: 'Feed', run: (d) => d.feed() },
  { label: 'Wash', run: (d) => d.wash() },
  { label: 'Play', run: (d) => d.play() },
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
  cat: [...COMMON.slice(0, 10), { label: 'Hair flick', run: (d) => d.hairflick() }, ...COMMON.slice(10)],
  frog: [...COMMON, { label: 'Screenshot', run: (d) => d.screenshot() }, { label: 'Slap', run: (d) => d.slap() }, { label: 'Squeeze', run: (d) => d.squeeze() }, { label: 'Burn', run: (d) => d.burn() }],
  sahur: COMMON,   // not shown here (see /sahur); the record has to be complete
} as Record<Character, Act[]>;   // (a lab: its own booths only)
const COSTUME_LABEL: Record<Costume, string> = { witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie', kippah: 'Kippah', starofdavid: 'Star of David', keffiyeh: 'Keffiyeh', bisht: 'Bisht', beanie: 'Beanie', emofit: 'Emo clothes', wristbands: 'Wristbands', piercings: 'Lip piercings' };
const SEASON: readonly Costume[] = ['pumpkin', 'mummy', 'zombie', 'witch'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isCostume = (s: string): s is Costume => (COSTUMES as readonly string[]).includes(s);

/** Everything the character has, back to back, tidying up after the actions that leave something behind. */
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

function Booth({ character, title, costumes, hair, crown, night, scene, onDirector }: {
  character: Character; title: string; costumes: Costume[]; hair: boolean; crown: boolean; night: boolean; scene: boolean; onDirector: (d: Director | null) => void;
}) {
  const [d, setD] = useState<Director | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { onDirector(d); }, [d, onDirector]);
  useEffect(() => { d?.setCostumes(costumes); }, [d, costumes]);
  useEffect(() => { d?.setHair(hair); }, [d, hair]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };
  return (
    <section className="hlab-booth" data-character={character} data-busy={busy ?? ''}>
      <h2>{title}</h2>
      <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene ? 'halloween' : null} character={character} /></div>
      <div className="lab-actions">
        {ACTS[character].map((a) => (
          <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{a.label}</button>
        ))}
        <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, ACTS[character], setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
        <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
      </div>
    </section>
  );
}

export function HalloweenLab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  // one outfit at a time (the site's rule); ?costume= may still name several for the portrait tools, the lab takes the first
  const [costumes, setCostumes] = useState<Costume[]>(() => (params.get('costume') ?? 'pumpkin').split(',').map((s) => s.trim()).filter(isCostume).slice(0, 1));
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [scene, setScene] = useState(params.get('scene') === 'halloween');
  const [night, setNight] = useState(params.get('night') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const [cat, setCat] = useState<Director | null>(null);
  const [frog, setFrog] = useState<Director | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // the same handle the filmstrip tools drive on the main page, one per booth (dev builds only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown }).__lab = { cat, frog };
  }, [cat, frog]);
  const toggle = (c: Costume) => setCostumes((cur) => (cur.includes(c) ? [] : [c]));
  const both = async () => {
    if (!cat || !frog || busy) return;
    setBusy('both');
    try { await Promise.all([playAll(cat, ACTS.cat, () => {}), playAll(frog, ACTS.frog, () => {})]); } finally { setBusy(null); }
  };
  // the portrait grid draws the outfit list as one string, so NftArt can stay a plain component
  const portraitCostume = [...costumes, ...(hair ? ['emohair'] : [])].join(',') || undefined;

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab halloween-lab">
        <h1>Halloween outfits</h1>
        <p className="lead">Pumpkin, mummy and zombie on both pets, live. Pick an outfit (one at a time), press anything; the nine wallet moods of each are below, crowned or not.</p>
        <div className="lab-controls hlab-controls">
          {SEASON.map((c) => <button key={c} className={`chip-btn ${costumes.includes(c) ? 'is-on' : ''}`} onClick={() => toggle(c)}>{COSTUME_LABEL[c]}</button>)}
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)} title="Drawn on inversebrah only">Emo hair</button>
          <span className="hlab-sep" />
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
          <button className={`chip-btn ${scene ? 'is-on' : ''}`} onClick={() => setScene((v) => !v)}>{scene ? 'Haunted room' : 'Plain room'}</button>
          <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
          <button className={`chip-btn ${moods ? 'is-on' : ''}`} onClick={() => setMoods((v) => !v)}>{moods ? 'Moods shown' : 'Moods hidden'}</button>
          <button className="btn btn-sm btn-pink" disabled={!!busy || !cat || !frog} onClick={() => void both()}>{busy ? 'Playing everything, both…' : 'Play everything, both'}</button>
        </div>
        <div className="hlab-stages">
          <Booth character="cat" title="Emogotchi" costumes={costumes} hair={false} crown={crown} night={night} scene={scene} onDirector={setCat} />
          <Booth character="frog" title="Inversegotchi" costumes={costumes} hair={hair} crown={crown} night={night} scene={scene} onDirector={setFrog} />
        </div>
        {moods && (
          <>
            <h2>Wallet moods</h2>
            <p className="lead">The nine states the contract picks from, drawn live by the rig in the outfit; the crown chip above applies here too.</p>
            <div className="hlab-moods">
              {(['cat', 'frog'] as const).map((ch) => (
                <div key={ch} className="hlab-moodset" data-character={ch}>
                  <h3>{ch === 'cat' ? 'Emogotchi' : 'Inversegotchi'}</h3>
                  <div className="lab-grid hlab-grid">
                    {NFT_STATES.map((s) => (
                      <figure key={`${ch}-${s}`}>
                        <div className="hlab-tile"><NftArt state={s} still crown={crown} costume={portraitCostume} character={ch} /></div>
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
