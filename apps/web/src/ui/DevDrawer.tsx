import { useState } from 'react';
import type { Director } from '../scene/director';
import type { Event } from '../game/state';

export type ViewOverride = 'auto' | 'landing' | 'pet' | 'nopet' | 'dead';
type Props = { director: Director | null; dispatch: (e: Event) => void; view: ViewOverride; setView: (v: ViewOverride) => void; crown: boolean; setCrown: (b: boolean) => void; speed: number; onConnectDemo: () => void; onDisconnect: () => void };

export function DevDrawer({ director, dispatch, view, setView, crown, setCrown, speed, onConnectDemo, onDisconnect }: Props) {
  const [open, setOpen] = useState(false);
  const B = ({ l, fn }: { l: string; fn: () => unknown }) => <button onClick={() => void fn()} className="dev-b">{l}</button>;
  return (
    <div className={`dev ${open ? 'is-open' : ''}`}>
      <button className="dev-toggle" onClick={() => setOpen((o) => !o)}>{open ? '✕' : 'dev'}</button>
      {open && (
        <div className="dev-panel">
          <div className="dev-row"><span>View</span>{(['auto', 'landing', 'pet', 'nopet', 'dead'] as ViewOverride[]).map((v) => <button key={v} className={`dev-b ${view === v ? 'is-on' : ''}`} onClick={() => setView(v)}>{v}</button>)}</div>
          <div className="dev-row"><span>Wallet</span><B l="connect demo" fn={onConnectDemo} /><B l="disconnect" fn={onDisconnect} /></div>
          <div className="dev-row"><span>Life</span><B l="kill" fn={() => dispatch({ type: 'kill' })} /><B l="revive" fn={() => { dispatch({ type: 'revived' }); return director?.revive(); }} /></div>
          <div className="dev-row"><span>Stats</span>
            <B l="sad" fn={() => dispatch({ type: 'set', stats: { food: 10, fun: 10, clean: 10 } })} /><B l="dirty" fn={() => dispatch({ type: 'set', stats: { clean: 20 } })} /><B l="starve" fn={() => dispatch({ type: 'set', stats: { food: 0 } })} /><B l="fill" fn={() => dispatch({ type: 'set', stats: { food: 100, fun: 100, clean: 100, energy: 100 } })} />
            <label>speed <select value={speed} onChange={(e) => dispatch({ type: 'speed', speed: Number(e.target.value) })}>{[1, 3, 10, 30].map((s) => <option key={s} value={s}>×{s}</option>)}</select></label>
            <label><input type="checkbox" checked={crown} onChange={(e) => setCrown(e.target.checked)} /> crown</label>
          </div>
          <div className="dev-row"><span>Anim</span>
            <B l="walk ←" fn={() => director?.walk(130)} /><B l="walk →" fn={() => director?.walk(470)} /><B l="feed" fn={() => director?.feed()} /><B l="poop" fn={() => director?.poop().then(() => dispatch({ type: 'pooped' }))} /><B l="clean" fn={() => director?.clean()} />
            <B l="wash" fn={() => director?.wash()} /><B l="play" fn={() => director?.play()} /><B l="pet" fn={() => director?.pet(1)} /><B l="sleep" fn={() => { dispatch({ type: 'slept', on: true }); return director?.sleep(); }} /><B l="wake" fn={() => { dispatch({ type: 'slept', on: false }); return director?.wake(); }} />
            <B l="rumble" fn={() => director?.rumble()} /><B l="yawn" fn={() => director?.yawn()} /><B l="flick" fn={() => director?.hairflick()} /><B l="tour" fn={() => director?.tour()} />
          </div>
          <div className="dev-row"><span>Pages</span><a className="dev-b" href="/nft?dev=1">NFT preview</a><a className="dev-b" href="/?dev=1">home</a></div>
        </div>
      )}
    </div>
  );
}
