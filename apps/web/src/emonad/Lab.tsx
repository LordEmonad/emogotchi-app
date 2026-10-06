/**
 * Emonad's lab, at /emonad: LOCAL ONLY (App.tsx loads it only in dev builds; a production build has neither the route
 * nor this chunk). The $EMO mascot on his rig (rig.ts), on a stage: every facing, every move, every mood, walking, his
 * eyes on the pointer, the bones drawn over him, slow motion, and backgrounds for making things with him (his room, the
 * sheet's white, a green screen, see-through).
 *
 * `?facing=front|quarterR|sideR|back|sideL|quarterL&mood=<mood>&bg=room|white|green|clear&bones=1&slow=1&reel=1&eyes=0`
 * sets it up from the URL (what the headless checks drive); `window.__emonad` is the rig (dev).
 *
 * Keys: left/right walk, up turns him away, down to the front, space jumps, W waves, F flips his hair.
 * The Showreel (or `?reel=1`) loops through all of it, a facing, a mood and a move or two per beat, until switched off.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmonadRig, MOODS, type Facing, type Mood } from './rig';
import { ACTION_NAMES, type ActionName } from './moves';
import './lab.css';

const W = 1200, H = 720, FLOOR = 650, SCALE = 0.86;
const FACING_LABEL: Record<Facing, string> = { sideL: '← Side', quarterL: '↙ Three-quarter', front: 'Front', quarterR: 'Three-quarter ↘', sideR: 'Side →', back: 'Back' };
const FACING_ORDER: Facing[] = ['sideL', 'quarterL', 'front', 'quarterR', 'sideR', 'back'];
const MOVE_LABEL: Partial<Record<ActionName, string>> = {
  wave: 'Wave', point: 'Point', hairflip: 'Hair flip', sigh: 'Sigh', shrug: 'Shrug', nod: 'Nod', shake: 'Shake head',
  headbang: 'Headbang', jump: 'Jump', lookaround: 'Look around', poke: 'Poke', talk: 'Talk',
};
const ONE_SHOTS = ACTION_NAMES.filter((n) => MOVE_LABEL[n]);
const HAND_LABEL = { open: 'Open', fist: 'Fist', point: 'Point', horns: 'Horns' } as const;
const MOOD_LABEL: Record<Mood, string> = { neutral: 'Deadpan', smirk: 'Smirk', happy: 'Happy', sad: 'Sad', shocked: 'Shocked', tired: 'Tired', annoyed: 'Annoyed', dead: 'Dead inside 🥀' };
type Bg = 'room' | 'white' | 'green' | 'clear';
const BGS: { key: Bg; label: string }[] = [{ key: 'room', label: 'His room' }, { key: 'white', label: 'Sheet white' }, { key: 'green', label: 'Green screen' }, { key: 'clear', label: 'See-through' }];

type Beat = { label: string; run: (r: EmonadRig) => Promise<void> };
const LEFT = W * 0.27, MID = W / 2, RIGHT = W * 0.73;

/** All the way round in one smooth motion (spin), and the old model sheet: each drawing in turn, held. */
async function turnaround(r: EmonadRig) { await r.spin(); }
async function turnaroundBack(r: EmonadRig) { await r.spin({ dir: -1 }); }
async function eachView(r: EmonadRig) {
  for (const f of ['quarterR', 'sideR', 'back', 'sideL', 'quarterL', 'front'] as Facing[]) { await r.turnTo(f); await r.wait(0.7); }
}
const REEL: Beat[] = [
  { label: 'Hello', run: async (r) => { r.setMood('neutral'); await r.turnTo('front'); await r.wait(1.2); await r.play('wave'); } },
  { label: 'The turnaround', run: async (r) => { await turnaround(r); await r.wait(0.5); await turnaroundBack(r); } },
  { label: 'A walk to the left, then the hair', run: async (r) => { await r.walkTo(LEFT); await r.wait(0.4); await r.play('hairflip'); } },
  { label: 'Three-quarter, a sigh', run: async (r) => { await r.turnTo('quarterR'); r.setMood('tired'); await r.play('sigh'); await r.wait(0.6); r.setMood('neutral'); } },
  { label: 'A walk to the right, a shrug', run: async (r) => { await r.walkTo(RIGHT, { face: 'quarterL' }); await r.play('shrug'); } },
  { label: 'Talking, side-on', run: async (r) => { await r.turnTo('sideL'); await r.say(2.4); await r.play('nod'); } },
  { label: 'Back to the middle, a jump', run: async (r) => { await r.walkTo(MID); r.setMood('happy'); await r.play('jump'); await r.wait(0.5); r.setMood('neutral'); } },
  { label: 'Headbang', run: async (r) => { r.setMood('neutral'); await r.play('headbang'); await r.wait(0.4); } },
  { label: 'Looking around', run: async (r) => { await r.play('lookaround'); await r.play('point'); } },
  { label: 'From behind', run: async (r) => { await r.turnTo('back'); await r.wait(1); await r.play('shrug'); await r.wait(0.4); await r.play('hairflip'); await r.turnTo('front'); } },
  { label: 'Poke', run: async (r) => { r.setMood('annoyed'); await r.play('poke'); await r.wait(0.6); await r.play('shake'); r.setMood('neutral'); } },
  { label: 'A little dance', run: async (r) => { r.setMood('smirk'); void r.play('dance'); await r.wait(4.5); r.stopAll(); await r.wait(0.4); r.setMood('neutral'); } },
  { label: 'Stepping on the spot, three-quarter', run: async (r) => { await r.turnTo('quarterL'); void r.play('march'); await r.wait(2.6); r.stopAll(); await r.wait(0.3); await r.turnTo('front'); } },
  { label: 'Dead inside', run: async (r) => { r.setMood('dead'); await r.wait(0.8); await r.play('sigh'); await r.wait(1.2); r.setMood('neutral'); } },
];

