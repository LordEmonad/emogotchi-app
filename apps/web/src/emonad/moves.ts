/**
 * Emonad's moves: each a function of time that adds to the pose (and the face, and where the feet go) on top of the
 * idle. The rig (rig.ts) runs them, fades them in and out, and lets a new one on the same layer take over.
 *
 * Signs, in a view's own units (y down): a positive turn is clockwise on screen, so a hanging limb swings to -x. The side
 * view faces -x (left) and the three-quarter view faces +x; their mirrors face the other way without the moves knowing.
 */
import type { Body, Ctx, EmonadRig, Side, View, Mouth, Grip } from './rig';

export type Action = {
  /** seconds (or worked out from the options); ignored when it loops */
  dur: number | ((opts: Record<string, unknown>, rig: EmonadRig) => number);
  loop?: boolean;
  /** a new move takes over from the running ones on its layer: 'body' (the default), 'move' (walking), 'face' (talk) */
  layer?: 'body' | 'move' | 'face';
  fadeIn?: number; fadeOut?: number;
  /** how much the move gets its way with the mouth when two want it */
  facePri?: number;
  /** it puts the feet where it wants them (a jump): a walk under it holds still while it plays, or the feet skate */
  plants?: boolean;
  /** return true to finish (a loop that knows when it is done) */
  run(c: Ctx, opts: Record<string, unknown>): boolean | void;
  end?(rig: EmonadRig, opts: Record<string, unknown>): void;
  /** asked to play again while running: take the new options (true), or let a fresh run take over (false/absent) */
  retarget?(state: Record<string, unknown>, opts: Record<string, unknown>, rig: EmonadRig): boolean;
  /** asked to stop: true if it ends by itself soon (a walk takes its last step), false/absent to be faded out now */
  stop?(state: Record<string, unknown>, rig: EmonadRig): boolean;
};

// ---------------------------------------------------------------- keyframes
type Ease = (x: number) => number;
export const ease = {
  lin: (x: number) => x,
  io: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  o: (x: number) => 1 - Math.pow(1 - x, 3),
  i: (x: number) => x * x * x,
  sine: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
  back: (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  /** a thrown body: leaves fast and slows to a stop (o2), and its mirror, falling (i2): gravity's own parabola */
  o2: (x: number) => 1 - (1 - x) * (1 - x),
  i2: (x: number) => x * x,
  /** quick but soft: from rest, most of the way in the first third, a long settle (a snap that never jerks) */
  snap: (x: number) => 1 - Math.pow(1 - x, 4) * (1 + 4 * x),
  /** its mirror: a slow gather, then fast into the key, arriving at rest */
  gather: (x: number) => Math.pow(x, 4) * (5 - 4 * x),
};
/** A track through keys [time (s), value, ease into it?]. A key without an ease is reached on a smooth curve (a
 *  monotone cubic through the keys: it never overshoots a key, comes to rest at a turning point and at the ends, and
 *  carries its speed through every key in between, so a move flows instead of stopping at each key). An ease on a key
 *  shapes the stretch into it instead, and the curve either side takes that stretch's speed where they meet. */
export function kf(...keys: [number, number, Ease?][]) {
  const n = keys.length;
  const T = keys.map((k) => k[0]), V = keys.map((k) => k[1]), E = keys.map((k) => k[2]);
  const sec = T.slice(0, -1).map((t0, i) => (V[i + 1]! - V[i]!) / Math.max(1e-6, T[i + 1]! - t0));
  const dE = (e: Ease, x: number) => { const a = Math.max(0, x - 1e-4), b = Math.min(1, x + 1e-4); return (e(b) - e(a)) / (b - a); };
  // speed (value per second) at each key, for the curve's stretches
  const M = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = sec[i - 1]!, b = sec[i]!;
    if (a * b > 0) { const h0 = T[i]! - T[i - 1]!, h1 = T[i + 1]! - T[i]!; M[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / b); }
  }
  // (where a stretch has an ease, the curve meeting it at a key takes its speed there)
  const into = (i: number) => (E[i] ? sec[i - 1]! * dE(E[i]!, 1) : M[i]!);
  const outOf = (i: number) => (i + 1 < n && E[i + 1] ? sec[i]! * dE(E[i + 1]!, 0) : M[i]!);
  return (t: number) => {
    if (t <= T[0]!) return V[0]!;
    for (let i = 1; i < n; i++) {
      if (t > T[i]!) continue;
      const t0 = T[i - 1]!, h = Math.max(1e-6, T[i]! - t0), u = (t - t0) / h, v0 = V[i - 1]!, v1 = V[i]!;
      const e = E[i];
      if (e) return v0 + (v1 - v0) * e(u);
      // (a speed taken from an eased neighbour only where this stretch goes the same way, and never more than it can
      // carry without overshooting: a hold next to a fast stretch stays a hold, and the meeting is a hit)
      const sc = sec[i - 1]!, fit = (m: number) => (m * sc <= 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(sc)));
      const m0 = (i - 1 === 0 ? 0 : E[i - 1] ? fit(into(i - 1)) : M[i - 1]!) * h, m1 = (i === n - 1 ? 0 : i + 1 < n && E[i + 1] ? fit(outOf(i)) : M[i]!) * h;
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
    }
    return V[n - 1]!;
  };
}
/** Soft versions of abs and max (no corner where they turn) */
const sabs = (x: number, k = 0.06) => Math.sqrt(x * x + k * k) - k;
const smax0 = (x: number, k = 2) => 0.5 * (x + Math.sqrt(x * x + k * k)) - 0.5 * k;
/** A soft maximum of a and b that is never below either (above both by k/2 where they meet). */
const smaxUp = (a: number, b: number, k: number) => 0.5 * (a + b) + 0.5 * Math.sqrt((a - b) * (a - b) + k * k);
const smooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** smooth, clamped to 0..1 first */
const sc = (x: number) => { const k = x < 0 ? 0 : x > 1 ? 1 : x; return k * k * (3 - 2 * k); };
/** The shares of a value meant for the side view, the three-quarter and the front and back (Ctx.side, Ctx.quarter): a
 *  move mixes its per-drawing values by these, so a turn made mid-move never pops at the swap. */
const lean = (c: Ctx) => ({ s: c.side, q: c.quarter, f: Math.max(0, 1 - c.side - c.quarter) });
/** For a turn of the head that should bring the face towards us side and three-quarter on (and to our right from the
 *  front and back): its sign, mixed by the shares so it never jumps at a swap. And which way the eyes go (in this
 *  drawing's own units) to lead that turn. */
const toUs = (c: Ctx) => { const { s, q, f } = lean(c); return f - (s + q) * c.right; };
const eyesToUs = (c: Ctx) => { const { s, q, f } = lean(c); return f - q + s; };
/** The two arms of a two-armed move are never twins: the one on his right leads, the other comes a few frames later and
 *  does a little less. */
const LAG = { r: 0, l: 0.03 } as const, AMT = { r: 1, l: 0.93 } as const;
/** (on a fast snap the second arm is one frame behind, not three: at three it was a different pose for the whole snap) */
const LAG_FAST = { r: 0, l: 0.017 } as const;
/** A blink: 0..1 over len seconds from `at` (shut in the first third, open over the rest). */
const blinkAt = (t: number, at: number, len = 0.14) => { const u = (t - at) / len; return u <= 0 || u >= 1 ? 0 : u < 0.33 ? smooth(u / 0.33) : 1 - smooth((u - 0.33) / 0.67); };
/** A soft limit: about x up to `lim`, easing towards ±lim*1.3 beyond it (no corner). */
const softCap = (x: number, lim: number) => lim * 1.3 * Math.tanh(x / (lim * 1.3));
const frac = (x: number) => x - Math.floor(x);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Side on, the far arm (the part letter R there and three-quarters on) of a two-armed move: how much it is set apart
 *  from the near one (1 side on, nothing from about halfway to the next drawing). Moving both arms alike side on, the
 *  far hand lay exactly behind the near one, and the pair read as one hand with six fingers, or a two-fingered point. */
const farApart = (c: Ctx, s: Side) => (s === 'R' ? smooth(clamp((c.side - 0.55) / 0.4, 0, 1)) : 0);

/** Which arm a one-armed gesture uses (the one nearest us, or on the free side), and which way is "out" for each arm
 *  (the side view's two arms both go out forward). */
export const NEAR_ARM: Record<View, Side> = { front: 'R', quarter: 'L', side: 'L', back: 'R' };
const OUT: Record<View, Record<Side, number>> = {
  front: { L: 1, R: -1 }, back: { L: 1, R: -1 }, quarter: { L: 1, R: -1 }, side: { L: 1, R: 1 },
};
/** The arm a one-armed move uses: the near one where it starts, kept BY HIS SIDE for the whole move (a turn changes
 *  which letter that arm is, and which arm is near; picked afresh each frame, the wave jumped to the other arm halfway
 *  round). Returns the letter for the drawing being worked out. */
function myArm(c: Ctx): Side {
  let b = c.state.arm as Body | undefined;
  if (!b) { b = c.body(NEAR_ARM[c.view]); if (!c.ghost) c.state.arm = b; }
  return c.letter(b);
}

/** An arm: the upper arm out by `up` degrees, the forearm by `fore` more (both "out" for that arm in this view), the
 *  shoulder lifted by `lift` (the rig takes the sleeve along). */
function arm(c: Ctx, s: Side, up: number, fore: number, lift = 0, hand = 0) {
  const o = OUT[c.view][s];
  c.add(`arm${s}`, { r: o * up, y: -lift });
  c.add(`fore${s}`, { r: o * fore });
  if (hand) c.add(`hand${s}`, { r: o * hand });
}
/** In for `a` seconds, out over the last `b`: a soft envelope for a move's extras (lean, tilt, face). */
const env = (t: number, len: number, a = 0.3, b = 0.4) => smooth(clamp(t / a, 0, 1)) * smooth(clamp((len - t) / b, 0, 1));
/** The head nodding down by `deg` (drawn as a turn side-on, as a dip from the front and back). */
function nodDown(c: Ctx, deg: number) {
  const { s, q, f } = lean(c), F = c.fwd;
  // side-on the neck takes a share (so the jaw and the throat stay one line), and both are capped (a nod past about 20
  // degrees opened a jagged shard at the nape); three-quarter on, a little turn and mostly a dip (past about 12 degrees
  // the jaw slid over the collar and the head looked to fall off sideways); from the front and the back, a dip, the chin
  // tucking into the collar, the neck sinking with it. (Never a squash of the face: only the face's own bone would take
  // it, not the hair over it, and the forehead pulled away from under the fringe.) A deep nod gets the rest from the
  // spine: the moves pitch the back.
  // (the neck itself is never pushed down: its foot and the collar drawn under it parted, and the collar's ends showed
  // the neck's ink and the plug under it as a black spot; the head dips onto the neck instead. From the front the dip is
  // capped: past about 8 units the chin swallowed the neck and sat on the collar)
  // (side on the neck takes half the turn: with a third, the jaw's line and the throat's, one line at rest, parted into
  // two as the head turned on the neck)
  const hr = softCap(deg * 0.5, 13) * s + softCap(deg * 0.3, 9) * q;
  c.add('head', { r: F * hr, y: softCap(deg * 0.38, 6) * q + softCap(deg * 0.5, 7) * f });
  c.add('neck', { r: F * softCap(deg * 0.5, 11) * s });
}
const setMouth = (c: Ctx, m: Mouth) => { c.face.mouth = m; };

