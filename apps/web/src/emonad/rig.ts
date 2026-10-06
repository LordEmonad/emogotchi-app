/**
 * Emonad's rig. Emonad is the mascot of $EMO, drawn from the operator's own turnaround sheet (emonad/turnaround.jpg):
 * packages/pet/emonad.svg, built by design/emonad.py from design/emonad_trace.py's trace. It stands alone: it knows
 * nothing of Emogotchi's pet rig, the director or the site, so it can go anywhere (the lab, a page, a video, the game).
 *
 * The drawing holds four views (front, side facing left, back, three-quarter facing right); two of them mirrored make six
 * facings. A view is flat parts in z order, each carried by a bone. Every frame the rig builds a pose (each bone's turn
 * and shift, plus a stretch and a skew that stay on that bone), works the matrices down the chain from the hips and
 * writes them on the parts. The legs are solved to where the feet should be (standing, stepping, in the air), so a foot
 * on the ground never slides. The hair is a spring that lags the head. The eyes are drawn every frame (lids, where he
 * looks) and the mouth is one of the drawn shapes, or drawn open as he talks.
 *
 *   const rig = new EmonadRig();  svg.append(rig.el);  rig.x = 300; rig.y = 400; rig.scale = 0.6;
 *   await rig.turnTo('sideL'); await rig.walkTo(100); await rig.play('wave');
 *
 * Coordinates: a view's own units are the sheet's pixels with (0,0) between the feet on the ground and up negative; he
 * is 660 tall. `x`, `y` and `scale` place that point in the host's own units.
 */
import RAW from '@emo-pets/pet/emonad.svg?raw';
import { ACTIONS, type Action, type ActionName } from './moves';
import { pairKey, parsePath, splineAt, splineAt1, thinPath, writePath, type GroupMap, type MorphData, type PathTpl } from './morph';

export type View = 'front' | 'side' | 'back' | 'quarter';
export type Facing = 'front' | 'quarterR' | 'sideR' | 'back' | 'sideL' | 'quarterL';
/** In turning order (to his left): a turn goes round this ring the short way. */
export const FACINGS: readonly Facing[] = ['front', 'quarterR', 'sideR', 'back', 'sideL', 'quarterL'];
export const FACING_OF: Record<Facing, { view: View; mirror: 1 | -1 }> = {
  front: { view: 'front', mirror: 1 },
  quarterR: { view: 'quarter', mirror: 1 },
  sideR: { view: 'side', mirror: -1 },
  back: { view: 'back', mirror: 1 },
  sideL: { view: 'side', mirror: 1 },
  quarterL: { view: 'quarter', mirror: -1 },
};

export type Mouth = 'neutral' | 'flat' | 'frown' | 'sad' | 'smile' | 'smirk' | 'open' | 'gasp' | 'sigh' | 'talk';
export type Mood = 'neutral' | 'smirk' | 'happy' | 'sad' | 'shocked' | 'tired' | 'annoyed' | 'dead';
export const MOODS: readonly Mood[] = ['neutral', 'smirk', 'happy', 'sad', 'shocked', 'tired', 'annoyed', 'dead'];

export const BONES = ['hips', 'spine', 'neck', 'head', 'hair', 'hairlo', 'armL', 'foreL', 'handL', 'sleeveL', 'armR', 'foreR', 'handR',
  'sleeveR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
export type Bone = typeof BONES[number];
const PARENT: Record<Bone, Bone | null> = {
  hips: null, spine: 'hips', neck: 'spine', head: 'neck', hair: 'head', hairlo: 'hair',
  armL: 'spine', foreL: 'armL', handL: 'foreL', sleeveL: 'spine', armR: 'spine', foreR: 'armR', handR: 'foreR', sleeveR: 'spine',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
};

/** A bone's pose: r turns it about its pivot (degrees, clockwise on screen), x/y shift it (view units); sx/sy stretch and
 *  kx skews (degrees) its own parts about its pivot, and are NOT passed to the bones it carries. */
export type BonePose = { r: number; x: number; y: number; sx: number; sy: number; kx: number };
export type Pose = Record<Bone, BonePose>;
export type Side = 'L' | 'R';
/** Where a foot should be: its ankle (view units) and its angle to the ground (degrees; toe up is positive when the toe
 *  points the way the view faces). Null: wherever the leg's pose puts it. */
export type FootGoal = { x: number; y: number; a: number } | null;

/** The face, as everything that runs this frame asks for it. lid: 0 the sheet's eyes, 1 shut, below 0 wide; squint:
 *  the lower lids up (a smile in the eyes); look: where the pupils go, -1..1 each way (x in the room's own direction). */
export type Face = { lid: number; lidL: number; lidR: number; squint: number; lookX: number; lookY: number; mouth: Mouth; talk: number;
  /** how wide the talking mouth is (0 round, 1 wide and flat) */
  talkW: number };
/** A hand's shape: the sheet's own (hanging loose), open (a wave, a jump, a shrug), a fist, or pointing (a fist with
 *  the index finger out along the back of the hand), or horns (the rock salute: the two outer fingers out). */
export type Grip = 'rest' | 'open' | 'fist' | 'point' | 'horns';
const GRIPS: readonly Grip[] = ['rest', 'open', 'fist', 'point', 'horns'];
/** What a hand can be drawn as: a move's shape, or one of the in-betweens the rig shows for a few frames when a hand
 *  changes shape (flat: between the sheet's hand and open; curl: between it, or open, and the fist or the point), so a
 *  hand opens and closes instead of snapping, even where it hardly moves. */
type HandShape = Grip | 'flat' | 'curl';
const SHAPES: readonly HandShape[] = ['rest', 'open', 'fist', 'point', 'horns', 'flat', 'curl'];
/** How long an in-between shows (seconds of his own time: three frames at 60, one at 24). */
const HAND_MID = 0.05;
function midShape(a: HandShape, b: Grip): HandShape | null {
  if (a === b || a === 'flat' || a === 'curl') return null;
  if ((a === 'open' && b === 'rest') || (a === 'rest' && b === 'open')) return 'flat';
  const closed = (g: HandShape) => g === 'fist' || g === 'point' || g === 'horns';
  if (closed(a) && closed(b)) return null;
  return 'curl';
}
type HandState = { shown: HandShape; target: Grip; until: number };
const handState = (): HandState => ({ shown: 'rest', target: 'rest', until: 0 });

/** His own sides (a part's letter names a side of the PAGE in its drawing, which is a different side of him from one
 *  drawing to the next, and swaps in a mirrored one). */
export type Body = 'r' | 'l';
export type Ctx = {
  /** seconds since the action started, its share of its length (0..1), and this frame's step */
  t: number; u: number; dt: number;
  /** the facing's mirror (the drawing shown the other way round: -1) */
  mirror: 1 | -1;
  /** this pass only draws another drawing of the same moment (a turn's swap shows two): change no state, move nothing */
  ghost: boolean;
  /** which side of HIM a part letter is in this drawing, and which letter one of his sides is: a move that uses one arm
   *  keeps that arm, by his side, through a turn */
  body(s: Side): Body;
  letter(b: Body): Side;
  /** how much of it shows (it fades in and out) */
  w: number;
  /** it is fading out (cut short: hold still, finish nothing), or has been asked to stop and ends by itself */
  fading: boolean; stopping: boolean;
  /** this run's own memory (write to it only when !ghost) */
  state: Record<string, unknown>;
  /** tell the host something (a foot down): only when !ghost */
  emit(e: RigEvent): void;
  view: View;
  /** How side-on he is (0..1) and how three-quarter on (0..1), from the body's angle: at rest 1 in that drawing and 0 in
   *  the others; through a turn they go smoothly between, and are the same in both drawings of a swap. The front and back
   *  have what is left (1 - side - quarter). A move that does a thing differently in different drawings mixes its values
   *  by these, never by `view`: picked by drawing, a raised arm jumped 45 degrees at the swap of a turn made mid-move. */
  side: number; quarter: number;
  /** how far he faces away (1 seen from behind, nothing from halfway to the side drawings on): for what cannot be drawn
   *  from behind (a hand in front of his chest) */
  back: number;
  /** which way his face points in this drawing's own units (-1 left, +1 right): the side and three-quarter drawings' own,
   *  and in the front drawing the way he is turning (0 straight on: nothing needs it there) */
  fwd: number;
  /** +1 while his body faces round to our right of straight on (quarterR, sideR), -1 to our left, 0 straight on or away */
  right: number;
  /** turn his head round (degrees, as a turn does: positive brings his face round towards our right from the front), by
   *  the move's weight: the head's drawing bends towards the next one's shape as in a turn, so a shake or a look round
   *  is a turn of the head, not a slide. Keep it under 20 (at 22.5 the head would change drawing). */
  turnHead(deg: number): void;
  /** where the feet go: set a side to a goal and the rig blends it in by w over whatever was asked before (null: standing) */
  pose: Pose; face: Face; feet: Record<Side, FootGoal>;
  /** each hand's shape this frame (not blended: set it while the move is more than half in) */
  grip: Record<Side, Grip>;
  /** the whole of him lifted off the floor (view units, up negative): a jump */
  root: { x: number; y: number };
  rig: EmonadRig;
  /** where a foot stands at rest in this view (what a null goal means) */
  stand(s: Side): { x: number; y: number; a: number };
  /** add to a bone: turns and shifts add, stretches multiply (all scaled by w) */
  add(bone: Bone, v: Partial<BonePose>): void;
};

// ---------------------------------------------------------------- 2-D affine matrices [a b c d e f]
type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
const tr = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const rot = (deg: number): M => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const inv = (m: M): M => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const at = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const D2R = Math.PI / 180;
const ang = (x: number, y: number) => Math.atan2(y, x) / D2R;
const str = (m: M) => `matrix(${m.map((v) => +v.toFixed(4)).join(' ')})`;
/** An SVG transform attribute as a matrix (the drawing uses rotate; the rest for safety). */
const parseTf = (s: string): M => {
  let m: M = ID;
  for (const [, fn, args] of s.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args!.trim().split(/[\s,]+/).map(Number);
    if (fn === 'rotate') m = mul(m, a.length > 2 ? mul(tr(a[1]!, a[2]!), mul(rot(a[0]!), tr(-a[1]!, -a[2]!))) : rot(a[0]!));
    else if (fn === 'translate') m = mul(m, tr(a[0]!, a[1] ?? 0));
    else if (fn === 'scale') m = mul(m, [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0]);
    else if (fn === 'matrix') m = mul(m, a.slice(0, 6) as M);
  }
  return m;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const blankPose = (): Pose => Object.fromEntries(BONES.map((b) => [b, { r: 0, x: 0, y: 0, sx: 1, sy: 1, kx: 0 }])) as Pose;
const blankFace = (): Face => ({ lid: 0, lidL: 0, lidR: 0, squint: 0, lookX: 0, lookY: 0, mouth: 'neutral', talk: 0, talkW: 0.5 });

const MOOD_FACE: Record<Mood, Partial<Face>> = {
  neutral: {},
  smirk: { mouth: 'smirk', lid: 0.3 },
  happy: { mouth: 'smile', squint: 0.45 },
  sad: { mouth: 'sad', lid: 0.38, lookY: 0.55 },
  shocked: { mouth: 'gasp', lid: -0.45 },
  tired: { mouth: 'flat', lid: 0.58, lookY: 0.25 },
  annoyed: { mouth: 'frown', lid: 0.42, lookX: 0.35 },
  dead: { mouth: 'flat', lid: 0.48, lookY: 0.65 },
};

/** Each view's pose at rest, on top of the drawing: the side view's far leg stands a little further back, so higher
 *  on the page (straight up: a sideways step would make the legs wider than the sheet's), and its shoe peeks out ahead
 *  of the near one as on the sheet. */
const REST: Partial<Record<View, Partial<Record<Bone, Partial<BonePose>>>>> = {
  side: { thighR: { y: -9 }, footR: { x: -5 } },
};
/** Which way a knee bends in a view drawn from the side (-1: towards -x). Front, back and three-quarter legs bend towards
 *  us, which is drawn as the leg getting shorter (the sheet's three-quarter legs are not quite straight, each its own way,
 *  so a sideways bend would show a kink at rest). */
const KNEE: Record<View, number> = { side: -1, quarter: 0, front: 0, back: 0 };
/** How far a knee goes out to the side (times the leg's length, for each part of its length it is shortened) where the
 *  knees bend towards us. */
const SPLAY = 0.55;
/** Which way is "out" (away from the body: up and to the side from the front and back, forward from the side) for each
 *  arm's turn, in a view's own units. */
export const ARM_OUT: Record<View, Record<Side, number>> = {
  front: { L: 1, R: -1 }, back: { L: 1, R: -1 }, quarter: { L: 1, R: -1 }, side: { L: 1, R: 1 },
};
/** A limit that eases in: about x for small x, never past ±lim (tanh). */
const soft = (x: number, lim: number) => lim * Math.tanh(x / lim);
/** A floor that eases in: x well above lo, lo well below it, a smooth bend of width w between (softplus). */
const softFloor = (x: number, lo: number, w: number) => lo + w * Math.log1p(Math.exp((x - lo) / w));
const smooth01 = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
/** A move cut short (another move on its layer takes over, or a stop) holds the pose it had reached and fades out from it
 *  over at least this long (s), and a move taking over from one fades in over the same: pose to pose. Faded out over its
 *  own short fade, a raised arm fell to hanging in eight frames and the next move climbed back up from nothing. (Not the
 *  walk: it takes its last step.) */
const XFADE = 0.32;
/** Ctx.side, Ctx.quarter and Ctx.fwd for a body angle (degrees) and the drawing being worked out. Each share is 1 at its
 *  own drawing's angle and 0 a drawing away, so at a swap (halfway between two drawings) the two drawings share them. */
function leanOf(ang: number, v: View) {
  const a = ((ang % 360) + 360) % 360;
  const dist = (b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const side = 1 - smooth01(0, 45, Math.min(dist(90), dist(270)));
  const quarter = 1 - smooth01(0, 45, Math.min(dist(45), dist(315)));
  const s = Math.sin(a * D2R);
  const fwd = v === 'side' ? -1 : v === 'quarter' ? 1 : v === 'front' ? (Math.abs(s) < 1e-6 ? 0 : Math.sign(s)) : 0;
  return { side, quarter, back: 1 - smooth01(0, 45, dist(180)), fwd, right: Math.abs(s) < 1e-6 ? 0 : Math.sign(s) };
}
const easeOut = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3;

/** What turns first in a turn: the head (with its neck, the hair and the face), then the body and legs. (The legs had
 *  their own, later stage once: under another view's shirt the tops of the thighs showed as boxes.) */
type Group = 'head' | 'body' | 'legs';
const groupOf = (b: Bone): Group => (b === 'head' || b === 'hair' || b === 'hairlo' || b === 'neck' ? 'head' : 'body');
/** A drawn part: its element, its bone, its name, its group, and which piece of HIM it is (the same in every drawing,
 *  so the turn can carry it from one drawing to the next: 'torso', 'arm_r', 'eye_l', 'hair', 'fringe' ...). */
type Part = { el: SVGGElement; bone: Bone; name: string; group: Group; unit: string | null };
/** One view worked out for a frame: its own pose (its rest and its legs solved) and every bone's matrix. */
type Solved = { v: View; rec: ViewRec; pose: Pose; M: Record<Bone, M> };

// ---------------------------------------------------------------- the turn
/** The angle each facing is drawn at (degrees; growing as he turns to his left, his face going round to our right). The
 *  sheet has no back three-quarter view: from side to back is one 90-degree stretch. */
const ANG: Record<Facing, number> = { front: 0, quarterR: 45, sideR: 90, back: 180, sideL: 270, quarterL: 315 };
const DRAWN: { a: number; f: Facing }[] = [
  { a: 0, f: 'front' }, { a: 45, f: 'quarterR' }, { a: 90, f: 'sideR' }, { a: 180, f: 'back' }, { a: 270, f: 'sideL' }, { a: 315, f: 'quarterL' }, { a: 360, f: 'front' },
];
/** The turn runs on a phase paced by what changes on the page, the head and the body each at its own pace: the phase at
 *  each knot (six to 45 degrees, every drawing on one) and the head's and the body's angle there, measured off the
 *  drawing by tools/emonad/turn-pace.cjs and .py (optical flow between stills a degree apart, the swaps' own jumps left
 *  out, the same both ways round, smoothed). A turn at an even pace in this phase changes the drawing at an even rate.
 *  The body's outline stands still where it is widest or narrowest (the front, the back, side on: at the back he hung
 *  there for frames) and changes fastest just before a swap, which the head does not, so one pace for both evened out
 *  neither: each goes quickly where it changes little and slowly where it changes much, and both come to every drawing
 *  at the same point of the phase. Measure again after the drawing or the in-betweens change. */
const PACE_PSI = [0.00, 6.19, 12.39, 18.58, 24.77, 30.97, 37.16, 47.83, 58.50, 69.17, 79.83, 90.50, 101.17, 107.73, 114.29, 120.85, 127.41, 133.97, 140.53, 147.09, 153.65, 160.21, 166.76, 173.32, 179.88, 186.50, 193.11, 199.72, 206.33, 212.94, 219.55, 226.16, 232.78, 239.39, 246.00, 252.61, 259.22, 269.91, 280.60, 291.29, 301.97, 312.66, 323.35, 329.46, 335.57, 341.68, 347.78, 353.89, 360.00];
const PACE_HEAD = [0.00, 8.19, 16.26, 24.62, 32.70, 39.44, 45.00, 52.85, 59.46, 65.93, 73.46, 81.36, 90.00, 94.25, 98.97, 104.26, 110.14, 116.49, 123.48, 131.66, 140.55, 149.20, 158.58, 169.11, 180.00, 191.03, 201.60, 210.96, 219.72, 228.73, 236.79, 243.73, 250.07, 255.93, 261.14, 265.81, 270.00, 278.48, 286.38, 293.81, 300.23, 306.95, 315.00, 320.67, 327.58, 335.71, 343.92, 351.89, 360.00];
const PACE_BODY = [0.00, 9.73, 17.14, 24.25, 32.25, 39.23, 45.00, 53.12, 59.83, 66.22, 73.25, 80.95, 90.00, 99.46, 108.30, 116.36, 123.85, 130.75, 136.66, 141.90, 147.16, 152.80, 159.15, 166.88, 180.00, 192.64, 200.28, 206.61, 212.25, 217.51, 222.81, 228.85, 235.85, 243.44, 251.61, 260.61, 270.00, 278.81, 286.48, 293.44, 299.83, 306.65, 315.00, 320.86, 327.96, 335.81, 342.72, 350.20, 360.00];
type Paced = 'head' | 'body';
/** (slopes for a smooth curve through each table that never overshoots, on uneven knots: Fritsch-Carlson, Brodlie's
 *  weights; round the circle, the first and last knots the same angle a turn apart) */
const PACE_M = (() => {
  const X = PACE_PSI, n = X.length, hs = X.slice(1).map((x, i) => x - X[i]!);
  const slopes = (Y: number[]) => {
    const d = Y.slice(1).map((y, i) => (y - Y[i]!) / hs[i]!), m = new Array<number>(n);
    const at = (i: number) => (i + d.length) % d.length;
    for (let i = 0; i < n; i++) {
      const j0 = at(i - 1), j1 = at(i), a = d[j0]!, b = d[j1]!, h0 = hs[j0]!, h1 = hs[j1]!;
      m[i] = a * b <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / b);
    }
    return m;
  };
  return { head: slopes(PACE_HEAD), body: slopes(PACE_BODY) };
})();
const PACE_Y: Record<Paced, number[]> = { head: PACE_HEAD, body: PACE_BODY };
function paceSeg(r: number): number {
  let lo = 0, hi = PACE_PSI.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (PACE_PSI[mid]! <= r) lo = mid; else hi = mid - 1; }
  return lo;
}
function angOfPhi(p: number, g: Paced = 'head'): number {
  const n = Math.floor(p / 360), r = p - 360 * n, i = paceSeg(r), Y = PACE_Y[g], M = PACE_M[g];
  const h = PACE_PSI[i + 1]! - PACE_PSI[i]!, t = (r - PACE_PSI[i]!) / h, t2 = t * t, t3 = t2 * t;
  return 360 * n + (2 * t3 - 3 * t2 + 1) * Y[i]! + (t3 - 2 * t2 + t) * h * M[i]! + (-2 * t3 + 3 * t2) * Y[i + 1]! + (t3 - t2) * h * M[i + 1]!;
}
/** Degrees of angle per unit of phase, there. */
function angSlope(p: number, g: Paced = 'head'): number {
  const r = ((p % 360) + 360) % 360, i = paceSeg(r), Y = PACE_Y[g], M = PACE_M[g];
  const h = PACE_PSI[i + 1]! - PACE_PSI[i]!, t = (r - PACE_PSI[i]!) / h, t2 = t * t;
  return ((6 * t2 - 6 * t) * Y[i]! + (3 * t2 - 4 * t + 1) * h * M[i]! + (-6 * t2 + 6 * t) * Y[i + 1]! + (3 * t2 - 2 * t) * h * M[i + 1]!) / h;
}
/** (the head's: at a drawing, where turns start and end, the two are the same) */
function phiOfAng(a: number): number {
  const n = Math.floor(a / 360), r = a - 360 * n;
  let lo = 0, hi = 360;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (angOfPhi(mid) < r) lo = mid; else hi = mid; }
  return 360 * n + (lo + hi) / 2;
}
/** A value carried through the drawings (a piece's middle or width): a cubic between the two drawings of a pair, its
 *  slope at each from the drawings either side, held to zero where the value turns (a piece is widest or furthest out
 *  in that drawing) and never steep enough to overshoot. Carried in straight lines from drawing to drawing, every piece
 *  changed speed at every drawing, a tick each time, and bounced off the drawings where it turns back. */
function carry(v0: number | null, v1: number, v2: number, v3: number | null, t: number): number {
  const d1 = v2 - v1;
  const tan = (da: number, db: number) => (da * db <= 0 ? 0 : Math.sign(db) * Math.min(Math.abs((da + db) / 2), 3 * Math.abs(da), 3 * Math.abs(db)));
  const m1 = v0 === null ? d1 : tan(v1 - v0, d1), m2 = v3 === null ? d1 : tan(d1, v3 - v2);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2;
}
/** Where a Between falls in the ring of drawings: the pair as (first, second) in turning order and how far from the
 *  first to the second (0..1). */
function segOf(at: Between): { i: number; t: number } {
  const n = FACINGS.indexOf(at.near), R = FACINGS.length;
  return at.low ? { i: n, t: 0.5 * Math.max(0, at.k) } : { i: (n - 1 + R) % R, t: 1 - 0.5 * Math.max(0, at.k) };
}
/** Which side of him a part's L/R names, per view (the views name parts by the side of the page): r = his right. */
const SIDE_OF: Record<View, Record<Side, 'r' | 'l'>> = {
  front: { L: 'r', R: 'l' }, quarter: { L: 'r', R: 'l' }, side: { L: 'l', R: 'r' }, back: { L: 'l', R: 'r' },
};
/** Which side of him a part letter is in a facing (the view's own table, swapped in a mirrored drawing), and back. */
const bodyOf = (v: View, mir: number, s: Side): Body => { const b = SIDE_OF[v][s]; return mir > 0 ? b : b === 'r' ? 'l' : 'r'; };
const letterOf = (v: View, mir: number, b: Body): Side => (bodyOf(v, mir, 'L') === b ? 'L' : 'R');
/** A drawing's pose for this frame, and where its feet go and its hands' shapes. */
type BuiltPose = { pose: Pose; feet: Record<Side, FootGoal>; grip: Record<Side, Grip>; headTurn: number };
const swapLR = (u: string) => (u.endsWith('_r') ? u.slice(0, -1) + 'l' : u.endsWith('_l') ? u.slice(0, -1) + 'r' : u);
/** The piece of him a part is, in a view drawn the right way round. (A mirrored drawing swaps his left and right.) */
function unitOf(v: View, name: string): string | null {
  if (name.startsWith('shoulder')) return null;
  if (name === 'neckbase') return 'neck';
  if (name === 'torso' || name === 'neck' || name === 'face' || name === 'mouth') return name;
  if (name.startsWith('hairback')) return 'hair';
  if (name.startsWith('hairfront')) return v === 'side' || v === 'back' ? 'hair' : 'fringe';
  const m = /^(arm|fore|hand|sleeve|thigh|shin|shoe|eye)([LR])$/.exec(name);
  if (!m) return null;
  const s = SIDE_OF[v][m[2] as Side];
  return (m[1] === 'eye' ? 'eye_' : m[1] === 'thigh' || m[1] === 'shin' || m[1] === 'shoe' ? 'leg_' : 'arm_') + s;
}
/** A box as the turn uses it: its middle and width (and its middle's height). */
type Box = { cx: number; cy: number; w: number };
const lerpBox = (a: Box, b: Box, k: number): Box => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), w: lerp(a.w, b.w, k) });
/** Where an angle falls between the drawings: the drawing nearest it (the one shown), the other one of its pair, and how
 *  far it is from the shown drawing towards the swap halfway between them (0 at the drawing, 1 at the swap). */
type Between = { near: Facing; other: Facing; k: number; low: boolean; m: number; half: number };
function between(th: number): Between {
  const a = ((th % 360) + 360) % 360;
  let i = 0;
  while (i < DRAWN.length - 2 && DRAWN[i + 1]!.a <= a) i++;
  const A = DRAWN[i]!, B = DRAWN[i + 1]!, m = (A.a + B.a) / 2, low = a < m;
  return { near: low ? A.f : B.f, other: low ? B.f : A.f, k: low ? (a - A.a) / (m - A.a) : (B.a - a) / (B.a - m), low, m, half: (B.a - A.a) / 2 };
}
/** A group's angle as a damped spring chasing a target that eases from the start to the end of the turn: velocity is
 *  never broken, so the turn is one continuous motion with a little overshoot at the end. The head is the stiffer
 *  spring and starts first: it leads, the body follows. */
