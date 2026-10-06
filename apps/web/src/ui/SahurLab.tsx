/**
 * The Sahur lab, at /sahur (unlisted): Tung Tung Tung Sahur on the live rig, with a button for every animation
 * he has (the cat's, untouched, plus his own two) and, under the stage, the nine wallet moods drawn live by the
 * rig, crowned or not. This is where the character gets approved frame by frame before he is offered anywhere.
 * Nothing on chain, no wallet.
 *
 * `?costume=witch|pumpkin|mummy|zombie&hair=1&scene=backrooms|halloween|plain&crown=1&night=1&sad=1&dirty=1&moods=0`
 * sets the page up from the URL, which is what the headless checks drive (`window.__lab.sahur` is his director, dev
 * builds only). Every item in the shop is on him: the four outfits (one at a time, the site's rule), the emo hair, the
 * Spooky theme, and the Backrooms (the room by default; a scene only, not an item yet).
 */
import { useEffect, useMemo, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import { COSTUMES, OUTFITS, type Costume } from '../pet/Pet';
import { EMPTY_WALLET } from '../wallet';
import { NftArt, NFT_STATES, NFT_STATE_LABEL } from './NftArt';

type Act = { label: string; run: (d: Director) => Promise<unknown> };
export const SAHUR_ACTS: Act[] = [
  { label: 'Tung tung tung', run: (d) => d.tung() },
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COSTUME_LABEL: Record<Costume, string> = { witch: 'Witch outfit', pumpkin: 'Pumpkin', mummy: 'Mummy', zombie: 'Zombie', kippah: 'Kippah', starofdavid: 'Star of David', keffiyeh: 'Keffiyeh', bisht: 'Bisht', beanie: 'Beanie', emofit: 'Emo clothes', wristbands: 'Wristbands', piercings: 'Lip piercings' };
const isCostume = (s: string): s is Costume => (COSTUMES as readonly string[]).includes(s);
const ROOMS: { key: SceneName | null; label: string }[] = [{ key: 'backrooms', label: 'Backrooms' }, { key: 'halloween', label: 'Spooky theme' }, { key: null, label: 'Plain room' }];

/** Everything he has, back to back, tidying up after the actions that leave something behind. */
async function playAll(d: Director, setBusy: (l: string | null) => void) {
  const seq = SAHUR_ACTS.filter((a) => !['Wake', 'Clean', 'Revive'].includes(a.label));
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

export function SahurLab() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [d, setD] = useState<Director | null>(null);
  const [crown, setCrown] = useState(params.get('crown') === '1');
  const [night, setNight] = useState(params.get('night') === '1');
  const [scene, setScene] = useState<SceneName | null>(() => { const v = params.get('scene'); return v === 'halloween' ? 'halloween' : v === null || v === 'backrooms' ? 'backrooms' : null; });   // the Backrooms by default
  const [costume, setCostume] = useState<Costume | null>(() => { const v = params.get('costume') ?? ''; return isCostume(v) ? v : null; });   // one outfit at a time, the site's rule
  const [hair, setHair] = useState(params.get('hair') === '1');
  const [sad, setSad] = useState(params.get('sad') === '1');
  const [dirty, setDirty] = useState(params.get('dirty') === '1');
  const [moods, setMoods] = useState(params.get('moods') !== '0');
  const [busy, setBusy] = useState<string | null>(null);
  // the handle the headless checks drive (dev builds only), and the one the filmstrip tools expect on the main page
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __lab?: unknown; __pet?: unknown }).__lab = { sahur: d };
    (window as unknown as { __pet?: unknown }).__pet = d ? { director: d, dispatch: () => {} } : undefined;
  }, [d]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  useEffect(() => { d?.setSad(sad); }, [d, sad]);
  useEffect(() => { d?.setDirty(dirty); }, [d, dirty]);
  useEffect(() => { d?.setCostume(costume); }, [d, costume]);
  useEffect(() => { d?.setHair(hair); }, [d, hair]);
  // the portrait grid draws the outfit list as one string, so NftArt can stay a plain component
  const portraitCostume = [...(costume ? [costume] : []), ...(hair ? ['emohair'] : [])].join(',') || undefined;

  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab sahur-lab">
        <h1>Tung Tung Tung Sahur</h1>
        <p className="lead">The third character on the live rig: every one of the cat's animations, untouched, plus his own knock, and every item in the shop on him. Press anything; the nine wallet moods are below.</p>
        <div className="lab-controls hlab-controls">
          {OUTFITS.map((c) => <button key={c} className={`chip-btn ${costume === c ? 'is-on' : ''}`} onClick={() => setCostume((cur) => (cur === c ? null : c))}>{COSTUME_LABEL[c]}</button>)}
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)}>Emo hair</button>
          <span className="hlab-sep" />
          {ROOMS.map((r) => <button key={r.label} className={`chip-btn ${scene === r.key ? 'is-on' : ''}`} onClick={() => setScene(r.key)}>{r.label}</button>)}
          <span className="hlab-sep" />
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
          <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
          <button className={`chip-btn ${sad ? 'is-on' : ''}`} onClick={() => setSad((v) => !v)}>{sad ? 'Sad' : 'Content'}</button>
          <button className={`chip-btn ${dirty ? 'is-on' : ''}`} onClick={() => setDirty((v) => !v)}>{dirty ? 'Grubby' : 'Clean'}</button>
          <button className={`chip-btn ${moods ? 'is-on' : ''}`} onClick={() => setMoods((v) => !v)}>{moods ? 'Moods shown' : 'Moods hidden'}</button>
          <button className="chip-btn" disabled={!!busy} onClick={() => void run('Centre', (dd) => dd.walk(300))}>Centre</button>
        </div>
        <section className="hlab-booth" data-character="sahur" data-busy={busy ?? ''}>
          <div className="shell"><Stage onDirector={setD} night={night} thought={null} scene={scene} character="sahur" /></div>
          <div className="lab-actions">
            {SAHUR_ACTS.map((a) => (
              <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : a.label === 'Tung tung tung' ? 'btn-ghost sahur-own' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{a.label}</button>
            ))}
            <button className="btn btn-sm btn-pink" disabled={!!busy || !d} onClick={() => { if (d) void playAll(d, setBusy); }}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
          </div>
        </section>
        {moods && (
          <>
            <h2>Wallet moods</h2>
            <p className="lead">The nine states a contract would pick from, drawn live by the rig; the crown chip above applies here too.</p>
            <div className="hlab-moods">
              <div className="hlab-moodset" data-character="sahur">
                <div className="lab-grid hlab-grid">
                  {NFT_STATES.map((s) => (
                    <figure key={s}>
                      <div className="hlab-tile"><NftArt state={s} still crown={crown} costume={portraitCostume} character="sahur" /></div>
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