// ---------------------------------------------------------------- the walk (side-on): the feet are planted, the body
// moves over them. The way is cut into a half step, whole steps and a half step, so he starts and stops with his feet
// together; a foot on the ground never moves, and the root goes wherever that makes it. The walk turns him to the side he
// is going first, takes a new place at the next footfall (turning round, if it is behind him, once his feet are
// together), and asked to stop takes its last step.
type Seg = { sw: Side; from: number; to: number; R0: number; R1: number; v0: number; v1: number; first: boolean; last: boolean };
type WalkState = {
  // the plan: where it started (host units), which way, its step length and time, its steps and how far into them
  x0: number; dir: number; sc: number; D: number; Th: number; segs: Seg[]; seg: number; segT: number;
  // where each foot is planted (view units along the way from x0)
  F: Record<Side, number>;
  // the hips as drawn (a spring, never above what the legs allow), their speed, and the arms' lagging swing
  hy: number | null; hv: number; hs?: number; hdv?: number; sw: number | null;
  done?: boolean;
};
type WalkMem = { to: number; pace: number; plan?: WalkState; req?: boolean; stopReq?: boolean;
  /** how much of the walk's posture (the slouch, the arms' swing) is on: eased in as he sets off, out between plans
   *  (turning round for a place behind him), so it never pops; and the arms' swing as last drawn */
  k?: number; lastSw?: number };
// the shoe's ball and heel on the ground, side view (view units)
const BALL = -40, HEEL = 18;
// the feet's angle through a step (toe up positive): the swinging foot leaves toe down and lands toe up; the planted
// one flattens, then its heel rises into the next toe-off. Each ends where the next begins, at rest, so a foot never
// flicks at a change of step.
const SWING_TOE = kf([0, -18], [0.12, -10], [0.35, -4], [0.8, 10], [1, 9]);
const STANCE_TOE = kf([0, 9], [0.16, 0], [0.62, 0], [1, -18]);
const STANCE_FIRST = kf([0, 0], [0.6, 0], [1, -18]);
const STANCE_LAST = kf([0, 9], [0.2, 0]);
/** A step's length at pace 1, and its time (a step of D takes Th(D): ~0.56 s, a slouchy teen's stroll, 13-14 frames at
 *  24 fps, between Williams' brisk 12 and stroll 16). */
const STEP = 92;
const stepTime = (D: number, pace: number) => Math.max(0.2, 0.56 * Math.sqrt(Math.max(1, D) / (STEP * pace)) / Math.sqrt(pace));
/** The root's progress through a step: a cubic from R0 to R1 that leaves at speed v0 and arrives at v1 (units/s). */
const hermite = (R0: number, R1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * R0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * R1 + (u3 - u2) * m1;
};
/** The steps from feet planted at P (just landed) and T (behind, to swing next), the root between them going at v, to
 *  stand with both feet at E (ahead of P). From standing (P = T), the first is a half step. */
function planSteps(P: number, T: number, E: number, pace: number, v: number, nextSw: Side, fromStanding: boolean): { segs: Seg[]; D: number; Th: number } {
  const D0 = STEP * pace;
  const land: number[] = [];
  if (Math.abs(E - P) < 1) land.push(P);                       // the trailing foot comes alongside: one step
  else {
    const n = Math.max(1, Math.round((E - P) / D0));
    for (let j = 1; j <= n; j++) land.push(P + (E - P) * j / n);
    land.push(E);                                              // and the other foot alongside it
  }
  const D = land.length > 1 ? Math.max(1, (E - P) / (land.length - 1)) : Math.max(1, Math.abs(P - T));
  const Th = stepTime(fromStanding ? D : Math.max(D, Math.abs(P - T) / 2), pace);
  const segs: Seg[] = [];
  let a = T, b = P, sw = nextSw, R = (P + T) / 2, vel = v;
  land.forEach((L, j) => {
    const last = j === land.length - 1;
    const R1 = (L + b) / 2;
    const v1 = last ? 0 : D / Th;
    segs.push({ sw, from: a, to: L, R0: R, R1, v0: vel, v1, first: fromStanding && j === 0, last });
    a = b; b = L; R = R1; vel = v1; sw = sw === 'L' ? 'R' : 'L';
  });
  return { segs, D, Th };
}

function walkRun(c: Ctx, o: Record<string, unknown>): boolean {
  const rig = c.rig;
  const m = c.state as WalkMem;
  if (m.to === undefined) { m.to = o.to as number; m.pace = clamp((o.pace as number) ?? 1, 0.3, 3); }
  // (only ever drawn in the side view, where it steps the feet and moves him: another drawing's pass changes nothing)
  if (c.ghost) return false;
  let s = m.plan;
  const ease = (to: number) => { m.k = (m.k ?? 0) + (to - (m.k ?? 0)) * (1 - Math.exp(-c.dt / 0.12)); return m.k; };
  if (!s) {
    // (between plans: the posture eases out where he stands)
    const k = ease(0);
    if (k > 1e-3) walkBody(c, 0, m.lastSw ?? 0, 0, k);
    // (nothing to walk: there already, nowhere given, or drawn at no size)
    if (!Number.isFinite(m.to) || !(rig.scale > 1e-6) || c.stopping || Math.abs(m.to - rig.x) < 2) { if (c.stopping) c.state._cut = true; return true; }
    if (c.fading) return false;
    // turned to the side he is going first (the walk asks for the turn itself)
    const want = m.to < rig.x ? 'sideL' : 'sideR';
    if (rig.facing !== want || rig.arriving) { if (!rig.arriving) void rig.turnForWalk(want); return false; }
    const dir = Math.sign(m.to - rig.x) || 1;
    // (the plan keeps the size he was when it was made: a size changed mid-walk does not change where he gets to)
    const sc = rig.scale;
    const p = planSteps(0, 0, Math.abs(m.to - rig.x) / sc, m.pace, 0, 'L', true);
    s = m.plan = { x0: rig.x, dir, sc, D: p.D, Th: p.Th, segs: p.segs, seg: 0, segT: 0, F: { L: 0, R: 0 }, hy: null, hv: 0, sw: null };
    m.req = false; m.stopReq = false;
  }
  // arrived: standing (while the move fades out, nothing may step again, and the walk's lean, hips and arms ease out
  // from where they were: dropped in one frame they popped)
  if (s.done) { walkBody(c, s.hs ?? s.hy ?? 0, s.sw ?? 0, 0, m.k ?? 1); return true; }
  // out of the side view (put in another facing: the walk is being faded out), or cut short: hold still where he is
  const hold = c.fading || c.view !== 'side';
  const sc = s.sc;
  // (a move that plants the feet, a jump, holds the walk where it is: the root and the steps slow with its weight)
  if (!hold) s.segT += c.dt / s.Th * (1 - rig.plantedWeight());
  while (s.segT >= 1) {
    const g = s.segs[s.seg]!;
    s.segT -= 1;
    s.F[g.sw] = g.to;
    c.emit({ type: 'footDown', foot: c.body(g.sw), move: 'walk' });
    s.seg++;
    const P = g.to, T = s.F[g.sw === 'L' ? 'R' : 'L'], nextSw: Side = g.sw === 'L' ? 'R' : 'L';
    if (s.seg >= s.segs.length) {
      // feet together: there, or (a new place behind him, or one asked for in the last step) on to it from standing
      rig.x = s.x0 + s.dir * P * sc;
      if (!c.stopping && !m.stopReq && Number.isFinite(m.to) && Math.abs(m.to - rig.x) >= 2) {
        // (a fresh plan from standing next frame, turning round first if it is behind him)
        m.plan = undefined; m.req = false; m.lastSw = s.sw ?? 0;
        walkBody(c, s.hs ?? s.hy ?? 0, s.sw ?? 0, 0, m.k ?? 1);
        return false;
      }
      s.done = true;
      // (stopped short of where it was going: it ends itself, but has not arrived)
      if (c.stopping || m.stopReq) c.state._cut = true;
      // (a walkTo turns him to the front from here, as the walk's posture eases out: waiting for the walk to have faded
      // out, he stood frozen for a beat first)
      rig.walkArrived(c.state._cut !== true);
      walkBody(c, s.hs ?? s.hy ?? 0, s.sw ?? 0, 0, m.k ?? 1);
      return true;
    }
    // at a footfall: a new place or a stop takes effect from here
    if (m.req || m.stopReq || c.stopping) {
      const E = c.stopping || m.stopReq ? P : (m.to - s.x0) * s.dir / sc;
      // (behind the planted foot: stop with the feet together here, then turn round)
      const p = planSteps(P, T, E >= P ? E : P, m.pace, g.v1, nextSw, false);
      s.segs = s.segs.slice(0, s.seg).concat(p.segs.map((q) => ({ ...q })));
      s.D = p.D; s.Th = p.Th;
      m.req = false;
      if (c.stopping) m.stopReq = true;
    }
  }
  const g = s.segs[s.seg]!;
  const u = s.segT;
  const first = g.first, last = g.last;
  // the root: off from standing, steady, slowing to a stop (each step a cubic from its start speed to its end speed, so a
  // change of step length never jolts it)
  const R = hermite(g.R0, g.R1, g.v0 * s.Th, g.v1 * s.Th, u);
  if (!hold) rig.x = s.x0 + s.dir * R * sc;
  const swing = g.sw;
  const stance: Side = swing === 'L' ? 'R' : 'L';
  const G = rig.geometry('side');
  const goals = {} as Record<Side, { x: number; y: number; a: number }>;
  const rel = {} as Record<Side, number>;
  const stride = Math.max(1, Math.abs(g.to - g.from));
  for (const f of ['L', 'R'] as const) {
    const st = c.stand(f);
    let F: number, lift = 0, a = 0;
    if (f === swing) {
      const e = smooth(u);
      F = g.from + (g.to - g.from) * e;
      // (a short step lifts the foot less)
      const reach = (last ? 0.55 : 1) * clamp(stride / (1.6 * s.D), 0.35, 1);
      // (a power above 1: the foot leaves the ground and meets it with no kick)
      lift = (first || last ? 15 : 20) * Math.pow(Math.sin(Math.PI * u), 1.45) * reach;
      // toe off, carried through, toe up to meet the ground
      a = SWING_TOE(u) * (first ? smooth(clamp(u * 2, 0, 1)) : 1);
      if (last) a *= 1 - smooth(u);
    } else {
      F = s.F[f];
      // after landing the foot flattens; before the other lands, its heel rises
      a = first ? STANCE_FIRST(u) : last ? STANCE_LAST(u) : STANCE_TOE(u);
    }
    rel[f] = F - R;
    // heel down: the foot turns about its heel; heel up: about its ball (the side view faces -x: toe up is positive).
    // In the air the turn's centre slides from the ball (lift-off) to the heel (landing): swapping it mid-air made the
    // ankle's path turn a corner.
    const px = f === swing ? BALL + (HEEL - BALL) * smooth(u) : a > 0 ? HEEL : BALL;
    const ar = a * Math.PI / 180;
    const ax = (G.legs[f].A[0] - px), ay = G.legs[f].A[1];
    const x = px + ax * Math.cos(ar) - ay * Math.sin(ar), y = ax * Math.sin(ar) + ay * Math.cos(ar);
    goals[f] = { x: st.x - rel[f] + (x - G.legs[f].A[0]), y: st.y + (y - G.legs[f].A[1]) - lift, a: st.a + a };
  }
  // the hips: as high as both feet allow (a leg never quite straight), which is what makes him rise and fall. The
  // swinging foot counts all the way: lifted under him it asks nothing, and as it comes down in front it lowers the hips
  // just as much as it needs to land without the leg overreaching (counting it only near the ground made the hips drop
  // late and fast, and the leg snap straight). The two are blended with a soft maximum, and the hips follow on a
  // critically damped spring (smooth in speed too).
  // (the knees come to their walking bend over the first half step and straighten over the last, so he sets off from
  // standing tall and stops standing tall)
  const bend = (first ? smooth(u) : 1) * (last ? 1 - smooth(u) : 1);
  const reachOf = (f: Side) => {
    const L = G.legs[f], Lmax = (L.L1 + L.L2) * (1 - 0.027 * bend);
    // (the leg's rest offset too: the far leg stands higher, and without it the far leg never limited the hips, and the
    // walk dipped after one footfall in two: a limp)
    const rest = G.rest[`thigh${f}`];
    const H = [L.H[0] + c.pose[`thigh${f}`].x + (rest?.x ?? 0), L.H[1] + c.pose[`thigh${f}`].y + (rest?.y ?? 0)];
    const dx = goals[f].x - H[0]!;
    return goals[f].y - Math.sqrt(Math.max(1, Lmax * Lmax - dx * dx)) - H[1]!;
  };
  const hs = reachOf(stance), hw = reachOf(swing);
  // (a soft maximum that never falls below the true one: one that rounds off below it let the hips sit a hair too high,
  // and the leading leg then had to lock straight to land)
  const target = smaxUp(smaxUp(hs, hw, 6), 0, 2);
  if (s.hy === null) { s.hy = target; s.hv = 0; s.hs = target; }
  else if (c.dt > 0) {
    const W = 46, n = Math.max(1, Math.ceil(c.dt * 240)), h = c.dt / n;
    for (let i = 0; i < n; i++) { s.hv += (W * W * (target - s.hy) - 2 * W * s.hv) * h; s.hy += s.hv * h; }
  }
  // (the spring is never let lag above what the legs allow: a leg asked to reach further than it can snaps straight)
  const prevHs = s.hs ?? s.hy;
  s.hs = smaxUp(s.hy, target, 3);
  if (c.dt > 0) s.hdv = (s.hs - prevHs) / c.dt;
  for (const f of ['L', 'R'] as const) c.feet[f] = goals[f];
  // the arms swing against the legs, a beat behind them
  const swT = clamp((rel.L - rel.R) / Math.max(1, s.D), -1.2, 1.2);
  s.sw = s.sw === null ? swT : s.sw + (swT - s.sw) * (1 - Math.exp(-c.dt * 7));
  // the dip after each contact rides up the spine: it gives a little, the head a fraction later nods with it
  walkBody(c, s.hs ?? s.hy, s.sw, Math.tanh((s.hdv ?? s.hv) / 260), hold ? (m.k ?? 1) : ease(1));
  m.lastSw = s.sw;
  return false;
}
/** The walk's body over its legs: the hips at their height, a slouch forward (the head pushed a little ahead of the
 *  shoulders), the arms swinging. */
