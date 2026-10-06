/**
 * The director owns the room: where the cat stands, which props exist, and the
 * choreography of every action (feed, wash, play, poop, clean, sleep, wake, pet).
 * Sequences are promise chains over the rig's additive animations plus a few
 * imperative prop elements, so every action flows out of the last one without
 * a snap. Actions queue; the cat wanders on its own when nothing is queued.
 */
import { cue, type CueOpts, type Stop } from '../sound/cue';
import type { PetRig, Dir, Costume } from '../pet/rig';
import { ASPECT, PROPS, loadEmoProps, loadStuntProps, type PropName } from './props';
import { CAT_PAD, petBox, WALK_MAX, WALK_MIN, WORLD } from './world';

export type Layers = { back: HTMLElement; front: HTMLElement; cat: HTMLElement };
export type DirectorState = {
  x: number; dir: Dir; busy: string | null; poop: boolean; sleeping: boolean; inTub: boolean; dead: boolean;
  /** actions asked for and waiting their turn (idle wandering is not counted): the page's buttons stay off meanwhile */
  queued: number;
};
/** What the director does on its own between actions. An action asked for while one plays waits for it (a second or
 *  two) instead of being refused, so the page's buttons never go dead while the pet potters about. */
const IDLE: ReadonlySet<string> = new Set(['wander', 'rumble']);
const SILENT: Stop = () => {};
export type ActionName = 'feed' | 'wash' | 'play' | 'poop' | 'clean' | 'sleep' | 'wake' | 'pet' | 'walk' | 'wander' | 'rumble' | 'tour' | 'die' | 'revive'
  | 'screenshot' | 'slap' | 'squeeze' | 'burn'
  | 'tung'
  | 'kapparot'
  | 'show';   // a character's own move, played from its lab (registerOwnWays)

/**
 * A character that still lives in its lab brings its own ways, from a module only that lab imports (registerOwnWays):
 * whole actions it does its own way, and the numbers the shared actions need for it (how far from the dreidel it stands,
 * where the hen circles over its head, where the falcon perches...). `make` runs once per director, with the director
 * (its working parts are director.kit()). Nothing on the site registers any; the labs that do exist only in dev builds.
 */
export type OwnWays = {
  feed?(): Promise<void>;
  /** the ball of yarn (the dreidel and the darbuka stay the shared ones, with `tune`) */
  play?(): Promise<void>;
  /** the happy bounce the shared actions end on (the cat hops, the seal flaps) */
  cheer?(): Promise<void>;
  tune?: {
    /** the head's middle in the drawing's own units (svg), where hearts and sparkles come from */
    head?: [number, number];
    poopX?: number; graveX?: number; tubJump?: number;
    /** in the tub, the pet is cut off at the tub's bottom edge (long legs showed between its feet: Sahur's rule) */
    tubClip?: boolean;
    /** where the poop comes out, in svg units, while he squats: it is born there and drops to the floor in front of him
     *  (instead of sliding out from behind) */
    poopFrom?: [number, number];
    /** the same, for a pet seen from the front whose seat is BEHIND him: born small there, it drops to the floor behind
     *  him, between his feet (seen through the gap between his legs as he squats), and is left there when he hops away */
    poopBehind?: [number, number];
    dreidel?: { w: number; reach: number; dir?: Dir };
    darbuka?: { w: number; reach: number; dir?: Dir };
    kapparot?: { top: number; cx: number; rx: number; henW?: number };
    /** `perch`: the exact spot it lands on, a point in a named group's own units (no search: for a perch the search cannot
     *  see, or one that must be a group drawn in front of the pet); `turn`: it lands facing the pet and turns away before it
     *  leaves (as on the frok's arm) */
    falcon?: { w?: number; at?: [number, number]; reach?: number; onto?: [number, number]; minX?: number; from?: Dir; perch?: { host: string; at: [number, number] }; turn?: boolean };
    /** the guitar: where it is drawn while held and how big (GUITAR's row for a character that brings its own) */
    guitar?: { host: string; before?: string; front?: string[]; w: number; rot?: number; flip?: boolean; side?: Dir; screenLift?: boolean };
    /** where its silhouette ends left and right in its own drawing, view-box units (petSpan's SPAN row) */
    span?: [number, number];
  };
};
const OWN_WAYS: Partial<Record<PetRig['character'], (d: Director) => OwnWays>> = {};
export function registerOwnWays(character: PetRig['character'], make: (d: Director) => OwnWays) { OWN_WAYS[character] = make; }

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
/** The centre of the camera drawn at the frog's sleeve, in svg units, in the catch pose (rig.catchPose). Measured off the rig. */
const CAMERA_CATCH = { x: 128, y: 121 };
const TUB_W = 320;
/** The dreidel's drawing (dreidelprops.py): its box, where its point is when it stands, where a fallen one's body lies
 *  from that point, how long it lies (for room). */
const DREIDEL = { box: [180, 104], tip: [90, 100], land: 31.5, lying: 60, frames: 16 } as const;
/** How wide it is drawn in the room. The cat's is smaller: her shoulder is only a little above a big one's knob, and a
 *  paw raised to it stuck straight out across her chest; at 108 it sits where her paw reaches out and down onto it. */
const DREIDEL_W: Record<'cat' | 'frog' | 'sahur' | 'seal', number> = { cat: 108, frog: 160, sahur: 160, seal: 160 };
/** Pet centre to the dreidel's point when the paw or hand is on its stem (measured off the rig's twist). */
const DREIDEL_REACH: Record<'cat' | 'frog' | 'sahur' | 'seal', number> = { cat: 87, frog: 64, sahur: 90, seal: 95 };
const DREIDEL_LETTERS = ['nun', 'gimel', 'hei', 'shin'] as const;
/** The darbuka's drawing (darbukaprops.py): its box, the middle of its head, the foot's rim (the floor runs through it)
 *  and the head's half-width. */
const DARBUKA = { box: [70, 104], head: [35, 14], foot: 97, headR: 27.6 } as const;
/** How wide it is drawn in the room, and how far the pet stands from its middle so the striking paw, hand, bat or flipper
 *  lands on its head (measured off the rig's drumPlay: the striking END, frozen at every stroke). The cat's and the frok's
 *  are small because their paws and hands hang low: the cat's paw only rises to her shoulder (the dreidel's lesson), the
 *  frok's hand swings forward from his shoulder onto a drum at his knee. */
const DARBUKA_W: Record<'cat' | 'frog' | 'sahur' | 'seal', number> = { cat: 36, frog: 41, sahur: 70, seal: 48 };
const DARBUKA_REACH: Record<'cat' | 'frog' | 'sahur' | 'seal' | 'sealR', number> = { cat: 72, frog: 79, sahur: 182, seal: 99, sealR: 97 };   // sealR: the seal's hanging flipper, on its right
/** The maqsum, what the pet plays, in eighths: DUM tek . tek DUM . tek . */
const MAQSUM: readonly ('dum' | 'tek' | null)[] = ['dum', 'tek', null, 'tek', 'dum', null, 'tek', null];
/**
 * Kapparot (the hen): where she circles over each pet's head, measured off the rest pose's silhouette with the pet at
 * x=300 facing right: `top` the highest point of the head (room y), `cx` the head's middle from the pet's x (the frok's
 * turns with him), `rx` how far out to each side she goes (her body clear of the head at the sides, over the raised paws).
 */
const KAPPAROT: Record<'cat' | 'frog' | 'sahur' | 'seal', { top: number; cx: number; rx: number }> = {
  cat: { top: 187, cx: -5, rx: 86 }, frog: { top: 180, cx: 12, rx: 74 }, sahur: { top: 109, cx: 0, rx: 68 }, seal: { top: 199, cx: 2, rx: 84 },   // the frok's eyes are the top of his head: his circle is a little higher
};
const HEN_W = 74;                   // the hen's box in the room (hen.svg is 100 x 100, her feet at y 92); a quarter bigger by Sahur
/**
 * The falcon (the Habibi pack's Pet item; director.falcon). Its drawing (falconprops.py): the box, and the point where its
 * toes grip the top of a perch (the point that stays put while it sits). How wide it is drawn in the room, per pet
 * (a size up by Sahur, who stands 1.4x, as the hen is).
 */
const FALCON = { box: [140, 150], grip: [70, 120] } as const;
const FALCON_W: Record<'cat' | 'frog' | 'sahur' | 'seal', number> = { cat: 100, frog: 100, sahur: 100, seal: 100 };   // (not a size up by Sahur: on his cap a bigger one reached the ceiling)
/**
 * Where each pet's perch is looked for, in the perch group's own units (the drawing at rest): a point inside the thing it
 * perches on and how far out the search starts. The search runs from there straight down the screen (in whatever pose the
 * pet holds) and the first painted, visible shape of the group it meets is the top of the perch, so a hat, a crown, the
 * keffiyeh or a sleeve's cuff is what it stands on. The cat's head (the middle of her head), the frok's forward sleeve
 * (#legR, near its end), Sahur's bat (#legL, on the barrel) and cap, the seal's raised flipper (#legL, near its tip).
 */
const FALCON_PROBE: Record<'cat' | 'frog' | 'sahur' | 'seal', { arm: string[]; at: [number, number]; reach: number; head?: { at: [number, number]; reach: number } }> = {
  cat: { arm: [], at: [100, 70], reach: 150 },
  frog: { arm: ['legR'], at: [126, 164], reach: 34 },   // (#legR's own units are mirrored about x 124: see FALCON_ARM in rig.ts)
  sahur: { arm: ['legL'], at: [58.8, 183.7], reach: 30, head: { at: [100, 40], reach: 140 } },
  seal: { arm: ['legL'], at: [19, 128], reach: 34 },   // the flipper's flat top (y ~113 at x 18-26; past x 14 it drops away to the tip), its outer end: clear of the head
};
/**
 * How it comes onto each perch in its last moment (x along its flight, y down): up from below onto the frok's arm and
 * Sahur's bat, which have open air under them; down from above onto the cat's head and the seal's flipper, which have the
 * head under or beside them (from below, its wings crossed the head).
 */
// (onto the seal's flipper it drops almost straight down, from a little past it: it comes over the seal's head high up, and
// the last of its fall is outside the head's edge, which is only a few units from the perch)
const FALCON_ONTO: Record<'cat' | 'frog' | 'sahur' | 'seal', [number, number]> = { cat: [64, 24], frog: [60, -46], sahur: [60, -46], seal: [-24, 150] };
/** The groups that make up the top of the head, most in front first: a perched falcon rides in the one it stands on. */
const FALCON_HEADS = ['witchhat', 'pumpkin', 'crown', 'beanie', 'keffiyeh', 'kippah', 'emohair', 'head'];
/**
 * The guitar (the emo pack's toy; director.playGuitar; DEV only: /emopack). It drops from the top of the room onto the
 * floor beside the pet, clear of it, on `side` (the side with room, when not given); the pet picks it up and plays it.
 * While it is held it is drawn INTO the pet's own drawing, in `host` (at its end, or before its child `before`), so it
 * moves with the body, between the body and the hands (`front`: children of the host moved in front of it for the song
 * and put back after). Its strings' middle goes under the strumming hand and its neck through the fretting one (rig
 * strumArm): the hands are read off the screen in the playing pose and the guitar is fitted between them (turned to the
 * line from one to the other, the neck sliding through the fretting hand to wherever it lands; sized `w` in the host's
 * units, more or less if the hand would be off the neck). Thiccums has his own way (buttGuitar). emoprops.py: 162 x 76.
 */
const GUITAR: Record<string, { host: string; before?: string; front?: string[]; w: number; rot?: number; flip?: boolean; side?: Dir; screenLift?: boolean }> = {
  cat: { host: 'body', front: ['legL', 'legR'], w: 118 },
  frog: { host: 'body', w: 120, side: 1 },
  sahur: { host: 'head', w: 116, side: 1, screenLift: true },
  thiccums: { host: 'body', w: 118 },
  r3tards: { host: 'body', w: 112 },
};
const G_BOX = [162, 76] as const;
const G_STRINGS = [44, 40] as const;   // between the pickups, the strings' middle: where the strumming hand crosses them
/** where on the neck a fretting hand may hold it (the guitar's own units): past the body's join, short of the nut */
const G_NECK = [74, 126] as const;
/** The strumming pattern, a bar of eighths: D . D U . U D U */
const STRUM_BAR: readonly ('down' | 'up' | null)[] = ['down', null, 'down', 'up', null, 'up', 'down', 'up'];
/** How each of those is played on the electric (the riff): open hits on 1, the and of 3 and the last up-stroke, palm-muted
 *  chugs between them: BAM . chk chk . BAM chk BAM */
const STRUM_MUTE: readonly boolean[] = [false, false, true, true, false, false, true, false];

type FalconFrame = {
  pose: 'fly' | 'sit'; nw: 'glide' | 'up' | 'down'; sw: 'fold' | 'half' | 'up'; legs: 'grip' | 'reach' | 'push'; tail: 'closed' | 'fan';
  body: 'sleek' | 'fluff'; head: 'sit' | 'down' | 'joy' | 'back' | 'preen' | 'fly'; joy: boolean;
};
/** Show one frame of the falcon (the prop or a perched copy: they share the drawing's classes). Every part is set, since a
 *  part set visible shows even inside a hidden pose. The head is one group moved by its transform ATTRIBUTE (falconprops.py
 *  HEAD_AT): an attribute, never an animation, so nothing is promoted to a layer. */
function falconFrame(root: Element, f: FalconFrame) {
  const vis = (sel: string, on: boolean) => { const e = root.querySelector<SVGElement>(sel); if (e) e.style.visibility = on ? 'visible' : 'hidden'; };
  const fly = f.pose === 'fly'; const sit = !fly;
  vis('.fc-fly', fly); vis('.fc-sit', sit);
  for (const k of ['glide', 'up', 'down'] as const) { vis(`.fc-nw-${k}`, fly && f.nw === k); vis(`.fc-fw-${k}`, fly && f.nw === k); }
  for (const k of ['fold', 'half', 'up'] as const) vis(`.fc-sw-${k}`, sit && f.sw === k);
  vis('.fc-sfw-half', sit && f.sw === 'half'); vis('.fc-sfw-up', sit && f.sw === 'up');
  vis('.fc-legs-grip', sit && f.legs === 'grip'); vis('.fc-legs-reach', sit && f.legs === 'reach'); vis('.fc-legs-push', sit && f.legs === 'push');
  vis('.fc-tail-closed', sit && f.tail === 'closed'); vis('.fc-tail-fan', sit && f.tail === 'fan');
  vis('.fc-body-sleek', sit && f.body === 'sleek'); vis('.fc-body-fluff', sit && f.body === 'fluff');
  vis('.fc-eye-open', !f.joy); vis('.fc-eye-joy', f.joy);
  const bird = root.querySelector('.fc-bird');
  const heads = JSON.parse((bird?.getAttribute('data-heads') ?? '{}').replace(/'/g, '"')) as Record<string, string>;
  const t = heads[f.head]; if (t) root.querySelector('.fc-head')?.setAttribute('transform', t);
}
/**
 * Beat the wings for `ms`, `period` a beat, by VISIBILITY keyframes on the frames (never opacity: an SVG group with an
 * opacity animation gets its own GPU layer in Chrome and blinks; and Web Animations, so the recorder's slowed clock slows
 * them too). In flight a beat is up, glide, down, glide; perched (a flutter) up, half. The frame set underneath (falconFrame)
 * shows again when they end.
 */
function falconBeat(root: Element, pose: 'fly' | 'sit', ms: number, period = 180, delay = 0) {
  const it = Math.max(1, Math.round(ms / period));
  const slot = (vis: [number, number][]): Keyframe[] => {
    const kf: Keyframe[] = [{ visibility: 'hidden', offset: 0 }];
    for (const [a, b] of vis) kf.push({ visibility: 'hidden', offset: a }, { visibility: 'visible', offset: a }, { visibility: 'visible', offset: b }, { visibility: 'hidden', offset: b });
    kf.push({ visibility: 'hidden', offset: 1 });
    return kf;
  };
  const plans: [string, [number, number][]][] = pose === 'fly'
    ? [['up', [[0, 0.25]]], ['glide', [[0.25, 0.5], [0.75, 1]]], ['down', [[0.5, 0.75]]]]
    : [['up', [[0, 0.5]]], ['half', [[0.5, 1]]]];
  const anims: Animation[] = [];
  for (const [k, plan] of plans) {
    const sels = pose === 'fly' ? [`.fc-nw-${k}`, `.fc-fw-${k}`] : [`.fc-sw-${k}`, `.fc-sfw-${k}`];
    for (const sel of sels) { const e = root.querySelector(sel); if (e) anims.push(e.animate(slot(plan), { duration: period, iterations: it, delay })); }
  }
  return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {});
}
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The falcon's drawing as an SVG group, parsed once, cloned for each perch (the pet's own svg takes it). */
let falconBirdTpl: Element | null = null;
function falconBird(): Element | null {
  if (!falconBirdTpl && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(PROPS.falcon, 'image/svg+xml');
    falconBirdTpl = doc.querySelector('.fc-bird');
  }
  return falconBirdTpl ? document.importNode(falconBirdTpl, true) : null;
}
/** A group's own units on screen: where its (0, 0), (100, 0) and (0, 100) are (three tiny marks, read and taken away). */
/** A drawing's ids made unique for this copy (and every url(#…) and href to them), so two copies on a page never use
 *  each other's clips: a clip inside a copy that is hidden or gone would cut the other one away. */
