/**
 * The costume lab, at /costume: one page to see an outfit on the cat everywhere it shows up. The live
 * rig wearing it, with a button for every animation, and the eighteen wallet portraits in it. This is
 * how a costume gets approved before it is sold: every frame of every action, looked at.
 */
import { useEffect, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import { EMPTY_WALLET } from '../wallet';
import { NFT_STATES, NFT_STATE_LABEL } from './NftArt';

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
  { label: 'Hair flick', run: (d) => d.hairflick() },
  { label: 'Rumble', run: (d) => d.rumble() },
  { label: 'Die', run: (d) => d.die() },
  { label: 'Revive', run: (d) => d.revive() },
];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CostumeLab() {
  const [d, setD] = useState<Director | null>(null);
  const [on, setOn] = useState(true);
  const [crown, setCrown] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { d?.setCostume(on); }, [d, on]);
  useEffect(() => { d?.setCrown(crown); }, [d, crown]);

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
        <h1>Witch outfit</h1>
        <p className="lead">The live cat wearing it. Press anything; every animation is here. Then the eighteen wallet portraits below.</p>
        <div className="lab-controls">
          <button className={`chip-btn ${on ? 'is-on' : ''}`} onClick={() => setOn((v) => !v)}>{on ? 'Outfit on' : 'Outfit off'}</button>
          <button className={`chip-btn ${crown ? 'is-on' : ''}`} onClick={() => setCrown((v) => !v)}>{crown ? 'Crown on' : 'Crown off'}</button>
        </div>
        <div className="shell"><Stage onDirector={setD} night={false} thought={null} /></div>
        <div className="lab-actions">
          {ACTS.map((a) => (
            <button key={a.label} className={`btn btn-sm ${busy === a.label ? 'btn-pink' : 'btn-ghost'}`} disabled={!!busy} onClick={() => void run(a.label, a.run)}>{a.label}</button>
          ))}
          <button className={`btn btn-sm ${busy === 'Everything' ? 'btn-pink' : 'btn-pink'}`} disabled={!!busy} onClick={() => void all()}>{busy === 'Everything' ? 'Playing everything…' : 'Play everything'}</button>
        </div>
        <h2>Wallet portraits</h2>
        <p className="lead">The nine moods, plain and crowned, as they would look in a wallet with the outfit on.</p>
        <div className="lab-grid">
          {NFT_STATES.flatMap((s) => [false, true].map((c) => (
            <figure key={`${s}-${c}`}>
              <img src={`/nft/witch/${s}${c ? '-crown' : ''}-1024.png`} alt={`${NFT_STATE_LABEL[s]}${c ? ', crowned' : ''}`} loading="lazy" />
              <figcaption>{NFT_STATE_LABEL[s]}{c ? ' · crowned' : ''}</figcaption>
            </figure>
          )))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