/** "Watch every animation": everything he does, once through, each named under the stage. */
type Step = { label: string; run: (r: EmonadRig) => Promise<unknown> };
const move = (m: ActionName): Step['run'] => (r) => r.play(m);
const hold = (m: ActionName, s: number): Step['run'] => async (r) => { void r.play(m); await r.wait(s); r.stopAll(); await r.wait(0.35); };
const TOUR: Step[] = [
  { label: 'Standing: breathing, blinking, glancing', run: async (r) => { await r.turnTo('front'); await r.wait(2.6); } },
  { label: 'Turnaround: all the way round', run: turnaround },
  { label: 'Turnaround: the other way', run: turnaroundBack },
  { label: 'Each drawing in turn', run: eachView },
  { label: 'Walking to the left', run: (r) => r.walkTo(LEFT, { face: null }) },
  { label: 'Walking to the right', run: (r) => r.walkTo(RIGHT, { face: null }) },
  { label: 'Walking back to the middle', run: (r) => r.walkTo(MID) },
  ...(['wave', 'point', 'hairflip', 'sigh', 'shrug', 'nod', 'shake', 'lookaround'] as ActionName[]).map((m) => ({ label: `Front · ${MOVE_LABEL[m]}`, run: move(m) })),
  { label: 'Front · Big wave', run: (r) => r.play('wave', { big: true }) },
  { label: 'Front · Talk', run: (r) => r.say(2.6) },
  ...(['open', 'fist', 'point', 'horns'] as const).map((g) => ({ label: `Front · Hands: ${HAND_LABEL[g]}`, run: (r: EmonadRig) => r.play('hands', { grip: g }) })),
  { label: 'Front · Headbang', run: move('headbang') },
  { label: 'Front · Jump', run: move('jump') },
  { label: 'Front · Poke (or click him)', run: move('poke') },
  { label: 'Front · Dance', run: hold('dance', 4.6) },
  { label: 'Front · Stepping on the spot', run: hold('march', 3) },
  { label: 'Side', run: async (r) => { await r.turnTo('sideL'); await r.wait(0.6); } },
  ...(['wave', 'point', 'hairflip', 'nod', 'headbang', 'jump', 'shrug'] as ActionName[]).map((m) => ({ label: `Side · ${MOVE_LABEL[m]}`, run: move(m) })),
  { label: 'Side · Talk', run: (r) => r.say(2.4) },
  { label: 'Three-quarter', run: async (r) => { await r.turnTo('quarterR'); await r.wait(0.6); } },
  ...(['wave', 'sigh', 'shrug', 'point', 'lookaround'] as ActionName[]).map((m) => ({ label: `Three-quarter · ${MOVE_LABEL[m]}`, run: move(m) })),
  { label: 'Three-quarter · Stepping on the spot', run: hold('march', 2.6) },
  { label: 'From behind', run: async (r) => { await r.turnTo('back'); await r.wait(0.6); } },
  ...(['wave', 'shrug', 'hairflip', 'headbang'] as ActionName[]).map((m) => ({ label: `From behind · ${MOVE_LABEL[m]}`, run: move(m) })),
  ...MOODS.filter((m) => m !== 'neutral').map((m) => ({
    label: `Mood · ${MOOD_LABEL[m]}`,
    run: async (r: EmonadRig) => { if (r.facing !== 'front') await r.turnTo('front'); r.setMood(m); await r.wait(1.8); },
  })),
  { label: 'Deadpan again', run: async (r) => { r.setMood('neutral'); await r.wait(1.2); } },
];

