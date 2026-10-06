/**
 * The fight's own moves, built from the rig's building blocks (rig.fightKit) the way the rig's own moves are, so they
 * compose with everything else (additive, held poses persisted, released by key).
 *
 * Every strike is thrown in the DRAWING's own directions and always at the side the opponent is on: the frok is turned
 * to face them (rig.facing mirrors his whole drawing, so his front arm, #legR, always swings "right"); Sahur is mirrored
 * by the director when he fights from the left, so his bat arm, #legL, always swings "left"; the cat faces front and
 * swipes with the paw on the opponent's side. Limb angles are measured outward from hanging (tools/fightclub/limbs.mjs):
 * a positive CSS rotate() swings a hanging limb to the screen's left.
 */
import type { Dir, PetRig } from '../pet/Pet';

type Kit = ReturnType<PetRig['fightKit']>;
const kit = (rig: PetRig): Kit => rig.fightKit();

/** How a pet's strike is thrown: which limb, which way is out, the arc (outward degrees at each offset), when it lands. */
export type StrikeSpec = { ms: number; hitAt: number; arc: [number, number][]; lean: number; rear: number };
export const STRIKES: Record<'cat' | 'frog' | 'sahur', StrikeSpec> = {
  // the cat rears up and brings the paw over and down across the other one's face: up high, then down through level
  cat: { ms: 460, hitAt: 0.56, arc: [[0, 0], [0.3, 150], [0.56, 88], [0.72, 60], [1, 0]], lean: 8, rear: 22 },
  // the frok draws his front sleeve back and swings it through, forward and up past level, leaning into it
  frog: { ms: 420, hitAt: 0.5, arc: [[0, 0], [0.28, -34], [0.5, 92], [0.66, 112], [1, 0]], lean: 9, rear: 0 },
  // Sahur winds the bat in across himself and sweeps it out through level, the log leaning after it
  // (level, his bat passes over a cat's head: it lands on the way down and out, at 58 degrees, and follows through to level)
  sahur: { ms: 440, hitAt: 0.5, arc: [[0, 0], [0.24, -36], [0.5, 58], [0.66, 92], [1, 0]], lean: 7, rear: 0 },
};

/** The limb that strikes and which rotation sign is "out", for a pet whose opponent is on drawing side `dir`. */
export function striker(rig: PetRig, dir: Dir): { id: 'legL' | 'legR'; out: 1 | -1 } {
  if (rig.character === 'sahur') return { id: 'legL', out: 1 };       // the bat arm, always toward the opponent
  if (rig.character === 'frog') return { id: 'legR', out: 1 };        // his front sleeve, once he is turned to face them (forward is +: measured)
  return dir > 0 ? { id: 'legR', out: -1 } : { id: 'legL', out: 1 };   // the cat: the paw on the opponent's side
}

/**
 * Throw the strike at drawing side `dir`; `onHit` fires the moment it lands (the director puts the impact there). The
 * figure leans in (and the cat rears up) with it, and it all comes back to rest.
 */
