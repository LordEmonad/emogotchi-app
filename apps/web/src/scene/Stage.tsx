import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pet, type PetRig } from '../pet/Pet';
import { Director } from './director';
import { PROPS, type PropName } from './props';
import { CAT, CAT_PAD, HOST_H, HOST_TOP, HOST_W, WORLD } from './world';
import './stage.css';

type Props = {
  onDirector: (d: Director | null) => void;
  /** Called when the cat is petted (the animation runs regardless). */
  onPet?: () => void;
  night: boolean;
  /** Icon to show in a thought bubble over the cat's head, or null. */
  thought: PropName | null;
  /** Which side of the head the bubble hangs on (away from the nearest wall). */
  thoughtSide?: 1 | -1;
  children?: ReactNode;
};

/** The room: a fixed world box scaled to the container. Props are placed imperatively by the director. */
export function Stage({ onDirector, night, thought, thoughtSide = 1, onPet: onPetCb, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const catHost = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [rig, setRig] = useState<PetRig | null>(null);
  const director = useRef<Director | null>(null);
  const cb = useRef(onDirector); cb.current = onDirector;

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setK(e.contentRect.width / WORLD.w); });
    ro.observe(el);
    setK(el.clientWidth / WORLD.w);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!rig || !back.current || !front.current || !catHost.current) return;
    const d = new Director(rig, { back: back.current, front: front.current, cat: catHost.current });
    director.current = d;
    cb.current(d);
    return () => { d.destroy(); director.current = null; cb.current(null); };
  }, [rig]);

  const onPet = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = director.current; if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (d.isBusy || d.getState().dead) return;
    onPetCb?.();
    d.pet(e.clientX - r.left < r.width / 2 ? -1 : 1).catch(() => {});
  };

  return (
    <div ref={box} className="stage" data-night={night ? 'on' : 'off'} style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }}>
      <div className="world" style={{ width: WORLD.w, height: WORLD.h, transform: `scale(${k})` }}>
        <div className="wall" />
        <div className="dots" />
        <div className="stars">{STARS.map((st, i) => <span key={i} className="star" style={{ left: st.x, top: st.y, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />)}</div>
        <div className="floor" style={{ top: WORLD.floor - 34 }} />
        <div className="rug" style={{ top: WORLD.floor - 4 }} />
        <div className="moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />
        <div ref={back} className="layer" />
        <div ref={catHost} className="cathost" style={{ width: HOST_W, height: HOST_H, top: HOST_TOP, left: WORLD.w / 2 - CAT.w / 2 - CAT_PAD.side }}>
          <div className="catbody" style={{ width: CAT.w, height: CAT.h, top: CAT_PAD.top, left: CAT_PAD.side }} onPointerDown={onPet}>
            <Pet onRig={setRig} style={{ width: '100%', height: '100%' }} />
            <Thought icon={thought} side={thoughtSide} />
          </div>
        </div>
        <div ref={front} className="layer" />
        {children}
      </div>
    </div>
  );
}

const STARS = Array.from({ length: 18 }, (_, i) => ({ x: ((i * 137.5) % 560) + 20, y: ((i * 89.3) % 190) + 14, s: 2 + (i % 3), d: (i * 0.37) % 3 }));

function Thought({ icon, side }: { icon: PropName | null; side: 1 | -1 }) {
  // keep the last icon mounted while fading out
  const [shown, setShown] = useState<PropName | null>(icon);
  useEffect(() => { if (icon) setShown(icon); else { const t = setTimeout(() => setShown(null), 260); return () => clearTimeout(t); } }, [icon]);
  if (!shown) return null;
  return (
    <div className="thought" data-on={icon ? 'on' : 'off'} data-side={side === 1 ? 'right' : 'left'}>
      <div className="thought-cloud" dangerouslySetInnerHTML={{ __html: PROPS.thought }} />
      <div className="thought-icon" dangerouslySetInnerHTML={{ __html: PROPS[shown] }} />
    </div>
  );
}