let copies = 0;
function uniqueIds(raw: string) {
  const n = ++copies; const ids = [...raw.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
  let out = raw;
  for (const id of ids) if (id !== 'emoguitar' && id !== 'emophone') out = out.split(`"${id}"`).join(`"${id}-c${n}"`).split(`#${id})`).join(`#${id}-c${n})`).split(`"#${id}"`).join(`"#${id}-c${n}"`);
  return out;
}
/** 2-D affine maps as [a, b, c, d, e, f] (x' = a x + c y + e, y' = b x + d y + f): a group's units to the screen, etc. */
type Aff = [number, number, number, number, number, number];
const affMul = (m: Aff, n: Aff): Aff => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const affInv = (m: Aff): Aff => {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
};
/** A group's units to screen pixels. */
const toScreenAff = (g: SVGGElement): Aff => { const f = screenFrame(g); const o = f.toScreen(0, 0); return [f.a, f.b, f.c, f.d, o.x, o.y]; };
const cssMatrix = (m: Aff) => `matrix(${m.map((v) => v.toFixed(5)).join(',')})`;
function screenFrame(g: SVGGElement) {
  const at = (x: number, y: number) => {
    const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', '0.01');
    g.appendChild(c); const r = c.getBoundingClientRect(); c.remove();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const O = at(0, 0); const X = at(100, 0); const Y = at(0, 100);
  const a = (X.x - O.x) / 100, b = (X.y - O.y) / 100, c = (Y.x - O.x) / 100, d = (Y.y - O.y) / 100;
  const det = a * d - b * c;
  return {
    a, b, c, d, det,
    toScreen: (x: number, y: number) => ({ x: O.x + a * x + c * y, y: O.y + b * x + d * y }),
    /** a screen direction in the group's units (not normalised) */
    dirIn: (sx: number, sy: number) => ({ x: (d * sx - c * sy) / det, y: (-b * sx + a * sy) / det }),
  };
}
/** Is an element painted: in the layout, not visibility:hidden, not at opacity 0 (itself or anything above it). Where the
 *  browser has no checkVisibility (Safari before 17.4) the same by hand, up to the svg. */
const painted = (e: Element) => {
  const cv = (e as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  if (cv) return cv.call(e, { visibilityProperty: true, opacityProperty: true });
  const cs = getComputedStyle(e);
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  for (let n: Element | null = e; n && n.tagName.toLowerCase() !== 'svg'; n = n.parentElement) {
    const c = getComputedStyle(n);
    if (c.display === 'none' || Number(c.opacity) === 0) return false;
  }
  return true;
};
/**
 * Walk from `from + up * reach` back to `from` (a group's own units) and return the first point where a painted, visible
 * shape of `g` is under it (its fill if it has one, its stroke if it has one), or null.
 */
function firstHit(g: SVGGElement, from: { x: number; y: number }, up: { x: number; y: number }, reach: number) {
  const shapes = [...g.querySelectorAll<SVGGeometryElement>('path, ellipse, circle, rect, polygon, polyline, line')].filter((e) => !e.closest('.fc-mount') && painted(e));
  const gm = g.getCTM(); if (!gm) return null;
  const inv = gm.inverse();
  const tests = shapes.map((e) => {
    const m = e.getCTM(); if (!m) return null;
    const toEl = inv.multiply(m).inverse();   // g's units -> the shape's own
    const cs = getComputedStyle(e);
    let bb: DOMRect; try { bb = e.getBBox(); } catch { return null; }
    const sw = parseFloat(cs.strokeWidth) || 0;
    return { e, toEl, fill: cs.fill !== 'none', stroke: cs.stroke !== 'none' && sw > 0, bb, pad: sw / 2 + 0.5 };
  }).filter((t): t is NonNullable<typeof t> => !!t);
  const L = Math.hypot(up.x, up.y) || 1; const ux = up.x / L; const uy = up.y / L;
  for (let s = reach; s >= 0; s -= 0.5) {
    const px = from.x + ux * s; const py = from.y + uy * s;
    for (const t of tests) {
      const q = new DOMPoint(px, py).matrixTransform(t.toEl);
      if (q.x < t.bb.x - t.pad || q.x > t.bb.x + t.bb.width + t.pad || q.y < t.bb.y - t.pad || q.y > t.bb.y + t.bb.height + t.pad) continue;
      if ((t.fill && t.e.isPointInFill(q)) || (t.stroke && t.e.isPointInStroke(q))) return { x: px, y: py };
    }
  }
  return null;
}
type FalconSpot = { host: SVGGElement; x: number; y: number; room: { x: number; y: number } };
type FalconMount = { root: Element; g: SVGGElement; spot: FalconSpot; up: { x: number; y: number }; sign: number };
/** The twist's timing (rig.twist): its length, and how far through it the stem is let go. */
const PetRig_TWIST = { ms: 660, flick: 0.56 };
const SINK = 26;                     // how far the cat sinks into the tub
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A prop is one absolutely positioned div holding an inline SVG, anchored at its bottom centre. */
export class Prop {
  el: HTMLDivElement;
  inner: HTMLDivElement;
  w: number; h: number;
  constructor(layer: HTMLElement, public name: PropName, w: number, cls = '') {
    this.w = w; this.h = w / ASPECT[name];
    this.el = document.createElement('div');
    this.el.className = `prop prop-${name} ${cls}`;
    this.el.style.width = `${this.w}px`; this.el.style.height = `${this.h}px`;
    this.inner = document.createElement('div');
    this.inner.className = 'prop-inner';
    this.inner.innerHTML = PROPS[name] ?? '';
    this.el.appendChild(this.inner);
    layer.appendChild(this.el);
  }
  place(x: number, bottom: number) { this.el.style.left = `${x - this.w / 2}px`; this.el.style.top = `${bottom - this.h}px`; return this; }
  anim(kf: Keyframe[], opts: KeyframeAnimationOptions) {
    const a = this.el.animate(kf, { composite: 'add', fill: 'none', ...opts });
    // a finished fill-forwards animation is auto-removed once a later one targets the same property (the same
    // rule the rig's keep() guards against); a held move must stay, or every later delta lands in the wrong place
    if (opts.fill === 'forwards' && 'persist' in a) a.persist();
    return a;
  }
  find(sel: string) { return this.inner.querySelector(sel) as (SVGElement & { style: CSSStyleDeclaration }) | null; }
  findAll(sel: string) { return [...this.inner.querySelectorAll(sel)] as (SVGElement & { style: CSSStyleDeclaration })[]; }
  async remove(ms = 240, kf: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]) {
    if (ms > 0) { const a = this.el.animate(kf, { duration: ms, easing: 'ease-in', fill: 'forwards' }); await a.finished.catch(() => {}); }
    this.el.remove();
  }
}

/** What `play()` plays with. */
export type Toy = 'yarn' | 'dreidel' | 'darbuka' | 'guitar';   // darbuka: the Habibi pack's toy; guitar: the emo pack's (lab only, /emopack)
/** What `pet()` does (see setPetMove). */
export type PetMove = 'pet' | 'kapparot' | 'falcon' | 'selfie';   // falcon: the Habibi pack's Pet item; selfie: the emo pack's (lab only, /emopack)

export class Director {
  private st: DirectorState = { x: WORLD.w / 2, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false, queued: 0 };
  /** Settles when the room is taken down, so nothing waiting on a job in it waits for ever. */
  private gone: Promise<void>;
  private leave: () => void = () => {};
  private grave: Prop | null = null;
  private subs = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private poopProp: Prop | null = null;
  private wanderTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private sad = false;
  /** Called when a poop is scooped, so the game can update. */
  onCleaned: (() => void) | null = null;
  /** a tap on the poop itself. Returns true when the app took it (live: the on-chain clean, which then plays the scene); otherwise the scene cleans up by itself (the demo) */
  onPoopTap: (() => boolean) | null = null;
  /** Sound. A room that is only on show (a row of pets, a looping reel) is `muted`; `soundAt` says where this room is
   *  for the listener (the town: how loud, how far left or right; null = out of earshot). */
  muted = false;
  soundAt: ((name: string) => { v: number; pan: number } | null) | null = null;
  /** Say what just happened, for the ears (sound/cue.ts: a no-op in a build without sound). Returns a stop. */
  sfx(name: string, o?: CueOpts): Stop {
    if (this.muted || this.destroyed) return SILENT;
    const at = this.soundAt ? this.soundAt(name) : { v: 1, pan: ((this.st.x - WORLD.w / 2) / (WORLD.w / 2)) * 0.3 };
    if (!at) return SILENT;
    const stop = cue(name, { who: this.rig.character, ...o, pan: at.pan, v: (o?.v ?? 1) * at.v });
    // remembered for a while, so a room that is taken down (a switch to another pet) takes its long sounds with it
    // (a fire crackling, a bath's bubbles); a stop for a sound that has ended does nothing
    if (stop !== SILENT) {
      const now = performance.now();
      if (this.sounding.length > 24) this.sounding = this.sounding.filter((x) => now - x.at < 20_000);
      this.sounding.push({ stop, at: now });
    }
    return stop;
  }
  private sounding: { stop: Stop; at: number }[] = [];
  /**
   * The room's music steps aside (a pet playing the guitar: its riff is the music while it lasts) until the returned
   * Stop is called; a room taken down calls it too (destroy stops every sound). Only in a pet's own room: on Emotown's
   * street (`soundAt`), where pets strum now and then, the town's music would keep dipping.
   */
  private duckMusic(): Stop { return this.soundAt ? SILENT : this.sfx('music.duck', { dur: 45 }); }
  /** The pet's own voice: 'happy', 'sad', 'yum', 'ouch', 'alarm', 'huh', 'meh', 'hello', 'giggle'. */
  private voice(mood: string, o?: CueOpts) { return this.sfx(`voice.${mood}`, o); }
  private snoring: ReturnType<typeof setInterval> | null = null;
  /** A sleeper snores now and then, until it wakes. */
  private snore(on: boolean) {
    if (this.snoring) { clearInterval(this.snoring); this.snoring = null; }
    if (on) this.snoring = setInterval(() => { if (this.st.sleeping && !this.st.dead && !this.isBusy) this.sfx('snore', { v: 0.6 }); }, 11000);
  }
  /** The character's box in the room (sahur stands 1.4x; see world.ts) and its svg unit in world units. */
  private B: ReturnType<typeof petBox>;
  private S: number;

  constructor(readonly rig: PetRig, private L: Layers) {
    this.gone = new Promise<void>((r) => { this.leave = r; });
    this.B = petBox(rig.character); this.S = this.B.S;
    this.setX(this.st.x);
    L.cat.style.top = `${this.B.hostTop}px`;
    rig.sound = (name, o) => { this.sfx(name, o); };
    this.own = OWN_WAYS[rig.character]?.(this) ?? null;
    if (rig.character === 'frog') void loadStuntProps();   // his stunts' big props, while nobody is pressing anything yet
    this.scheduleWander(3000);
  }
  /** The character's own ways, when it brings any (registerOwnWays). */
  readonly own: OwnWays | null;
  /** The director's working parts, for a character's own ways (registerOwnWays), bound to it. */
  kit() {
    return {
      L: this.L, B: this.B, S: this.S, st: () => this.st, destroyed: () => this.destroyed,
      set: (patch: Partial<DirectorState>) => this.set(patch),
      run: (fn: () => Promise<void>) => this.run('show', fn),
      walkTo: (x: number, pace?: 'creep' | 'walk' | 'run') => this.walkTo(x, pace),
      jumpTo: (x: number) => this.jumpTo(x), hopTo: (x: number) => this.hopTo(x),
      hearts: (n: number, from?: { x: number; y: number }) => this.hearts(n, from), sparkles: (n: number, cx: number, cy: number, spread?: number) => this.sparkles(n, cx, cy, spread),
      dust: (x: number, size?: number) => this.dust(x, size), puff: (x: number, y: number, w?: number) => this.puff(x, y, w),
      droplets: (n: number, x: number, y: number, power?: number) => this.droplets(n, x, y, power), crumbs: (n: number, x: number, y: number, dir: Dir) => this.crumbs(n, x, y, dir),
      at: (sx: number, sy: number) => this.at(sx, sy, 1), roomPos: (id: string) => this.roomPos(id), headPos: () => this.headPos(),
      sfx: (name: string, o?: CueOpts) => this.sfx(name, o), voice: (mood: string, o?: CueOpts) => this.voice(mood, o),
    };
  }
  yawn() { if (this.isBusy || this.st.sleeping) return Promise.resolve(); return this.run('wander', () => this.rig.yawn()); }

  /** The rig, for tests and the dev panel. */
  get petRig() { return this.rig; }

  // ---- state for React ----
  getState() { return this.st; }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private set(patch: Partial<DirectorState>) { this.st = { ...this.st, ...patch }; for (const s of this.subs) s(); }
  get isBusy() { return this.st.busy !== null || this.pending > 0; }
  /** Busy with something that was asked for, not just idling about (a wander, a rumble): what the page's buttons wait on. */
  get isActing() { return (this.st.busy !== null && !IDLE.has(this.st.busy)) || this.st.queued > 0; }

  // ---- moods from the game ----
  setSad(on: boolean) { this.sad = on; if (!this.isBusy) this.settleMood(); }
  setDirty(on: boolean) { this.rig.setDirty(on); }
  setCrown(on: boolean) { this.rig.setCrown(on); }
  setCostume(which: Costume | boolean | null) { this.rig.setCostume(which); }
  setCostumes(which: readonly Costume[]) { this.rig.setCostumes(which); }
  setHair(on: boolean) { this.rig.setHair(on); }
  /** The toy `play()` brings out: the ball of yarn, or the dreidel (the Jewish pack's toy item), which the pet spins instead. */
  private toy: Toy = 'yarn';
  setToy(toy: Toy) { this.toy = toy; }
  /** What `pet()` does: the nuzzle, or kapparot (the Jewish pack's hen item: equipping it turns the Pet action into the
   *  swing). A tap on the pet in the room (Stage) passes `quick`, which is always the nuzzle: a 7 s ritual on every tap
   *  would wear thin, and either way the chain records the same pet. */
  private petMove: PetMove = 'pet';
  setPetMove(move: PetMove) { this.petMove = move; }
  get currentPetMove(): PetMove { return this.petMove; }
  get currentToy(): Toy { return this.toy; }
  private settleMood() {
    if (this.destroyed) return;
    this.rig.setMood(this.st.dead ? 'idle' : this.st.sleeping ? 'sleep' : this.sad ? 'sad' : 'idle');
  }

  // ---- the queue ----
  private run(name: ActionName, fn: () => Promise<void>): Promise<void> {
    // a dead cat only revives (the contract refuses everything else too)
    if (this.st.dead && name !== 'revive' && name !== 'die') return Promise.resolve();
    if (this.destroyed) return Promise.resolve();
    const idle = IDLE.has(name);
    this.pending += 1;
    if (!idle) this.set({ queued: this.st.queued + 1 });
    const job = async () => {
      this.pending -= 1;
      if (this.destroyed) return;
      this.set({ busy: name, queued: idle ? this.st.queued : this.st.queued - 1 });
      this.rig.busy = true;
      if (this.wanderTimer) { clearTimeout(this.wanderTimer); this.wanderTimer = null; }
      if (this.rig.currentMood !== 'idle' && name !== 'wander') this.rig.setMood('idle');
      // a room taken down mid-action (the page moved on to another pet) lets go of whoever waits on it at once
      try { await Promise.race([fn(), this.gone]); } catch (e) { console.error(`[emo-pets] ${name} failed`, e); }
      if (this.destroyed) return;
      this.rig.releaseAll();
      this.set({ busy: null });
      this.rig.busy = false;
      this.settleMood();
      this.scheduleWander();
    };
    this.queue = this.queue.then(job, job);
    return this.queue;
  }

  // ---- the cat's place on the floor ----
  private setX(x: number) { this.st = { ...this.st, x }; this.L.cat.style.left = `${x - this.B.w / 2 - CAT_PAD.side}px`; for (const s of this.subs) s(); }
  private headPos() {
    const h = this.own?.tune?.head;
    if (h) return { x: this.st.x + (h[0] - 100) * this.S, y: this.B.top + (this.st.inTub ? SINK : 0) + h[1] * this.S };
    return { x: this.st.x, y: this.B.top + (this.st.inTub ? SINK : 0) + 96 * this.S };
  }
  /** Move the body across the floor: set the resting position now, animate the offset to zero. */
  private moveHost(toX: number, kf: (dx: number) => Keyframe[], opts: KeyframeAnimationOptions) {
    const dx = this.st.x - toX;
    this.setX(toX);
    return this.L.cat.animate(kf(dx), { composite: 'add', ...opts }).finished.then(() => {}, () => {});
  }
  async walkTo(x: number, pace: 'creep' | 'walk' | 'run' = 'walk') {
    x = clamp(x, WALK_MIN, WALK_MAX);
    const dist = x - this.st.x;
    if (Math.abs(dist) < 6) return;
    const dir: Dir = dist > 0 ? 1 : -1;
    this.set({ dir }); this.rig.facing(dir);
    const [cadence, perHop] = pace === 'creep' ? [470, 40] : pace === 'run' ? [300, 74] : [380, 58];
    const hops = Math.max(1, Math.round(Math.abs(dist) / perHop));
    const ms = hops * cadence;
    const walk = this.rig.walk(dir, cadence);
    await this.moveHost(x, (dx) => [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: ms, easing: 'cubic-bezier(.35,0,.65,1)' });
    await walk.stop();
  }
  /** One ballistic jump to x; the body arcs in the rig while the host slides at constant speed. */
  private async jumpTo(x: number, dy = 0) {
    x = clamp(x, WALK_MIN, WALK_MAX);
    const dir: Dir = x >= this.st.x ? 1 : -1;
    if (Math.abs(x - this.st.x) > 4) { this.set({ dir }); this.rig.facing(dir); }
    const ms = Math.round(560 + Math.min(220, Math.abs(x - this.st.x)) * 0.6);
    // dy is the old top minus the new top: the host is re-anchored now and the offset animates to zero
    if (dy !== 0) this.L.cat.style.top = `${this.B.hostTop + (this.st.inTub ? SINK : 0)}px`;
    const p = this.moveHost(x, (dx) => [
      { transform: `translate(${dx}px, ${dy}px)`, offset: 0 }, { transform: `translate(${dx}px, ${dy}px)`, offset: 0.14, easing: 'linear' },
      { transform: 'translate(0, 0)', offset: 1 },
    ], { duration: ms, easing: 'linear' });
    await this.rig.jump(ms);
    await p;
    await this.rig.land();
  }

  /** A small hop to x (short distances). */
  private async hopTo(x: number) {
    x = clamp(x, WALK_MIN, WALK_MAX);
    const dist = Math.abs(x - this.st.x);
    if (dist < 4) return;
    this.set({ dir: x > this.st.x ? 1 : -1 }); this.rig.facing(x > this.st.x ? 1 : -1);
    const p = this.moveHost(x, (dx) => [{ transform: `translateX(${dx}px)`, offset: 0 }, { transform: `translateX(${dx}px)`, offset: 0.1, easing: 'linear' }, { transform: 'translateX(0)', offset: 0.7 }, { transform: 'translateX(0)', offset: 1 }], { duration: 420, easing: 'linear' });
    await this.rig.hop();
    await p;
  }

  private crumbs(n: number, x: number, y: number, dir: Dir) {
    this.sfx('crumbs', { n });
    for (let i = 0; i < n; i++) {
      if (this.destroyed) return;
      const c = new Prop(this.L.front, 'crumb', rand(8, 12)).place(x + rand(-10, 10), y);
      const vx = rand(20, 60) * (Math.random() < 0.5 ? -1 : 1) + dir * 10; const vy = -rand(30, 60);
      c.anim([
        { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0, easing: 'ease-out' }, { transform: `translate(${vx * 0.6}px, ${vy}px) rotate(${vx}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${vx}px, ${-vy * 0.2 + 40}px) rotate(${vx * 2}deg)`, opacity: 0, offset: 1 },
      ], { duration: rand(420, 560) }).finished.then(() => c.el.remove(), () => c.el.remove());
    }
  }

  // ---- particles ----
  private hearts(n: number, from = this.headPos()) {
    this.sfx('heart');
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (this.destroyed) return;
        const h = new Prop(this.L.front, 'heart', rand(22, 30)).place(from.x + rand(-40, 40), from.y - rand(10, 40));
        const sway = rand(-22, 22);
        h.anim([
          { transform: 'translate(0,0) scale(0.4)', opacity: 0, offset: 0 }, { transform: `translate(${sway * 0.3}px,-18px) scale(1.05)`, opacity: 1, offset: 0.22, easing: 'ease-in-out' },
          { transform: `translate(${sway}px,-58px) scale(1)`, opacity: 1, offset: 0.7, easing: 'ease-in-out' }, { transform: `translate(${sway * 0.6}px,-92px) scale(0.8)`, opacity: 0, offset: 1 },
        ], { duration: 1500, easing: 'ease-out' }).finished.then(() => h.el.remove(), () => h.el.remove());
      }, i * 220);
    }
  }
  private sparkles(n: number, cx: number, cy: number, spread = 90, quiet = false) {
    if (!quiet) this.sfx('sparkle', { n: Math.min(n, 6) });
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (this.destroyed) return;
        const s = new Prop(this.L.front, 'sparkle', rand(18, 30)).place(cx + rand(-spread, spread), cy + rand(-spread, spread * 0.6));
        s.anim([{ transform: 'scale(0) rotate(0)', opacity: 0 }, { transform: 'scale(1.2) rotate(45deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(0) rotate(100deg)', opacity: 0 }], { duration: 700, easing: 'ease-in-out' })
          .finished.then(() => s.el.remove(), () => s.el.remove());
      }, i * 110);
    }
  }
  private droplets(n: number, x: number, y: number, power = 1) {
    this.sfx('drops', { n: Math.min(n, 4), v: 0.7 });
    for (let i = 0; i < n; i++) {
      if (this.destroyed) return;
      const d = new Prop(this.L.front, 'droplet', rand(9, 14)).place(x, y);
      const ang = rand(-Math.PI * 0.9, -Math.PI * 0.1); const v = rand(50, 110) * power;
      const vx = Math.cos(ang) * v; const vy = Math.sin(ang) * v;
      d.anim([
        { transform: 'translate(0,0)', opacity: 1, offset: 0, easing: 'ease-out' }, { transform: `translate(${vx * 0.6}px, ${vy * 0.6}px) rotate(${vx * 0.3}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${vx * 1.1}px, ${vy * 0.2 + 70}px) rotate(${vx * 0.6}deg)`, opacity: 0, offset: 1 },
      ], { duration: rand(500, 700) }).finished.then(() => d.el.remove(), () => d.el.remove());
    }
  }
  private bubble(x: number, y: number) {
    const b = new Prop(this.L.front, 'bubble', rand(12, 30)).place(x, y);
    const sway = rand(-18, 18); const rise = rand(80, 150);
    b.anim([
      { transform: 'translate(0,0) scale(0.2)', opacity: 0, offset: 0 }, { transform: `translate(${sway * 0.4}px,${-rise * 0.25}px) scale(1)`, opacity: 1, offset: 0.25, easing: 'ease-in-out' },
      { transform: `translate(${-sway * 0.4}px,${-rise * 0.7}px) scale(1)`, opacity: 1, offset: 0.75, easing: 'ease-in-out' }, { transform: `translate(${sway * 0.2}px,${-rise}px) scale(1.25)`, opacity: 0, offset: 1 },
    ], { duration: rand(1500, 2200), easing: 'ease-out' }).finished.then(() => b.el.remove(), () => b.el.remove());
  }
  /** A little dust where something small lands: two puffs either side of it, behind it. */
  private dust(x: number, size = 1) {
    this.sfx('dust', { v: Math.min(1.2, size) });
    for (const side of [-1, 1]) {
      const p = new Prop(this.L.back, 'puff', 30 * size).place(x + side * 14 * size, WORLD.floor + 4);
      p.anim([{ transform: 'translate(0,0) scale(0.4)', opacity: 0 }, { transform: `translate(${side * 8 * size}px,-3px) scale(1)`, opacity: 0.85, offset: 0.3 }, { transform: `translate(${side * 18 * size}px,-9px) scale(1.2)`, opacity: 0 }], { duration: 560, easing: 'ease-out' })
        .finished.then(() => p.el.remove(), () => p.el.remove());
    }
  }
  private puff(x: number, y: number, w = 80, quiet = false) {
    if (!quiet) this.sfx('puff');
    const p = new Prop(this.L.front, 'puff', w).place(x, y);
    p.anim([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.25) translateY(-14px)', opacity: 0 }], { duration: 750, easing: 'ease-out' })
      .finished.then(() => p.el.remove(), () => p.el.remove());
  }

  // ================= actions =================
  /** A bowl drops in across the room; the cat trots over, sniffs, eats in two sittings with a pleased look between, licks the bowl clean, shimmies. */
  feed() {
    const own = this.own?.feed; if (own) return this.run('feed', () => own());
    if (this.rig.character === 'sahur') return this.feedSahur();
    if (this.rig.character === 'seal') return this.feedSeal();
    return this.run('feed', async () => {
      const dir: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;            // the bowl lands on the roomier side
      const bx = clamp(this.st.x + dir * 150, 140, WORLD.w - 140);
      const bowl = new Prop(this.L.front, 'bowl', 136).place(bx, WORLD.floor + 12);
      bowl.el.style.transformOrigin = '50% 100%';
      bowl.anim([
        { transform: 'translateY(-280px) scale(0.9)', opacity: 0, offset: 0, easing: 'cubic-bezier(.45,0,1,.55)' }, { transform: 'translateY(-200px) scale(0.92)', opacity: 1, offset: 0.16, easing: 'cubic-bezier(.45,0,1,.55)' },
        { transform: 'translateY(0) scale(1.06, 0.9)', offset: 0.62, easing: 'ease-out' }, { transform: 'translateY(-8px) scale(0.98, 1.03)', offset: 0.78, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1)', offset: 0.9 }, { transform: 'none', offset: 1 },
      ], { duration: 820 });
      this.sfx('bowl.drop', { delay: 0.5 });
      setTimeout(() => this.crumbs(3, bx, WORLD.floor - 28, dir), 520);
      await wait(520);
      this.rig.facing(dir);
      this.voice('huh', { delay: 0.1 });
      await this.rig.perk();
      this.rig.look(dir * 0.9, 0.4);
      this.rig.tilt(dir);
      await wait(520);
      this.rig.release('tilt', 260); this.rig.release('look', 260);
      await this.walkTo(bx - dir * 26);
      this.rig.look(dir * 0.3, 0.9);
      await this.rig.sniff();
      this.rig.eatPose(dir);
      await wait(520);
      const layers = ['#food3', '#food2', '#food1'].map((sel) => bowl.find(sel));
      const mouth = { x: bx - dir * 6, y: WORLD.floor - 52 };
      const onBite = (i: number) => {
        this.crumbs(2, mouth.x, mouth.y, dir);
        bowl.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${-dir * 2}deg) translateY(1px)`, offset: 0.4, easing: 'ease-out' }, { transform: 'rotate(0)' }], { duration: 300, easing: 'ease-in-out' });
        const eat = i === 1 ? layers[0] : i === 3 ? layers[1] : i === 5 ? layers[2] : null;
        if (eat) eat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      };
      await this.rig.eat(3, dir, onBite);
      // a pleased look up between sittings
      this.rig.release('eat', 420); this.rig.release('look', 420);
      this.rig.face('happy', 'smile', 200);
      this.voice('yum', { delay: 0.25 });
      this.rig.tilt(-dir as Dir);
      await wait(900);
      this.rig.release('tilt', 300);
      this.rig.face('open', 'idle', 200);
      this.rig.eatPose(dir); this.rig.look(dir * 0.3, 0.9);
      await wait(520);
      await this.rig.eat(3, dir, (i) => onBite(i + 3));
      await this.rig.lickBowl(dir);
      this.rig.release('eat', 480); this.rig.release('look', 480);
      await wait(420);
      await this.rig.lick();
      this.rig.face('happy', 'smile');
      this.hearts(3);
      this.voice('happy');
      await this.rig.shimmy();
      const wag = this.rig.wag();
      await wait(800);
      await wag.stop();
      this.rig.restFace();
      this.sfx('slide', { dur: 0.4, v: 0.6 });
      void bowl.remove(460, [{ transform: 'translateX(0)', opacity: 1, easing: 'ease-in' }, { transform: `translateX(${dir * 280}px)`, opacity: 0 }]);
      await wait(200);
    });
  }

  /**
   * Sahur is four metres of log with his face at the top: he can no more get it down to a bowl on the floor than
   * a bowl can come up to him, so he fetches it. It drops in on his free side; he looks it over, bends right down
   * from the hips with the arm hanging and takes it by the rim (the drawn bowl in his hand takes over from the prop
   * at that instant), straightens, folds the forearm so the bowl comes up under his chin, and eats from it in two
   * sittings with a pleased look between, head down in the bowl, licks it clean, then flings the empty bowl off
   * to his right, out of the room.
   */
  private feedSahur() {
    return this.run('feed', async () => {
      const REACH = 90;                                                 // where his hand lands beside him when he bends (rig.reachDown), in world units
      const x = clamp(this.st.x, WALK_MIN, WALK_MAX - REACH - 20);
      if (Math.abs(x - this.st.x) > 6) await this.walkTo(x);
      const bx = this.st.x + REACH;
      const bowl = new Prop(this.L.front, 'bowl', 60).place(bx, WORLD.floor + 8);
      bowl.el.style.transformOrigin = '50% 100%';
      bowl.anim([
        { transform: 'translateY(-280px) scale(0.9)', opacity: 0, offset: 0, easing: 'cubic-bezier(.45,0,1,.55)' }, { transform: 'translateY(-200px) scale(0.92)', opacity: 1, offset: 0.16, easing: 'cubic-bezier(.45,0,1,.55)' },
        { transform: 'translateY(0) scale(1.06, 0.9)', offset: 0.62, easing: 'ease-out' }, { transform: 'translateY(-8px) scale(0.98, 1.03)', offset: 0.78, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1)', offset: 0.9 }, { transform: 'none', offset: 1 },
      ], { duration: 820 });
      this.sfx('bowl.drop', { delay: 0.5, rate: 1.25 });
      setTimeout(() => this.crumbs(2, bx, WORLD.floor - 14, 1), 520);
      await wait(520);
      this.voice('huh', { delay: 0.1 });
      await this.rig.perk();
      this.rig.look(0.9, 0.6);
      this.rig.tilt(1);
      await wait(520);
      this.rig.release('tilt', 260); this.rig.release('look', 260);
      // down to it, the hand to its rim; the bowl in his hand takes over from the one on the floor
      this.rig.face('open', 'idle', 160);
      this.rig.reachDown();
      await wait(700);
      this.rig.setBowl(true);
      bowl.el.remove();
      await wait(220);
      // up he comes with it, and the forearm folds it in under his chin
      this.rig.release('reach', 620);
      await wait(680);
      this.rig.face('open', 'smile', 200);
      this.rig.carryPose();
      await wait(620);
      const mouth = this.at(102, 80, 1);
      const onBite = (i: number) => { this.crumbs(2, mouth.x, mouth.y, 1); const layer = i === 1 ? 0 : i === 3 ? 1 : i === 5 ? 2 : -1; if (layer >= 0) this.rig.bowlFood(layer); };
      this.rig.look(0.3, 0.9);
      await this.rig.eat(3, 1, onBite);
      // a pleased look up between sittings
      this.rig.release('look', 420);
      this.rig.face('happy', 'smile', 200);
      this.voice('yum', { delay: 0.25 });
      this.rig.tilt(-1);
      await wait(900);
      this.rig.release('tilt', 300);
      this.rig.face('open', 'idle', 200);
      this.rig.look(0.3, 0.9);
      await wait(420);
      await this.rig.eat(3, 1, (i) => onBite(i + 3));
      await this.rig.lickBowl(1);
      this.rig.release('look', 480);
      await wait(300);
      await this.rig.lick();
      // done: he flings the empty bowl off to his right; at the release it leaves the hand as a prop and spins out
      // of the room
      this.rig.face('open', 'smug', 200);
      await wait(300);
      await this.rig.flingBowl(() => {
        const at = this.roomPos('bowl');
        this.rig.setBowl(false);
        this.sfx('whoosh', { dur: 0.45 });
        const fly = new Prop(this.L.front, 'bowl', 60).place(at.x, at.y + 19);
        for (const sel of ['#food3', '#food2', '#food1']) { const f = fly.find(sel); if (f) f.style.opacity = '0'; }
        fly.el.style.transformOrigin = '50% 50%';
        fly.anim([
          { transform: 'translate(0,0) rotate(0)', easing: 'cubic-bezier(.2,.5,.5,1)' },
          { transform: 'translate(230px, -150px) rotate(300deg)', offset: 0.42, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: 'translate(620px, 80px) rotate(760deg)' },
        ], { duration: 900, fill: 'forwards' }).finished.then(() => fly.el.remove(), () => fly.el.remove());
        const lines = new Prop(this.L.front, 'whoosh', 110).place(at.x + 40, at.y - 10);
        lines.inner.style.transform = 'rotate(-30deg)';
        lines.el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 300 }).finished.then(() => lines.el.remove(), () => lines.el.remove());
        lines.anim([{ transform: 'translate(0, 0) scale(0.7)' }, { transform: 'translate(90px, -60px) scale(1.3)' }], { duration: 300, easing: 'ease-out' });
      });
      this.rig.face('happy', 'smile');
      this.hearts(3);
      this.voice('happy');
      await this.rig.hop();
      await wait(600);
      this.rig.restFace();
    });
  }

  // ================= the seal's own ways =================
  /**
   * The seal is fed like a seal. Its face is 120 units off the floor and its flippers never reach it, so nothing sits
   * in a bowl: three fish are tossed in from the roomier side, one after another. Each time it lifts its head toward
   * the throw with its mouth wide and catches the fish in it (the fish is gone into the mouth at the catch), gulps it
   * down with a swallow through its whole body, and after the third licks its lips and flaps its flippers.
   */
  private feedSeal() {
    return this.run('feed', async () => {
      const from: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;             // tossed in from the roomier side
      await this.rig.perk();
      this.rig.look(from * 0.9, -0.3);
      await wait(420);
      this.rig.release('look', 200);
      const FW = 62; const fh = FW * 56 / 100;
      const NOSE = { x: 0.08, y: 0.52 };                                // the fish's nose in its picture (sealprops.py): it flies nose first and goes in nose first
      for (let i = 0; i < 3; i++) {
        this.rig.gape(from);
        await wait(300);
        const m = this.roomPos('mouth-open');
        // the fish's nose lands in the open mouth: it is lobbed from beyond the room's edge on that side, up and over,
        // and drops into the mouth from above, turned along its flight about its nose (so at the catch it hangs nose
        // down with its body up between the eyes, the one place on the face it covers nothing); then it goes in nose
        // first (it shrinks away into its nose, which is in the mouth)
        const nx = from > 0 ? NOSE.x : 1 - NOSE.x;
        const fish = new Prop(this.L.front, 'sealfish', FW).place(m.x + FW / 2 - nx * FW, m.y + (1 - NOSE.y) * fh);
        fish.el.style.transformOrigin = `${nx * 100}% ${NOSE.y * 100}%`;
        if (from < 0) fish.inner.style.transform = 'scaleX(-1)';
        const sx = (from > 0 ? WORLD.w + 50 : -50) - m.x; const sy = 20 - i * 20; const peak = -(150 + i * 20);
        const N = 14; const kf: Keyframe[] = []; const head = from > 0 ? 180 : 0;
        for (let k = 0; k <= N; k++) {
          // x slows to nothing at the catch (it drops the last of the way straight down); y is the throw's parabola
          const t = k / N; const x = sx * (1 - t) * (1 - t); const y = sy * (1 - t) + 4 * peak * t * (1 - t);
          const vx = -2 * sx * (1 - t) - 0.002 * sx; const vy = -sy + 4 * peak * (1 - 2 * t);
          let rot = (Math.atan2(vy, vx) * 180) / Math.PI - head; rot = ((rot + 540) % 360) - 180;
          kf.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`, offset: t });
        }
        const last = kf[N]!.transform as string;
        const FLY = 620 + i * 40;
        this.sfx('whoosh', { dur: FLY / 1000, v: 0.7 });
        await fish.el.animate(kf, { duration: FLY, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
        // in it goes: the fish shrinks into the mouth as it shuts
        fish.el.animate([{ transform: last, opacity: 1 }, { transform: `${last} scale(0.45)`, opacity: 1, offset: 0.6 }, { transform: `${last} scale(0.1)`, opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' }).finished.then(() => fish.el.remove(), () => fish.el.remove());
        await this.rig.gulp();
        if (i < 2) { this.rig.look(from * 0.8, -0.2); await wait(260); this.rig.release('look', 160); }
      }
      await wait(200);
      await this.rig.lick();
      this.hearts(3);
      this.voice('happy');
      await this.rig.flap(4);
      await wait(300);
      this.rig.restFace();
    });
  }

  /**
   * The seal plays ball like a seal. The ball rolls in; it looks, shuffles over, pats it twice with the flipper on
   * that side, then scoops it up with a flick of the flipper and catches it on the top of its head (on the crown, if
   * it wears one). Three headers, each higher, the flippers out for balance; the last sends the ball off across the
   * room, where it bounces and rolls (back off the wall if it gets there), and the seal flaps, very pleased.
   */
  private playSeal() {
    return this.run('play', async () => {
      const YW = 58; const YH = YW / ASPECT.yarn; const circ = Math.PI * YW * (50 / 72);
      const REACH = 90;                                                  // the flipper's tip comes down on the ball's top at this distance (rig.patSeal)
      const dir: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;               // the ball rolls in on the roomier side
      const EDGE = YW / 2 + 12;
      const lo = dir > 0 ? WALK_MIN + REACH : EDGE; const hi = dir > 0 ? WORLD.w - EDGE : WALK_MAX - REACH;
      let bx = clamp(this.st.x + dir * 190, lo, hi);
      const FLOOR_B = WORLD.floor + 8;                                   // the prop's bottom when the ball sits on the floor (its picture has 10 below the ball)
      const BALL_BELOW = YH * (74 - 62.4) / 74;                          // the prop's bottom is this far below the ball's own (its picture: a ball of r 25 at y 36 of 74)
      const yarn = new Prop(this.L.front, 'yarn', YW).place(bx, FLOOR_B);
      for (const t of [yarn.find('#yarntail'), yarn.find('#yarntail2')]) if (t) t.style.opacity = '0';
      const ball = yarn.find('#ball');
      if (ball) { ball.style.transformBox = 'fill-box'; ball.style.transformOrigin = '50% 100%'; }
      yarn.inner.style.transformOrigin = `50% ${(36 / 74) * 100}%`;   // it spins about the ball's centre
      let rot = 0; let by = FLOOR_B;
      const spin = (deg: number) => { yarn.inner.style.transform = `rotate(${deg}deg)`; };
      // every move of the ball: re-anchor it at the end point and run the offset in to zero, replacing (no leftovers)
      const moveTo = async (nx: number, nb: number, ms: number, kf: (dx: number, dy: number, t: number) => [number, number], dr = 0, easing = 'linear') => {
        const dx = bx - nx; const dy = by - nb; const N = 16; const frames: Keyframe[] = [];
        for (let k = 0; k <= N; k++) { const t = k / N; const [x, y] = kf(dx, dy, t); frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, offset: t }); }
        yarn.place(nx, nb); bx = nx; by = nb;
        const a1 = yarn.el.animate(frames, { duration: ms, easing, fill: 'backwards' });
        const a2 = dr ? yarn.inner.animate([{ transform: `rotate(${rot}deg)` }, { transform: `rotate(${rot + dr}deg)` }], { duration: ms, easing, fill: 'forwards' }) : null;
        rot += dr;
        await Promise.all([a1.finished.catch(() => {}), a2?.finished.catch(() => {})]);
        spin(rot); a2?.cancel();
      };
      const roll = (nx: number, ms: number, easing = 'cubic-bezier(.1,.6,.3,1)') => moveTo(nx, FLOOR_B, ms, (dx, _dy, t) => [dx * (1 - t), 0], ((nx - bx) / circ) * 360, easing);
      // a throw from here to (nx, nb): x at an even pace, y a parabola that rises `h` above the higher end
      const fly = (nx: number, nb: number, ms: number, h: number, dr = 0) => moveTo(nx, nb, ms, (dx, dy, t) => {
        // one parabola from the start (dy, relative to the end) over an apex `h` above the higher end, down to the end:
        // y = top + a (t - tp)^2, with tp where the two ends' heights under the apex agree on the same a
        const top = Math.min(dy, 0) - h;
        const s1 = Math.sqrt(Math.max(0, dy - top)); const s0 = Math.sqrt(-top);
        const tp = s1 / (s1 + s0); const a = (dy - top) / (tp * tp || 1);
        return [dx * (1 - t), tp > 0 ? top + a * (t - tp) * (t - tp) : top * (1 - t * t) + 0];
      }, dr);
      const squash = (k: number, side: Dir | 0 = 0) => ball?.animate([{ transform: 'scale(1,1)' }, { transform: `scale(${1 + 0.22 * k}, ${1 - 0.2 * k}) translateX(${side * 3 * k}px)`, offset: 0.3, easing: 'ease-out' }, { transform: `scale(${1 - 0.04 * k}, ${1 + 0.05 * k})`, offset: 0.7 }, { transform: 'scale(1,1)' }], { duration: 360, easing: 'ease-in-out', composite: 'add' });
      const wobble = (side: Dir) => yarn.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${side * 9}deg) translateX(${side * 3}px)`, offset: 0.35, easing: 'ease-out' }, { transform: `rotate(${-side * 4}deg)`, offset: 0.7 }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-in-out' });
      // where the ball sits on its head: on the top of the head, or of whatever is on it (a hat, the pumpkin's stem, the
      // hair, the crown), a little into the curve
      const perch = () => {
        const r = this.rig.headTopBox(); const w = this.L.cat.parentElement?.getBoundingClientRect();
        if (!r || !w) return { x: this.st.x, b: this.B.top + 20 };
        const k = w.width / WORLD.w;
        return { x: this.st.x + 3 * this.S, b: (r.top - w.top) / k + 4 + BALL_BELOW };   // the top of the head is 3 right of its centre line
      };
      // ---- in it rolls, from off stage, and settles ----
      const target = bx; bx = bx + dir * 330; yarn.place(bx, FLOOR_B);
      const inRoll = roll(target, 1150, 'cubic-bezier(.2,.6,.3,1)').then(() => wobble(-dir as Dir));
      this.sfx('roll', { dur: 1.1 });
      await wait(380);
      this.voice('huh');
      await this.rig.perk();
      this.rig.look(dir * 0.9, 0.5);
      this.rig.tilt(dir);
      await wait(620);
      this.rig.release('tilt', 300);
      await inRoll;
      // ---- over to it, and two pats ----
      this.rig.release('look', 200);
      await this.walkTo(bx - dir * REACH, 'walk');
      this.rig.look(dir * 0.8, 0.8);
      await wait(200);
      for (let i = 0; i < 2; i++) {
        const p = this.rig.pat(dir);
        setTimeout(() => { squash(0.45, dir); wobble(dir); this.sfx('pat'); }, 380 * 0.55);
        await p;
        await wait(i === 0 ? 240 : 120);
      }
      this.rig.release('look', 200);
      await this.rig.perk();
      this.rig.face('open', 'smile', 160);
      // ---- a flick of the flipper and up it goes, onto its head ----
      let landed: Promise<void> = Promise.resolve();
      await this.rig.boop(dir, () => {
        this.sfx('kick', { v: 0.7 });
        this.dust(bx, 0.8);
        this.rig.balance();
        const p = perch();
        landed = fly(p.x, p.b, 640, 70, -dir * 300);
      });
      await landed;
      squash(0.6); this.sfx('bounce', { v: 0.6 });
      // ---- headers: the head gives under it and pops it up, three times, each higher; the last sends it away ----
      const away: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const p = perch(); const S = this.S;
        // the ball rides the head down and up to the pop (rig.header: 3 down at 0.28, up at 0.46 of 420 ms)
        const dip = moveTo(p.x, p.b - (3 + i * 2.5) * S, 420 * 0.46, (dx, dy, t) => [dx * (1 - t), t < 0.61 ? dy + 3 * S * (t / 0.61) * (2 - t / 0.61) : (dy + 3 * S) * (1 - (t - 0.61) / 0.39)]);
        let flight: Promise<void> = Promise.resolve();
        await this.rig.header(i, () => {
          this.sfx('bonk', { rate: 1 + i * 0.12 });
          if (i < 2) { const q = perch(); flight = fly(q.x + rand(-3, 3), q.b, 560 + i * 90, 70 + i * 40, rand(-120, 120)); }
          else {
            // the last one: up and away across the room, down to the floor on the far side
            const far = clamp(this.st.x + away * rand(200, 250), EDGE, WORLD.w - EDGE);
            flight = fly(far, FLOOR_B, 900, 90, away * 540).then(async () => {
              squash(0.8, away); this.dust(bx, 0.7); this.sfx('bounce');
              const room = away > 0 ? WORLD.w - EDGE - bx : bx - EDGE;
              const on = Math.min(rand(60, 110), Math.max(0, room));
              await fly(bx + away * on * 0.5, FLOOR_B, 380, 26, away * 160);
              squash(0.5, away); this.sfx('bounce', { v: 0.6 });
              await roll(clamp(bx + away * on * 0.5, EDGE, WORLD.w - EDGE), 700);
              if (on < 60) { squash(0.6, -away as Dir); await roll(bx - away * 30, 420); }
            });
          }
        });
        await dip;
        await flight;
        if (i < 2) squash(0.5);
        if (i === 2) break;
      }
      // ---- off it goes; very pleased with itself ----
      this.rig.release('balance', 300);
      this.rig.look(away * 0.9, 0.5);
      await wait(300);
      this.hearts(3);
      this.voice('happy');
      await this.rig.flap(4);
      this.rig.release('look', 300);
      await wait(700);
      this.rig.restFace();
      void yarn.remove(420, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
      await wait(220);
    });
  }

  /** The cat strains, a poop appears behind it, it hops away relieved. The poop stays until cleaned. */
  poop() {
    return this.run('poop', async () => {
      if (this.st.poop) return;
      const side: Dir = this.st.x > WORLD.w / 2 ? 1 : -1;          // poop toward the wall, hop toward the room
      this.rig.facing(-side as Dir);
      this.rig.squat();
      await wait(520);
      // three pushes, each a little harder, with a grimace at the top of each
      for (let i = 0; i < 3; i++) {
        await this.rig.push(i);
        if (i === 1) void this.rig.sweat();
      }
      await wait(200);
      // it comes out from under the cat: starts hidden behind the body and slides out sideways as it grows
      const from = this.own?.tune?.poopFrom;
      const out = from ? this.at(from[0], from[1], 1) : null;
      const seat = this.own?.tune?.poopBehind; const behind = seat ? this.at(seat[0], seat[1], 1) : null;
      const poop = out ? this.layPoop(out.x, true) : behind ? this.layPoop(behind.x, false) : this.layPoop(this.st.x + side * this.poopX(), false);
      if (behind) {
        // born small at his seat, behind him, it grows as it comes out, then drops straight down to the floor between his
        // feet, landing with a squash and a little bounce
        const drop = (WORLD.floor - 4) - behind.y;
        poop.anim([
          { transform: `translate(0, ${-drop}px) scale(0.14, 0.18)`, offset: 0, easing: 'ease-out' },
          { transform: `translate(0, ${-drop + 7}px) scale(0.46, 0.56)`, offset: 0.36, easing: 'ease-in-out' },
          { transform: `translate(0, ${-drop + 13}px) scale(0.58, 0.74)`, offset: 0.47, easing: 'cubic-bezier(.55,0,1,.6)' },
          { transform: 'translate(0, 0) scale(1.16, 0.78)', offset: 0.72, easing: 'ease-out' },
          { transform: 'translate(0, -6px) scale(0.95, 1.07)', offset: 0.86, easing: 'ease-in' }, { transform: 'translate(0, 0) scale(1)', offset: 1 },
        ], { duration: 940 });
      } else if (out) {
        // born small at the spot, it grows as it comes out and drops to the floor in front of him, landing with a squash
        const drop = (WORLD.floor + 6) - out.y;
        poop.anim([
          { transform: `translate(0, ${-drop}px) scale(0.18, 0.22)`, offset: 0, easing: 'ease-out' },
          { transform: `translate(0, ${-drop + 4}px) scale(0.5, 0.62)`, offset: 0.34, easing: 'ease-in-out' },
          { transform: `translate(0, ${-drop + 10}px) scale(0.72, 0.9)`, offset: 0.5, easing: 'ease-in' },
          { transform: 'translate(0, 0) scale(1.16, 0.78)', offset: 0.74, easing: 'ease-out' },
          { transform: 'translate(0, -6px) scale(0.95, 1.07)', offset: 0.87, easing: 'ease-in' }, { transform: 'translate(0, 0) scale(1)', offset: 1 },
        ], { duration: 900 });
      } else if (this.rig.character === 'sahur') {
        // sahur is a log on legs: it comes out of the base of the log, behind him, and drops to the floor beside a
        // foot, landing with a squash (the base is svg y=138; the drop is about 100 world units)
        const drop = (WORLD.floor - 4) - (this.B.top + 138 * this.S + 8);
        poop.anim([
          { transform: `translate(${-side * 60}px, ${-drop}px) scale(0.3, 0.2)`, offset: 0, easing: 'ease-out' },
          { transform: `translate(${-side * 54}px, ${-drop + 6}px) scale(0.85, 0.7)`, offset: 0.38, easing: 'ease-in' },
          { transform: 'translate(0, 0) scale(1.15, 0.8)', offset: 0.72, easing: 'ease-out' },
          { transform: 'translate(0, -6px) scale(0.96, 1.06)', offset: 0.86, easing: 'ease-in' }, { transform: 'translate(0, 0) scale(1)', offset: 1 },
        ], { duration: 720 });
      } else poop.anim([
        { transform: `translateX(${-side * 44}px) scale(0.5, 0.3)`, offset: 0, easing: 'ease-out' },
        { transform: `translateX(${-side * 14}px) scale(0.9, 0.8)`, offset: 0.55, easing: 'ease-in-out' },
        { transform: 'translateX(0) scale(1.06, 0.94)', offset: 0.82, easing: 'ease-in-out' }, { transform: 'translateX(0) scale(1)', offset: 1 },
      ], { duration: 620 });
      this.sfx('plop', { delay: out ? 0.64 : behind ? 0.66 : this.rig.character === 'sahur' ? 0.5 : 0.3 });
      this.poopProp = poop;
      this.set({ poop: true });
      // (from behind him, it is seen falling between his legs: he stays down until it has landed)
      await wait(behind ? 720 : 260);
      this.rig.release('squat', 260);
      this.rig.face('open', 'smile', 200);
      await wait(160);
      await this.jumpTo(this.st.x - side * 96);
      this.rig.look(side * 0.9, 0.35);
      await this.rig.perk();
      this.puff(this.st.x - side * 20, this.headPos().y - 40, 56);   // phew
      this.sfx('phew');
      await wait(600);
      this.rig.release('look', 300);
      this.rig.restFace();
      await wait(200);
    });
  }

  /** How far out to the side a poop comes out (from the pet's middle), per character. */
  private poopX() { return this.own?.tune?.poopX ?? (this.rig.character === 'sahur' ? 68 : this.rig.character === 'seal' ? 74 : 52); }
  /** A poop on the floor at x: tappable (the page's clean, or the scene's own in the demo), its stink rising. In the
   *  front layer when it comes out in front of the pet (`poopFrom`), else behind it. */
  private layPoop(x: number, front: boolean) {
    const poop = new Prop(front ? this.L.front : this.L.back, 'poop', 72, 'prop-poop-live').place(x, front ? WORLD.floor + 6 : WORLD.floor - 4);
    poop.el.style.transformOrigin = '50% 100%';
    poop.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.onPoopTap?.()) return; void this.clean(); });
    if (!reduceMotion()) poop.findAll('#stink .s').forEach((s, i) => {
      s.style.transformBox = 'fill-box'; s.style.transformOrigin = '50% 100%';
      s.animate([{ transform: 'translateY(0) scaleX(1)', opacity: 0 }, { transform: 'translateY(-4px) scaleX(-1)', opacity: 0.9, offset: 0.4 }, { transform: 'translateY(-12px) scaleX(1)', opacity: 0 }], { duration: 2400, iterations: Infinity, easing: 'ease-in-out', delay: i * 800 });
    });
    return poop;
  }
  /** The chain says the poop is gone (cleaned from another tab, from Emotown, by the page's "All" row): it goes quietly. */
  clearPoop() {
    if (this.destroyed || this.isBusy || !this.poopProp) return;
    const p = this.poopProp; this.poopProp = null;
    void p.remove(300);
    this.set({ poop: false });
  }
  /**
   * Open the room on the pet as it already is, with no animation into it: the page has just switched to this pet (or
   * opened its page). Asleep, or a ghost over its grave, with its poop already down, dressed, every fade finished, so
   * the first frame drawn is the pet as it is. (The actions animate what happens WHILE you watch; arriving at a pet
   * that is asleep must not replay it nodding off, nor a dead one dying again, nor a pooped one pooping.)
   */
  arrive(s: { sleeping: boolean; dead: boolean; poop: boolean; sad: boolean; dirty: boolean; crown: boolean; costumes: readonly Costume[]; hair: boolean }) {
    if (this.destroyed || this.isBusy) return;
    this.rig.setCrown(s.crown, 0);
    this.rig.setCostumes(s.costumes, 0);
    this.rig.setHair(s.hair, 0);
    this.rig.setDirty(s.dirty);
    this.sad = s.sad;
    if (s.dead) {
      this.rig.ghostNow();
      this.grave = this.graveProp();
      this.set({ dead: true });
    } else {
      if (s.sleeping) { this.rig.face('closed', 'idle', 0); this.set({ sleeping: true }); this.snore(true); }
      // the poop lies where it would after the pet hopped away from it
      if (s.poop) { this.poopProp = this.layPoop(clamp(this.st.x + this.poopX() + 96, WALK_MIN - 40, WALK_MAX + 40), false); this.set({ poop: true }); }
    }
    this.settleMood();
    this.rig.settle();
  }

  /** A scoop slides in, flings the poop away in a puff, sparkles; the cat approves. */
  clean() {
    if (!this.st.poop || !this.poopProp) return Promise.resolve();
    return this.run('clean', async () => {
      const poop = this.poopProp; if (!poop) return;
      const px = poop.el.offsetLeft + poop.w / 2;
      const side: Dir = px > this.st.x ? 1 : -1;                     // the scoop comes from beyond the poop
      this.rig.look(side * 0.9, 0.4);
      const scoop = new Prop(this.L.front, 'scoop', 96).place(px + side * 24, WORLD.floor + 6);
      scoop.inner.style.transform = side > 0 ? 'scaleX(-1)' : '';
      scoop.el.style.transformOrigin = '50% 90%';
      const inX = side * 260;
      this.sfx('slide', { dur: 0.3, v: 0.5 });
      await scoop.anim([{ transform: `translateX(${inX}px) rotate(${side * 10}deg)`, opacity: 0 }, { transform: `translateX(${inX * 0.7}px) rotate(${side * 10}deg)`, opacity: 1, offset: 0.2 }, { transform: 'translateX(0) rotate(0)', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
      const push = scoop.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${-side * 18}deg) translateX(${-side * 10}px)` }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
      this.sfx('scoop');
      await push.finished;
      this.sfx('whoosh', { dur: 0.45, v: 0.8 });
      const fling: KeyframeAnimationOptions = { duration: 520, easing: 'cubic-bezier(.4,0,.9,.4)', fill: 'forwards' };
      poop.anim([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${side * 120}px,-120px) rotate(${side * 40}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${side * 300}px,-40px) rotate(${side * 160}deg)`, opacity: 0 }], fling);
      scoop.anim([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${side * 80}px,-90px) rotate(${-side * 30}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${side * 320}px,-30px)`, opacity: 0 }], fling);
      this.puff(px, WORLD.floor + 6, 84);
      this.sparkles(4, px, WORLD.floor - 20, 50);
      await wait(200);
      this.rig.face('happy', 'smile');
      this.voice('happy');
      await this.rig.hop();
      await wait(360);
      poop.el.remove(); scoop.el.remove();
      this.poopProp = null;
      this.set({ poop: false });
      this.onCleaned?.();
      this.rig.release('look', 300);
      this.rig.restFace();
      await wait(120);
    });
  }

  /** The tub jump's height: a tall hat would hit the ceiling at the top of the leap, so it jumps less high; sahur stands 1.4x and his cap is already near the ceiling. */
  private tubJump() {
    const w = this.rig.wearing; const frog = this.rig.character === 'frog';
    if (this.own?.tune?.tubJump !== undefined) return this.own.tune.tubJump;
    if (this.rig.character === 'sahur') return 54;
    return 118 - (w.includes('witch') && frog ? 34 : w.includes('pumpkin') && frog ? 10 : 0);
  }
  /** The cat leaps straight up, the tub slides in underneath, splash. Bubbles, a sponge, foam, a shake, then the reverse. */
  wash() {
    return this.run('wash', async () => {
      const cx = clamp(this.st.x, TUB_W / 2 + 10, WORLD.w - TUB_W / 2 - 10);
      if (Math.abs(cx - this.st.x) > 6) await this.walkTo(cx);
      const from: Dir = cx <= WORLD.w / 2 ? 1 : -1;                  // tub arrives from the roomier side
      const bottom = WORLD.floor + 44;
      const JUMP = 1300;
      // the cat hears it coming
      this.voice('huh');
      await this.rig.perk();
      this.rig.look(from * 0.8, 0.3);
      await wait(380);
      this.rig.release('look', 200);
      // up it goes; while it hangs, the tub slides under it; it comes down into the water
      this.set({ inTub: true });
      this.L.cat.style.top = `${this.B.hostTop + SINK}px`;
      const sink = this.L.cat.animate([
        { transform: `translateY(${-SINK}px)`, offset: 0 }, { transform: `translateY(${-SINK}px)`, offset: 0.64, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'translateY(0)', offset: 0.86 }, { transform: 'translateY(0)', offset: 1 },
      ], { duration: JUMP, composite: 'add' });
      const jump = this.rig.superJump(JUMP, this.tubJump());
      await wait(JUMP * 0.3);
      const back = new Prop(this.L.back, 'tubBack', TUB_W).place(cx, bottom);
      const front = new Prop(this.L.front, 'tubFront', TUB_W).place(cx, bottom);
      const slide: Keyframe[] = [{ transform: `translateX(${from * 480}px)`, offset: 0, easing: 'cubic-bezier(.15,.7,.25,1)' }, { transform: `translateX(${-from * 6}px)`, offset: 0.85, easing: 'ease-in-out' }, { transform: 'translateX(0)', offset: 1 }];
      back.anim(slide, { duration: 420 }); front.anim(slide, { duration: 420 });
      this.sfx('slide', { dur: 0.42 });
      const waterY = bottom - front.h * 0.6;
      setTimeout(() => { this.sfx('splash'); this.droplets(8, cx - 50, waterY, 1.1); this.droplets(8, cx + 50, waterY, 1.1); this.puff(cx - 78, waterY + 22, 60); this.puff(cx + 78, waterY + 22, 60); }, JUMP * 0.84 - JUMP * 0.3);
      await jump; await sink.finished.catch(() => {});
      // sahur stands 1.4x with long legs and a bat: below the tub's body, between its feet, they showed through. While
      // he is in the tub the host is cut off at the tub's bottom edge (the tub's picture ends at 126 of its 140).
      if (this.rig.character === 'sahur' || this.own?.tune?.tubClip) this.L.cat.style.clipPath = `inset(0 0 ${this.B.hostH - ((bottom - front.h + front.h * (126 / 140)) - (this.B.hostTop + SINK))}px 0)`;
      this.rig.soak();
      this.rig.face('happy', 'smile');
      // bubbles rise while a sponge scrubs and foam builds on the hair
      let bubbling = true;
      const fizz = this.sfx('bubbles', { dur: 4.4 });
      const bubbleLoop = async () => { while (bubbling && !this.destroyed) { this.bubble(cx + rand(-120, 120), waterY - rand(0, 10)); await wait(rand(140, 260)); } };
      void bubbleLoop();
      await wait(500);
      const head = this.headPos();
      const sponge = new Prop(this.L.front, 'sponge', 66).place(head.x + 64, head.y - 26);
      sponge.el.style.transformOrigin = '50% 50%';
      sponge.anim([{ transform: 'translateY(-50px) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      await wait(300);
      this.rig.face('squeeze', 'smile', 200);
      this.voice('giggle');
      this.sfx('scrub', { n: 12, gap: 0.225 });
      const wiggle = this.rig.wiggle();
      const scrub = sponge.anim([
        { transform: 'translate(0,0) rotate(0)', offset: 0 }, { transform: 'translate(-40px,-34px) rotate(-18deg)', offset: 0.25 },
        { transform: 'translate(-124px,-10px) rotate(-36deg)', offset: 0.5 }, { transform: 'translate(-70px,16px) rotate(-12deg)', offset: 0.75 },
        { transform: 'translate(0,0) rotate(0)', offset: 1 },
      ], { duration: 900, iterations: 3, easing: 'ease-in-out' });
      const foam = new Prop(this.L.front, 'foam', 84).place(head.x - 6, head.y - 44);
      foam.el.style.opacity = '0';
      foam.el.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900, delay: 500, fill: 'forwards', easing: 'ease-out' });
      setTimeout(() => this.rig.setDirty(false), 900);
      await scrub.finished.catch(() => {});
      void sponge.remove(300, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60px)', opacity: 0 }]);
      await wiggle.stop();
      bubbling = false; fizz(500);
      this.rig.face('closed', 'smile', 200);
      await wait(260);
      // shake it off: the foam flies, droplets everywhere
      this.sfx('shake');
      const shake = this.rig.shake();
      const h2 = this.headPos();
      foam.el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(-30px,-70px) scale(1.2)', opacity: 0 }], { duration: 500, delay: 80, fill: 'forwards', easing: 'ease-out' }).finished.then(() => foam.el.remove(), () => foam.el.remove());
      this.droplets(9, h2.x, h2.y - 20, 1.2);
      setTimeout(() => this.droplets(7, h2.x, h2.y - 30, 1.1), 220);
      await shake;
      this.rig.face('happy', 'smile', 200);
      this.sparkles(6, h2.x, h2.y - 20, 110);
      await wait(480);
      // and out: straight up, the tub slides away underneath, land on the floor
      this.rig.release('soak', 400);
      this.set({ inTub: false });
      this.L.cat.style.top = `${this.B.hostTop}px`;
      const rise = this.L.cat.animate([
        { transform: `translateY(${SINK}px)`, offset: 0 }, { transform: `translateY(${SINK}px)`, offset: 0.12, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'translateY(0)', offset: 0.4 }, { transform: 'translateY(0)', offset: 1 },
      ], { duration: JUMP, composite: 'add' });
      const jump2 = this.rig.superJump(JUMP, this.tubJump());
      this.sfx('land', { delay: (JUMP * 0.86) / 1000 });
      this.droplets(5, cx - 30, waterY, 0.7); this.droplets(5, cx + 30, waterY, 0.7);
      await wait(JUMP * 0.4);
      const leave: Keyframe[] = [{ transform: 'translateX(0)', easing: 'cubic-bezier(.5,0,.8,.5)' }, { transform: `translateX(${from * 520}px)` }];
      void back.remove(360, leave); void front.remove(360, leave);
      this.sfx('slide', { dur: 0.36, v: 0.8 });
      await jump2; await rise.finished.catch(() => {});
      this.L.cat.style.clipPath = '';
      const wag = this.rig.wag();
      this.hearts(2);
      this.voice('happy');
      await wait(1100);
      await wag.stop();
      this.rig.restFace();
    });
  }

  /** A ball of yarn rolls in. Curious tilt, creep up, two pats, butt wiggle, pounce over it, bat it across the room, chase, catch, bunny kicks, then sit proud with it. */
  play() {
    if (this.toy === 'dreidel') return this.run('play', () => this.spinDreidel());
    if (this.toy === 'darbuka') return this.run('play', () => this.drumDarbuka());
    if (this.toy === 'guitar') return this.run('play', () => this.playGuitar());
    const own = this.own?.play; if (own) return this.run('play', () => own());
    if (this.rig.character === 'seal') return this.playSeal();
    return this.run('play', async () => {
      const YW = 62; const circ = Math.PI * YW;
      const Y_MIN = WALK_MIN + 78; const Y_MAX = WALK_MAX - 78;
      const REACH = this.rig.character === 'sahur' ? 78 : 56;         // paw tip lands past the ball's centre on a swipe (sahur: where his bent-over hand and his resting bat tip land)
      const dir: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;            // yarn arrives from the roomier side
      let yarnX = clamp(this.st.x + dir * 190, Y_MIN, Y_MAX);
      const yarn = new Prop(this.L.front, 'yarn', YW).place(yarnX, WORLD.floor + 8);
      const tails = { L: yarn.find('#yarntail'), R: yarn.find('#yarntail2') };
      for (const t of Object.values(tails)) if (t) t.style.opacity = '0';
      const ball = yarn.find('#ball');
      if (ball) { ball.style.transformBox = 'fill-box'; ball.style.transformOrigin = '50% 100%'; }
      // the ball's spin is kept as a base transform on the inner element so rolls chain without a snap
      let rot = 0;
      const spin = (deg: number) => { yarn.inner.style.transform = `rotate(${deg}deg)`; };
      const rollTo = async (nx: number, ms: number, hop = 0, easing = 'cubic-bezier(.1,.6,.3,1)') => {
        const d = nx - yarnX; const dr = (d / circ) * 360;
        const move: Keyframe[] = hop
          ? [{ transform: 'translate(0,0)', easing: 'ease-out' }, { transform: `translate(${d * 0.22}px, ${-hop}px)`, offset: 0.2, easing: 'ease-in' }, { transform: `translate(${d * 0.4}px, 0)`, offset: 0.36, easing }, { transform: `translate(${d}px, 0)` }]
          : [{ transform: 'translateX(0)', easing }, { transform: `translateX(${d}px)` }];
        const turn: Keyframe[] = hop
          ? [{ transform: `rotate(${rot}deg)`, easing: 'ease-out' }, { transform: `rotate(${rot + dr * 0.22}deg)`, offset: 0.2, easing: 'ease-in' }, { transform: `rotate(${rot + dr * 0.4}deg)`, offset: 0.36, easing }, { transform: `rotate(${rot + dr}deg)` }]
          : [{ transform: `rotate(${rot}deg)`, easing }, { transform: `rotate(${rot + dr}deg)` }];
        const a1 = yarn.anim(move, { duration: ms, fill: 'forwards' });
        const a2 = yarn.inner.animate(turn, { duration: ms, fill: 'forwards' });
        yarnX = nx; rot += dr;
        await Promise.all([a1.finished.catch(() => {}), a2.finished.catch(() => {})]);
        yarn.place(yarnX, WORLD.floor + 8); spin(rot); a1.cancel(); a2.cancel();
      };
      const squash = (k: number, side: Dir) => ball?.animate([{ transform: 'scale(1,1)' }, { transform: `scale(${1 + 0.22 * k}, ${1 - 0.2 * k}) translateX(${side * 3 * k}px)`, offset: 0.3, easing: 'ease-out' }, { transform: `scale(${1 - 0.04 * k}, ${1 + 0.05 * k})`, offset: 0.7 }, { transform: 'scale(1,1)' }], { duration: 380, easing: 'ease-in-out', composite: 'add' });
      const wobble = (side: Dir) => yarn.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${side * 9}deg) translateX(${side * 3}px)`, offset: 0.35, easing: 'ease-out' }, { transform: `rotate(${-side * 4}deg)`, offset: 0.7 }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-in-out' });
      const showTail = (rollDir: Dir) => { const t = rollDir > 0 ? tails.L : tails.R; t?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200, fill: 'forwards' }); };
      // roll in from off-stage and settle with a wobble
      yarnX = yarnX + dir * 330;                                     // start off-stage, roll to the spot
      yarn.place(yarnX, WORLD.floor + 8);
      const target = yarnX - dir * 330;
      const inRoll = rollTo(target, 1150, 0, 'cubic-bezier(.2,.6,.3,1)').then(() => wobble(-dir as Dir));
      this.sfx('roll', { dur: 1.1 });
      await wait(380);
      this.rig.facing(dir);
      this.voice('huh');
      await this.rig.perk();
      this.rig.look(dir * 0.9, 0.5);
      this.rig.tilt(dir);
      await wait(700);
      this.rig.release('tilt', 300);
      await inRoll;
      // creep up and pat it, twice
      await this.walkTo(yarnX - dir * REACH, 'creep');
      this.rig.look(dir * 0.8, 0.8);
      await wait(200);
      for (let i = 0; i < 2; i++) {
        const p = this.rig.pat(dir);
        setTimeout(() => { this.sfx('pat'); squash(0.4, dir); wobble(dir); if (i === 1) void rollTo(clamp(yarnX + dir * 34, Y_MIN, Y_MAX), 700); }, 130);
        await p;
        await wait(i === 0 ? 260 : 120);
      }
      await this.rig.perk();
      // wind up, pounce over it, and bat it back across the room; it hops off the paw and bounces off the wall if it gets there
      this.rig.crouch(dir);
      await this.rig.wiggleButt();
      await wait(120);
      this.rig.release('crouch', 200);
      this.rig.release('look', 200);
      await this.jumpTo(yarnX + dir * REACH);
      const back: Dir = -dir as Dir;
      this.rig.facing(back);
      const bat = this.rig.bat(back);
      await wait(110);
      squash(1, back); this.sfx('kick'); this.sfx('roll', { dur: 0.9, v: 0.7, delay: 0.12 });
      const room = back > 0 ? Y_MAX - yarnX : yarnX - Y_MIN;
      const want = rand(190, 240);
      const hitsWall = want > room;
      const far = clamp(yarnX + back * Math.min(want, room), Y_MIN, Y_MAX);
      showTail(back);
      const rolled = rollTo(far, 1050, 22).then(async () => { if (hitsWall) { this.sfx('bounce'); squash(0.7, -back as Dir); await rollTo(far - back * 30, 420); } });
      this.rig.look(back * 0.9, 0.5);
      await bat;
      this.rig.face('open', 'open', 120);
      await wait(260);
      this.rig.face('open', 'idle', 160);
      // chase it down and land on it
      this.rig.release('look', 200);
      await this.walkTo(yarnX - back * 96, 'run');
      await rolled;
      this.rig.crouch(back);
      await wait(260);
      this.rig.release('crouch', 160);
      await this.jumpTo(yarnX);
      squash(0.6, 1); this.sfx('bounce', { v: 0.6 });
      this.rig.hug();
      this.voice('happy', { delay: 0.15 });
      await wait(500);
      // bunny kicks with the ball bouncing between the feet, then sit proud with it
      const kicks = 5;
      yarn.anim([{ transform: 'translateY(0)', easing: 'ease-in-out' }, { transform: 'translateY(-9px)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'translateY(0)' }], { duration: 170, iterations: kicks });
      await this.rig.bunnyKick(kicks);
      this.hearts(3);
      await wait(1500);
      this.rig.release('hug', 400);
      this.rig.restFace();
      void yarn.remove(420, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
      await wait(220);
    });
  }

  /**
   * The dreidel (the Jewish pack's toy item), what `play()` brings out instead of the ball of yarn when it is the toy.
   * It drops in and lands on its point; the pet comes up, takes the stem and flicks it spinning. The faces turn past (16
   * drawn turns of a modelled dreidel, dreidelprops.py, one shown at a time), it precesses and drifts off, slows, wobbles
   * wider and falls over on a random letter, which comes up on a badge. The pet answers the letter the way the game
   * does: gimel (all of it) a shower of gelt and a jump for joy, hei (half) a little gelt and a hop, nun (nothing) a
   * shrug, shin (put one in) a coin given up and a sigh. About 8.5 s, like the yarn.
   */
  private async spinDreidel() {
    const ch = this.rig.character;
    const B = DREIDEL;
    const T = this.own?.tune?.dreidel;
    const W = T?.w ?? DREIDEL_W[ch as keyof typeof DREIDEL_W];
    const k = W / B.box[0];                                       // world units per drawing unit
    const bottom = WORLD.floor + (B.box[1] - B.tip[1]) * k;     // the point on the floor
    const REACH = T?.reach ?? DREIDEL_REACH[ch as keyof typeof DREIDEL_REACH];   // pet centre to the dreidel's point at the grip (measured)
    const DRIFT = 40;                                             // how far it wanders off while it spins
    // sahur only twists with his free hand, on his right; the cat on her left, where the tail is not (on the right it
    // stood in the tail); the frog turns to face it, so he takes it on the roomier side
    const dir: Dir = T?.dir ?? (ch === 'sahur' ? 1 : ch === 'cat' ? -1 : this.st.x < WORLD.w / 2 ? 1 : -1);
    // where it lands: in front of the pet, with room beyond for the drift and the fall (the lying dreidel's far end)
    const beyond = DRIFT + B.lying * k;
    const lo = dir > 0 ? WALK_MIN + REACH : 20 + beyond; const hi = dir > 0 ? WORLD.w - 20 - beyond : WALK_MAX - REACH;
    const X0 = clamp(this.st.x + dir * (REACH + 64), lo, hi);
    const stand = X0 - dir * REACH;
    // too close (it would drop on the pet): step back to the spot first
    if (dir * (X0 - this.st.x) < REACH + 34) await this.walkTo(stand);
    this.set({ dir }); this.rig.facing(dir);

    // behind the pet: the paw, sleeve or hand that takes the stem is drawn over it (it never lies across the pet)
    const dre = new Prop(this.L.back, 'dreidel', W).place(X0, bottom);
    const inner = dre.inner;
    inner.style.transformOrigin = `50% ${(B.tip[1] / B.box[1]) * 100}%`;    // everything it does on its point turns about the point
    // its own GPU layer for the whole play: every tilt below is a new animation on this element, and without this the
    // browser promoted it for each one and dropped it after, re-rastering the whole 120 KB drawing into a fresh layer
    // each time, and showed nothing until that was done (the dreidel blinked out for 1-4 frames at the landing, the
    // start of the spin, the topple and the fall; measured on Chrome's own screen frames)
    inner.style.willChange = 'transform';
    const frames = Array.from({ length: B.frames }, (_, i) => dre.find(`.df${i}`)!);
    const whirl = dre.find('.dwhirl');
    // the frames are switched by VISIBILITY, never opacity: Chrome gives every SVG element with a running opacity (or
    // transform) animation its own GPU layer, so each phase of the spin made 16 new layers as it started and dropped
    // them as it ended, and the dreidel blinked out for 1-4 frames while they were rastered (the landing, the start of
    // the spin, the topple, the fall; measured on Chrome's own screen frames). Visibility is never composited.
    for (const f of frames) f.style.opacity = '1';
    const show = (i: number) => frames.forEach((f, j) => { f.style.visibility = j === i ? 'visible' : 'hidden'; });
    let frame = Math.floor(rand(0, B.frames));
    show(frame);
    /**
     * Turn through the frames by a schedule: `turned(t)` is how many frames have gone by at t ms. The frames are
     * switched by visibility keyframes (Web Animations, so the recorder's slowed clock slows them too; a discrete
     * property flips exactly at a pair of keyframes on one offset), and the end frame is set underneath first so nothing
     * blinks when the animations drop off. Resolves with the frame it ends on.
     */
    const turn = (ms: number, turned: (t: number) => number, sign: 1 | -1) => {
      const N = frames.length; const start = frame;
      const at = (t: number) => (((start + sign * Math.floor(turned(t))) % N) + N) % N;
      const segs: [number, number, number][] = [];
      let cur = at(0); let t0 = 0;
      for (let t = 4; t < ms; t += 4) { const i = at(t); if (i !== cur) { segs.push([cur, t0, t]); cur = i; t0 = t; } }
      segs.push([cur, t0, ms]);
      frame = cur; show(frame);
      const anims = frames.map((f, j) => {
        const kf: Keyframe[] = [{ visibility: 'hidden', offset: 0 }];
        for (const [i, a, b] of segs) if (i === j) kf.push({ visibility: 'hidden', offset: a / ms }, { visibility: 'visible', offset: a / ms }, { visibility: 'visible', offset: b / ms }, { visibility: 'hidden', offset: b / ms });
        kf.push({ visibility: 'hidden', offset: 1 });
        return f.animate(kf, { duration: ms, easing: 'linear' });
      });
      return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => frame);
    };
    /** The point stays put, the drawing turns about it: `deg` over time as keyframes, the end value set underneath. */
    const tip = (kf: Keyframe[], ms: number, easing = 'linear') => {
      const last = kf[kf.length - 1]!.transform as string;
      inner.style.transform = last;
      return inner.animate(kf, { duration: ms, easing }).finished.catch(() => {});
    };

    // ---- it drops in, turning a little in the air, and lands on its point: a squash and a weeble's wobble ----
    const DROP = 620;
    const fall = dre.el.animate([{ transform: 'translateY(-300px)', easing: 'cubic-bezier(.45,0,.9,.55)' }, { transform: 'translateY(0)' }], { duration: DROP, composite: 'add' }).finished.catch(() => {});
    void tip([{ transform: `rotate(${-dir * 24}deg)` }, { transform: 'rotate(0deg)' }], DROP, 'ease-in');
    void turn(DROP, (t) => t * 0.011, dir > 0 ? 1 : -1);
    this.sfx('dreidel.drop', { delay: DROP / 1000 });
    this.rig.look(dir * 0.5, -0.9);
    void this.rig.perk();
    await wait(DROP * 0.7);
    this.rig.look(dir * 0.8, 0.4);
    await fall;
    this.dust(X0);
    await tip([{ transform: 'none' }, { transform: 'scale(1.14, 0.8)', offset: 0.35, easing: 'ease-out' }, { transform: 'scale(0.95, 1.06)', offset: 0.7 }, { transform: 'none' }], 300, 'ease-in-out');
    this.rig.tilt(dir);
    this.rig.face('open', 'open', 140);
    this.voice('huh');
    await tip([{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 13}deg)`, offset: 0.18 }, { transform: `rotate(${-dir * 9}deg)`, offset: 0.42 }, { transform: `rotate(${dir * 5}deg)`, offset: 0.64 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.84 }, { transform: 'rotate(0deg)' }], 720, 'ease-in-out');
    this.rig.release('tilt', 260);
    this.rig.face('open', 'idle', 200);

    // ---- up to it, and a twist of the stem ----
    await this.walkTo(stand, 'creep');
    this.set({ dir }); this.rig.facing(dir);
    this.rig.look(dir * 0.7, 0.2);
    await wait(160);
    const SPIN = 2800;
    const sign: 1 | -1 = dir > 0 ? -1 : 1;                   // the paw snaps back toward the pet: the front faces go its way
    const twist = this.rig.twist(dir);
    await wait(PetRig_TWIST.ms * PetRig_TWIST.flick);
    this.sfx('dreidel.flick'); this.sfx('dreidel.spin', { dur: SPIN / 1000 });
    // ---- it spins: fast (the whirl rings), then slower, the precession opening out; it drifts away from the pet ----
    const w0 = 0.072; const w1 = 0.0085;                          // frames a ms: 4.5 turns a second down to half a turn
    const spun = turn(SPIN, (t) => w1 * t + ((w0 - w1) * SPIN / 3) * (1 - (1 - t / SPIN) ** 3), sign);
    // the rings fade by stroke-opacity (a paint property, never composited: see the frames above)
    if (whirl) { whirl.style.opacity = '1'; whirl.style.strokeOpacity = '0'; }
    whirl?.animate([{ strokeOpacity: 0 }, { strokeOpacity: 1, offset: 0.04 }, { strokeOpacity: 0.9, offset: 0.3 }, { strokeOpacity: 0, offset: 0.5 }, { strokeOpacity: 0 }], { duration: SPIN });
    const P = 380; const end = dir > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;   // it leans the way it will fall, at the end
    const phase0 = end - (2 * Math.PI * SPIN) / P;
    const wob: Keyframe[] = [];
    for (let t = 0; t <= SPIN; t += 25) {
      const amp = 1.2 + 10.5 * (t / SPIN) ** 2.2;
      wob.push({ transform: `rotate(${(amp * Math.sin(phase0 + (2 * Math.PI * t) / P)).toFixed(2)}deg)`, offset: t / SPIN });
    }
    wob[wob.length - 1] = { transform: `rotate(${(dir * 11.7).toFixed(2)}deg)`, offset: 1 };
    void tip(wob, SPIN);
    const X1 = X0 + dir * DRIFT;
    dre.place(X1, bottom);
    const drift = dre.el.animate([{ transform: `translateX(${-dir * DRIFT}px)` }, { transform: 'translateX(0)' }], { duration: SPIN, easing: 'cubic-bezier(.25,.6,.4,1)', composite: 'add' }).finished.catch(() => {});
    await twist;
    // the pet is delighted, bounces, follows it with its eyes
    this.rig.face('happy', 'smile', 180);
    this.voice('happy');
    const wag = this.rig.wag();
    this.rig.look(dir * 0.9, 0.45);
    await wait(260);
    await this.rig.hop();
    await wait(300);
    this.rig.look(dir * 1, 0.5);
    await wait(700);
    // it slows: wide eyes, leaning in
    this.rig.face('open', 'open', 200);
    this.rig.lean(dir);
    await spun; await drift;
    // ---- over it goes, away from the pet, still turning a little; it lands on its side with a bounce ----
    const TOPPLE = 280;
    const letter = DREIDEL_LETTERS[Math.floor(Math.random() * 4)]!;
    void turn(TOPPLE, (t) => w1 * t * (1 - t / (2 * TOPPLE)), sign);
    this.sfx('dreidel.topple', { delay: (TOPPLE - 30) / 1000 });
    await tip([{ transform: `rotate(${dir * 11.7}deg)` }, { transform: `rotate(${dir * 58}deg)` }], TOPPLE, 'cubic-bezier(.5,0,.9,.5)');
    // the fallen drawing sits where the tipped one's body landed: swap, no rotation, and rock about the body's foot
    const lying = dre.find(`.dl-${dir > 0 ? 'R' : 'L'}-${letter}`);
    for (const f of frames) f.style.visibility = 'hidden';
    if (lying) lying.style.opacity = '1';
    inner.style.transformOrigin = `${((B.tip[0] + dir * B.land) / B.box[0]) * 100}% ${(B.tip[1] / B.box[1]) * 100}%`;
    inner.style.transform = 'none';
    const bodyX = X1 + dir * B.land * k;
    this.dust(bodyX, 1.3);
    this.rig.release('lean', 200);
    void wag.stop();
    const settle = dre.el.animate([{ transform: 'translateY(0)', easing: 'ease-out' }, { transform: 'translateY(-7px)', offset: 0.3, easing: 'ease-in' }, { transform: 'translateY(0)', offset: 0.6, easing: 'ease-out' }, { transform: 'translateY(-2px)', offset: 0.8, easing: 'ease-in' }, { transform: 'translateY(0)' }], { duration: 420, composite: 'add' }).finished.catch(() => {});
    void tip([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-dir * 5}deg)`, offset: 0.3 }, { transform: `rotate(${dir * 3}deg)`, offset: 0.6 }, { transform: `rotate(${-dir}deg)`, offset: 0.82 }, { transform: 'rotate(0deg)' }], 520, 'ease-in-out');
    await settle;
    // ---- the letter comes up, and the pet answers it ----
    const badge = new Prop(this.L.front, 'dreidelbadge', 44).place(bodyX, WORLD.floor - 20 - 24 * (W / 160));   // just over the fallen dreidel, whatever its size
    const face = badge.find(`.db-${letter}`); if (face) face.style.opacity = '1';
    badge.anim([{ transform: 'translateY(8px) scale(0)', opacity: 0 }, { transform: 'translateY(-4px) scale(1.18)', opacity: 1, offset: 0.55, easing: 'ease-in-out' }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 380, easing: 'ease-out' });
    this.sfx('badge');
    this.rig.look(dir * 0.8, 0.6);
    await wait(420);
    const coins: Prop[] = [];
    const gelt = (n: number, cx: number, spread: number) => {
      this.sfx('coin', { n, gap: 0.09, delay: 0.6 });
      for (let i = 0; i < n; i++) setTimeout(() => {
        if (this.destroyed) return;
        const c = new Prop(this.L.front, 'gelt', rand(22, 27)).place(clamp(cx + rand(-spread, spread), 30, WORLD.w - 30), WORLD.floor + 6);
        c.inner.style.transformOrigin = '50% 100%';
        const drop = rand(260, 340); const ms = rand(760, 920);
        c.anim([{ transform: `translateY(${-drop}px)`, offset: 0, easing: 'cubic-bezier(.5,0,1,.6)' }, { transform: 'translateY(0)', offset: 0.72, easing: 'ease-out' }, { transform: 'translateY(-9px)', offset: 0.86, easing: 'ease-in' }, { transform: 'translateY(0)', offset: 1 }], { duration: ms });
        // it flips over and over as it falls, and lands flat (seen from a little above: squashed)
        c.inner.style.transform = 'scaleY(0.42)';
        c.inner.animate([{ transform: 'scaleX(1) scaleY(1)' }, { transform: 'scaleX(-1) scaleY(1)', offset: 0.24 }, { transform: 'scaleX(1) scaleY(1)', offset: 0.48 }, { transform: 'scaleX(-0.6) scaleY(1)', offset: 0.66 }, { transform: 'scaleX(1) scaleY(0.42)', offset: 0.72 }, { transform: 'scaleX(1) scaleY(0.42)' }], { duration: ms });
        coins.push(c);
      }, i * 90);
    };
    if (letter === 'gimel') {           // gantz: the whole pot
      this.rig.face('happy', 'smile', 160);
      this.sfx('dreidel.all'); this.voice('happy', { delay: 0.3 });
      gelt(10, (this.st.x + bodyX) / 2, 100);
      this.sparkles(4, bodyX, WORLD.floor - 60, 60);
      await this.rig.jump(600);
      this.hearts(3);
      await this.rig.hop();
      await wait(500);
    } else if (letter === 'hei') {      // halb: half of it
      this.rig.face('happy', 'smile', 160);
      this.sfx('dreidel.half'); this.voice('yum', { delay: 0.3 });
      gelt(3, (this.st.x + bodyX) / 2, 50);
      await this.rig.hop();
      this.hearts(1);
      await wait(1100);
    } else if (letter === 'nun') {      // nisht: nothing happens
      this.rig.release('look', 200);
      this.rig.face('open', 'idle', 160);
      await wait(200);
      this.sfx('dreidel.none'); this.voice('meh', { delay: 0.2 });
      await this.rig.meh();
      await wait(500);
    } else {                            // shtel: put one in
      this.rig.face('open', 'frown', 160);
      this.sfx('dreidel.pay'); this.sfx('coin', { delay: 0.75 }); this.voice('sad', { delay: 0.45 });
      // a coin leaves from the paw at chest height and goes into the pot by the dreidel
      const from = { x: this.st.x + dir * 34 * this.S, y: this.B.top + 150 * this.S };
      const c = new Prop(this.L.front, 'gelt', 20).place(from.x, from.y);
      coins.push(c);
      c.anim([{ transform: 'translate(0,0) scale(0.6)', opacity: 0, offset: 0, easing: 'ease-out' }, { transform: `translate(${(bodyX - from.x) * 0.15}px, -12px) scale(1)`, opacity: 1, offset: 0.2, easing: 'ease-out' }, { transform: `translate(${(bodyX - from.x) * 0.55}px, -50px) scale(1)`, offset: 0.55, easing: 'ease-in' }, { transform: `translate(${bodyX - from.x}px, ${WORLD.floor - 16 - from.y}px) scale(0.5)`, opacity: 0, offset: 1 }], { duration: 760 })
        .finished.then(() => c.el.remove(), () => c.el.remove());   // (opacity composites additively on a prop: it goes when it lands)
      await wait(300);
      this.rig.sheepish();
      await wait(1100);
      this.rig.release('sheep', 300);
    }
    this.rig.restFace();
    void badge.remove(300, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
    for (const c of coins) void c.remove(420);
    void dre.remove(420, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
    await wait(260);
  }

  /**
   * The darbuka (the Habibi pack's toy item), what `play()` brings out instead of the ball of yarn when it is the toy. The
   * goblet drum drops in beside the pet and lands on its foot with a wobble and a bong; the pet comes up to it and plays
   * the maqsum twice, DUM tek . tek DUM . tek ., then a roll and a last DUM. Every stroke lands on the head at its time
   * (the rig plays the whole thing as one animation, rig.drumPlay): the drum squashes a touch, a ripple runs over the head
   * and a note floats up (two beamed gold notes for a DUM, a turquoise one for a tek). A burst of notes, hearts, a hop (the
   * seal flaps) and the drum goes. The cat plays on her left (the tail is on her right), Sahur with his bat on his left
   * (Sahur's last DUM is a TUNG), the frok and the seal on the roomier side. About 8 s, like the yarn.
   */
  private async drumDarbuka() {
    const ch = this.rig.character as keyof typeof DARBUKA_W;
    const T = this.own?.tune?.darbuka;
    const dir: Dir = T?.dir ?? (ch === 'cat' || ch === 'sahur' ? -1 : this.st.x < WORLD.w / 2 ? 1 : -1);
    const side = ch === 'seal' && dir > 0 ? 'sealR' : ch;         // the seal's two flippers reach differently
    const B = DARBUKA;
    const W = T?.w ?? DARBUKA_W[ch];
    const k = W / B.box[0];                                         // world units per drawing unit
    const REACH = T?.reach ?? DARBUKA_REACH[side];
    const bottom = WORLD.floor + (B.box[1] - B.foot) * k;          // the foot's rim on the floor
    const half = (B.box[0] / 2) * k;
    // in the room, and where the pet's spot beside it is on the floor it can walk (so the reach is always exact)
    const lo = dir > 0 ? WALK_MIN + REACH : Math.max(16 + half, WALK_MIN - REACH); const hi = dir > 0 ? Math.min(WORLD.w - 16 - half, WALK_MAX + REACH) : WALK_MAX - REACH;
    const X0 = clamp(this.st.x + dir * (REACH + 56), lo, hi);
    const stand = X0 - dir * REACH;
    if (dir * (X0 - this.st.x) < REACH + 30) await this.walkTo(stand);   // too close: it would drop on the pet, so step to the spot first
    this.set({ dir }); this.rig.facing(dir);
    const head = { x: X0 + (B.head[0] - B.box[0] / 2) * k, y: bottom - (B.box[1] - B.head[1]) * k };

    // behind the pet: the paw, sleeve, bat or flipper that strikes it is drawn over it
    const drum = new Prop(this.L.back, 'darbuka', W).place(X0, bottom);
    const inner = drum.inner;
    inner.style.transformOrigin = `50% ${(B.foot / B.box[1]) * 100}%`;   // it squashes and rocks on its foot
    inner.style.willChange = 'transform';                                 // one layer for the whole play (the dreidel's lesson: no re-raster per animation)
    const notes: Prop[] = [];
    const note = (kind: 'dum' | 'tek', x: number, y: number, big = 1) => {
      if (this.destroyed) return;
      const w = (kind === 'dum' ? rand(27, 32) : rand(18, 22)) * big;
      const n = new Prop(this.L.front, 'darbukanote', w).place(x + dir * rand(18, 30), y);   // off the drum's far side, clear of the pet's face (the frok's is over the drum)
      const other = n.find(kind === 'dum' ? '.nt' : '.nd'); if (other) other.style.visibility = 'hidden';
      const mine = n.find(kind === 'dum' ? '.nd' : '.nt'); if (mine) mine.style.visibility = 'visible';
      const sway = dir * rand(28, 60); const rise = rand(70, 105) * (kind === 'dum' ? 1.15 : 1);   // and away from the pet as it rises
      notes.push(n);
      n.anim([
        { transform: `translate(0, 0) rotate(${rand(-10, 10)}deg) scale(0.5)`, opacity: 0, offset: 0 }, { transform: `translate(${sway * 0.25}px, ${-rise * 0.25}px) rotate(${rand(-8, 8)}deg) scale(1.1)`, opacity: 1, offset: 0.18, easing: 'ease-in-out' },
        { transform: `translate(${sway * 0.8}px, ${-rise * 0.75}px) rotate(${rand(-14, 14)}deg) scale(1)`, opacity: 1, offset: 0.7, easing: 'ease-in-out' }, { transform: `translate(${sway}px, ${-rise}px) scale(0.85)`, opacity: 0, offset: 1 },
      ], { duration: rand(1050, 1300), easing: 'ease-out' }).finished.then(() => n.el.remove(), () => n.el.remove());
    };
    /** A stroke lands: the drum gives, a ripple runs over the head, the note goes up. */
    const strike = (kind: 'dum' | 'tek') => {
      if (this.destroyed) return;
      const d = kind === 'dum';
      this.sfx(d ? 'drum.dum' : 'drum.tek');
      inner.animate([{ transform: 'none' }, { transform: d ? 'scale(1.05, 0.93)' : 'scale(1.025, 0.965)', offset: 0.3, easing: 'ease-out' }, { transform: d ? 'scale(0.985, 1.02)' : 'none', offset: 0.7 }, { transform: 'none' }], { duration: d ? 240 : 140 });
      const r = new Prop(this.L.back, 'darbukaripple', B.headR * 2 * k * 1.08).place(head.x, head.y + 3.2 * k);
      r.el.style.transformOrigin = '50% 50%';
      r.anim([{ transform: 'scale(0.3)', opacity: d ? 1 : 0.8 }, { transform: `scale(${d ? 1.02 : 0.8})`, opacity: 0 }], { duration: d ? 420 : 280, easing: 'ease-out' }).finished.then(() => r.el.remove(), () => r.el.remove());
      note(kind, head.x, head.y - 12);
    };

    // ---- it drops in and lands on its foot: a squash, a bong, a little rock ----
    const DROP = 600;
    const fall = drum.el.animate([{ transform: 'translateY(-300px)', easing: 'cubic-bezier(.45,0,.9,.55)' }, { transform: 'translateY(0)' }], { duration: DROP, composite: 'add' }).finished.catch(() => {});
    inner.animate([{ transform: `rotate(${-dir * 16}deg)` }, { transform: 'rotate(0deg)' }], { duration: DROP, easing: 'ease-in' });
    this.rig.look(dir * 0.5, -0.9);
    void this.rig.perk();
    await wait(DROP * 0.7);
    this.rig.look(dir * 0.8, 0.4);
    await fall;
    this.dust(X0, 1.1);
    this.sfx('drum.dum', { v: 0.8 });
    note('dum', head.x, head.y - 14, 0.8);
    await inner.animate([{ transform: 'none' }, { transform: 'scale(1.1, 0.86)', offset: 0.35, easing: 'ease-out' }, { transform: 'scale(0.96, 1.05)', offset: 0.7 }, { transform: 'none' }], { duration: 300, easing: 'ease-in-out' }).finished.catch(() => {});
    await inner.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${dir * 6}deg)`, offset: 0.25 }, { transform: `rotate(${-dir * 4}deg)`, offset: 0.55 }, { transform: `rotate(${dir * 1.5}deg)`, offset: 0.8 }, { transform: 'rotate(0deg)' }], { duration: 560, easing: 'ease-in-out' }).finished.catch(() => {});
    this.rig.tilt(dir);
    this.rig.face('open', 'smile', 160);
    await wait(360);
    this.rig.release('tilt', 240);

    // ---- up to it, ready over the head ----
    await this.walkTo(stand, 'creep');
    this.set({ dir }); this.rig.facing(dir);
    this.rig.release('look', 200);
    this.rig.drumReady(dir);
    await wait(460);
    // ---- the maqsum twice, a breath, a roll, and the last DUM: one schedule, played by the rig and heard here ----
    const BEAT = 200; const LEAD = 200;
    const strokes: { t: number; kind: 'dum' | 'tek' }[] = [];
    for (let bar = 0; bar < 2; bar++) MAQSUM.forEach((kind, i) => { if (kind) strokes.push({ t: LEAD + (bar * 8 + i) * BEAT, kind }); });
    const roll0 = LEAD + 16 * BEAT;
    for (let i = 0; i < 9; i++) strokes.push({ t: roll0 + i * 62, kind: 'tek' });
    const finale = roll0 + 8 * 62 + 190;
    strokes.push({ t: finale, kind: 'dum' });
    const END = finale + 420;
    const play = this.rig.drumPlay(dir, strokes, END);
    // each stroke is heard off the clock the rig plays it on: an empty animation per stroke, made in the same moment as
    // the rig's and finishing when that stroke lands (timers would drift from it, and the recorder's slow motion slows
    // animations and timers, never the page's own clock)
    const at = (t: number) => inner.animate(null, { duration: 0, delay: t }).finished.then(() => !this.destroyed, () => false);
    for (const s of strokes) void at(s.t).then((ok) => { if (ok) strike(s.kind); });
    void at(roll0).then((ok) => { if (ok) this.rig.face('happy', 'smile', 140); });
    if (!(await at(finale))) return;
    // the last DUM: a shower of notes (and Sahur's TUNG)
    for (let i = 0; i < 5; i++) setTimeout(() => note(i % 2 ? 'tek' : 'dum', head.x + rand(-20, 20), head.y - 18, 1.1), 60 + i * 90);
    this.sparkles(3, head.x, head.y - 40, 40);
    if (ch === 'sahur') {
      this.sfx('tung');
      const burst = new Prop(this.L.front, 'tung', 104).place(head.x - 10, head.y - 44);
      burst.el.style.transformOrigin = '50% 62%';
      burst.anim([
        { transform: 'scale(0.2) rotate(-14deg)', opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.3,1.3)' }, { transform: 'scale(1.1) rotate(3deg)', opacity: 1, offset: 0.22, easing: 'ease-out' },
        { transform: 'scale(1) rotate(5deg)', opacity: 1, offset: 0.68, easing: 'ease-in' }, { transform: 'scale(0.86) rotate(8deg) translateY(-18px)', opacity: 0, offset: 1 },
      ], { duration: 760 }).finished.then(() => burst.el.remove(), () => burst.el.remove());
    }
    await play;
    // ---- delighted: hearts and a hop (the seal flaps); the drum goes ----
    this.rig.release('drum', 320);
    this.rig.face('happy', 'smile', 160);
    this.hearts(3);
    this.voice('happy');
    if (this.own?.cheer) await this.own.cheer(); else if (ch === 'seal') await this.rig.flap(3); else await this.rig.hop();
    await wait(650);
    this.rig.restFace();
    for (const n of notes) if (n.el.isConnected) void n.remove(300);
    void drum.remove(420, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
    await wait(260);
  }

  /**
   * A drawing held in the pet's own drawing, as a copy laid over the room (the front layer) exactly where it is on
   * screen: what falls in before the pet catches it, and what flies off after. `place` is the group that holds it in the
   * drawing (in the drawing's own units, `w` x `h`). `tf(dx, dy, deg)` is the copy's transform moved by dx, dy (room
   * units) and turned deg about its middle: tf(0, 0, 0) is where the held one is.
   */
  private overlay(place: SVGGElement, raw: string, w: number, h: number, ox = 0, oy = 0, layer: 'front' | 'back' = 'front') {
    const box = this.L.front.getBoundingClientRect(); const kx = box.width / WORLD.w || 1;
    const f = screenFrame(place); const o = f.toScreen(ox, oy);
    const m = [f.a / kx, f.b / kx, f.c / kx, f.d / kx, (o.x - box.left) / kx, (o.y - box.top) / kx];
    const el = document.createElement('div');
    el.className = 'prop emo-flyer';
    el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform-origin:0 0;`;
    el.innerHTML = uniqueIds(raw);
    const svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.style.display = 'block'; svg.style.overflow = 'visible'; }
    (layer === 'back' ? this.L.back : this.L.front).appendChild(el);
    const mat = `matrix(${m.map((v) => v.toFixed(4)).join(',')})`;
    const cx = m[0]! * w / 2 + m[2]! * h / 2 + m[4]!; const cy = m[1]! * w / 2 + m[3]! * h / 2 + m[5]!;
    const tf = (dx: number, dy: number, deg: number) => `translate(${(dx + cx).toFixed(1)}px, ${(dy + cy).toFixed(1)}px) rotate(${deg.toFixed(1)}deg) translate(${(-cx).toFixed(1)}px, ${(-cy).toFixed(1)}px) ${mat}`;
    el.style.transform = tf(0, 0, 0);
    return { el, tf, cx, cy, m };
  }
  /** It falls in from above the room on `side` of the pet, past its head (never over its face), turning, and swoops in
   *  to where the held one is: resolves on landing. `out` is how far to that side it falls. */
  private dropIn(o: { el: HTMLDivElement; tf: (dx: number, dy: number, deg: number) => string; cy: number }, side: Dir, ms: number, turn: number, out = 110) {
    const top = -(o.cy + 90);
    return o.el.animate([
      { transform: o.tf(side * out * 1.1, top, -side * turn), easing: 'cubic-bezier(.4,0,.9,.55)' },
      { transform: o.tf(side * out, -14, -side * turn * 0.2), offset: 0.72, easing: 'cubic-bezier(.15,.5,.45,1)' },
      { transform: o.tf(0, 0, 0) },
    ], { duration: ms, fill: 'forwards' }).finished.then(() => !this.destroyed, () => false);
  }
  /**
   * The pet's left and right edges in the room (room units), from where its silhouette ends in its own drawing (`SPAN`,
   * view-box units: the boxes of its groups are no good for this, they count costume pieces at their size before their
   * clips, Sahur's tee drawn as a wide shape cut to his log made him half the room wide).
   */
  private petSpan(): [number, number] {
    const SPAN: Record<string, [number, number]> = { cat: [38, 178], frog: [60, 162], sahur: [70, 134], thiccums: [28, 192], r3tards: [40, 160], seal: [30, 176] };
    const [l, r] = this.own?.tune?.span ?? SPAN[this.rig.character] ?? [40, 160];
    const root = this.rig.kit().root.querySelector('#cat') as SVGGElement | null;
    const box = this.L.front.getBoundingClientRect(); const kx = box.width / WORLD.w || 1;
    if (!root) return [this.st.x - 60, this.st.x + 60];
    const f = screenFrame(root);
    const a = (f.toScreen(l, 200).x - box.left) / kx, b = (f.toScreen(r, 200).x - box.left) / kx;
    return [Math.min(a, b), Math.max(a, b)];
  }
  /** How far to `side` a copy over the room must be moved to clear the pet's whole figure (room units): it falls that far
   *  out, past the pet's head, before it swoops in. */
  private clearOf(el: HTMLElement, side: Dir) {
    const box = this.L.front.getBoundingClientRect(); const kx = box.width / WORLD.w || 1;
    const fig = this.rig.kit().root.querySelector('#head') ?? this.rig.kit().root;
    const p = fig.getBoundingClientRect(); const c = el.getBoundingClientRect();
    const need = side > 0 ? (p.right - c.left) : (c.right - p.left);
    return Math.max(60, need / kx + 12);
  }
  /** Thrown up and away out of the top of the room on a real arc (fast off the hand, slowing as it climbs, the way a
   *  thrown thing does), drifting `drift` room units to `side` and turning over as it goes; on screen for about 0.6 of
   *  `ms` (it left the room within a frame or two when it flew at an even pace). Removed when it is gone. */
  private arcOut(o: { el: HTMLDivElement; tf: (dx: number, dy: number, deg: number) => string; cy: number }, side: Dir, ms = 1100, drift = 150, turn = 520) {
    const H = o.cy + 160;                         // from where it is to well past the room's top
    const g = 0.55 * H; const v = H + g / 2;      // height after t (0..1): v t - g t²/2, which is H at t = 1
    const kf: Keyframe[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; kf.push({ transform: o.tf(side * drift * t, -(v * t - g * t * t / 2), side * turn * t), offset: t }); }
    const gone = () => o.el.remove();
    return o.el.animate(kf, { duration: ms, easing: 'linear', fill: 'forwards' }).finished.then(gone, gone);
  }
  /** Flung out to `side`, clear of the pet (`out` room units: never across its face), then up and away out of the room,
   *  turning over; the copy is removed when it is gone. */
  private tossOut(o: { el: HTMLDivElement; tf: (dx: number, dy: number, deg: number) => string; cy: number }, side: Dir, ms: number, out: number) {
    const gone = () => o.el.remove();
    o.el.animate([
      { transform: o.tf(0, 0, 0), easing: 'cubic-bezier(.3,.6,.5,1)' },
      { transform: o.tf(side * out, -10, side * 35), offset: 0.3, easing: 'cubic-bezier(.35,0,.75,.6)' },
      { transform: o.tf(side * (out + 230), -(o.cy + 170), side * 330) },
    ], { duration: ms, fill: 'forwards' }).finished.then(gone, gone);
  }

  /**
   * The guitar (the emo pack's toy item, what `play()` brings out instead of the ball when it is the toy; DEV only:
   * /emopack). It drops from the top of the room onto the floor to the pet's right, clear of it, lying flat, neck to the
   * right (a thud, its strings ringing). Sahur puts his bat down. The pet walks up to it and bends down until the hand
   * that holds a neck is ON its neck, then stands up with it: from the moment it leaves the floor the guitar is drawn
   * in that hand (it moves with the arm and turns in the hand about the grip), and the other hand comes over the strings.
   * Four bars of the emo strum, D . D U . U D U, through Em C G D (the strokes heard as they cross the strings: the rig
   * plays the whole thing as one animation, the sounds follow its clock; the fretting hand moves along the neck at each
   * new chord), a note floating up off every down-stroke, a last big Em that rings. Then it is THROWN: the hand on the
   * neck winds back and swings it up over the shoulder and lets go, and it flies off the room. Hearts, a hop (and Sahur
   * picks his bat back up off the floor). About 14 s.
   */
  /** Takes a held guitar out of the drawing (and puts back what was moved for it): a room taken down mid-song. */
  private heldGuitar: (() => void) | null = null;
  private async playGuitar() {
    const ch = this.rig.character;
    if (ch === 'thiccums') return this.buttGuitar();
    const G = this.own?.tune?.guitar ?? GUITAR[ch] ?? GUITAR.cat!;
    const { EMO_RAW } = await loadEmoProps();
    if (this.destroyed) return;
    const root = this.rig.kit().root;
    const host = root.querySelector('#' + G.host) as SVGGElement | null;
    const arm = this.rig.strumArm();
    const fret = arm.fret?.limb as SVGGElement | null | undefined;
    if (!host || !(host instanceof SVGGElement) || !arm.strum.limb || !arm.fret || !(fret instanceof SVGGElement)) return;
    const probe = arm.fret.probe;
    this.rig.release('look', 200);
    this.rig.facing(1); this.set({ dir: 1 });
    await wait(260);                         // (the frok's turn is a 200 ms mirror: nothing is measured mid-turn)
    if (this.destroyed) return;
    const world = (p: { x: number; y: number }) => { const b = this.L.front.getBoundingClientRect(); const kx = b.width / WORLD.w || 1; return { x: (p.x - b.left) / kx, y: (p.y - b.top) / kx }; };
    // ---- the playing pose, measured: put on and taken off again before anything is drawn ----
    this.rig.strumReady(0);
    const fh = screenFrame(host); const O = fh.toScreen(0, 0);
    const inHost = (limb: Element, at: [number, number]) => {
      const p = screenFrame(limb as SVGGElement).toScreen(at[0], at[1]); const rel = { x: p.x - O.x, y: p.y - O.y };
      return { x: (fh.d * rel.x - fh.c * rel.y) / fh.det, y: (-fh.b * rel.x + fh.a * rel.y) / fh.det };
    };
    const S = inHost(arm.strum.limb, arm.strum.probe);
    const F = inHost(fret, probe);
    const vx = F.x - S.x, vy = F.y - S.y, L = Math.hypot(vx, vy) || 1;
    const flip = vx < 0;
    const rot = (flip ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx)) * 180 / Math.PI;
    let k = G.w / G_BOX[0];
    const at = G_STRINGS[0] + L / k;
    if (at > G_NECK[1]) k = Math.min(k * 1.3, L / (G_NECK[1] - G_STRINGS[0]));
    else if (at < G_NECK[0]) k = Math.max(k * 0.75, L / (G_NECK[0] - G_STRINGS[0]));
    const grabU = G_STRINGS[0] + L / k;      // the neck under the fretting hand, in the guitar's own units (y 40)
    const mkGuitar = (cls: string) => {
      const doc = new DOMParser().parseFromString(uniqueIds(EMO_RAW.emoguitar), 'image/svg+xml');
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement; g.setAttribute('class', cls);
      const pl = document.createElementNS(SVG_NS, 'g') as SVGGElement;
      const art = doc.querySelector('#emoguitar'); if (art) pl.appendChild(document.importNode(art, true));
      g.appendChild(pl); return { g, pl };
    };
    // the guitar as it is played: drawn in the body (`host`), between the body and the hands; hidden until it is in them
    const { g: outer, pl: place } = mkGuitar('emo-heldguitar');
    outer.style.opacity = '0';
    place.setAttribute('transform', `translate(${S.x.toFixed(2)} ${S.y.toFixed(2)}) rotate(${rot.toFixed(1)}) scale(${(flip ? -k : k).toFixed(4)} ${k.toFixed(4)}) translate(${-G_STRINGS[0]} ${-G_STRINGS[1]})`);
    const before = G.before ? host.querySelector(':scope > #' + G.before) : null;
    host.insertBefore(outer, before);
    const held = toScreenAff(place);
    const P1 = affMul(affInv(toScreenAff(fret)), held);   // the guitar in the fretting hand's own units, as it is played
    this.rig.strumUnready();
    // ---- the pick-up pose, measured the same way: where the fretting hand gets to, down by the floor ----
    const downKeys = this.rig.pickUp(0);
    const hand = world(screenFrame(fret).toScreen(probe[0], probe[1]));
    this.rig.unhold(downKeys);
    // ---- where it lands, and where the pet steps to so that its hand comes down on the neck ----
    const kx0 = this.L.front.getBoundingClientRect().width / WORLD.w || 1;
    const kw = k * Math.hypot(fh.a, fh.b) / kx0;          // room units per guitar unit
    const offR = this.petSpan()[1] - this.st.x;           // the pet's right edge, from its middle
    const LEFT = 6, RIGHT = 161;                           // the guitar's ends, in its units (body ... headstock)
    // it lies the way it is played, neck to the right, clear of the pet; then the pet steps up behind it (as to a bowl) so
    // that, bent over it, its fretting hand comes down on the neck and the other on the body
    const step = offR + 16 + (grabU - LEFT) * kw - (hand.x - this.st.x);
    const maxX = Math.min(WORLD.w - 4 - offR - 16 - (RIGHT - LEFT) * kw, WALK_MAX - Math.max(0, step));
    if (ch === 'sahur' && this.st.x < 205) await this.walkTo(Math.min(205, maxX));   // (his bat goes down on his left)
    if (this.st.x > maxX) await this.walkTo(maxX);
    if (this.destroyed) { outer.remove(); return; }
    this.rig.facing(1); this.set({ dir: 1 });
    await wait(240);
    // ---- it drops onto the floor, lying flat ----
    // (the room's music steps aside from here to the throw: the pet's riff, with its band, is the music while it lasts)
    const unduck = this.duckMusic();
    // (in the front layer: on the floor in front of the pet's feet; the hands close over it when they take it)
    const fall = this.overlay(place, EMO_RAW.emoguitar, G_BOX[0], G_BOX[1]);
    let flyer: { el: HTMLDivElement } | null = fall;
    let bat: { pickUp: () => Promise<void>; gone: () => void } | null = null;
    let inHand: SVGGElement | null = null;
    const restore: (() => void)[] = [];
    // (a copy held still on screen inside the drawing, from just before the hands reach it until they take it: `pinned`)
    let pinned: { g: SVGGElement; stop: () => void } | null = null;
    this.heldGuitar = () => { for (const r of restore.splice(0)) r(); outer.remove(); inHand?.remove(); flyer?.el.remove(); pinned?.stop(); pinned?.g.remove(); bat?.gone(); };
    const m = fall.m; const theta = Math.atan2(m[1]!, m[0]!) * 180 / Math.PI; const mirrored = m[0]! * m[3]! - m[1]! * m[2]! < 0;
    let deg = (mirrored ? 180 : 0) - theta; while (deg > 180) deg -= 360; while (deg <= -180) deg += 360;
    const cxF = this.st.x + offR + 16 + (G_BOX[0] / 2 - LEFT) * kw;
    const cyF = WORLD.floor + 6 - (73 - G_BOX[1] / 2) * kw;
    const dx = cxF - fall.cx, dy = cyF - fall.cy, top = -110 - fall.cy;
    this.rig.gaze(16, -30);
    this.sfx('whoosh', { v: 0.4 });
    const dropped = fall.el.animate([
      { transform: fall.tf(dx, top, deg + 24), easing: 'cubic-bezier(.45,0,.95,.6)' },
      { transform: fall.tf(dx, dy, deg), offset: 0.74, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: fall.tf(dx, dy - 9, deg - 3), offset: 0.86, easing: 'cubic-bezier(.5,0,.9,.5)' },
      { transform: fall.tf(dx, dy, deg) },
    ], { duration: 860, fill: 'forwards' });
    void wait(636).then(() => { if (!this.destroyed) { this.sfx('thud'); this.sfx('guitar.down', { n: 0, v: 0.32 }); this.dust(cxF, 0.8); this.rig.gaze(20, 22); } });
    if (!(await dropped.finished.then(() => !this.destroyed, () => false))) return;
    await wait(300);
    // ---- Sahur puts his bat down (it would be in the way of a guitar) ----
    if (ch === 'sahur') { bat = await this.dropBat(); if (this.destroyed) return; }
    // ---- up to it, and down onto it: the fretting hand on its neck ----
    await this.walkTo(this.st.x + step, 'creep');
    if (this.destroyed) return;
    this.rig.facing(1); this.set({ dir: 1 });
    if (ch === 'sahur') this.rig.gaze();             // (his reach carries its own look)
    // the hands in front of what the guitar goes in front of (the cat's legs before her collar), from here to the end
    const moved = (G.front ?? []).map((id) => host.querySelector(':scope > #' + id)).filter((e): e is Element => !!e).map((e) => ({ e, next: e.nextSibling }));
    for (const mv of moved) host.appendChild(mv.e);
    const unmove = () => { for (const mv of [...moved].reverse()) if (mv.e.parentNode === host) host.insertBefore(mv.e, mv.next && mv.next.parentNode === host ? mv.next : null); };
    // ---- the hands come down ONTO it, in front of it ----
    // Lying on the floor it is drawn over the room, in front of the whole pet, so hands coming down to it went behind it
    // and popped out in front when they took it (the operator: "looks like the arm goes through the guitar"). So before
    // they reach it, it moves into the drawing where the guitar is played (`host`: in front of the body and the legs,
    // under the hands), held still on screen every frame while the pet bends. The cat sits on her front legs, which
    // stand behind it: she first puts both paws up and out to the sides, clear of it (pickSpread), and it moves then.
    const floor = toScreenAff(fall.el.querySelector('svg g') as SVGGElement);
    const spread = this.rig.pickSpread(260);
    if (spread) { await wait(280); if (this.destroyed) return; }
    {
      const { g, pl } = mkGuitar('emo-heldguitar');
      host.insertBefore(g, moved[0]?.e ?? (G.before ? host.querySelector(':scope > #' + G.before) : null));
      let raf = 0;
      const still = () => { pl.setAttribute('transform', cssMatrix(affMul(affInv(toScreenAff(g)), floor)).replace(/,/g, ' ')); };
      const loop = () => { still(); raf = requestAnimationFrame(loop); };
      still(); raf = requestAnimationFrame(loop);
      pinned = { g, stop: () => cancelAnimationFrame(raf) };
      fall.el.remove(); flyer = null;
    }
    if (spread) this.rig.release(spread, 380);
    const keys = this.rig.pickUp(spread ? 380 : 420);
    await wait(spread ? 400 : 460);
    if (this.destroyed) return;
    // from here it is in that hand: drawn in the arm, under the hand, where it lay on the floor; it turns in the hand about
    // the grip into the way it is played while the arm comes up
    const { g: hold, pl: holdPlace } = mkGuitar('emo-heldguitar');
    inHand = hold;
    holdPlace.setAttribute('transform', cssMatrix(P1).replace(/,/g, ' '));
    fret.insertBefore(hold, fret.firstChild);
    const pin = pinned!; pinned = null;
    pin.stop();
    const lay = toScreenAff(pin.g.querySelector('g') as SVGGElement);
    const E = affMul(affMul(affInv(toScreenAff(fret)), lay), affInv(P1));
    const X = affMul(affMul([1, 0, 0, 1, -probe[0], -probe[1]], E), [1, 0, 0, 1, probe[0], probe[1]]);
    hold.style.transformBox = 'view-box'; hold.style.transformOrigin = `${probe[0]}px ${probe[1]}px`;
    // X is a turn about the grip (and a nudge, how far the hand was from the neck), small: it comes up nearly level
    let swing = Math.atan2(X[1], X[0]) * 180 / Math.PI;
    while (swing > 180) swing -= 360; while (swing <= -180) swing += 360;
    const turn = (f: number) => `translate(${(X[4] * f).toFixed(2)}px, ${(X[5] * f).toFixed(2)}px) rotate(${(swing * f).toFixed(1)}deg)`;
    hold.style.transform = turn(1);
    pin.g.remove();
    this.sfx('pop', { v: 0.55 });
    // the strumming hand in front of the arm that carries it, while it comes up (put back once it is played)
    let a: Node = arm.strum.limb; let b: Node = fret;
    while (a.parentNode && !a.parentNode.contains(fret)) a = a.parentNode;
    while (b.parentNode && b.parentNode !== a.parentNode) b = b.parentNode;
    const strumNext = a.nextSibling;
    if (a.parentNode && b.parentNode === a.parentNode && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) {
      a.parentNode.insertBefore(a, b.nextSibling);
      const parent = a.parentNode; const node = a;
      restore.push(() => { if (node.parentNode === parent) parent.insertBefore(node, strumNext && strumNext.parentNode === parent ? strumNext : null); });
    }
    for (const key of keys) this.rig.release(key, 640);
    this.rig.strumReady(640);
    this.rig.gaze(-4, 16);
    if (G.screenLift) {
      // Sahur: his whole log swings up from a deep bend, and a turn worked in his hand's own frame swung the guitar down
      // through his legs on the way. So the lift is worked on the SCREEN, every frame: the guitar's angle there goes
      // evenly from lying flat to as it is played, and its grip point rides up with his hand (from where it lay, closing
      // on the hand), so it rises in front of him, never dipping. Its clock is an animation, so it slows with the rest.
      const at = (m: Aff, p: readonly [number, number]) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]] as const;
      const ang = (m: Aff) => Math.atan2(m[1], m[0]);
      let da = ang(held) - ang(lay); while (da > Math.PI) da -= 2 * Math.PI; while (da <= -Math.PI) da += 2 * Math.PI;
      const gripU = at(affInv(P1), probe);
      const hand = () => at(toScreenAff(fret), probe);
      const h0 = hand(); const g0 = at(lay, gripU);
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      hold.style.transformOrigin = '0px 0px';
      const clock = hold.animate(null, { duration: 700 });
      await new Promise<void>((done) => {
        const step = () => {
          if (this.destroyed || !hold.isConnected) { done(); return; }
          const t = Math.min(1, Number(clock.currentTime ?? 700) / 700); const e = ease(t);
          const c = Math.cos(da * e), s = Math.sin(da * e);
          const Lm: Aff = [c * lay[0] - s * lay[1], s * lay[0] + c * lay[1], c * lay[2] - s * lay[3], s * lay[2] + c * lay[3], 0, 0];
          const h = hand(); const ax = g0[0] + (h[0] - h0[0]), ay = g0[1] + (h[1] - h0[1]);
          const tx = ax + (h[0] - ax) * e, ty = ay + (h[1] - ay) * e;
          const p = at(Lm, gripU); Lm[4] = tx - p[0]; Lm[5] = ty - p[1];
          hold.style.transform = cssMatrix(affMul(affMul(affInv(toScreenAff(fret)), Lm), affInv(P1)));
          if (t >= 1) { done(); return; }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      clock.cancel();
      if (this.destroyed) return;
      hold.style.transform = ''; hold.style.transformOrigin = `${probe[0]}px ${probe[1]}px`;
    } else {
      const lifted = hold.animate([{ transform: turn(1), easing: 'cubic-bezier(.4,0,.3,1)' }, { transform: 'none' }], { duration: 700, fill: 'forwards' });
      if (!(await lifted.finished.then(() => !this.destroyed, () => false))) return;
      hold.style.transform = ''; lifted.cancel();
    }
    // in the hands now: the copy in the body takes over (the hands over it), the one in the arm waits for the throw
    outer.style.opacity = ''; hold.style.display = 'none';
    for (const r of restore.splice(0)) r();
    restore.push(unmove);
    const strings = () => {
      const w = this.L.front.getBoundingClientRect(); if (!w.width) return this.headPos();
      const kx = w.width / WORLD.w; const p = screenFrame(host).toScreen(S.x, S.y);
      return { x: (p.x - w.left) / kx, y: (p.y - w.top) / kx };
    };
    this.sfx('guitar.up', { n: 0, v: 0.45 });
    await this.rig.strumCatch();
    if (this.destroyed) return;
    this.rig.gaze(-6, 20);
    const at0 = strings();
    await wait(200);
    this.rig.face('open', 'smug', 160);
    // ---- four bars of the strum, one chord a bar, and a last big chord that rings ----
    const EIGHTH = 175; const LEAD = 260;
    const strokes: { t: number; kind: 'down' | 'up'; bar: number }[] = [];
    for (let bb = 0; bb < 4; bb++) STRUM_BAR.forEach((kind, i) => { if (kind) strokes.push({ t: LEAD + (bb * 8 + i) * EIGHTH, kind, bar: bb }); });
    const finale = LEAD + 32 * EIGHTH + 120;
    strokes.push({ t: finale, kind: 'down', bar: 4 });
    const END = finale + 700;
    const play = this.rig.strumPlay(strokes, END);
    const clock = outer.querySelector('g') ?? outer;
    const when = (t: number) => clock.animate(null, { duration: 0, delay: t }).finished.then(() => !this.destroyed, () => false);
    strokes.forEach((s_, i) => {
      const last = i === strokes.length - 1;
      const mute = !last && STRUM_MUTE[Math.round((s_.t - LEAD) / EIGHTH) % 8] === true;
      // each rings until the next stroke strikes the strings again (the last big chord rings out)
      const dur = last ? 2.6 : ((strokes[i + 1]?.t ?? s_.t + EIGHTH) - s_.t) / 1000 + 0.03;
      void when(s_.t).then((ok) => {
        if (!ok) return;
        this.sfx(mute ? 'guitar.mute' : s_.kind === 'down' ? 'guitar.down' : 'guitar.up', { n: s_.bar % 4, dur });
        if (!mute) this.guitarNote(strings(), last ? 1.3 : s_.kind === 'down' ? 1 : 0.8);
      });
    });
    // a drummer and a bass player with them: a bar of the band at each bar of the riff (one sound a bar, so it cannot
    // drift from the strokes), and the crash and the bass under the last big chord
    for (let bb = 0; bb < 4; bb++) void when(LEAD + bb * 8 * EIGHTH).then((ok) => { if (ok) this.sfx('band.bar', { n: bb }); });
    void when(finale).then((ok) => { if (ok) this.sfx('band.end'); });
    void when(LEAD + 16 * EIGHTH).then((ok) => { if (ok) this.rig.face('closed', 'smug', 200); });    // lost in it for the third bar
    void when(LEAD + 24 * EIGHTH).then((ok) => { if (ok) this.rig.face('open', 'smile', 200); });
    if (!(await when(finale))) return;
    for (let i = 0; i < 4; i++) setTimeout(() => this.guitarNote(strings(), 1.1), 80 + i * 110);
    this.sparkles(4, at0.x, at0.y - 30, 60);
    this.rig.face('happy', 'smile', 140);
    await play;
    if (this.destroyed) return;
    // ---- thrown: back in the hand on its neck, wound back, swung up over the shoulder and let go ----
    hold.style.display = ''; outer.style.opacity = '0';
    this.rig.face('open', 'smug', 120);
    // Sahur: as he swings it the guitar turns in his hand, its body flung out along his forearm (whipped round, the heavy
    // end goes outward), so it is clear of him when he lets go. His arm is short for it: held as it is played, its body
    // hung back across him through the whole swing, and once let go (behind him) it popped behind his log.
    let spin: ((ms: number, release: number) => void) | undefined;
    if (ch === 'sahur') {
      const ELBOW = [125.2, 108];                       // the forearm's pivot (pet.css #foreR)
      const bx = P1[0] * 40 + P1[2] * 38 + P1[4], by = P1[1] * 40 + P1[3] * 38 + P1[5];   // the guitar's body, in the forearm's units
      let deg = (Math.atan2(probe[1] - ELBOW[1]!, probe[0] - ELBOW[0]!) - Math.atan2(by - probe[1], bx - probe[0])) * 180 / Math.PI;
      while (deg > 180) deg -= 360; while (deg <= -180) deg += 360;
      spin = (ms, rel) => { hold.animate([{ transform: 'none', offset: 0 }, { transform: 'none', offset: 0.24, easing: 'cubic-bezier(.45,0,.55,1)' }, { transform: `rotate(${deg.toFixed(1)}deg)`, offset: rel }, { transform: `rotate(${deg.toFixed(1)}deg)`, offset: 1 }], { duration: ms, fill: 'forwards' }); };
    }
    await this.rig.throwGuitar(() => {
      if (this.destroyed) return;
      // (behind the pet: it goes back over the shoulder; in front, its arc crossed the face)
      const fly = this.overlay(holdPlace, EMO_RAW.emoguitar, G_BOX[0], G_BOX[1], 0, 0, 'back');
      hold.remove(); outer.remove(); inHand = null;
      this.sfx('whoosh');
      void this.arcOut(fly, 1);
    }, spin);
    for (const r of restore.splice(0)) r();
    unduck();
    if (this.destroyed) return;
    this.heldGuitar = bat ? () => bat?.gone() : null;
    this.rig.face('happy', 'smile', 160);
    this.hearts(3);
    this.voice('happy');
    await wait(240);
    if (this.own?.cheer) await this.own.cheer(); else if (ch === 'seal') await this.rig.flap(3); else await this.rig.hop();
    this.rig.gaze();
    // ---- Sahur picks his bat back up ----
    if (bat) { await bat.pickUp(); this.heldGuitar = null; }
    await wait(300);
    this.heldGuitar = null;
    this.rig.restFace();
  }
  /** A note floating up off the guitar's strings at `p` (room units). */
  private guitarNote(p: { x: number; y: number }, big = 1) {
    if (this.destroyed) return;
    const n = new Prop(this.L.front, 'emoguitarnote', rand(18, 24) * big).place(p.x + rand(-14, 14), p.y - 10);
    const one = Math.random() < 0.6; const a = n.find('.n1'); const b = n.find('.n2');
    if (a) a.style.visibility = one ? 'visible' : 'hidden'; if (b) b.style.visibility = one ? 'hidden' : 'visible';
    const sway = rand(-50, 50); const rise = rand(80, 120);
    n.anim([{ transform: 'translate(0, 0) scale(0.5)', opacity: 0, offset: 0 }, { transform: `translate(${sway * 0.25}px, ${-rise * 0.25}px) rotate(${rand(-10, 10)}deg) scale(1.1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${sway}px, ${-rise}px) scale(0.85)`, opacity: 0, offset: 1 }], { duration: rand(1100, 1400), easing: 'ease-out' }).finished.then(() => n.el.remove(), () => n.el.remove());
  }
  /**
   * Sahur puts his bat down: his fist lets go and it falls over flat on the floor to his left with a wooden clonk (the
   * drawn bat is hidden and a copy laid over the room in the same place takes over), lying where his fist will reach it
   * when he bends down that way. Returns `pickUp()`: he walks back to where he stood, bends down to it, his fist closes on the grip and he straightens
   * up with it (the drawn bat again, turned in the fist from how it lay to how it hangs); and `gone()`, for a room taken
   * down meanwhile.
   */
  private async dropBat(): Promise<{ pickUp: () => Promise<void>; gone: () => void } | null> {
    const root = this.rig.kit().root;
    const wood = root.querySelector('#batwood') as SVGGElement | null;
    const arm = this.rig.kit().root.querySelector('#legL') as SVGGElement | null;
    if (!wood || !arm) return null;
    const GRIP: [number, number] = [84, 134]; const TIP: [number, number] = [48, 205];
    const world = (p: { x: number; y: number }) => { const b = this.L.front.getBoundingClientRect(); const kx = b.width / WORLD.w || 1; return { x: (p.x - b.left) / kx, y: (p.y - b.top) / kx }; };
    // where his fist gets to when he bends down to his left
    this.rig.reachDownLeft(0);
    const fist = world(screenFrame(arm).toScreen(GRIP[0], GRIP[1]));
    this.rig.unhold(['reach']);
    const bb = wood.getBBox();
    const raw = `<svg xmlns="${SVG_NS}" viewBox="${bb.x} ${bb.y} ${bb.width} ${bb.height}">${wood.outerHTML.replace(/ id="batwood"/, '')}</svg>`;
    // he swings it out to his left and lets go at the top of the swing (the arm carries on back down by itself); it fell
    // out of a fist that never moved before (the operator: "drop ... more naturally")
    this.rig.gaze(-16, 12);
    await new Promise<void>((res) => { void this.rig.batOut(res, 560, 0.4); });
    if (this.destroyed) return null;
    const o = this.overlay(wood, raw, bb.width, bb.height, bb.x, bb.y);
    wood.style.opacity = '0';
    let lying = true;
    const gone = () => { o.el.remove(); wood.style.opacity = ''; wood.style.transform = ''; };
    // lie it flat, the grip end (toward him) under that fist: turn it about its middle so the tip-to-grip line is level,
    // then move it so the grip lands there, the barrel on the floor
    const m = o.m; const kw = Math.hypot(m[0]!, m[1]!);
    const v = { x: m[0]! * (GRIP[0] - TIP[0]) + m[2]! * (GRIP[1] - TIP[1]), y: m[1]! * (GRIP[0] - TIP[0]) + m[3]! * (GRIP[1] - TIP[1]) };
    const deg = -Math.atan2(v.y, v.x) * 180 / Math.PI;
    const r = deg * Math.PI / 180;
    const g0 = world(screenFrame(wood).toScreen(GRIP[0], GRIP[1]));
    const rel = { x: g0.x - o.cx, y: g0.y - o.cy };
    const gRot = { x: o.cx + rel.x * Math.cos(r) - rel.y * Math.sin(r), y: o.cy + rel.x * Math.sin(r) + rel.y * Math.cos(r) };
    const target = { x: fist.x, y: WORLD.floor + 4 - 7 * kw };
    const dx = target.x - gRot.x, dy = target.y - gRot.y;
    this.rig.gaze(-16, 18);
    const fell = o.el.animate([
      { transform: o.tf(0, 0, 0), easing: 'cubic-bezier(.5,0,.9,.55)' },
      { transform: o.tf(dx * 0.5, dy * 0.4, deg * 0.55), offset: 0.5, easing: 'cubic-bezier(.4,0,.9,.6)' },
      { transform: o.tf(dx, dy, deg), offset: 0.8, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: o.tf(dx, dy - 5, deg + 2), offset: 0.9, easing: 'ease-in' },
      { transform: o.tf(dx, dy, deg) },
    ], { duration: 620, fill: 'forwards' });
    void wait(496).then(() => { if (!this.destroyed) { this.sfx('bonk', { v: 0.7 }); this.dust(target.x - 40, 0.6); } });
    await fell.finished.catch(() => {});
    this.rig.gaze();
    await wait(220);
    // where he stood when it fell: the bat lies by his fist from there, so he walks back to it before he bends
    const atX = this.st.x;
    const pickUp = async () => {
      if (this.destroyed || !lying) { gone(); return; }
      this.rig.gaze(-18, 14);
      if (Math.abs(this.st.x - atX) >= 6) await this.walkTo(atX);
      if (this.destroyed) { gone(); return; }
      this.rig.gaze();
      this.rig.reachDownLeft();
      await wait(600);
      if (this.destroyed) { gone(); return; }
      // in his fist from here: the drawn bat, turned about the grip from how it lies to how it hangs
      const E = affMul(affInv(toScreenAff(arm)), toScreenAff(o.el.querySelector('svg g') as SVGGElement));
      const X = affMul(affMul([1, 0, 0, 1, -GRIP[0], -GRIP[1]], E), [1, 0, 0, 1, GRIP[0], GRIP[1]]);
      wood.style.transformBox = 'view-box'; wood.style.transformOrigin = `${GRIP[0]}px ${GRIP[1]}px`;
      wood.style.transform = cssMatrix(X); wood.style.opacity = '';
      o.el.remove(); lying = false;
      this.sfx('pop', { v: 0.5 });
      this.rig.release('reach', 620);
      const up = wood.animate([{ transform: cssMatrix(X), easing: 'cubic-bezier(.35,0,.25,1)' }, { transform: 'none' }], { duration: 640, fill: 'forwards' });
      await up.finished.catch(() => {});
      wood.style.transform = ''; up.cancel();
    };
    return { pickUp, gone };
  }
  /**
   * Thiccums plays the guitar with his butt. It drops straight down from the top of the room into the crack between his
   * cheeks, drawn in his body the whole way down (between the far cheek and the near one, so the near cheek takes its foot
   * as it goes in: one unbroken fall, nothing changes hands), lands with a boing that sets his cheeks wobbling and rocks a
   * little as they settle; neck up and out behind him. He looks back at it and gives it his butt bounce, every landing a
   * down-stroke and every rise an up-stroke through the same four chords, the guitar rocking in the crack, notes off it;
   * the last, biggest bounce fires it straight up out of the crack and it spins away off the top of the room. Hearts.
   */
  private async buttGuitar() {
    const { EMO_RAW } = await loadEmoProps();
    if (this.destroyed) return;
    const root = this.rig.kit().root;
    const body = root.querySelector('#body') as SVGGElement | null;
    const near = root.querySelector('#butt')?.parentElement ?? null;
    if (!body || !near || near.parentNode !== body) return;
    this.rig.facing(1); this.set({ dir: 1 });
    this.rig.release('look', 200);
    const unduck = this.duckMusic();
    const own = this.rig.own as { bounce?: (n?: number) => Promise<void>; kick?: (vy: number, vx?: number) => void } | null;
    // standing in the crack: its foot at (85, 188) in his body's units, neck up and out behind him
    const k = 0.62, rot = -116, foot = { x: 85, y: 188 };
    const ax = Math.cos(rot * Math.PI / 180), ay = Math.sin(rot * Math.PI / 180);
    const Sx = foot.x + ax * (G_STRINGS[0] - 6) * k, Sy = foot.y + ay * (G_STRINGS[0] - 6) * k;
    const mid = { x: foot.x + ax * (G_BOX[0] / 2 - 6) * k, y: foot.y + ay * (G_BOX[0] / 2 - 6) * k };   // its middle
    const doc = new DOMParser().parseFromString(uniqueIds(EMO_RAW.emoguitar), 'image/svg+xml');
    const art = doc.querySelector('#emoguitar');
    const outer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    outer.setAttribute('class', 'emo-heldguitar');
    outer.style.transformBox = 'view-box'; outer.style.transformOrigin = `${foot.x}px ${foot.y}px`;
    const place = document.createElementNS(SVG_NS, 'g');
    place.setAttribute('transform', `translate(${Sx.toFixed(2)} ${Sy.toFixed(2)}) rotate(${rot}) scale(${k}) translate(${-G_STRINGS[0]} ${-G_STRINGS[1]})`);
    if (art) place.appendChild(document.importNode(art, true));
    outer.appendChild(place);
    // (well above the room before it starts: the room's top is clear above his drawing)
    const ABOVE = 460;
    outer.style.transform = `translate(0px, ${-ABOVE}px)`;
    body.insertBefore(outer, near);
    this.heldGuitar = () => outer.remove();
    // ---- it drops straight down into the crack ----
    this.rig.gaze(-12, -32);
    this.sfx('whoosh', { v: 0.4 });
    const FALL = 760, LAND = 0.82;
    const fell = outer.animate([
      { transform: `translate(0px, ${-ABOVE}px)`, easing: 'cubic-bezier(.5,0,1,.55)' },
      { transform: 'translate(0px, 5px)', offset: LAND, easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: 'translate(0px, -3px) rotate(-2deg)', offset: 0.92, easing: 'ease-in-out' },
      { transform: 'none' },
    ], { duration: FALL, fill: 'forwards' });
    void wait(FALL * LAND).then(() => {
      if (this.destroyed) return;
      this.sfx('boing'); this.sfx('guitar.down', { n: 0, v: 0.4 });
      own?.kick?.(70, -8);
      this.rig.face('open', 'open', 100);
      this.rig.gaze(-24, 20);
    });
    if (!(await fell.finished.then(() => !this.destroyed, () => false))) return;
    outer.style.transform = ''; fell.cancel();
    // it rocks a little as his cheeks settle round it
    outer.animate([{ transform: 'none' }, { transform: 'rotate(3deg)', offset: 0.25 }, { transform: 'rotate(-2deg)', offset: 0.55 }, { transform: 'rotate(1deg)', offset: 0.8 }, { transform: 'none' }],
      { duration: 620, easing: 'ease-in-out', composite: 'add' });
    this.voice('huh');
    await wait(760);
    this.rig.gaze();
    // ---- he plays it with his butt: the showcase bounce, a stroke on every landing and every rise; the last, biggest
    // landing fires it out ----
    const BEATS = 16, PER = 240;
    const strings = () => {
      const w = this.L.front.getBoundingClientRect(); if (!w.width) return this.headPos();
      const kx = w.width / WORLD.w; const p = screenFrame(body).toScreen(Sx, Sy);
      return { x: (p.x - w.left) / kx, y: (p.y - w.top) / kx };
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const landAt = (i: number) => 120 + PER * i + PER * 0.28;
    for (let i = 0; i < BEATS; i++) {
      const chord = Math.floor(i / 4) % 4;
      // (on the electric: an open hit on every landing, ringing until the rise; a palm-muted chug on every rise)
      timers.push(setTimeout(() => { if (this.destroyed) return; this.sfx('guitar.down', { n: chord, dur: PER * 0.4 / 1000 + 0.03 }); this.guitarNote(strings()); }, landAt(i)));
      timers.push(setTimeout(() => { if (!this.destroyed) this.sfx('guitar.mute', { n: chord, dur: 0.12 }); }, 120 + PER * i + PER * 0.68));
      // the band comes in under him, a bar a chord, at his pace (sfx.ts bandBar)
      if (i % 4 === 0) timers.push(setTimeout(() => { if (!this.destroyed) this.sfx('band.bar', { n: chord, gap: PER / 1000 }); }, landAt(i)));
    }
    // the guitar rocks in the crack on every beat
    const ms = PER * (BEATS + 1) + 360;
    const rock: Keyframe[] = [{ transform: 'none', offset: 0 }];
    for (let i = 0; i < BEATS; i++) {
      const sd = i % 2 ? 1 : -1;
      rock.push({ transform: `rotate(${sd * 3}deg)`, offset: Math.min(0.999, (landAt(i) + 10) / ms), easing: 'ease-out' }, { transform: `rotate(${-sd}deg)`, offset: Math.min(0.999, (120 + PER * i + PER * 0.7) / ms), easing: 'ease-in-out' });
    }
    rock.push({ transform: 'none', offset: Math.min(0.999, landAt(BEATS) / ms) }, { transform: 'none', offset: 1 });
    const rocking = outer.animate(rock, { duration: ms, composite: 'add' });
    // the launch, on the last landing: the big chord, and it shoots up out of the crack along its own line and spins
    // away off the top of the room (about its middle)
    let launched = false;
    timers.push(setTimeout(() => {
      if (this.destroyed) return;
      launched = true;
      rocking.cancel();
      this.sfx('guitar.down', { n: 0, dur: 2.6 }); this.sfx('band.end'); this.sfx('boing');
      for (let i = 0; i < 4; i++) setTimeout(() => this.guitarNote(strings(), 1.1), 40 + i * 110);
      own?.kick?.(120, 18);
      outer.style.transformOrigin = `${mid.x.toFixed(1)}px ${mid.y.toFixed(1)}px`;
      // straight up out of the crack along its own line first (no turn yet: turned, it lay across him), then spinning as it
      // climbs and drifts back over his shoulder, off the top of the room
      const up = outer.animate([
        { transform: 'none', easing: 'cubic-bezier(.15,.75,.4,1)' },
        { transform: `translate(${(ax * 80).toFixed(1)}px, ${(ay * 80).toFixed(1)}px) rotate(-6deg)`, offset: 0.2, easing: 'cubic-bezier(.25,.4,.6,1)' },
        { transform: `translate(${(ax * 80 - 120).toFixed(1)}px, ${(ay * 80 - 330).toFixed(1)}px) rotate(-200deg)`, offset: 0.62, easing: 'cubic-bezier(.3,0,.7,1)' },
        { transform: `translate(${(ax * 80 - 190).toFixed(1)}px, -700px) rotate(-400deg)` },
      ], { duration: 1200, fill: 'forwards' });
      const gone = () => { outer.remove(); this.heldGuitar = null; };
      up.finished.then(gone, gone);
      this.sfx('whoosh', { delay: 0.08 });
      this.rig.face('happy', 'smile', 120);
    }, landAt(BEATS)));
    if (own?.bounce) await own.bounce(BEATS + 1); else await wait(ms);
    timers.forEach(clearTimeout);
    unduck();
    if (!launched) { rocking.cancel(); outer.remove(); this.heldGuitar = null; }
    if (this.destroyed) return;
    this.rig.gaze(-20, -34);
    this.hearts(3);
    this.voice('happy');
    await wait(700);
    this.rig.gaze();
    if (this.own?.cheer) await this.own.cheer();
    await wait(300);
    this.rig.restFace();
  }
  /**
   * The mirror selfie (the emo pack's Pet item, what `pet()` does while it is worn; DEV only: /emopack). We are the
   * mirror. The pet puts its hand up (the cat, her tail) and looks up; a flip phone falls in from the top of the room
   * beside it and it catches it, camera toward us; it poses three times, a flash and a shutter for each: smug, the emo
   * pout (chin down, eyes up), happy; then it looks down at what it took and giggles, hearts, and the phone snaps shut and
   * is thrown off out of the room. About 7 s.
   */
  private heldPhone: (() => void) | null = null;
  private async selfie() {
    const { EMO_RAW } = await loadEmoProps();
    if (this.destroyed) return;
    const A = this.rig.selfieArm();
    const root = this.rig.kit().root;
    const host = root.querySelector('#' + A.phone.host) as SVGGElement | null;
    if (!host || !(host instanceof SVGGElement)) return;
    this.rig.facing(1); this.set({ dir: 1 });
    this.rig.release('look', 160);
    // a limb drawn under the head comes in front of it for the selfie (the cat's paw): moved to the end of the figure, in
    // a wrapper that is given, every frame, whatever its own group does to it (her body's breath and crouch), so it moves
    // as before; put back afterwards
    let putBack = () => {};
    if (A.bring) {
      const limb = root.querySelector('#' + A.bring.id); const from = root.querySelector('#' + A.bring.from); const fig = root.querySelector('#figure');
      if (limb && from instanceof SVGGElement && fig instanceof SVGGElement) {
        const parent = limb.parentNode; const next = limb.nextSibling;
        const wrap = document.createElementNS(SVG_NS, 'g') as SVGGElement;
        fig.appendChild(wrap); wrap.appendChild(limb);
        let raf = 0;
        const sync = () => {
          const a = fig.getScreenCTM(); const b = from.getScreenCTM();
          if (a && b) { const m = a.inverse().multiply(b); wrap.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`); }
          raf = requestAnimationFrame(sync);
        };
        sync();
        putBack = () => { cancelAnimationFrame(raf); if (parent && limb.parentNode === wrap) parent.insertBefore(limb, next && next.parentNode === parent ? next : null); wrap.remove(); putBack = () => {}; };
      }
    }
    // the hand up, ready for it, eyes up to it
    this.rig.selfieReady();
    this.rig.selfieUp();
    await wait(560);
    if (this.destroyed) { putBack(); return; }
    // the phone, in the hand, upright with the arm up (turned back by the raise); held invisible until it is caught
    const [hx, hy] = A.phone.at; const k = A.phone.w / 40;
    const turn = -A.raise - (A.upper?.deg ?? 0) + A.phone.tilt;
    const doc = new DOMParser().parseFromString(uniqueIds(EMO_RAW.emophone), 'image/svg+xml');
    const art = doc.querySelector('#emophone');
    const outer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    outer.setAttribute('class', 'emo-heldphone');
    outer.style.opacity = '0';
    outer.style.transformBox = 'view-box'; outer.style.transformOrigin = `${hx}px ${hy}px`;
    const place = document.createElementNS(SVG_NS, 'g');
    place.setAttribute('transform', `translate(${hx} ${hy}) rotate(${turn.toFixed(1)}) scale(${k.toFixed(4)}) translate(-20 -60)`);
    if (art) place.appendChild(document.importNode(art, true));
    outer.appendChild(place); host.appendChild(outer);
    let flyer: { el: HTMLDivElement } | null = null;
    this.heldPhone = () => { putBack(); outer.remove(); flyer?.el.remove(); };
    const lens = () => {
      const w = this.L.cat.parentElement?.getBoundingClientRect(); if (!w) return this.headPos();
      const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('cx', '20'); c.setAttribute('cy', '30.5'); c.setAttribute('r', '0.05');
      place.appendChild(c); const r = c.getBoundingClientRect(); c.remove();
      const kx = w.width / WORLD.w;
      return { x: (r.left + r.width / 2 - w.left) / kx, y: (r.top + r.height / 2 - w.top) / kx };
    };
    // ---- it falls in from the top of the room, past the pet's head, and is caught ----
    const fall = this.overlay(place, EMO_RAW.emophone, 40, 76);
    flyer = fall;
    this.sfx('whoosh', { v: 0.4 });
    if (!(await this.dropIn(fall, A.side, 600, 200, A.out ?? this.clearOf(fall.el, A.side)))) return;
    outer.style.opacity = ''; fall.el.remove(); flyer = null;
    this.sfx('catch');
    outer.animate([{ transform: 'scale(1.08) rotate(4deg)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    A.catch?.();
    this.rig.selfieLook();
    await wait(520);
    // ---- three shots ----
    for (let i = 0; i < 3; i++) {
      if (this.destroyed) return;
      this.rig.selfiePose(i);
      await wait(i === 1 ? 520 : 420);
      if (this.destroyed) return;
      const p = lens();
      const f = new Prop(this.L.front, 'emoflash', 46).place(p.x, p.y + 23);
      f.el.style.transformOrigin = '50% 50%';
      f.anim([{ transform: 'scale(0.3) rotate(0deg)', opacity: 0 }, { transform: 'scale(1.1) rotate(10deg)', opacity: 1, offset: 0.25 }, { transform: 'scale(1.3) rotate(18deg)', opacity: 0 }], { duration: 300, easing: 'ease-out' }).finished.then(() => f.el.remove(), () => f.el.remove());
      this.flash(220);
      this.sfx('shutter');
      await wait(480);
    }
    // ---- what did it take: a look, a giggle, hearts ----
    this.rig.selfieLook();
    await wait(380);
    this.voice('giggle');
    this.hearts(2);
    await wait(900);
    if (this.destroyed) return;
    // ---- the phone snaps shut and is thrown off ----
    const open_ = place.querySelector('.ph-open') as SVGElement | null; const shut = place.querySelector('.ph-shut') as SVGElement | null;
    if (open_) open_.style.visibility = 'hidden'; if (shut) shut.style.visibility = 'visible';
    this.sfx('ui.close', { v: 0.8 });
    await wait(300);
    if (this.destroyed) return;
    if (A.toss) {
      // the pet's own throw: a copy takes the phone from the hand the moment it lets go, and flies up and away
      await A.toss(() => {
        if (this.destroyed) return;
        const toss = this.overlay(place, EMO_RAW.emophone, 40, 76);
        const shutC = toss.el.querySelector('.ph-shut') as SVGElement | null; const openC = toss.el.querySelector('.ph-open') as SVGElement | null;
        if (openC) openC.style.visibility = 'hidden'; if (shutC) shutC.style.visibility = 'visible';
        outer.remove(); this.heldPhone = null;
        this.sfx('whoosh');
        void this.arcOut(toss, A.side, 1000, 130, 600);
      });
      if (this.destroyed) return;
      this.rig.selfieDone();
      this.rig.release('selfie', 300);
      await wait(320);
      putBack();
      this.rig.restFace();
      return;
    }
    const toss = this.overlay(place, EMO_RAW.emophone, 40, 76);
    const shutC = toss.el.querySelector('.ph-shut') as SVGElement | null; const openC = toss.el.querySelector('.ph-open') as SVGElement | null;
    if (openC) openC.style.visibility = 'hidden'; if (shutC) shutC.style.visibility = 'visible';
    outer.remove(); this.heldPhone = null;
    this.sfx('whoosh');
    this.tossOut(toss, A.side, 800, this.clearOf(toss.el, A.side));
    this.rig.selfieDone();
    this.rig.release('selfie', 420);
    await wait(460);
    putBack();
    this.rig.restFace();
  }

  /**
   * Kapparot (the Jewish pack's hen item; what `pet()` does while it is worn). A white hen flutters in and lands at the
   * pet's feet; it gathers her up, lifts her over its head and she circles there three slow laps, flapping, while its
   * raised paws sway under her and its eyes follow her round; then she comes back down, is set on the floor and flaps
   * off out of the room. She is never harmed and never seen again after she leaves. About 8.5 s.
   *
   * Her wings flap and her legs switch by VISIBILITY (hen.svg's frames), never opacity: an SVG group with an opacity
   * animation gets its own GPU layer in Chrome, and the dreidel blinked out that way.
   */
  private async kapparot() {
    const ch = this.rig.character as keyof typeof KAPPAROT;
    const K = this.own?.tune?.kapparot ?? KAPPAROT[ch] ?? KAPPAROT.cat;
    const dir: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;               // she comes in from the roomier side
    if (ch === 'frog') { this.set({ dir }); this.rig.facing(dir); }
    const face = ch === 'frog' ? this.rig.facingDir : 1;
    const X = this.st.x; const cx = X + face * K.cx; const cy = K.top + 4; const rx = K.rx; const ry = 16;
    const feet = { x: X, y: WORLD.floor + 8 };                       // where she stands at the pet's feet
    const HW = this.own?.tune?.kapparot?.henW ?? HEN_W * (ch === 'sahur' ? 1.25 : 1);
    const hen = new Prop(this.L.front, 'hen', HW).place(feet.x, feet.y + HW * 0.08);
    hen.el.style.transformOrigin = '50% 92%';                        // she scales about her feet
    const wings = [0, 1, 2].map((i) => hen.find(`.w${i}`));
    const legs = { stand: hen.find('.legs.stand'), dangle: hen.find('.legs.dangle') };
    const setLegs = (air: boolean) => { if (legs.stand) legs.stand.style.visibility = air ? 'hidden' : 'visible'; if (legs.dangle) legs.dangle.style.visibility = air ? 'visible' : 'hidden'; };
    const setFacing = (d: Dir) => { hen.inner.style.transform = d < 0 ? 'scaleX(-1)' : ''; };
    /** Flap for `ms`: the wing frames in turn (folded, half, up, half), `period` ms a beat; folded again at the end. */
    const flap = (ms: number, period = 190) => {
      const it = Math.max(1, Math.round(ms / period));
      this.sfx('flaps', { n: it, gap: period / 1000, v: 0.7 });
      const slot = (vis: [number, number][]): Keyframe[] => {
        const kf: Keyframe[] = [{ visibility: 'hidden', offset: 0 }];
        for (const [a, b] of vis) kf.push({ visibility: 'hidden', offset: a }, { visibility: 'visible', offset: a }, { visibility: 'visible', offset: b }, { visibility: 'hidden', offset: b });
        kf.push({ visibility: 'hidden', offset: 1 });
        return kf;
      };
      const plans: [number, number][][] = [[[0, 0.25]], [[0.25, 0.5], [0.75, 1]], [[0.5, 0.75]]];
      const anims = wings.map((w, i) => w?.animate(slot(plans[i]!), { duration: period, iterations: it }));
      return Promise.all(anims.map((a) => a?.finished.catch(() => {}))).then(() => {});
    };
    /** Her position as absolute keyframes from where she was placed (translate, then a depth scale), committed at the end. */
    const at = (x: number, y: number, sc = 1) => `translate(${(x - feet.x).toFixed(1)}px, ${(y - feet.y).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    const move = async (kf: Keyframe[], ms: number, easing = 'linear') => {
      hen.el.style.transform = kf[kf.length - 1]!.transform as string;
      await hen.el.animate(kf, { duration: ms, easing }).finished.catch(() => {});
    };
    /**
     * A flight from (x0, y0) to (x1, y1) over ms, bobbing with the wingbeats. 'arc' eases both together with a lift in the
     * middle; 'sideUp' goes out to the side first and then up (lifted from the feet up the side of the head, never across
     * the face); 'downIn' comes down the side first and then in to the feet.
     */
    const fly = (x0: number, y0: number, x1: number, y1: number, ms: number, lift: number, mode: 'arc' | 'sideUp' | 'downIn' = 'arc') => {
      const n = 28; const kf: Keyframe[] = [];
      const io = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)); const eo = (t: number) => 1 - (1 - t) * (1 - t); const ei = (t: number) => t * t;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const ex = mode === 'sideUp' ? eo(Math.min(1, t * 1.4)) : mode === 'downIn' ? ei(t) : io(t);
        const ey = mode === 'sideUp' ? ei(t) : mode === 'downIn' ? eo(Math.min(1, t * 1.4)) : io(t);
        const x = x0 + (x1 - x0) * ex; const y = y0 + (y1 - y0) * ey - lift * Math.sin(Math.PI * t) + (i % 2 ? -2 : 0) * Math.sin(Math.PI * t);
        kf.push({ transform: at(x, y), offset: t });
      }
      return move(kf, ms);
    };
    const shed = (x: number, y: number) => {
      if (this.destroyed) return;
      const f = new Prop(this.L.front, 'feather', rand(12, 16)).place(x + rand(-10, 10), y);
      const drift = rand(-26, 26); const fall = rand(70, 110);
      f.anim([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1, offset: 0 }, { transform: `translate(${drift * 0.5}px, ${fall * 0.4}px) rotate(${rand(40, 90)}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in-out' },
        { transform: `translate(${drift}px, ${fall}px) rotate(${rand(-40, 20)}deg)`, opacity: 0, offset: 1 },
      ], { duration: rand(1300, 1700), easing: 'ease-out' }).finished.then(() => f.el.remove(), () => f.el.remove());
    };

    // ---- she flutters in from the roomier side and lands at the pet's feet ----
    const x0 = X + dir * 380; const y0 = WORLD.floor - 110;   // low: she comes in under the pet's face
    setLegs(true); setFacing(-dir as Dir);
    hen.el.style.transform = at(x0, y0);
    this.rig.facing(dir);
    void this.rig.perk();
    this.rig.look(dir * 0.8, -0.3);
    const inFlap = flap(1000, 160);
    await fly(x0, y0, feet.x, feet.y, 1000, 26);
    setLegs(false);
    this.dust(feet.x, 0.8);
    this.sfx('cluck', { n: 3 });
    await inFlap;
    this.rig.tilt(dir);
    await wait(260);
    this.rig.release('tilt', 240);
    // ---- the pet gathers her up (a flustered flap from her) ----
    this.rig.release('look', 200);
    this.rig.hug();
    this.sfx('squawk');
    void flap(420, 140);
    await wait(700);
    // ---- and lifts her over its head, to the right of the circle ----
    this.rig.release('hug', 300);
    this.rig.kapparotRaise();
    setLegs(true); setFacing(1);
    const up = flap(620, 150);
    await fly(feet.x, feet.y, cx + rx, cy, 620, 0, 'sideUp');
    await up;
    // ---- three slow laps: in front of the head moving left, round the far side moving right, a little smaller there ----
    const LAPS = 3; const LAP = 1300; const n = 48 * LAPS; const ms = LAPS * LAP;
    const kf: Keyframe[] = []; const turn: Keyframe[] = [];
    for (let i = 0; i <= n; i++) {
      const th = (2 * Math.PI * i) / 48; const s = Math.sin(th);
      const sc = 0.8 + 0.2 * (1 + s) / 2;
      kf.push({ transform: at(cx + rx * Math.cos(th), cy + ry * s + (i % 4 < 2 ? 0 : -1.5), sc), offset: i / n });
    }
    // she faces the way she is going: left across the front (0..pi), right across the back (pi..2pi)
    turn.push({ transform: 'scaleX(1)', offset: 0 });
    for (let l = 0; l < LAPS; l++) {
      const a = (l * 2 + 0.02) / (2 * LAPS); const b = (l * 2 + 1) / (2 * LAPS);
      turn.push({ transform: 'scaleX(1)', offset: a }, { transform: 'scaleX(-1)', offset: a }, { transform: 'scaleX(-1)', offset: b }, { transform: 'scaleX(1)', offset: b });
    }
    turn.push({ transform: 'scaleX(1)', offset: 1 });
    const laps = move(kf, ms);
    hen.inner.style.transform = '';
    hen.inner.animate(turn, { duration: ms });
    const follow = this.rig.kapparotFollow(LAPS, LAP);
    void flap(ms, 200);
    // a feather each lap as she swings out at the far side (beside the head, never falling across the face)
    for (let l = 0; l < LAPS; l++) setTimeout(() => { shed(cx - rx, cy - 10); this.sfx('cluck', { n: 2, v: 0.8 }); }, l * LAP + LAP * 0.5);
    await laps; await follow;
    // ---- back down into its arms ----
    this.rig.release('kapparot', 420);
    const down = flap(600, 150);
    setFacing(-1);
    await fly(cx + rx, cy, feet.x, feet.y, 600, 0, 'downIn');
    setLegs(false);
    await down;
    this.rig.hug();
    await wait(520);
    // ---- set down; she flaps off out of the room ----
    this.rig.release('hug', 300);
    const away: Dir = dir;
    setFacing(away);
    await wait(180);
    setLegs(true);
    this.rig.look(away * 0.9, -0.2);
    // all the way out past the edge of the room on that side (from a pet by the far wall that is most of the room)
    const exitX = away > 0 ? WORLD.w + HW : -HW;
    const exitMs = Math.round(700 + Math.abs(exitX - feet.x) * 0.8);
    const off = flap(exitMs, 150);
    this.sfx('squawk', { v: 0.7 });
    await fly(feet.x, feet.y, exitX, WORLD.floor - 250, exitMs, 30);
    await off;
    void hen.remove(0);
    // a quiet, content moment afterwards
    this.rig.release('look', 300);
    this.rig.face('happy', 'smile', 240);
    this.voice('hello');
    this.sparkles(3, this.headPos().x, this.headPos().y - 40, 50);
    await wait(700);
    this.rig.restFace();
  }

  /**
   * The falcon (the Habibi pack's Pet item; what `pet()` does while it is worn). The pet looks to the side it will come
   * from and holds out its perch: its own head for the cat (she sits on her front legs and cannot raise a paw), the frok's
   * forward arm held straight out, Sahur's bat held out level, the seal's raised flipper. The falcon flies in through the
   * side wall, beating all the way and pitched along its path, down across the room and onto the perch (up from under an
   * arm or the bat, down from above onto a head or beside one), flaring in its last moment: upright, wings up and back,
   * tail fanned, legs thrown forward, the body swinging up as it slows onto the perch (falconArrive: the departure run
   * backwards, on one clock). The perch gives; it folds its wings and bobs. The pet beams: it preens the cat's hair; the frok draws his arm in and strokes its breast; it hops up off
   * Sahur's bat onto his cap (when there is room over it) and preens it while he waves up at it; the seal leans its cheek
   * to it while it looks back at the seal. It rouses (fluffs up and shakes, a feather drifts down; the pet squints), looks
   * round, and leaves the way it faces: where it faces the pet (on the frok's arm, which he holds out again for the
   * release, and on Sahur's bat) it first turns away on its perch, so it never crosses a face. It pushes off, beats hard,
   * climbs and flies out through the side wall under the ceiling (falconDepart). It never pecks and is never harmed. ~8 s.
   *
   * While it sits it is not the prop: a copy of its drawing is put INSIDE the pet's own svg, in the group it stands on (the
   * head unit, the arm, the bat's arm, the flipper), placed exactly where the prop landed, so it rides every motion of the
   * perch (the idle bob, the give, the arm drawn in) with nothing to line up (the frok's camera does the same). The prop
   * takes over again at the very spot when it takes off. Its frames switch by VISIBILITY (falconFrame / falconBeat).
   */
  private async falcon() {
    const ch = (this.rig.character in FALCON_W ? this.rig.character : 'cat') as keyof typeof FALCON_W;
    const T = this.own?.tune?.falcon;
    const W = T?.w ?? FALCON_W[ch];
    const H = (W * FALCON.box[1]) / FALCON.box[0];
    // room for the perch: Sahur's bat and the seal's raised flipper reach out on their left
    const minX = T?.minX ?? (ch === 'sahur' ? 262 : ch === 'seal' ? 180 : WALK_MIN);
    if (this.st.x < minX) await this.walkTo(minX);
    // it comes in from the roomier side to the cat and the frok (who turns to face it), from the bat's side to Sahur, and
    // over the seal's head from its right, and faces the way it flies: it lands facing the frok and Sahur, facing out on the
    // seal's flipper (the seal's head is drawn over the flipper: a bird facing it would have its breast under the seal's
    // cheek), and leaves the way it faces
    const from: Dir = T?.from ?? (ch === 'sahur' ? -1 : ch === 'seal' ? 1 : this.st.x < WORLD.w / 2 ? 1 : -1);
    let fly = (-from) as Dir;   // (let: facing the pet on its arm or bat, it turns round before it leaves)
    let hopped = false;
    if (ch === 'frog') { this.set({ dir: from }); this.rig.facing(from); }
    // the prop, anchored so its grip point (the toes) is at R: at(x, y) puts the grip at (x, y)
    const R = { x: this.st.x, y: WORLD.floor };
    const bird = new Prop(this.L.front, 'falcon', W).place(R.x, R.y + H * (1 - FALCON.grip[1] / FALCON.box[1]));
    const org = `${(FALCON.grip[0] / FALCON.box[0]) * 100}% ${(FALCON.grip[1] / FALCON.box[1]) * 100}%`;
    bird.el.style.transformOrigin = '50% 50%'; bird.inner.style.transformOrigin = org;   // it pitches about its middle; it mirrors about its toes
    bird.el.style.willChange = 'transform';   // one layer for the whole flight (see the dreidel's note)
    const root = bird.find('.fc-bird');
    if (!root) { void bird.remove(0); return; }
    const fr: FalconFrame = { pose: 'fly', nw: 'glide', sw: 'fold', legs: 'grip', tail: 'closed', body: 'sleek', head: 'fly', joy: false };
    let mount = null as FalconMount | null;   // (set inside the helpers below: the cast keeps TypeScript from narrowing it to null)
    const set = (patch: Partial<FalconFrame>) => { Object.assign(fr, patch); falconFrame(mount?.root ?? root, fr); };
    const face = (d: Dir) => { bird.inner.style.transform = d < 0 ? 'scaleX(-1)' : ''; };
    const at = (x: number, y: number) => `translate(${(x - R.x).toFixed(1)}px, ${(y - R.y).toFixed(1)}px)`;
    const io = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
    /**
     * The grip point from (x0, y0) to (x1, y1) over `ms` along `ease`, `bow` above the straight line in the middle
     * (negative: below). With `level` (0..1) the flying drawing is pitched along its path (nose down going down, up going
     * up, at most `maxPitch`) until then, easing back to level over the stretch before it: the upright pose that follows
     * (the flare) must never show tilted, even a frame early. It eases into its pitch over the first `ramp` of the way too,
     * from level (a flight that starts where a level one ended must not snap to its angle).
     */
    const flight = (x0: number, y0: number, x1: number, y1: number, ms: number, bow: number, ease: (t: number) => number = io, level = 0, maxPitch = 24, ramp = 0.25) => {
      const n = 28; const kf: Keyframe[] = [];
      const pt = (t: number) => { const e = ease(t); return { x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e - bow * Math.sin(Math.PI * e) }; };
      const d = x1 >= x0 ? 1 : -1;
      for (let i = 0; i <= n; i++) {
        const t = i / n; const q = pt(t);
        let r = 0;
        if (level > 0 && t < level) {
          const a = pt(Math.max(0, t - 0.01)); const b = pt(Math.min(1, t + 0.01));
          r = d * clamp((Math.atan2(b.y - a.y, (b.x - a.x) * d) * 180) / Math.PI, -maxPitch, maxPitch) * clamp((level - t) / 0.18, 0, 1) * clamp(t / ramp, 0, 1);
        }
        kf.push({ transform: `${at(q.x, q.y)} rotate(${r.toFixed(1)}deg)`, offset: t });
      }
      bird.el.style.transform = kf[n]!.transform as string;
      return bird.el.animate(kf, { duration: ms }).finished.then(() => {}, () => {});
    };
    /** From the perched copy back to the prop, at the very spot: the grip's place in the room now. */
    const takeOff = () => {
      if (!mount) return;
      const p = this.falconGripRoom(mount);
      mount.g.remove(); mount = null;
      bird.el.style.transform = at(p.x, p.y);
      bird.el.style.opacity = '';
      falconFrame(root, fr);
      return p;
    };
    /**
     * From the prop to a perched copy, if the perch was found (else the prop stays and sits there). The perch was measured
     * before the last leg of the flight and the pet has moved since (Sahur's whole log breathes: ~4 room units at his cap),
     * so the prop first glides the last bit onto where the perch is now, and the copy goes on at the very spot.
     */
    const perch = async (spot: FalconSpot | null, d: Dir) => {
      const w = this.L.cat.parentElement?.getBoundingClientRect();
      if (spot && w) {
        const now = screenFrame(spot.host).toScreen(spot.x, spot.y); const kx = w.width / WORLD.w;
        const to = { x: (now.x - w.left) / kx, y: (now.y - w.top) / kx };
        const from = this.falconPropAt(bird, R);
        if (Math.hypot(to.x - from.x, to.y - from.y) > 0.2) {
          const kf = [{ transform: at(from.x, from.y) }, { transform: at(to.x, to.y) }];
          bird.el.style.transform = kf[1]!.transform;
          await bird.el.animate(kf, { duration: 70, easing: 'ease-out' }).finished.catch(() => {});
          if (this.destroyed) return;
        }
      }
      mount = spot ? this.falconMount(spot, d, W, fr) : null;
      // hidden by opacity: its frames are set visible one by one, and a child set visible shows inside a hidden parent
      if (mount) bird.el.style.opacity = '0';
    };

    // ---- the pet hears it coming: it looks to the side it will come from and holds out its perch. The falcon waits off
    // the room's edge until the perch is held and settled, which is when the perch is measured: nothing moves it after ----
    fr.head = 'sit'; Object.assign(fr, { pose: 'sit', sw: 'up', legs: 'reach', tail: 'fan', body: 'sleek' });
    face(fly); falconFrame(root, fr);   // (the landing's frame underneath: falconArrive shows the flight over it)
    bird.el.style.transform = at(fly > 0 ? -W * 2 : WORLD.w + W * 2, 90);
    this.sfx('falcon.cry', { v: 0.7 });
    this.rig.look(from * 0.9, -0.6);
    void this.rig.perk();
    this.rig.falconReady();
    await wait(600);
    if (this.destroyed) return;
    const spot = this.falconSpot(ch === 'cat' && !T?.perch ? 'head' : 'arm');
    const P = spot?.room ?? { x: this.st.x, y: this.B.top + 28 * this.S };
    // ---- it flies in, beating, down across the room, swoops in under the perch and flares up onto it (falconArrive) ----
    const arrival = this.falconArrive(bird, root, R, P, fly, W, T?.onto ?? FALCON_ONTO[ch]);
    this.sfx('wings', { n: 5, gap: 0.21 });
    setTimeout(() => { if (!this.destroyed) this.rig.face('open', 'smile', 200); }, 500);
    await arrival.done;
    if (this.destroyed) return;
    // ---- touchdown: it grips, the perch gives, the wings come down and fold, a bob of the head ----
    set({ legs: 'grip' });
    this.sfx('pat', { v: 0.8 });
    for (const a of arrival.anims) a.cancel();   // (the frame underneath is the same one, but for the legs, now gripping)
    await perch(spot, fly);
    void this.rig.falconGive();   // (after it is on: the copy rides the dip, the prop could not)
    await wait(110); set({ sw: 'half' });
    await wait(130); set({ sw: 'fold', tail: 'closed' });
    await wait(170);
    this.rig.look(from * 0.35, -0.6);
    for (let i = 0; i < 2; i++) { set({ head: 'down' }); await wait(120); set({ head: 'sit' }); await wait(150); }
    this.rig.face('happy', 'smile', 200);
    this.voice('happy');
    this.hearts(2, { x: (P.x + this.st.x) / 2, y: P.y - 30 });
    await wait(180);
    if (this.destroyed) return;

    // ---- the pet and the falcon ----
    const preen = async (n: number) => { for (let i = 0; i < n; i++) { set({ head: 'preen' }); await wait(230); set({ head: 'down' }); await wait(150); } set({ head: 'sit' }); };
    if (ch === 'frog' && mount) {
      // he draws his arm in, the falcon riding it (turned back as the arm turns, so it stays upright), and strokes its breast
      const deg = this.rig.falconDrawIn(620);
      mount.g.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-deg}deg)` }], { duration: 620, easing: 'ease-out', fill: 'forwards', composite: 'add' }).persist();
      await wait(620);
      const stroke = this.rig.falconStroke(2, 460);
      await wait(420); set({ joy: true, head: 'joy' });
      await stroke;
      set({ joy: false, head: 'sit' });
    } else if (ch === 'sahur' && this.falconHeadroom()) {
      // on the bat it is out of his free hand's reach: it hops up onto his cap, the bat comes down, and he reaches up to it
      // (not when what he wears on his head is so tall that a bird on it would reach the ceiling: then it stays on the bat)
      this.rig.face('happy', 'smile', 200);
      await wait(260);
      const spot2 = this.falconSpot('head');
      const p0 = takeOff() ?? P;
      const P2 = spot2?.room ?? { x: this.st.x, y: this.B.top + 4 * this.S };
      set({ sw: 'up', legs: 'reach', tail: 'fan' });
      this.rig.release('falcon', 560);
      const hop = falconBeat(root, 'sit', 700, 140);
      await flight(p0.x, p0.y, P2.x, P2.y, 700, 46);
      await hop;
      set({ legs: 'grip', sw: 'half' });
      await perch(spot2, fly);
      await wait(130); set({ sw: 'fold', tail: 'closed' });
      this.rig.look(0.1, -0.9);
      await wait(200);
      // his hand cannot reach above his own cap: he waves up at it while it preens the top of his head
      hopped = true;
      const stroke = this.rig.falconStroke(2, 480);
      await wait(300);
      await preen(2);
      set({ joy: true, head: 'joy' });
      await stroke;
      set({ joy: false, head: 'sit' });
    } else if (ch === 'sahur') {
      // no room over his head: it stays on the bat, bobs to him and shuts its eyes, content, while he beams at it
      const stroke = this.rig.falconStroke(2, 480, false);
      await wait(260);
      await preen(2);
      set({ joy: true, head: 'joy' });
      await stroke;
      set({ joy: false, head: 'sit' });
    } else if (ch === 'seal') {
      // the seal leans its cheek to it; it looks back over its shoulder at the seal and shuts its eyes, content
      const stroke = this.rig.falconStroke(3, 420);
      await wait(300);
      set({ head: 'back' }); await wait(700);
      set({ joy: true });
      await stroke;
      set({ joy: false, head: 'sit' });
    } else {
      // the cat leans into it while it preens her hair
      const stroke = this.rig.falconStroke(3, 380);
      await wait(260);
      await preen(3);
      set({ joy: true, head: 'joy' });
      await stroke;
      set({ joy: false, head: 'sit' });
    }
    if (this.destroyed) return;
    await wait(120);

    // ---- it rouses: fluffs up, shakes it all out (the pet squints), a feather drifts down; sleek again ----
    set({ body: 'fluff' });
    const grip = mount ? this.falconGripRoom(mount) : P;
    if (mount) {
      const sh: Keyframe[] = [];
      for (let i = 0; i <= 12; i++) sh.push({ transform: `rotate(${(i === 0 || i === 12 ? 0 : (i % 2 ? 7 : -7) * (1 - i / 14)).toFixed(1)}deg) scale(${(1 + 0.06 * Math.sin((Math.PI * i) / 12)).toFixed(3)})`, offset: i / 12 });
      mount.g.animate(sh, { duration: 560, easing: 'linear', composite: 'add' });
    }
    void this.rig.falconFlinch(560);
    this.sfx('flaps', { n: 5, gap: 0.09, v: 0.6 });
    setTimeout(() => this.falconFeather(grip.x - fly * 10, grip.y - 30), 240);
    await wait(600);
    set({ body: 'sleek' });
    this.rig.restFace(200);
    // ---- it looks round (over its shoulder and back), turns away if it faces the pet, crouches and goes ----
    bird.el.dataset.leaving = 'soon';   // (the headless checks film from here)
    if (ch === 'frog' && mount && this.rig.holding('falconIn')) {
      // the falconer's release: he holds his arm out again, the falcon riding it (turned back as the arm turns, on the same
      // curve: a hold eases out), in front of his chest and clear of his snout, so it leaves from his fist, away from his face
      const OUTMS = 560;
      const deg = this.rig.falconHoldOut(OUTMS);
      mount.g.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-deg}deg)` }], { duration: OUTMS, easing: 'ease-out', fill: 'forwards', composite: 'add' }).persist();
      await wait(OUTMS + 60);
    }
    await wait(160);
    set({ head: 'back' }); await wait(330);
    if (mount && (ch === 'frog' || (ch === 'sahur' && !hopped) || T?.turn)) {
      // it faces the frok on his arm and Sahur on his bat: taking off forward would cross their faces, so it turns away
      // first, a little hop with its wings half open, mirrored at the top of it (the side-on turn), down facing out
      const m = mount;
      set({ head: 'sit', sw: 'half' });
      m.g.animate([{ transform: 'translate(0px, 0px)', easing: 'ease-out' }, { transform: `translate(${(m.up.x * 7).toFixed(2)}px, ${(m.up.y * 7).toFixed(2)}px)`, offset: 0.5, easing: 'ease-in' }, { transform: 'translate(0px, 0px)' }], { duration: 280, composite: 'add' });
      await wait(140);
      const place = m.g.querySelector('.fc-place');
      const t = place?.getAttribute('transform') ?? '';
      place?.setAttribute('transform', t.includes('scale(-1 1)') ? t.replace(' scale(-1 1)', '') : t.replace(/ translate\(-70 -120\)$/, ' scale(-1 1) translate(-70 -120)'));
      fly = (-fly) as Dir; face(fly);
      await wait(140);
      set({ sw: 'fold' }); await wait(200);
    } else {
      set({ head: 'sit' }); await wait(180);
    }
    set({ sw: 'half' });
    if (mount) mount.g.animate([{ transform: 'translate(0px, 0px)' }, { transform: `translate(${(-mount.up.x * 3).toFixed(2)}px, ${(-mount.up.y * 3).toFixed(2)}px)` }, { transform: 'translate(0px, 0px)' }], { duration: 200, easing: 'ease-in-out', composite: 'add' });
    await wait(200);
    if (this.destroyed) return;
    const p1 = takeOff() ?? this.falconPropAt(bird, R);
    this.rig.release('falconOut', 520); this.rig.release('falconIn', 520); this.rig.release('falcon', 560);
    // ---- off: it pushes off (legs straight, wings up), beats hard and climbs away the way it faces, out of the room ----
    set({ pose: 'sit', sw: 'up', legs: 'push', tail: 'fan', head: 'sit', joy: false });
    this.rig.look(fly * 0.9, -0.9);
    const away = this.falconDepart(bird, root, R, p1, fly, W);
    this.sfx('wings', { n: 6, gap: 0.2 }); this.sfx('falcon.cry', { v: 0.6, delay: 0.7 });
    if (ch === 'seal') void this.rig.flap(3);
    await wait(420);
    this.rig.face('happy', 'smile', 200);
    this.sparkles(3, this.headPos().x, this.headPos().y - 40, 50);
    await away;
    void bird.remove(0);
    this.rig.release('look', 300);
    await wait(300);
    this.rig.restFace();
  }
  /**
   * The falcon arrives: the departure run backwards, on ONE clock like it. It comes in through the side wall on the side it
   * flies from, at the height it leaves at (all of it under the ceiling), in the flying pose, beating steadily the whole way
   * (up, glide, down, glide: never a held frame) and pitched along its path (nose down as it descends). The path is one
   * cubic Bezier: level at first, then down across the room, coming onto the perch along `onto` (FALCON_ONTO: up from under
   * an arm or a bat, down from above onto a head or beside one). In the last FLARE ms it flares: the upright pose, wings up
   * and back to brake, tail fanned, legs thrown forward, the body swinging up from leaning into its flight to upright, the
   * speed running down to nothing at the perch (the flare's speed at its start is the flight's own: no hang in mid-air).
   * The lean at the swap is set so the upright drawing is ~45 degrees off the flying one, as at the departure's swap.
   * Its grip ends on `P`. Returns the animations, which the caller cancels once it
   * has set the landing's frame underneath (an animation outranks an inline style), and the promise of the end.
   */
  private falconArrive(bird: Prop, root: Element, R: { x: number; y: number }, P: { x: number; y: number }, face: Dir, W: number, onto: [number, number]) {
    const k = W / FALCON.box[0];
    const cruise = 16 + 110 * k;                                          // as the departure: the wing tips under the cornice
    const E = { x: face > 0 ? -W * 0.75 : WORLD.w + W * 0.75, y: cruise + 6 };
    const vT = { x: face * onto[0], y: onto[1] };                         // how it comes onto the perch
    const Lv = Math.hypot(vT.x, vT.y);
    const DA = Math.round(clamp(700 + Math.abs(P.x - E.x) * 1.1, 1150, 1800));
    const FLARE = 230;
    const ease = (t: number) => 0.6 * t + 0.4 * (1 - (1 - t) * (1 - t));   // quick in, slower toward the flare, never stopping
    const vEnd = (3 * Lv * 0.6) / DA;                                     // the swoop's speed at its end (units a ms)
    const dF = (vEnd * FLARE) / 2;                                        // what the flare covers, slowing to nothing at the same rate
    const F = { x: P.x - (vT.x / Lv) * dF, y: P.y - (vT.y / Lv) * dF };   // where the flare starts: behind the perch and under it
    const C1 = { x: E.x + face * 0.4 * Math.abs(F.x - E.x), y: E.y };      // level at first
    const C2 = { x: F.x - vT.x, y: F.y - vT.y };                          // in under the perch, rising onto it
    const D = DA + FLARE; const o = DA / D;
    const bez = (u: number, a: number, b: number, c: number, d: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
    const der = (u: number, a: number, b: number, c: number, d: number) => 3 * (1 - u) ** 2 * (b - a) + 6 * (1 - u) * u * (c - b) + 3 * u * u * (d - c);
    const pitch = (u: number) => face * clamp((Math.atan2(der(u, E.y, C1.y, C2.y, F.y), der(u, E.x, C1.x, C2.x, F.x) * face) * 180) / Math.PI, -40, 32);
    const T = (x: number, y: number, r: number) => `translate(${(x - R.x).toFixed(1)}px, ${(y - R.y).toFixed(1)}px) rotate(${r.toFixed(1)}deg)`;
    const kf: Keyframe[] = [];
    const N = 48;
    for (let i = 0; i <= N; i++) { const t = i / N; const u = ease(t); kf.push({ transform: T(bez(u, E.x, C1.x, C2.x, F.x), bez(u, E.y, C1.y, C2.y, F.y), pitch(u)), offset: o * t }); }
    // the flare: the upright pose, leaning into the swoop (LEAN forward) and swinging up to upright as it slows onto the perch
    // (dropping almost straight down onto a perch it is nearly upright already: it only leans a little)
    const up = (Math.atan2(-onto[1], onto[0]) * 180) / Math.PI;          // its flight's angle at the swap, up from level
    const LEAN = up < -45 ? 15 : clamp(45 - Math.max(up, -32), 25, 70);   // (the flying drawing pitches down 32 at most)
    // it swings about its toes, which run straight onto the perch (about its middle, the tail and legs swept sideways:
    // beside the seal's head, across its cheek)
    const gy = (FALCON.grip[1] / FALCON.box[1] - 0.5) * (W * FALCON.box[1]) / FALCON.box[0];
    const T2 = (x: number, y: number, r: number) => `translate(${(x - R.x).toFixed(1)}px, ${(y - R.y).toFixed(1)}px) translate(0px, ${gy.toFixed(1)}px) rotate(${r.toFixed(1)}deg) translate(0px, ${(-gy).toFixed(1)}px)`;
    for (let i = 0; i <= 10; i++) {
      const sT = i / 10; const e = 1 - (1 - sT) * (1 - sT);
      kf.push({ transform: T2(F.x + (P.x - F.x) * e, F.y + (P.y - F.y) * e, face * LEAN * (1 - e)), offset: o + (1 - o) * sT });
    }
    kf[N + 1] = { ...kf[N + 1]!, offset: o };   // (the flare's first keyframe on the same instant as the flight's last: the swap)
    bird.el.style.transform = kf[kf.length - 1]!.transform as string;
    const anims: Animation[] = [bird.el.animate(kf, { duration: D, easing: 'linear' })];
    const done = anims[0]!.finished.then(() => {}, () => {});
    // the flying pose until the flare, the upright one after: visibility keyframes, one clock
    const flyOn: Keyframe[] = [{ visibility: 'visible', offset: 0 }, { visibility: 'visible', offset: o }, { visibility: 'hidden', offset: o }, { visibility: 'hidden', offset: 1 }];
    const sitOn: Keyframe[] = [{ visibility: 'hidden', offset: 0 }, { visibility: 'hidden', offset: o }, { visibility: 'visible', offset: o }, { visibility: 'visible', offset: 1 }];
    const A = (sel: string, k2: Keyframe[]) => { const e = root.querySelector(sel); if (e) anims.push(e.animate(k2, { duration: D, fill: 'forwards' })); };
    A('.fc-fly', flyOn);
    for (const sel of ['.fc-sw-up', '.fc-sfw-up', '.fc-legs-reach', '.fc-tail-fan', '.fc-body-sleek']) A(sel, sitOn);
    // the wings beat all the way in: up, glide, down, glide, PERIOD a beat, and every frame hidden from the flare on
    const PERIOD = 180;
    const plan: [string, number, number][] = [['up', 0, 0.25], ['glide', 0.25, 0.5], ['down', 0.5, 0.75], ['glide', 0.75, 1]];
    for (const w of ['up', 'glide', 'down']) {
      const k2: Keyframe[] = [{ visibility: 'hidden', offset: 0 }];
      for (let c = 0; c * PERIOD < DA; c++) for (const [name, a, b] of plan) {
        if (name !== w) continue;
        const t0 = (c + a) * PERIOD; const t1 = Math.min(DA, (c + b) * PERIOD);
        if (t0 >= DA) continue;
        k2.push({ visibility: 'hidden', offset: t0 / D }, { visibility: 'visible', offset: t0 / D }, { visibility: 'visible', offset: t1 / D }, { visibility: 'hidden', offset: t1 / D });
      }
      k2.push({ visibility: 'hidden', offset: 1 });
      A(`.fc-nw-${w}`, k2); A(`.fc-fw-${w}`, k2);
    }
    // the head: on the flying body, then on the upright one from the flare (a CSS transform over its attribute)
    const heads = JSON.parse((root.getAttribute('data-heads') ?? '{}').replace(/'/g, '"')) as Record<string, string>;
    const css = (t = '') => t.replace(/translate\(([-\d.]+) ([-\d.]+)\)/, 'translate($1px, $2px)').replace(/rotate\(([-\d.]+)\)/, 'rotate($1deg)').replace(/scale\(([-\d.]+) ([-\d.]+)\)/, 'scale($1, $2)');
    A('.fc-head', [{ transform: css(heads.fly), offset: 0 }, { transform: css(heads.fly), offset: o }, { transform: css(heads.sit), offset: o }, { transform: css(heads.sit), offset: 1 }]);
    bird.el.dataset.arriving = '1';   // (the headless checks film from here)
    return { anims, done };
  }
  /** Where the prop's grip is in the room now (its placement anchor R plus its transform's translation). */
  private falconPropAt(bird: Prop, R: { x: number; y: number }) {
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(bird.el.style.transform);
    return m ? { x: R.x + Number(m[1]), y: R.y + Number(m[2]) } : { ...R };
  }
  /**
   * The falcon leaves: from the perch at `p` (the grip), facing `face`. Everything runs on ONE clock (Web Animations
   * started in the same task share their start time), so no frame can fall out of step with another:
   *   - the push (PUSH ms): the upright pose, wings up, legs straight down, a hop up and a little forward;
   *   - then, at the same instant, the flying pose shows, the head moves onto it and the body pitches nose up along the
   *     path (the level drawing turned by the path's own angle, about the bird's middle: at the switch it is nearly
   *     upright, as the pose before it was);
   *   - two fast, strong beats, then steady ones, while it climbs a curve (a cubic Bezier: steeply up and a little
   *     forward first, then out and away), speeding up, levelling out as it goes, right out past the room's edge.
   * The frames switch by visibility keyframes (never opacity), the head by a CSS transform in place of its attribute.
   */
  private falconDepart(bird: Prop, root: Element, R: { x: number; y: number }, p: { x: number; y: number }, face: Dir, W: number) {
    const PUSH = 110;
    const k = W / FALCON.box[0];
    // it flies out through the side wall at a height where all of it, the raised wing tips too (108 of its units over its
    // toes in the flying pose), is under the ceiling's cornice (~16): it climbs to that height, or from a perch already up
    // there (Sahur's cap) pushes off forward rather than up and drops a little into its flight
    const cruise = 16 + 110 * k;
    const B0 = { x: p.x + face * 7, y: p.y - clamp(p.y - cruise, 0, 16) };
    const yc = Math.max(cruise, B0.y - 95);
    const E = { x: face > 0 ? WORLD.w + W * 0.75 : -W * 0.75, y: yc + 6 };   // the whole bird past the edge (its box is W wide, the grip in the middle)
    const B1 = { x: B0.x + face * 36, y: Math.min(B0.y, yc - 14) };           // steeply up (or straight on, from up high)
    const B2 = { x: E.x - face * Math.min(240, 0.6 * Math.abs(E.x - B0.x)), y: yc };   // (between the climb and the exit even on a short run: behind the start, the path hung by the wall)
    const DB = Math.round(clamp(1000 + Math.abs(E.x - B0.x) * 0.6, 1150, 1700));
    const D = PUSH + DB; const o = PUSH / D;
    const bez = (u: number, a: number, b: number, c: number, d: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
    const der = (u: number, a: number, b: number, c: number, d: number) => 3 * (1 - u) ** 2 * (b - a) + 6 * (1 - u) * u * (c - b) + 3 * u * u * (d - c);
    const pitch = (u: number) => {
      const tx = der(u, B0.x, B1.x, B2.x, E.x); const ty = der(u, B0.y, B1.y, B2.y, E.y);
      return face * clamp((Math.atan2(ty, tx * face) * 180) / Math.PI, -45, 12);   // (steeper, the level drawing stood on its tail)
    };
    const T = (x: number, y: number, r: number) => `translate(${(x - R.x).toFixed(1)}px, ${(y - R.y).toFixed(1)}px) rotate(${r.toFixed(1)}deg)`;
    const kf: Keyframe[] = [{ transform: T(p.x, p.y, 0), offset: 0, easing: 'ease-out' }, { transform: T(B0.x, B0.y, 0), offset: o }, { transform: T(B0.x, B0.y, pitch(0)), offset: o }];
    const N = 44;
    for (let i = 1; i <= N; i++) {
      const t = i / N; const u = 0.45 * t + 0.55 * t * t;   // it gathers speed as it climbs
      kf.push({ transform: T(bez(u, B0.x, B1.x, B2.x, E.x), bez(u, B0.y, B1.y, B2.y, E.y), pitch(u)), offset: o + (1 - o) * t });
    }
    bird.el.dataset.leaving = '1';   // (the headless checks film from here)
    bird.el.style.transform = kf[kf.length - 1]!.transform as string;
    const fly = bird.el.animate(kf, { duration: D, easing: 'linear' });
    // the switch to the flying pose at PUSH, on the same clock: the upright pose's parts out, the flying pose in
    const out: Keyframe[] = [{ visibility: 'visible', offset: 0 }, { visibility: 'visible', offset: o }, { visibility: 'hidden', offset: o }, { visibility: 'hidden', offset: 1 }];
    const inn: Keyframe[] = [{ visibility: 'hidden', offset: 0 }, { visibility: 'hidden', offset: o }, { visibility: 'visible', offset: o }, { visibility: 'visible', offset: 1 }];
    for (const sel of ['.fc-sw-up', '.fc-sfw-up', '.fc-legs-push', '.fc-tail-fan', '.fc-body-sleek']) root.querySelector(sel)?.animate(out, { duration: D, fill: 'forwards' });
    root.querySelector('.fc-fly')?.animate(inn, { duration: D, fill: 'forwards' });
    const heads = JSON.parse((root.getAttribute('data-heads') ?? '{}').replace(/'/g, '"')) as Record<string, string>;
    const css = (t = '') => t.replace(/translate\(([-\d.]+) ([-\d.]+)\)/, 'translate($1px, $2px)').replace(/rotate\(([-\d.]+)\)/, 'rotate($1deg)').replace(/scale\(([-\d.]+) ([-\d.]+)\)/, 'scale($1, $2)');
    root.querySelector('.fc-head')?.animate([{ transform: css(heads.sit), offset: 0 }, { transform: css(heads.sit), offset: o }, { transform: css(heads.fly), offset: o }, { transform: css(heads.fly), offset: 1 }], { duration: D, fill: 'forwards' });
    // two quick hard beats off the perch, then steady ones all the way out (up, glide, down, glide: it starts wings up, as it left the perch)
    void falconBeat(root, 'fly', 220, 110, PUSH);
    void falconBeat(root, 'fly', DB - 220 + 400, 165, PUSH + 220);
    return fly.finished.then(() => {}, () => {});
  }
  /** Room over the pet's head for a falcon to sit there, wings and all (the flare's wing tips reach 84 room units over its toes at FALCON_W 100). */
  private falconHeadroom() {
    const top = this.falconSpot('head');
    const W = this.own?.tune?.falcon?.w ?? FALCON_W[(this.rig.character in FALCON_W ? this.rig.character : 'cat') as keyof typeof FALCON_W];
    return !!top && top.room.y - ((FALCON.grip[1] - 2) * W) / FALCON.box[0] >= 0;   // (the wing tips inside the room: on his keffiyeh they are, on the pumpkin they are not)
  }
  /** The perch for the falcon right now (see FALCON_PROBE): the group it will ride in, the point in that group's own units, and where that is in the room. */
  private falconSpot(where: 'arm' | 'head'): FalconSpot | null {
    const ch = (this.rig.character in FALCON_PROBE ? this.rig.character : 'cat') as keyof typeof FALCON_PROBE;
    const T = this.own?.tune?.falcon;
    if (where === 'arm' && T?.perch) {
      // a perch named outright: that point of that group, wherever the pose has it now
      const g = this.L.cat.querySelector(`#${T.perch.host}`); const w0 = this.L.cat.parentElement?.getBoundingClientRect();
      if (g instanceof SVGGElement && w0) {
        const F = screenFrame(g);
        if (F.det) { const sp = F.toScreen(T.perch.at[0], T.perch.at[1]); const kx0 = w0.width / WORLD.w; return { host: g, x: T.perch.at[0], y: T.perch.at[1], room: { x: (sp.x - w0.left) / kx0, y: (sp.y - w0.top) / kx0 } }; }
      }
      return this.falconSpot('head');
    }
    const Pr = T?.at ? { arm: [] as string[], at: T.at, reach: T.reach ?? 150, head: undefined } : FALCON_PROBE[ch];
    const head = where === 'head' || !Pr.arm.length;
    const ids = head ? FALCON_HEADS : Pr.arm;
    const p = head ? (Pr.head ?? Pr) : Pr;
    const w = this.L.cat.parentElement?.getBoundingClientRect(); if (!w) return null;
    const kx = w.width / WORLD.w;
    let best: FalconSpot | null = null; let bestY = Infinity;
    for (const id of ids) {
      const g = this.L.cat.querySelector(`#${id}`);
      if (!(g instanceof SVGGElement) || !painted(g)) continue;
      const F = screenFrame(g);
      if (!F.det) continue;
      const hit = firstHit(g, { x: p.at[0], y: p.at[1] }, F.dirIn(0, -1), p.reach);
      if (!hit) continue;
      const sp = F.toScreen(hit.x, hit.y);
      if (sp.y < bestY - 0.5) { bestY = sp.y; best = { host: g, x: hit.x, y: hit.y, room: { x: (sp.x - w.left) / kx, y: (sp.y - w.top) / kx } }; }
    }
    // an arm that cannot be found (a drawing that changed under it): the head, which every pet has
    if (!best && !head) return this.falconSpot('head');
    return best;
  }
  /**
   * Put a copy of the falcon's drawing into the pet's own svg, in the group of `spot`, its grip on the spot, upright on the
   * screen, facing `face`, at its size in the room: its units map to the group's by the inverse of the group's own screen
   * frame (screenFrame), so the copy lands pixel for pixel where the prop was. The outer group carries its own motions (a
   * shake, a turn back, a crouch) about the grip.
   */
  private falconMount(spot: FalconSpot, face: Dir, W: number, fr: FalconFrame): FalconMount | null {
    const bird = falconBird();
    const w = this.L.cat.parentElement?.getBoundingClientRect();
    if (!bird || !w) return null;
    const F = screenFrame(spot.host);
    if (!F.det) return null;
    const k = (W / FALCON.box[0]) * (w.width / WORLD.w);   // screen px per falcon unit
    const A = (F.d * k * face) / F.det; const B = (-F.b * k * face) / F.det; const C = (-F.c * k) / F.det; const D = (F.a * k) / F.det;
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'fc-mount');
    g.style.transformBox = 'view-box'; g.style.transformOrigin = `${spot.x.toFixed(3)}px ${spot.y.toFixed(3)}px`;
    g.style.willChange = 'transform';   // its layer from the start, not made when the shake starts (see the dreidel's note)
    const place = document.createElementNS(SVG_NS, 'g');
    place.setAttribute('class', 'fc-place');
    place.setAttribute('transform', `translate(${spot.x.toFixed(3)} ${spot.y.toFixed(3)}) matrix(${A.toFixed(6)} ${B.toFixed(6)} ${C.toFixed(6)} ${D.toFixed(6)} 0 0) translate(${-FALCON.grip[0]} ${-FALCON.grip[1]})`);
    place.appendChild(bird); g.appendChild(place); spot.host.appendChild(g);
    falconFrame(bird, fr);
    const u = F.dirIn(0, -(w.width / WORLD.w));   // one room unit up the screen, in the group's own units
    return { root: bird, g, spot, up: u, sign: Math.sign(F.det) };
  }
  /** Where a perched falcon's grip is in the room right now (a tiny mark at its toes, read and taken away). */
  private falconGripRoom(m: FalconMount) {
    const place = m.g.querySelector('.fc-place'); const w = this.L.cat.parentElement?.getBoundingClientRect();
    if (!place || !w) return m.spot.room;
    const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('cx', String(FALCON.grip[0])); c.setAttribute('cy', String(FALCON.grip[1])); c.setAttribute('r', '0.05');
    place.appendChild(c); const r = c.getBoundingClientRect(); c.remove();
    const kx = w.width / WORLD.w;
    return { x: (r.left + r.width / 2 - w.left) / kx, y: (r.top + r.height / 2 - w.top) / kx };
  }
  /** A loose feather, shed when it rouses: it seesaws down and fades. */
  private falconFeather(x: number, y: number) {
    if (this.destroyed) return;
    const f = new Prop(this.L.front, 'falconfeather', rand(13, 16)).place(x + rand(-8, 8), y);
    const drift = rand(-30, 30); const fall = rand(90, 140);
    f.anim([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1, offset: 0 }, { transform: `translate(${drift * 0.4}px, ${fall * 0.3}px) rotate(${rand(40, 80)}deg)`, opacity: 1, offset: 0.35, easing: 'ease-in-out' },
      { transform: `translate(${-drift * 0.3}px, ${fall * 0.65}px) rotate(${rand(-30, 10)}deg)`, opacity: 1, offset: 0.7, easing: 'ease-in-out' },
      { transform: `translate(${drift}px, ${fall}px) rotate(${rand(30, 70)}deg)`, opacity: 0, offset: 1 },
    ], { duration: rand(1700, 2100), easing: 'ease-out' }).finished.then(() => f.el.remove(), () => f.el.remove());
  }

  // ================= the frog's own actions =================
  /** The whole room jolts. */
  private jolt(px = 5, ms = 260) {
    const world = this.L.cat.parentElement; if (!world) return;
    world.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${px}px,${-px * 0.6}px)`, offset: 0.2 }, { transform: `translate(${-px * 0.8}px,${px * 0.4}px)`, offset: 0.45 }, { transform: `translate(${px * 0.4}px,0)`, offset: 0.7 }, { transform: 'translate(0,0)' }], { duration: ms, composite: 'add', easing: 'ease-out' });
  }
  /** A white flash over the whole room. */
  private flash(ms = 460) {
    const f = document.createElement('div');
    f.className = 'room-flash';   // Emotown restyles it (a flash of light round the pet, not a white box on the street)
    f.style.cssText = 'position:absolute;inset:-40px;background:#fff;pointer-events:none;opacity:0';
    this.L.front.appendChild(f);
    f.animate([{ opacity: 0 }, { opacity: 0.96, offset: 0.12, easing: 'ease-out' }, { opacity: 0.5, offset: 0.4 }, { opacity: 0 }], { duration: ms, easing: 'ease-in' }).finished.then(() => f.remove(), () => f.remove());
  }
  /** Where a point of the drawing sits in the room, given which way the frog faces. */
  private at(sx: number, sy: number, dir: Dir) { return { x: this.st.x + dir * (sx - 100) * this.S, y: this.B.top + sy * this.S }; }

  /** Where a part of the drawing is right now, in room coordinates (centre of its box). */
  private roomPos(id: string) {
    const r = this.rig.screenBox(id); const w = this.L.cat.parentElement?.getBoundingClientRect();
    if (!r || !w) return { x: this.st.x, y: this.B.top + 120 };
    const k = w.width / WORLD.w;
    return { x: (r.left + r.width / 2 - w.left) / k, y: (r.top + r.height / 2 - w.top) / k };
  }

  /**
   * A camera drops out of the sky; he looks up, gets both sleeves out low in front of him and catches it there,
   * dipping under the weight. From then on the camera is the one drawn at his sleeve's end (frog.py), so it is
   * truly in his hands: he looks at it, raises it level to his chin, lines the shot up, the bulb goes off and the
   * room flashes; pleased with himself, he winds the arm back over his shoulder and flings it; at the top of the
   * swing it leaves the sleeve as a prop again and spins off out of the room.
   */
  screenshot() {
    return this.run('screenshot', async () => {
      const dir = this.rig.facingDir;
      const hands = this.at(CAMERA_CATCH.x, CAMERA_CATCH.y, dir);        // where the drawn camera sits in the catch pose (measured: CAMERA_CATCH)
      const CW = 62; const ch = CW * 70 / 100;                          // the falling camera is the drawn one's size (0.6 of its 100x70 picture)
      const cam = new Prop(this.L.front, 'camera', CW).place(hands.x, hands.y + ch / 2);
      if (dir < 0) cam.inner.style.transform = 'scaleX(-1)';
      cam.el.style.transformOrigin = '50% 60%';
      // it falls from above the room, tumbling; he hears it, looks up, gets his sleeves out under it
      const DROP = 380; const fall = 860;
      this.sfx('whoosh', { dur: 0.8, v: 0.5, rate: 0.8 });
      const drop = cam.anim([{ transform: `translateY(${-DROP - ch}px) rotate(${dir * -250}deg)`, easing: 'cubic-bezier(.35,0,.9,.6)' }, { transform: 'translateY(0) rotate(0)' }], { duration: fall, fill: 'forwards' });
      await wait(120);
      this.rig.look(0.1, -0.9);
      await this.rig.perk();
      this.rig.release('look', 120);
      this.rig.catchPose();
      await drop.finished.catch(() => {});
      // caught: the moment it lands the drawn camera takes over, at the very spot, and he dips under the weight
      // (the sleeves give and spring back, which is the bounce), then looks down at it
      this.rig.setCamera(true);
      cam.el.remove();
      this.sfx('catch'); this.voice('effort', { v: 0.8 });
      await this.rig.caught();
      await wait(480);
      // up it comes, level, to his chin; a beat to line the shot up
      this.rig.face('open', 'smile', 200);
      this.rig.raiseCamera();
      await wait(600);
      await this.rig.aim();
      await wait(260);
      // click: the bulb goes off, the whole room flashes, he squints
      this.rig.flashBulb();
      void this.rig.click();
      this.sfx('shutter'); this.sfx('flash', { delay: 0.06 });
      setTimeout(() => this.flash(), 60);
      const bulb = this.roomPos('cambulb');
      this.sparkles(7, bulb.x, bulb.y - 6, 36);
      void this.rig.wince(480);
      await wait(900);
      // pleased with it; then the arm winds back over the shoulder and flings it: at the release it leaves the sleeve
      this.rig.face('open', 'smug', 200);
      await wait(500);
      await this.rig.throwAway(() => {
        const at = this.roomPos('camera');
        this.rig.setCamera(false);
        this.sfx('whoosh', { dur: 0.45 });
        const fly = new Prop(this.L.front, 'camera', CW).place(at.x, at.y + ch / 2);
        if (dir < 0) fly.inner.style.transform = 'scaleX(-1)';
        fly.el.style.transformOrigin = '50% 50%';
        fly.anim([
          { transform: 'translate(0,0) rotate(0)', easing: 'cubic-bezier(.2,.5,.5,1)' },
          { transform: `translate(${dir * 210}px, -170px) rotate(${dir * 300}deg)`, offset: 0.42, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: `translate(${dir * 580}px, 90px) rotate(${dir * 760}deg)` },
        ], { duration: 900, fill: 'forwards' }).finished.then(() => fly.el.remove(), () => fly.el.remove());
      });
      await wait(300);
      this.rig.face('happy', 'smile', 200);
      this.voice('happy');
      await this.rig.hop();
      this.hearts(2);
      await wait(600);
      this.rig.restFace();
    });
  }

  /** Stars circling above the head for a while. */
  private starsAround(cx: number, cy: number, ms: number) {
    const n = 3; const props: Prop[] = [];
    for (let i = 0; i < n; i++) {
      const sp = new Prop(this.L.front, 'sparkle', 22).place(cx, cy + 11);
      sp.el.style.opacity = '0';
      const ph = (i / n) * Math.PI * 2; const R = 34;
      const kf: Keyframe[] = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12; const a_ = ph + t * Math.PI * 2; kf.push({ transform: `translate(${Math.cos(a_) * R}px, ${Math.sin(a_) * R * 0.32}px) rotate(${t * 360}deg) scale(${0.85 + 0.3 * Math.sin(a_)})`, offset: t }); }
      sp.el.animate(kf, { duration: 900, iterations: Infinity, easing: 'linear', composite: 'add' });
      sp.el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).finished.then(() => sp.el.remove(), () => sp.el.remove());
      props.push(sp);
    }
  }

  /**
   * An open gloved hand slides in from the side he faces and hovers in front of him; he sees it coming. It cocks
   * back at the wrist, quivering, then whips across his cheek: the room jolts, a burst on the cheek, his head whips
   * away and he staggers, a hand-print left behind. The hand follows through past his face, then draws back out of
   * the room. He stands seeing stars, then shakes it off.
   */
  slap() {
    return this.run('slap', async () => {
      await loadStuntProps();
      const dir = this.rig.facingDir;
      const cheek = this.at(116, 64, dir);
      // The hand is upright at the left end of a 1400x260 picture, the sleeve running off to the right; the palm's
      // centre is at (100,168) and the wrist, which every tilt turns on, at (168,200). Shown at this width the hand
      // is about the size of his head and the sleeve (1230 world units) reaches the edge of the room from anywhere
      // he can stand, at every point of the swing.
      const PW = 735; const k = PW / 1400; const PH = 260 * k;
      const palm = { x: 100 * k, y: 168 * k }; const wrist = { x: 168 * k, y: 200 * k };
      const HOVER = 150;                                                          // the palm's centre this far in front of his cheek
      const hand = new Prop(this.L.front, 'slaphand', PW).place(cheek.x + dir * (HOVER + PW / 2 - palm.x), cheek.y - palm.y + PH);
      hand.el.style.transformOrigin = `${dir > 0 ? wrist.x : PW - wrist.x}px ${wrist.y}px`;
      if (dir < 0) hand.inner.style.transform = 'scaleX(-1)';
      // The hand is driven in absolute poses (translate of the wrist, then a tilt about it), replacing rather than
      // adding: a translate added after a persisted rotate would slide along the tilted axis, not across the room.
      const TILT = -10;                                                           // the hand leans a little towards him throughout, fingers angled down
      const P = (tx: number, ty: number, rot: number) => ({ transform: `translate(${dir * tx}px, ${ty}px) rotate(${dir * (rot + TILT)}deg)` });
      const move = (kf: Keyframe[], ms: number) => hand.anim(kf, { duration: ms, fill: 'forwards', composite: 'replace' });
      // in from the side, overshooting a touch and settling
      move([{ ...P(560, 0, 0), easing: 'cubic-bezier(.2,.8,.3,1)' }, { ...P(-10, 0, 0), offset: 0.74, easing: 'ease-in-out' }, P(0, 0, 0)], 640);
      this.sfx('whoosh', { dur: 0.55, rate: 0.6, v: 0.7 });
      await wait(240);
      this.voice('huh');
      this.rig.look(dir * 0.9, 0.1);
      await this.rig.perk();
      this.rig.sheepish();
      void this.rig.sweat();
      await wait(360);
      // the wind-up: it draws back and cocks at the wrist, fingers tilting away from him, then quivers with the effort
      const COCK = 80;
      move([{ ...P(0, 0, 0), easing: 'cubic-bezier(.3,0,.2,1)' }, P(COCK, 0, 18)], 440);
      this.sfx('strain', { rate: 0.8, delay: 0.3 });
      await wait(440);
      hand.anim([{ transform: 'none' }, { transform: `rotate(${dir * 3}deg) translateY(-2px)` }, { transform: 'none' }], { duration: 70, iterations: 4 });
      await wait(280);
      this.rig.release('sheep', 80); this.rig.release('look', 80);
      // the swing: across through the cheek in a blink, speed lines behind it; it lands with the fingers leaning
      // into the swing and the palm on the cheek
      const lines = new Prop(this.L.front, 'whoosh', 120).place(this.st.x + dir * 150, cheek.y + 34);
      if (dir < 0) lines.inner.style.transform = 'scaleX(-1)';
      lines.el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 260 }).finished.then(() => lines.el.remove(), () => lines.el.remove());
      lines.anim([{ transform: 'translateX(0) scaleX(0.6)' }, { transform: `translateX(${-dir * 90}px) scaleX(1.3)` }], { duration: 260, easing: 'ease-out' });
      const LAND = -(HOVER - 8);                                                  // the palm's centre lands just past the cheek
      move([{ ...P(COCK, 0, 18), easing: 'cubic-bezier(.6,0,1,.4)' }, P(LAND, 0, -8)], 95);
      this.sfx('slap.wind', { dur: 0.16 });
      await wait(95);
      this.sfx('slap.hit'); this.voice('ouch', { delay: 0.06 });
      // impact: the palm holds on the cheek a beat while everything else shakes
      this.jolt(7, 320);
      const powp = new Prop(this.L.front, 'pow', 112).place(cheek.x + dir * 18, cheek.y + 62);
      powp.anim([{ transform: 'scale(0.2) rotate(-25deg)', opacity: 0 }, { transform: 'scale(1.3) rotate(6deg)', opacity: 1, offset: 0.25, easing: 'ease-out' }, { transform: 'scale(1.05) rotate(10deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(0.5) rotate(18deg)', opacity: 0 }], { duration: 560, easing: 'ease-in' }).finished.then(() => powp.el.remove(), () => powp.el.remove());
      const reel = this.rig.hit(dir);
      this.droplets(4, cheek.x - dir * 20, cheek.y - 10, 0.9);
      await wait(70);
      // follow-through: on past his face and up, clear of his head so the whip shows, a beat, then the arm draws
      // back out of the room
      move([{ ...P(LAND, 0, -8), easing: 'ease-out' }, P(LAND - 70, -78, -16)], 170);
      await wait(260);
      move([{ ...P(LAND - 70, -78, -16), easing: 'cubic-bezier(.5,0,.8,.4)' }, { ...P(LAND + 40, -80, -6), offset: 0.3, easing: 'ease-in' }, P(760, -60, 10)], 520).finished.then(() => hand.el.remove(), () => hand.el.remove());
      await reel;
      // seeing stars
      this.rig.dazed();
      this.sfx('stars');
      this.starsAround(cheek.x - dir * 14, cheek.y - 78, 1500);
      await wait(1500);
      this.rig.release('dazed', 300);
      await this.rig.shake();
      this.rig.clearMark(800);
      this.rig.face('open', 'frown', 200);
      this.voice('sad');
      await wait(700);
      this.rig.restFace();
    });
  }

  /**
   * A robot claw comes in from the side he faces, level with his waist, its two jaws open towards and away from
   * the viewer: one will go round the front of him, the other behind. It hovers, lunges so the jaws straddle him
   * and snaps them shut across his middle. The grip crushes him: the robe pinches to the jaws' width and bulges
   * above and below, his head balloons, eyes bulge, mouth gapes, arms fly out. It squeezes again and again, harder,
   * shaking him, then opens and draws back out of the room in one movement; he springs back.
   */
  squeeze() {
    return this.run('squeeze', async () => {
      await loadStuntProps();
      const dir = this.rig.facingDir;
      // The claw pictures are 400x260 with the hub at (300,130); the jaws reach out to x = 62. Shown 250 wide.
      const W = 250; const H = W * 260 / 400; const k = W / 400;
      const WA = 1300 * k;                                              // the arm's picture is 1300 wide: its pole reaches the wall from anywhere
      const REACH = (300 - 62) * k;                                     // hub to the tip of a shut jaw
      const midY = this.B.top + 138 * this.S;                                   // the waist: frog.py pinches the robe there
      // The grip: the jaws' tips just past his far side (his waist runs svg x 68..126, so 33 units behind his axis).
      const hub = { x: this.st.x + dir * (REACH - 42), y: midY };
      const cx = hub.x - dir * (300 - 200) * k; const bottom = hub.y - 130 * k + H;
      const jawB = new Prop(this.L.back, 'clawjaw', W).place(cx, bottom);
      const arm = new Prop(this.L.front, 'clawarm', WA).place(hub.x + dir * 350 * k, bottom);   // its hub at (300,130) of 1300x260
      const jawF = new Prop(this.L.front, 'clawjaw', W).place(cx, bottom);
      // Facing left, the picture itself is mirrored (on the svg, about its middle) and every turn below is about
      // the hub where it then sits; the jaws' angles flip with `dir` so the near jaw still hangs low.
      const ox = (dir > 0 ? 300 : 100) * k; const oy = 130 * k;
      for (const p of [jawB, arm, jawF]) {
        p.inner.style.transformOrigin = `${ox}px ${oy}px`;
        const pic = p.inner.firstElementChild as HTMLElement | null;
        if (pic && dir < 0) pic.style.transform = 'scaleX(-1)';
      }
      jawB.inner.style.filter = 'brightness(0.8)';                     // the far jaw is in the room's shade
      // Open, the jaws splay in depth. Seen from the room that is a little up and down: the near jaw hangs a touch
      // low and looks a touch bigger, the far one sits high and smaller. Shut, they lie together across his waist,
      // the near one over his robe and a shade lower, the far one behind him with its top edge just showing.
      const OPEN = 17;
      const pose = (rot: number, sc: number, dy = 0) => `translateY(${dy}px) rotate(${-dir * rot}deg) scale(${sc})`;   // rot > 0 swings the tip down
      const open = { F: pose(OPEN, 1.06), B: pose(-OPEN, 0.94) };
      const shut = { F: pose(0, 1, 4), B: pose(0, 1, -1) };
      const jaws = (from: { F: string; B: string }, to: { F: string; B: string }, ms: number, easing = 'ease-in-out') => {
        jawF.inner.animate([{ transform: from.F }, { transform: to.F }], { duration: ms, fill: 'forwards', easing });
        jawB.inner.animate([{ transform: from.B }, { transform: to.B }], { duration: ms, fill: 'forwards', easing });
      };
      jaws(open, open, 1);
      // in from the side and hovering just short of him, overshooting a little and settling, jaws wide
      const HOVER = 122;                                                 // the tips a hand's width in front of him
      const slide = (p: Prop) => p.anim([{ transform: `translateX(${dir * 560}px)`, easing: 'cubic-bezier(.2,.8,.2,1)' }, { transform: `translateX(${dir * (HOVER - 8)}px)`, offset: 0.72, easing: 'ease-in-out' }, { transform: `translateX(${dir * HOVER}px)` }], { duration: 760, fill: 'forwards' });
      slide(jawB); slide(arm); slide(jawF);
      this.sfx('servo', { dur: 0.6 });
      await wait(200);
      this.voice('huh');
      this.rig.look(dir * 0.9, 0.2);
      await this.rig.perk();
      this.rig.sheepish();
      void this.rig.sweat();
      await wait(520);
      // the grab: a lunge so the jaws straddle him, snapping shut as it lands
      const lunge = (p: Prop) => p.anim([{ transform: 'none', easing: 'cubic-bezier(.6,0,.9,.4)' }, { transform: `translateX(${-dir * HOVER}px)` }], { duration: 160, fill: 'forwards' });
      lunge(jawB); lunge(arm); lunge(jawF);
      await wait(70);
      jaws(open, shut, 100, 'cubic-bezier(.7,0,1,.4)');
      await wait(100);
      this.sfx('clank'); this.sfx('squeeze'); this.voice('ouch', { delay: 0.05 });
      this.rig.release('sheep', 60); this.rig.release('look', 60);
      this.rig.squeezed();
      this.jolt(5, 260);
      const head = this.at(110, 30, dir);
      this.droplets(4, head.x, head.y, 0.9);
      await wait(520);
      // three more, each harder: the jaws bite in, the claw shakes him
      for (let i = 0; i < 3; i++) {
        const kk = 1 + i * 0.35;
        const bite = { F: pose(-2.5 * kk, 0.985, 3), B: pose(2.5 * kk, 0.985, -1) };   // in: the near tip up, the far tip down
        jawF.inner.animate([{ transform: shut.F, easing: 'ease-in-out' }, { transform: bite.F, offset: 0.4, easing: 'ease-in-out' }, { transform: shut.F }], { duration: 380 });
        jawB.inner.animate([{ transform: shut.B, easing: 'ease-in-out' }, { transform: bite.B, offset: 0.4, easing: 'ease-in-out' }, { transform: shut.B }], { duration: 380 });
        const shake = (p: Prop) => p.anim([{ transform: 'none', easing: 'ease-in-out' }, { transform: `translate(${-dir * 8 * kk}px, ${3 * kk}px)`, offset: 0.4, easing: 'ease-in-out' }, { transform: `translate(${dir * 4}px, -2px)`, offset: 0.7 }, { transform: 'none' }], { duration: 380 });
        shake(jawB); shake(arm); shake(jawF);
        this.droplets(3 + i, head.x + rand(-10, 10), head.y, 0.9 + i * 0.2);
        this.jolt(2 + i, 260);
        this.sfx('servo', { dur: 0.22, rate: 1.25 + i * 0.15 }); this.sfx('squeeze', { rate: 1 + i * 0.14 }); this.voice('effort', { rate: 1.5 + i * 0.2, delay: 0.08 });
        await this.rig.crush();
        await wait(140);
      }
      // it lets go: the jaws open as the whole claw pulls back out, so they slide off him
      jaws(shut, open, 220, 'ease-out');
      const away = (p: Prop) => p.anim([{ transform: 'translateX(0)', easing: 'cubic-bezier(.4,0,.9,.4)' }, { transform: `translateX(${dir * 620}px)` }], { duration: 620, fill: 'forwards' }).finished.then(() => p.el.remove(), () => p.el.remove());
      void away(jawB); void away(arm); void away(jawF);
      this.sfx('servo', { dur: 0.55, rate: 0.8 }); this.sfx('pop', { delay: 0.08 }); this.sfx('boing', { delay: 0.1, v: 0.7 });
      await wait(60);
      await this.rig.unsqueeze();
      await this.rig.rumble();
      await wait(500);
      this.rig.restFace();
    });
  }

  /**
   * A lit match falls and lands against his hem; he peers down at it; the robe catches at that spot and the fire
   * climbs him. Eyes wide, then arms up and screaming, wall to wall with smoke trailing. Back in the middle, water
   * pours down over him head to foot, steam, the fire dies; he stands in a puddle, soaked and shivering, drips,
   * shakes himself off.
   */
  burn() {
    return this.run('burn', async () => {
      await loadStuntProps();
      const dir = this.rig.facingDir;
      const hem = this.at(118, 196, dir);
      // the match drops in head first and comes to rest leaning on the robe
      const match = new Prop(this.L.front, 'match', 24).place(hem.x + dir * 30, WORLD.floor + 4);
      match.el.style.transformOrigin = '50% 92%';
      match.find('#mflame')?.animate([{ transform: 'scaleY(0.85)' }, { transform: 'scaleY(1.15)' }], { duration: 110, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      match.anim([
        { transform: `translateY(-360px) rotate(${dir * 120}deg)`, easing: 'cubic-bezier(.4,0,1,.6)' }, { transform: `translateY(0) rotate(${dir * 150}deg)`, offset: 0.66 },
        { transform: `translate(${-dir * 8}px, -16px) rotate(${dir * 200}deg)`, offset: 0.8, easing: 'ease-in' }, { transform: `translate(${-dir * 12}px, 0) rotate(${dir * 330}deg)` },
      ], { duration: 820, fill: 'forwards' });
      this.sfx('match', { delay: 0.45 });                            // a full turn and a bit: it lands head up, leaning on the robe, the flame against the cloth
      await wait(520);
      this.rig.look(dir * 0.5, 0.9);
      await this.rig.perk();
      this.rig.peer();
      await wait(520);
      // it catches at the hem, right where the match head touches, and climbs
      const HX = CAT_PAD.side + this.B.w / 2; const FY = CAT_PAD.top + this.B.footY;
      const fb = new Prop(this.L.cat, 'fireback', 150).place(HX + 6, FY - 30);
      this.L.cat.insertBefore(fb.el, this.L.cat.firstChild);
      fb.el.style.visibility = 'hidden';                               // it grows from nothing once the front catches; until then it must not show
      const ff = new Prop(this.L.cat, 'fire', 112).place(HX - 2, FY + 6);
      const flicker = (p: Prop) => {
        p.findAll('[id^="f"]').forEach((t, i) => t.animate([{ transform: 'scaleY(0.84) scaleX(1.04)' }, { transform: 'scaleY(1.14) scaleX(0.96)' }], { duration: 150 + i * 35, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -i * 60 }));
        p.el.animate([{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }], { duration: 230, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', composite: 'add' });
      };
      // the fire starts as a lick at the match head, on the robe, and climbs from there
      ff.el.style.transformOrigin = `${50 + dir * 32}% 78%`;
      ff.anim([{ transform: `translate(${dir * 10}px, 22px) scale(0.1, 0.08)`, opacity: 0, easing: 'ease-out' }, { transform: `translate(${dir * 10}px, 18px) scale(0.32, 0.26)`, opacity: 1, offset: 0.28, easing: 'ease-in' }, { transform: 'translate(0, 0) scale(1.06, 1.1)', opacity: 1, offset: 0.82, easing: 'ease-out' }, { transform: 'none' }], { duration: 1000, fill: 'forwards' });
      flicker(ff);
      const blaze = this.sfx('fire', { dur: 14 });
      match.find('#mflame')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.4, 2.8)', offset: 0.4 }, { transform: 'scale(0.4)' }], { duration: 500, fill: 'forwards', composite: 'add' });
      void match.remove(700);
      await wait(380);
      this.rig.release('peer', 200); this.rig.release('look', 200);
      // the alarm jolt and the panic pose start together: the jolt is a one-shot on top of the held scream
      const alarm = this.rig.alarm();
      this.voice('alarm');
      this.rig.panic();
      await alarm;
      fb.el.style.transformOrigin = '50% 100%';
      fb.el.style.visibility = '';
      fb.anim([{ transform: 'scale(0.2, 0.05)', opacity: 0, easing: 'ease-out' }, { transform: 'scale(1.05, 1.1)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: 600, fill: 'forwards' });
      flicker(fb);
      this.jolt(3, 200);
      void this.rig.sweat();
      let burning = true;
      const smoke = async () => { while (burning && !this.destroyed) { this.puff(this.st.x + rand(-30, 30), this.B.top + rand(-10, 30), rand(50, 80), true); await wait(230); } };
      void smoke();
      await wait(420);
      // wall to wall, screaming
      await this.walkTo(WALK_MIN + 6, 'run');
      this.voice('alarm');
      await this.walkTo(WALK_MAX - 6, 'run');
      this.voice('alarm', { v: 0.9 });
      await this.walkTo(WORLD.w / 2, 'run');
      // water: a gush from the ceiling that pours over the whole of him, splashing where it lands
      // the gush is drawn tall enough that its top is above the room: it pours in from beyond the ceiling
      const wtr = new Prop(this.L.front, 'water', 150).place(this.st.x, WORLD.floor + 6);
      wtr.el.style.clipPath = 'inset(0 0 100% 0)';
      this.sfx('gush');
      wtr.el.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 260, fill: 'forwards', easing: 'ease-in' });
      wtr.find('#stream')?.animate([{ transform: 'translateX(-2px) scaleX(0.97)' }, { transform: 'translateX(2px) scaleX(1.03)' }], { duration: 160, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      await wait(200);
      burning = false; blaze(300); this.sfx('sizzle');
      this.jolt(3, 240);
      this.droplets(8, this.st.x, WORLD.floor - 6, 1.3);
      for (const p of [fb, ff]) p.anim([{ transform: 'none', opacity: 1, easing: 'ease-in' }, { transform: 'scale(0.6, 0.15)', opacity: 0 }], { duration: 420, fill: 'forwards' }).finished.then(() => p.el.remove(), () => p.el.remove());
      for (let i = 0; i < 4; i++) setTimeout(() => this.puff(this.st.x + rand(-60, 60), this.B.top + rand(90, 200), rand(46, 66), i > 0), i * 110);
      this.rig.release('panic', 220);
      this.rig.shiver();
      this.sfx('chatter', { delay: 0.5 }); this.sfx('chatter', { delay: 1.5, v: 0.8 });
      const puddle = new Prop(this.L.back, 'puddle', 150).place(this.st.x, WORLD.floor + 8);
      puddle.el.style.transformOrigin = '50% 50%';
      puddle.anim([{ transform: 'scale(0.15)' }, { transform: 'scale(1)' }], { duration: 1200, fill: 'forwards', easing: 'ease-out' });
      const splashing = setInterval(() => { this.droplets(3, this.st.x + rand(-60, 60), WORLD.floor - 4, 0.9); }, 180);
      await wait(1500);
      clearInterval(splashing);
      wtr.el.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }], { duration: 340, fill: 'forwards', easing: 'ease-in' }).finished.then(() => wtr.el.remove(), () => wtr.el.remove());
      await wait(1100);
      this.rig.release('shiver', 300);
      this.sfx('shake');
      await this.rig.shake();
      this.rig.face('open', 'frown', 200);
      this.voice('sad');
      await wait(800);
      void puddle.remove(900);
      this.rig.restFace();
    });
  }

  // ================= Tung Tung Tung Sahur's own actions =================
  /** One strike of the bat on the floor: the room jolts, TUNG bursts over the spot, a ring runs out across the floor, dust lifts. */
  private strike(i: number) {
    const p = this.at(48, 206, 1);                                    // the bat's tip at rest, beside his left foot (sahur.py: `tip`)
    this.sfx('tung', { rate: [0.92, 1, 1.1][i] ?? 1, v: 0.8 + i * 0.15 });
    this.jolt(3 + i * 2, 240 + i * 40);
    const burst = new Prop(this.L.front, 'tung', 96 + i * 26).place(p.x - 22 - i * 4, p.y - 62 - i * 10);   // just past the bat's tip, clear of him
    burst.el.style.transformOrigin = '50% 62%';
    burst.anim([
      { transform: 'scale(0.2) rotate(-14deg)', opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.3,1.3)' }, { transform: 'scale(1.12) rotate(3deg)', opacity: 1, offset: 0.22, easing: 'ease-out' },
      { transform: 'scale(1) rotate(5deg)', opacity: 1, offset: 0.68, easing: 'ease-in' }, { transform: 'scale(0.86) rotate(8deg) translateY(-18px)', opacity: 0, offset: 1 },
    ], { duration: 640 + i * 90 }).finished.then(() => burst.el.remove(), () => burst.el.remove());
    const ring = new Prop(this.L.back, 'ring', 60).place(p.x + 4, p.y + 14);
    ring.el.style.transformOrigin = '50% 50%';
    ring.anim([{ transform: 'scale(0.3)', opacity: 0.95, easing: 'ease-out' }, { transform: `scale(${2.4 + i * 0.8})`, opacity: 0 }], { duration: 520 + i * 60 }).finished.then(() => ring.el.remove(), () => ring.el.remove());
    this.puff(p.x - 8, p.y + 6, 38 + i * 12, true); this.puff(p.x + 18, p.y + 4, 30 + i * 10, true);
    if (i === 2) { this.puff(p.x + 40, p.y + 2, 30, true); this.sparkles(3, p.x, p.y - 20, 40); }
  }
  /**
   * Tung tung tung: he sets himself, eyes the bat, then cracks it down on the floor beside him three times, each
   * knock wound up bigger than the last (a flick, a swing from the shoulder, an overhead), each one jolting the
   * whole room with a TUNG. Then a smug little hop: it is what he is for.
   */
  tung() {
    return this.run('tung', async () => {
      if (this.st.x < WALK_MIN + 80) await this.walkTo(WALK_MIN + 80);   // the bat lands to his left: room for it and for the burst
      this.rig.face('open', 'smug', 200);
      await this.rig.perk();
      this.rig.look(-0.7, 0.6);
      await wait(360);
      this.rig.release('look', 160);
      for (let i = 0; i < 3; i++) {
        await this.rig.knock(i, () => this.strike(i));
        await wait(i < 2 ? 120 : 360);
      }
      this.rig.face('happy', 'smug', 200);
      this.voice('happy');
      await this.rig.hop();
      this.hearts(2);
      await wait(700);
      this.rig.restFace();
    });
  }
  /** Nod off where it stands. */
  sleep() {
    return this.run('sleep', async () => {
      if (this.st.sleeping) return;
      this.rig.face('closed', 'idle', 300);
      this.sfx('sleep');
      await wait(200);
      this.set({ sleeping: true });
      this.snore(true);
      this.rig.setMood('sleep');
      await wait(400);
    });
  }
  /** Wake with a stretch and a yawn. */
  wake() {
    return this.run('wake', async () => {
      if (!this.st.sleeping) return;
      this.set({ sleeping: false });
      this.snore(false);
      this.sfx('wake');
      this.rig.setMood('idle');
      await wait(350);
      await this.rig.stretch();
      await wait(100);
    });
  }
  /** Stroke the cat from one side: it leans in, purrs, hearts. */
  pet(side: Dir, opts: { quick?: boolean } = {}) {
    if (this.isActing || this.st.dead) return Promise.resolve();
    if (this.petMove === 'kapparot' && !opts.quick) return this.run('pet', () => this.kapparot());
    if (this.petMove === 'falcon' && !opts.quick) return this.run('pet', () => this.falcon());
    if (this.petMove === 'selfie' && !opts.quick) return this.run('pet', () => this.selfie());
    return this.run('pet', async () => {
      this.rig.facing(side);
      this.rig.nuzzle(side);
      if (this.rig.character === 'cat') this.sfx('purr', { dur: 1.3 }); else this.voice('hello');
      this.hearts(2, { x: this.headPos().x + side * 30, y: this.headPos().y - 10 });
      await wait(1400);
      this.rig.release('nuzzle', 400);
      this.rig.restFace(300);
      await wait(300);
    });
  }
  /** Stomach growl (hungry). */
  rumble() {
    if (this.isBusy || this.st.sleeping || this.st.dead) return Promise.resolve();
    return this.run('rumble', () => this.rig.rumble());
  }
  walk(x: number) { return this.run('walk', () => this.walkTo(x)); }
  /**
   * Emotown: the pet back to the middle of its room, instantly, returning how far it was from there (room units).
   * The town moves the whole room by that much at the same moment, so on the street nothing jumps.
   */
  recenter(): number { const dx = this.st.x - WORLD.w / 2; if (dx !== 0) this.setX(WORLD.w / 2); return dx; }

  /** Neglected to death: it keels over, a little grave appears, and it floats above it as a ghost. */
  die() {
    return this.run('die', async () => {
      if (this.st.dead) return;
      this.snore(false);
      if (this.st.sleeping) { this.set({ sleeping: false }); this.rig.setMood('idle'); await wait(400); }
      this.rig.setDirty(false);
      if (this.poopProp) { void this.poopProp.remove(400); this.poopProp = null; this.set({ poop: false }); }
      this.voice('sad');
      this.sfx('die', { delay: 0.35 });
      const p = this.rig.die();
      await wait(1300);
      this.sfx('grave');
      const grave = this.graveProp();
      grave.anim([{ transform: 'translateY(30px) scale(0.6)', opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.3,1.2)' }, { transform: 'translateY(0) scale(1)', opacity: 1, offset: 1 }], { duration: 600 });
      this.grave = grave;
      this.set({ dead: true });
      await p;
      this.sfx('ghost');
      this.sparkles(3, this.st.x, this.B.top + 40, 80);
    });
  }
  /** The little grave beside the pet, on the room's side of it. */
  private graveProp() {
    const side: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;
    const grave = new Prop(this.L.front, 'grave', 70).place(this.st.x + side * (this.own?.tune?.graveX ?? (this.rig.character === 'seal' ? 104 : 62)), WORLD.floor + 10);   // the seal is wide: clear of its flipper
    grave.el.style.transformOrigin = '50% 100%';
    return grave;
  }
  /** Bought back: a burst of sparks, the grave puffs away, colour returns and it stretches awake. */
  revive() {
    return this.run('revive', async () => {
      if (!this.st.dead) return;
      const head = this.headPos();
      this.sfx('revive');
      this.sparkles(10, this.st.x, head.y, 120, true);
      this.puff(this.st.x, WORLD.floor + 6, 130);
      await wait(300);
      if (this.grave) { const g = this.grave; this.grave = null; this.puff(g.el.offsetLeft + g.w / 2, WORLD.floor + 4, 90); void g.remove(300, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.4)', opacity: 0 }]); }
      this.set({ dead: false });
      await this.rig.revive();
      this.hearts(4);
      this.voice('happy');
      const wag = this.rig.wag();
      await wait(1200);
      await wag.stop();
      this.rig.restFace();
    });
  }
  hairflick() { return this.rig.hairflick(); }

  /** Everything back to back, to watch the joins. */
  async tour() {
    await this.walk(160);
    await this.feed();
    await this.walk(380);
    await this.poop();
    await this.clean();
    await this.play();
    await this.wash();
    await this.pet(1);
    await this.sleep();
    await wait(2600);
    await this.wake();
  }

  // ---- wandering ----
  /** Autonomous wandering between actions; tests switch it off. */
  wanderEnabled = true;
  private scheduleWander(ms = rand(4000, 8000)) {
    if (this.wanderTimer) clearTimeout(this.wanderTimer);
    if (!this.wanderEnabled) return;
    this.wanderTimer = setTimeout(() => {
      this.wanderTimer = null;
      if (this.destroyed || !this.wanderEnabled || this.isBusy || this.st.sleeping || this.st.dead) { this.scheduleWander(); return; }
      const r = Math.random();
      if (r < 0.5) {
        const to = clamp(this.st.x + (Math.random() < 0.5 ? -1 : 1) * rand(70, 190), WALK_MIN, WALK_MAX);
        void this.run('wander', () => this.walkTo(to));
      } else if (r < 0.75) {
        void this.run('wander', async () => { this.rig.look(rand(-1, 1), rand(-0.6, 0.4)); await this.rig.perk(); await wait(900); this.rig.release('look', 400); await wait(300); });
      } else {
        this.scheduleWander();
      }
    }, ms);
  }

  destroy() {
    this.destroyed = true;
    this.heldGuitar?.(); this.heldGuitar = null;
    this.heldPhone?.(); this.heldPhone = null;
    this.leave();
    if (this.wanderTimer) clearTimeout(this.wanderTimer);
    this.snore(false);
    for (const x of this.sounding) x.stop(180);
    this.sounding = [];
    this.grave = null;
    this.L.back.replaceChildren(); this.L.front.replaceChildren();
  }
}
