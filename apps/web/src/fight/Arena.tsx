/**
 * The fight's room: the room's 600 x 460 world (Stage.tsx's, scaled to fit the same way), dressed as a bar's basement
 * (Basement.tsx), with TWO pets in it. Each pet gets the three nested boxes the fight director moves (fightDirector.ts):
 * the host, the body, the drawing. Everything but the vignette sits in a camera layer (`.fc-cam`) the director pans and
 * zooms for a knockout. When both rigs exist the director is made and handed up; a change of either character
 * remounts the room (the caller keys it). `bare` is Emotown's outdoor ring: no room, no camera.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pet, type Character, type PetRig } from '../pet/Pet';
import { WORLD } from '../scene/world';
import { FightDirector, MARK, fbox, type FightChar, type Fighter } from './fightDirector';
import { fightLooks } from './looks';
import { BasementBack, BasementFront, Vignette } from './Basement';
import { Beam, Grain, LampSwing } from './Light';
import { Crowd, lineup, type CrowdCtl } from './Crowd';
import '../scene/stage.css';
import './arena.css';

type Props = {
  left: FightChar; right: FightChar;
  /** no room: just the ring's mat, posts and ropes on a see-through stage (Emotown's outdoor ring) */
  bare?: boolean;
  /** the crowd: everyone, or a few of them (Emotown's small window) */
  crowd?: 'full' | 'small';
  onDirector: (d: FightDirector | null, fighters: [Fighter, Fighter] | null) => void;
  children?: ReactNode;
};

export function Arena({ left, right, bare = false, crowd: crowdSize = 'full', onDirector, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const hosts = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)] as const;
  const bodies = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)] as const;
  const drawings = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)] as const;
  const [k, setK] = useState(1);
  const [rigs, setRigs] = useState<[PetRig | null, PetRig | null]>([null, null]);
  const cb = useRef(onDirector); cb.current = onDirector;
  const fans = useMemo(() => lineup(crowdSize), [crowdSize]);
  const crowd = useRef<CrowdCtl | null>(null);
  const director = useRef<FightDirector | null>(null);
  const chars: [FightChar, FightChar] = [left, right];

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setK(e.contentRect.width / WORLD.w); });
    ro.observe(el); setK(el.clientWidth / WORLD.w);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const [r0, r1] = rigs;
    if (!r0 || !r1 || !back.current || !front.current || !world.current || !cam.current) return;
    const make = (i: 0 | 1, rig: PetRig): Fighter => ({
      rig, character: chars[i], host: hosts[i].current!, body: bodies[i].current!, drawing: drawings[i].current!,
      looks: fightLooks(drawings[i].current!.querySelector('svg')!, chars[i]),
    });
    const fighters: [Fighter, Fighter] = [make(0, r0), make(1, r1)];
    const d = new FightDirector(fighters, { back: back.current, front: front.current, world: world.current, cam: bare ? null : cam.current });
    d.reset();
    d.setCrowd(crowd.current);
    director.current = d;
    cb.current(d, fighters);
    return () => { d.destroy(); director.current = null; cb.current(null, null); };
  }, [rigs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className={`stage fc-arena${bare ? ' fc-bare' : ''}`} style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }}>
      <div ref={world} className="world" style={{ width: WORLD.w, height: WORLD.h, transform: `scale(${k})` }}>
        <div ref={cam} className="fc-cam">
          {bare ? <RingBare /> : <BasementBack />}
          {!bare && <Crowd fans={fans} onReady={(c) => { crowd.current = c; director.current?.setCrowd(c); }} />}
          {!bare && <div className="fc-shade" />}
          {!bare && <Beam />}
          {!bare && <LampSwing />}
          <div ref={back} className="layer fc-backfx" />
          {([0, 1] as const).map((i) => {
            const B = fbox(chars[i]);
            return (
              <div key={i} ref={hosts[i]} className="cathost" style={{ width: B.hostW, height: B.hostH, top: B.hostTop, left: MARK[i] - B.hostW / 2 }}>
                <div ref={bodies[i]} className="catbody fc-body" style={{ width: B.w, height: B.h, top: B.pad.top, left: B.pad.side }}>
                  <div ref={drawings[i]} className="fc-drawing">
                    <Pet character={chars[i]} onRig={(r) => setRigs((prev) => { const n: [PetRig | null, PetRig | null] = [...prev]; n[i] = r; return n; })} style={{ width: '100%', height: '100%' }} />
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={front} className="layer fc-frontfx" />
          {!bare && <BasementFront />}
        </div>
        {!bare && <Vignette />}
        {!bare && <Grain />}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Emotown's outdoor ring (world units, 600 x 460)
export function RingBare() {
  return (
    <svg className="fc-ringback" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} width={WORLD.w} height={WORLD.h} aria-hidden>
      <defs>
        <linearGradient id="fcMatBare" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CFC6E3" /><stop offset="1" stopColor="#EDE8F7" /></linearGradient>
      </defs>
      <path d="M 70 352 L 530 352 L 578 424 L 22 424 Z" fill="url(#fcMatBare)" stroke="#111" strokeWidth="3" />
      <path d="M 22 424 L 578 424 L 578 456 L 22 456 Z" fill="#2A1640" stroke="#111" strokeWidth="3" />
      <ellipse cx="300" cy="392" rx="110" ry="18" fill="none" stroke="#E84D7F" strokeOpacity="0.3" strokeWidth="6" />
      {[64, 522].map((x) => <rect key={x} x={x} y="232" width="14" height="124" rx="4" fill="#2A1640" stroke="#111" strokeWidth="2.6" />)}
      {[16, 566].map((x) => <rect key={x} x={x} y="300" width="18" height="156" rx="5" fill="#2A1640" stroke="#111" strokeWidth="2.6" />)}
      {[[62, 226], [520, 226], [13, 294], [563, 294]].map(([x, y]) => <rect key={x} x={x} y={y} width="24" height="10" rx="3" fill="#E8C45A" stroke="#111" strokeWidth="2.2" />)}
      {[[250, '#E84D7F'], [282, '#F8F8FF'], [314, '#8F6FC8']].map(([y, c]) => (
        <g key={String(y)}>
          <path d={`M 78 ${y} Q 300 ${Number(y) + 7} 522 ${y}`} fill="none" stroke="#111" strokeWidth="8" strokeLinecap="round" />
          <path d={`M 78 ${y} Q 300 ${Number(y) + 7} 522 ${y}`} fill="none" stroke={String(c)} strokeWidth="5" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
