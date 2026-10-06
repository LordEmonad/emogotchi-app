/**
 * The character lab, at /frog: the second character (working name "inverse brah") on the live rig, with a
 * button for every animation, next to the reference sheet it has to match. Nothing on chain, no wallet: this is
 * where a new character gets approved, frame by frame, before it is offered anywhere.
 */
import { useEffect, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import { EMPTY_WALLET } from '../wallet';

type Act = { label: string; run: (d: Director) => Promise<unknown> };
const ACTS: Act[] = [
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
  { label: 'Screenshot', run: (d) => d.screenshot() },
  { label: 'Slap', run: (d) => d.slap() },
  { label: 'Squeeze', run: (d) => d.squeeze() },
  { label: 'Burn', run: (d) => d.burn() },
];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CharacterLab() {
  const [d, setD] = useState<Director | null>(null);
  const [crown, setCrown] = useState(false);
  const [night, setNight] = useState(false);
  const [sad, setSad] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [witch, setWitch] = useState(false);
  const [hair, setHair] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // the same handle the filmstrip tools drive on the main page
  useEffect(() => { (window as unknown as { __pet?: unknown }).__pet = d ? { director: d, dispatch: () => {} } : undefined; }, [d]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);
  useEffect(() => { d?.setSad(sad); }, [d, sad]);
  useEffect(() => { d?.setDirty(dirty); }, [d, dirty]);
  useEffect(() => { d?.setCostume(witch); }, [d, witch]);
  useEffect(() => { d?.setHair(hair); }, [d, hair]);

  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* the lab just shows it */ } finally { setBusy(null); }
  };
  const all = async () => {
    if (!d) return;
    const seq: Act[] = ACTS.filter((a) => !['Wake', 'Clean', 'Revive'].includes(a.label));
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
  };

  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing costume-lab">
        <h1>New character</h1>
        <p className="lead">The frog on the live rig: the cat's animations, untouched. Press anything.</p>
        <div className="lab-controls">
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
          <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
          <button className={`chip-btn ${sad ? 'is-on' : ''}`} onClick={() => setSad((v) => !v)}>{sad ? 'Sad' : 'Content'}</button>
          <button className={`chip-btn ${dirty ? 'is-on' : ''}`} onClick={() => setDirty((v) => !v)}>{dirty ? 'Grubby' : 'Clean'}</button>
          <button className={`chip-btn ${witch ? 'is-on' : ''}`} onClick={() => setWitch((v) => !v)}>{witch ? 'Witch on' : 'Witch off'}</button>
          <button className={`chip-btn ${hair ? 'is-on' : ''}`} onClick={() => setHair((v) => !v)}>{hair ? 'Emo hair on' : 'Emo hair off'}</button>
          <button className="chip-btn" disabled={!!busy} onClick={() => void run('Centre', (d) => d.walk(300))}>Centre</button>
        </div>
        <div className="shell"><Stage onDirector={setD} night={night} thought={null} character="frog" /></div>
        <div className="lab-actions">
          {ACTS.map((a) => (
            <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{a.label}</button>
          ))}
          <button className="btn btn-sm btn-pink" disabled={!!busy} onClick={() => void all()}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