function walkBody(c: Ctx, hy: number, sw: number, dip: number, k = 1) {
  c.add('hips', { y: hy });
  c.add('spine', { r: k * (-3.6 + 0.6 * dip), y: k * 0.8 * smax0(dip, 0.2) });
  c.add('neck', { r: -1.2 * k });
  c.add('head', { r: k * (4.4 + 0.9 * dip) });
  c.add('armL', { r: -12 * sw * k });
  c.add('foreL', { r: k * (5 + 9 * smax0(-sw, 0.15)) });
  c.add('armR', { r: 7.5 * sw * k });   // (the far arm swings less: forward, its hand would show between the legs)
  c.add('foreR', { r: k * (5 + 9 * smax0(sw, 0.15)) });
}

// ---------------------------------------------------------------- stepping on the spot (front, back, three-quarter)
// a foot's lift through its half of the step: up, a moment at the top, down faster, a soft touch (a stamp)
const MARCH_LIFT = kf([0, 0], [0.3, 1], [0.43, 0.14], [0.5, 0]);
function marchRun(c: Ctx) {
  if (c.view === 'side') return;
  const P = 1.0;
  const ph = c.t / P;
  const { q } = lean(c);
  const dirR = Math.sign(c.stand(c.letter('r')).x - c.stand(c.letter('l')).x) || 1;
  for (const f of ['L', 'R'] as const) {
    // (the step's phase by his side, so a turn's change of drawing keeps the same foot up)
    const mine = c.body(f) === 'r';
    const u = frac(ph + (mine ? 0 : 0.5));
    // (the two feet never alike: his right a little higher)
    const lift = u < 0.5 ? (mine ? 30 : 24) * MARCH_LIFT(u) : 0;
    const st = c.stand(f);
    // (three-quarter on the toe points down as the foot comes up)
    c.feet[f] = { x: st.x, y: st.y - lift, a: st.a + 10 * q * (lift / 30) };
    // a foot down: once a step (counted by his side, so a turn's change of drawing does not count it twice)
    const n = Math.floor(ph + (mine ? 0 : 0.5) - 0.5), key = 'down' + c.body(f);
    if (!c.ghost) {
      if (c.state[key] === undefined) c.state[key] = n;
      else if ((c.state[key] as number) < n) { c.state[key] = n; if (!c.fading) c.emit({ type: 'footDown', foot: c.body(f), move: 'march' }); }
    }
  }
  // the hips dip after each footfall and sway over the foot he stands on; the head bobs a moment later
  const fall = bump(frac(2 * ph), 0.25), fallH = bump(frac(2 * ph - 0.12), 0.25);
  const w = Math.sin(2 * Math.PI * ph);
  c.add('hips', { x: -3 * w * dirR, y: 4 * fall, r: 0.8 * w * dirR });
  c.add('spine', { r: -1.2 * w * dirR, y: -0.8 * fall });
  c.add('head', { r: 1 * w * dirR, y: 2 * fallH });
  // the arms swing against the legs (three-quarter on, where forward and back read, by 14 degrees; from the front a swing
  // out and in only, which bigger read as flapping)
  for (const s of ['L', 'R'] as const) {
    const k = c.body(s) === 'r' ? -1 : 1, a = mix(5, 14, q);
    arm(c, s, a * k * w + 3, 6 + 4 * k * w);
  }
}

// ---------------------------------------------------------------- the moves
// the moves' tracks, made once (made in the move, every frame of every move rebuilt them)
const WAVE_UP = kf([0, 0], [0.16, -5, ease.sine], [0.72, 116, ease.io], [2.2, 112, ease.sine], [3.0, 0, ease.io]);
// (side on the hand comes up to his mouth's height, ahead of his face, the forearm leaning forward: lower, the forearm
// held out level read as a tray; upright, his face juts out further than his elbow reaches, and the hand was against
// his face; higher, the arm went behind his hair)
const WAVE_UP_SIDE = kf([0, 0], [0.16, -5, ease.sine], [0.72, 70, ease.io], [2.2, 67, ease.sine], [3.0, 0, ease.io]);
// the forearm trails as the arm swings up (the hand a beat behind the elbow), whips past at the top, and trails again on
// the way down (the hand the last to leave the top): swung straight, the arm rose like a gate
const WAVE_FORE = kf([0, 0], [0.2, 14, ease.sine], [0.5, 44], [0.86, 54, ease.snap], [1.0, 50], [2.15, 50], [2.55, 70], [2.8, 48], [3.05, 0, ease.io]);
const WAVE_FORE_SIDE = kf([0, 0], [0.2, 12, ease.sine], [0.5, 46], [0.86, 62, ease.snap], [1.0, 58], [2.15, 58], [2.55, 74], [2.8, 52], [3.05, 0, ease.io]);
// the lazy wave (the default): the forearm comes up first, the upper arm a beat after, and on the way down the other way
const LWAVE_UP = kf([0, 0], [0.04, 0], [0.26, 1, ease.snap], [1.12, 1], [1.4, 0, ease.io]);
const LWAVE_FORE = kf([0, 0], [0.2, 1, ease.snap], [1.17, 1], [1.42, 0, ease.io]);
// the point: up to its angle (a share of it) with the elbow leading, a 3% settle through the hold, down unhurried
const POINT_UPN = kf([0, 0], [0.16, -0.08, ease.sine], [0.5, 1, ease.snap], [1.9, 0.97], [2.5, 0, ease.io]);
const POINT_FORE = kf([0, 0], [0.18, 40, ease.sine], [0.5, 8, ease.snap], [1.9, 10], [2.15, 46], [2.38, 30], [2.55, 0, ease.io]);
const POINT_WIND = kf([0, 0], [0.16, 1, ease.sine], [0.5, 0, ease.snap], [2.6, 0]);
// the hair flip: a dip towards the toss's side, the snap up and over, the hair thrown and overshooting, the eyes opening
// on a smug look
const FLIP_TOSS = kf([0, 0], [0.1, 6, ease.sine], [0.24, -18, ease.snap], [0.45, -15], [1.1, 0, ease.io]);
const FLIP_HEAD_Y = kf([0, 0], [0.1, 2], [0.24, -5], [1.0, 0]);
const FLIP_HAIR_SKEW = kf([0, 0], [0.12, 6, ease.sine], [0.3, -16, ease.snap], [0.42, 8], [0.62, -3], [0.9, 0]);
const FLIP_HAIR_STRETCH = kf([0, 0], [0.22, -0.05], [0.4, 0.06], [0.8, 0]);
const FLIP_LID = kf([0, 0], [0.06, 0.9], [0.38, 0.9], [0.46, 0.4], [1.25, 0.3]);
// (the head swings round towards the toss's side and back: the fringe is thrown across with the turn of the head)
const FLIP_TURN = kf([0, 0], [0.1, -4, ease.sine], [0.26, 14, ease.snap], [0.5, 10], [1.15, 0, ease.io]);
// the sigh: a long breath in, held, let go, and a little second sigh as he settles
const SIGH_BREATH = kf([0, 0], [0.9, 1, ease.sine], [1.25, 1], [2.0, -1, ease.io], [2.5, -0.5], [2.68, -0.75], [3.3, 0, ease.io]);
const SIGH_NOD = kf([0, 0], [0.9, -5], [1.25, -5], [2.0, 13], [2.5, 8], [2.68, 10], [3.3, 0]);
const SIGH_LID = kf([0, 0], [0.9, -0.15], [1.25, -0.1], [1.9, 0.65], [2.9, 0.6], [3.3, 0.2]);
const SIGH_LOOK = kf([0, 0], [0.9, -0.45], [1.25, -0.35], [2.0, 0.6], [2.75, 0.4], [3.1, -0.1], [3.3, 0]);
// the shrug: a quick snap up, a little bounce in the hold, dropped past rest and settling
const SHRUG = kf([0, 0], [0.14, 1, ease.snap], [0.3, 1], [0.38, 0.86], [0.47, 1], [0.72, 1], [0.84, -0.22, ease.i2], [1.05, 0.05], [1.45, 0, ease.io]);
// (the forearms come up ahead of the upper arms and go down after them, so the arms are never a straight T in between)
const HANDS = kf([0, 0], [0.06, -0.04, ease.sine], [0.24, 1.06, ease.snap], [0.36, 1], [1.36, 1], [1.62, 0, ease.io]);
const HANDS_FORE = kf([0, 0], [0.17, 1.04, ease.snap], [0.3, 1], [1.42, 1], [1.76, 0, ease.io]);
const NOD = kf([0, 0], [0.17, 14], [0.36, -1.5], [0.55, 8], [0.8, -0.5], [1.2, 0]);
// the shake: each turn a little smaller than the last, a two-frame hold at each end, fast through the middle
const SHAKE = kf([0, 0], [0.13, 16, ease.io], [0.165, 16], [0.35, -14, ease.io], [0.385, -14], [0.55, 10, ease.io], [0.585, 10], [0.74, -5, ease.io], [0.775, -5], [0.95, 0, ease.io], [1.35, 0]);
// the jump: higher and snappier than before (it floated), the feet reaching for the floor before they land
const JUMP_CROUCH = kf([0, 0], [0.32, 24, ease.snap], [0.4, 4, ease.i], [0.44, 2, ease.o], [0.84, 2, ease.io], [0.9, 7, ease.i], [1.02, 24, ease.o], [1.5, 0, ease.io]);
// (a parabola: off the floor at its fastest, slowing to the top and falling back as gravity has it)
const JUMP_LIFT = kf([0, 0], [0.4, 0], [0.65, -118, ease.o2], [0.9, 0, ease.i2], [1.6, 0]);
const JUMP_TUCK = kf([0, 0], [0.42, 0], [0.62, 26, ease.snap], [0.84, 0, ease.io]);
const JUMP_ARMS = kf([0, 0], [0.32, -32], [0.52, 66, ease.snap], [0.8, 30], [0.98, -10], [1.15, 4], [1.5, 0]);
// (the forearm: a touch bent at the top, leading with the elbow on the way down, never a straight T)
const JUMP_FORE = kf([0, 0], [0.32, 10], [0.52, 15], [0.7, 62], [0.92, 34], [1.1, -6], [1.5, 0]);
const JUMP_SPINE = kf([0, 0], [0.32, 9], [0.48, -3], [0.84, -2], [1.04, 9], [1.5, 0]);
const JUMP_NOD = kf([0, 0], [0.32, 6], [0.52, -5], [0.9, -2], [1.07, 8], [1.5, 0]);
const JUMP_LID = kf([0, 0], [0.32, 0.25], [0.52, -0.4], [0.88, -0.3], [0.96, 0.9], [1.04, 0.5], [1.5, 0]);
// the poke: a flinch (squashed in), a recoil, then the slide into being annoyed, and the shoulder brushed off
const POKE_SQ = kf([0, 0], [0.06, 1, ease.o], [0.18, 0.4], [0.4, 0], [1.5, 0]);
const POKE_RECOIL = kf([0, 0], [0.06, 0], [0.22, 1, ease.snap], [0.5, 0.7], [0.95, 0.15], [1.5, 0, ease.io]);
const POKE_LID = kf([0, 0], [0.03, 1], [0.08, 1], [0.14, -0.6], [0.35, -0.5], [0.55, 0.55], [1.3, 0.55], [1.5, 0.3]);
const POKE_BRUSH = kf([0, 0], [0.82, 0], [1.12, 1, ease.io], [1.32, 1], [1.5, 0, ease.io]);
// (the forearm folds across first, low, then the upper arm lifts it to the shoulder: the other way round, the hand swung
// up through the collar on its way over)
const POKE_BRUSH_F = kf([0, 0], [0.76, 0], [0.98, 1, ease.io], [1.34, 1], [1.5, 0, ease.io]);
// the look round: the eyes go first, the head after; the second side quicker; back to us, the eyes last
const LOOK_X = kf([0, 0], [0.3, -1, ease.snap], [0.95, -1], [1.18, 1, ease.io], [1.8, 1], [2.05, 0, ease.io], [2.75, 0]);
const LOOK_Y = kf([0, 0], [1.0, 0], [1.1, -0.3], [1.8, -0.25], [2.0, 0]);
/** A beat that hits: down accelerating into the hit (a quarter of the beat), held an instant, back up slow-fast-slow to
 *  hang at the top. Even both ways (a cosine), a headbang had no accent. 0 at the top, 1 at the hit. */