const SPRING: Record<'head' | 'body', { w: number; z: number; delay: number }> = {
  head: { w: 15, z: 0.72, delay: 0 }, body: { w: 12.5, z: 0.8, delay: 0.02 },
};
/** (the springs run on the phase: see PACE_PSI) */
type GroupSpring = { th: number; v: number };
/** A turn: from angle a0 to a1 (phase p0 to p1), over Tr; a spin eases in and out over its first and last `e` of Tr and
 *  goes round at an even pace between (a turn eases all the way: smoothstep). `lids`: where the eyes are shut, as
 *  stretches of phase along the turn from p0 (over each swap with the face in view, joined when close). */
type Turn = { f: Facing; dir: 1 | -1; a0: number; a1: number; p0: number; p1: number; t0: number; Tr: number; e: number; head: GroupSpring; body: GroupSpring;
  lids: [number, number][]; resolved: boolean; done: (ok: boolean) => void };
/** A spin's pace: its even speed (phase a second: 360 is once round) and how long it takes to get up to it and to stop
 *  (short: the first and last swaps, a few degrees from the drawing he starts and ends on, then come at most of his
 *  speed; over 0.42 s they came slowly, and a swap seen slowly is a click). */
const SPIN = { speed: 230, ease: 0.3 };
/** How far along a turn is (0..1) at u of its time: a turn eases in and out all the way (smoothstep); a spin speeds up
 *  over its first `e` (its speed growing as smoothly as it can from nothing: no jolt), goes round at an even pace, and
 *  slows the same way over its last `e`. */
function turnProgress(tr: { e: number }, u: number): number {
  const e = tr.e;
  if (!(e > 0)) return smooth01(0, 1, u);
  u = clamp(u, 0, 1);
  const vm = 1 / (1 - e), ramp = (x: number) => vm * e * (x * x * x - x * x * x * x / 2);
  if (u < e) return ramp(u / e);
  if (u > 1 - e) return 1 - ramp((1 - u) / e);
  return vm * (e / 2 + (u - e));
}
type Eye = { el: SVGGElement; open: SVGGElement; closed: SVGPathElement; fold: SVGPathElement | null; white: SVGPathElement; clip: SVGPathElement; lid: SVGPathElement; lower: SVGPathElement;
  pupil: SVGGElement; L: [number, number]; R: [number, number]; cu: [number, number]; cl: [number, number]; cc: [number, number]; P: [number, number]; side: Side };
type Elbow = { up: SVGPathElement; lo: SVGPathElement; E: [number, number]; u: [number, number]; W: [number, number, number, number] };
type Shoulder = { path: SVGPathElement; side: Side; N: [number, number]; tN: [number, number]; T: [number, number]; tT: [number, number];
  I: [number, number]; tI: [number, number]; A: [number, number]; tA: [number, number]; a: number; b: number };
/** The arm's follow-through: the forearm swings behind the upper arm and the hand behind the forearm, as springs. */
type ArmSpring = { u: number | null; vu: number; f: number | null; vf: number; pf: number; wf: number; ph: number; wh: number };
const armSpring = (): ArmSpring => ({ u: null, vu: 0, f: null, vf: 0, pf: 0, wf: 0, ph: 0, wh: 0 });
type Leg = { H: [number, number]; K: [number, number]; A: [number, number]; L1: number; L2: number };
/** A knee: the path drawn in the shin's part, and the leg's edges at the knee (the thigh's 't', the shin's 's', each side's
 *  point on the cut line and its way away from the knee, [x, y, dx, dy]; measured on the drawing, emonad.py KNEE_EDGES) */
type EdgeLine = [number, number, number, number];
/** Side on, the corner under a raised arm (the sleeve's underside: root point, way down to the hem, length; the chest's
 *  front: point and way down), rounded every frame (emonad.py SIDE_ARMPIT) */
type SideArmpit = { path: SVGPathElement; side: Side; u: [number, number, number, number, number]; c: [number, number, number, number, number, number, number] };
type Knee = { path: SVGPathElement; side: Side; K: [number, number]; t: { p: EdgeLine; n: EdgeLine }; s: { p: EdgeLine; n: EdgeLine } };
/** A wrist (emonad.py wjoint_data): the hand's pivot (the middle of the band line's lower edge), the arm's way down, the
 *  band line's lower edge (x y pairs, outline to outline), the hand's half width to its outline's middle, the outline's
 *  and the band line's widths; the paths drawn every frame: the wedge's skin and outline (in the hand), the band's cut
 *  and its lower line along it (in the forearm). */
type WristJoint = { c: [number, number]; u: [number, number]; wcut: Float64Array; wh: number; wo: number; wi: number;
  skin: SVGPathElement; ink: SVGPathElement; clip: SVGPathElement; line: SVGPathElement };
/** A raised sleeve's corner with the shirt where no shoulder piece carries it (emonad.py FILLETS): the shirt's outline
 *  (shirt's drawing, x y pairs from the neck's end down) and per corner the sleeve's edge (sleeve's drawing, root to hem),
 *  which way along the outline is free of the sleeve, which side of each is inside, how far the curve may run on each. */
type FilletSub = { s: Float64Array; free: 1 | -1; inS: 1 | -1; inC: 1 | -1; a: number; b: number; path: SVGPathElement };
type Fillet = { side: Side; c: Float64Array; cum: Float64Array; subs: FilletSub[] };
/** A shape the turn bends (see morph.ts): its element, how its points are written, where they are at rest (x, y pairs
 *  in its own units), the matrix from its own units to its part's (a mouth shape drawn turned), and how far bent it is
 *  as last written (0: as drawn). */
type MorphEl = { el: Element; i: number; kind: 'path' | 'circle' | 'paint'; tpl: PathTpl | null; base: Float64Array; rest: string[]; m: M; mi: M; k: number; part: string;
  /** the hair's strands and shading (eased down at the swap: see DETAIL_FADE), the side view's far leg (its shade eased to
   *  the near one's black by the swap: the other drawing's far leg is black) */
  detail: boolean; farInk: boolean;
  /** its own transform attribute as drawn (a bent shape that moves as a whole gets a transform instead of new points) */
  tf0: string | null; T0: M;
  /** its lighter copy for while it is bent (thinPath), made when first needed (shared by every rig: sh) */
  thin?: { tpl: PathTpl; idx: Uint32Array }; sh: SharedMel };
/** What every rig's copy of a shape has in common (its numbers), kept once per view for all rigs. */
type SharedMel = Omit<MorphEl, 'el' | 'k' | 'sh' | 'thin'> & { tag: string; thin?: { tpl: PathTpl; idx: Uint32Array } };
const SHARED_MELS = new Map<View, SharedMel[]>();
/** A pair worked out once for all rigs: every number of a MorphPrep, by the index of what it belongs to (a shape in its
 *  view's list, an eye, a shoulder, a part). */
type SharedPrep = { els: (Float64Array | undefined)[]; aff: (M | undefined)[]; covered: Uint8Array; eyes: (Float64Array | undefined)[];
  shoulders: (Partial<Shoulder> | undefined)[]; far: number[]; partAff: Map<string, M>; knees: (Float64Array | undefined)[] };
const SHARED_PREP = new Map<string, SharedPrep | null>();
/** At a swap the hair's strands and dark shading are eased half way into the hair's own colour: the two drawings'
 *  strands are not the same strands, and swapped at full strength the whole head of hair flickered to a new texture. Their
 *  outline and colour go straight through, and the strands come back as the new drawing settles (a smear, as an animator
 *  would draw it at the fastest moment of a turn). Only half way, and only over the last stretch before the swap
 *  (DETAIL_FROM): eased most of the way over most of the stretch, a 360 went flat six times, a pulse at every swap. The
 *  build marks those shapes with the class `hd`. */
const DETAIL_FADE = 0.5, DETAIL_FROM = 0.6;
/** How far the back of his hair's strands have slid by a swap with a side view (view units; see emonad.py SLIDE). */
const HAIR_SLIDE = 9;
const FAR_INK = [0x1a, 0x15, 0x20];
/** How far out from the turning axis the hair's ends swing (view units: about the head's half width), for the lag they
 *  get from a turn's starting and stopping. */
const HAIR_TURN_R = 55;
/** How far off (view units, at the swap) a shape's bend may be from a plain affine map and still be drawn as one (a
 *  transform, not new points): texture (the hair's strands and shading, eased down at the swap) more, outlines less. */
const AFF_TOL = 0.6, AFF_TOL_DETAIL = 6;
/** How far (view units) a bent path's straight runs may be thinned while it turns. */
const THIN = 0.15;
/** One pair of drawings worked out for the rig: for each shape, how far each point moves (in its own units) between the
 *  drawing and the halfway shape at the swap; the eyes' points (L, R, cu, cl, cc, P, flat) the same way; the shoulders'
 *  points and directions at the swap. */
type MorphPrep = { els: Map<MorphEl, Float64Array>; eyes: Map<Eye, Float64Array>; shoulders: Map<Shoulder, Shoulder>; far: Part[];
  /** shapes whose bend is (to a third of a unit) a plain affine map: that map at the swap (rewriting their points every
   *  frame cost a phone its frame rate: the hair's strands, the shading, the eyes' lines, the mouths) */
  aff: Map<MorphEl, M>;
  /** an arm's upper arm, forearm and hand, each bent as a whole (an affine map on the part, at the swap): the three share
   *  one drawing, so none of its points is rewritten */
  partAff: Map<string, M>; covered: Set<MorphEl>;
  /** a knee's measured edges at the swap, as moves (x y pairs): the thigh's two edge points and a point a unit along
   *  each edge, in the thigh's units; the same of the shin's, and the knee's middle, in the shin's */
  knees: Map<Knee, Float64Array> };
/** A copy of a drawing bent this frame: k towards `other` (1 at their swap), and the pair the other way round the ring
 *  too (prep2), so the bend runs through the drawing on one curve: c1 of the way to the halfway shape with `other`, c2
 *  (never above 0) of the way to the halfway shape with the drawing on its other side. */
type MorphNow = { prep: MorphPrep; k: number; prep2: MorphPrep | null; c1: number; c2: number };
type ViewRec = {
  g: SVGGElement; piv: Record<string, [number, number]>; parts: Part[]; eyes: Eye[];
  mouths: Map<Mouth, SVGGElement>; talk: SVGEllipseElement | null; elbows: Partial<Record<Side, Elbow>>; legs: Record<Side, Leg>;
  shoulders: Shoulder[]; knees: Knee[]; pits: SideArmpit[]; fillets: Fillet[]; wjoints: Partial<Record<Side, WristJoint>>; hands: Partial<Record<Side, Partial<Record<HandShape, SVGGElement>>>>; units: Record<string, Box>;
  /** the hair's strands and shading that slide across the back of his head as he turns past it (emonad.py SLIDE) */
  slides: SVGGElement[];
  /** the whole head's box at rest (the hair, the fringe, the face): the head turns as one piece; and the body's */
  head: Box; body: Box;
  /** the view's head (the hair, the face) in a group of its own over every view's body, so a turn can dissolve one
   *  drawing of the head into the next as a whole (see the constructor); its place in the page's order */
  hb: SVGGElement; order: number;
  /** what a sweep's mask goes on: a group round the view's body and one round its head (see the constructor) */
  gw: SVGGElement; hbw: SVGGElement;
  /** the shapes the turn bends, by part; and whether any is bent now */
  mels: Map<string, MorphEl[]>; mbent: boolean;
  /** the drawing's own order of its pieces, and which are moved behind everything now (see MorphPrep.far) */
  order0: Element[]; farNow: Part[] | null;
};
/** A swap's sweep, for one group: two masks (the drawing on top, soft across the seam; the one under, cut off just past
 *  the seam on the top's side), each a gradient across the page. */
type WipeMask = { grad: SVGLinearGradientElement; stops: SVGStopElement[]; url: string };

// ids are made per rig (two rigs on one page never use each other's clips), tagged per copy of this module as well (two
// bundles, or a hot reload, each count from 1)
let instances = 0;
const MODULE_TAG = Math.random().toString(36).slice(2, 6);

/** The drawing parsed once, and its in-betweens read once: every rig clones the parsed drawing (a parse of the 1.7 MB
 *  file per rig was most of making one). */
