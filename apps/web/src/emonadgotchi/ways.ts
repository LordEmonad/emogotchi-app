/**
 * Emonad's own ways in the room as a pet (LAB ONLY). The director asks these first (director.ts registerOwnWays); every
 * other action is the shared one, with `tune` giving the numbers it needs for him.
 *
 * He is tall and his hands hang far over the floor, so he does not eat off it: the bowl drops from the top of the room
 * into his hands in front of his chest (they are up for it), he eats from it there with his head down over it, and when
 * it is empty he flings it away off the side of the room.
 */
import { Prop, type Director, type OwnWays } from '../scene/director';
import type { Dir } from '../pet/rig';
import { WORLD } from '../scene/world';
import { HOLD, type EgMoves } from './moves';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The middle of his face in the drawing's own units: hearts and sparkles come from there. */
export const HEAD: [number, number] = [100.6, 57];
/** The bowl in his hands, in the drawing's own units: its width, the middle of its bottom (just under his hands). */
const BOWL = { w: 34, x: 100, y: 106 };

export function egWays(d: Director): OwnWays {
  const k = d.kit();
  const rig = d.rig;
  const own = () => rig.own as EgMoves;

  async function feed() {
    const st = k.st();
    const dir: Dir = st.x < WORLD.w / 2 ? 1 : -1;            // he flings it away to the roomier side
    // hands up for it, eyes up to where it comes from
    k.voice('huh', { delay: 0.05 });
    await rig.perk();
    own().holdBowl(420);
    rig.gaze(0, -40, 260);
    await wait(380);
    // it drops from the top of the room into his hands
    const at = k.at(BOWL.x, BOWL.y);
    const bowl = new Prop(k.L.front, 'bowl', BOWL.w * k.S).place(at.x, at.y);
    bowl.el.style.transformOrigin = '50% 100%';
    const fall = at.y + 40;
    const DROP = 620;
    bowl.anim([
      { transform: `translateY(${-fall}px) rotate(${dir * 8}deg)`, offset: 0, easing: 'cubic-bezier(.5,0,1,.6)' },
      { transform: 'translateY(0) rotate(0)', offset: 0.8, easing: 'ease-out' }, { transform: 'translateY(3px) scale(1.03, 0.95)', offset: 0.9, easing: 'ease-in-out' },
      { transform: 'none', offset: 1 },
    ], { duration: DROP });
    setTimeout(() => rig.gaze(0, 30, 200), DROP * 0.55);
    await wait(DROP * 0.8);
    k.sfx('bowl.drop', { v: 0.7, rate: 1.15 });
    void rig.kit().shot(260, (A) => { A(rig.kit().el.figure, [{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.35 }, { transform: 'none' }], { easing: 'ease-out' }); });
    k.crumbs(2, at.x, at.y - BOWL.w * k.S * 0.5, dir);
    await wait(DROP * 0.2 + 260);
    // he eats from it, head down over it
    rig.gaze();
    await rig.sniff();
    own().eatPose();
    await wait(380);
    const layers = ['#food3', '#food2', '#food1'].map((sel) => bowl.find(sel));
    const mouth = k.at(100.6, 72);
    const bob: Keyframe[] = [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `translateY(${(2 * k.S).toFixed(2)}px)`, offset: 0.34, easing: 'ease-in-out' }, { transform: `translateY(${(2 * k.S).toFixed(2)}px)`, offset: 0.44, easing: 'ease-in-out' }, { transform: 'none', offset: 0.7 }, { transform: 'none', offset: 1 }];
    const onBite = (i: number) => {
      k.crumbs(2, mouth.x, mouth.y + 18, dir);
      const eat = i === 1 ? layers[0] : i === 3 ? layers[1] : i === 5 ? layers[2] : null;
      if (eat) eat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    };
    // (the hands dip with each bite, rig.eat's body bob: the bowl in them dips with them)
    bowl.anim(bob, { duration: 640, iterations: 3 });
    await rig.eat(3, dir, onBite);
    rig.release('eat', 380);
    rig.face('happy', 'smile', 200);
    k.voice('yum', { delay: 0.2 });
    await wait(820);
    rig.face('open', 'idle', 200);
    own().eatPose();
    await wait(380);
    bowl.anim(bob, { duration: 640, iterations: 3 });
    await rig.eat(3, dir, (i) => onBite(i + 3));
    rig.release('eat', 360);
    rig.face('happy', 'smile', 160);
    await wait(420);
    // empty: into one hand, a wind-up, and skimmed off the side of the room spinning like a frisbee. Until he lets go
    // the bowl rides in his throwing hand: every frame its middle is put where that hand is (a probe in the hand), first
    // sliding there from between his hands, then carried through the wind-up and the swing.
    const side = dir > 0 ? 'R' : 'L';
    const host = rig.kit().root.querySelector(`#fore${side}over`);
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    probe.setAttribute('cx', side === 'L' ? '82.4' : '117.6'); probe.setAttribute('cy', '144'); probe.setAttribute('r', '0.01'); probe.setAttribute('fill', 'none');
    host?.appendChild(probe);
    const world = () => {
      const r = probe.getBoundingClientRect(), f = k.L.front.getBoundingClientRect(); const kx = f.width / WORLD.w || 1;
      return { x: (r.left + r.width / 2 - f.left) / kx, y: (r.top + r.height / 2 - f.top) / kx };
    };
    const mid = { x: at.x, y: at.y - bowl.h / 2 };       // the bowl's middle as it sits between his hands
    bowl.el.style.transformOrigin = '50% 50%';
    const FLING = 980, RELEASE = 0.55;
    const clock = bowl.inner.animate([{ opacity: 1 }, { opacity: 1 }], { duration: FLING });
    let riding = true;
    let cur = 'none';
    const ride = () => {
      if (!riding || !bowl.el.isConnected) return;
      const t = Math.min(1, Number(clock.currentTime ?? 0) / FLING);
      const h = world();
      const b = Math.min(1, t / 0.16); const e = b * b * (3 - 2 * b);           // sliding into the hand
      const x = mid.x + (h.x - mid.x) * e - mid.x, y = mid.y + (h.y - mid.y) * e - mid.y;
      // (tipped toward him in the wind-up, then flat out along the throw)
      const tw = t < 0.4 ? -dir * 18 * Math.sin((t / 0.4) * Math.PI / 2) : -dir * 18 + dir * 40 * Math.min(1, (t - 0.4) / 0.16);
      cur = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${tw.toFixed(1)}deg)`;
      bowl.el.style.transform = cur;
      requestAnimationFrame(ride);
    };
    requestAnimationFrame(ride);
    k.sfx('whoosh', { delay: FLING * RELEASE / 1000 - 0.08 });
    await own().fling(dir, () => {
      riding = false; clock.cancel();
      const h = world(); probe.remove();
      const x0 = h.x - mid.x, y0 = h.y - mid.y;
      const off = (WORLD.w - mid.x) * dir + bowl.w * dir;
      // skimmed: fast off the hand and slowing (a throw, not a drift), climbing a little and dipping as it goes, spinning
      // flat, off the side of the room
      bowl.el.style.transform = '';
      const fly = bowl.el.animate([
        { transform: `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px) rotate(${(dir * 22).toFixed(0)}deg) scaleY(1)`, easing: 'cubic-bezier(.2,.75,.45,1)' },
        { transform: `translate(${(x0 + (off - x0) * 0.55).toFixed(1)}px, ${(y0 - 58).toFixed(1)}px) rotate(${dir * 420}deg) scaleY(0.72)`, offset: 0.5, easing: 'cubic-bezier(.4,0,.8,.6)' },
        { transform: `translate(${off.toFixed(1)}px, ${(y0 - 24).toFixed(1)}px) rotate(${dir * 860}deg) scaleY(0.62)` },
      ], { duration: 580, fill: 'forwards' });
      void fly.finished.then(() => bowl.el.remove(), () => bowl.el.remove());
    });
    void cur;
    rig.face('happy', 'smile');
    k.hearts(3);
    k.voice('happy');
    await wait(400);
    await rig.shimmy();
    await wait(300);
    rig.restFace();
    void HOLD;
  }

  return {
    feed,
    tune: {
      head: HEAD,
      tubClip: true,
      poopBehind: [100, 150],                   // his seat (squatting), behind him: it drops between his feet
      graveX: 80,                               // (clear of his shoes: at the cat's 62 the stone stood on his foot)
      tubJump: 58,                              // (tall: at the cat's 118 his hair went through the ceiling)
      dreidel: { w: 186, reach: 60 },
      darbuka: { w: 96, reach: 68 },
      kapparot: { top: 131, cx: 0, rx: 64, henW: 62 },
      falcon: { w: 66, perch: { host: 'foreLover', at: [81.4, 154.0] }, from: -1, onto: [60, -46], turn: true, minX: 170 },
      guitar: { host: 'body', w: 104 },
      span: [72, 128],
    },
  };
}
