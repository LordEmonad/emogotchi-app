import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pet, type AnyDrawing, type PetRig } from '../pet/Pet';
import { Director } from './director';
import { PROPS, type PropName } from './props';
import { CAT_PAD, petBox, WORLD } from './world';
import type { SceneName } from './Scenery';
// A room theme's scenery is a chunk of its own, with its art (roomArt.ts): only a pet in a room theme loads it (the mobile
// pass, 2026-09-29). Until it lands the room shows the theme's colours (stage.css) without its pictures.
const SceneryBack = lazy(() => import('./Scenery').then((m) => ({ default: m.SceneryBack })));
const SceneryFront = lazy(() => import('./Scenery').then((m) => ({ default: m.SceneryFront })));
import { SoundControl } from '../sound/Control';
import { useMusic } from '../sound/useMusic';
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
  /** A room theme from the item shop, or null for the plain room. */
  scene?: SceneName | null;
  /** Which character lives here (the cat unless told otherwise). */
  character?: AnyDrawing;
  /** the rig's lite profile: fewer things moving at once, for a slow screen (the rabbit r1) */
  lite?: boolean;
  /** A room that is only on show (one of a row of pets, a reel that loops for ever): no sound, no music. */
  quiet?: boolean;
  children?: ReactNode;
};

/** The room: a fixed world box scaled to the container. Props are placed imperatively by the director. */
export function Stage({ onDirector, night, thought, thoughtSide = 1, scene = null, character = 'cat', lite = false, quiet = false, onPet: onPetCb, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const catHost = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [rig, setRig] = useState<PetRig | null>(null);
  const director = useRef<Director | null>(null);
  const cb = useRef(onDirector); cb.current = onDirector;
  const quietRef = useRef(quiet); quietRef.current = quiet;
  const [mood, setMood] = useState({ asleep: false, dead: false });
  const B = petBox(character);   // the box scales per character (sahur stands taller); the rig never knows

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setK(e.contentRect.width / WORLD.w); });
    ro.observe(el);
    setK(el.clientWidth / WORLD.w);
    return () => ro.disconnect();
  }, []);

  // a layout effect, so the page can open the room on its pet as it is (director.arrive) before the first frame is drawn
  useLayoutEffect(() => {
    if (!rig || !back.current || !front.current || !catHost.current) return;
    const d = new Director(rig, { back: back.current, front: front.current, cat: catHost.current });
    d.muted = quietRef.current;
    director.current = d;
    cb.current(d);
    // the room's music follows the pet: asleep, dead (the page may open the room on either: director.arrive)
    const mood = () => { const st = d.getState(); setMood((m) => (m.asleep === st.sleeping && m.dead === st.dead ? m : { asleep: st.sleeping, dead: st.dead })); };
    const off = d.subscribe(mood); mood();
    return () => { off(); d.destroy(); director.current = null; cb.current(null); };
  }, [rig]);
  useEffect(() => { if (director.current) director.current.muted = quiet; }, [quiet]);
  useMusic(quiet || !rig ? null : { place: 'room', who: character, scene, asleep: mood.asleep, dead: mood.dead });

  const onPet = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = director.current; if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (d.isActing || d.getState().dead) return;   // a tap while it potters about still counts: the nuzzle follows
    onPetCb?.();
    d.pet(e.clientX - r.left < r.width / 2 ? -1 : 1, { quick: true }).catch(() => {});   // a tap is always the quick nuzzle, never kapparot
  };

  return (
    <div ref={box} className="stage" data-night={night ? 'on' : 'off'} data-scene={scene ?? 'plain'} style={{ aspectRatio: `${WORLD.w} / ${WORLD.h}` }}>
      <div className="world" style={{ width: WORLD.w, height: WORLD.h, transform: `scale(${k})` }}>
        <div className="wall" />
        <div className="dots" />
        <div className="stars">{STARS.map((st, i) => <span key={i} className="star" style={{ left: st.x, top: st.y, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />)}</div>
        <div className="floor" style={{ top: WORLD.floor - 34 }} />
        <div className="rug" style={{ top: WORLD.floor - 4 }} />
        <div className="moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />
        {scene && <Suspense fallback={null}><SceneryBack scene={scene} /></Suspense>}
        <div ref={back} className="layer" />
        <div ref={catHost} className="cathost" style={{ width: B.hostW, height: B.hostH, top: B.hostTop, left: WORLD.w / 2 - B.w / 2 - CAT_PAD.side }}>
          <div className="catbody" style={{ width: B.w, height: B.h, top: CAT_PAD.top, left: CAT_PAD.side }} onPointerDown={onPet}>
            <Pet onRig={setRig} character={character} lite={lite} style={{ width: '100%', height: '100%' }} />
            <Thought icon={thought} side={thoughtSide} />
          </div>
        </div>
        <div ref={front} className="layer" />
        {scene && <Suspense fallback={null}><SceneryFront scene={scene} /></Suspense>}
        {children}
      </div>
      {!quiet && <SoundControl className="in-room" />}
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