const hit = (p: number) => (p < 0.24 ? ease.i2(p / 0.24) : p < 0.29 ? 1 : 1 - smooth((p - 0.29) / 0.71));
/** hit with a hold of `hold` (a share of the beat) at the bottom, for a bang that lands and stays a moment. */
const hitHeld = (p: number, hold: number) => (p < 0.24 ? ease.i2(p / 0.24) : p < 0.24 + hold ? 1 : 1 - smooth((p - 0.24 - hold) / (0.76 - hold)));
/** A soft bounce on the beat: down quick (the first `a` of the beat), up slower; smooth all through. */
const bump = (p: number, a: number) => Math.pow(Math.sin(Math.PI * (p < a ? 0.5 * p / a : 0.5 + 0.5 * (p - a) / (1 - a))), 2);

// the headbang's beat (s), its sections (the bangs from HB_T0 to HB_T1, the windmill to HB_T2, the finale), its tracks
const HB_BEAT = 0.5, HB_T0 = 0.85, HB_T1 = HB_T0 + 4 * HB_BEAT, HB_T2 = HB_T1 + 2 * HB_BEAT, HB_LEN = HB_T2 + 1.25;
const HB_AMP = [0.85, 0.95, 1, 1.3] as const, HB_SIDE = [1, -1, 1, -1] as const;
const HB_STANCE = kf([0, 0], [0.42, 1, ease.snap], [HB_T2 + 0.55, 1], [HB_LEN, 0, ease.io]);
const HB_WIND = kf([0, 0], [0.5, -13, ease.o], [HB_T0, -5]);
const HB_FIN = kf([HB_T2, -5], [HB_T2 + 0.12, 40, ease.i2], [HB_T2 + 0.32, 37], [HB_T2 + 0.48, -13, ease.snap], [HB_T2 + 0.75, -3], [HB_LEN, 0, ease.io]);
const HB_FIN_CROUCH = kf([HB_T2, 0], [HB_T2 + 0.12, 15, ease.i2], [HB_T2 + 0.32, 14], [HB_T2 + 0.5, -2, ease.snap], [HB_T2 + 0.8, 0]);
const HB_TOSS = kf([HB_T2 + 0.3, 0], [HB_T2 + 0.47, -15, ease.snap], [HB_T2 + 0.72, 6], [HB_LEN, 0]);
const HB_HORN = kf([0, 0], [0.12, -0.12, ease.sine], [0.5, 1, ease.snap], [HB_T2 + 0.03, 1], [HB_T2 + 0.19, 0, ease.gather]);
const HB_HORN2 = kf([0, 0], [HB_T1 - 0.3, 0], [HB_T1 + 0.06, 1, ease.io], [HB_T2 + 0.03, 1], [HB_T2 + 0.19, 0, ease.gather]);
const HB_DROP = kf([0, 0], [HB_T2 + 0.03, 0], [HB_T2 + 0.19, 1, ease.gather], [HB_T2 + 0.5, 1], [HB_LEN, 0, ease.io]);
const HB_LOOKUP = kf([0, 0], [0.45, 1, ease.o], [HB_T0 + 0.05, 0], [HB_T2 + 0.46, 0], [HB_T2 + 0.52, 0.6], [HB_T2 + 0.8, 0]);
const HB_FIN_LID = kf([0, 0], [HB_T2 + 0.08, 0], [HB_T2 + 0.14, 0.8], [HB_T2 + 0.4, 0.8], [HB_T2 + 0.5, -0.25], [HB_T2 + 0.7, -0.1], [HB_T2 + 0.95, 0.38], [HB_LEN, 0.25]);

// the dance's beat (s: 120 bpm), and section A's feet: where each foot is (his leading side, the other) at the end of
// each of its four beats, in steps of 19 units towards his leading side, and where his weight is
const DANCE_BEAT = 0.5;
const DANCE_AR = [0.8, 0.8, 0.2, 0] as const;
const DANCE_AL = [-0.2, 0.35, -0.8, 0] as const;
const DANCE_AW = [1, 1, -1, 0] as const;