let TEMPLATE: Element | null = null;
let MORPH_DATA: MorphData | null = null;
function template(): Element {
  if (!TEMPLATE) {
    const doc = new DOMParser().parseFromString(RAW, 'image/svg+xml');
    TEMPLATE = doc.querySelector('.emonad-root')!;
    const meta = doc.querySelector('.emonad-morph');
    try { MORPH_DATA = meta?.textContent ? JSON.parse(meta.textContent) as MorphData : null; } catch { MORPH_DATA = null; }
  }
  return TEMPLATE;
}
/** A copy of the drawing with its ids made its own (the id, every clip's url(#…) and every href="#…"). */
function cloneDrawing(pre: string): SVGGElement {
  const root = document.importNode(template(), true) as SVGGElement;
  const fix = (el: Element) => {
    const id = el.getAttribute('id');
    if (id && id.startsWith('emonad-')) el.setAttribute('id', pre + id.slice(7));
    const cp = el.getAttribute('clip-path');
    if (cp && cp.includes('#emonad-')) el.setAttribute('clip-path', cp.replace(/#emonad-/g, '#' + pre));
    const mk = el.getAttribute('mask');
    if (mk && mk.includes('#emonad-')) el.setAttribute('mask', mk.replace(/#emonad-/g, '#' + pre));
    for (const a of ['fill', 'stroke']) {
      const pv = el.getAttribute(a);
      if (pv && pv.includes('#emonad-')) el.setAttribute(a, pv.replace(/#emonad-/g, '#' + pre));
    }
    const hr = el.getAttribute('href');
    if (hr && hr.startsWith('#emonad-')) el.setAttribute('href', '#' + pre + hr.slice(8));
    const xh = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (xh && xh.startsWith('#emonad-')) el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pre + xh.slice(8));
  };
  fix(root);
  for (const el of Array.from(root.querySelectorAll('*'))) fix(el);
  return root;
}

/** What the rig tells a host as it happens (in the frame it happens in, so a renderer or a game can act on the same
 *  frame): a move ending (finished, or cut short), a turn arriving (resolved) and settling, a foot coming down. */
export type RigEvent =
  | { type: 'moveEnd'; name: ActionName; finished: boolean }
  | { type: 'turnArrive'; facing: Facing }
  | { type: 'turnEnd'; facing: Facing }
  | { type: 'footDown'; foot: Body; move: ActionName }
  | { type: 'land' };

type Running = { a: Action; name: ActionName; t0: number; w: number; fading: number; done: (finished: boolean) => void; opts: Record<string, unknown>;
  /** the move's own memory for this run (never the caller's opts object: reused, a second walk saw the first's as done) */
  state: Record<string, unknown>;
  promise: Promise<boolean>;
  /** asked to stop, and ending by itself (a walk takes its last step) */
  stopping: boolean;
  /** taking over from a move on its layer: fades in over at least this long (a crossfade, see XFADE) */
  xin?: number;
  /** waiting for these to end before it starts (a move after a walk that is taking its last step) */
  after?: Running[] };

export class EmonadRig {
  /** Put this in your own <svg>. */
  readonly el: SVGGElement;
  /** where the point between his feet is, in the host's units, and how big he is (1: 660 tall) */
  x = 0; y = 0; scale = 1;
  /** time runs this many times as fast (0.25 for slow motion) */
  speed = 1;
  /** set by the host while the pointer is over the page: the pupils follow it (null: his own glances) */
  gaze: { x: number; y: number } | null = null;
  /** the idle's own life (breathing, weight shifts, glances, blinks); off for a still */
  alive = true;
  /** Make the idle repeat exactly every this many seconds (a sprite sheet's idle loop): its waves are tuned to whole
   *  cycles of it, he blinks once a loop at the same moment and makes no glances of his own. null: the idle's own rhythm. */
  idlePeriod: number | null = null;
  /** Now and then, standing idle, he does something of his own: shifts his weight, looks at us, a small sigh, folds his
   *  arms for a few seconds. Never while a move or a turn runs (one that starts takes over from it), nor with idlePeriod
   *  set. false: never (a host that wants him still between its own moves). */
  fidgets = true;
  /** how a turn's swap from one drawing to the next is drawn: over how many of the screen's frames the next one sweeps
   *  in, and how soft its edge is (a share of the head's or body's width; 1 or more is a dissolve). 0 frames: a cut,
   *  the default. (A sweep shows half of one drawing and half of the other for its frames, and where the two halves do
   *  not meet, a gap: the face cut in two with the background between, at the three-quarter to side swap. A cut is
   *  what a drawn turn does: both drawings have the same outline there, and only what is inside it changes.) */
  sweep = { frames: 0, soft: 0.08 };
  /** called when the rig changes facing (for a host's own buttons: the drawing his body is in, which changes halfway
   *  between two drawings while he turns), after every frame, and for every RigEvent (in the frame it happens) */
  onFacing?: (f: Facing) => void;
  onFrame?: () => void;
  onEvent?: (e: RigEvent) => void;

  private _facing: Facing = 'front';
  /** The drawing his body is in (read only: setFacing to put him there at once, turnTo to turn). */
  get facing(): Facing { return this._facing; }
  mood: Mood = 'neutral';
  get view(): View { return FACING_OF[this._facing].view; }
  get mirror(): 1 | -1 { return FACING_OF[this._facing].mirror; }
  /** Whether a turn is under way (true until it has settled, a little after turnTo resolves). */
  get turning(): boolean { return !!this.turn || this.queuedTurns > 0; }
  /** Whether a turn asked for has not arrived yet (turnTo has not resolved). */
  get arriving(): boolean { return this.queuedTurns > 0 || (!!this.turn && !this.turn.resolved); }

  private views = {} as Record<View, ViewRec>;
  private time = 0;
  private raf = 0;
  private last = 0;
  private running: Running[] = [];
  private turn: Turn | null = null;
  private turnChain: Promise<boolean> = Promise.resolve(true);
  /** turns asked for and not started yet; and a count that setFacing, reset and destroy move on, so those drop them */
  private queuedTurns = 0;
  private turnGen = 0;
  /** walkTo's own count: a walkTo overtaken by a newer one does not turn him round at its end */
  private walkGen = 0;
  /** waits on the rig's own clock (wait()), let go in the frame their time comes */
  private timers: { until: number; res: () => void }[] = [];
  /** the screen's frame length in rig seconds, smoothed (how wide a turn's sweep is: a few of these) */
  private fdt = 0;
  /** the body's angle when he is not turning (ANG of his facing) */
  private ang = 0;
  private nextBlink = 1.5;
  /** the fidget under way (which, when it started, how long, when a move or a turn cut it short, which way), and when
   *  the next may start */
  private fid: { kind: number; t0: number; len: number; cut: number; side: number } | null = null;
  private nextFidget = 7;
  private blinkT = -1;
  private glance = { x: 0, y: 0, until: 0, next: 3 };
  private look = { x: 0, y: 0 };
  private lids = { L: 0, R: 0, sq: 0 };
  // the hair's spring (skew in degrees, stretch) and what drives it (the head's place and turn last frame)
  private hair = { k: 0, kv: 0, s: 0, sv: 0 };
  private hairMir = 1;
  private wipes!: Record<'head' | 'body', { top: WipeMask; bot: WipeMask }>;
  private headPrev: { x: number; y: number; vx: number; vy: number; a: number; va: number } | null = null;
  private springs: Record<Body, ArmSpring> = { r: armSpring(), l: armSpring() };
  /** each hand's shape as drawn, by his side (a turn's change of drawing keeps it) */
  private handNow: Record<Body, HandState> = { r: handState(), l: handState() };
  private written = new WeakMap<Element, Record<string, string>>();
  /** each drawing's talking mouth's own width (the talk draws it wider than that, and narrower, as it goes) */
  private talkRx = new WeakMap<Element, number>();
  /** how far off the floor he is this frame (view units, up negative) */
  lifted = 0;
  private last3: { s: Solved; X: M; rx: number; ry: number } | null = null;
  private destroyed = false;
  /** the turn's in-betweens (from the drawing), and each pair of drawings worked out when first needed */
  private morph: MorphData | null = null;
  private mprep = new Map<string, MorphPrep | null>();
  /** the views whose shapes are the shared list's, index for index (always, for a clone: see collectMorph) */
  private melsShared = new Set<View>();

  /** The rig's own dice (blinks, glances): seeded, a render stepped frame by frame comes out the same every time. */
  private rand: () => number = Math.random;

  /**
   * facing: where he starts. autoplay (default true): run on the screen's clock; false, and step(dt) drives him (a
   * renderer, a game loop). seed: blinks and glances from a seeded generator, so a stepped render is the same every time
   * (default: Math.random). morph (default true): the turn's in-betweens; false skips them (a turn then swaps drawings
   * through the sweep alone: cheaper, for a crowd of him on a slow phone).
   */
  constructor(opts: { facing?: Facing; autoplay?: boolean; seed?: number; morph?: boolean } = {}) {
    if (opts.seed !== undefined) {
      // (mulberry32)
      let a = opts.seed >>> 0;
      this.rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    if (opts.facing !== undefined && !(opts.facing in ANG)) throw new Error(`EmonadRig: no facing "${String(opts.facing)}"`);
    const n = ++instances;
    const pre = `emo${MODULE_TAG}${n}-`;
    this.el = cloneDrawing(pre);
    this.el.setAttribute('class', 'emonad');
    for (const g of Array.from(this.el.querySelectorAll<SVGGElement>(':scope > .view'))) this.readView(g);
    // each view's head (everything after its last piece of body: the hair, the face, the eyes, the mouth) moves into a
    // group of its own, all of them over all the bodies. Within a view nothing changes order (the head was last), and a
    // turn can fade one drawing of the head into the next as a whole: a part-by-part fade shows the hair through the face.
    const heads = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    heads.setAttribute('class', 'heads');
    this.el.append(heads);
    for (const rec of Object.values(this.views)) {
      const block = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
      block.setAttribute('class', 'headblock');
      const tail: Element[] = [];
      for (let el = rec.g.lastElementChild; el; el = el.previousElementSibling) {
        if (el.classList.contains('part') && groupOf((el as SVGGElement).dataset.bone as Bone) === 'body') break;
        tail.unshift(el);
      }
      for (const el of tail) block.append(el);
      // (the neck too, first: it only ever lies on the shirt, black on black, so drawing it after the arms changes nothing
      // at rest; faded with the body's drawing it left the face's chin cut square)
      const neck = rec.g.querySelector(':scope > .part[data-part="neck"]');
      if (neck) block.prepend(neck);
      // (and the plain neck under it, which lies inside the neck's own lines, and under everything the face's and the
      // neck's traps: their skin's edges, outlined where nothing covers them; side on, under even those, the head's
      // whole shape in the hair's colour, shown only while the face goes round under the hair: see frame())
      for (const nm of ['neckbase', 'neckTrap', 'faceTrap', 'headUnder']) {
        const el = rec.g.querySelector(`:scope > .part[data-part="${nm}"]`);
        if (el) block.prepend(el);
      }
      heads.append(block);
      rec.hb = block;
    }
    // A sweep's mask goes on a group round the drawing, and the drawing itself is made one layer while it is masked
    // (opacity just under 1): WebKit (every iPhone browser) otherwise masks each piece on its own, and a piece the hair
    // hides showed through the hair, see-through, wherever the mask was part way.
    for (const rec of Object.values(this.views)) {
      const wrap = (g: SVGGElement) => {
        const w = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
        g.parentNode!.insertBefore(w, g); w.append(g);
        return w;
      };
      rec.gw = wrap(rec.g); rec.hbw = wrap(rec.hb);
    }
    // the swaps' sweeps (see frame())
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(NS, 'defs');
    this.el.prepend(defs);
    const mk = (id: string): WipeMask => {
      const grad = document.createElementNS(NS, 'linearGradient') as SVGLinearGradientElement;
      grad.setAttribute('id', `${pre}wg-${id}`); grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('y1', '0'); grad.setAttribute('y2', '0');
      const stops = [0, 1, 2].map(() => { const st = document.createElementNS(NS, 'stop') as SVGStopElement; grad.append(st); return st; });
      const mask = document.createElementNS(NS, 'mask');
      mask.setAttribute('id', `${pre}wm-${id}`); mask.setAttribute('maskUnits', 'userSpaceOnUse');
      for (const [a, v] of [['x', '-4000'], ['y', '-4000'], ['width', '8000'], ['height', '8000']]) mask.setAttribute(a!, v!);
      const rect = document.createElementNS(NS, 'rect');
      for (const [a, v] of [['x', '-4000'], ['y', '-4000'], ['width', '8000'], ['height', '8000']]) rect.setAttribute(a!, v!);
      rect.setAttribute('fill', `url(#${pre}wg-${id})`);
      mask.append(rect);
      defs.append(grad, mask);
      return { grad, stops, url: `url(#${pre}wm-${id})` };
    };
    this.wipes = { head: { top: mk('ht'), bot: mk('hb') }, body: { top: mk('bt'), bot: mk('bb') } };
    // the turn's in-betweens: the maps, and the shapes they bend
    this.morph = opts.morph === false ? null : MORPH_DATA;
    if (this.morph) {
      const named = new Map<View, Set<string>>();
      for (const [k, pm] of Object.entries(this.morph.maps)) {
        const v = k.split('>')[0] as View;
        const s = named.get(v) ?? new Set<string>(); named.set(v, s);
        for (const p of Object.keys(pm.parts)) s.add(p);
      }
      for (const [v, rec] of Object.entries(this.views) as [View, ViewRec][]) rec.mels = this.collectMorph(v, rec, named.get(v) ?? new Set());
    }
    for (const rec of Object.values(this.views)) rec.order0 = Array.from(rec.g.children);
    // every pair of neighbouring drawings worked out in the background, one at a time, so the first turn does not wait
    // for it (10-20 ms a pair on a laptop)
    if (this.morph && typeof window !== 'undefined') {
      const todo: [Facing, Facing][] = [];
      FACINGS.forEach((f, i) => { const g = FACINGS[(i + 1) % FACINGS.length]!; todo.push([f, g], [g, f]); });
      const idle = (cb: () => void) => ((window as unknown as { requestIdleCallback?: (c: () => void) => void }).requestIdleCallback ?? ((c: () => void) => setTimeout(c, 30)))(cb);
      const next = () => { if (this.destroyed) return; const pr = todo.shift(); if (!pr) return; this.prepMorph(pr[0], pr[1]); idle(next); };
      idle(next);
    }
    if (opts.facing) this._facing = opts.facing;
    this.ang = ANG[this._facing];
    this.frame(0);
    if (opts.autoplay !== false) this.start();
  }

  /** Work out every pair of drawings' in-betweens now (they are otherwise worked out in idle moments after the rig is
   *  made, and a turn before then does its pair in its first frame). For a renderer or a game's loading screen. */
  prepare() {
    if (!this.morph) return;
    FACINGS.forEach((f, i) => { const g = FACINGS[(i + 1) % FACINGS.length]!; this.prepMorph(f, g); this.prepMorph(g, f); });
  }

  private readView(g: SVGGElement) {
    const v = g.dataset.view as View;
    const piv = JSON.parse(g.dataset.pivots!) as Record<string, [number, number]>;
    const parts: Part[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part'))) {
      const bone = el.dataset.bone as Bone, name = el.dataset.part ?? '';
      parts.push({ el, bone, name, group: groupOf(bone), unit: unitOf(v, name) });
    }
    // each piece's box at rest, the union of its parts' (the arm's three pieces share one drawing)
    const units: Record<string, Box> = {};
    const raw = JSON.parse(g.dataset.boxes ?? '{}') as Record<string, [number, number, number, number]>;
    const acc: Record<string, [number, number, number, number]> = {};
    for (const [name, bx] of Object.entries(raw)) {
      const u = unitOf(v, name); if (!u) continue;
      const q = acc[u]; acc[u] = q ? [Math.min(q[0], bx[0]), Math.min(q[1], bx[1]), Math.max(q[2], bx[2]), Math.max(q[3], bx[3])] : [...bx];
    }
    for (const [u, q] of Object.entries(acc)) units[u] = { cx: (q[0] + q[2]) / 2, cy: (q[1] + q[3]) / 2, w: Math.max(1, q[2] - q[0]) };
    // a limb is placed by its joints, not its box: the toe of a shoe or a hand held out skews the box, and two drawings
    // matched by their boxes put their knees and ankles up to 30 units apart at the swap (a third leg for a few frames).
    // Its middle is the middle of its three joints, its width the leg's or arm's own (without the shoe or the sleeve),
    // and its height stays the box's (the soles stay on the floor).
    for (const s of ['L', 'R'] as const) {
      for (const [bones, own] of [[['thigh', 'shin', 'foot'], ['thigh', 'shin']], [['arm', 'fore', 'hand'], ['arm']]] as const) {
        const u = unitOf(v, `${bones[0]}${s}`), box = u ? units[u] : null;
        const js = bones.map((b) => piv[`${b}${s}`]);
        if (!u || !box || js.some((j) => !j)) continue;
        const qs = own.map((n) => raw[`${n}${s}`]).filter((q): q is [number, number, number, number] => !!q);
        const w = qs.length ? Math.max(...qs.map((q) => q[2])) - Math.min(...qs.map((q) => q[0])) : box.w;
        units[u] = { cx: js.reduce((a, j) => a + j![0], 0) / js.length, cy: box.cy, w: Math.max(1, w) };
      }
    }
    let hq: [number, number, number, number] | null = null;
    for (const u of ['hair', 'fringe', 'face']) {
      const q = acc[u]; if (!q) continue;
      hq = hq ? [Math.min(hq[0], q[0]), Math.min(hq[1], q[1]), Math.max(hq[2], q[2]), Math.max(hq[3], q[3])] : [...q];
    }
    const head: Box = hq ? { cx: (hq[0] + hq[2]) / 2, cy: (hq[1] + hq[3]) / 2, w: hq[2] - hq[0] } : { cx: 0, cy: -500, w: 150 };
    let bq: [number, number, number, number] | null = null;
    for (const [u, q] of Object.entries(acc)) {
      if (!(u === 'torso' || u.startsWith('arm_') || u.startsWith('leg_'))) continue;
      bq = bq ? [Math.min(bq[0], q[0]), Math.min(bq[1], q[1]), Math.max(bq[2], q[2]), Math.max(bq[3], q[3])] : [...q];
    }
    const body: Box = bq ? { cx: (bq[0] + bq[2]) / 2, cy: (bq[1] + bq[3]) / 2, w: bq[2] - bq[0] } : { cx: 0, cy: -250, w: 200 };
    const eyes: Eye[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .eye'))) {
      const geo = JSON.parse(el.dataset.geom!);
      eyes.push({
        el, open: el.querySelector('.eye-open')!, closed: el.querySelector('.eye-closed')!, fold: el.querySelector('.eye-fold'), white: el.querySelector('.eye-white')!,
        clip: el.querySelector('.eye-clip')!, lid: el.querySelector('.lid')!, lower: el.querySelector('.lower')!, pupil: el.querySelector('.pupil')!,
        L: geo.L, R: geo.R, cu: geo.cu, cl: geo.cl, cc: geo.cc, P: geo.P, side: el.dataset.part === 'eyeL' ? 'L' : 'R',
      });
    }
    const mouths = new Map<Mouth, SVGGElement>();
    for (const el of Array.from(g.querySelectorAll<SVGGElement>('.mouth-shape'))) mouths.set(el.dataset.mouth as Mouth, el);
    const elbows: Partial<Record<Side, Elbow>> = {};
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part[data-elbow]'))) {
      const side = el.dataset.part!.slice(-1) as Side;
      const e = JSON.parse(el.dataset.elbow!);
      const up = g.querySelector<SVGGElement>(`:scope > .part[data-part="arm${side}"]`)!;
      elbows[side] = { lo: el.querySelector('.cut')!, up: up.querySelector('.cut')!, E: [e.x, e.y], u: e.u, W: e.w };
    }
    const shoulders: Shoulder[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part.shoulder'))) {
      const d = JSON.parse(el.dataset.shoulder!);
      shoulders.push({ path: el.querySelector('path')!, side: el.dataset.part!.slice(-1) as Side, N: d.N, tN: d.tN, T: d.T, tT: d.tT, I: d.I, tI: d.tI, A: d.A, tA: d.tA, a: d.a, b: d.b });
    }
    const knees: Knee[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part[data-knee]'))) {
      const d = JSON.parse(el.dataset.knee!);
      const side = el.dataset.part!.slice(-1) as Side;
      knees.push({ path: el.querySelector<SVGPathElement>(':scope > path.knee')!, side, K: piv['shin' + side]!, t: d.t, s: d.s });
    }
    const pits: SideArmpit[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part.armpit'))) {
      const d = JSON.parse(el.dataset.armpit!);
      pits.push({ path: el.querySelector('path')!, side: el.dataset.part!.slice(-1) as Side, u: d.u, c: d.c });
    }
    const fillets: Fillet[] = [];
    for (const el of Array.from(g.querySelectorAll<SVGGElement>(':scope > .part.fillet'))) {
      const d = JSON.parse(el.dataset.fillet!) as { c: number[][]; subs: { s: number[][]; free: 1 | -1; inS: 1 | -1; inC: 1 | -1; a: number; b: number }[] };
      const paths = Array.from(el.querySelectorAll('path'));
      const c = Float64Array.from(d.c.flat());
      fillets.push({ side: el.dataset.part!.slice(-1) as Side, c, cum: polyCum(c),
        subs: d.subs.map((s, i) => ({ s: Float64Array.from(s.s.flat()), free: s.free, inS: s.inS, inC: s.inC, a: s.a, b: s.b, path: paths[i]! })) });
    }
    const wjoints: ViewRec['wjoints'] = {};
    for (const s of ['L', 'R'] as const) {
      const h = g.querySelector<SVGGElement>(`:scope > .part[data-part="hand${s}"][data-wjoint]`);
      const fo = g.querySelector<SVGGElement>(`:scope > .part[data-part="fore${s}"]`);
      const skin = h?.querySelector<SVGPathElement>(':scope > path.wj-skin'), ink = h?.querySelector<SVGPathElement>(':scope > path.wj-ink');
      const clip = fo?.querySelector<SVGPathElement>('path.wj-clip'), line = fo?.querySelector<SVGPathElement>(':scope > path.wj-line');
      if (!h || !skin || !ink || !clip || !line) continue;
      const d = JSON.parse(h.dataset.wjoint!) as { c: [number, number]; u: [number, number]; wcut: number[][]; wh: number; wo: number; wi: number };
      wjoints[s] = { c: d.c, u: d.u, wcut: Float64Array.from(d.wcut.flat()), wh: d.wh, wo: d.wo, wi: d.wi, skin, ink, clip, line };
    }
    const hands: ViewRec['hands'] = {};
    for (const s of ['L', 'R'] as const) {
      const h = g.querySelector<SVGGElement>(`:scope > .part[data-part="hand${s}"]`);
      if (!h) continue;
      const set: Partial<Record<HandShape, SVGGElement>> = {};
      for (const k of SHAPES) { const el = h.querySelector<SVGGElement>(`:scope > .hand-${k}`); if (el) set[k] = el; }
      if (set.rest) hands[s] = set;
    }
    const leg = (s: Side): Leg => {
      const H = piv['thigh' + s]!, K = piv['shin' + s]!, A = piv['foot' + s]!;
      return { H, K, A, L1: Math.hypot(K[0] - H[0], K[1] - H[1]), L2: Math.hypot(A[0] - K[0], A[1] - K[1]) };
    };
    this.views[v] = { g, piv, parts, eyes, mouths, talk: g.querySelector('.talk'), elbows, legs: { L: leg('L'), R: leg('R') }, shoulders, knees, pits, fillets, wjoints, hands, units, head, body,
      slides: Array.from(g.querySelectorAll<SVGGElement>('g.slide')),
      hb: g, order: Object.keys(this.views).length, gw: g, hbw: g, mels: new Map(), mbent: false, order0: [], farNow: null };
  }

  // ---------------------------------------------------------------- the clock
  start() {
    if (this.raf || this.destroyed) return;
    this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt * this.speed);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  /** Take him off the page for good: every move, turn and wait still pending settles (false: cut short). */
  destroy() {
    if (this.destroyed) return;
    this.stop(); this.destroyed = true;
    this.hardStop();
    this.el.remove();
  }
  /** Advance by dt seconds of his own time by hand (a renderer stepping frames itself, a game loop; stop() first, or make
   *  him with autoplay: false). `speed` is not applied (it is the screen clock's). A negative or broken dt counts as 0. */
  step(dt: number) { if (this.destroyed) return; this.frame(dt >= 0 && dt < 1e6 ? dt : 0); }
  get now() { return this.time; }

  /** Everything stopped at once, nothing eased (every pending promise settles, false). */
  private hardStop() {
    for (const r of this.running) { r.done(false); this.emit({ type: 'moveEnd', name: r.name, finished: false }); }
    this.running = [];
    this.turnGen++; this.walkGen++;
    if (this.turn) { const tr = this.turn; this.turn = null; if (!tr.resolved) { tr.resolved = true; tr.done(false); } }
    this.ang = ANG[this._facing];
    for (const tm of this.timers.splice(0)) tm.res();
    this.walkArrived(false);
  }
  /** Back to standing still where he is, at once: every move and turn stopped (promises settle, false), the springs
   *  (arms, hair) at rest, the face's clock reset. For a renderer between takes, or a game putting him somewhere new. */
  reset() {
    if (this.destroyed) return;
    this.hardStop();
    this.resetSprings();
    this.handNow = { r: handState(), l: handState() };
    this.blinkT = -1; this.nextBlink = this.time + 1.5;
    this.fid = null; this.nextFidget = this.time + 7;
    this.glance = { x: 0, y: 0, until: 0, next: this.time + 3 };
    this.look = { x: 0, y: 0 }; this.lids = { L: 0, R: 0, sq: 0 };
    this.frame(0);
  }
  /** The arms' follow-through and the hair at rest, now (after moving him far in one go: x, y or scale). */
  resetSprings() {
    this.headPrev = null;
    this.hair = { k: 0, kv: 0, s: 0, sv: 0 };
    this.springs = { r: armSpring(), l: armSpring() };
  }
  private emit(e: RigEvent) { try { this.onEvent?.(e); } catch (err) { console.error(err); } }

  // ---------------------------------------------------------------- what the host asks for
  /** Put him in a facing at once (no turn). Any turn under way or asked for is dropped (settles, false), and a walk stops
   *  where it is (its steps cannot go on from another drawing). */
  setFacing(f: Facing) {
    if (!(f in ANG)) throw new Error(`EmonadRig: no facing "${String(f)}"`);
    if (this.destroyed) return;
    this.turnGen++;
    if (this.turn) { const tr = this.turn; this.turn = null; if (!tr.resolved) { tr.resolved = true; tr.done(false); } }
    for (const r of this.running) if (r.name === 'walk' && !r.fading) r.fading = this.time;
    this.ang = ANG[f];
    if (f === this._facing) return;
    this._facing = f;
    this.headPrev = null;
    this.springs = { r: armSpring(), l: armSpring() };
    this.onFacing?.(f);
  }
  /** Turn to a facing the short way round, in one continuous motion: the angle eases from where he faces to where he is
   *  going (the head a spring a little ahead of the body), every part of him travels from where it sits in one drawing
   *  to where it sits in the next, each drawing bent towards the halfway shape of the next, and each gives way to the
   *  next halfway between them. His eyes lead and are shut through the swaps, he dips a little, his arms swing out, his
   *  feet step, and he settles with a small overshoot. Resolves (true) once he is round (the settle carries on under
   *  what comes next; RigEvent 'turnEnd' when it is over), false if it was dropped (setFacing, reset, destroy).
   *  Turns asked for while one is under way follow it in order; asked for during a walk, the walk first takes its last
   *  step. Starts in the same moment when nothing is in the way (a renderer stepping frames gets it on the next step).
   *  `pace` 2 is twice as quick; a number is the old step length in ms (95 is pace 1). */
  turnTo(f: Facing, opts: number | { pace?: number } = {}): Promise<boolean> {
    if (!(f in ANG)) throw new Error(`EmonadRig: no facing "${String(f)}"`);
    if (this.destroyed) return Promise.resolve(false);
    const pace = typeof opts === 'number' ? clamp(95 / Math.max(20, opts), 0.4, 3) : clamp(opts.pace ?? 1, 0.25, 4);
    return this.queueTurn(() => this.startTurn(f, pace));
  }
  /** Turn all the way round (`turns` times, 1 by default; a fraction more to end on `to`, which is where he faces now
   *  unless told), in one continuous motion: he gets going, goes round at an even pace (every pair of drawings taking
   *  the same time) and slows to a stop with a small overshoot, his head a little ahead of his body, stepping round as he
   *  goes. `dir` 1 turns him to his left (from the front his face goes round to our right first, as the turnaround
   *  sheet's order: three-quarter, side, back), -1 to his right. `pace` 2 is twice as quick (once round at pace 1 is
   *  about 1.6 s at full speed, 2 s in all). Resolves as turnTo. */
  spin(opts: { turns?: number; dir?: 1 | -1; pace?: number; to?: Facing } = {}): Promise<boolean> {
    if (opts.to !== undefined && !(opts.to in ANG)) throw new Error(`EmonadRig: no facing "${String(opts.to)}"`);
    if (this.destroyed) return Promise.resolve(false);
    const turns = Math.max(0, Math.floor(Number.isFinite(opts.turns) ? opts.turns! : 1));
    const dir: 1 | -1 = opts.dir === -1 ? -1 : 1, pace = clamp(opts.pace ?? 1, 0.25, 4);
    return this.queueTurn(() => this.startTurn(opts.to ?? (this.turn?.f ?? this._facing), pace, { turns, dir }));
  }
  /** A turn started now if nothing is in the way, else after the turns before it (and a walk's last step). */
  private queueTurn(start: () => Promise<boolean>): Promise<boolean> {
    for (const r of [...this.running]) if (r.name === 'walk' && r.after) this.drop(r);
    const walk = this.running.find((r) => r.name === 'walk' && !r.fading);
    if (!walk && this.queuedTurns === 0 && (!this.turn || this.turn.resolved)) return (this.turnChain = start());
    if (walk) this.stopRun(walk);
    const gen = this.turnGen;
    this.queuedTurns++;
    const go = () => { this.queuedTurns = Math.max(0, this.queuedTurns - 1); return gen !== this.turnGen || this.destroyed ? Promise.resolve(false) : start(); };
    const before: Promise<unknown> = walk ? Promise.all([this.turnChain, walk.promise]) : this.turnChain;
    return (this.turnChain = before.then(go, go));
  }
  /** A turn the walk asks for itself (to face where it is going): not held up by the walk. */
  turnForWalk(f: Facing): Promise<boolean> {
    if (this.queuedTurns === 0 && (!this.turn || this.turn.resolved)) return (this.turnChain = this.startTurn(f, 1));
    return this.turnChain;
  }
  private startTurn(f: Facing, pace: number, spin?: { turns: number; dir: 1 | -1 }): Promise<boolean> {
    return new Promise<boolean>((done) => {
      if (this.destroyed) { done(false); return; }
      const prev = this.turn;
      if (prev && !prev.resolved) { prev.resolved = true; prev.done(true); }
      const from = prev ? prev.f : this._facing;
      const ring = FACINGS.length;
      const d = (FACINGS.indexOf(f) - FACINGS.indexOf(from) + ring) % ring;
      const base = prev ? prev.a1 : this.ang;
      const gap = ((ANG[f] - ANG[from]) % 360 + 360) % 360;
      let dir: 1 | -1, a1: number;
      if (spin) {
        if (d === 0 && spin.turns === 0) { done(true); return; }
        dir = spin.dir;
        a1 = base + dir * ((dir > 0 ? gap : (360 - gap) % 360) + 360 * spin.turns);
      } else {
        if (d === 0) { done(true); return; }
        // the short way round by angle (the drawings are not evenly spaced: counted in drawings, three-quarter right to
        // the left profile went 225 degrees round by the back and its reverse 135 by the front); a half turn goes the way
        // the ring of drawings says
        dir = gap === 180 ? (d <= ring / 2 ? 1 : -1) : gap < 180 ? 1 : -1;
        a1 = dir > 0 ? base + gap : base - (360 - gap);
      }
      const p0 = phiOfAng(base), p1 = phiOfAng(a1), span = Math.abs(p1 - p0);
      // a blink over each swap between three-quarters and the side, where the eye changes from a three-quarter almond to
      // a profile in one frame: quick, as a blink is (in a spin about a tenth of a second). The eyes are open through
      // the rest of a turn: the swap from the front to three-quarters bends the eyes from one drawing's into the
      // other's, and shut from a little before it to a little after the next swap, as they were, he went round with his
      // eyes closed for half the turn, asleep, the shut eye reading as a white almond with a line through it
      const faces = [67.5, 292.5].map(phiOfAng);
      const xs: number[] = [];
      for (let k = Math.floor(Math.min(p0, p1) / 360) - 1; k <= Math.ceil(Math.max(p0, p1) / 360) + 1; k++) {
        for (const b of faces) { const x = (b + 360 * k - p0) * dir; if (x > 0 && x < span) xs.push(x); }
      }
      xs.sort((a, b) => a - b);
      const lids: [number, number][] = xs.map((x) => [x - 8, x + 11]);
      // (a turn: a little longer than a snap, so more of its in-between shapes reach the screen; a spin: up to its even
      // pace, round, and down from it)
      let Tr = (0.18 + 0.002 * span) / pace, e = 0;
      const vc = SPIN.speed * pace, te = SPIN.ease / pace;
      if (spin && span > vc * te * 1.2) { Tr = te + span / vc; e = te / Tr; }
      this.turn = {
        f, dir, a0: base, a1, p0, p1, t0: this.time, Tr, e,
        head: prev ? { ...prev.head } : { th: p0, v: 0 }, body: prev ? { ...prev.body } : { th: p0, v: 0 },
        lids, resolved: false, done,
      };
    });
  }
  setMood(m: Mood) { if (m in MOOD_FACE) this.mood = m; }
  blink() { this.blinkT = 0; }

  /** Play a move. Resolves when it ends: true if it ran its course (or ended itself), false if it was cut short (another
   *  move on its layer took over, stop/stopAll, reset, destroy). A move started while another on its layer runs takes
   *  over (the other fades out; a walk first takes its last step, and the new move starts when it has). The same move
   *  again, where it can take new orders (a walk to somewhere else), takes them and gives back the same promise. */
  play(name: ActionName, opts: Record<string, unknown> = {}): Promise<boolean> {
    const a: Action | undefined = (ACTIONS as Record<string, Action>)[name];
    if (!a) return Promise.reject(new Error(`EmonadRig: no move "${String(name)}"`));
    if (this.destroyed) return Promise.resolve(false);
    const same = this.running.find((r) => r.name === name && !r.fading && !r.after);
    if (same && a.retarget?.(same.state, opts, this)) { same.stopping = false; return same.promise; }
    const layer = a.layer ?? 'body';
    const after: Running[] = [];
    let took = false;
    for (const r of this.running) {
      if (r.fading || (r.a.layer ?? 'body') !== layer) continue;
      if (r.after) { this.drop(r); continue; }
      if (this.stopRun(r)) after.push(r);
      else if (r.w > 0.05 && layer !== 'move') took = true;
    }
    // (a fidget under way is cut short and crossfaded into the move, as a move on the layer would be)
    if (this.fid && !this.fid.cut && layer !== 'face') { this.fid.cut = this.time; if (this.fidW > 0.05) took = true; }
    let done!: (finished: boolean) => void;
    const promise = new Promise<boolean>((res) => { done = res; });
    this.running.push({ a, name, t0: this.time, w: 0, fading: 0, done, opts, state: {}, promise, stopping: false, after: after.length ? after : undefined,
      xin: took ? XFADE : undefined });
    return promise;
  }
  /** Ask a running move to stop: true if it ends by itself (a walk's last step), else it fades out now. */
  private stopRun(r: Running): boolean {
    if (r.fading) return false;
    if (r.after) { this.drop(r); return false; }
    if (r.stopping) return true;
    if (r.a.stop?.(r.state, this)) { r.stopping = true; return true; }
    r.fading = this.time;
    return false;
  }
  /** A move that never started, taken off the list. */
  private drop(r: Running) {
    const i = this.running.indexOf(r);
    if (i >= 0) this.running.splice(i, 1);
    r.done(false); this.emit({ type: 'moveEnd', name: r.name, finished: false });
  }
  /** Stop every move (each fades out; a walk takes its last step and stops with his feet together). `now`: everything
   *  fades out at once, the walk too. */
  stopAll(opts: { now?: boolean } = {}) {
    for (const r of [...this.running]) {
      if (r.after) { this.drop(r); continue; }
      if (opts.now) { if (!r.fading) r.fading = this.time; } else this.stopRun(r);
    }
  }
  /** Stop one move by name (as stopAll). */
  stopMove(name: ActionName, opts: { now?: boolean } = {}) {
    for (const r of [...this.running]) {
      if (r.name !== name) continue;
      if (r.after) { this.drop(r); continue; }
      if (opts.now) { if (!r.fading) r.fading = this.time; } else this.stopRun(r);
    }
  }
  isPlaying(name?: ActionName) { return this.running.some((r) => !r.fading && !r.after && (!name || r.name === name)); }
  /** @internal How far in a move that plants the feet is (a jump: a walk under it holds still). */
  plantedWeight() { let w = 0; for (const r of this.running) if (r.a.plants && !r.after) w = Math.max(w, r.w); return clamp(w, 0, 1); }
  private arrivals: ((ok: boolean) => void)[] = [];
  /** @internal The walk has stood with its feet together (arrived, or stopped short): a walkTo turns him from here. */
  walkArrived(ok: boolean) { const a = this.arrivals; this.arrivals = []; for (const f of a) f(ok); }

  /** Walk to x (host units) along the floor: turned to the side he is going, steps, then stands with his feet together
   *  (and, unless told, turns to `face`: the front; null keeps the side). Called again while he walks, he goes on to the
   *  new place (turning round first if it is behind him), and only the newest call turns him at the end. */
  async walkTo(x: number, opts: { face?: Facing | null; pace?: number } = {}): Promise<boolean> {
    if (!Number.isFinite(x)) throw new Error('EmonadRig: walkTo needs a number');
    if (opts.face != null && !(opts.face in ANG)) throw new Error(`EmonadRig: no facing "${String(opts.face)}"`);
    if (this.destroyed) return false;
    const gen = ++this.walkGen;
    let ok = true;
    if (this.isPlaying('walk') || Math.abs(x - this.x) >= 2) {
      // (on as soon as his feet are together: the walk's posture eases out under the turn)
      const arrived = new Promise<boolean>((res) => this.arrivals.push(res));
      ok = await Promise.race([this.play('walk', { to: x, pace: opts.pace ?? 1 }), arrived]);
    }
    if (gen !== this.walkGen || this.destroyed) return false;
    if (opts.face !== null) ok = (await this.turnTo(opts.face ?? 'front')) && ok;
    return ok;
  }

  /** Talk for a while: the mouth opens and shuts on made-up syllables. */
  say(seconds = 2) { return this.play('talk', { len: seconds }); }

  /** Where each bone's pivot is right now, in the host's units (for a bones overlay). */
  bonesNow(): { bone: Bone; x: number; y: number; parent: Bone | null }[] {
    const L = this.last3; if (!L) return [];
    const { s: sv, X, rx, ry } = L, k = this.scale;
    return BONES.filter((b) => sv.rec.piv[b]).map((b) => {
      const p = sv.rec.piv[b]!; const [x, y] = at(mul(X, sv.M[b]), p[0], p[1]);
      return { bone: b, x: rx + x * k, y: ry + y * k, parent: PARENT[b] };
    });
  }
  /** Where his head is (the top of the neck), in the host's units. */
  headAt(): { x: number; y: number } {
    const b = this.bonesNow().find((p) => p.bone === 'head');
    return b ? { x: b.x, y: b.y } : { x: this.x, y: this.y - 450 * this.scale };
  }

  /** Resolves after `seconds` of his own time (stepped by hand, on the steps; let go by reset and destroy too). */
  wait(seconds: number): Promise<void> {
    if (this.destroyed || !(seconds > 0)) return Promise.resolve();
    return new Promise<void>((res) => { this.timers.push({ until: this.time + seconds - 1e-9, res }); });
  }

  // ---------------------------------------------------------------- the frame
  /** A view's numbers, for moves that work out geometry (pivots, leg lengths). */
  geometry(v: View = this.view) { const r = this.views[v]; return { piv: r.piv, legs: r.legs, rest: REST[v] ?? {} }; }

  /** The turn's springs, a step on: each group's angle, and the body's extras (a dip and the arms swinging out while he
   *  turns fast, a little step of each foot, the eyes leading, the lids shut over the swaps). */
  private turnStep(dt: number) {
    const tr = this.turn;
    const out = { head: this.ang, body: this.ang, vHead: 0, vBody: 0, aHead: 0, dip: 0, arms: 0, look: 0, lid: 0, lift: { r: 0, l: 0 } as Record<Body, number> };
    if (!tr) return out;
    const t = this.time;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    const v0 = tr.head.v;
    for (const g of ['head', 'body'] as const) {
      const S = SPRING[g], st = tr[g];
      for (let i = 0; i < n; i++) {
        const tt = t - dt + (i + 1) * h;
        const targ = tr.p0 + (tr.p1 - tr.p0) * turnProgress(tr, (tt - tr.t0 - S.delay) / tr.Tr);
        st.v += (S.w * S.w * (targ - st.th) - 2 * S.z * S.w * st.v) * h;
        st.th += st.v * h;
      }
    }
    out.aHead = dt > 0 ? (tr.head.v - v0) / dt : 0;
    if (!tr.resolved && Math.abs(tr.p1 - tr.body.th) < 5 && t - tr.t0 > tr.Tr) { tr.resolved = true; tr.done(true); this.emit({ type: 'turnArrive', facing: tr.f }); }
    if (t - tr.t0 > tr.Tr + 0.15 && Math.abs(tr.p1 - tr.head.th) < 0.05 && Math.abs(tr.p1 - tr.body.th) < 0.05 && Math.abs(tr.head.v) < 1 && Math.abs(tr.body.v) < 1) {
      // settled: round again to the drawing itself (close enough that the last step never shows: within a quarter of a
      // unit of phase it was a visible half-pixel snap)
      this.turn = null; this.ang = ANG[tr.f];
      if (!tr.resolved) { tr.resolved = true; tr.done(true); this.emit({ type: 'turnArrive', facing: tr.f }); }
      this.emit({ type: 'turnEnd', facing: tr.f });
      out.head = out.body = this.ang; out.aHead = 0;
      return out;
    }
    // (the springs run on the phase; the drawings are shown by angle)
    out.head = angOfPhi(tr.head.th, 'head'); out.body = angOfPhi(tr.body.th, 'body');
    out.vHead = tr.head.v * angSlope(tr.head.th, 'head'); out.vBody = tr.body.v * angSlope(tr.body.th, 'body');
    const span = tr.p1 - tr.p0;
    const pB = clamp((tr.body.th - tr.p0) / span, 0, 1), pH = clamp((tr.head.th - tr.p0) / span, 0, 1);
    const sp = clamp(Math.abs(tr.body.v) / 700, 0, 1);
    out.dip = 2.6 * sp;
    // (the arms swing out from his sides: seen from the front, the back and three-quarters, out to the sides; side on the
    // swing is towards us and does not show, and the side view's own "out" is forwards, so it fades out before the swaps
    // to and from the side view: left on, the two drawings swung their arms two ways and the hands met in two places)
    const facing = Math.abs(Math.cos(out.body * D2R));
    out.arms = 6 * sp * smooth01(0.383, 0.75, facing);
    // his feet step as he goes round, the first on the side he turns towards: one for a short turn, one each for a half
    // turn, and once round about four, a step each pair of drawings and a half
    // (turning to his left, his left foot first: by his side, so the step stays on the same foot when the drawing changes)
    const first: Body = tr.dir > 0 ? 'l' : 'r', second: Body = first === 'l' ? 'r' : 'l';
    // (a squared sine: the foot leaves the ground and comes back to it with no kick)
    const win = (p: number, a: number, b: number) => (p > a && p < b ? Math.sin(Math.PI * (p - a) / (b - a)) ** 2 : 0);
    const steps = Math.abs(span) < 90 ? 1 : Math.max(2, Math.round(Math.abs(span) / 90));
    if (steps === 1) out.lift[first] = 4.5 * win(pB, 0.06, 0.92);
    else {
      const gapS = 0.96 / steps, wS = gapS * 1.25, amp = steps > 2 ? 4.5 : 5.5;
      for (let i = 0; i < steps; i++) {
        const c = 0.02 + gapS * (i + 0.5), foot = i % 2 === 0 ? first : second;
        out.lift[foot] = Math.max(out.lift[foot], amp * win(pB, c - wS / 2, c + wS / 2));
      }
    }
    // the eyes go first, the way his face is going on the page
    const way = Math.sign(Math.cos(out.head * D2R) * tr.dir) || 0;
    out.look = 0.9 * way * smooth01(0, 0.06, t - tr.t0) * (1 - smooth01(0.3, 0.85, pH));
    // shut over the swaps with his face in view (see startTurn)
    const x = (tr.head.th - tr.p0) * tr.dir;
    for (const [a, b] of tr.lids) out.lid = Math.max(out.lid, smooth01(a, a + 5, x) * (1 - smooth01(b - 8, b, x)));
    return out;
  }

  /** How each piece of him is carried at an angle: from where it sits in the drawing shown towards where it sits in the
   *  other drawing of the pair, so the two meet at the swap halfway between them (its middle and width going straight
   *  from the one to the other). A piece the other drawing has not got (the far eye round the back, the face from the
   *  side to the back) shrinks and slides the way his face is going, behind what is in front of it. As matrices on the
   *  page, by the piece's name in the drawing shown. */
  private tweens(at: Between): Record<string, M> {
    const fn = FACING_OF[at.near], fo = FACING_OF[at.other];
    const rn = this.views[fn.view], ro = this.views[fo.view];
    const flip = (b: Box, m: number): Box => (m > 0 ? b : { cx: -b.cx, cy: b.cy, w: b.w });
    const sgn = Math.sign(Math.cos(at.m * D2R)) || 1;
    const out: Record<string, M> = {};
    if (at.k <= 0) return out;
    const other = (u: string) => { const canon = fn.mirror > 0 ? u : swapLR(u); const ob = ro.units[fo.mirror > 0 ? canon : swapLR(canon)]; return ob ? flip(ob, fo.mirror) : null; };
    // (the pieces the drawings either side of the pair have too: see carry)
    const { i, t } = segOf(at), R = FACINGS.length;
    const ring = [FACINGS[(i + R - 1) % R]!, FACINGS[i]!, FACINGS[(i + 1) % R]!, FACINGS[(i + 2) % R]!];
    const boxIn = (f: Facing, canon: string): Box | null => { const fc = FACING_OF[f], b = this.views[fc.view].units[fc.mirror > 0 ? canon : swapLR(canon)]; return b ? flip(b, fc.mirror) : null; };
    for (const [u, b0] of Object.entries(rn.units)) {
      const A = flip(b0, fn.mirror);
      const B = other(u);
      let C: Box;
      if (B) {
        const canon = fn.mirror > 0 ? u : swapLR(u);
        const q = ring.map((f) => boxIn(f, canon));
        const c3 = (k: 'cx' | 'cy' | 'w') => carry(q[0]?.[k] ?? null, q[1]![k], q[2]![k], q[3]?.[k] ?? null, t);
        C = { cx: c3('cx'), cy: c3('cy'), w: Math.max(1, c3('w')) };
      } else {
        let mid: Box;
        if (u === 'fringe' && rn.units.hair && other('hair')) {
          // the fringe is part of the side and back views' one hair: it travels with the hair
          const HA = flip(rn.units.hair, fn.mirror), HM = lerpBox(HA, other('hair')!, 0.5), sc = HM.w / HA.w;
          mid = { cx: HM.cx + (A.cx - HA.cx) * sc, cy: A.cy + HM.cy - HA.cy, w: A.w * sc };
        } else mid = { cx: A.cx + (at.low ? 1 : -1) * sgn * 0.35 * A.w, cy: A.cy, w: A.w * 0.25 };
        C = lerpBox(A, mid, at.k);
      }
      const sc = C.w / A.w;
      out[u] = [sc, 0, 0, 1, C.cx - sc * A.cx, C.cy - A.cy];
    }
    return out;
  }
  /** The head's carry (its middle from the neck's pivot, and its width), and the neck's place over the shirt's middle,
   *  at a Between: each through the drawings as carry() does, so the two drawings of a pair meet at the swap. */
  private headCarry(at: Between): { dx: number; dy: number; w: number } {
    const { i, t } = segOf(at), R = FACINGS.length;
    const q = [FACINGS[(i + R - 1) % R]!, FACINGS[i]!, FACINGS[(i + 1) % R]!, FACINGS[(i + 2) % R]!].map((f) => {
      const fc = FACING_OF[f], r = this.views[fc.view], nk = r.piv.neck!;
      return { dx: fc.mirror * (r.head.cx - nk[0]), dy: r.head.cy - nk[1], w: r.head.w };
    });
    const c3 = (k: 'dx' | 'dy' | 'w') => carry(q[0]![k], q[1]![k], q[2]![k], q[3]![k], t);
    return { dx: c3('dx'), dy: c3('dy'), w: c3('w') };
  }
  private neckCarry(at: Between): [number, number] {
    const { i, t } = segOf(at), R = FACINGS.length;
    const q = [FACINGS[(i + R - 1) % R]!, FACINGS[i]!, FACINGS[(i + 1) % R]!, FACINGS[(i + 2) % R]!].map((f) => {
      const fc = FACING_OF[f], r = this.views[fc.view], pn = r.piv.neck!, tn = r.units.torso;
      return tn ? [fc.mirror * (pn[0] - tn.cx), pn[1] - tn.cy] : [0, 0];
    });
    return [carry(q[0]![0]!, q[1]![0]!, q[2]![0]!, q[3]![0]!, t), carry(q[0]![1]!, q[1]![1]!, q[2]![1]!, q[3]![1]!, t)];
  }

  // ---------------------------------------------------------------- the in-betweens (morph.ts)
  /** The shapes of a view the turn bends, by part: every path and circle of the parts the maps name (and the drawings
   *  they use), but not what the rig draws itself every frame (the eyes' lids and whites, the knees, the elbows' cuts,
   *  the shoulders and the armpit) nor a clip's box (the hair's cut at the chin is a line across the page). */
  private collectMorph(v: View, rec: ViewRec, names: Set<string>): Map<string, MorphEl[]> {
    const out = new Map<string, MorphEl[]>();
    const seen = new Set<Element>();
    const skip = /\b(eye-white|eye-clip|lid|lower|pupil|knee|cut)\b/;
    // (the numbers are worked out by the first rig and shared: every rig's drawing is a clone, walked in the same order)
    let shared = SHARED_MELS.get(v) ?? null;
    const fresh: SharedMel[] | null = shared ? null : [];
    let idx = 0;
    let list: MorphEl[] = [];
    // (a shape is taken from the shared list when the entry there is this very shape, by its tag and its own numbers as
    // written; anything else is worked out here, and sharing stops for this rig: a clone never differs, but be safe)
    const add = (el: Element, same: (sh: SharedMel) => boolean, make: () => Omit<SharedMel, 'i' | 'tag'> | null) => {
      let sh = shared?.[idx];
      if (sh && sh.tag === el.tagName && same(sh)) { list.push({ ...sh, el, k: 0, sh, thin: sh.thin }); idx++; return; }
      const rec_ = make();
      if (!rec_) return;
      if (shared) shared = null;
      sh = { ...rec_, i: idx, tag: el.tagName };
      fresh?.push(sh);
      list.push({ ...sh, el, k: 0, sh });
      idx++;
    };
    for (const part of rec.parts) {
      if (!names.has(part.name)) continue;
      list = [];
      const walk = (el: Element, m: M) => {
        // (a clip's shape is not bent: its far corners are hundreds of units off, and the spline moves a straight edge's
        // ends there, which swings the edge itself where it crosses the part: the knee's cut slid off the knee)
        if (seen.has(el) || el.tagName === 'clipPath') return;
        if (skip.test(el.getAttribute('class') ?? '')) {
          // (the far knee the rig draws is shaded with the far leg)
          if ((el.getAttribute('fill') ?? '').toUpperCase() === '#1A1520')
            add(el, (sh) => sh.kind === 'paint', () => ({ kind: 'paint', tpl: null, base: new Float64Array(0), rest: [], m: ID, mi: ID, part: part.name, detail: false, farInk: true, tf0: null, T0: ID }));
          return;
        }
        seen.add(el);
        const tf = el.getAttribute('transform');
        // (a part's own transform is the rig's, written every frame; one inside it is the drawing's)
        const mm = el === part.el || !tf ? m : mul(m, parseTf(tf));
        const tag = el.tagName;
        if (tag === 'use') {
          const id = (el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '').slice(1);
          const ref = id ? this.el.querySelector(`[id="${id}"]`) : null;
          if (ref) for (const c of Array.from(ref.children)) walk(c, mm);
          return;
        }
        if (tag === 'rect') return;
        if (tag === 'path') {
          const d = el.getAttribute('d');
          if (d) {
            const fill = (el.getAttribute('fill') ?? '').toUpperCase();
            add(el, (sh) => sh.kind === 'path' && sh.rest[0] === d, () => {
              const tpl = parsePath(d);
              return tpl && tpl.nums.length >= 2 ? { kind: 'path', tpl, base: tpl.nums.slice(), rest: [d], m: mm, mi: inv(mm), part: part.name,
                detail: part.name.startsWith('hair') && el.classList.contains('hd'), farInk: fill === '#1A1520', tf0: tf, T0: tf ? parseTf(tf) : ID } : null;
            });
          }
        } else if (tag === 'circle' || tag === 'ellipse') {
          const cx = el.getAttribute('cx') ?? '0', cy = el.getAttribute('cy') ?? '0';
          add(el, (sh) => sh.kind === 'circle' && sh.rest[0] === cx && sh.rest[1] === cy, () => ({ kind: 'circle', tpl: null, base: Float64Array.of(+cx, +cy), rest: [cx, cy], m: mm, mi: inv(mm), part: part.name,
            detail: false, farInk: (el.getAttribute('fill') ?? '').toUpperCase() === '#1A1520', tf0: tf, T0: tf ? parseTf(tf) : ID }));
        }
        for (const c of Array.from(el.children)) walk(c, mm);
      };
      walk(part.el, ID);
      if (list.length) out.set(part.name, list);
    }
    if (fresh && fresh.length) SHARED_MELS.set(v, fresh);
    if (fresh || shared) this.melsShared.add(v);
    return out;
  }

  /** Two neighbouring facings as a Between at their swap. */
  private pairAt(fa: Facing, fb: Facing, k = 1): Between {
    const A = ANG[fa];
    let d = ((ANG[fb] - A) % 360 + 360) % 360; if (d > 180) d -= 360;
    return { near: fa, other: fb, k, low: d > 0, m: A + d / 2, half: Math.abs(d) / 2 };
  }

  /** Where the head is carried to at the swap of a pair (headOf's arithmetic, the neck where it is), on the page. */
  private headX1(fa: Facing, fb: Facing): M {
    const fn = FACING_OF[fa], fo = FACING_OF[fb];
    const rn = this.views[fn.view], ro = this.views[fo.view];
    const nA = rn.piv.neck!;
    void ro;
    const dA = [fn.mirror * (rn.head.cx - nA[0]), rn.head.cy - nA[1]];
    const hc = this.headCarry(this.pairAt(fa, fb));
    const d = [hc.dx, hc.dy];
    const sc = hc.w / rn.head.w;
    const Np = [fn.mirror * nA[0], nA[1]];
    return [sc, 0, 0, 1, Np[0]! - sc * Np[0]! + d[0]! - sc * dA[0]!, d[1]! - dA[1]!];
  }

  /** A pair of drawings worked out (once): where every shape of the drawing shown goes by the swap, in its own units, so
   *  that carried as the turn carries it there (tweens, headOf) it lands on the halfway shape. */
  private prepMorph(fa: Facing, fb: Facing): MorphPrep | null {
    const fn = FACING_OF[fa], fo = FACING_OF[fb];
    const key = pairKey(fn.view, fo.view, fn.mirror * fo.mirror);
    const had = this.mprep.get(key);
    if (had !== undefined) return had;
    const map = this.morph?.maps[key];
    if (!map) { this.mprep.set(key, null); return null; }
    // (worked out once for all rigs: a later rig only puts its own shapes to the shared numbers)
    const shareable = this.melsShared.has(fn.view);
    const got = shareable ? SHARED_PREP.get(key) : undefined;
    if (got) { const pr = this.fromShared(got, this.views[fn.view]); this.mprep.set(key, pr); return pr; }
    const rec = this.views[fn.view], sc = this.morph!.sc, mir = fn.mirror;
    const tw = this.tweens(this.pairAt(fa, fb));
    const hx = this.headX1(fa, fb);
    // (the page's carry undone in the drawing's own frame: Mir X⁻¹ Mir)
    const Mr: M = [mir, 0, 0, 1, 0, 0];
    const own = (X: M): M => mul(Mr, mul(inv(X), Mr));
    const prep: MorphPrep = { els: new Map(), eyes: new Map(), shoulders: new Map(), far: [], aff: new Map(), partAff: new Map(), covered: new Set(), knees: new Map() };
    // The limbs the other drawing has on his far side, behind him (side on: the far leg, arm and sleeve; three-quarters:
    // those of the side turned away): from the front or the back, drawn behind everything while bent towards it, as they
    // are there. (From the back his arms are drawn over the shirt; bent towards the side view the far one comes in over
    // the middle of his back, where the side view has it hidden behind him, and at the swap it popped up on top.)
    const FAR: Partial<Record<View, string[]>> = { side: ['arm_r', 'sleeve_r', 'leg_r', 'shoe_r'], quarter: ['arm_l', 'sleeve_l', 'leg_l', 'shoe_l'] };
    const farB = FAR[fo.view];
    if (farB && (fn.view === 'front' || fn.view === 'back')) {
      const rm = fn.mirror * fo.mirror;
      const mine = new Set(farB.map((g) => (rm < 0 ? g.slice(0, -1) + (g.endsWith('r') ? 'l' : 'r') : g)));
      for (const p of rec.parts) {
        if (p.group !== 'body') continue;
        const m = /^(arm|fore|hand|sleeve|thigh|shin|shoe)([LR])$/.exec(p.name);
        if (!m) continue;
        const sd = SIDE_OF[fn.view][m[2] as Side];
        const g = (m[1] === 'thigh' || m[1] === 'shin' ? 'leg' : m[1] === 'fore' || m[1] === 'hand' ? 'arm' : m[1]) + '_' + sd;
        if (mine.has(g)) prep.far.push(p);
      }
    }
    // (where the rig draws each bone's parts at rest, which is not always where the drawing has them: REST)
    const restPose = blankPose();
    for (const [b, q] of Object.entries(REST[fn.view] ?? {}) as [Bone, Partial<BonePose>][]) { restPose[b].x += q.x ?? 0; restPose[b].y += q.y ?? 0; restPose[b].r += q.r ?? 0; }
    const Mrest = {} as Record<Bone, M>;
    for (const b of BONES) { const par = PARENT[b]; Mrest[b] = par ? mul(Mrest[par], this.localM(b, restPose, rec)) : this.localM(b, restPose, rec); }
    const byGroup = new Map<string, { part: Part; els: MorphEl[] }[]>();
    for (const [pname, g] of Object.entries(map.parts)) {
      const part = rec.parts.find((p) => p.name === pname), els = rec.mels.get(pname);
      if (!part || !els) continue;
      let l = byGroup.get(g); if (!l) byGroup.set(g, (l = []));
      l.push({ part, els });
    }
    for (const [g, items] of byGroup) {
      const gm = map.groups[g]; if (!gm) continue;
      let n = 0;
      for (const it of items) for (const e of it.els) n += e.base.length / 2;
      for (const it of items) for (const e of it.els) if (e.kind === 'paint') prep.els.set(e, new Float64Array(0));
      const xs = new Float64Array(n), ys = new Float64Array(n), ox = new Float64Array(n), oy = new Float64Array(n);
      let q = 0;
      for (const it of items) {
        const Mr = Mrest[it.part.bone];
        for (const e of it.els) {
          const mm = mul(Mr, e.m);
          for (let i = 0; i < e.base.length; i += 2) { const p = at(mm, e.base[i]!, e.base[i + 1]!); xs[q] = p[0]; ys[q] = p[1]; q++; }
        }
      }
      splineAt(gm, sc, xs, ys, ox, oy);
      const full = gm.kind === 'full';
      q = 0;
      for (const it of items) {
        const back = mul(inv(Mrest[it.part.bone]), own(it.part.group === 'head' ? hx : (tw[it.part.unit ?? 'torso'] ?? ID)));
        for (const e of it.els) {
          const dl = new Float64Array(e.base.length);
          for (let i = 0; i < e.base.length; i += 2) {
            const mx = full ? ox[q]! : (xs[q]! + ox[q]!) / 2, my = full ? oy[q]! : (ys[q]! + oy[q]!) / 2;
            const ip = at(back, mx, my), lp = at(e.mi, ip[0], ip[1]);
            dl[i] = lp[0] - e.base[i]!; dl[i + 1] = lp[1] - e.base[i + 1]!;
            q++;
          }
          prep.els.set(e, dl);
          // (the hair's strands and shading are texture, eased down at the swap: a unit or two off is never seen; an outline
          // must be exact, or the two drawings' outlines would not meet at the swap)
          if (e.kind !== 'paint') { const f = fitAffine(e.base, dl); if (f && f.res < (e.detail ? AFF_TOL_DETAIL : AFF_TOL)) prep.aff.set(e, f.M); }
        }
      }
    }
    // the arms: each piece bent as a whole (its points split between the upper arm, the forearm and the hand at the elbow
    // and the wrist, which hang straight down at rest)
    for (const sd of ['L', 'R'] as const) {
      const names = [`arm${sd}`, `fore${sd}`, `hand${sd}`];
      const els = names.flatMap((nm) => rec.mels.get(nm) ?? []).filter((e) => prep.els.has(e) && e.kind !== 'paint');
      const E = rec.piv[`fore${sd}`], W = rec.piv[`split${sd}`] ?? rec.piv[`hand${sd}`];
      if (!els.length || !E || !W) continue;
      const pts: number[][] = [[], [], []], dls: number[][] = [[], [], []];
      for (const e of els) {
        const d = prep.els.get(e)!;
        for (let i = 0; i < e.base.length; i += 2) {
          const p = at(e.m, e.base[i]!, e.base[i + 1]!);
          // (the hand's own shapes are all the hand's)
          const j = e.part === `hand${sd}` && e.el.closest('[class^="hand-"]') ? 2 : p[1] < E[1] ? 0 : p[1] < W[1] ? 1 : 2;
          // (in the part's units: the delta too, through the element's own matrix's linear part)
          pts[j]!.push(p[0], p[1]);
          dls[j]!.push(e.m[0] * d[i]! + e.m[2] * d[i + 1]!, e.m[1] * d[i]! + e.m[3] * d[i + 1]!);
        }
      }
      names.forEach((nm, j) => { const f = fitAffine(Float64Array.from(pts[j]!), Float64Array.from(dls[j]!)); if (f) prep.partAff.set(nm, f.M); });
      for (const e of els) { prep.covered.add(e); prep.aff.delete(e); }
    }
    // the knees: the edges the knee's corner is worked out from, bent as the leg is (left as measured, the corner stood
    // off the bent leg as a nub, or opened a notch, every frame of a turn)
    for (const kn of rec.knees) {
      const th = rec.parts.find((p) => p.name === `thigh${kn.side}`), sh = rec.parts.find((p) => p.name === `shin${kn.side}`);
      const gT: string | undefined = th ? map.parts[th.name] : undefined, gS: string | undefined = sh ? map.parts[sh.name] : undefined;
      const mT: GroupMap | undefined = gT ? map.groups[gT] : undefined, mS: GroupMap | undefined = gS ? map.groups[gS] : undefined;
      if (!th || !sh || !mT || !mS) continue;
      const bendPt = (part: Part, gm: GroupMap, x: number, y: number): [number, number] => {
        const pg = at(Mrest[part.bone], x, y), q = splineAt1(gm, sc, pg[0], pg[1]);
        const mx = gm.kind === 'full' ? q[0] : (pg[0] + q[0]) / 2, my = gm.kind === 'full' ? q[1] : (pg[1] + q[1]) / 2;
        const back = mul(inv(Mrest[part.bone]), own(tw[part.unit ?? 'torso'] ?? ID));
        const l = at(back, mx, my);
        return [l[0] - x, l[1] - y];
      };
      const src: [Part, GroupMap, number, number][] = [];
      for (const e of [kn.t.p, kn.t.n]) src.push([th, mT, e[0], e[1]], [th, mT, e[0] + e[2], e[1] + e[3]]);
      for (const e of [kn.s.p, kn.s.n]) src.push([sh, mS, e[0], e[1]], [sh, mS, e[0] + e[2], e[1] + e[3]]);
      src.push([sh, mS, kn.K[0], kn.K[1]]);
      const dl = new Float64Array(src.length * 2);
      src.forEach(([pt, gm, x, y], i) => { const d = bendPt(pt, gm, x, y); dl[2 * i] = d[0]; dl[2 * i + 1] = d[1]; });
      prep.knees.set(kn, dl);
    }
    // the eyes: their points at the swap (worked out by the build), brought back into the drawing's own units
    const hb = own(hx);
    for (const e of rec.eyes) {
      const g = map.eyes[e.side === 'L' ? 'eyeL' : 'eyeR']; if (!g) continue;
      const cur = [e.L, e.R, e.cu, e.cl, e.cc, e.P];
      const tgt = [g.L, g.R, g.cu, g.cl, g.cc, g.P];
      const dl = new Float64Array(12);
      tgt.forEach((p, i) => { const ip = at(hb, p[0], p[1]); dl[2 * i] = ip[0] - cur[i]![0]; dl[2 * i + 1] = ip[1] - cur[i]![1]; });
      prep.eyes.set(e, dl);
    }
    // the shoulders: the shirt's points by the shirt's carry, the sleeve's by the arm's
    for (const sh of rec.shoulders) {
      const g = map.shoulders['shoulder' + sh.side]; if (!g) continue;
      const bt = own(tw.torso ?? ID), ba = own(tw[unitOf(fn.view, 'arm' + sh.side) ?? ''] ?? ID);
      const P = (m: M, p: number[]): [number, number] => at(m, p[0]!, p[1]!);
      const Dv = (m: M, t: number[]): [number, number] => { const x = m[0] * t[0]! + m[2] * t[1]!, y = m[1] * t[0]! + m[3] * t[1]!, l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
      prep.shoulders.set(sh, { ...sh, N: P(bt, g.N), tN: Dv(bt, g.tN), A: P(bt, g.A), tA: Dv(bt, g.tA), T: P(ba, g.T), tT: Dv(ba, g.tT), I: P(ba, g.I), tI: Dv(ba, g.tI) });
    }
    this.mprep.set(key, prep);
    if (shareable) SHARED_PREP.set(key, this.toShared(prep, rec));
    return prep;
  }

  /** A pair's numbers by index, for every rig (see SharedPrep). */
  private toShared(p: MorphPrep, rec: ViewRec): SharedPrep {
    let n = 0;
    for (const l of rec.mels.values()) for (const e of l) n = Math.max(n, e.i + 1);
    const els: (Float64Array | undefined)[] = new Array(n), aff: (M | undefined)[] = new Array(n), covered = new Uint8Array(n);
    for (const [e, d] of p.els) els[e.i] = d;
    for (const [e, m] of p.aff) aff[e.i] = m;
    for (const e of p.covered) covered[e.i] = 1;
    return {
      els, aff, covered,
      eyes: rec.eyes.map((e) => p.eyes.get(e)),
      shoulders: rec.shoulders.map((sh) => { const g = p.shoulders.get(sh); return g ? { N: g.N, tN: g.tN, T: g.T, tT: g.tT, I: g.I, tI: g.tI, A: g.A, tA: g.tA } : undefined; }),
      far: p.far.map((pt) => rec.parts.indexOf(pt)), partAff: p.partAff,
      knees: rec.knees.map((kn) => p.knees.get(kn)),
    };
  }
  private fromShared(sp: SharedPrep, rec: ViewRec): MorphPrep {
    const p: MorphPrep = { els: new Map(), eyes: new Map(), shoulders: new Map(), far: [], aff: new Map(), partAff: sp.partAff, covered: new Set(), knees: new Map() };
    rec.knees.forEach((kn, i) => { const d = sp.knees[i]; if (d) p.knees.set(kn, d); });
    for (const l of rec.mels.values()) for (const e of l) {
      const d = sp.els[e.i]; if (d) p.els.set(e, d);
      const a = sp.aff[e.i]; if (a) p.aff.set(e, a);
      if (sp.covered[e.i]) p.covered.add(e);
    }
    rec.eyes.forEach((e, i) => { const d = sp.eyes[i]; if (d) p.eyes.set(e, d); });
    rec.shoulders.forEach((sh, i) => { const g = sp.shoulders[i]; if (g) p.shoulders.set(sh, { ...sh, ...g }); });
    p.far = sp.far.map((i) => rec.parts[i]!).filter(Boolean);
    return p;
  }

  /** The far limbs moved behind everything (or put back where the drawing has them). */
  private layFar(rec: ViewRec, far: Part[] | null) {
    if (far === rec.farNow || (far && rec.farNow && far.length === rec.farNow.length && far.every((p, i) => p === rec.farNow![i]))) return;
    const first = rec.order0.find((el) => el.classList?.contains('part')) ?? null;
    if (rec.farNow) for (const el of rec.order0) rec.g.append(el);
    if (far) for (const p of far) rec.g.insertBefore(p.el, first && first.parentNode === rec.g ? first : rec.g.firstChild);
    rec.farNow = far;
  }

  /** How far a copy of a drawing is bent this frame, and the pair it is bent by. */
  private morphOf(f: Facing, other: Facing, k: number, head = false): MorphNow | null {
    if (!this.morph || k <= 1e-4 || f === other) return null;
    const prep = this.prepMorph(f, other);
    if (!prep) return null;
    // (not the side view's head: from side to back its face slides in under the hair on a map of its own (the build's
    // FACE_AWAY), and taken the other way, as the curve does a little, it came out from under the fringe with the
    // background between: the side view's head is bent straight towards each swap)
    if (head && FACING_OF[f].view === 'side') return { prep, k, prep2: null, c1: k, c2: 0 };
    // The bend runs through the drawing on one curve, a quadratic through the halfway shapes either side: at k 0 the
    // drawing, at k 1 the halfway shape with `other`, and its pace through the drawing the same from both sides. Bent
    // straight towards each side's halfway shape in turn, every point changed speed (or turned straight back, at the
    // widest of the hair or the shirt) at every drawing: a tick, every drawing of a turn.
    const R = FACINGS.length, i = FACINGS.indexOf(f), o = FACINGS.indexOf(other);
    const z = FACINGS[(o === (i + 1) % R ? i - 1 + R : i + 1) % R]!;
    const prep2 = z !== other ? this.prepMorph(f, z) : null;
    if (!prep2) return { prep, k, prep2: null, c1: k, c2: 0 };
    // (past the swap, for the copy a sweep draws after it: on along the curve's line)
    const c1 = k <= 1 ? (k + k * k) / 2 : 1 + 1.5 * (k - 1), c2 = k <= 1 ? (k * k - k) / 2 : 0;
    return { prep, k, prep2, c1, c2 };
  }

  /** A shape written bent by k towards the swap (or as drawn). */
  private morphWrite(e: MorphEl, mo: MorphNow | null) {
    const d = mo?.prep.els.get(e), k = mo?.k ?? 0, prep = mo?.prep ?? null;
    if (!d || k <= 1e-4 || prep?.covered.has(e)) {
      if (e.k === 0) return;
      e.k = 0;
      if (e.tf0 !== undefined) { if (e.tf0) this.write(e.el, 'transform', e.tf0); else if (this.written.get(e.el)?.transform) { this.write(e.el, 'transform', ''); e.el.removeAttribute('transform'); } }
      if (e.kind === 'path') this.write(e.el, 'd', e.rest[0]!);
      else if (e.kind === 'circle') { this.write(e.el, 'cx', e.rest[0]!); this.write(e.el, 'cy', e.rest[1]!); }
      if (e.detail) this.write(e.el, 'opacity', '1');
      if (e.farInk) this.write(e.el, 'fill', '#1A1520');
      return;
    }
    if (Math.abs(e.k - k) < 1e-4) return;
    e.k = k;
    const kk = Math.min(1, k);
    if (e.detail) this.write(e.el, 'opacity', String(+(1 - DETAIL_FADE * smooth01(DETAIL_FROM, 1, kk)).toFixed(3)));
    if (e.farInk) { const c = FAR_INK.map((v) => Math.round(v * (1 - smooth01(0.3, 1, kk)))); this.write(e.el, 'fill', `rgb(${c[0]},${c[1]},${c[2]})`); }
    if (e.kind === 'paint') return;
    const c1 = mo!.c1, c2 = mo!.c2, d2 = mo!.prep2?.els.get(e);
    const A = prep?.aff.get(e), A2 = mo!.prep2?.aff.get(e);
    if (A && (A2 || !d2)) {
      // (as a whole: its own transform, then the bend; its points as drawn)
      const B = A2 ?? ID;
      const L: M = [1 + c1 * (A[0] - 1) + c2 * (B[0] - 1), c1 * A[1] + c2 * B[1], c1 * A[2] + c2 * B[2], 1 + c1 * (A[3] - 1) + c2 * (B[3] - 1), c1 * A[4] + c2 * B[4], c1 * A[5] + c2 * B[5]];
      this.write(e.el, 'transform', str(mul(e.T0, L)));
      if (e.kind === 'path') this.write(e.el, 'd', e.rest[0]!);
      else if (e.kind === 'circle') { this.write(e.el, 'cx', e.rest[0]!); this.write(e.el, 'cy', e.rest[1]!); }
      return;
    }
    if (e.tf0 !== undefined && this.written.get(e.el)?.transform !== undefined) this.write(e.el, 'transform', e.tf0 ?? '');
    const b = e.base;
    if (e.kind === 'path') {
      const th = e.thin ?? (e.thin = e.sh.thin ?? (e.sh.thin = thinPath(e.tpl!, THIN)));
      const idx = th.idx, xy = new Float64Array(idx.length);
      if (d2) for (let i = 0; i < idx.length; i++) { const q = idx[i]!; xy[i] = b[q]! + c1 * d[q]! + c2 * d2[q]!; }
      else for (let i = 0; i < idx.length; i++) { const q = idx[i]!; xy[i] = b[q]! + c1 * d[q]!; }
      this.write(e.el, 'd', writePath(th.tpl, xy));
    } else {
      const x = b[0]! + c1 * d[0]! + c2 * (d2?.[0] ?? 0), y = b[1]! + c1 * d[1]! + c2 * (d2?.[1] ?? 0);
      this.write(e.el, 'cx', String(Math.round(x * 100) / 100)); this.write(e.el, 'cy', String(Math.round(y * 100) / 100));
    }
  }

  /** One drawing's pose for this frame: the idle, the moves (worked out for this drawing: see frame()), the turn's
   *  extras, the shoulders and sleeves, the arms' follow-through. `ghost`: another drawing of the same moment, so the
   *  moves' bookkeeping, the face, the jump and the springs' clocks are the first pass's and nothing here changes state. */
  private buildPose(v: View, mir: 1 | -1, dt: number, ts: ReturnType<EmonadRig['turnStep']>, ghost: boolean, face: Face, root: { x: number; y: number }): BuiltPose {
    const t = this.time;
    const pose = blankPose();          // (each view adds its own rest when it is drawn)
    const feet: Record<Side, FootGoal> = { L: null, R: null };
    const grip: Record<Side, Grip> = { L: 'rest', R: 'rest' };
    const body = (s: Side) => bodyOf(v, mir, s);

    // the idle: breathing, a slow shift of weight, the arms hanging loose (each arm's sway by his side, in its own "out")
    if (this.alive) {
      // (in a loop, each wave turned by a whole number of times a loop: the nearest to its own rhythm)
      const P = this.idlePeriod && this.idlePeriod > 0 ? this.idlePeriod : 0;
      const W = (w: number) => (P ? Math.max(1, Math.round(w * P / (2 * Math.PI))) * 2 * Math.PI / P : w);
      // (big enough to read: at half this he looked like a still with blinks)
      const br = Math.sin(t * W(2 * Math.PI / 3.8));
      pose.spine.y += -1.8 * br;   // (no stretch of the shirt: the neck and arms would not follow it)
      for (const s of ['armL', 'armR'] as const) pose[s].y += -0.8 * br;
      pose.head.y += -0.6 * br;
      const sh = Math.sin(t * W(2 * Math.PI / 7.3)) * 0.7 + Math.sin(t * W(2 * Math.PI / 3.1)) * 0.3;
      // (the weight shift, by the shares, so it never jumps at a turn's swap: from the front a sway of the hips, side on a
      // rock of the back)
      const ls = leanOf(ts.body, v).side;
      pose.hips.x += 3.2 * sh * (1 - ls); pose.hips.r += 0.7 * sh * (1 - ls); pose.spine.r += sh * (-1.1 * (1 - ls) + 1 * ls); pose.head.r += sh * (0.9 * (1 - ls) - 0.8 * ls);
      for (const s of ['L', 'R'] as const) {
        const o = ARM_OUT[v][s], r = body(s) === 'r';
        pose[`arm${s}`].r += o * 0.8 * Math.sin(t * W(r ? 1.3 : 1.17) + (r ? 1 : 2));
        pose[`fore${s}`].r += o * (1.2 + 0.8 * Math.sin(t * W(r ? 1.1 : 1.3) + (r ? 0 : 0.5)));
        pose[`hand${s}`].r += o * 0.6 * Math.sin(t * W(r ? 0.9 : 0.8) + (r ? 2 : 0));
      }
    }

    // the moves
    const lean = leanOf(ts.body, v);
    const ctx = { view: v, mirror: mir, ghost, pose, face, feet, grip, root, rig: this, dt: ghost ? 0 : dt, stand: (s: Side) => this.standGoal(s, v),
      side: lean.side, quarter: lean.quarter, back: lean.back, fwd: lean.fwd, right: lean.right,
      body, letter: (b: Body) => letterOf(v, mir, b), emit: (e: RigEvent) => { if (!ghost) this.emit(e); } } as unknown as Ctx;
    let headTurn = 0;
    ctx.turnHead = (deg) => { if (Number.isFinite(deg)) headTurn += deg * ctx.w; };
    if (this.fid && this.alive) headTurn += this.fidget(pose, ghost ? null : face, v, mir, lean);
    ctx.add = (bone, val) => {
      const p = pose[bone], w = ctx.w;
      if (val.r) p.r += val.r * w; if (val.x) p.x += val.x * w; if (val.y) p.y += val.y * w; if (val.kx) p.kx += val.kx * w;
      if (val.sx !== undefined) p.sx *= 1 + (val.sx - 1) * w; if (val.sy !== undefined) p.sy *= 1 + (val.sy - 1) * w;
    };
    let mouthPri = -1;
    for (const r of [...this.running]) {
      if (r.after) {
        // waiting for a move ahead of it to end (removed earlier in this same pass when it did: it starts in that frame)
        if (ghost || r.after.some((b) => this.running.includes(b))) { if (!ghost) r.t0 = t; continue; }
        r.after = undefined; r.t0 = t;
      }
      const el = t - r.t0;
      const len = typeof r.a.dur === 'function' ? r.a.dur(r.opts, this) : r.a.dur;
      // (cut short: it holds the pose it had reached, and fades out from that over at least XFADE)
      const held = !!r.fading && r.state._ended !== true && (r.a.layer ?? 'body') !== 'move';
      if (!ghost) {
        // (a hair's slack: a length reached by steps of 1/60 s lands a rounding error short of it, and ended a frame late)
        const fin = r.a.loop ? false : el >= len - 1e-6;
        const fadeIn = Math.max(r.a.fadeIn ?? 0.15, r.xin ?? 0), fadeEnd = r.a.fadeOut ?? 0.2;
        const fadeOut = held ? Math.max(fadeEnd, XFADE) : fadeEnd;
        // (eased both ways: a move's weight that starts or stops in a straight line kicks every bone it moves)
        r.w = fadeIn > 0 ? smooth01(0, fadeIn, el) : 1;
        if (r.fading) r.w *= 1 - smooth01(0, fadeOut, t - r.fading);
        // (a move with a length fades out over its last moments too, so one that does not end at rest never pops off)
        if (!r.a.loop && fadeEnd > 0 && len > 0) r.w *= 1 - smooth01(len - fadeEnd, len, el);
        if (fin || (r.fading && t - r.fading >= fadeOut - 1e-6)) {
          this.running.splice(this.running.indexOf(r), 1);
          r.a.end?.(this, r.opts);
          // (finished: ran its course, or ended itself; cut short: faded out because something else took over)
          const finished = (fin || r.state._ended === true) && r.state._cut !== true;
          r.done(finished);
          this.emit({ type: 'moveEnd', name: r.name, finished });
          continue;
        }
      }
      const tm = held ? r.fading - r.t0 : el;
      ctx.t = tm; ctx.u = len > 0 ? tm / len : 0; ctx.w = r.w;
      ctx.state = r.state; ctx.fading = !!r.fading && r.state._ended !== true; ctx.stopping = r.stopping;
      const before = face.mouth;
      const pre = { L: feet.L, R: feet.R };
      // (a move that says it is finished fades out from here)
      if (r.a.run(ctx, r.opts) === true && !r.fading && !ghost) { r.fading = t; r.state._ended = true; }
      // a foot a move asks for is blended in by its weight over what was asked before it (or standing): the last move to
      // write a foot used to win outright, and a move fading in or out popped the foot a whole step
      for (const s of ['L', 'R'] as const) {
        const g = feet[s];
        if (g === pre[s] || !g) continue;
        const b = pre[s] ?? this.standGoal(s, v), w = r.w;
        feet[s] = { x: b.x + (g.x - b.x) * w, y: b.y + (g.y - b.y) * w, a: b.a + (g.a - b.a) * w };
      }
      if (face.mouth !== before) {
        // the mouth is not blended: the move most in charge of the face gets it
        const pri = (r.a.facePri ?? 1) * r.w;
        if (pri > mouthPri) mouthPri = pri; else face.mouth = before;
      }
    }

    // the turn: he dips a little, the arms swing out (the eyes are the face's: frame())
    if (this.turn) {
      pose.hips.y += ts.dip;
      pose.armL.r += ARM_OUT[v].L * ts.arms; pose.armR.r += ARM_OUT[v].R * ts.arms;
    }

    for (const s of ['L', 'R'] as const) {
      const a = pose[`arm${s}`], sl = pose[`sleeve${s}`];
      // the shoulder rises as the arm goes up (past about level the collarbone lifts with it)
      const out = ARM_OUT[v][s] * a.r;
      a.y -= v === 'side' ? 3 * smooth01(60, 165, out) : 5 * smooth01(40, 150, out);
      // the sleeves turn exactly with their arms: the arm runs on up inside its sleeve, and turned any less the sleeve
      // lets the top of the arm out above it
      sl.r += a.r; sl.x += a.x; sl.y += a.y;
    }
    // the forearms and hands follow through
    this.springArms(ghost ? 0 : dt, pose, v, mir, ghost);
    return { pose, feet, grip, headTurn: clamp(headTurn, -20, 20) };
  }

  private frame(dt: number) {
    this.time += dt;
    const t = this.time;
    if (dt > 0) { const c = clamp(dt, 1 / 480, 1 / 12); this.fdt = this.fdt ? this.fdt + (c - this.fdt) * 0.2 : c; }
    const ts = this.turnStep(dt);
    const bodyAt = between(ts.body);
    let headAt = between(ts.head);
    // the facing the moves see is the body's
    if (bodyAt.near !== this._facing) { this._facing = bodyAt.near; this.onFacing?.(bodyAt.near); }
    const v = this.view, mirV = FACING_OF[this._facing].mirror;
    const face = { ...blankFace(), ...MOOD_FACE[this.mood] } as Face;
    const root = { x: 0, y: 0 };
    // Each drawing drawn this frame gets its own pose, worked out by the moves for THAT drawing (a part's letter is a
    // different side of him in each, "out" is sideways in one and forwards in another, the feet stand in different
    // places): the drawing the body is in first, with the moves' bookkeeping, the face, the grips and the jump; another
    // only when a turn's swap shows two. One pose shared by both put a raised arm on the other arm for the frames of a
    // swap, and a move that picked "the near arm" swapped arms halfway round.
    this.fidgetState();
    const prim = this.buildPose(v, mirV, dt, ts, false, face, root);
    // each hand's shape: the move's, by his side; a change goes through its in-between for a moment
    for (const s of ['L', 'R'] as const) {
      const hs = this.handNow[bodyOf(v, mirV, s)], want = prim.grip[s];
      if (want !== hs.target) {
        const mid = midShape(hs.shown, want);
        hs.target = want;
        if (mid) { hs.shown = mid; hs.until = this.time + HAND_MID; } else hs.shown = want;
      } else if (hs.shown !== want && this.time >= hs.until - 1e-9) hs.shown = want;
    }
    // (a move's turn of the head: see Ctx.turnHead)
    if (prim.headTurn) headAt = between(ts.head + prim.headTurn);
    // the turn: the eyes lead and shut over the swaps
    if (this.turn) { face.lookX += ts.look; face.lid = Math.max(face.lid, ts.lid); }
    const poses = new Map<View, BuiltPose>([[v, prim]]);
    const poseOf = (f: Facing): BuiltPose => {
      const fo = FACING_OF[f];
      let b = poses.get(fo.view);
      if (!b) { b = this.buildPose(fo.view, fo.mirror, dt, ts, true, { ...blankFace() } as Face, { x: 0, y: 0 }); poses.set(fo.view, b); }
      return b;
    };

    const fstate = this.faceState(dt, face);
    // each group in the drawing nearest its angle, every piece carried towards the next drawing; near a swap, the next
    // drawing too, dissolving in over a few frames. The head is set on the body's neck.
    // Near a swap both drawings are drawn, at the same size in the same place, and the new one sweeps in across the old
    // the way he turns (what comes into view comes in from the side he turns away from, as on a turning head), so no
    // part of him is ever drawn twice, see-through.
    type Copy = { f: Facing; X: Record<string, M>; off: M; isNew: boolean; other: Facing; k: number };
    type Wipe = { u: number; mv: number } | null;
    const dirHint = this.turn?.dir ?? 1;
    const copies = (at: Between, v_: number): { list: Copy[]; wipe: Wipe } => {
      const list: Copy[] = [{ f: at.near, X: this.tweens(at), off: ID, isNew: false, other: at.other, k: at.k }];
      // (the band is a few frames of the turn at its speed: wider the faster it goes)
      // (over about two and a half frames of the screen's, whatever the speed: in slow motion it is as quick to the eye,
      // so the two drawings are never seen half and half for long)
      // (a screen frame is fdt of his time: 1/60 s on a 60 Hz screen at speed 1, less in slow motion, a renderer's step)
      const band = clamp(Math.abs(v_) * (this.fdt || 1 / 60) * this.sweep.frames, 1.5, 0.85 * at.half), dB = (1 - at.k) * at.half;
      if (!this.turn || this.sweep.frames <= 0 || dB >= band) return { list, wipe: null };
      const mv = Math.abs(v_) > 1 ? Math.sign(v_) : dirHint;
      const before = at.low === (mv > 0);
      list[0]!.isNew = !before;
      list.push({ f: at.other, X: this.tweens({ near: at.other, other: at.near, k: 2 - at.k, low: !at.low, m: at.m, half: at.half }), off: ID, isNew: before, other: at.near, k: 2 - at.k });
      return { list, wipe: { u: ((before ? -dB : dB) + band) / (2 * band), mv } };
    };
    const bodyR = copies(bodyAt, ts.vBody), headR = copies(headAt, ts.vHead);
    const bodyC = bodyR.list;
    let headC = headR.list, headWipe = headR.wipe;
    const bodyWipe = bodyR.wipe;
    // (one drawing can only be shown one way round: a copy that would need the other is left out)
    const mirOf = new Map<View, number>();
    for (const c of bodyC) mirOf.set(FACING_OF[c.f].view, FACING_OF[c.f].mirror);
    const fits = (c: Copy) => (mirOf.get(FACING_OF[c.f].view) ?? FACING_OF[c.f].mirror) === FACING_OF[c.f].mirror;
    if (!fits(headC[0]!)) { headC = [{ ...bodyC[0]!, isNew: false }]; headWipe = null; }
    else if (headC.length > 1 && !fits(headC[1]!)) { headC = [headC[0]!]; headWipe = null; }
    const solves = new Map<View, Solved>();
    const solveOf = (f: Facing) => {
      const vv = FACING_OF[f].view; let sv = solves.get(vv);
      if (!sv) {
        const bp = poseOf(f), mir = FACING_OF[f].mirror;
        const lift = { L: ts.lift[bodyOf(vv, mir, 'L')], R: ts.lift[bodyOf(vv, mir, 'R')] };
        sv = this.solve(vv, bp.pose, bp.feet, lift); solves.set(vv, sv);
      }
      return sv;
    };
    const W = (sv: Solved, X: M, mir: number, b: Bone): [number, number] => { const q = sv.rec.piv[b]!; const w = at(sv.M[b], q[0], q[1]); return at(X, mir * w[0], w[1]); };
    const fb = FACING_OF[bodyC[0]!.f], sB = solveOf(bodyC[0]!.f);
    const Xt = bodyC[0]!.X.torso ?? ID;
    // where the head sits: the neck's place in the shirt carried from this drawing's towards the other's like everything
    // else (each drawing has its neck in a slightly different place over its shirt, so set where the drawing shown has
    // it, the head would jump sideways at every swap of the body)
    const nB = ((): [number, number] => {
      const fn = FACING_OF[bodyAt.near], fo = FACING_OF[bodyAt.other];
      const rn = this.views[fn.view], ro = this.views[fo.view];
      const tn = rn.units.torso, to = ro.units.torso;
      const posed = W(sB, Xt, fb.mirror, 'neck');
      if (!tn || !to || bodyC[0]!.f !== bodyAt.near) return posed;
      const pn = rn.piv.neck!;
      const nc = bodyAt.k > 0 ? this.neckCarry(bodyAt) : [fn.mirror * (pn[0] - tn.cx), pn[1] - tn.cy];
      const rest = at(Xt, fn.mirror * pn[0], pn[1]);
      const want = at(Xt, fn.mirror * tn.cx, tn.cy);
      return [posed[0] - rest[0] + want[0] + nc[0]!, posed[1] - rest[1] + want[1] + nc[1]!];
    })();
    // The head is one piece (its hair, face and neck never move against each other, so nothing the sheet hides can show):
    // it sits on the body's neck, its middle and width carried from this drawing's towards the other's, so at the swap
    // the two drawings of the head are the same size in the same place.
    const headOf = (c: Copy): M => {
      const near = c === headC[0] ? headAt : null;
      const at_: Between = near ?? { ...headAt, near: headAt.other, other: headAt.near, k: 2 - headAt.k, low: !headAt.low };
      const fn = FACING_OF[c.f];
      const rn = this.views[fn.view];
      const nA = rn.piv.neck!;
      const dA: [number, number] = [fn.mirror * (rn.head.cx - nA[0]), rn.head.cy - nA[1]];
      const inPair = (c.f === headAt.near || c.f === headAt.other) && at_.k > 0;
      const hc = inPair ? this.headCarry(at_) : null;
      const d: [number, number] = hc ? [hc.dx, hc.dy] : dA;
      const sc = hc ? hc.w / rn.head.w : 1;
      const Np = W(solveOf(c.f), ID, fn.mirror, 'neck');
      return [sc, 0, 0, 1, nB[0] - sc * Np[0] + d[0] - sc * dA[0], nB[1] - Np[1] + d[1] - dA[1]];
    };
    for (const c of headC) c.off = headOf(c);
    // the sweeps: which copy is on top in the page's order, where the seam is (across the group's box, from one side to
    // the other over the band) and which side of it the top copy shows
    const masks = new Map<Element, string>();
    // (the seam is all but hard: every point of him is one drawing's or the other's, never both. Soft across half the
    // group's width, as it was, the two drawings' hands, arms and faces showed half and half for the frames of a swap;
    // a hand or the face cut whole at one frame fought the masks, which then clipped it or lost it for a frame)
    const sweep = (g: 'head' | 'body', list: Copy[], wipe: Wipe, cx: number, w: number) => {
      if (!wipe || list.length < 2) return;
      const [a, b] = list as [Copy, Copy];
      const ra = this.views[FACING_OF[a.f].view], rb = this.views[FACING_OF[b.f].view];
      const top = ra.order > rb.order ? a : b, bot = top === a ? b : a;
      const newSide = wipe.mv > 0 ? -1 : 1, topSide = top.isNew ? newSide : -newSide;
      const L = cx - w / 2, R = cx + w / 2, soft = this.sweep.soft * w;
      const c = wipe.mv > 0 ? L - soft / 2 + wipe.u * (R - L + soft) : R + soft / 2 - wipe.u * (R - L + soft);
      const x1 = String(+(c - soft / 2).toFixed(2)), x2 = String(+(c + soft / 2).toFixed(2));
      const set = (m: WipeMask, offs: number[], cols: string[]) => {
        this.write(m.grad, 'x1', x1); this.write(m.grad, 'x2', x2);
        m.stops.forEach((st, i) => { this.write(st, 'offset', String(offs[i])); this.write(st, 'stop-color', cols[i]!); });
      };
      const W1 = '#fff', B0 = '#000', M = this.wipes[g];
      if (topSide < 0) { set(M.top, [0, 1, 1], [W1, B0, B0]); set(M.bot, [0, 0, 1], [B0, W1, W1]); }
      else { set(M.top, [0, 1, 1], [B0, W1, W1]); set(M.bot, [0, 1, 1], [W1, W1, B0]); }
      const el = (c_: Copy) => (g === 'head' ? this.views[FACING_OF[c_.f].view].hb : this.views[FACING_OF[c_.f].view].g);
      masks.set(el(top), M.top.url); masks.set(el(bot), M.bot.url);
    };
    {
      const h0 = headC[0]!, rh = this.views[FACING_OF[h0.f].view];
      sweep('head', headC, headWipe, at(h0.off, FACING_OF[h0.f].mirror * rh.head.cx, rh.head.cy)[0], h0.off[0] * rh.head.w * 1.2);
      const b0 = bodyC[0]!, rb = this.views[FACING_OF[b0.f].view], Xb = b0.X.torso ?? ID;
      sweep('body', bodyC, bodyWipe, at(Xb, FACING_OF[b0.f].mirror * rb.body.cx, rb.body.cy)[0], Xb[0] * rb.body.w * 1.15);
    }

    for (const [vv, vr] of Object.entries(this.views) as [View, ViewRec][]) {
      const cB = bodyC.find((c) => FACING_OF[c.f].view === vv), cH = headC.find((c) => FACING_OF[c.f].view === vv);
      this.show(vr.g, !!cB || !!cH);
      this.show(vr.hb, !!cH);
      if (!cB && !cH) continue;
      const fc = FACING_OF[(cB ?? cH)!.f], mir = fc.mirror, sv = solveOf((cB ?? cH)!.f), M = sv.M, P = sv.pose;
      const Mir: M = [mir, 0, 0, 1, 0, 0];
      const mg = masks.get(vr.g), mh = masks.get(vr.hb);
      this.write(vr.gw, 'mask', mg ?? 'none'); this.write(vr.g, 'opacity', mg ? '0.999' : '1');
      this.write(vr.hbw, 'mask', mh ?? 'none'); this.write(vr.hb, 'opacity', mh ? '0.999' : '1');
      const drawn = new Map<string, M>();
      // (each copy bent towards the halfway shape of its pair, as far as it has come towards the swap)
      const moB = cB ? this.morphOf(cB.f, cB.other, cB.k) : null, moH = cH ? this.morphOf(cH.f, cH.other, cH.k, true) : null;
      this.layFar(vr, moB?.prep.far.length ? moB.prep.far : null);
      // (side on, bent towards the back: the face goes round under the hair, and the head's shape under it all keeps the
      // room from showing where the face was; bent with the head to the hair's halfway shape by the swap)
      const under = !!moH && vv === 'side' && FACING_OF[cH!.other].view === 'back';
      for (const part of vr.parts) {
        const isH = part.group === 'head';
        const c = isH ? cH : cB;
        this.show(part.el, !!c && (part.name !== 'headUnder' || under));
        if (!c) continue;
        const b = part.bone;
        let m = M[b];
        if (b !== 'hairlo') {
          const p = P[b];
          if (p.sx !== 1 || p.sy !== 1 || p.kx !== 0) {
            const pv = vr.piv[b]!;
            m = mul(m, mul(tr(pv[0], pv[1]), mul([p.sx, 0, Math.tan(p.kx * D2R) * p.sy, p.sy, 0, 0], tr(-pv[0], -pv[1]))));
          }
        }
        m = mul(isH ? c.off : c.X[part.unit ?? 'torso'] ?? ID, mul(Mir, m));
        const mo_ = isH ? moH : moB, pa = mo_?.prep.partAff.get(part.name);
        if (pa) {
          const c1 = mo_!.c1, c2 = mo_!.c2, pb = mo_!.prep2?.partAff.get(part.name) ?? ID;
          m = mul(m, [1 + c1 * (pa[0] - 1) + c2 * (pb[0] - 1), c1 * pa[1] + c2 * pb[1], c1 * pa[2] + c2 * pb[2], 1 + c1 * (pa[3] - 1) + c2 * (pb[3] - 1), c1 * pa[4] + c2 * pb[4], c1 * pa[5] + c2 * pb[5]]);
        }
        this.write(part.el, 'transform', str(m));
        drawn.set(part.name, m);
      }
      if (vr.mels.size && (moB || moH || vr.mbent)) {
        let bent = false;
        for (const part of vr.parts) {
          const els = vr.mels.get(part.name); if (!els) continue;
          let mo = part.group === 'head' ? moH : moB;
          // (the head's shape under the side view's head goes to its swap shape sooner than the rest of the head: where it
          // shows, in front of the face going away, it is soon the round of his head under the hair)
          if (mo && part.name === 'headUnder') { const u = 1 - Math.pow(1 - Math.min(1, mo.k), 2.5); mo = { ...mo, c1: u, c2: 0, prep2: null }; }
          for (const e of els) { this.morphWrite(e, mo); if (e.k) bent = true; }
        }
        vr.mbent = bent;
      }
      if (cB) {
        for (const s of ['L', 'R'] as const) { const e = vr.elbows[s]; if (e) this.cutElbow(e, P[`fore${s}`].r); }
        for (const s of ['L', 'R'] as const) {
          const h = vr.hands[s]; if (!h) continue;
          const g = this.handNow[bodyOf(vv, mir, s)].shown;
          const want = h[g] ? g : 'rest';
          for (const k of SHAPES) { const el = h[k]; if (el) this.show(el, k === want); }
        }
        // side on, the corner under a raised arm, from where the shirt and the sleeve are drawn
        for (const pt of vr.pits) {
          const mp = drawn.get(`armpit${pt.side}`), ms = drawn.get(`sleeve${pt.side}`);
          if (mp && ms) this.armpitSide(pt, mul(inv(mp), ms));
        }
        // the wrists, from where the forearm and the hand are drawn
        for (const s of ['L', 'R'] as const) {
          const wj = vr.wjoints[s], mf = drawn.get(`fore${s}`), mh = drawn.get(`hand${s}`);
          if (wj && mf && mh) this.wristJoint(wj, mul(inv(mf), mh));
        }
        // the knees, from where the thigh and the shin are drawn
        for (const kn of vr.knees) {
          const mt = drawn.get(`thigh${kn.side}`), ms = drawn.get(`shin${kn.side}`);
          if (mt && ms) this.kneePath(moB ? bentKnee(kn, moB) : kn, mul(inv(ms), mt));
        }
        // the shoulders, between the shirt and each raised sleeve (worked out from where the shirt and the arm are
        // drawn, both carried by the turn)
        const Fs = mul(cB.X.torso ?? ID, mul(Mir, M.spine));
        for (const sh of vr.shoulders) {
          const Xa = cB.X[unitOf(vv, `arm${sh.side}`) ?? ''] ?? ID;
          const shm = moB?.prep.shoulders.get(sh), shz = moB?.prep2?.shoulders.get(sh);
          const shape = shm ? (shz ? bendShoulder(sh, shm, shz, moB!.c1, moB!.c2) : lerpShoulder(sh, shm, moB!.c1)) : sh;
          this.shoulderPath(shape, mul(inv(Fs), mul(Xa, mul(Mir, M[`arm${sh.side}`]))));
        }
        // where a raised sleeve leaves the shirt with no shoulder piece: the corners rounded (gone as the drawing bends
        // towards the next one's shape: the measured outlines are the drawing's own)
        for (const fl of vr.fillets) {
          const Xa = cB.X[unitOf(vv, `arm${fl.side}`) ?? ''] ?? ID;
          this.filletPath(fl, mul(inv(Fs), mul(Xa, mul(Mir, M[`arm${fl.side}`]))), moB ? clamp(1 - 1.6 * moB.k, 0, 1) : 1);
        }
      }
      // the face
      if (cH) this.faceDraw(face, vr, mir, fstate.bl, moH);
      // from the back, the hair's strands sliding across as he turns past (the back of his head going round: a point
      // on it goes across the page as the sine of the angle from dead-back), so the picture never stands still there
      if (vr.slides.length) {
        let sx = 0;
        if (cH) {
          const u = clamp(cH.k, 0, 1) * (ANG[cH.other] < ANG[cH.f] ? -1 : 1);
          sx = mir * HAIR_SLIDE * Math.sin(u * Math.PI / 4) / Math.SQRT1_2;
        }
        const tf = Math.abs(sx) < 0.005 ? '' : `translate(${+sx.toFixed(3)} 0)`;
        for (const g of vr.slides) this.write(g, 'transform', tf);
      }
    }
    const fh = FACING_OF[headC[0]!.f], sH = solveOf(headC[0]!.f), offH = headC[0]!.off;

    // where he stands
    const rx = this.x + root.x * this.scale * mirV, ry = this.y + root.y * this.scale;
    this.lifted = root.y;
    this.write(this.el, 'transform', `translate(${+rx.toFixed(2)} ${+ry.toFixed(2)}) scale(${+this.scale.toFixed(4)})`);
    // the hair's ends (below the chin): a spring on the head's motion in the room's own directions and units
    // (driven by the middle of the head, which goes on smoothly through a swap where the head's own pivot jumps from one
    // drawing's to the other's; a drawing shown the other way round turns the hair's lean round with it)
    const hc = at(mul(offH, mul([fh.mirror, 0, 0, 1, 0, 0], sH.M.head)), sH.rec.head.cx, sH.rec.head.cy);
    if (fh.mirror !== this.hairMir) { this.hair.k = -this.hair.k; this.hair.kv = -this.hair.kv; this.hairMir = fh.mirror; }
    // (and, while he turns, the head's swing round: the hair's ends lag as he gets going and run on as he stops. Its
    // front goes round across the page as fast as it turns times the cosine of the angle, from the front one way and
    // from the back the other; side on it comes towards us, which does not show. On the phase, which turns evenly)
    const turnAx = HAIR_TURN_R * D2R * ts.aHead * Math.cos(ts.head * D2R);
    this.springHair(dt, rx / Math.max(0.05, this.scale) + hc[0], ry / Math.max(0.05, this.scale) + hc[1],
      Math.atan2(sH.M.head[1], sH.M.head[0]) / D2R * fh.mirror, fh.mirror, turnAx);
    this.last3 = { s: sB, X: mul(Xt, [fb.mirror, 0, 0, 1, 0, 0]), rx, ry };
    // waits whose time has come (after the frame is drawn: what a wait's caller does next starts from this frame)
    if (this.timers.length) {
      const due = this.timers.filter((tm) => tm.until <= this.time);
      if (due.length) { this.timers = this.timers.filter((tm) => tm.until > this.time); for (const tm of due) tm.res(); }
    }
    this.onFrame?.();
  }

  /** One view's pose and matrices for this frame: its rest added, its legs solved to where the feet go (lifted by
   *  `lift`), the chain worked down from the hips, the hair's ends sprung. */
  private solve(v: View, base: Pose, feet: Record<Side, FootGoal>, lift: Record<Side, number>): Solved {
    const rec = this.views[v];
    const pose = {} as Pose;
    for (const b of BONES) pose[b] = { ...base[b] };
    for (const [b, p] of Object.entries(REST[v] ?? {}) as [Bone, Partial<BonePose>][]) {
      const q = pose[b]; q.r += p.r ?? 0; q.x += p.x ?? 0; q.y += p.y ?? 0;
    }
    const hipsM = this.localM('hips', pose, rec);
    for (const s of ['L', 'R'] as const) this.solveLeg(s, pose, rec, hipsM, feet[s], v, lift[s]);
    const M = {} as Record<Bone, M>;
    for (const b of BONES) {
      const par = PARENT[b];
      M[b] = par ? mul(M[par], this.localM(b, pose, rec)) : this.localM(b, pose, rec);
    }
    const hp = rec.piv.hairlo;
    if (hp) {
      const hsy = pose.hairlo.sy + soft(this.hair.s, 0.05);
      M.hairlo = mul(mul(M.hair, this.localM('hairlo', pose, rec)),
        mul(tr(hp[0], hp[1]), mul([1, 0, Math.tan((pose.hairlo.kx + soft(this.hair.k, 7)) * D2R) * hsy, hsy, 0, 0], tr(-hp[0], -hp[1]))));
    }
    return { v, rec, pose, M };
  }

  /** Shown or hidden, through write()'s memory: a display set behind its back would leave it stale, and a shape it
   *  thinks is hidden would never be hidden again (after one blink both eyes, open and shut, stayed up for good). */
  private show(el: Element, on: boolean) { this.write(el, 'display', on ? 'inline' : 'none'); }

  private write(el: Element, attr: string, val: string) {
    let w = this.written.get(el);
    if (!w) { w = {}; this.written.set(el, w); }
    if (w[attr] === val) return;
    w[attr] = val;
    el.setAttribute(attr, val);
  }

  /** A bone's own transform (not its parent's): shift, then turn about its pivot. */
  private localM(b: Bone, pose: Pose, rec: ViewRec): M {
    const p = pose[b];
    const pv = rec.piv[b];
    if (!pv) return ID;
    return mul(tr(pv[0] + p.x, pv[1] + p.y), mul(rot(p.r), tr(-pv[0], -pv[1])));
  }

  // ---------------------------------------------------------------- legs
  private solveLeg(s: Side, pose: Pose, rec: ViewRec, hipsM: M, goal: FootGoal, v: View, lift = 0) {
    const leg = rec.legs[s];
    const th = pose[`thigh${s}`], sh = pose[`shin${s}`], ft = pose[`foot${s}`];
    const g0 = goal ?? this.standGoal(s, v);
    const g = lift ? { x: g0.x, y: g0.y - lift, a: g0.a } : g0;
    // into the hips' own frame (the thigh's offset moves its hip)
    const hipsR = pose.hips.r;
    const local = at(inv(hipsM), g.x, g.y);
    const H: [number, number] = [leg.H[0] + th.x, leg.H[1] + th.y];
    const tx = local[0] - H[0], ty = local[1] - H[1];
    const d0 = Math.hypot(tx, ty);
    const kd = KNEE[v];
    if (kd) {
      // two bones: the knee bends the view's way. The sheet draws the legs dead straight, which is where a plain
      // two-bone solve has no slope (the knee would flick forward on the smallest dip of the hips), so the bend comes
      // in softly over the last few units of reach (the knee's travel stays proportional to the dip), the bones give a
      // hair in length to put the foot exactly where it goes, and past full reach they stretch a little.
      // (the reach given up grows as the square of the dip, so the knee comes forward at a steady rate from straight,
      // slowing to the plain solve's rate KS units in, where y²(2 - y) meets it in value and slope; a fourth power, smooth
      // even at straight, had to straighten the knee fastest in the middle and snapped it at every heel strike)
      const Lm = leg.L1 + leg.L2, KS = 20, x = Lm - d0, y = x / KS;
      let de = x <= 0 ? Lm : x < KS ? Lm - KS * y * y * (2 - y) : d0;
      de = Math.max(de, Math.abs(leg.L1 - leg.L2) + 0.01);
      const sc = clamp(d0 / de, 0.95, 1.06);
      const A = Math.acos(clamp((leg.L1 * leg.L1 + de * de - leg.L2 * leg.L2) / (2 * leg.L1 * de), -1, 1)) / D2R;
      const dir = ang(tx, ty);
      const thA = dir - kd * A;      // (+A puts the knee towards -x)
      const kx = H[0] + leg.L1 * sc * Math.cos(thA * D2R), ky = H[1] + leg.L1 * sc * Math.sin(thA * D2R);
      const r1 = thA - ang(leg.K[0] - leg.H[0], leg.K[1] - leg.H[1]);
      const shA = ang(local[0] - kx, local[1] - ky);
      const r2 = shA - ang(leg.A[0] - leg.K[0], leg.A[1] - leg.K[1]) - r1;
      th.r = r1; sh.r = r2;
      th.sy *= sc; sh.sy *= sc;
      sh.x += (sc - 1) * (leg.K[0] - leg.H[0]); sh.y += (sc - 1) * (leg.K[1] - leg.H[1]);
      ft.x += (sc - 1) * (leg.A[0] - leg.K[0]); ft.y += (sc - 1) * (leg.A[1] - leg.K[1]);
      ft.r = g.a - hipsR - (r1 + r2);
    } else {
      // front, back and three-quarter: the leg points at its foot and gets shorter as the knee comes towards us, and
      // the knee goes out to the side as it does, so a crouch reads as knees bending, not as legs telescoping (the sheet's
      // legs are at full length at rest, so the shortening has no corner there: a little stretch past it, softly capped;
      // and the knee's way out comes in softly from straight, or the smallest dip of the hips flicked it out)
      const ex = leg.A[0] - leg.H[0], ey = leg.A[1] - leg.H[1];
      const L = Math.hypot(ex, ey);
      const q = d0 / L, k = q <= 1 ? q : 1 + 0.04 * (1 - Math.exp(-(q - 1) / 0.04));
      const x = Math.max(0, 1 - q), splay = SPLAY * L * x * x / (x + 0.02);
      // (the sheet's knee as it sits off the line from hip to ankle, carried along, plus the splay, away from his middle)
      const ux = ex / L, uy = ey / L;
      const krx = leg.K[0] - leg.H[0], kry = leg.K[1] - leg.H[1];
      const along = (krx * ux + kry * uy) * k, perp = krx * -uy + kry * ux;
      const tl = Math.max(1e-6, d0), tux = tx / tl, tuy = ty / tl, tnx = -tuy, tny = tux;
      const so = Math.sign(tnx * (s === 'L' ? -1 : 1)) || 1;
      const Kx = H[0] + tux * along + tnx * (perp + so * splay), Ky = H[1] + tuy * along + tny * (perp + so * splay);
      // (each bone points at where its end goes, and is drawn as long as that is: the shin's and the foot's pivots carried
      // with them)
      const sax = leg.A[0] - leg.K[0], say = leg.A[1] - leg.K[1];
      const s1 = Math.hypot(Kx - H[0], Ky - H[1]) / Math.hypot(krx, kry), s2 = Math.hypot(local[0] - Kx, local[1] - Ky) / Math.hypot(sax, say);
      const r1 = ang(Kx - H[0], Ky - H[1]) - ang(krx, kry);
      const r2 = ang(local[0] - Kx, local[1] - Ky) - ang(sax, say) - r1;
      th.r = r1; sh.r = r2;
      th.sy = s1; sh.sy = s2;
      sh.x = (s1 - 1) * krx; sh.y = (s1 - 1) * kry;
      ft.x = (s2 - 1) * sax; ft.y = (s2 - 1) * say;
      ft.r = g.a - hipsR - (r1 + r2);
    }
  }

  /** Where a foot stands at rest: the sheet's ankle, moved with its leg's rest offset (the side view's far leg). */
  private standGoal(s: Side, v: View) {
    const r = REST[v], leg = this.views[v].legs[s];
    return { x: leg.A[0] + (r?.[`thigh${s}`]?.x ?? 0), y: leg.A[1] + (r?.[`thigh${s}`]?.y ?? 0), a: r?.[`foot${s}`]?.r ?? 0 };
  }

  // ---------------------------------------------------------------- the elbow's cut
  private cutElbow(e: Elbow, deg: number) {
    const [ux, uy] = e.u;
    const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
    // the upper arm keeps p.u < 0 and the side of the bend's halving line nearer the shoulder; the forearm (in its own
    // turned frame) keeps p.u > 0 and its side of that same line, and stops at the wrist (the hand is under its band)
    const bx = ux * c - uy * s, by = ux * s + uy * c;          // the forearm's way, in the upper arm's frame
    const ax2 = -ux * c - uy * s, ay2 = -ux * -s + -uy * c;    // the upper arm's way (-u), in the forearm's frame: R(-deg)(-u)
    const [E0, E1] = e.E, [wx, wy, wux, wuy] = e.W;
    const up = halfPlanes(e.E, [[E0, E1, -ux, -uy], [E0, E1, -ux - bx, -uy - by]]);
    const lo = halfPlanes(e.E, [[E0, E1, ux, uy], [E0, E1, ux - ax2, uy - ay2], [wx, wy, -wux, -wuy]]);
    this.write(e.up, 'd', up);
    this.write(e.lo, 'd', lo);
  }

  // ---------------------------------------------------------------- the wrist
  /** The wrist, as the elbow is drawn: the hand turns about C, the middle of the band line's lower edge (`rel` takes the
   *  hand's units to the forearm's). On the outside of the bend a wedge of skin fills the gap between the band and the
   *  hand, its outline running from the band's corner down the band's side to C's level, round about C, and into the
   *  hand's side at the same level. On the inside the band and the hand's sides cross (X): the band is cut away below the
   *  line from C to X, and its lower line follows that cut, so the hand tucks up under a band that gives on that side.
   *  Turned about the band's middle, as it was, the hand's outer side drew in under the band's corner (a tooth) and its
   *  inner side's stump showed under the band (a heavy black crescent). Nothing is drawn while the wrist is straight. */
  private wristJoint(wj: WristJoint, rel: M) {
    const f2 = (x: number) => +x.toFixed(2), pp = (q: number[]) => `${f2(q[0]!)} ${f2(q[1]!)}`;
    const BIG = 'M-600 -1200H600V600H-600Z';
    const [cx, cy] = wj.c, [ux, uy] = wj.u, nx = -uy, ny = ux;
    // the hand's way down in the forearm's units, and how far it is turned from the forearm's (a turn's in-betweens bend
    // the two pieces apart a little too: their matrices are not a plain turn of one against the other)
    const hdx = rel[0] * ux + rel[2] * uy, hdy = rel[1] * ux + rel[3] * uy, hl = Math.hypot(hdx, hdy) || 1;
    const th = Math.atan2(ux * hdy - uy * hdx, ux * hdx + uy * hdy);
    const W = wj.wcut, nW = W.length / 2;
    const side = (q: [number, number]) => (q[0] - cx) * nx + (q[1] - cy) * ny;
    const below = (q: [number, number]) => (q[0] - cx) * ux + (q[1] - cy) * uy;
    const hInv = inv(rel);
    const toHand = (q: [number, number]) => at(hInv, q[0], q[1]);
    const ptW = (i: number): [number, number] => [W[2 * i]!, W[2 * i + 1]!];
    // where each side of the hand meets the band's lower edge (the band's corner, or inside it where the band is wider)
    const meet = (sg: number): [number, number] => {
      const want = sg * wj.wh;
      for (let i = 0; i < nW - 1; i++) {
        const a0 = side(ptW(i)), a1 = side(ptW(i + 1));
        if ((a0 - want) * (a1 - want) <= 0 && a0 !== a1) {
          const t = (want - a0) / (a1 - a0);
          return [W[2 * i]! + (W[2 * i + 2]! - W[2 * i]!) * t, W[2 * i + 1]! + (W[2 * i + 3]! - W[2 * i + 1]!) * t];
        }
      }
      return side(ptW(0)) * sg > 0 ? ptW(0) : ptW(nW - 1);
    };
    const ux2 = hdx / hl, uy2 = hdy / hl;
    const ext = wj.wo * 0.6;
    const corners = { p: meet(1), m: meet(-1) };
    const handC = { p: at(rel, corners.p[0], corners.p[1]), m: at(rel, corners.m[0], corners.m[1]) };
    // The skin between the band's lower edge and the hand's top (the same edge, carried with the hand), all the way
    // across: whatever the two pieces do to each other, nothing of the room shows between them. Under the hand's own
    // drawing (which covers it where they overlap) and under the band.
    const iS = (q: [number, number]) => { let best = 0, bd = Infinity; for (let i = 0; i < nW; i++) { const d = Math.abs(side(ptW(i)) - side(q)); if (d < bd) { bd = d; best = i; } } return best; };
    const kP = iS(corners.p), kM = iS(corners.m), step = kP > kM ? 1 : -1;
    const band: [number, number][] = [corners.m];
    for (let i = kM + step; i !== kP; i += step) band.push(ptW(i));
    band.push(corners.p);
    // Each side by where the hand's corner has gone: down from the band's (the outside of a bend, or the hand come away):
    // the outline from the band's corner to the hand's, leaving along the band's side and arriving along the hand's, so
    // it runs on round the wrist with no corner (round about C at C's level, the hand's own top corner, above that level
    // where the band's lower edge bows up, poked out past the round); up into the band (the inside): a crease where the
    // band's side and the hand's cross, the band cut away below the line from C to there and its lower line along it.
    const curveTo = (Sx: [number, number], Hx: [number, number]): [number, number][] => {
      const ch = Math.hypot(Hx[0] - Sx[0], Hx[1] - Sx[1]), hh = ch * 0.38;
      const P1: [number, number] = [Sx[0] + ux * hh, Sx[1] + uy * hh], P2: [number, number] = [Hx[0] - ux2 * hh, Hx[1] - uy2 * hh];
      const out: [number, number][] = [];
      const nA = Math.max(3, Math.ceil(ch / 0.8));
      for (let i = 0; i <= nA; i++) {
        const t = i / nA, mt = 1 - t;
        out.push([mt * mt * mt * Sx[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t * t * t * Hx[0],
          mt * mt * mt * Sx[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t * t * t * Hx[1]]);
      }
      return out;
    };
    let ink = '';
    const outlines: Record<'p' | 'm', [number, number][]> = { p: [], m: [] };
    let crease: { sg: number; X: [number, number] } | null = null;
    for (const k of ['p', 'm'] as const) {
      const sg = k === 'p' ? 1 : -1, B = corners[k], H = handC[k];
      if (below(H) > below(B) + 0.05) {
        const c = curveTo(B, H);
        outlines[k] = c;
        ink += 'M' + [[B[0] - ux * ext, B[1] - uy * ext] as [number, number], ...c, [H[0] + ux2 * ext, H[1] + uy2 * ext] as [number, number]].map((q) => pp(toHand(q))).join('L');
      } else if (!crease) {
        // where the band's side and the hand's cross (both at their mean half width there: the band line's end and the
        // hand's skin are measured on rows a little apart, and with two widths the two sides, near parallel at a small
        // bend, crossed far up the band)
        const wbi = (Math.abs(side(B)) + wj.wh) / 2;
        const Fi: [number, number] = [cx + sg * nx * wbi, cy + sg * ny * wbi];
        const H0 = at(rel, Fi[0], Fi[1]);
        const den = ux * hdy - uy * hdx;
        if (Math.abs(den) < 1e-9) continue;
        let t = ((H0[0] - Fi[0]) * hdy - (H0[1] - Fi[1]) * hdx) / den;
        const aB = below(B);
        // (never more than a third of the half width above the band's corner, past which the band would be cut deep; and
        // never above the hand's own top corner, or the band was cut away where no hand had come up to fill it, as in a
        // turn's in-betweens, which bend the two pieces apart)
        t = Math.max(t, aB - wbi / 3, below(H) + 0.5);
        if (!(t < aB - 0.05)) continue;
        crease = { sg, X: [Fi[0] + ux * t, Fi[1] + uy * t] };
      }
    }
    const skin: [number, number][] = [...band, ...outlines.p, ...band.slice().reverse().map((q) => at(rel, q[0], q[1])).slice(outlines.p.length ? 1 : 0)];
    // (the hand's top back across, then up the far side by its outline if that side is an outside one)
    if (outlines.m.length) skin.push(...outlines.m.slice().reverse());
    this.write(wj.skin, 'd', 'M' + skin.map((q) => pp(toHand(q))).join('L') + 'Z');
    this.write(wj.ink, 'd', ink);
    if (!crease || Math.abs(th) < 0.4 * D2R) { this.write(wj.clip, 'd', BIG); this.write(wj.line, 'd', ''); return; }
    const { sg, X } = crease;
    let dx = X[0] - cx, dy = X[1] - cy;
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const E: [number, number] = [X[0] + dx * (wj.wo + 1), X[1] + dy * (wj.wo + 1)];
    const R = 400;
    // keep: above the ray C-X and its run on straight out to the side (on that side), and everything on the other side of
    // the arm's middle. (Run on straight up the arm from just past X, as it was, it sliced the forearm's own side off
    // higher up, where the forearm is wider than at the wrist: a long white edge with no outline.)
    const O: [number, number] = [E[0] + sg * nx * R, E[1] + sg * ny * R];
    const keep: [number, number][] = [[cx, cy], X, E, O, [O[0] - ux * R, O[1] - uy * R], [cx - sg * nx * R - ux * R, cy - sg * ny * R - uy * R],
      [cx - sg * nx * R + ux * R, cy - sg * ny * R + uy * R], [cx + ux * R, cy + uy * R]];
    this.write(wj.clip, 'd', 'M' + keep.map(pp).join('L') + 'Z');
    // the band's lower line along the cut: from where the ray leaves the band line's lower edge to X, its lower edge on
    // the ray (the line itself sits half its width up, on the band's side)
    let K: [number, number] | null = null;
    for (let i = 0; i < nW - 1 && !K; i++) {
      const ax = W[2 * i]!, ay = W[2 * i + 1]!, bx = W[2 * i + 2]!, by = W[2 * i + 3]!;
      const rx = bx - ax, ry = by - ay, d2 = dx * ry - dy * rx;
      if (Math.abs(d2) < 1e-9) continue;
      const qx = ax - cx, qy = ay - cy;
      const tt = (qx * ry - qy * rx) / d2, ww = (qx * dy - qy * dx) / d2;
      if (tt > 0.3 && tt < L && ww >= 0 && ww <= 1) K = [cx + dx * tt, cy + dy * tt];
    }
    if (!K) K = [cx + dx * L * 0.5, cy + dy * L * 0.5];
    // (up: across the ray, towards the band)
    let ox = -dy, oy = dx;
    if (ox * -ux + oy * -uy < 0) { ox = -ox; oy = -oy; }
    const h = wj.wi / 2;
    this.write(wj.line, 'd', `M${pp([K[0] + ox * h, K[1] + oy * h])}L${pp([X[0] + ox * h + dx * h, X[1] + oy * h + dy * h])}`);
  }

  // ---------------------------------------------------------------- side on, the armpit
  /** In the shirt's drawing (`rel` takes the sleeve's drawing there): where the sleeve's underside comes out through the
   *  chest's front, the corner between them (the underside going out, the chest going down) is filled in with a curve,
   *  more the further the arm is raised: the cloth runs from the chest up into the sleeve. Nothing while the underside
   *  stays inside the chest or behind it. */
  private armpitSide(pt: SideArmpit, rel: M) {
    const [ux, uy, udx, udy, ulen] = pt.u, [y0, ymin, ymax, k0, k1, k2, k3] = pt.c;
    const U0 = at(rel, ux, uy);
    let dx = rel[0] * udx + rel[2] * udy, dy = rel[1] * udx + rel[3] * udy;
    const ml = Math.hypot(dx, dy) || 1; dx /= ml; dy /= ml;
    let d = '';
    // the chest's front: x as a cubic in y
    const chestX = (y: number) => { const t = y - y0; return k0 + t * (k1 + t * (k2 + t * k3)); };
    const chestSlope = (y: number) => { const t = y - y0; return k1 + t * (2 * k2 + t * 3 * k3); };
    // where the underside crosses it (from the sleeve's root along its underside: inside the chest, then out of it)
    const f = (a: number) => (U0[0] + a * dx) - chestX(U0[1] + a * dy);
    // (the underside heads out through the front, which is -x in the drawing)
    let a = -1;
    if (dx < -0.15 && f(0) > 0 && f(ulen) < 0) {
      let lo = 0, hi = ulen;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
      a = (lo + hi) / 2;
    }
    if (a > 0) {
      const X: [number, number] = [U0[0] + a * dx, U0[1] + a * dy];
      const sl = chestSlope(X[1]), cl = Math.hypot(sl, 1), cdx = sl / cl, cdy = 1 / cl;
      // the corner's angle: between the underside going out and the chest going down
      const wedge = Math.acos(clamp(dx * cdx + dy * cdy, -1, 1)) / D2R;
      // (it must come out along the sleeve's own underside, and through the chest's front below the shoulder)
      if (a > 2 && a < ulen - 2 && X[1] > ymin && X[1] < ymax) {
        // (shrinking to nothing towards each limit of where it may be: it went off at full size at 155 degrees)
        const lim = smooth01(-0.15, -0.35, dx) * smooth01(ymin, ymin + 5, X[1]) * smooth01(ymax, ymax - 5, X[1]) * smooth01(2, 6, a) * smooth01(ulen - 2, ulen - 7, a);
        const k = clamp((wedge - 12) / 55, 0, 1), e = Math.min(8.5 * k * k * (3 - 2 * k), a - 1, ulen - a - 5) * lim;
        if (e > 0.3) {
          // (the rounding ends on the chest's own curve, e below the corner, and leaves it along its tangent there)
          const A: [number, number] = [X[0] + dx * e, X[1] + dy * e];
          const yb = X[1] + cdy * e, B: [number, number] = [chestX(yb), yb];
          const sb = chestSlope(yb), bl = Math.hypot(sb, 1);
          // the curve's middle control: where the underside's line meets the chest's tangent at B
          const tbx = sb / bl, tby = 1 / bl, den2 = dx * tby - dy * tbx;
          let C: [number, number] = X;
          if (Math.abs(den2) > 1e-6) { const s2 = ((B[0] - A[0]) * tby - (B[1] - A[1]) * tbx) / den2; if (s2 < 0 && s2 > -3 * e) C = [A[0] + dx * s2, A[1] + dy * s2]; }
          const f2 = (x: number) => +x.toFixed(2), pp = (q: [number, number]) => `${f2(q[0])} ${f2(q[1])}`;
          // (and a little way back in, under the sleeve and the shirt, so no seam shows along either edge)
          const Ai: [number, number] = [A[0] - cdx * 2, A[1] - cdy * 2], Bi: [number, number] = [B[0] - dx * 2, B[1] - dy * 2];
          const Xi: [number, number] = [X[0] - (dx + cdx) * 2, X[1] - (dy + cdy) * 2];
          d = `M${pp(Ai)}L${pp(A)}Q${pp(C)} ${pp(B)}L${pp(Bi)}L${pp(Xi)}Z`;
        }
      }
    }
    this.write(pt.path, 'd', d);
  }

  // ---------------------------------------------------------------- the knees
  /** The knee, in the shin's own drawing: `rel` takes the thigh's drawing there. On each side of the leg the thigh's edge
   *  comes down to the knee's cut line and the shin's leaves its own; where the two lines cross decides which side that
   *  is. On the outside of a bend the two square ends open a wedge: it is filled out to a curve from the end of one edge
   *  to the start of the other, leaving each along its own line (so the knee is round, and never stands out of either
   *  edge). In the crease the two edges meet in a corner, rounded a little (the cloth folds; a sharp notch read as cut).
   *  Straight, the two edges meet end to end and nothing is drawn. */
  private kneePath(kn: Knee, rel: M) {
    let d = '';
    const f2 = (x: number) => +x.toFixed(2);
    const pt = (q: [number, number]) => `${f2(q[0])} ${f2(q[1])}`;
    for (const k of ['p', 'n'] as const) {
      const [tx, ty, tdx, tdy] = kn.t[k], [sx, sy, sdx, sdy] = kn.s[k];
      const Pt = at(rel, tx, ty);
      let dtx = rel[0] * tdx + rel[2] * tdy, dty = rel[1] * tdx + rel[3] * tdy;
      const ml = Math.hypot(dtx, dty) || 1; dtx /= ml; dty /= ml;
      const Ps: [number, number] = [sx, sy];
      const gap = Math.hypot(Ps[0] - Pt[0], Ps[1] - Pt[1]);
      // the turn between the two edges (0 straight): the thigh's edge coming down (-dt) against the shin's (ds)
      const turn = Math.acos(clamp(-dtx * sdx - dty * sdy, -1, 1));
      const den = dtx * sdy - dty * sdx;
      if (Math.abs(den) < 1e-6 || turn < 0.004) {
        if (gap > 0.05) d += `M${pt(kn.K)}L${pt(Pt)}L${pt(Ps)}Z`;
        continue;
      }
      // X = Pt + a dt = Ps + b ds
      const qx = Ps[0] - Pt[0], qy = Ps[1] - Pt[1];
      const a = (qx * sdy - qy * sdx) / den, b = (qx * dty - qy * dtx) / den;
      const X: [number, number] = [Pt[0] + a * dtx, Pt[1] + a * dty];
      if (a <= 0 && b <= 0 && -a < gap * 1.5 + 0.5 && -b < gap * 1.5 + 0.5) {
        // the outside: the wedge between the two square ends, from the knee's middle out to the curve Pt..Ps (its
        // corner the edges' crossing)
        d += `M${pt(kn.K)}L${pt(Pt)}Q${pt(X)} ${pt(Ps)}Z`;
      } else if (a >= 0 && b >= 0) {
        // the crease: a fillet in the corner, growing with the bend
        const e = Math.min(9 * Math.sin(Math.min(turn, Math.PI / 2)), a + 6, b + 6);
        if (e > 0.2) {
          const A: [number, number] = [X[0] + dtx * e, X[1] + dty * e], B: [number, number] = [X[0] + sdx * e, X[1] + sdy * e];
          d += `M${pt(A)}L${pt(X)}L${pt(B)}Q${pt(X)} ${pt(A)}Z`;
        }
      } else if (gap > 0.05) {
        d += `M${pt(kn.K)}L${pt(Pt)}L${pt(Ps)}Z`;
      }
    }
    this.write(kn.path, 'd', d);
  }

  // ---------------------------------------------------------------- the shoulders
  /** The piece of shirt between the shirt's cut (N-A) and the sleeve's (T-I): a curve from N, along the shoulder line,
   *  into the top of the sleeve wherever the arm has taken it; along the sleeve's root; from the armpit's corner of the
   *  sleeve round to the shirt's side; and back through the body. At rest it is the sheet's own shoulder. */
  private shoulderPath(sh: Shoulder, rel: M) {
    const T = at(rel, sh.T[0], sh.T[1]), I = at(rel, sh.I[0], sh.I[1]);
    const tT: [number, number] = [rel[0] * sh.tT[0] + rel[2] * sh.tT[1], rel[1] * sh.tT[0] + rel[3] * sh.tT[1]];
    const tI: [number, number] = [rel[0] * sh.tI[0] + rel[2] * sh.tI[1], rel[1] * sh.tI[0] + rel[3] * sh.tI[1]];
    const { N, A, tA } = sh;
    const inward = sh.side === 'L' ? 1 : -1;
    const dist = Math.hypot(T[0] - N[0], T[1] - N[1]);
    // (raised, the sleeve's top comes in under the neck's end of the shoulder and below it: left as fitted at rest, the
    // curve set off upwards from N, humped and dropped into the sleeve's top at a corner, a spike at the shoulder. The
    // more the arm is raised, the more the curve sets off towards T and the longer it runs in along the sleeve's top.)
    const turn = Math.abs(Math.atan2(rel[1], rel[0])) / D2R;
    const k = Math.max(0, Math.min(1, (turn - 20) / 60)), kk = k * k * (3 - 2 * k);
    const dN = dist > 1e-6 ? [(T[0] - N[0]) / dist, (T[1] - N[1]) / dist] : sh.tN;
    let tN0 = sh.tN[0] * (1 - kk) + dN[0]! * kk, tN1 = sh.tN[1] * (1 - kk) + dN[1]! * kk;
    const tl = Math.hypot(tN0, tN1) || 1; tN0 /= tl; tN1 /= tl;
    const ha = sh.a * (1 - kk) + 0.3 * kk, hb = sh.b * (1 - kk) + 0.5 * kk;
    const P = (x: number, y: number) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
    const d = `M${P(N[0], N[1])}C${P(N[0] + tN0 * ha * dist, N[1] + tN1 * ha * dist)} ${P(T[0] - tT[0] * hb * dist, T[1] - tT[1] * hb * dist)} ${P(T[0], T[1])}`
      + `L${P(T[0] + tT[0] * 3, T[1] + tT[1] * 3)}L${P(I[0] + tI[0] * 3, I[1] + tI[1] * 3)}L${P(I[0], I[1])}`
      + armpitPath(I, tI, A, tA, P, inward, 0.8 * Math.hypot(N[0] - A[0], N[1] - A[1]))
      + `L${P(A[0] + inward * 4, A[1])}L${P(N[0] + inward * 4, N[1] + 4)}Z`;
    this.write(sh.path, 'd', d);
  }

  // ---------------------------------------------------------------- the corners of a raised sleeve with no shoulder
  /** In the shirt's drawing (`rel` takes the sleeve's drawing there): where the sleeve's edge, from its hem in, first
   *  meets the shirt's outline, the corner between the two (the outline going on the way free of the sleeve, the edge
   *  going out to the hem) is filled with a curve leaving the outline along its own way and running into the edge along
   *  its own, the more the sharper the corner (nothing while the two run nearly straight on, or the edge stays outside
   *  the outline or inside it). The fill runs a little way in under both, so no seam shows along either. */
  private filletPath(fl: Fillet, rel: M, fade: number) {
    const C = fl.c, cumC = fl.cum, nC = C.length / 2, LC = cumC[nC - 1]!;
    for (const sub of fl.subs) {
      let d = '';
      const n = sub.s.length / 2;
      const S = new Float64Array(sub.s.length);
      for (let i = 0; i < n; i++) { const p = at(rel, sub.s[2 * i]!, sub.s[2 * i + 1]!); S[2 * i] = p[0]; S[2 * i + 1] = p[1]; }
      const cumS = polyCum(S), LS = cumS[n - 1]!;
      // from the hem in: the first crossing is where the edge comes out of the shirt
      let si = -1, ci = -1, ts = 0, tc = 0;
      search: for (let i = n - 2; i >= 0; i--) {
        const ax = S[2 * i]!, ay = S[2 * i + 1]!, bx = S[2 * i + 2]!, by = S[2 * i + 3]!;
        for (let j = 0; j < nC - 1; j++) {
          const cx = C[2 * j]!, cy = C[2 * j + 1]!, ex = C[2 * j + 2]!, ey = C[2 * j + 3]!;
          const rx = bx - ax, ry = by - ay, qx = ex - cx, qy = ey - cy, den = rx * qy - ry * qx;
          if (Math.abs(den) < 1e-9) continue;
          const u = ((cx - ax) * qy - (cy - ay) * qx) / den, w = ((cx - ax) * ry - (cy - ay) * rx) / den;
          if (u >= 0 && u <= 1 && w >= 0 && w <= 1) { si = i; ci = j; ts = u; tc = w; break search; }
        }
      }
      if (si >= 0 && fade > 0) {
        const sJ = cumS[si]! + ts * (cumS[si + 1]! - cumS[si]!), cJ = cumC[ci]! + tc * (cumC[ci + 1]! - cumC[ci]!);
        const J = polyAt(S, cumS, sJ);
        const dS = polyDir(S, cumS, sJ, 1), dC = polyDir(C, cumC, cJ, sub.free);
        // the corner's angle: 180 is no corner at all
        const wedge = Math.acos(clamp(dS[0] * dC[0] + dS[1] * dC[1], -1, 1)) / D2R;
        // (and it grows in from nothing as the crossing comes in from either end of the shirt's outline or the sleeve's
        // edge: the edge first crosses the outline at its very end, at a sharp angle, and the fillet came on at full size
        // there, and went off at full size where it leaves at the outline's other end)
        const k = smooth01(177, 140, wedge) * smooth01(1.5, 6, sJ) * smooth01(2, 8, LS - sJ) * smooth01(0.3, 5, cJ) * smooth01(0.3, 5, LC - cJ) * fade;
        const a = Math.min(sub.a * k, (sub.free < 0 ? cJ : LC - cJ) - 0.3), b = Math.min(sub.b * k, LS - sJ - 2);
        if (a > 0.4 && b > 0.4) {
          const cN = cJ + sub.free * a, sT = sJ + b;
          const N = polyAt(C, cumC, cN), tN = polyDir(C, cumC, cN, -sub.free as 1 | -1);
          const T = polyAt(S, cumS, sT), tT = polyDir(S, cumS, sT, 1);
          const f2 = (x: number) => +x.toFixed(2), pp = (x: number, y: number) => `${f2(x)} ${f2(y)}`;
          // (the curve: about a quarter circle's handles on each leg)
          const h1 = 0.55 * a, h2 = 0.55 * b;
          d = `M${pp(N[0], N[1])}C${pp(N[0] + tN[0] * h1, N[1] + tN[1] * h1)} ${pp(T[0] - tT[0] * h2, T[1] - tT[1] * h2)} ${pp(T[0], T[1])}`;
          // back in under the sleeve's edge to the corner, and under the shirt's outline to the start
          const IN = 1.4;
          const under = (P: Float64Array, cum: Float64Array, s0: number, s1: number, side: number) => {
            const steps = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 2.5));
            for (let q = 0; q <= steps; q++) {
              const s = s0 + (s1 - s0) * (q / steps), p = polyAt(P, cum, s), t = polyDir(P, cum, s, 1);
              d += `L${pp(p[0] - t[1] * side * IN, p[1] + t[0] * side * IN)}`;
            }
          };
          under(S, cumS, sT, sJ, sub.inS);
          under(C, cumC, cJ, cN, sub.inC);
          d += 'Z';
          void J;
        }
      }
      this.write(sub.path, 'd', d);
    }
  }

  // ---------------------------------------------------------------- the arms' follow-through
  /** Each forearm is a spring behind its upper arm, and each hand behind its forearm: when the arm swings, the forearm
   *  trails and catches up, and overshoots a little when the arm stops (the hand more so). Worked in the view's own
   *  turns, on top of whatever the moves asked for. The side view's elbow never bends backwards. */
  private springArms(dt: number, pose: Pose, v: View, mir: number, applyOnly = false) {
    // (kept by his side and worked in each arm's own "out": a move's arm angle is the same number in every drawing, so a
    // turn's change of drawing never jolts the springs; keyed by the page's letter, the two arms swapped springs there)
    for (const s of ['L', 'R'] as const) {
      const st = this.springs[bodyOf(v, mir, s)], o = ARM_OUT[v][s];
      if (!applyOnly) {
        const thU = o * (pose.hips.r + pose.spine.r + pose[`arm${s}`].r);
        if (dt > 0 && st.u !== null) {
          const vu = (thU - st.u) / dt, au = clamp((vu - st.vu) / dt, -30000, 30000);
          st.vu = vu;
          const thF0 = thU + o * pose[`fore${s}`].r;
          const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
          for (let i = 0; i < n; i++) {
            st.wf += (-158 * st.pf - 12.6 * st.wf - 0.55 * au) * h; st.pf += st.wf * h;
          }
          st.pf = clamp(st.pf, -36, 36);
          const thF = thF0 + st.pf;
          if (st.f !== null) {
            const vf = (thF - st.f) / dt, af = clamp((vf - st.vf) / dt, -40000, 40000);
            st.vf = vf;
            for (let i = 0; i < n; i++) {
              st.wh += (-355 * st.ph - 17 * st.wh - 0.8 * af) * h; st.ph += st.wh * h;
            }
            st.ph = clamp(st.ph, -60, 60);
          }
          st.f = thF;
        } else if (dt > 0 || st.u === null) {
          st.vu = 0; st.vf = 0; st.f = thU + o * pose[`fore${s}`].r;
        }
        if (dt > 0 || st.u === null) st.u = thU;
      }
      const fore = pose[`fore${s}`], hand = pose[`hand${s}`];
      fore.r += o * soft(st.pf, 18);
      hand.r += o * soft(st.ph, 30);
      // side-on the elbow cannot bend backwards: it eases into its stop
      if (v === 'side') { const os = ARM_OUT.side[s]; fore.r = os * softFloor(os * fore.r, -2, 1.5); }
      hand.r = soft(hand.r, 45);
    }
  }

  // ---------------------------------------------------------------- the hair's spring
  /** The hair's ends: driven by the head's place (hx, hy, room units) and turn (degrees, the room's way) frame to frame. */
  private springHair(dt: number, hx: number, hy: number, ha: number, mirror: number, turnAx = 0) {
    // (a still frame changes nothing: a step of 0 used to forget the head's speed, and the next frame read that as a jolt)
    if (!this.headPrev) { this.headPrev = { x: hx, y: hy, vx: 0, vy: 0, a: ha, va: 0 }; return; }
    if (dt <= 0) return;
    const p = this.headPrev;
    // (moved far in one frame, he was put somewhere, not thrown: no kick to the hair)
    if (Math.hypot(hx - p.x, hy - p.y) > 120) { this.headPrev = { x: hx, y: hy, vx: 0, vy: 0, a: ha, va: 0 }; return; }
    const vx = (hx - p.x) / dt, vy = (hy - p.y) / dt, va = (ha - p.a) / dt;
    const ax = clamp((vx - p.vx) / dt + turnAx, -9000, 9000), ay = clamp((vy - p.vy) / dt, -9000, 9000), aa = clamp((va - p.va) / dt, -40000, 40000);
    this.headPrev = { x: hx, y: hy, vx, vy, a: ha, va };
    const h = this.hair;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      // skew: about 1.7 Hz, lightly damped; pushed by the head's sideways acceleration and its turning
      const fk = -105 * h.k - 4.2 * h.kv - 0.5 * ax * mirror - 0.12 * aa * mirror;
      h.kv += fk * sdt; h.k += h.kv * sdt;
      // stretch: the hair drops when the head is thrown up and squashes when it lands
      const fs = -150 * h.s - 7 * h.sv - 0.0008 * ay;
      h.sv += fs * sdt; h.s += h.sv * sdt;
    }
    // (only the hair below the chin moves: over the shoulders, the neck and the shirt, all whole under it)
    // (the spring itself is kept within twice its reach; what is drawn is eased into the reach, never stopped dead at it)
    h.k = clamp(h.k, -14, 14); h.s = clamp(h.s, -0.1, 0.1);
  }

  // ---------------------------------------------------------------- fidgets
  /** how much of the fidget is on this frame (set by fidgetState) */
  private fidW = 0;
  /** Once a frame: start a fidget when he has stood idle long enough, end it, or cut it short for a move or a turn. */
  private fidgetState() {
    const t = this.time;
    const busy = this.running.some((r) => (r.a.layer ?? 'body') !== 'face') || !!this.turn || this.queuedTurns > 0;
    const allowed = this.fidgets && this.alive && !(this.idlePeriod && this.idlePeriod > 0);
    let f = this.fid;
    if (f) {
      if (!f.cut && (busy || !allowed)) f.cut = t;
      if ((f.cut && t - f.cut >= XFADE) || t - f.t0 >= f.len) { this.fid = f = null; this.nextFidget = t + 6 + this.rand() * 6; }
    }
    if (!f && (busy || !allowed)) this.nextFidget = Math.max(this.nextFidget, t + 4);
    else if (!f && t >= this.nextFidget) {
      const r = this.rand();
      const kind = r < 0.32 ? 0 : r < 0.56 ? (this.gaze ? 0 : 1) : r < 0.76 ? 2 : 3;
      this.fid = f = { kind, t0: t, len: [3.4, 1.9, 2.1, 4.6][kind]! + this.rand() * 0.8, cut: 0, side: this.rand() < 0.5 ? -1 : 1 };
    }
    if (!f) { this.fidW = 0; return; }
    const lt = (f.cut || t) - f.t0;
    this.fidW = smooth01(0, 0.6, lt) * (1 - smooth01(f.len - 0.7, f.len, lt)) * (f.cut ? 1 - smooth01(0, XFADE, t - f.cut) : 1);
  }
  /** The fidget's pose added to the idle's in one drawing (and its face, for the drawing the body is in); returns its turn
   *  of the head. */
  private fidget(pose: Pose, face: Face | null, v: View, mir: 1 | -1, ln: { side: number; quarter: number; fwd: number; right: number }): number {
    const f = this.fid!, w = this.fidW;
    if (w <= 0) return 0;
    const lt = (f.cut || this.time) - f.t0, ls = ln.side, lq = ln.quarter, lf = Math.max(0, 1 - ls - lq);
    // (which way his own right is on the page in this drawing: a weight shift goes to the same side of him in every one)
    const dirR = (v === 'side' ? 0 : 1) * (letterOf(v, mir, 'r') === 'R' ? -1 : 1);
    const S = f.side * (dirR || 1);
    const toUsEyes = lf - lq + ls;
    let turn = 0;
    if (f.kind === 0) {
      // the weight onto one foot: the hips out to that side, the shoulders the other way, the head tipped; side on he
      // rocks back onto his heels
      pose.hips.x += 6 * S * w * (1 - ls); pose.hips.r += 1.5 * S * w * (1 - ls);
      pose.spine.r += (-2.2 * S * (1 - ls) - 1.8 * ln.fwd * ls) * w; pose.head.r += (2 * S * (1 - ls) + 1.2 * ln.fwd * ls) * w;
      pose.hips.y += 1.5 * w;
    } else if (f.kind === 1) {
      // he looks at us: the chin up a touch, the eyes on us, a slow blink, side and three-quarter on the head comes round
      pose.head.y += -1.5 * w; pose.neck.y += -0.5 * w;
      turn = -7 * w * (ls + lq) * ln.right;
      if (face) {
        face.lookX = toUsEyes * 0.5 * w + face.lookX * (1 - w); face.lookY *= 1 - w;
        const u = (lt - 0.9) / 0.32;
        face.lid += (u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0) - 0.08 * w;
      }
    } else if (f.kind === 2) {
      // a small sigh: up, then down past rest, then back
      const rise = Math.sin(Math.PI * clamp(lt / 0.7, 0, 1)), fall = Math.sin(Math.PI * clamp((lt - 0.6) / 1.1, 0, 1));
      pose.spine.y += (-4 * rise + 2 * fall) * w;
      pose.armL.y += (-5 * rise + 2.5 * fall) * w; pose.armR.y += (-5 * rise + 2.5 * fall) * w;
      pose.head.y += (-1.5 * rise + 2.5 * fall) * w; pose.hips.y += 2 * fall * w;
      if (face) { face.lid += 0.35 * fall * w; if (lt > 0.65 && lt < 1.15 && w > 0.5) face.mouth = 'sigh'; }
    } else {
      // arms folded for a few seconds (side on, where folded arms stuck out in front like a box held, the hands behind his
      // back: the elbows out behind, the hands at the small of his back), the weight on one foot, a finger drumming
      for (const s of ['L', 'R'] as const) {
        const o = ARM_OUT[v][s], near = s === (v === 'quarter' || v === 'side' ? 'L' : 'R');
        const up = lerp(lerp(13, 11, lq), near ? -46 : -32, ls), fore = lerp(lerp(-118, -112, lq), near ? 66 : 48, ls);
        pose[`arm${s}`].r += o * up * w; pose[`fore${s}`].r += o * fore * w; pose[`arm${s}`].y += -1.5 * w;
      }
      const tap = lt > 2 && lt < 3 ? Math.sin((lt - 2) * 2 * Math.PI * 3.2) * Math.sin(Math.PI * (lt - 2)) : 0;
      pose.handR.r += 6 * tap * w;
      pose.hips.x += 3 * S * w * (1 - ls); pose.head.r += 1.5 * S * w * (1 - ls);
      if (face) face.lid += 0.25 * w;
    }
    return turn;
  }

  // ---------------------------------------------------------------- the face
  /** The face's clock, once a frame: blinks, glances and where the pupils have got to. */
  private faceState(dt: number, f: Face) {
    const t = this.time;
    // blinks (in an idle loop, one a loop at the same moment of it)
    const P = this.idlePeriod && this.idlePeriod > 0 ? this.idlePeriod : 0;
    let fresh = false;
    if (P) {
      // (started exactly at its moment of the loop, however the frames fall)
      const n = Math.floor((t - 0.55 * P) / P), was = Math.floor((t - dt - 0.55 * P) / P);
      if (this.alive && dt > 0 && n > was && this.blinkT < 0) { this.blinkT = t - (n * P + 0.55 * P); fresh = true; }
    } else if (this.alive && this.blinkT < 0 && t >= this.nextBlink) { this.blinkT = 0; }
    let bl = 0;
    if (this.blinkT >= 0) {
      if (!fresh) this.blinkT += dt;
      // (shut quickly, opened a little slower, both eased: a blink in straight lines snaps at its ends)
      const B = 0.17, SH = 0.065;
      bl = this.blinkT < SH ? smooth01(0, SH, this.blinkT) : 1 - smooth01(SH, B, this.blinkT);
      if (this.blinkT >= B) { this.blinkT = -1; bl = 0; this.nextBlink = t + 1.8 + this.rand() * 4.5 + (this.rand() < 0.15 ? -1.4 : 0); }
    }
    // where he looks: the pointer, or now and then a glance of his own
    let gx = f.lookX, gy = f.lookY;
    if (this.gaze) { gx += this.gaze.x; gy += this.gaze.y; }
    else if (this.alive && !P && !(this.fid && this.fid.kind === 1)) {
      if (t >= this.glance.next) {
        const away = this.rand() < 0.6;
        this.glance = { x: away ? (this.rand() * 2 - 1) * 0.9 : 0, y: away ? (this.rand() * 1.4 - 0.5) * 0.7 : 0, until: t + 0.5 + this.rand() * 1.6, next: t + 2.5 + this.rand() * 4 };
      }
      if (t < this.glance.until) { gx += this.glance.x; gy += this.glance.y; }
    }
    gx = clamp(gx, -1, 1); gy = clamp(gy, -1, 1);
    // saccades: the pupils snap most of the way, then settle
    const kk = 1 - Math.exp(-dt * 26);
    this.look.x += (gx - this.look.x) * kk; this.look.y += (gy - this.look.y) * kk;
    // the lids and the squint ease to where the mood and the moves want them (a change of mood moved them in one frame)
    const kl = 1 - Math.exp(-dt * 24);
    this.lids.L += (f.lid + f.lidL - this.lids.L) * kl; this.lids.R += (f.lid + f.lidR - this.lids.R) * kl;
    this.lids.sq += (f.squint - this.lids.sq) * kl;
    return { bl };
  }
  /** The face drawn into one view (a turn may show two at once). */
  private faceDraw(f: Face, rec: ViewRec, mirror: number, bl: number, mo: MorphNow | null = null) {
    const lx = this.look.x * mirror, ly = this.look.y;
    for (const e of rec.eyes) {
      // (bent with the head towards the swap: its points carried, the pupil with them)
      const md = mo?.prep.eyes.get(e), mk = md ? mo!.c1 : 0, md2 = md ? mo!.prep2?.eyes.get(e) : undefined, mk2 = md2 ? mo!.c2 : 0;
      const mv = (p: [number, number], i: number): [number, number] => (md ? [p[0] + mk * md[2 * i]! + mk2 * (md2?.[2 * i] ?? 0), p[1] + mk * md[2 * i + 1]! + mk2 * (md2?.[2 * i + 1] ?? 0)] : p);
      // (an eye going round behind the nose, which the turn's in-between shrinks towards its inner corner, squints shut as
      // it narrows and is gone once it is a sliver: faded instead, it was a grey ghost of an eye beside the nose)
      const L0 = mv(e.L, 0), R0 = mv(e.R, 1);
      const ratio = Math.hypot(R0[0] - L0[0], R0[1] - L0[1]) / (Math.hypot(e.R[0] - e.L[0], e.R[1] - e.L[1]) || 1);
      const going = ratio < 0.97;
      this.show(e.el, ratio >= 0.42);
      if (ratio < 0.42) continue;
      let k = clamp(Math.max(e.side === 'L' ? this.lids.L : this.lids.R, bl), -0.7, 1);
      // (shut, the eye is drawn by its own bent lens, not the drawing's closed line, which is not bent with it)
      if (going) k = Math.min(0.92, Math.max(k, 0.9 * smooth01(0.85, 0.45, ratio)));
      // (the open eye's top contour stays while a lid is down: the lid line drops inside it; shut, the eye is its
      // closed line alone, or it read as an empty almond, eyes rolled up, for the frames of a blink it is shut)
      if (e.fold) this.show(e.fold, k > 0.02);
      if (k > 0.93) {
        this.show(e.open, false); this.show(e.closed, true);
        continue;
      }
      this.show(e.open, true); this.show(e.closed, false);
      const L = mv(e.L, 0), R = mv(e.R, 1), cu = mv(e.cu, 2), cl = mv(e.cl, 3), cc = mv(e.cc, 4);
      const pdx = md ? mk * md[10]! + mk2 * (md2?.[10] ?? 0) : 0, pdy = md ? mk * md[11]! + mk2 * (md2?.[11] ?? 0) : 0;
      // the upper lid: from the sheet's (k 0) to shut (k 1), above the sheet's when wide; the lower one up for a squint
      const c = k >= 0 ? [lerp(cu[0], cc[0], k), lerp(cu[1], cc[1], k)] : [cu[0] + (cu[0] - cc[0]) * -k * 0.55, cu[1] + (cu[1] - cc[1]) * -k * 0.55];
      const mid: [number, number] = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
      const sq = clamp(this.lids.sq, 0, 1) * 0.6;
      const l = [lerp(cl[0], mid[0], sq), lerp(cl[1], mid[1], sq)];
      const P = (p: number[]) => `${+p[0]!.toFixed(2)} ${+p[1]!.toFixed(2)}`;
      const upper = `M${P(L)}Q${P(c)} ${P(R)}`, lower = `M${P(R)}Q${P(l)} ${P(L)}`;
      const lens = `${upper}Q${P(l)} ${P(L)}Z`;
      this.write(e.white, 'd', lens); this.write(e.clip, 'd', lens);
      this.write(e.lid, 'd', upper); this.write(e.lower, 'd', lower);
      const rx = (R[0] - L[0]) / 2;
      this.write(e.pupil, 'transform', `translate(${+(pdx + lx * rx * 0.62).toFixed(2)} ${+(pdy + ly * 2.2 + Math.max(0, k) * 1.4).toFixed(2)})`);
    }
    // the mouth
    const want: Mouth = f.mouth === 'talk' && !rec.talk ? 'open' : f.mouth;
    for (const [m, el] of rec.mouths) this.show(el, m === want);
    if (want === 'talk' && rec.talk) {
      // (wider and flatter than the drawing's round "o", and its width changing from syllable to syllable: a round mouth
      // opening and shutting read as a fish)
      let base = this.talkRx.get(rec.talk);
      if (base === undefined) { base = +(rec.talk.getAttribute('rx') ?? 3); this.talkRx.set(rec.talk, base); }
      const o = clamp(f.talk, 0, 1), w = clamp(f.talkW, 0, 1);
      // (shut, it is a line as wide as his drawn mouth; open, from round to wide and flat by the syllable)
      this.write(rec.talk, 'ry', String(+(0.45 + 2.6 * o * (1 - 0.35 * w)).toFixed(2)));
      this.write(rec.talk, 'rx', String(+(base * (1.75 + 1.1 * w - 0.25 * o * (1 - w))).toFixed(2)));
    }
  }
}

/** The affine map that best takes points (x, y pairs) to themselves plus d (least squares), and how far off it is at
 *  worst; null for fewer than one point. Points all on a line get the plain shift. */
function fitAffine(p: Float64Array, d: Float64Array): { M: M; res: number } | null {
  const n = p.length / 2;
  if (n < 1) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, tx = 0, ty = 0, txx = 0, txy = 0, tyx = 0, tyy = 0;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i]!, y = p[i + 1]!, X = x + d[i]!, Y = y + d[i + 1]!;
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; tx += X; ty += Y; txx += X * x; txy += X * y; tyx += Y * x; tyy += Y * y;
  }
  // solve [sxx sxy sx; sxy syy sy; sx sy n] [a c e]ᵀ = [txx txy tx]ᵀ (and the same for y)
  const det3 = (a: number[]) => a[0]! * (a[4]! * a[8]! - a[5]! * a[7]!) - a[1]! * (a[3]! * a[8]! - a[5]! * a[6]!) + a[2]! * (a[3]! * a[7]! - a[4]! * a[6]!);
  const Mx = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n];
  const D = det3(Mx);
  let M_: M;
  const scale = Math.max(1, sxx + syy);
  if (Math.abs(D) < 1e-9 * scale * scale * n) {
    M_ = [1, 0, 0, 1, (tx - sx) / n, (ty - sy) / n];
  } else {
    const solve = (r: number[]) => [0, 1, 2].map((c) => { const m = Mx.slice(); for (let k = 0; k < 3; k++) m[k * 3 + c] = r[k]!; return det3(m) / D; });
    const [a, c, e] = solve([txx, txy, tx]), [b, d2, f] = solve([tyx, tyy, ty]);
    M_ = [a!, b!, c!, d2!, e!, f!];
  }
  let res = 0;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i]!, y = p[i + 1]!;
    const ex = M_[0] * x + M_[2] * y + M_[4] - (x + d[i]!), ey = M_[1] * x + M_[3] * y + M_[5] - (y + d[i + 1]!);
    const r = Math.hypot(ex, ey); if (r > res) res = r;
  }
  return { M: M_, res };
}

