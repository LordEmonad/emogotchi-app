/**
 * Emonad's own moves as a pet (LAB ONLY: only his chunk imports this). The rig asks these first wherever a character's own
 * move goes (rig.ts registerOwnMoves) and does its usual thing for anything left out.
 *
 * He is a tall figure drawn head-on: each arm (#legL, #legR: the rig's names) turns about its shoulder and its forearm
 * (#foreL, #foreR) about the elbow; each leg (#footL, #footR) turns about the hip and its shin (#shinL, #shinR) about the
 * knee. A positive rotation swings a hanging limb to the screen's LEFT, so the picture's left arm and leg go OUT with a
 * positive turn and the right ones with a negative. His hands hang 58 units over the floor, so the ball is kicked, and
 * whatever is down on the floor is reached by bending the knees.
 */
import type { Dir, DrumArm, OwnMoves, PetRig, SelfieArm, StrumLimb } from '../pet/rig';
import { startShoulders } from './shoulders';

// emonadgotchi.py (view units): the thigh is 25.2 long (hip to knee), the shin and foot 43.2 (knee to floor)
const THIGH = 25.2; const SHIN = 43.2;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A crouch with the knees out: the thigh turns out by `a`, the shin comes back under it so the foot stays where it was
 *  (b: the shin's own lean back in, absolute), and the hips come down by `drop` so the feet stay on the floor. */
export function crouchOf(a: number) {
  const knee = THIGH * Math.sin(rad(a));
  const b = deg(Math.asin(Math.min(1, knee / SHIN)));
  const drop = THIGH + SHIN - (THIGH * Math.cos(rad(a)) + SHIN * Math.cos(rad(b)));
  return { thigh: a, shin: -(a + b), drop };
}

/** The bowl held in both hands in front of his chest: the upper arms out a little, the forearms up toward us (turned up and
 *  foreshortened). His hands are then at (100 -+ 14.4, 101): emonadgotchi.py's joints through these angles. */
export const HOLD = { upper: 18, fore: -150, fs: 0.48, hands: [[85.6, 101], [114.4, 101]] as const };

export type EgMoves = OwnMoves & {
  /** Down into a crouch, knees out (held under 'crouchdown'); `arms`: both hands down in front of him. */
  crouchDown(a: number, ms?: number, arms?: number): void;
  /** Both hands up in front of his chest, as if round a bowl (held under 'holdbowl'). */
  holdBowl(ms?: number): void;
  /** Head down over the bowl at his chest (held under 'eat', so the usual release ends it). */
  eatPose(): void;
  /** The bowl flung away: the hand on side `dir` swings out and up, letting go at `release` of the way (`onRelease`). */
  fling(dir: Dir, onRelease: () => void): Promise<void>;
};

export function egMoves(rig: PetRig): EgMoves {
  const k = rig.kit();
  const el = k.el;
  // his shoulders follow his arms every frame (shoulders.ts)
  startShoulders(k.root);
  // (his shins and forearms are groups the rig does not know by name: found here, once)
  const part = (id: string) => k.root.querySelector('#' + id);
  const SHIN = { L: part('shinL'), R: part('shinR') }; const FORE = { L: part('foreL'), R: part('foreR') };
  // (the forearms are drawn in #foreLover / #foreRover, twins of the empty #foreL / #foreR, in front of his hair: what is
  // put in his hand goes there. Moves turn #foreL / #foreR and the twins follow; only the guitar's limbs are the twins
  // themselves, because the director draws the held guitar inside the limb it is given.)
  const OVER = { L: part('foreLover'), R: part('foreRover') };
  const shin = (s: 'L' | 'R') => SHIN[s];
  const fore = (s: 'L' | 'R') => FORE[s];
  const legs = (dir: Dir) => ({ kick: dir < 0 ? el.footL : el.footR, stand: dir < 0 ? el.footR : el.footL, kshin: dir < 0 ? shin('L') : shin('R'), s: dir < 0 ? 1 : -1 });

  const crouchDown = (a: number, ms = 480, arms = 0) => {
    const c = crouchOf(a);
    k.hold('crouchdown', (H) => {
      H(el.figure, [{ transform: 'none' }, { transform: `translateY(${c.drop.toFixed(2)}px)` }]);
      H(el.footL, [{ transform: 'none' }, { transform: `rotate(${c.thigh.toFixed(1)}deg)` }]);
      H(el.footR, [{ transform: 'none' }, { transform: `rotate(${(-c.thigh).toFixed(1)}deg)` }]);
      H(shin('L'), [{ transform: 'none' }, { transform: `rotate(${c.shin.toFixed(1)}deg)` }]);
      H(shin('R'), [{ transform: 'none' }, { transform: `rotate(${(-c.shin).toFixed(1)}deg)` }]);
      H(el.shadow, [{ transform: 'none' }, { transform: `translateY(${(-c.drop).toFixed(2)}px) scaleX(1.25)` }]);
      if (arms) {
        H(el.legL, [{ transform: 'none' }, { transform: `rotate(${(-arms * 0.35).toFixed(1)}deg)` }]);
        H(el.legR, [{ transform: 'none' }, { transform: `rotate(${(arms * 0.35).toFixed(1)}deg)` }]);
        H(fore('L'), [{ transform: 'none' }, { transform: `rotate(${(-arms).toFixed(1)}deg)` }]);
        H(fore('R'), [{ transform: 'none' }, { transform: `rotate(${arms.toFixed(1)}deg)` }]);
      }
    }, ms);
  };

  const holdBowl = (ms = 420) => {
    k.hold('holdbowl', (H) => {
      H(el.legL, [{ transform: 'none' }, { transform: `rotate(${HOLD.upper}deg)` }]);
      H(el.legR, [{ transform: 'none' }, { transform: `rotate(${-HOLD.upper}deg)` }]);
      // (the forearm comes up toward us: short as it passes pointing at us, never swung flat across his body)
      H(fore('L'), [{ transform: 'none' }, { transform: `rotate(${HOLD.fore * 0.6}deg) scaleY(0.2)`, offset: 0.5 }, { transform: `rotate(${HOLD.fore}deg) scaleY(${HOLD.fs})` }]);
      H(fore('R'), [{ transform: 'none' }, { transform: `rotate(${-HOLD.fore * 0.6}deg) scaleY(0.2)`, offset: 0.5 }, { transform: `rotate(${-HOLD.fore}deg) scaleY(${HOLD.fs})` }]);
    }, ms);
  };

  const w = () => k.wearing();
  return {
    // ---- the crown and the halo with what he wears on his head ----
    // the witch hat, the pumpkin, the kippah and the keffiyeh's agal take the crown's place (the rig gilds them instead);
    // on the beanie the crown sits on top of the knit
    crownHidden: () => { const c = w(); return c.has('witch') || c.has('pumpkin') || c.has('kippah') || c.has('keffiyeh'); },
    crownLift: () => (w().has('beanie') ? 'translate(-1px, -18.5px)' : ''),
    haloLift: () => {
      const c = w(); const crown = k.crowned();
      if (c.has('witch')) return 30;   // just over the cone's tip (50 floated it ~24 units above: the pictures fork, 2026-10-05)
      if (c.has('beanie')) return crown ? 34 : 20;
      if (c.has('pumpkin')) return 8;
      if (c.has('keffiyeh')) return 6;
      if (c.has('kippah')) return 4;
      return crown ? 17 : 0;
    },
    zzzAt: () => { const c = w(); return c.has('witch') ? 'translate(12px, -4px)' : c.has('beanie') ? 'translate(6px, -8px)' : c.has('keffiyeh') ? 'translate(4px, -2px)' : ''; },
    crouchDown,
    holdBowl,
    eatPose() {
      k.hold('eat', (H) => { for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(2.5px) scaleY(0.985)' }]); }, 380);
    },
    async fling(dir, onRelease) {
      // A one-handed skim off the side of the room, the bowl riding in that hand (ways.ts keeps it there each frame): the
      // other hand lets go and drops; the throwing arm winds back across his body, the hand low by the other hip, the body
      // turning with it; then the arm whips out to the side, the forearm straightening, and lets go as it passes level.
      const up = dir > 0 ? el.legR : el.legL; const fo = dir > 0 ? fore('R') : fore('L'); const s = -dir;   // s: the turn that takes it OUT
      const other = dir > 0 ? el.legL : el.legR; const ofo = dir > 0 ? fore('L') : fore('R');
      const ms = 980; const RELEASE = 0.55;
      const hu = `rotate(${s * HOLD.upper}deg)`, hf = `rotate(${s * -HOLD.fore}deg) scaleY(${HOLD.fs})`;
      k.drop('holdbowl');
      void wait(ms * RELEASE).then(() => { if (!k.destroyed()) onRelease(); });
      await k.shot(ms, (A, M) => {
        A(up, [{ transform: hu, offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${s * 6}deg)`, offset: 0.16, easing: 'ease-in-out' },
          { transform: `rotate(${-s * 26}deg)`, offset: 0.4, easing: 'cubic-bezier(.55,0,.75,.4)' }, { transform: `rotate(${s * 88}deg)`, offset: 0.56, easing: 'cubic-bezier(.2,.6,.4,1)' },
          { transform: `rotate(${s * 104}deg)`, offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(fo, [{ transform: hf, offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${s * -112}deg) scaleY(0.62)`, offset: 0.16, easing: 'ease-in-out' },
          { transform: `rotate(${-s * 84}deg) scaleY(0.86)`, offset: 0.4, easing: 'cubic-bezier(.55,0,.75,.4)' }, { transform: `rotate(${s * 6}deg)`, offset: 0.56, easing: 'cubic-bezier(.2,.6,.4,1)' },
          { transform: `rotate(${s * 12}deg)`, offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(other, [{ transform: `rotate(${-s * HOLD.upper}deg)`, offset: 0, easing: 'ease-out' }, { transform: 'none', offset: 0.24 }, { transform: `rotate(${-s * 10}deg)`, offset: 0.56, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(ofo, [{ transform: `rotate(${s * HOLD.fore}deg) scaleY(${HOLD.fs})`, offset: 0, easing: 'ease-out' }, { transform: 'none', offset: 0.24 }, { transform: 'none', offset: 1 }]);
        // the body winds round toward the other side and unwinds into the throw; the head leads it, then looks after the bowl
        A(el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 2.5}deg)`, offset: 0.4, easing: 'cubic-bezier(.55,0,.75,.4)' }, { transform: `rotate(${dir * 3}deg)`, offset: 0.6, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 4}deg)`, offset: 0.36, easing: 'ease-in-out' }, { transform: `rotate(${dir * 5}deg) translateY(-1px)`, offset: 0.62, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${-dir * 14}%, 18%)`, offset: 0.36 }, { transform: `translate(${dir * 22}%, -6%)`, offset: 0.58 }, { transform: `translate(${dir * 28}%, -26%)`, offset: 0.85 }, { transform: `translate(${dir * 20}%, -20%)`, offset: 1 }]);
      });
    },
    // A tap with the foot: the leg on that side swings out onto the ball, the knee giving, the arms out a touch.
    pat(dir) {
      const { kick, kshin, s } = legs(dir);
      return k.shot(360, (A, M) => {
        A(kick, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${s * 5}deg)`, offset: 0.22, easing: 'ease-in' }, { transform: `rotate(${s * 18}deg)`, offset: 0.42, easing: 'ease-out' }, { transform: `rotate(${s * 13}deg)`, offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(kshin, [{ transform: 'rotate(0)', offset: 0 }, { transform: `rotate(${-s * 14}deg)`, offset: 0.24, easing: 'ease-in' }, { transform: `rotate(${s * 4}deg)`, offset: 0.44, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-8deg)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateY(1px)`, offset: 0.5 }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${dir * 14}%, 22%)`, offset: 0.4 }, { transform: `translate(${dir * 14}%, 22%)`, offset: 0.65 }, { transform: 'none', offset: 1 }]);
      });
    },
    // A proper kick: the leg draws back, the knee bent, whips out through the ball (the director squashes it at 110 ms) and
    // follows through high; he leans back off it and the arms fly out.
    bat(dir) {
      const { kick, stand, kshin, s } = legs(dir);
      return k.shot(360, (A) => {
        A(kick, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: `rotate(${-s * 16}deg)`, offset: 0.14, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: `rotate(${s * 22}deg)`, offset: 0.32, easing: 'ease-out' }, { transform: `rotate(${s * 50}deg)`, offset: 0.52, easing: 'ease-in-out' }, { transform: `rotate(${s * 26}deg)`, offset: 0.76, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(kshin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: `rotate(${s * 22}deg)`, offset: 0.14 }, { transform: `rotate(${-s * 6}deg)`, offset: 0.32, easing: 'ease-out' }, { transform: `rotate(${-s * 10}deg)`, offset: 0.6, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(stand, [{ transform: 'rotate(0)', offset: 0 }, { transform: `rotate(${-s * 4}deg)`, offset: 0.4, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 2.5}deg)`, offset: 0.14 }, { transform: `rotate(${-dir * 6}deg) translateX(${-dir * 2}px)`, offset: 0.45, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(40deg)', offset: 0.42, easing: 'ease-out' }, { transform: 'rotate(24deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
        A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-40deg)', offset: 0.42, easing: 'ease-out' }, { transform: 'rotate(-24deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
        A(fore('L'), [{ transform: 'none', offset: 0 }, { transform: 'rotate(-26deg)', offset: 0.45, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(fore('R'), [{ transform: 'none', offset: 0 }, { transform: 'rotate(26deg)', offset: 0.45, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 4}deg)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
      });
    },
    // The ball at his feet: he looks down at it, pleased (the rig has set the happy face), hands out a little.
    hug() {
      k.hold('hug', (H, M) => {
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(2px) rotate(-3deg)' }]);
        H(el.legL, [{ transform: 'none' }, { transform: 'rotate(12deg)' }]);
        H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-12deg)' }]);
        H(fore('L'), [{ transform: 'none' }, { transform: 'rotate(-18deg)' }]);
        H(fore('R'), [{ transform: 'none' }, { transform: 'rotate(18deg)' }]);
        M(k.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0, 22%)' }]);
      }, 360);
    },
    // A slouchy side-step: on every hop the leg toward `dir` reaches out that way, its knee giving, and the other pushes
    // after it; both are back under him as he lands.
    walkLegs(dir) {
      const stride = (d: number): Keyframe[] => [
        { transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${d}deg)`, offset: 0.25, easing: 'ease-in-out' },
        { transform: 'rotate(0)', offset: 0.5, easing: 'ease-out' }, { transform: `rotate(${d}deg)`, offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
      ];
      return dir < 0 ? { footL: stride(13), footR: stride(6) } : { footL: stride(-6), footR: stride(-13) };
    },
    // His arms in the walk: they hang loose and sway with him (both the same way, a beat behind his hips), and each
    // forearm swings a little forward as its side's leg goes back (toward us: a touch shorter), never paddling inward.
    walkArms(dir) {
      const sway = (d: number): Keyframe[] => [
        { transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${d}deg)`, offset: 0.3, easing: 'ease-in-out' },
        { transform: 'rotate(0)', offset: 0.55, easing: 'ease-in-out' }, { transform: `rotate(${d}deg)`, offset: 0.8, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
      ];
      const swing = (s: 1 | -1, ph: 0 | 1): Keyframe[] => {
        const a = (on: boolean) => (on ? `rotate(${s * -10}deg) scaleY(0.9)` : 'none');
        return [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: a(ph === 0), offset: 0.25, easing: 'ease-in-out' }, { transform: 'none', offset: 0.5, easing: 'ease-in-out' }, { transform: a(ph === 1), offset: 0.75, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }];
      };
      return { legL: sway(dir * -4), legR: sway(dir * -4), foreL: swing(1, 0), foreR: swing(-1, 1) };
    },
    // The squat: knees out and the hips down, hands on the knees, head ducked, and the strain shakes him.
    squat() {
      const c = crouchOf(34);
      k.face('squeeze', 'frown', 200);
      k.hold('squat', (H) => {
        H(el.figure, [{ transform: 'none' }, { transform: `translateY(${c.drop.toFixed(2)}px)` }]);
        H(el.footL, [{ transform: 'none' }, { transform: `rotate(${c.thigh.toFixed(1)}deg)` }]);
        H(el.footR, [{ transform: 'none' }, { transform: `rotate(${(-c.thigh).toFixed(1)}deg)` }]);
        H(shin('L'), [{ transform: 'none' }, { transform: `rotate(${c.shin.toFixed(1)}deg)` }]);
        H(shin('R'), [{ transform: 'none' }, { transform: `rotate(${(-c.shin).toFixed(1)}deg)` }]);
        H(el.legL, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
        H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-10deg)' }]);
        H(fore('L'), [{ transform: 'none' }, { transform: 'rotate(-18deg)' }]);
        H(fore('R'), [{ transform: 'none' }, { transform: 'rotate(18deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(2px) rotate(2deg)' }]);
        H(el.cat, [{ transform: 'translateX(-0.4px)' }, { transform: 'translateX(0.4px)' }], { duration: 90, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      }, 420);
    },
    // The wake-up stretch: up tall, both arms up overhead in a V, head back, eyes shut and the mouth open.
    async stretch() {
      const ms = 1600;
      const hold = (to: string): Keyframe[] => [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: to, offset: 0.4, easing: 'ease-in-out' }, { transform: to, offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }];
      const p = k.shot(ms, (A) => {
        A(el.figure, hold('scaleY(1.025)'));
        for (const h of k.heads()) A(h, hold('rotate(-4deg) translateY(-1.5px)'));
        A(el.legL, hold('rotate(150deg)')); A(el.legR, hold('rotate(-150deg)'));
        A(fore('L'), hold('rotate(-12deg)')); A(fore('R'), hold('rotate(12deg)'));
      });
      await wait(ms * 0.26); k.face('closed', 'open', 160);
      await wait(ms * 0.46); k.face('open', 'idle', 200);
      await p;
    },
    // ---- the items he does something with ----
    /** The darbuka, on a stand at his side: his forearm out level over its skin, and down onto it from the elbow. */
    drumArm(dir): DrumArm {
      return { hover: 74, hit: 62, dum: 92, tek: 80, limb: fore(dir > 0 ? 'R' : 'L'), rot: (d: number) => `rotate(${(-dir * d).toFixed(2)}deg)`, base: '' };
    },
    /** The dreidel: down into a crouch beside it, the arm on its side out and down onto its knob, a twist and a snap back. */
    twist(dir) {
      const arm = dir > 0 ? el.legR : el.legL; const o = -dir; const ms = 760; const c = crouchOf(48);
      const sh = (v: number) => `translateY(${(c.drop * v).toFixed(2)}px)`;
      return k.shot(ms, (A, M) => {
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: sh(1), offset: 0.3 }, { transform: sh(1), offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.shadow, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `translateY(${-c.drop}px) scaleX(1.2)`, offset: 0.3 }, { transform: `translateY(${-c.drop}px) scaleX(1.2)`, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const [f, sgn] of [[el.footL, 1], [el.footR, -1]] as const) A(f, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${sgn * c.thigh}deg)`, offset: 0.3 }, { transform: `rotate(${sgn * c.thigh}deg)`, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const [f, sgn] of [[shin('L'), 1], [shin('R'), -1]] as const) A(f, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${sgn * c.shin}deg)`, offset: 0.3 }, { transform: `rotate(${sgn * c.shin}deg)`, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(arm, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${o * 22}deg)`, offset: 0.34, easing: 'ease-in-out' }, { transform: `rotate(${o * 23}deg)`, offset: 0.52, easing: 'cubic-bezier(.5,0,1,.5)' },
          { transform: `rotate(${o * 6}deg)`, offset: 0.66, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.4 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.56 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.72 }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${dir * 18}%, 22%)`, offset: 0.36 }, { transform: `translate(${dir * 18}%, 22%)`, offset: 0.6 }, { transform: 'none', offset: 1 }]);
      });
    },
    /** The hen lifted over his head: his right arm (our right) raised high, the hand up by the top of his hair, his eyes up
     *  at her. Held. (His arms are short for his hair: a hand can reach no higher than the top of his head.) */
    kapparotRaise() {
      k.hold('kapparot', (H, M) => {
        H(el.legR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-164deg)' }]);
        H(fore('R'), [{ transform: 'none' }, { transform: 'rotate(-16deg)' }]);
        H(el.legL, [{ transform: 'rotate(0)' }, { transform: 'rotate(5deg)' }]);
        H(fore('L'), [{ transform: 'none' }, { transform: 'rotate(-6deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-1px) rotate(1.5deg)' }]);
        M(k.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: 'translate(8%, -30%)' }]);
      }, 460);
    },
    /** While she circles: his head and eyes follow her round, his arms sway under her. */
    kapparotFollow(laps, lapMs) {
      const per = 16; const n = per * laps; const ms = laps * lapMs;
      const kf = (f: (th: number) => string): Keyframe[] => Array.from({ length: n + 1 }, (_, i) => ({ transform: f((2 * Math.PI * i) / per), offset: i / n }));
      return k.shot(ms, (A, M) => {
        for (const h of k.heads()) A(h, kf((th) => `rotate(${(3 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        M(k.q.get('pupil'), kf((th) => `translate(${(26 * Math.cos(th)).toFixed(1)}%, ${(-30 + 6 * Math.sin(th)).toFixed(1)}%)`), { easing: 'linear' });
        A(el.legR, kf((th) => `rotate(${(-6 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        A(fore('R'), kf((th) => `rotate(${(5 * Math.sin(th)).toFixed(2)}deg)`), { easing: 'linear' });
      });
    },
    /** The falconer's fist: his left arm out to his side, the forearm up, the fist at his shoulder's height. Held as 'falcon'. */
    falconReady() {
      k.hold('falcon', (H) => {
        H(el.legL, [{ transform: 'rotate(0)' }, { transform: 'rotate(42deg)' }]);
        H(fore('L'), [{ transform: 'none' }, { transform: 'rotate(112deg)' }]);
        H(el.legR, [{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: 'rotate(-2deg)' }]);
      }, 560);
    },
    /** It lands: the arm gives under it and springs back. */
    falconGive() {
      return k.shot(420, (A) => {
        A(fore('L'), [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-8deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(2.4deg)', offset: 0.65, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-3deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
    },
    // ---- the guitar: played across his body, its body at his right hip (our left), its neck up to our right ----
    // Worked out as two-bone reaches: the strumming hand at (104, 131) by his belt, its elbow out; the fretting hand at
    // (146, 101), its elbow down at his side and the forearm up and out to the neck. (No forearm is foreshortened: the
    // guitar is carried in the fretting forearm's own units, measured in this pose, so that limb must keep its length.)
    strumArm() {
      const strum: StrumLimb = { limb: OVER.L, deg: -71, amp: 7, probe: [81.0, 147.0], upper: { limb: el.legL, deg: 15 } };
      const fret: StrumLimb = { limb: OVER.R, deg: -120, probe: [118.6, 147.0], upper: { limb: el.legR, deg: 10 } };
      return { strum, fret };
    },
    /** Down to the guitar lying on the floor in front of him, the way a person picks a thing up: the knees bent (out a
     *  little: seen from the front), and a deep bow toward us from the hips, the body foreshortened, the shoulders and the
     *  head coming down in front of it, the arms hanging down to the floor, both hands on the guitar (the left on its body,
     *  the right on its neck). His legs alone cannot get his hands within 25 of the floor (a crouch with the knees out drops
     *  the hips 33 at most); with the bow they get there. */
    pickUp(ms) {
      crouchDown(46, ms);
      const sy = 0.34;                                   // the body seen bowed toward us
      const HIPS = 142.4, SHOULDERS = 89.6, NECK = 77;
      const dS = (1 - sy) * (HIPS - SHOULDERS), dN = (1 - sy) * (HIPS - NECK);
      k.hold('pickarms', (H, M) => {
        H(el.body, [{ transform: 'none' }, { transform: `scaleY(${sy})` }]);
        H(el.arms, [{ transform: 'none' }, { transform: `translateY(${dS.toFixed(2)}px)` }]);
        for (const h of k.heads()) H(h, [{ transform: 'none' }, { transform: `translateY(${(dN * 0.96).toFixed(2)}px) scaleY(0.9)` }]);
        H(el.legL, [{ transform: 'none' }, { transform: 'rotate(7deg)' }]);
        H(el.legR, [{ transform: 'none' }, { transform: 'rotate(-5deg)' }]);
        H(fore('L'), [{ transform: 'none' }, { transform: 'rotate(-4deg)' }]);
        H(fore('R'), [{ transform: 'none' }, { transform: 'rotate(3deg)' }]);
        M(k.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(4%, 30%)' }]);
      }, ms);
      return ['crouchdown', 'pickarms'];
    },
    /** Thrown off: the hand on the neck winds back and swings it out and up to his side, letting go at the top. */
    async throwGuitar(onRelease, onStart) {
      const a = this.strumArm!(); const f = a.fret!;
      const ms = 780; const RELEASE = 0.52;
      const fp = `rotate(${f.deg}deg)`; const sp = `rotate(${a.strum.deg}deg)`;
      k.drop('guitar'); k.drop('guitarlook'); k.drop('gaze');
      onStart?.(ms, RELEASE);
      void wait(ms * RELEASE).then(() => { if (!k.destroyed()) onRelease(); });
      await k.shot(ms, (A, M) => {
        A(a.strum.limb, [{ transform: sp, offset: 0 }, { transform: 'none', offset: 0.4, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(a.strum.upper!.limb, [{ transform: `rotate(${a.strum.upper!.deg}deg)`, offset: 0 }, { transform: 'none', offset: 0.4, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(f.upper!.limb, [{ transform: `rotate(${f.upper!.deg}deg)`, offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-8deg)', offset: 0.28, easing: 'cubic-bezier(.5,0,.6,1)' },
          { transform: 'rotate(-128deg)', offset: 0.6, easing: 'ease-out' }, { transform: 'rotate(-110deg)', offset: 0.74, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(f.limb, [{ transform: fp, offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(40deg)', offset: 0.28, easing: 'cubic-bezier(.5,0,.6,1)' },
          { transform: 'rotate(-14deg)', offset: 0.6, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-3deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(4deg) translateY(-1px)', offset: 0.62, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        M(k.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(14%, -12%)', offset: 0.5 }, { transform: 'translate(26%, -32%)', offset: 0.8 }, { transform: 'translate(22%, -26%)', offset: 1 }]);
      });
    },
    /** The mirror selfie: his right arm (our right) up beside his head, the forearm up, the phone in his hand facing us. */
    selfieArm(): SelfieArm {
      const RAISE = -62, FORE = -98;
      return {
        limb: el.legR, raise: RAISE, upper: { limb: fore('R'), deg: FORE }, phone: { host: 'foreRover', at: [118.6, 148.5], w: 11, tilt: -4 }, side: 1,
        // his hand is up clear of his hair: the phone drops straight down into it
        out: 4,
        // and the hand gives under it, out and down a little, and comes back
        catch: () => { void k.shot(380, (A) => {
          A(el.legR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(5deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(-1deg)', offset: 0.65, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
          A(fore('R'), [{ transform: 'none', offset: 0 }, { transform: 'rotate(13deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(-2deg)', offset: 0.65, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        }); },
        // the throw: the phone cocked back over his head, then the forearm whips out and up to his side and lets go as it
        // passes 30 over level; the arm runs on and comes down
        toss: async (release) => {
          const ms = 820, AT = 0.5;
          const u = (d: number) => `rotate(${d}deg)`;
          k.drop('selfie');
          void wait(ms * AT).then(() => { if (!k.destroyed()) release(); });
          await k.shot(ms, (A, M) => {
            A(el.legR, [{ transform: u(RAISE), offset: 0, easing: 'ease-in-out' }, { transform: u(RAISE - 14), offset: 0.34, easing: 'cubic-bezier(.5,0,.7,.4)' },
              { transform: u(RAISE - 30), offset: 0.52, easing: 'ease-out' }, { transform: u(RAISE - 34), offset: 0.64, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
            A(fore('R'), [{ transform: u(FORE), offset: 0, easing: 'ease-in-out' }, { transform: u(FORE - 34), offset: 0.34, easing: 'cubic-bezier(.55,0,.8,.35)' },
              { transform: u(FORE + 72), offset: 0.52, easing: 'ease-out' }, { transform: u(FORE + 84), offset: 0.64, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
            A(el.figure, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-1.5deg)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'rotate(2deg)', offset: 0.54, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
            for (const h of k.heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-3deg)', offset: 0.34 }, { transform: 'rotate(4deg) translateY(-1px)', offset: 0.6, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
            M(k.q.get('pupil'), [{ transform: 'translate(26%, -12%)', offset: 0 }, { transform: 'translate(20%, -30%)', offset: 0.4 }, { transform: 'translate(30%, -36%)', offset: 0.75 }, { transform: 'translate(22%, -28%)', offset: 1 }]);
          });
        },
      };
    },
    ghostRise: 14,                                 // (tall: in the witch hat, crowned, a higher float put the halo at the ceiling)
  };
}
