/**
 * The r3tards character's own ways in the room (LAB ONLY). The director asks these first (director.ts registerOwnWays);
 * every other action is the shared one, with `tune` giving the numbers it needs for him.
 *
 * His face is up on a stick, a long way over a bowl on the floor, and a stick cannot hunker down like a cat: so he walks
 * up behind the bowl and sits on the floor with it in his lap, legs out either side, hands on its rim, and eats from there.
 */
import { Prop, type Director, type OwnWays } from '../scene/director';
import type { Dir } from '../pet/rig';
import { WORLD } from '../scene/world';
import type { R3Moves } from './moves';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The middle of the face in the drawing's own units: hearts and sparkles come from there. */
export const HEAD: [number, number] = [100, 78];

export type R3Ways = OwnWays;

export function r3Ways(d: Director): R3Ways {
  const k = d.kit();
  const rig = d.rig;
  const own = () => rig.own as R3Moves;

  async function feed() {
    const st = k.st();
    const dir: Dir = st.x < WORLD.w / 2 ? 1 : -1;            // the bowl lands on the roomier side
    const BW = 104;                                            // a bowl that fits in his lap (the cat's is 136)
    const bx = clamp(st.x + dir * 150, 140, WORLD.w - 140);
    const bowl = new Prop(k.L.front, 'bowl', BW).place(bx, WORLD.floor + 12);
    bowl.el.style.transformOrigin = '50% 100%';
    bowl.anim([
      { transform: 'translateY(-280px) scale(0.9)', opacity: 0, offset: 0, easing: 'cubic-bezier(.45,0,1,.55)' }, { transform: 'translateY(-200px) scale(0.92)', opacity: 1, offset: 0.16, easing: 'cubic-bezier(.45,0,1,.55)' },
      { transform: 'translateY(0) scale(1.06, 0.9)', offset: 0.62, easing: 'ease-out' }, { transform: 'translateY(-8px) scale(0.98, 1.03)', offset: 0.78, easing: 'ease-in' },
      { transform: 'translateY(0) scale(1)', offset: 0.9 }, { transform: 'none', offset: 1 },
    ], { duration: 820 });
    k.sfx('bowl.drop', { delay: 0.5, rate: 1.1 });
    setTimeout(() => k.crumbs(3, bx, WORLD.floor - 22, dir), 520);
    await wait(520);
    k.voice('huh', { delay: 0.1 });
    await rig.perk();
    rig.look(dir * 0.9, 0.4);
    rig.tilt(dir);
    await wait(520);
    rig.release('tilt', 260); rig.release('look', 260);
    // up behind it, and down onto the floor with it in his lap
    await k.walkTo(bx);
    rig.look(0, 0.9);
    own().sit(true);
    k.sfx('land', { delay: 0.4, v: 0.6 });
    await wait(620);
    await rig.sniff();
    own().eatPose();
    await wait(460);
    const layers = ['#food3', '#food2', '#food1'].map((sel) => bowl.find(sel));
    const mouth = { x: bx + dir * 4, y: WORLD.floor - 44 };
    const onBite = (i: number) => {
      k.crumbs(2, mouth.x, mouth.y, dir);
      bowl.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${-dir * 2}deg) translateY(1px)`, offset: 0.4, easing: 'ease-out' }, { transform: 'rotate(0)' }], { duration: 300, easing: 'ease-in-out' });
      const eat = i === 1 ? layers[0] : i === 3 ? layers[1] : i === 5 ? layers[2] : null;
      if (eat) eat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    };
    await rig.eat(3, dir, onBite);
    // a pleased look up between sittings
    rig.release('eat', 420); rig.release('look', 420);
    rig.face('happy', 'smile', 200);
    k.voice('yum', { delay: 0.25 });
    rig.tilt(-dir as Dir);
    await wait(900);
    rig.release('tilt', 300);
    rig.face('open', 'idle', 200);
    own().eatPose(); rig.look(0, 0.9);
    await wait(460);
    await rig.eat(3, dir, (i) => onBite(i + 3));
    await rig.lickBowl(dir);
    rig.release('eat', 480); rig.release('look', 480);
    await wait(420);
    await rig.lick();
    rig.face('happy', 'smile');
    k.hearts(3);
    k.voice('happy');
    // the bowl is taken out of his lap first, then he gets back up onto his feet (standing up with it still there, his
    // feet were in the bowl)
    await wait(500);
    k.sfx('slide', { dur: 0.4, v: 0.6 });
    void bowl.remove(460, [{ transform: 'translateX(0)', opacity: 1, easing: 'ease-in' }, { transform: `translateX(${dir * 280}px)`, opacity: 0 }]);
    await wait(380);
    rig.release('sit', 520);
    await wait(560);
    await rig.shimmy();
    await wait(300);
    rig.restFace();
    await wait(200);
  }

  return {
    feed,
    tune: {
      head: HEAD,
      // all measured on the rig in the lab (the hand against the prop, frozen at the touch)
      dreidel: { w: 205, reach: 39 },           // its knob (71.7 of its drawing's 104 up from the point) under the hand of an arm held out 15 degrees (moves.ts twist); clear of his foot
      darbuka: { w: 76, reach: 56 },            // its skin under the hand at the strike, clear of his feet
      kapparot: { top: 182, cx: 0, rx: 94 },    // she circles over the brows, wide of the face either side
      // The falcon lands on his left arm, held out to the side (the operator: "we should probably have it landing on his arm
      // instead"; it used to land on his brows). The perch is the hand's end, on its upper side, in #legLover: an empty twin
      // of the arm drawn in front of everything, because the arm itself is behind his face. It comes in from that side, up
      // onto the arm, facing him, and turns away before it leaves. A size down: at the others' 100 it stood from his hand to
      // his eyes.
      falcon: { w: 78, perch: { host: 'legLover', at: [78.45, 153.1] }, from: -1, onto: [60, -46], turn: true, minX: 160 },
    },
  };
}