/** A polyline (x y pairs): the length along it at each point; the point at a length along it; its way there (dir 1:
 *  on along it, -1 back), each clamped to its ends. */
/** A knee's edges as bent this frame (see MorphPrep.knees). */
function bentKnee(kn: Knee, mo: MorphNow): Knee {
  const d = mo.prep.knees.get(kn);
  if (!d) return kn;
  const d2 = mo.prep2?.knees.get(kn) ?? null, c1 = mo.c1, c2 = d2 ? mo.c2 : 0;
  const P = (i: number, x: number, y: number): [number, number] => [x + c1 * d[2 * i]! + c2 * (d2?.[2 * i] ?? 0), y + c1 * d[2 * i + 1]! + c2 * (d2?.[2 * i + 1] ?? 0)];
  const line = (i: number, e: EdgeLine): EdgeLine => {
    const a = P(i, e[0], e[1]), b = P(i + 1, e[0] + e[2], e[1] + e[3]);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [a[0], a[1], (b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  return { ...kn, t: { p: line(0, kn.t.p), n: line(2, kn.t.n) }, s: { p: line(4, kn.s.p), n: line(6, kn.s.n) }, K: P(8, kn.K[0], kn.K[1]) };
}

function polyCum(P: Float64Array): Float64Array {
  const n = P.length / 2, c = new Float64Array(n);
  for (let i = 1; i < n; i++) c[i] = c[i - 1]! + Math.hypot(P[2 * i]! - P[2 * i - 2]!, P[2 * i + 1]! - P[2 * i - 1]!);
  return c;
}
function polySeg(cum: Float64Array, s: number): number {
  const n = cum.length;
  if (s <= 0) return 0;
  if (s >= cum[n - 1]!) return n - 2;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= s) lo = m; else hi = m; }
  return lo;
}
function polyAt(P: Float64Array, cum: Float64Array, s: number): [number, number] {
  const i = polySeg(cum, s), l = cum[i + 1]! - cum[i]!, k = l > 1e-9 ? clamp((s - cum[i]!) / l, 0, 1) : 0;
  return [P[2 * i]! + (P[2 * i + 2]! - P[2 * i]!) * k, P[2 * i + 1]! + (P[2 * i + 3]! - P[2 * i + 1]!) * k];
}
function polyDir(P: Float64Array, cum: Float64Array, s: number, dir: 1 | -1): [number, number] {
  const i = polySeg(cum, s), x = (P[2 * i + 2]! - P[2 * i]!) * dir, y = (P[2 * i + 3]! - P[2 * i + 1]!) * dir, l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** A shoulder bent along the turn's curve (see MorphNow): c1 of the way to its shape at the swap ahead, c2 of the way
 *  to its shape at the swap behind (points straight, directions turned). */
function bendShoulder(a: Shoulder, b: Shoulder, z: Shoulder, c1: number, c2: number): Shoulder {
  const P = (p: [number, number], q: [number, number], r: [number, number]): [number, number] => [p[0] + (q[0] - p[0]) * c1 + (r[0] - p[0]) * c2, p[1] + (q[1] - p[1]) * c1 + (r[1] - p[1]) * c2];
  const Dv = (p: [number, number], q: [number, number], r: [number, number]): [number, number] => { const v = P(p, q, r), l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  return { ...a, N: P(a.N, b.N, z.N), tN: Dv(a.tN, b.tN, z.tN), T: P(a.T, b.T, z.T), tT: Dv(a.tT, b.tT, z.tT), I: P(a.I, b.I, z.I), tI: Dv(a.tI, b.tI, z.tI), A: P(a.A, b.A, z.A), tA: Dv(a.tA, b.tA, z.tA) };
}
/** A shoulder part way from as drawn to its shape at a swap (points straight, directions turned). */
function lerpShoulder(a: Shoulder, b: Shoulder, k: number): Shoulder {
  const P = (p: [number, number], q: [number, number]): [number, number] => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const Dv = (p: [number, number], q: [number, number]): [number, number] => { const x = p[0] + (q[0] - p[0]) * k, y = p[1] + (q[1] - p[1]) * k, l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  return { ...a, N: P(a.N, b.N), tN: Dv(a.tN, b.tN), T: P(a.T, b.T), tT: Dv(a.tT, b.tT), I: P(a.I, b.I), tI: Dv(a.tI, b.tI), A: P(a.A, b.A), tA: Dv(a.tA, b.tA) };
}

/** The armpit, from the sleeve's underside corner I to the shirt's side at A: both edges run on (up the side against
 *  tA, back along the underside against tT) until they meet, and the corner is rounded a little; where they would meet
 *  far up (the arm close to the body), the side runs up at most 10 and the underside comes straight to it. (emonad.py's
 *  armpit() is the same.) */
function armpitPath(I: [number, number], tT: [number, number], A: readonly number[], tA: readonly number[], P: (x: number, y: number) => string, inward = 0, reach = 10) {
  // (the corner is rounded the more the arm is raised: hanging, the sleeve lies along the side and the armpit is a
  // crease; raised, the shirt's fabric runs from the side up into the sleeve in a curve, not a corner. The angle between
  // the side, going up, and the underside, going out, is about 10 degrees hanging and 90 or more raised.)
  const cosA = tA[0]! * tT[0] + tA[1]! * tT[1];      // (at the corner: down the side, and out along the underside)
  const open = Math.acos(Math.max(-1, Math.min(1, cosA))) / D2R;
  // The corner is where the shirt's side and the sleeve's underside meet. Hanging they hardly meet (nearly parallel,
  // or meeting far down) and the corner sits 10 up the side from A. Raised, they meet higher up the side the less the
  // arm is raised; held to 10 there, a flat web of shirt hung from the sleeve's underside across to the side (at 40
  // degrees, 17 units of it). So the cap rises with the arm, from 10 at 20 degrees open to `reach` (most of the way up
  // the shoulder's cut) at 50: the corner follows the real meeting point, and where the two lines first meet (far up,
  // the arm barely raised) it is still held at 10, so it never jumps.
  const kc = Math.max(0, Math.min(1, (open - 20) / 30)), cap = 10 + (Math.max(10, reach) - 10) * kc * kc * (3 - 2 * kc);
  const det = -tA[0]! * tT[1] + tA[1]! * tT[0];
  let s = 10;
  if (Math.abs(det) > 1e-6) {
    const rx = I[0] - A[0]!, ry = I[1] - A[1]!;
    const ss = (rx * tT[1] - ry * tT[0]) / det;
    // (they may meet below A, on the shirt's side further down; far below, the arm hardly raised and the two lines
    // nearly parallel, the corner is held 10 up the side. Eased between the two over 20 units of where they meet: picked
    // by a threshold, the corner jumped 24 units as the arm passed 40 degrees. And never dropped back to 10 once the arm
    // is raised high, where the lines meet inside the sleeve: it did at 135 degrees, another jump, and below it the piece
    // hung a wedge of shirt from the sleeve down the side, a bat-wing sleeve.)
    s = Math.min(cap, 10 + (ss - 10) * smooth01(-26, -6, ss));
  }
  const X = [A[0]! - tA[0]! * s, A[1]! - tA[1]! * s];
  const li = Math.hypot(X[0]! - I[0], X[1]! - I[1]), la = Math.hypot(X[0]! - A[0]!, X[1]! - A[1]!);
  const k = Math.max(0, Math.min(1, (open - 25) / 75)), kk = k * k * (3 - 2 * k);
  const rr = 3 + 9 * kk;
  // (the rounding may run on past A down the shirt's side, which is the shirt's own edge: capped by A alone, a raised
  // arm whose edges meet just above A kept a square armpit)
  // (and on past I out along the sleeve's underside, which this piece meets there each frame wherever the arm is)
  const r = Math.min(rr, Math.max(0, s) + 10, Math.max(0.45 * li, rr * 0.999));
  // (the rounding sets off from the corner along the sleeve's underside, outwards: the way from the corner to I is the
  // same while I is out past the corner, but when the two nearly meet it swings about, and it points back in once the
  // corner is out past I, a hook at the armpit's apex)
  const ui = [tT[0], tT[1]];
  const p1 = [X[0]! + ui[0]! * r, X[1]! + ui[1]! * r];
  const p2 = [X[0]! + tA[0]! * r, X[1]! + tA[1]! * r];
  void la;
  // (and from the rounding's end on the side, straight in under the shirt before going back up: the side is the
  // shirt's own edge, which is not quite straight, and along it a hairline of background showed between the two)
  // (but only below A, where the shirt's side is: above it the shirt is cut away along N-A, and stepping in there left
  // the side open, a tick of background between the cut and the piece. Where the rounding ends above A the piece runs
  // straight down the side to A, which is its own edge there.)
  if (s - r > 0) return `L${P(p1[0]!, p1[1]!)}Q${P(X[0]!, X[1]!)} ${P(p2[0]!, p2[1]!)}L${P(A[0]!, A[1]!)}`;
  return `L${P(p1[0]!, p1[1]!)}Q${P(X[0]!, X[1]!)} ${P(p2[0]!, p2[1]!)}L${P(p2[0]! + inward * 4, p2[1]!)}L${P(A[0]! + inward * 4, A[1]!)}L${P(A[0]!, A[1]!)}`;
}

/** A big square about point E cut by half-planes (each [px, py, nx, ny]: kept where (p - (px, py)).n >= 0), as a path. */
function halfPlanes(E: [number, number], planes: [number, number, number, number][]): string {
  const R = 420;
  let poly: [number, number][] = [[E[0] - R, E[1] - R], [E[0] + R, E[1] - R], [E[0] + R, E[1] + R], [E[0] - R, E[1] + R]];
  for (const [px, py, nx, ny] of planes) {
    if (Math.abs(nx) + Math.abs(ny) < 1e-9) continue;
    const out: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const da = (a[0] - px) * nx + (a[1] - py) * ny, db = (b[0] - px) * nx + (b[1] - py) * ny;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    poly = out;
  }
  return 'M' + poly.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join('L') + 'Z';
}
