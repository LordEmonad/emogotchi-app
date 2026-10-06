/**
 * The crowd round the chalk circle: real pets (operator, 2026-09-29: "the silhouettes of the crowd need improved a lot"),
 * each its own rig in the calm idle (nothing loops, like Emotown's street), dressed in the shop's looks, standing in the
 * dark at the back, on the beer crates and on the stairs. They watch the fight (their eyes and heads follow it), jump
 * and throw their arms up when a blow lands, flinch at a miss, and go wild at the knockout. The fight director drives
 * them through `CrowdCtl`; the basement's shade (Arena.tsx) is laid over them, so the ones out of the bulb's light are
 * dim.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Pet, type Character, type Costume, type PetRig } from '../pet/Pet';
import { petBox } from '../scene/world';

/** One onlooker: which pet, where its feet are (world units), how big against a pet in the room, and its look. */
export type Fan = { c: Character; x: number; feet: number; s: number; costume?: Costume; hair?: boolean; crown?: boolean };

/**
 * Who is in tonight, ordered back to front (the DOM order is the depth order). Everyone stands on the floor (operator,
 * 2026-09-29: "make sure all the characters watching in the background are on the ground"): a row along the back wall,
 * in front of the crates and the foot of the stairs, and one each side of the circle, nearer, half behind the column and
 * the post in the foreground.
 */
/** `small` is a few of them, for the little window over the bar in Emotown (a town full of pets already). */
export function lineup(size: 'full' | 'small' = 'full'): Fan[] {
  const back: Fan[] = [
    { c: 'frog', x: 40, feet: 350, s: 0.48, costume: 'witch' },
    { c: 'frog', x: 112, feet: 352, s: 0.46, crown: true },
    { c: 'sahur', x: 178, feet: 346, s: 0.42, hair: true },
    { c: 'cat', x: 236, feet: 348, s: 0.46, costume: 'pumpkin' },
    { c: 'frog', x: 292, feet: 344, s: 0.44, hair: true },
    { c: 'cat', x: 350, feet: 347, s: 0.46, crown: true },
    { c: 'cat', x: 418, feet: 349, s: 0.46, costume: 'kippah' },
    { c: 'cat', x: 480, feet: 351, s: 0.47, costume: 'witch' },
    { c: 'sahur', x: 548, feet: 352, s: 0.42, costume: 'zombie' },
  ];
  const sides: Fan[] = [
    { c: 'sahur', x: 16, feet: 404, s: 0.6, crown: true },
    { c: 'frog', x: 572, feet: 412, s: 0.62, costume: 'mummy' },
  ];
  const all = size === 'small' ? [...back.filter((_, i) => i % 2 === 0), ...sides] : [...back, ...sides];
  return all.sort((a, b) => a.feet - b.feet);
}

/** A crowd's box: the pet's own box at scale `s`, feet on `feet`. */
function fanBox(f: Fan) {
  const b = petBox(f.c);
  return { w: b.w * f.s, h: b.h * f.s, left: f.x - (b.w * f.s) / 2, top: f.feet - b.footY * f.s };
}

const pick = <T,>(xs: T[], p: number) => xs.filter(() => Math.random() < p);
const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

/** What the director tells the crowd. Every reaction is staggered a little, so they never move as one. */
export class CrowdCtl {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private fans: { rig: PetRig; fan: Fan }[]) {
    for (const { rig, fan } of fans) {
      if (fan.costume) rig.setCostume(fan.costume, 0);
      if (fan.hair) rig.setHair(true, 0);
      if (fan.crown) rig.setCrown(true, 0);
      rig.facing(fan.x < 300 ? 1 : -1);
    }
  }
  private at(ms: number, fn: () => void) { const t = later(ms, () => { this.timers.delete(t); fn(); }); this.timers.add(t); }
  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
  /** Everyone's eyes on a point of the ring (world x). */
  watch(x: number, y = 320) {
    for (const { rig, fan } of this.fans) {
      const dx = Math.max(-1, Math.min(1, (x - fan.x) / 220));
      const dy = Math.max(-0.6, Math.min(0.8, (y - (fan.feet - 60)) / 260));
      this.at(Math.random() * 180, () => rig.look(dx, dy));
    }
  }
  /** A blow lands: a roar. The nearer and the bigger the blow, the more of them go up. */
  roar(power: 1 | 2) {
    for (const { rig } of pick(this.fans, power === 2 ? 0.85 : 0.5)) {
      this.at(Math.random() * 220, () => {
        rig.cheer();
        if (Math.random() < (power === 2 ? 0.7 : 0.4)) void rig.hop();
        this.at(600 + Math.random() * 500, () => { rig.release('cheer', 320); rig.restFace(300); });
      });
    }
    for (const { rig } of pick(this.fans, 0.3)) this.at(Math.random() * 200, () => rig.face('open', 'open', 80));
  }
  /** A miss: an "ooh", a flinch. */
  gasp() {
    for (const { rig } of pick(this.fans, 0.6)) {
      this.at(Math.random() * 160, () => { rig.face('open', 'open', 60); this.at(700, () => rig.restFace(300)); });
    }
  }
  /** The knockout: the whole room goes up, and keeps going a while. */
  erupt() {
    for (const { rig } of this.fans) {
      this.at(Math.random() * 300, () => {
        rig.cheer();
        const n = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) this.at(k * 520 + Math.random() * 200, () => void (Math.random() < 0.5 ? rig.jump() : rig.hop()));
        this.at(2600 + Math.random() * 900, () => { rig.release('cheer', 400); rig.restFace(400); });
      });
    }
  }
  /** Back to standing about (a new fight, the lab's reset). */
  settle() {
    this.destroy();
    for (const { rig } of this.fans) { rig.release('cheer', 200); rig.unlook(); rig.restFace(200); }
  }
}

/** The crowd, drawn; `onReady` gets the controller once every rig exists. */
export function Crowd({ fans, onReady }: { fans: Fan[]; onReady: (c: CrowdCtl | null) => void }) {
  const rigs = useRef<(PetRig | null)[]>(fans.map(() => null));
  const cb = useRef(onReady); cb.current = onReady;
  const ctl = useRef<CrowdCtl | null>(null);
  const tryReady = () => {
    if (ctl.current || rigs.current.some((r) => !r)) return;
    ctl.current = new CrowdCtl(rigs.current.map((rig, i) => ({ rig: rig!, fan: fans[i]! })));
    cb.current(ctl.current);
  };
  useEffect(() => () => { ctl.current?.destroy(); ctl.current = null; cb.current(null); }, []);
  const boxes = useMemo(() => fans.map(fanBox), [fans]);
  return (
    <>
      {fans.map((f, i) => (
        <div key={i} className="fc-fan" style={{ left: boxes[i]!.left, top: boxes[i]!.top, width: boxes[i]!.w, height: boxes[i]!.h }}>
          <Pet character={f.c} calm onRig={(r) => { rigs.current[i] = r; if (!r) { ctl.current?.destroy(); ctl.current = null; } else tryReady(); }} style={{ width: '100%', height: '100%' }} />
        </div>
      ))}
    </>
  );
}