// the talk's words and phrases, made once a run (the same for the same length)
type TalkPlan = { words: { a: number; b: number; syl: number; amp: number[]; wide: number[] }[]; phrases: { a: number; b: number; dx: number; lift: boolean }[] };
const hash = (i: number) => frac(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
function talkPlan(len: number): TalkPlan {
  const words: TalkPlan['words'] = [], phrases: TalkPlan['phrases'] = [];
  let t = 0.04, n = 0, p = 0;
  while (t < len - 0.15) {
    const pa = t, pl = 1.2 + 0.6 * hash(900 + p);
    while (t < Math.min(len - 0.15, pa + pl)) {
      const syl = 1 + Math.floor(hash(n * 3 + 1) * 2.6), d = syl * (0.11 + 0.06 * hash(n * 3 + 2));
      const b = Math.min(len - 0.1, t + d);
      if (b - t < 0.08) break;
      const amp: number[] = [], wide: number[] = [];
      for (let k = 0; k < syl; k++) { amp.push(0.45 + 0.55 * hash(n * 11 + k * 5 + 3)); wide.push(hash(n * 13 + k * 7 + 4)); }
      words.push({ a: t, b, syl, amp, wide });
      // (shut for 2 to 4 frames between words)
      t = b + (2 + Math.floor(hash(n * 3 + 3) * 3)) / 60;
      n++;
    }
    phrases.push({ a: pa, b: t, dx: (hash(700 + p) < 0.5 ? -1 : 1) * (0.25 + 0.25 * hash(800 + p)), lift: hash(600 + p) > 0.6 });
    // (a breath between phrases)
    t += 0.25 + 0.15 * hash(500 + p);
    p++;
  }
  return { words, phrases };
}

export const ACTIONS = {
  /** Hold a pose (for a picture, a test, a host's own posing): opts.bones = { armR: { r: 90 }, ... } added to the
   *  pose, opts.face = part of the face, opts.grip = { L: 'open', R: 'fist' }, for opts.len seconds (or until stopped). */
  pose: {
    dur: (o) => (o.len as number) ?? 1e9,
    fadeIn: 0.0001, fadeOut: 0.0001,
    run(c, o) {
      for (const [b, v] of Object.entries((o.bones as Record<string, Partial<{ r: number; x: number; y: number }>>) ?? {})) c.add(b as never, v);
      Object.assign(c.face, (o.face as object) ?? {});
      if (c.w > 0.5) Object.assign(c.grip, (o.grip as object) ?? {});
    },
  },
  /** Walk to opts.to (host units), opts.pace (1). Turns to the side first; played again while walking, it takes the new
   *  place at the next footfall; asked to stop, it takes its last step. */
  walk: {
    dur: 0, loop: true, layer: 'move', fadeIn: 0.1, fadeOut: 0.4, run: walkRun,
    retarget(state, o) {
      const m = state as WalkMem, to = o.to as number;
      if (!Number.isFinite(to)) return false;
      m.to = to; if (typeof o.pace === 'number') m.pace = clamp(o.pace, 0.3, 3);
      m.req = true; m.stopReq = false;
      return true;
    },
    stop(state) { const m = state as WalkMem; if (!m.plan || m.plan.done) return false; m.stopReq = true; return true; },
  },
  march: { dur: 0, loop: true, layer: 'move', fadeIn: 0.2, fadeOut: 0.25, run: marchRun },

  /** A wave. The default is a lazy one (a teen's: the forearm up from a low elbow, two flaps of the hand, unimpressed);
   *  opts.big: the whole arm up over his head, rocked from the elbow, a smile. */
  wave: {
    dur: (o) => (o.big ? 3.1 : 1.6),
    fadeIn: 0.05, fadeOut: 0.15,
    run(c, o) {
      const t = c.t, s = myArm(c), oo = OUT[c.view][s];
      const { s: sd } = lean(c);
      const other: Side = s === 'L' ? 'R' : 'L';
      if (!o.big) {
        // the forearm comes up first from a low elbow (the upper arm a beat after, never above level), the hand flaps twice
        // from the wrist, and he puts it down again as if it cost him
        const kU = LWAVE_UP(t), kF = LWAVE_FORE(t);
        const flap = t > 0.42 && t < 1.18 ? Math.sin((t - 0.42) * 2 * Math.PI * 2.2) * sc((t - 0.42) / 0.12) * sc((1.18 - t) / 0.12) : 0;
        arm(c, s, mix(15, 25, sd) * kU + 2 * flap, mix(132, 108, sd) * kF, 1.5 * kU, 18 * flap + 6 * kF);
        if (c.w > 0.5 && kF > 0.4) c.grip[s] = 'open';
        const e = env(t, 1.6, 0.35, 0.4);
        c.add('head', { r: -oo * 2.5 * e, y: 0.5 * e });
        c.add('hips', { x: oo * 1.5 * e * (1 - sd) });
        arm(c, other, -1.5 * e, 4 * e);
        c.face.lid += 0.5 * e;
        c.face.lookX += 0.15 * eyesToUs(c) * e * (sd + c.quarter);
        if (t > 0.3 && t < 1.35) setMouth(c, 'flat');
        return;
      }
      // the big one: a little draw-in, then the arm swings up (the upper arm leads, the forearm trails a beat behind and
      // whips past at the top, the hand after it by the springs), waves from the elbow, and comes down unhurried, the hand
      // the last to leave the top. Side-on the hand comes up in front of his face.
      const up = mix(WAVE_UP(t), WAVE_UP_SIDE(t), sd), fore = mix(WAVE_FORE(t), WAVE_FORE_SIDE(t), sd);
      // the wave itself: the forearm rocks about the elbow, each rock a little smaller (17, 15, 12, 8), the upper arm
      // answering a little behind it
      const on = t > 0.7 && t < 2.2;
      const ph = (t - 0.7) * 2 * Math.PI * 2.3;
      const amp = on ? sc((t - 0.7) / 0.25) * sc((2.2 - t) / 0.3) * mix(1, 0.47, clamp((t - 0.7) / 1.4, 0, 1)) : 0;
      const wv = Math.sin(ph) * amp, wvU = Math.sin(ph - 0.52) * amp;
      // (side on the rock is smaller and swings away from his face more than towards it, a bigger forearm turn being
      // towards his face there: rocked back as far, the hand came against his nose)
      const rock = mix(17 * wv, 10 * (wv - 0.35 * Math.abs(wv)), sd);
      arm(c, s, up + 3 * wvU, fore + rock, 0, -8 * env(t, 3.1, 0.7, 0.8) - 6 * wv);
      // the hand opens as it comes up (the swap hidden in the swing) and relaxes on the way down
      if (c.w > 0.5 && up > 40) c.grip[s] = 'open';
      // the body leans away from the arm and sways with the rocks, the head tilts towards the wave; the free arm hangs
      // loose and sways a little against the wave
      const e = env(t, 3.1, 0.6, 0.7);
      c.add('spine', { r: -oo * (1.8 * e + 0.8 * wvU) });
      c.add('hips', { x: -oo * (6 * e + 1.5 * wvU) * (1 - sd) });
      c.add('head', { r: -oo * 5 * e });
      arm(c, other, -2 * e + 1.5 * wv * e, 6 * e - 3 * wv * e);
      c.face.squint += 0.3 * e;
      // (a smile on the first rock only, then back to his usual half-smile: a grin through the whole wave was off model)
      if (t > 0.6 && t < 1.15) setMouth(c, 'smile'); else if (t > 0.45 && t < 2.5) setMouth(c, 'smirk');
    },
  },

  point: {
    dur: 2.6,
    fadeIn: 0.05, fadeOut: 0.15,
    facePri: 1.5,
    run(c) {
      const t = c.t;
      // (which arm: the near one, but three-quarter on the far one, which points the way he faces: the near arm's "out"
      // is behind him there, and he pointed backwards while looking ahead)
      let b = c.state.arm as Body | undefined;
      if (!b) { b = c.body(c.view === 'quarter' ? 'R' : NEAR_ARM[c.view]); if (!c.ghost) c.state.arm = b; }
      const s = c.letter(b), o = OUT[c.view][s], other: Side = s === 'L' ? 'R' : 'L';
      const { s: sd, q } = lean(c);
      // drawn back with the elbow bending (the body winding the other way), then flung up on a diagonal, the elbow leading
      // and the forearm whipping straight; one jab; a little settle; down unhurried. (A level arm read as a signpost: up on
      // a diagonal it is "that one, there". Side on it stops short of his eyeline, or it is lost behind his hair.)
      const k = POINT_UPN(t);
      const top = mix(mix(124, 118, q / Math.max(1e-6, 1 - sd)), 102, sd);
      const up = k * top;
      const fore = POINT_FORE(t);
      const jab = Math.exp(-(((t - 1.0) / 0.06) ** 2));
      arm(c, s, up + 8 * jab, fore - 4 * jab, 0, 4 * jab);
      // the hand closes to a point on the way up (while it moves fast) and opens again on the way down
      if (c.w > 0.5 && up > 34) c.grip[s] = 'point';
      const e = env(t, 2.6, 0.45, 0.6);
      const wind = POINT_WIND(t);
      // he leans into it: the hips go the other way, the back towards the point, the free arm back a little; he looks
      // where the arm points (its "out", -o on the page) and nods with the jab, then his eyes come back to us with a blink
      const back = sc((t - 1.22) / 0.14) * (1 - sc((t - 2.25) / 0.3));
      c.face.lookX += -o * 0.9 * e * (1 - back) + 0.45 * eyesToUs(c) * back * (sd + q);
      c.face.lookY += -0.25 * e * (1 - back) * k;
      c.face.lid += blinkAt(t, 1.3, 0.17) + 0.15 * back;
      c.add('head', { r: -o * (4 - sd - q) * e + o * 2 * jab, y: 2.5 * jab * (1 - sd) });
      nodDown(c, 4 * jab);
      c.add('spine', { r: -o * (3 * e - 2.5 * wind) });
      c.add('hips', { x: o * 5 * e * (1 - sd) });
      arm(c, other, -5 * e, 10 * e);
      if (back > 0.5) setMouth(c, 'smirk');
    },
  },

  hairflip: {
    dur: 1.35,
    facePri: 2,
    run(c) {
      const t = c.t;
      const { s: sd, q, f: wf } = lean(c);
      // (which way the head turns for "up": from the side and three-quarters the chin goes up and back, from the front and
      // the back the head tips to his side; the first version nodded down from the side)
      const f = wf + (sd + q) * -c.fwd;
      // a little dip towards the other side with the eyes shutting, then a sharp toss of the head up and over, the head
      // swinging round with it so the fringe is thrown across, the shoulders going with it; the hair is thrown, overshoots
      // and lands; the eyes open on a smug look once it has
      const toss = FLIP_TOSS(t);
      c.add('head', { r: f * -toss * mix(1, 0.9, sd), y: FLIP_HEAD_Y(t) });
      c.add('neck', { r: f * -toss * 0.35 });
      c.add('spine', { r: f * toss * 0.22 });
      c.turnHead(FLIP_TURN(t) * toUs(c));
      // (the shoulder on the toss's side lifts into it, the other drops a little)
      const sh = smax0(-toss / 18, 0.1);
      for (const s of ['L', 'R'] as const) c.add(`arm${s}`, { y: -(s === 'L' ? 3.5 : 1.5) * sh });
      c.add('hips', { x: f * 2 * sh * (1 - sd) });
      // (the hair's ends are thrown and land behind the head; the spring adds its lag on top)
      c.add('hairlo', { kx: f * FLIP_HAIR_SKEW(t), sy: 1 + FLIP_HAIR_STRETCH(t) });
      c.face.lid += FLIP_LID(t);
      c.face.lookY += -0.2 * sc((t - 0.42) / 0.1) * (1 - sc((t - 1.0) / 0.3));
      if (t > 0.42 && t < 1.2) setMouth(c, 'smirk');
    },
  },

  sigh: {
    dur: 3.3,
    facePri: 2,
    run(c) {
      const t = c.t;
      const { s: sd, q } = lean(c);
      // a long breath in (the chest and shoulders rise, the chin lifts, the eyes widen a little), held, then let go: he
      // deflates past where he started, the shoulders drop, the head hangs, the knees give; a small second sigh as he
      // settles, and he ends looking at us
      const inhale = SIGH_BREATH(t);
      // (each half eased in over a wide margin, or the knees gave all at once as the breath turned)
      const slump = smax0(-inhale, 0.3), rise = smax0(inhale, 0.3);
      c.add('spine', { y: -10 * rise + 5 * slump, r: c.fwd * (sd + q) * 5 * slump });
      for (const s of ['L', 'R'] as const) {
        const k = c.body(s) === 'r' ? 1 : 0.85;
        c.add(`arm${s}`, { y: (-12 * rise + 6 * slump) * k, r: sd * 5 * slump });
        c.add(`fore${s}`, { r: OUT[c.view][s] * -3 * slump });
      }
      c.add('hips', { y: 8 * slump });
      nodDown(c, SIGH_NOD(t));
      c.face.lid += SIGH_LID(t);
      c.face.lookY += SIGH_LOOK(t);
      // (the end: eyes to us, and side and three-quarter on the head comes round a little to look)
      const end = sc((t - 2.75) / 0.3) * (1 - sc((t - 3.2) / 0.1));
      c.face.lookX += 0.45 * eyesToUs(c) * end * (sd + q);
      c.turnHead(5 * end * toUs(c) * (sd + q));
      if ((t > 1.3 && t < 1.98) || (t > 2.5 && t < 2.72)) setMouth(c, 'sigh'); else if (t > 1.98 && t < 3.2) setMouth(c, 'flat');
    },
  },

  shrug: {
    dur: 1.5,
    facePri: 2,
    fadeIn: 0.05, fadeOut: 0.15,
    run(c) {
      const t = c.t;
      const { s: sd, q } = lean(c);
      const k = SHRUG(t), kp = smax0(k, 0.06);
      // a snap: the shoulders go right up, the elbows stay in by his sides, the forearms open out, the hands tip palms up;
      // the head tips to one side and sinks between the shoulders, the eyes roll up and away; a little bounce in the
      // hold; then everything drops a touch past rest and settles
      for (const s of ['L', 'R'] as const) {
        const b = c.body(s), ks = SHRUG(t - LAG_FAST[b]) * AMT[b], kps = smax0(ks, 0.06);
        // (the forearms out to just under level and the hands tipped up at the wrist, so the open palms face up and out: at
        // 48 degrees out the hands hung low, pointing down, and read as hands held out, not a shrug. Three-quarter on the
        // hands turn less: past ~15 degrees the band's lower corner there shows a speck of the wrist)
        const fa = farApart(c, s);
        arm(c, s, (mix(8, 10, sd) + 9 * fa) * kps, (mix(58, 64, sd) - 22 * fa) * kps, 18 * ks, mix(mix(26, 14, q / Math.max(1e-6, 1 - sd)), 10, sd) * kps);
        if (c.w > 0.5 && ks > 0.35) c.grip[s] = 'open';
      }
      c.add('head', { y: 6 * k, r: (c.fwd * (sd + q) + (1 - sd - q)) * 8 * kp });
      c.add('spine', { y: -2 * k });
      c.add('hips', { x: 3 * kp * (1 - sd), r: 1.4 * kp * (1 - sd) });
      c.face.lid += 0.45 * kp;
      c.face.lookY += -0.4 * kp;
      c.face.lookX += 0.5 * kp * (1 - sd - q) + 0.3 * kp * eyesToUs(c) * (sd + q);
      if (kp > 0.3) setMouth(c, 'frown');
    },
  },

  /** Hands up, to show a hand shape (opts.grip: 'open' | 'fist' | 'point' | 'horns'): both arms snap up, the hands up
   *  beside his head, close or open on the way, hold (still alive), and come down. */
  hands: {
    dur: 1.8,
    fadeIn: 0.05, fadeOut: 0.15,
    run(c, o) {
      const t = c.t;
      const { s: sd } = lean(c);
      const k = HANDS(t);
      const g = (o.grip as Grip) ?? 'open';
      // (a bob in the hold, every 0.8 s: held dead still it read as a picture)
      const bob = Math.sin(2 * Math.PI * (t - 0.36) / 0.8) * sc((t - 0.36) / 0.2) * sc((1.4 - t) / 0.2);
      for (const s of ['L', 'R'] as const) {
        const b = c.body(s), ks = HANDS(t - LAG_FAST[b] * 0.5) * mix(1, AMT[b], 0.5), kf_ = HANDS_FORE(t - LAG_FAST[b] * 0.5);
        const fa = farApart(c, s);
        arm(c, s, (mix(70, 60, sd) + 12 * fa) * ks, (mix(95, 60, sd) - 26 * fa) * kf_, 2 * ks - 2 * bob, (g === 'point' ? -6 : 4) * ks);
        if (c.w > 0.5 && ks > 0.45) c.grip[s] = g;
      }
      c.add('head', { r: c.fwd * 2 * k, y: 1 * k + 0.6 * bob });
      c.add('spine', { y: -1.5 * k - 0.8 * bob });
      c.face.lookY += 0.15 * k;
      c.face.lid += blinkAt(t, 0.95, 0.16);
    },
  },

  nod: {
    dur: 1.2,
    run(c) {
      const t = c.t, n = NOD(t);
      const { s: sd, q } = lean(c);
      nodDown(c, n);
      // the back starts it a moment before the head (and gives a little with it), the eyes go down two frames ahead, and
      // he blinks on the first dip
      const nb = NOD(t + 0.03) / 14;
      c.add('spine', { r: c.fwd * (sd + q) * 3 * nb, y: 3 * smax0(nb, 0.05) * (1 - sd) });
      c.face.lookY += 0.045 * NOD(t + 0.035);
      c.face.lid += 0.012 * smax0(n, 1) + blinkAt(t, 0.1, 0.16);
    },
  },

  shake: {
    dur: 1.35,
    run(c) {
      const t = c.t;
      const { f: ff } = lean(c);
      const sw = SHAKE(t) / 16;
      // a real turn of the head, side to side (its drawing bends towards the next one's, as in a turn), each turn smaller,
      // the eyes leading it, held a moment at each end; the eyes shut for the first instant (a "no" that is also an eye
      // roll); it ends looking at us, a beat held
      c.turnHead(16 * sw * toUs(c));
      c.add('head', { r: 1 * sw });
      c.add('hips', { x: -1.5 * sw * ff });
      c.face.lookX += 0.3 * (SHAKE(t + 0.03) / 16) * eyesToUs(c);
      c.face.lid += 0.8 * (sc(t / 0.03) * (1 - sc((t - 0.1) / 0.06))) + 0.25 * env(t, 1.35, 0.2, 0.35);
      setMouth(c, 'flat');
    },
  },

  headbang: {
    dur: HB_LEN,
    facePri: 2,
    fadeIn: 0.12, fadeOut: 0.2,
    run(c) {
      const t = c.t;
      const { s: sd, q, f: ff } = lean(c);
      // A headbang in four parts, at 120 bpm (HB_BEAT): the wind-up (he sinks into a wide stance, throws the horns up and
      // tips his head back, the mouth open), four hard bangs driven from the knees and the back, two windmill circles with
      // the hair whipped round, and a last big hit held a beat before he whips back up, flicks the hair off and goes back
      // to being unimpressed. From the front a nod can only be a dip, so the hits are sold by the body (the knees and the
      // shoulders on every one) and the windmill by a roll of the head that the hair follows.
      const S = HB_STANCE(t);
      // the bangs: a beat each from HB_T0, down hard into the hit, a held instant, back up slow-fast-slow
      let nod = 0, bl = 0, b = 0, tilt = 0, tiltB = 0, big = false;
      // (from nothing at HB_T0: on at once, the pumps and the knees jolted in on the first beat)
      const bangEnv = smooth(clamp((t - HB_T0) / 0.14, 0, 1)) * smooth(clamp((HB_T1 - t) / 0.1, 0, 1));
      if (t < HB_T0) nod = HB_WIND(t);
      else if (t < HB_T1) {
        // (four bangs, never the same: a V to his right, his left, his right, then the big one to his left, held; the
        // body a frame behind the head)
        const ph = (t - HB_T0) / HB_BEAT, k = Math.min(3, Math.floor(ph)), kb = Math.max(0, Math.min(3, Math.floor(ph - 0.07)));
        big = k === 3;
        b = hitHeld(frac(ph), big ? 0.14 : 0.05) * HB_AMP[k]!;
        nod = -5 + 39 * b;
        const hb = hitHeld(frac(ph - 0.07), kb === 3 ? 0.14 : 0.05) * HB_AMP[kb]!;
        bl = bump(frac(ph - 0.07), 0.3) * bangEnv * HB_AMP[kb]!;
        tilt = HB_SIDE[k]! * b * bangEnv;
        tiltB = HB_SIDE[kb]! * hb * bangEnv;
      }
      // the windmill: two circles, a beat each, starting with the head up
      const inMill = t >= HB_T1 && t < HB_T2;
      const th = Math.PI + 2 * Math.PI * (t - HB_T1) / HB_BEAT;
      const millEnv = inMill ? smooth(clamp((t - HB_T1) / 0.15, 0, 1)) * smooth(clamp((HB_T2 - t) / 0.12, 0, 1)) : 0;
      if (inMill) nod = -5 + 30 * (0.5 + 0.5 * Math.cos(th)) * (0.4 + 0.6 * millEnv);
      if (t >= HB_T2) nod = HB_FIN(t);
      nodDown(c, nod);
      // the V: from the front the head tips to one side on the way down, the hips counter it a frame later, the hair is
      // thrown the other way; side on a V cannot show and the nod does it all. (dirR: which way his right is on the page)
      const dirR = Math.sign(c.stand(c.letter('r')).x - c.stand(c.letter('l')).x) || 1;
      c.add('head', { r: tilt * (11 * ff + 5 * q) * dirR, y: 6 * Math.max(0, b) * ff });
      c.add('neck', { r: 4 * tilt * ff * dirR });
      c.add('spine', { r: -4 * tiltB * ff * dirR });
      c.add('hips', { x: -4 * tiltB * ff * dirR });
      c.add('hairlo', { kx: -9 * tiltB * (ff + 0.5 * q) * dirR });
      // (the roll of the windmill: from the front and the back the head goes round side to side and the hair whips after
      // it; side on the circle is the nod itself, forward and back)
      const roll = millEnv * Math.sin(th) * (ff + 0.5 * q);
      c.add('head', { r: 20 * roll, x: 9 * roll });
      c.add('neck', { r: 7 * roll });
      c.add('spine', { r: 4 * millEnv * Math.sin(th - 0.6) * (ff + 0.5 * q) });
      c.add('hips', { x: -3 * roll });
      c.add('hairlo', { kx: 16 * millEnv * Math.sin(th - 0.9) * (ff + 0.6 * q), sy: 1 + 0.06 * millEnv * Math.abs(Math.sin(th - 0.9)) });
      // the last hit's hair toss: thrown back as he whips up (the hair flip's own direction, mixed by the shares)
      const tossDir = ff + (sd + q) * -c.fwd;
      c.add('hairlo', { kx: tossDir * HB_TOSS(t), sy: 1 + 0.5 * Math.abs(HB_TOSS(t)) / 14 * 0.08 });
      // the body: a wide stance, the knees soaking every hit, the back bowing over it side on, the shoulders hunching
      const fin = HB_FIN_CROUCH(t);
      c.add('hips', { y: 17 * S + 11 * bl + 3 * millEnv * (0.5 + 0.5 * Math.cos(th)) + fin });
      c.add('spine', { r: c.fwd * (sd + q) * (13 * bl + 10 * millEnv * (0.5 + 0.5 * Math.cos(th)) + 0.7 * fin), y: 5 * bl });
      for (const sdA of ['L', 'R'] as const) c.add(`arm${sdA}`, { y: -3.5 * bl - 0.15 * fin });
      // the feet: apart from the front, the back and three-quarters; side on one foot forward and the other back
      for (const sdA of ['L', 'R'] as const) {
        const st = c.stand(sdA), mine = c.body(sdA);
        const out = (mine === 'r' ? dirR : -dirR) * 10 * S * (1 - sd);
        const fb = (mine === 'r' ? 9 : -7) * S * sd * c.fwd;
        c.feet[sdA] = { x: st.x + out + fb, y: st.y, a: st.a };
      }
      // the arms: the near one throws the horns up and pumps them on the beat; the other pumps a fist, then goes up with
      // horns of its own for the windmill; both drop to fists by his sides on the last hit, then hang loose
      let hb = c.state.arm as Body | undefined;
      if (!hb) { hb = c.body(NEAR_ARM[c.view]); if (!c.ghost) c.state.arm = hb; }
      const hs = c.letter(hb), os: Side = hs === 'L' ? 'R' : 'L';
      const H = HB_HORN(t), H2 = HB_HORN2(t);
      const pump = (lag: number) => (t >= HB_T0 && t < HB_T1 ? bump(frac((t - HB_T0) / HB_BEAT - lag), 0.28) * bangEnv : 0);
      const pH = pump(0.1), pO = pump(0.16);
      const drop = HB_DROP(t);
      // (the horn arm leads with the elbow on its way up, bent, and straightens at the top: swung up straight it was a
      // gate. The fist: elbow down by his side, the fist up by the shoulder, pumped on the beat)
      const lead = t < 0.7 ? 55 * Math.sin(Math.PI * clamp(H, 0, 1)) * smooth(clamp((0.55 - t) / 0.2, 0, 1)) : 0;
      // (side on the horns go up forward, above his face: overhead they were lost behind his hair)
      // (in the windmill the raised arms sway with the circles; on the last hit they come down bent at the elbow, not
      // through a straight T)
      const swayA = 9 * millEnv * Math.sin(th - 0.4) * (ff + 0.5 * q);
      const dropBend = 70 * Math.sin(Math.PI * clamp(drop, 0, 1)) * (t < HB_T2 + 0.3 ? 1 : 0);
      arm(c, hs, H * (mix(146, 116, sd) + 7 * pH) + drop * -4 + swayA * (hs === 'L' ? 1 : -1), H * (mix(-14, 10, sd) + 16 * pH) + lead + drop * 14 + dropBend, 0, H * 6);
      const fistUp = S * 14 + 6 * pO, fistFore = S * 138 + 16 * pO;
      arm(c, os, mix(fistUp, mix(140, 112, sd), H2) * (1 - drop) + drop * -4 + swayA * (os === 'L' ? 1 : -1), mix(fistFore, mix(-12, 12, sd), H2) * (1 - drop) + drop * 14 + dropBend, 0, H2 * 6);
      if (c.w > 0.5) {
        c.grip[hs] = H > 0.5 ? 'horns' : S > 0.5 ? 'fist' : 'rest';
        c.grip[os] = H2 > 0.5 ? 'horns' : S > 0.5 ? 'fist' : 'rest';
      }
      // the face: the mouth open from the wind-up to the whip, the eyes shut on the hits and through the windmill; after
      // the whip, wide for an instant, then the lids come down and he smirks: unimpressed with himself
      c.face.lookY += -0.45 * HB_LOOKUP(t);
      c.face.lid += (t > HB_T0 - 0.2 && t < HB_T1 ? 0.5 * bangEnv : 0) + 0.5 * Math.max(0, b) + 0.75 * millEnv + HB_FIN_LID(t);
      // (a grimace through the bangs; the mouth open on the wind-up's yell, the big bang, the windmill and the whip)
      const yell = (t > 0.3 && t < HB_T0 - 0.05) || (big && b > 0.3) || millEnv > 0.3 || (t > HB_T2 + 0.4 && t < HB_T2 + 0.6);
      if (yell) setMouth(c, 'open');
      else if (t >= HB_T0 - 0.05 && t < HB_T2 + 0.4) setMouth(c, 'frown');
      else if (t >= HB_T2 + 0.6) setMouth(c, 'smirk');
    },
  },

  jump: {
    dur: 1.6,
    facePri: 2,
    plants: true,
    run(c) {
      const t = c.t;
      const { s: sd, q } = lean(c);
      // a deep gather (arms swung back, the back bent over the knees), up off the toes with the arms flung up to a Y and
      // the knees tucked, the hair lagging, the legs reaching for the floor, down into a crouch that soaks it up, and up
      // again with a little overshoot. (The push off hands its speed to the lift, and the landing's speed to the crouch.)
      const crouch = JUMP_CROUCH(t);
      const lift = JUMP_LIFT(t);
      c.root.y += lift * c.w;
      c.add('hips', { y: crouch });
      // in the air the knees come up; off the floor the toes point down (side on), and come up to meet it
      const tuck = JUMP_TUCK(t);
      const toe = -15 * sc((t - 0.36) / 0.06) * (1 - sc((t - 0.62) / 0.2));
      for (const s of ['L', 'R'] as const) { const st = c.stand(s); c.feet[s] = { x: st.x, y: st.y - tuck, a: st.a + toe * sd }; }
      if (t >= 0.9 && !c.state.landed && !c.ghost) { c.state.landed = true; c.emit({ type: 'land' }); }
      for (const s of ['L', 'R'] as const) {
        // (a third of a frame apart: the swing is so fast that a whole frame was a different pose, one arm up, one down)
        const k = c.body(s), lg = LAG_FAST[k] * 0.35, arms = JUMP_ARMS(t - lg) * mix(1, AMT[k], 0.4), fore = JUMP_FORE(t - lg);
        // (the swing up and the swing back are drawn at different strengths, so the two are blended over a wide margin:
        // switched over within a couple of degrees, the forearm's speed jumped as the arms came down through hanging)
        const up = smax0(arms, 14), back = smax0(-arms, 14);
        // the arms are flung up and out, past his hair from the front (a Y), up and forward reaching side on, a touch bent;
        // coming down the elbow leads. From the front, the back and three-quarters a swing back goes behind the hips, so the
        // hands stay beside them, a touch out
        const fa = farApart(c, s);
        arm(c, s, (mix(2.27, 1.75, sd) - 0.25 * fa) * up - mix(-0.08, 0.85, sd) * back, fore * (1 + 0.3 * fa) + mix(0.06, 0.4, sd) * back);
        // the hands spread as he goes up, and close again as he lands
        if (c.w > 0.5 && t > 0.42 && t < 0.92) c.grip[s] = 'open';
      }
      // the back bends over the gathered knees and straightens in the air (side and three-quarter on)
      c.add('spine', { r: c.fwd * (sd + q) * JUMP_SPINE(t) });
      for (const s of ['L', 'R'] as const) c.add(`arm${s}`, { y: -2 * smax0(crouch / 24, 0.1) });
      nodDown(c, JUMP_NOD(t));
      c.face.lid += JUMP_LID(t);
      if (t > 0.44 && t < 0.92) setMouth(c, 'open'); else if (t > 1.05 && t < 1.5) setMouth(c, 'smirk');
    },
  },

  dance: {
    dur: 0, loop: true, layer: 'body',
    facePri: 1.5,
    fadeIn: 0.35, fadeOut: 0.35,
    plants: true,
    run(c) {
      const t = c.t, beat = t / DANCE_BEAT, b16 = beat % 16, n = Math.floor(beat), p = frac(beat);
      const { s: sd, q, f: ff } = lean(c);
      // A 16-beat loop at 120 bpm in four sections, the energy rising to a deadpan button, every second loop mirrored:
      // A (0-3) step-touches to his right and his left; B (4-7) the skank, a knee up on every beat with the other arm
      // swinging up; C (8-11) two pogo jumps, a fist punched up on each, and a hair whip; D (12-15) the disco point, up,
      // down across, up, then a freeze, looking straight at us. Sections crossfade over 0.4 beat (wrapped at the seam).
      const mir = Math.floor(beat / 16) % 2 === 1;
      const R: Body = mir ? 'l' : 'r', Lb: Body = mir ? 'r' : 'l';
      const sec = (from: number, to: number) => sc((b16 - from + 0.2) / 0.4) * (1 - sc((b16 - to + 0.2) / 0.4));
      const wA = sec(0, 4) + sec(16, 20), wB = sec(4, 8), wC = sec(8, 12), wD = sec(12, 16) + sc((b16 + 16 - 12 + 0.2) / 0.4) * (1 - sc((b16 + 16 - 16 + 0.2) / 0.4));
      const dirR = Math.sign(c.stand(c.letter('r')).x - c.stand(c.letter('l')).x) || 1;
      // (his R side's way across the page, which a mirrored loop turns round)
      const dirLead = mir ? -dirR : dirR;
      const bnc = bump(p, 0.25), lag = bump(frac(beat - 0.12), 0.25);
      let hipsX = 0, hipsY = 0, hipsR = 0, spineR = 0, headR = 0, headY = 0, rootY = 0, hairKx = 0;
      const arms: Record<Body, { up: number; fore: number; lift: number; hand: number; grip: Grip }> = {
        r: { up: 0, fore: 0, lift: 0, hand: 0, grip: 'rest' }, l: { up: 0, fore: 0, lift: 0, hand: 0, grip: 'rest' } };
      const feet: Record<Body, { x: number; y: number; a: number }> = { r: { x: 0, y: 0, a: 0 }, l: { x: 0, y: 0, a: 0 } };
      // ---- A: step-touch to his right, then his left; the weight over the stepping foot, the knees giving on every beat
      if (wA > 1e-3) {
        // (fading out into B, past its fourth beat, it holds its end: started over at u 0, the feet jumped back a step)
        const late = b16 >= 4 && b16 < 8;
        const k = Math.floor(b16), kk = late ? 3 : clamp(k, 0, 3), u = late ? 1 : b16 - Math.floor(b16);
        const at = (tab: readonly number[], i: number) => (i < 0 ? 0 : tab[Math.min(3, i)]!);
        const mv = sc(clamp(u / 0.45, 0, 1));
        for (const side of ['r', 'l'] as const) {
          const tab = side === R ? DANCE_AR : DANCE_AL;
          const from = at(tab, kk - 1), to = at(tab, kk), X = mix(from, to, mv);
          const lift = from !== to ? Math.sin(Math.PI * clamp(u / 0.45, 0, 1)) ** 2 : 0;
          // (a touch: up on the toe through its count and down by its end)
          const touch = (side === Lb && kk === 1) ? sc(clamp(u / 0.3, 0, 1)) * (1 - sc(clamp((u - 0.72) / 0.28, 0, 1))) : 0;
          feet[side].x += (X * 19 * dirLead * (1 - sd) + X * 15 * c.fwd * sd * (side === R ? 1 : 1)) * wA;
          feet[side].y += (-10 * lift - 1.5 * touch) * wA;
          feet[side].a += -12 * touch * sd * wA;
        }
        const wt = mix(at(DANCE_AW, kk - 1), at(DANCE_AW, kk), sc(clamp(u / 0.6, 0, 1)));
        hipsX += wt * 11 * dirLead * wA; hipsY += (9 + 9 * bnc) * wA; hipsR += -3 * wt * dirLead * wA;
        spineR += 3.5 * wt * dirLead * wA; headR += 5 * wt * dirLead * wA; headY += 4 * lag * wA;
        for (const side of ['r', 'l'] as const) {
          const sw = (side === R ? -1 : 1) * wt;
          arms[side].up += mix(6 + 13 * sw + 3 * bnc, 4 + 16 * sw, sd) * wA;
          arms[side].fore += mix(-16 - 12 * bnc + 18 * sw, 28 + 10 * bnc, sd) * wA;
          arms[side].lift += 3 * smax0(sw, 0.3) * (1 - sd) * wA;
        }
      }
      // ---- B: the skank: a knee up on every beat, alternating, the arm on the other side swinging up bent, the other fist
      // low; the chest leans to the knee
      if (wB > 1e-3) {
        const knee: Body = n % 2 === 0 ? Lb : R;
        // (a squared sine: it leaves the floor and lands at rest; at a power under 2 its speed jumped at every beat)
        const lift = Math.sin(Math.PI * clamp(p / 0.7, 0, 1)) ** 2;
        hipsY += (6 + 6 * bnc) * wB;
        const kneeDir = knee === R ? dirLead : -dirLead;
        feet[knee].x += (-kneeDir * 6 * lift * (1 - sd) + 16 * lift * c.fwd * sd) * wB;
        feet[knee].y += -38 * lift * wB;
        feet[knee].a += 8 * lift * sd * wB;
        const swingArm: Body = knee === R ? Lb : R, low: Body = knee;
        // (the swinging arm starts and ends where the low one is: they swap at every beat, and any difference popped)
        arms[swingArm].up += (10 + mix(52, 60, sd) * lift) * wB;
        arms[swingArm].fore += (mix(-28, 26, sd) + mix(128, 50, sd) * lift) * wB;
        arms[low].up += 10 * wB; arms[low].fore += mix(-28, 26, sd) * wB;
        if (wB > 0.5) { arms[swingArm].grip = 'fist'; arms[low].grip = 'fist'; }
        spineR += 3 * lift * kneeDir * ff * wB; headR += -1.5 * lift * kneeDir * wB; headY += 3 * lag * wB;
      }
      // ---- C: two pogo jumps (on 8 and 10), a fist punched up on each, then a hair whip on 11
      if (wC > 1e-3) {
        const near: Body = c.body(NEAR_ARM[c.view]);
        for (const j of [8, 10]) {
          const u = b16 - j;
          if (u <= -0.5 || u >= 1.6) continue;
          const gather = u < 0 ? sc((u + 0.5) / 0.5) : u < 0.12 ? 1 - sc(u / 0.12) : 0;
          const air = u >= 0.12 && u <= 0.92 ? Math.sin(Math.PI * (u - 0.12) / 0.8) : 0;
          const land = u > 0.92 ? Math.sin(Math.PI * clamp((u - 0.92) / 0.5, 0, 1)) ** 2 : 0;
          rootY += -46 * air * wC;
          hipsY += (14 * gather + 13 * land) * wC;
          // (the fist: his R side on 8, the other on 10 from the front; three-quarter and side on, always the near arm)
          const front: Body = j === 8 ? R : Lb, puncher: Body = sd + q > 0.5 ? near : front, other: Body = puncher === 'r' ? 'l' : 'r';
          const fly = sc(u / 0.25) * (1 - sc((u - 0.85) / 0.4));
          arms[puncher].up += mix(147, 97, sd) * fly * wC; arms[puncher].fore += mix(12, 14, sd) * fly * wC;
          arms[other].up += 6 * fly * wC; arms[other].fore += -20 * fly * (1 - sd) * wC;
          for (const side of ['r', 'l'] as const) feet[side].y += -12 * air * wC;
        }
        // (both fists low by his sides all through the section, the punches added on top: a fist that only came in with
        // its jump popped in at the next jump's start)
        for (const side of ['r', 'l'] as const) { arms[side].up += 8 * wC; if (wC > 0.5) arms[side].grip = 'fist'; }
        const whip = b16 >= 11.2 && b16 < 12.2 ? Math.sin(Math.PI * (b16 - 11.2)) ** 2 : 0;
        const whipL = b16 >= 11.26 && b16 < 12.26 ? Math.sin(Math.PI * (b16 - 11.26)) ** 2 : 0;
        headR += 16 * whip * dirLead * wC; hipsX += -6 * whip * dirLead * wC; hairKx += -12 * whipL * dirLead * wC;
      }
      // ---- D: the disco point: up (12), down across (13), up (14), dropped (15.2), then a freeze on us
      let freeze = 0;
      if (wD > 1e-3) {
        const dpos = b16 >= 12 ? b16 - 12 : b16 + 4;
        const P = dpos < 1 ? sc(dpos / 0.3) : dpos < 2 ? mix(1, -1, sc((dpos - 1) / 0.3)) : dpos < 3 ? mix(-1, 1, sc((dpos - 2) / 0.3)) : mix(1, 0, sc((dpos - 3.2) / 0.3));
        // (through each change the elbow leads, bent: swung straight it passed through a held-out horizontal arm)
        const trn = (x: number) => (x > 0 && x < 0.34 ? Math.sin(Math.PI * x / 0.34) ** 2 : 0);
        const lead = 46 * (trn(dpos) + trn(dpos - 1) + trn(dpos - 2)) + 28 * trn(dpos - 3.2);
        const near: Body = c.body(NEAR_ARM[c.view]);
        const pointer: Body = sd + q > 0.5 ? near : R, other: Body = pointer === 'r' ? 'l' : 'r';
        // (each a parabola through its three keys, down across at -1, hanging at 0, up at 1: two straight pieces met at 0
        // with a kink, and the arm's speed jumped as it passed his side)
        const par = (lo: number, mid: number, hi: number) => mid + 0.5 * (hi - lo) * P + (0.5 * (hi + lo) - mid) * P * P;
        const up = par(mix(-18, -10, sd), 10, mix(140, 105, sd));
        const fore = par(mix(-24, 10, sd), 10, 6);
        arms[pointer].up += up * wD; arms[pointer].fore += (fore + lead) * wD;
        if (wD > 0.5 && Math.abs(P) > 0.3) arms[pointer].grip = 'point';
        // (the free arm hangs as the pointing one does at P 0, so the pose the loop starts and ends in is its own mirror)
        arms[other].up += 10 * wD; arms[other].fore += (10 + 2 * Math.abs(P)) * wD;
        const pDir = pointer === 'r' ? dirR : -dirR;
        hipsX += -7 * P * pDir * ff * wD; headR += 5 * P * pDir * wD; hipsY += (4 + 6 * Math.abs(P)) * wD;
        freeze = sc((dpos - 3.3) / 0.15) * (1 - sc((dpos - 3.88) / 0.12)) * wD;
        c.face.lid += blinkAt(dpos, 3.6, 0.3) * wD;
      }
      c.add('hips', { x: hipsX * (1 - sd), y: hipsY, r: hipsR * (1 - sd) });
      c.add('spine', { r: spineR * (1 - sd) + c.fwd * (sd + q) * 3 * bnc * (wA + wB), y: -1.5 * bnc * (wA + wB) });
      c.add('neck', { r: 0.3 * headR * (1 - sd) });
      c.add('head', { r: headR * (1 - sd) + c.fwd * sd * 3 * lag * (wA + wB), y: headY });
      c.add('hairlo', { kx: hairKx * (ff + 0.6 * q) });
      c.root.y += rootY * c.w;
      for (const side of ['r', 'l'] as const) {
        const L = c.letter(side), a = arms[side];
        arm(c, L, a.up, a.fore, a.lift, a.hand);
        if (c.w > 0.5) c.grip[L] = a.grip;
        const st = c.stand(L);
        c.feet[L] = { x: st.x + feet[side].x, y: st.y + feet[side].y, a: st.a + feet[side].a };
      }
      // the face: half-lidded and flat; open in the air; a smirk on the point; the freeze looks straight at us
      c.face.lid += 0.4 + 0.15 * freeze;
      c.face.lookX *= 1 - freeze; c.face.lookY += -0.1 * freeze;
      setMouth(c, rootY < -10 ? 'open' : wD > 0.5 && freeze < 0.3 ? 'smirk' : 'flat');
    },
  },

  /** Poked: a flinch (everything squeezed in, eyes shut), a recoil away, then annoyed at us, and the poked shoulder
   *  brushed off with the other hand. */
  poke: {
    dur: 1.5,
    facePri: 3,
    run(c) {
      const t = c.t;
      const { s: sd, q, f: ff } = lean(c);
      const sq = POKE_SQ(t), rc = POKE_RECOIL(t), br = POKE_BRUSH(t);
      // poked on the shoulder away from his near arm: he pulls away from it (towards the near arm's side from the front
      // and the back; back on his heels side on), and the near hand brushes that shoulder off
      let nb = c.state.arm as Body | undefined;
      if (!nb) { nb = c.body(NEAR_ARM[c.view]); if (!c.ghost) c.state.arm = nb; }
      const ns = c.letter(nb), fs: Side = ns === 'L' ? 'R' : 'L';
      const away = Math.sign(c.stand(ns).x - c.stand(fs).x) || 1;
      const awayX = away * (ff + 0.5 * q) - c.fwd * sd;
      c.add('hips', { x: 8 * rc * awayX, y: 4 * sq + 2 * rc });
      c.add('spine', { r: 5 * rc * (away * (ff + 0.5 * q) - c.fwd * sd), y: -2 * sq });
      c.add('head', { r: -3 * rc * away * ff, y: 5 * sq });
      c.add('hairlo', { sy: 1 - 0.05 * sq });
      for (const s of ['L', 'R'] as const) {
        const k = c.body(s), sqs = POKE_SQ(t - LAG_FAST[k]) * AMT[k], rcs = POKE_RECOIL(t - LAG[k]) * AMT[k], brf = POKE_BRUSH_F(t);
        const fa = farApart(c, s);
        c.add(`arm${s}`, { y: -14 * sqs });
        // the hands flare open on the flinch, and stay a little out through the recoil
        const brush = s === ns ? Math.max(br, brf) * (1 - c.back) : 0;
        arm(c, s, (9 + 9 * fa) * (0.4 * sqs + rcs) * (1 - brush), (18 - 8 * fa) * (0.4 * sqs + rcs) * (1 - brush), 0, 18 * sqs * (1 - brush));
        if (c.w > 0.5 && sqs + rcs > 0.4 && brush < 0.3) c.grip[s] = 'open';
      }
      // the brush-off: the near hand goes over to the far shoulder and sweeps it twice, out and down, off it. (The hand on
      // his chest under the collar, and the sweeps away from it: any higher, or a flick back up, and the fingers went in
      // under the collar and the hair, which are drawn over the arms.) From behind a hand in front of his chest cannot
      // be drawn (it lay across his back): there the poked shoulder twitches instead.
      const sweep = t > 1.1 && t < 1.38 ? Math.sin((t - 1.1) * 2 * Math.PI / 0.14) ** 2 : 0;
      const bk = c.back, brU = br * (1 - bk), brF = POKE_BRUSH_F(t) * (1 - bk);
      if (brF > 1e-3) {
        // (worked as the forearm's own angle, from hanging: first across his body, level at his waist, then the upper arm
        // lifts and it tips up to the far shoulder; folded with the upper arm still hanging, it curled the hand straight up
        // to his own shoulder and the collar)
        const U = mix(mix(31, 27, q / Math.max(1e-6, 1 - sd)), 30, sd), F = mix(-145, 88, sd);
        const Amid = mix(-92, 72, sd), A = brF * Amid + brU * (U + F - Amid), up = brU * U;
        arm(c, ns, up, A - up + 16 * sweep * brF, 0, brF * 14 * sweep);
        if (c.w > 0.5 && brF > 0.3) c.grip[ns] = 'open';
      }
      if (bk > 1e-3) c.add(`arm${fs}`, { y: -6 * br * bk * (0.4 + sweep) });
      // the face: shut on the poke, wide and gasping on the recoil, then annoyed, looking at us
      c.face.lid += POKE_LID(t);
      const atUs = sc((t - 0.35) / 0.15);
      c.face.lookX += 0.4 * eyesToUs(c) * atUs * (sd + q) - 0.3 * awayX * (1 - atUs) * sc((t - 0.08) / 0.05);
      c.turnHead(6 * atUs * toUs(c) * (sd + q) * (1 - sc((t - 1.3) / 0.2)));
      setMouth(c, t < 0.35 ? 'gasp' : 'frown');
    },
  },

  lookaround: {
    dur: 2.85,
    run(c) {
      const t = c.t;
      const { f: ff } = lean(c);
      const x = LOOK_X(t);
      const y = LOOK_Y(t);
      // the eyes go first (a tenth of a second ahead), the head turns after them (a real turn: its drawing bends towards
      // the next one's), the back following a little; partway through the first look the eyes flick back to us with a
      // blink, then away again; the second side is quicker; coming back the head arrives first and the eyes last, and he
      // stares at us, half-lidded
      const lead = 0.1 - 0.2 * sc((t - 1.4) / 0.25);
      const glance = sc((t - 0.55) / 0.05) * (1 - sc((t - 0.68) / 0.06));
      c.face.lookX += LOOK_X(t + lead) * eyesToUs(c) * (1 - glance); c.face.lookY += y;
      c.face.lid += blinkAt(t, 0.58, 0.15) + 0.1 + 0.4 * sc((t - 2.1) / 0.25);
      c.turnHead(16 * x * toUs(c));
      c.add('head', { r: 1.2 * x });
      c.add('spine', { r: 1.6 * x * ff });
      c.add('hips', { x: -1.2 * x * ff });
    },
  },

  /** Talk for opts.len seconds: words (1 to 3 syllables, the mouth shut for a few frames between them) in phrases of
   *  about a second and a half; at each phrase's end a small tilt and nod and a blink, the eyes wandering mid-phrase and
   *  coming back to us. The same every time for the same length (seeded by the word's number). */
  talk: {
    dur: (o) => (o.len as number) ?? 2,
    layer: 'face',
    fadeIn: 0.05, fadeOut: 0.12,
    facePri: 1.2,
    run(c, o) {
      const t = c.t, len = (o.len as number) ?? 2;
      const plan = (c.state.plan ??= talkPlan(len)) as TalkPlan;
      let open = 0, wide = 0.5;
      for (const w of plan.words) {
        if (t < w.a - 0.06 || t > w.b + 0.06) continue;
        const u = (t - w.a) / (w.b - w.a);
        if (u <= 0 || u >= 1) continue;
        const k = Math.min(w.syl - 1, Math.floor(u * w.syl)), su = u * w.syl - k;
        open = Math.max(open, w.amp[k]! * Math.pow(Math.sin(Math.PI * su), 0.8));
        wide = w.wide[k]!;
      }
      c.face.talk = Math.max(c.face.talk, open);
      c.face.talkW = wide;
      setMouth(c, 'talk');
      // the phrases: at the end of each a small tilt (alternating sides) and a nod, a blink; mid-phrase the eyes drift off
      // and come back; now and then a shoulder lifts on a word
      let tilt = 0, nod = 0, drift = 0, shrug = 0, blink = 0;
      for (const [i, p] of plan.phrases.entries()) {
        const e = t - p.b;
        if (e > -0.25 && e < 0.6) { const kk = Math.sin(Math.PI * clamp((e + 0.25) / 0.85, 0, 1)); tilt += (i % 2 ? -3 : 3) * kk; nod += 4 * kk; }
        blink = Math.max(blink, blinkAt(t, p.b + 0.05, 0.16));
        const m = (t - p.a) / (p.b - p.a);
        if (m > 0 && m < 1) drift += p.dx * Math.sin(Math.PI * m) ** 2;
        if (p.lift && m > 0.3 && m < 0.75) shrug += 4 * Math.sin(Math.PI * (m - 0.3) / 0.45);
      }
      c.add('head', { r: tilt * 0.9, y: 0.4 * open });
      nodDown(c, nod);
      for (const s of ['L', 'R'] as const) c.add(`arm${s}`, { y: -shrug * (c.body(s) === 'r' ? 1 : 0.4) });
      c.face.lookX += drift * (1 - c.side);
      c.face.lookY += -0.15 * Math.abs(drift);
      c.face.lid += blink;
    },
  },
} satisfies Record<string, Action>;

export type ActionName = keyof typeof ACTIONS;
export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];
