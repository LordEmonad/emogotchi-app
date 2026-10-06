/**
 * The r3tards character's own moves (LAB ONLY: only its lab chunk imports this). The rig asks these first wherever a
 * character's own move goes (rig.ts registerOwnMoves) and does its usual thing for anything left out.
 *
 * He is a stick figure: the arms (#legL, #legR) hang from the shoulder, the legs (#footL, #footR) from the hip, each a
 * line that turns about its root. A positive rotation swings a hanging limb to the screen's LEFT. So where the cat paws
 * at a ball he kicks it, his walk is a side-step with real legs, and he sits down on the floor to eat.
 */
import type { Dir, DrumArm, OwnMoves, PetRig } from '../pet/rig';

// r3tards.py: the left leg hangs 17 degrees off plumb and is 52.7 long, the hip is 50.4 above the feet
const LEG = 52.7; const LEG_REST = 17; const HIP_UP = 50.4;
const rad = (d: number) => (d * Math.PI) / 180;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type R3Moves = OwnMoves & {
  /** Sit down on the floor, legs out to either side (held under 'sit'); `arms`: hands out to a bowl's rim. */
  sit(arms?: boolean, ms?: number): void;
  /** Face down into the bowl in his lap (held under 'eat', so the usual release ends it). */
  eatPose(): void;
};