export function EmonadLab() {
  const q = new URLSearchParams(location.search);
  const host = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const bonesG = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rigRef = useRef<EmonadRig | null>(null);
  const [facing, setFacing] = useState<Facing>((q.get('facing') as Facing) || 'front');
  const [mood, setMood] = useState<Mood>((q.get('mood') as Mood) || 'neutral');
  const [bg, setBg] = useState<Bg>((q.get('bg') as Bg) || 'room');
  const [bones, setBones] = useState(q.get('bones') === '1');
  const [slow, setSlow] = useState(q.get('slow') === '1');
  const [eyes, setEyes] = useState(q.get('eyes') !== '0');
  const [loops, setLoops] = useState<{ dance: boolean; march: boolean }>({ dance: false, march: false });
  const [reel, setReel] = useState(false);
  const [touring, setTouring] = useState(false);
  const tourOn = useRef(false);
  const [beat, setBeat] = useState('');
  const [busy, setBusy] = useState(false);
  const reelOn = useRef(false);
  // on a phone the stage shows its middle (he is bigger; his walks stay inside it)
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const VX = narrow ? 200 : 0, VW = narrow ? 800 : W;
  const vb = useRef({ x: VX, w: VW });
  vb.current = { x: VX, w: VW };
  const bonesOn = useRef(bones);
  bonesOn.current = bones;

  useEffect(() => {
    const r = new EmonadRig({ facing });
    r.x = MID; r.y = FLOOR; r.scale = SCALE;
    r.setMood(mood);
    r.onFacing = (f) => setFacing(f);
    r.onFrame = () => {
      const s = shadow.current;
      if (s) {
        const k = Math.max(0.35, 1 + r.lifted / 160);
        s.setAttribute('cx', String(r.x)); s.setAttribute('rx', String(118 * SCALE * k)); s.setAttribute('opacity', String(0.5 * k));
      }
      const g = bonesG.current;
      if (g) {
        if (!bonesOn.current) { if (g.childElementCount) g.replaceChildren(); return; }
        const pts = r.bonesNow();
        const by = new Map(pts.map((p) => [p.bone, p]));
        let html = '';
        for (const p of pts) {
          const par = p.parent && by.get(p.parent);
          if (par) html += `<line x1="${par.x.toFixed(1)}" y1="${par.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
        }
        for (const p of pts) html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5"><title>${p.bone}</title></circle>`;
        g.innerHTML = html;
      }
    };
    host.current!.append(r.el);
    rigRef.current = r;
    if (import.meta.env.DEV) Object.assign(window, { __emonad: r });
    if (q.get('reel') === '1') startReel();
    return () => { reelOn.current = false; tourOn.current = false; r.destroy(); rigRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const r = rigRef.current; if (r) r.speed = slow ? 0.25 : 1; }, [slow]);
  useEffect(() => { rigRef.current?.setMood(mood); }, [mood]);

  // the eyes on the pointer (anywhere on the page)
  useEffect(() => {
    const r = rigRef.current;
    if (!eyes) { if (r) r.gaze = null; return; }
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current, rig = rigRef.current;
      if (!svg || !rig || tourOn.current) return;
      const b = svg.getBoundingClientRect();
      const x = vb.current.x + (e.clientX - b.left) / b.width * vb.current.w, y = (e.clientY - b.top) / b.height * H;
      const h = rig.headAt();
      const hy = h.y - 70 * SCALE;
      rig.gaze = { x: Math.max(-1, Math.min(1, (x - h.x) / 320)), y: Math.max(-1, Math.min(1, (y - hy) / 260)) };
    };
    const leave = () => { if (rigRef.current) rigRef.current.gaze = null; };
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', leave); };
  }, [eyes]);

  const act = useCallback(async (fn: (r: EmonadRig) => Promise<unknown>) => {
    const r = rigRef.current; if (!r) return;
    setBusy(true);
    try { await fn(r); } finally { setBusy(false); }
  }, []);

  const toggleLoop = (name: 'dance' | 'march') => {
    const r = rigRef.current; if (!r) return;
    if (loops[name]) { r.stopAll(); setLoops({ dance: false, march: false }); return; }
    void r.play(name);
    setLoops({ dance: name === 'dance', march: name === 'march' });
  };

  const startReel = useCallback(async () => {
    if (reelOn.current) { reelOn.current = false; setReel(false); return; }
    reelOn.current = true; setReel(true);
    const r = rigRef.current!;
    let i = 0;
    while (reelOn.current && rigRef.current === r) {
      const b = REEL[i % REEL.length]!;
      setBeat(`${(i % REEL.length) + 1}/${REEL.length} · ${b.label}`);
      await b.run(r);
      await r.wait(0.5);
      i++;
    }
    setBeat('');
    r.stopAll(); r.setMood('neutral');
  }, []);

  // everything once through (the button under the stage); pressed again, it stops after the animation playing
  const watchAll = useCallback(async () => {
    const r = rigRef.current; if (!r) return;
    if (tourOn.current) { tourOn.current = false; return; }
    if (reelOn.current) { reelOn.current = false; setReel(false); }
    tourOn.current = true; setTouring(true); setBusy(true);
    r.gaze = null; r.stopAll(); setMood('neutral'); r.setMood('neutral'); setLoops({ dance: false, march: false });
    try {
      for (let i = 0; i < TOUR.length && tourOn.current && rigRef.current === r; i++) {
        const st = TOUR[i]!;
        setBeat(`${i + 1}/${TOUR.length} · ${st.label}`);
        await st.run(r);
        await r.wait(0.45);
      }
    } finally {
      tourOn.current = false; setTouring(false); setBeat('');
      r.stopAll(); r.setMood('neutral'); setMood('neutral');
      if (Math.abs(r.x - MID) > 2) await r.walkTo(MID); else await r.turnTo('front');
      setBusy(false);
    }
  }, []);

  // keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const r = rigRef.current; if (!r) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); void act((rr) => rr.walkTo(Math.max(110, rr.x - 260), { face: null })); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); void act((rr) => rr.walkTo(Math.min(W - 110, rr.x + 260), { face: null })); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); void r.turnTo('back'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); void r.turnTo('front'); }
      else if (e.key === ' ') { e.preventDefault(); void r.play('jump'); }
      else if (e.key === 'w') void r.play('wave');
      else if (e.key === 'f') void r.play('hairflip');
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [act]);

  const r = rigRef.current;
  return (
    <div className={`emolab bg-${bg}`}>
      <header className="emolab-head">
        <h1>Emonad</h1>
        <p>the $EMO mascot on his rig · lab, local only</p>
      </header>

      <div className="emolab-stage">
        <svg ref={svgRef} viewBox={`${VX} 0 ${VW} ${H}`} role="img" aria-label="Emonad"
          onPointerDown={(e) => { if ((e.target as Element).closest('.emonad')) void rigRef.current?.play('poke'); }}>
          <defs>
            <linearGradient id="emolab-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a0f22" /><stop offset="0.75" stopColor="#2b1838" /><stop offset="1" stopColor="#331d42" />
            </linearGradient>
            <radialGradient id="emolab-spot" cx="0.5" cy="0.35" r="0.6">
              <stop offset="0" stopColor="#b48ad6" stopOpacity="0.32" /><stop offset="1" stopColor="#b48ad6" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="emolab-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1d1126" /><stop offset="1" stopColor="#0d0711" />
            </linearGradient>
            <pattern id="emolab-check" width="24" height="24" patternUnits="userSpaceOnUse">
              <rect width="24" height="24" fill="#fafafa" /><rect width="12" height="12" fill="#e6e6e6" /><rect x="12" y="12" width="12" height="12" fill="#e6e6e6" />
            </pattern>
          </defs>
          {bg === 'room' && (
            <g className="emolab-room">
              <rect width={W} height={FLOOR + 6} fill="url(#emolab-wall)" />
              {Array.from({ length: 13 }, (_, i) => <rect key={i} x={i * 96 + 40} y="0" width="2" height={FLOOR} fill="#ffffff" opacity="0.025" />)}
              <ellipse cx={MID} cy={FLOOR - 220} rx="520" ry="420" fill="url(#emolab-spot)" />
              <rect y={FLOOR} width={W} height={H - FLOOR} fill="url(#emolab-floor)" />
              <line x1="0" x2={W} y1={FLOOR} y2={FLOOR} stroke="#000" strokeOpacity="0.6" strokeWidth="2" />
            </g>
          )}
          {bg === 'white' && <rect width={W} height={H} fill="#fff" />}
          {bg === 'green' && <rect width={W} height={H} fill="#00b140" />}
          {bg === 'clear' && <rect width={W} height={H} fill="url(#emolab-check)" />}
          {(bg === 'room' || bg === 'white') && <ellipse ref={shadow} cx={MID} cy={FLOOR + 1} rx="100" ry="11" fill="#000" opacity="0.5" className="emolab-shadow" />}
          <g ref={host} />
          <g ref={bonesG} className="emolab-bones" />
        </svg>
      </div>
      <div className="emolab-watch">
        <button className={`emolab-watchbtn${touring ? ' on' : ''}`} onClick={() => void watchAll()}>
          {touring ? '■ Stop' : '▶ Watch every animation'}
        </button>
        <div className="emolab-beat" aria-live="polite">{beat || ' '}</div>
      </div>

      <section className="emolab-panel">
        <div className="emolab-row">
          <span className="emolab-k">Facing</span>
          {FACING_ORDER.map((f) => (
            <button key={f} className={`chip${facing === f ? ' on' : ''}`} onClick={() => void r?.turnTo(f)}>{FACING_LABEL[f]}</button>
          ))}
          <button className="chip" disabled={busy} onClick={() => act(turnaround)}>Turnaround ⟲</button>
          <button className="chip" disabled={busy} onClick={() => act(turnaroundBack)}>⟳</button>
          <button className="chip" disabled={busy} onClick={() => act(eachView)}>Each drawing</button>
        </div>
        <div className="emolab-row">
          <span className="emolab-k">Walk</span>
          <button className="chip" disabled={busy} onClick={() => act((rr) => rr.walkTo(LEFT))}>To the left</button>
          <button className="chip" disabled={busy} onClick={() => act((rr) => rr.walkTo(MID))}>To the middle</button>
          <button className="chip" disabled={busy} onClick={() => act((rr) => rr.walkTo(RIGHT))}>To the right</button>
          <button className={`chip${loops.march ? ' on' : ''}`} onClick={() => toggleLoop('march')}>Step on the spot</button>
        </div>
        <div className="emolab-row">
          <span className="emolab-k">Moves</span>
          {ONE_SHOTS.map((m) => (
            <button key={m} className="chip" onClick={() => void r?.play(m)}>{MOVE_LABEL[m]}</button>
          ))}
          <button className="chip" onClick={() => void r?.play('wave', { big: true })}>Big wave</button>
          <button className={`chip${loops.dance ? ' on' : ''}`} onClick={() => toggleLoop('dance')}>Dance</button>
        </div>
        <div className="emolab-row">
          <span className="emolab-k">Hands</span>
          {(['open', 'fist', 'point', 'horns'] as const).map((g) => (
            <button key={g} className="chip" onClick={() => void r?.play('hands', { grip: g })}>{HAND_LABEL[g]}</button>
          ))}
        </div>
        <div className="emolab-row">
          <span className="emolab-k">Mood</span>
          {MOODS.map((m) => (
            <button key={m} className={`chip${mood === m ? ' on' : ''}`} onClick={() => setMood(m)}>{MOOD_LABEL[m]}</button>
          ))}
        </div>
        <div className="emolab-row">
          <span className="emolab-k">Stage</span>
          {BGS.map((b) => <button key={b.key} className={`chip${bg === b.key ? ' on' : ''}`} onClick={() => setBg(b.key)}>{b.label}</button>)}
          <button className={`chip${eyes ? ' on' : ''}`} onClick={() => setEyes(!eyes)}>Eyes follow the pointer</button>
          <button className={`chip${bones ? ' on' : ''}`} onClick={() => setBones(!bones)}>Show the bones</button>
          <button className={`chip${slow ? ' on' : ''}`} onClick={() => setSlow(!slow)}>Slow motion</button>
        </div>
        <div className="emolab-row">
          <button className={`chip big${reel ? ' on' : ''}`} disabled={touring} onClick={() => void startReel()}>{reel ? 'Stop the Showreel' : 'Showreel (loops, for filming)'}</button>
          <span className="emolab-hint">Keys: ← → walk · ↑ ↓ turn · space jumps · W waves · F flips the hair · click him to poke him</span>
        </div>
      </section>
    </div>
  );
}