export async function strike(rig: PetRig, dir: Dir, onHit: () => void, opts: { rear?: number } = {}) {
  const c = rig.character as 'cat' | 'frog' | 'sahur';
  const s = { ...STRIKES[c], ...(opts.rear !== undefined ? { rear: opts.rear } : {}) }; const k = kit(rig); const { id, out } = striker(rig, dir);
  // which way "toward the opponent" leans the figure, in the drawing: the frok's is always right, Sahur's always left
  const toward = c === 'frog' ? 1 : c === 'sahur' ? -1 : dir;
  rig.face(c === 'cat' ? 'squeeze' : 'open', 'open', 60);
  const p = k.shot(s.ms, (A) => {
    A(k.el[id], s.arc.map(([offset, deg], i) => ({ transform: `rotate(${out * deg}deg)`, offset, easing: i === 1 ? 'cubic-bezier(.6,0,1,.4)' : 'ease-out' })));
    A(k.el.figure, [
      { transform: 'none', offset: 0, easing: 'ease-out' },
      { transform: `rotate(${-toward * 3}deg) translateY(${-s.rear * 0.4}px)`, offset: s.hitAt * 0.5, easing: 'ease-in' },
      { transform: `rotate(${toward * s.lean}deg) translateX(${toward * 6}px) translateY(${-s.rear}px)`, offset: s.hitAt, easing: 'ease-out' },
      { transform: 'none', offset: 1 },
    ]);
    for (const h of k.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${toward * 5}deg)`, offset: s.hitAt, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
  });
  // the impact is timed off the swing itself, not a timer started beside it: an animation starts on the next frame, and
  // with the swing easing in hard a timer fired while the limb was still a third of the way round (the "no contact")
  await reached(k.el[id]?.getAnimations().at(-1), s.ms * s.hitAt);
  onHit();
  await p;
  rig.face('open', 'smug', 160);
}

/** Resolves when an animation's own clock passes `ms` (or it ends, or 400 ms after it should have: a hidden tab). */
function reached(anim: Animation | undefined, ms: number) {
  return new Promise<void>((res) => {
    if (!anim) { setTimeout(res, ms); return; }
    let done = false; const end = () => { if (!done) { done = true; res(); } };
    const tick = () => {
      if (done) return;
      const t = anim.currentTime;
      if (anim.playState === 'finished' || anim.playState === 'idle' || (typeof t === 'number' && t >= ms)) end();
      else requestAnimationFrame(tick);
    };
    tick();
    setTimeout(end, ms + 400);
  });
}

/** Squared up: a little crouch and a bounce on the toes, held until released (key 'fc-stance'). */
export function stance(rig: PetRig) {
  const k = kit(rig);
  rig.face('open', 'smug', 160);
  k.hold('fc-stance', (H) => {
    H(k.el.figure, [{ transform: 'translateY(0) scaleY(1)' }, { transform: 'translateY(3px) scaleY(0.975)' }], { duration: 380, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
    for (const h of k.heads) H(h, [{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }], { duration: 380, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out', delay: -90 });
  }, 200);
}

/** Knocked out cold: eyes crossed, mouth hanging open, limbs gone slack. Held (key 'fc-ko'). */
export function knockedOut(rig: PetRig) {
  const k = kit(rig);
  rig.releaseAll(80);
  rig.face('x', 'open', 60);
  k.hold('fc-ko', (H) => {
    H(k.el.legL, [{ transform: 'none' }, { transform: `rotate(${rig.character === 'sahur' ? 30 : 24}deg)` }]);
    H(k.el.legR, [{ transform: 'none' }, { transform: `rotate(${rig.character === 'sahur' ? -20 : -24}deg)` }]);
    for (const h of k.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(8deg)' }]);
    H(k.el.tail, [{ transform: 'none' }, { transform: 'rotate(18deg)' }]);
  }, 160);
}

/** Up and celebrating: both arms (paws, sleeves, the bat) thrown up and a leap, the arms held a while (key 'fc-win'). */
export async function victory(rig: PetRig) {
  const k = kit(rig);
  rig.face('happy', 'smile', 140);
  const arms = (lDeg: number, rDeg: number) => {
    k.hold('fc-win', (H) => {
      H(k.el.legL, [{ transform: 'none' }, { transform: k.up(-1, lDeg) }]);
      H(k.el.legR, [{ transform: 'none' }, { transform: k.up(1, rDeg) }]);
      for (const h of k.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-2px) rotate(-2deg)' }]);
    }, 260);
  };
  // (Sahur's bat arm goes up high, the bat over his head like a trophy; the cat's paws come up and out)
  if (rig.character === 'sahur') arms(118, 60);
  else if (rig.character === 'frog') arms(70, 80);
  else arms(120, 120);
  if (rig.character === 'cat') await rig.superJump(1000, 60);
  else { await rig.jump(); await rig.hop(); }
}