export function r3Moves(rig: PetRig): R3Moves {
  const k = rig.kit();
  const el = k.el;
  /** the kicking leg on side `dir`, and the sign that swings it outward */
  const leg = (dir: Dir) => ({ kick: dir < 0 ? el.footL : el.footR, stand: dir < 0 ? el.footR : el.footL, s: dir < 0 ? 1 : -1 });

  /**
   * The jaw drops, or shuts. His wide mouth (#mouth-gape) is a drawing of its own whose lower lip hangs out past the
   * lips' outline, so it is never faded in over the open mouth (a see-through jaw for a few frames): the two swap in one
   * frame, at the height where the jaw just covers the lower lip, and the jaw travels the rest of the way.
   */
  const gape = el['mouth-gape'];
  const SHUT = 'scaleY(0.72)';
  const jaw = async (open: boolean) => {
    if (open) {
      k.face(undefined, 'gape', 1);
      k.one(gape, [{ transform: SHUT, easing: 'cubic-bezier(.2,.8,.3,1)' }, { transform: 'none' }], { duration: 240, composite: 'add' });
      return;
    }
    const a = k.one(gape, [{ transform: 'none', easing: 'ease-in' }, { transform: SHUT }], { duration: 170, composite: 'add', fill: 'forwards' });
    await wait(170);
    k.face(undefined, 'open', 1);
    await wait(30);
    a?.cancel();
  };

  return {
    // There is no head for a crown to sit on: it floats over the brows, and so does everything else worn there. So
    // whatever takes that seat hides the crown (the rig gilds the piece instead): the hat (its cone is narrower than the
    // crown, whose points stood out either side), the hair, the kippah, the keffiyeh, the pumpkin.
    // (the beanie gives him a head: the crown sits on top of it, and the hair under it does not count)
    crownHidden: () => { const w = k.wearing(); return (k.hair() && !w.has('beanie')) || w.has('witch') || w.has('pumpkin') || w.has('kippah') || w.has('keffiyeh'); },
    // a ghost's halo floats over whatever is on the brows, not through it
    haloLift: () => {
      const w = k.wearing(); const crown = k.crowned();
      if (w.has('witch')) return k.hair() ? 96 : 72;
      if (w.has('pumpkin')) return 30;
      if (w.has('keffiyeh')) return 20;
      if (w.has('beanie')) return crown ? 70 : 42;                               // over the knit (and the crown sat on it)
      if (k.hair()) return w.has('kippah') ? 44 : 24;
      if (w.has('zombie')) return w.has('kippah') ? 46 : crown ? 62 : 34;      // over the brain, and the crown or the kippah perched on it
      if (w.has('mummy')) return w.has('kippah') ? 38 : crown ? 52 : 24;       // over the wrapped head
      return w.has('kippah') ? 12 : crown ? 24 : 0;
    },
    // a zombie's crown perches on the brain, a mummy's on the top of the wrapped head (both have a head for it)
    crownLift: () => { const w = k.wearing(); return w.has('beanie') ? 'translate(0px, -44px)' : w.has('zombie') ? 'translate(2px, -36px)' : w.has('mummy') ? 'translate(1px, -26px)' : ''; },
    // the sleep z's rise beside the brows: clear of the hat's brim, the hood, the hair, the pumpkin
    zzzAt: () => { const w = k.wearing(); return w.has('witch') ? 'translate(26px, 2px)' : w.has('pumpkin') ? 'translate(18px, -8px)' : w.has('keffiyeh') ? 'translate(20px, -10px)' : w.has('beanie') ? 'translate(16px, -16px)' : k.hair() ? 'translate(12px, -14px)' : w.has('zombie') || w.has('mummy') ? 'translate(12px, -12px)' : ''; },
    // A tap with the foot: the leg on that side swings out onto the ball, the arms out a touch for balance.
    pat(dir) {
      const { kick, s } = leg(dir);
      return k.shot(340, (A, M) => {
        A(kick, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${s * 6}deg) translateY(-3px)`, offset: 0.22, easing: 'ease-in' }, { transform: `rotate(${s * 19}deg)`, offset: 0.42, easing: 'ease-out' }, { transform: `rotate(${s * 15}deg)`, offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${-dir * 2.5}deg)`, offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(10deg)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateY(1px)`, offset: 0.5 }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${dir * 8}%, 18%)`, offset: 0.4 }, { transform: `translate(${dir * 8}%, 18%)`, offset: 0.65 }, { transform: 'none', offset: 1 }]);
      });
    },
    // A proper kick: the leg draws back across the other, whips out through the ball (the director squashes it at
    // 110 ms) and follows through high; he leans back off it and the arms fly up.
    bat(dir) {
      const { kick, stand, s } = leg(dir);
      return k.shot(340, (A) => {
        A(kick, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: `rotate(${-s * 20}deg)`, offset: 0.14, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: `rotate(${s * 22}deg)`, offset: 0.32, easing: 'ease-out' }, { transform: `rotate(${s * 58}deg)`, offset: 0.52, easing: 'ease-in-out' }, { transform: `rotate(${s * 30}deg)`, offset: 0.76, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(stand, [{ transform: 'rotate(0)', offset: 0 }, { transform: `rotate(${-s * 5}deg)`, offset: 0.4, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg)`, offset: 0.14 }, { transform: `rotate(${-dir * 7}deg) translateX(${-dir * 3}px)`, offset: 0.45, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(48deg)', offset: 0.42, easing: 'ease-out' }, { transform: 'rotate(30deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
        A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-48deg)', offset: 0.42, easing: 'ease-out' }, { transform: 'rotate(-30deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 5}deg)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
      });
    },
    // The ball at his feet: he looks down at it, arms out wide, very pleased (the rig has set the happy face).
    hug() {
      k.hold('hug', (H, M) => {
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(5px) rotate(-3deg)' }]);
        H(el.legL, [{ transform: 'none' }, { transform: 'rotate(34deg)' }]);
        H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-34deg)' }]);
        M(k.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0, 16%)' }]);
      }, 360);
    },
    // ---- the items he does something with: the dreidel, the darbuka, the kapparot hen, the falcon ----
    // An arm hangs 33 degrees off plumb and is 40 long; a positive turn swings a hanging limb to the screen's LEFT, so the
    // arm on side `dir` goes out with a turn of -dir. Past about 55 it would be behind his face: nothing lifts one so far.
    /** The dreidel's stem: the arm on that side comes out onto the knob (15 from rest: measured, ways.ts tune),
     *  holds it, and snaps back toward him for the spin; he leans in over it. */
    twist(dir) {
      const arm = dir > 0 ? el.legR : el.legL; const o = -dir; const ms = 660;
      return k.shot(ms, (A, M) => {
        A(arm, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${o * 15}deg)`, offset: 0.36, easing: 'ease-in-out' }, { transform: `rotate(${o * 16}deg)`, offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' },
          { transform: `rotate(${o * 2}deg)`, offset: 0.68, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 2}deg)`, offset: 0.36 }, { transform: `rotate(${dir * 2}deg)`, offset: 0.56, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 1.5}deg)`, offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.4 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.56 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.72 }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${dir * 8}%, 16%)`, offset: 0.36 }, { transform: `translate(${dir * 8}%, 16%)`, offset: 0.6 }, { transform: 'none', offset: 1 }]);
      });
    },
    /** The darbuka: the arm on its side drums its head (lifts from rest, measured so the hand lands on the skin: ways.ts tune). */
    drumArm(dir): DrumArm {
      return { hover: 37, hit: 27, dum: 50, tek: 41, limb: dir > 0 ? el.legR : el.legL, rot: (d: number) => `rotate(${(-dir * d).toFixed(2)}deg)`, base: '' };
    },
    /** The hen held up: both arms out wide and as high as they go, his eyes up at her. Held. */
    kapparotRaise() {
      k.hold('kapparot', (H, M) => {
        H(el.legL, [{ transform: 'rotate(0)' }, { transform: 'rotate(52deg)' }]);
        H(el.legR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-52deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-1.5px)' }]);
        M(k.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: 'translate(0, -16%)' }]);
      }, 460);
    },
    /** While she circles: his head and eyes follow her round, the arms sway under her. */
    kapparotFollow(laps, lapMs) {
      const per = 16; const n = per * laps; const ms = laps * lapMs;
      const kf = (f: (th: number) => string): Keyframe[] => Array.from({ length: n + 1 }, (_, i) => ({ transform: f((2 * Math.PI * i) / per), offset: i / n }));
      return k.shot(ms, (A, M) => {
        for (const h of k.heads()) A(h, kf((th) => `rotate(${(3 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        M(k.q.get('pupil'), kf((th) => `translate(${(14 * Math.cos(th)).toFixed(1)}%, ${(3 * Math.sin(th)).toFixed(1)}%)`), { easing: 'linear' });
        A(el.legL, kf((th) => `rotate(${(4 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        A(el.legR, kf((th) => `rotate(${(4 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
      });
    },
    /** The falconer's arm: his left arm held out to the side for it (from 33 degrees off plumb to 59: higher, the bird's head
     *  stood over the corner of his mouth), his eyes on it. Held as 'falcon'. */
    falconReady() {
      k.hold('falcon', (H, M) => {
        H(el.legL, [{ transform: 'rotate(0)' }, { transform: 'rotate(26deg)' }]);
        H(el.legR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'rotate(-1.5deg)' }]);
      }, 520);
    },
    /** It lands: the arm gives under it and springs back. */
    falconGive() {
      return k.shot(420, (A) => {
        A(el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-6deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(1.8deg)', offset: 0.65, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
    },
    // The happy wiggle: the whole of him sways from his feet (never the body over the legs: he is one piece), the arms
    // swinging out the other way and the head lagging a touch.
    shimmy() {
      const sway = (deg: number, last = 0.5): Keyframe[] => [{ transform: 'none', offset: 0 }, { transform: `rotate(${-deg}deg)`, offset: 0.17 }, { transform: `rotate(${deg}deg)`, offset: 0.34 }, { transform: `rotate(${-deg}deg)`, offset: 0.5 }, { transform: `rotate(${deg}deg)`, offset: 0.67 }, { transform: `rotate(${-deg * last}deg)`, offset: 0.84 }, { transform: 'none', offset: 1 }];
      return k.shot(680, (A) => {
        A(el.figure, sway(2.6), { easing: 'ease-in-out' });
        for (const h of k.heads()) A(h, sway(-2.2), { easing: 'ease-in-out' });
        A(el.legL, sway(-11), { easing: 'ease-in-out' }); A(el.legR, sway(-11), { easing: 'ease-in-out' });
      });
    },
    // The yawn: head tipped back, eyes shut, and the jaw dropped (#mouth-gape: his open mouth is never scaled).
    async yawn() {
      const ms = 1700;
      const p = k.shot(ms, (A) => {
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.3 }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.64, easing: 'ease-in-out' }, { transform: 'rotate(1.5deg)', offset: 0.82 }, { transform: 'none', offset: 1 }]);
        // the arms lift a little and drop, a small stretch with it
        A(el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(16deg)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'rotate(16deg)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-16deg)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'rotate(-16deg)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      });
      await wait(ms * 0.14); k.face('closed', 'open', 160);
      await wait(ms * 0.12); jaw(true);
      await wait(ms * 0.36); await jaw(false);
      await wait(ms * 0.06); k.face('open', 'idle', 220);
      await p;
    },
    // The wake-up stretch: up tall, arms out straight to either side (overhead they would be behind his face), head
    // back, eyes shut and the mouth open. Not the yawn's dropped jaw: it hangs down over the shoulders and hid the arms.
    async stretch() {
      const ms = 1500;
      const hold = (to: string): Keyframe[] => [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: to, offset: 0.4, easing: 'ease-in-out' }, { transform: to, offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }];
      const p = k.shot(ms, (A) => {
        A(el.figure, hold('scaleY(1.05)'));
        for (const h of k.heads()) A(h, hold('rotate(-5deg) translateY(-3px)'));
        A(el.legL, hold('rotate(50deg)')); A(el.legR, hold('rotate(-50deg)'));
        A(el.footL, hold('rotate(-5deg)')); A(el.footR, hold('rotate(5deg)'));
      });
      await wait(ms * 0.26); k.face('closed', 'open', 160);
      await wait(ms * 0.46); k.face('open', 'idle', 200);
      await p;
    },
    // A side-step: on every hop the leg toward `dir` reaches out that way and the other pushes after it, and both are
    // back under him as he lands. Both hops of the cycle are the same.
    walkLegs(dir) {
      const stride = (deg: number): Keyframe[] => [
        { transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${deg}deg)`, offset: 0.25, easing: 'ease-in-out' },
        { transform: 'rotate(0)', offset: 0.5, easing: 'ease-out' }, { transform: `rotate(${deg}deg)`, offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
      ];
      return dir < 0 ? { footL: stride(17), footR: stride(9) } : { footL: stride(-9), footR: stride(-17) };
    },
    // Down onto the floor: the legs slide out to either side until they lie along it and the hips come down between
    // them. The drop is worked out from the leg's angle at each step, so the feet stay on the floor all the way.
    sit(arms = false, ms = 520) {
      const OUT = 68;                                          // degrees each leg turns: from 17 off plumb to 85
      const steps = [0, 0.2, 0.4, 0.6, 0.8, 1];
      const drop = (p: number) => HIP_UP - LEG * Math.cos(rad(LEG_REST + OUT * p));
      k.hold('sit', (H) => {
        H(el.figure, steps.map((p) => ({ transform: `translateY(${drop(p).toFixed(2)}px)`, offset: p })));
        H(el.shadow, [{ transform: 'none' }, { transform: 'scaleX(1.9)' }]);
        H(el.footL, steps.map((p) => ({ transform: `rotate(${(OUT * p).toFixed(1)}deg)`, offset: p })));
        H(el.footR, steps.map((p) => ({ transform: `rotate(${(-OUT * p).toFixed(1)}deg)`, offset: p })));
        if (arms) { H(el.legL, [{ transform: 'none' }, { transform: 'rotate(30deg)' }]); H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-30deg)' }]); }
      }, ms);
    },
    // The squat: a stick cannot squash, so the legs go out wide and the hips come down between them (the same sum as
    // the sit, part of the way), elbows out, head ducked, and the strain shakes him.
    squat() {
      const OUT = 30;
      const steps = [0, 0.25, 0.5, 0.75, 1];
      const drop = (p: number) => HIP_UP - LEG * Math.cos(rad(LEG_REST + OUT * p));
      k.face('squeeze', 'frown', 200);
      k.hold('squat', (H) => {
        H(el.figure, steps.map((p) => ({ transform: `translateY(${drop(p).toFixed(2)}px)`, offset: p })));
        H(el.footL, steps.map((p) => ({ transform: `rotate(${(OUT * p).toFixed(1)}deg)`, offset: p })));
        H(el.footR, steps.map((p) => ({ transform: `rotate(${(-OUT * p).toFixed(1)}deg)`, offset: p })));
        H(el.legL, [{ transform: 'none' }, { transform: 'rotate(22deg)' }]);
        H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-22deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(3px) rotate(3deg)' }]);
        H(el.cat, [{ transform: 'translateX(-0.5px)' }, { transform: 'translateX(0.5px)' }], { duration: 90, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      }, 420);
    },
    eatPose() {
      k.hold('eat', (H) => { for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(13px)' }]); }, 420);
    },
  };
}
