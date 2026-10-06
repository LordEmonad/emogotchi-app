/**
 * The pet's animation rig.
 *
 * One SVG, never re-inserted. Idle motion runs forever as looping Web
 * Animations. Everything else is layered on top with `composite: 'add'`, so
 * motions stack instead of replacing each other and nothing ever snaps:
 *
 *  - loops with a handle (walk, wiggle, purr, wag) ease back to rest when stopped
 *  - held poses (lean, crouch, squat, eat, nuzzle) are fill-forwards layers that
 *    reverse over ~300 ms on release
 *  - one-shots (jump, land, bat, chomp, lick, shake, stretch, hop, rumble) return a
 *    promise that resolves when they end
 *  - moods (sleep, sad) are layers that ease in and out
 *
 * Element ids and transform origins come from packages/pet/cat.svg and pet.css.
 */
export type Mood = 'idle' | 'sleep' | 'sad';
export type Eyes = 'open' | 'closed' | 'happy' | 'squeeze' | 'x';
export type Mouth = 'idle' | 'smug' | 'open' | 'smile' | 'frown' | 'yum' | 'gape';   // gape: the seal's wide-open mouth (seal.svg only)
export type Dir = -1 | 1;
import { refreshPivots, viewBoxOf } from './layers';

export type Character = 'cat' | 'frog' | 'sahur' | 'seal' | 'thiccums' | 'r3tards' | 'emonad';   // (emonad: Emonadgotchi, in its lab only, /emonadgotchi)

type KF = Keyframe[];
type Opts = KeyframeAnimationOptions;
export type LoopHandle = { stop: () => Promise<void> };

/** The limb that drums the darbuka and its angles (drumArm). */
export type DrumArm = { hover: number; hit: number; dum: number; tek: number; lift?: number; bow?: number; limb: Element | null | undefined; rot: (d: number) => string; base: string };
/**
 * A character that still lives in its lab brings its own moves, from a module only that lab imports (registerOwnMoves):
 * the rig asks them first wherever a character's own move goes, and does its own thing for anything they leave out.
 * `make` runs once per rig, after the rig is built, with the rig (its working parts are rig.kit()). Nothing on the site
 * registers any; the labs that do exist only in dev builds.
 */
export type OwnMoves = {
  pat?(dir: Dir): Promise<void>;
  bat?(dir: Dir): Promise<void>;
  hug?(): void;
  twist?(dir: Dir): Promise<void>;
  kapparotRaise?(): void;
  kapparotFollow?(laps: number, lapMs: number): Promise<void>;
  drumArm?(dir: Dir): DrumArm | undefined;
  falconReady?(): void;
  falconGive?(): Promise<void>;
  /** whether the crown is hidden under what it wears (undefined: the rig's own rule) */
  crownHidden?(): boolean | undefined;
  /** the crown's own lift (a CSS transform; undefined: the rig's own rule) */
  crownLift?(): string | undefined;
  /** how far the halo floats up over what it wears (undefined: the rig's own rule) */
  haloLift?(): number | undefined;
  /** where the sleep z's go (a CSS transform; undefined: the rig's own rule) */
  zzzAt?(): string | undefined;
  /** how far the head turns in the shared curious tilt and nuzzle, as a share of the usual (a head joined to the body
   *  along a wide neck opens the join when it turns far) */
  headTurn?: number;
  /** what the legs do in the walk cycle (two hops a cycle, rest at 0, 0.5 and 1), for a character whose #footL/#footR
   *  are whole legs hanging from the hips (undefined: the rig's own, the feet's little dangle) */
  walkLegs?(dir: Dir): { footL: Keyframe[]; footR: Keyframe[] } | undefined;
  /** what the arms (#legL/#legR) do in the walk cycle, for a character whose arms swing like arms (undefined: the rig's
   *  own, the cat's front legs paddling); any other group may be given its keyframes too, by id */
  walkArms?(dir: Dir): Record<string, Keyframe[]> | undefined;
  /** the sleepy yawn and the wake-up stretch, for a character whose open mouth cannot simply be scaled wide (undefined: the rig's own) */
  yawn?(): Promise<void>;
  stretch?(): Promise<void>;
  /** the happy wiggle after a meal or a game (undefined: the rig's own, a shimmy of the body over the feet) */
  shimmy?(): Promise<void>;
  /** the squat (held under 'squat', with its face), for a character with real legs to bend (undefined: the rig's own squash) */
  squat?(): void;
  /** sitting down on the floor (held under 'sit'), for a character whose hands cannot reach it standing: `ms` 0 is at once */
  sit?(arms?: boolean, ms?: number): void;
  /** the curious tilt and the nuzzle, held under the same keys ('tilt', 'nuzzle') so the usual releases end them */
  tilt?(dir: Dir): void;
  nuzzle?(dir: Dir): void;
  /** the emo pack's guitar and selfie, for a character whose arms bend at the elbow (undefined: the rig's own tables) */
  strumArm?(): { strum: StrumLimb; fret: StrumLimb | null };
  pickUp?(ms: number): string[];
  throwGuitar?(onRelease: () => void, onStart?: (ms: number, release: number) => void): Promise<void>;
  selfieArm?(): SelfieArm;
  /** how far a ghost floats up off the floor (undefined: the rig's own rule) */
  ghostRise?: number;
  destroy?(): void;
};
const OWN_MOVES: Partial<Record<Character, (rig: PetRig) => OwnMoves>> = {};
export function registerOwnMoves(character: Character, make: (rig: PetRig) => OwnMoves) { OWN_MOVES[character] = make; }

const ADD: Opts = { composite: 'add' };
/**
 * Hushed (Emotown, while the street is being scrolled): calm rigs start no new idle flourish until it stops. The ones
 * already under way finish by themselves; nothing is paused (a paused animation still counts as running to the browser
 * and keeps its part on a compositing layer of its own, which is the very cost this avoids).
 */
let HUSH = false;
export const setHush = (on: boolean) => { HUSH = on; };
export const isHushed = () => HUSH;
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/**
 * Browsers auto-remove a finished fill-forwards animation as soon as a later animation targets the
 * same property (the "replaced animations" rule), even with composite: add. Every held pose must
 * opt out, or a pose silently vanishes when a small later hold finishes after it.
 */
const keep = <T extends Animation | null>(a: T): T => { if (a && 'persist' in a) (a as Animation).persist(); return a; };

// ---------------- keyframes ----------------
const K = {
  blinkOnce: [
    { transform: 'translateY(0)', offset: 0, easing: 'ease-in' }, { transform: 'translateY(19px)', offset: 0.38 },
    { transform: 'translateY(19px)', offset: 0.52, easing: 'ease-out' }, { transform: 'translateY(-1px)', offset: 0.88 }, { transform: 'translateY(0)', offset: 1 },
  ],
  blink: [
    { transform: 'translateY(0)', offset: 0 }, { transform: 'translateY(0)', offset: 0.45, easing: 'ease-in' },
    { transform: 'translateY(19px)', offset: 0.458 }, { transform: 'translateY(19px)', offset: 0.466, easing: 'ease-out' },
    { transform: 'translateY(-1px)', offset: 0.478 }, { transform: 'translateY(0)', offset: 0.485 },
    { transform: 'translateY(0)', offset: 0.925, easing: 'ease-in' }, { transform: 'translateY(19px)', offset: 0.933 },
    { transform: 'translateY(19px)', offset: 0.939, easing: 'ease-out' }, { transform: 'translateY(3px)', offset: 0.947, easing: 'ease-in' },
    { transform: 'translateY(19px)', offset: 0.955 }, { transform: 'translateY(19px)', offset: 0.961, easing: 'ease-out' },
    { transform: 'translateY(-1px)', offset: 0.973 }, { transform: 'translateY(0)', offset: 0.98 }, { transform: 'translateY(0)', offset: 1 },
  ],
  sway: [{ transform: 'rotate(-4deg)' }, { transform: 'rotate(5deg)' }],
  breathe: [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.012)' }],
  headBob: [{ transform: 'translateY(0)' }, { transform: 'translateY(-0.7px)' }],
  pupilDrift: [
    { transform: 'translate(0,0)', offset: 0 }, { transform: 'translate(0,0)', offset: 0.2 },
    { transform: 'translate(-5%,1%)', offset: 0.3 }, { transform: 'translate(-5%,1%)', offset: 0.45 },
    { transform: 'translate(4%,-1%)', offset: 0.55 }, { transform: 'translate(4%,-1%)', offset: 0.7 },
    { transform: 'translate(0,0)', offset: 0.8 }, { transform: 'translate(0,0)', offset: 1 },
  ],
  earTwitch: [
    { transform: 'rotate(0)', offset: 0 }, { transform: 'rotate(0)', offset: 0.8 }, { transform: 'rotate(9deg)', offset: 0.83 },
    { transform: 'rotate(-4deg)', offset: 0.86 }, { transform: 'rotate(3deg)', offset: 0.89 }, { transform: 'rotate(0)', offset: 1 },
  ],
  pendantIdle: [{ transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2.5deg)' }],

  // ---- hair flick (idle flourish) ----
  hairflick: [
    { transform: 'rotate(0)', offset: 0, easing: 'ease-in' },
    { transform: 'rotate(3deg) translateY(1%)', offset: 0.12, easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'rotate(-15deg) translateY(-4%)', offset: 0.35 },
    { transform: 'rotate(-13deg) translateY(-3%)', offset: 0.62, easing: 'ease-in' },
    { transform: 'rotate(2deg) translateY(0.5%)', offset: 0.85, easing: 'ease-out' },
    { transform: 'rotate(0)', offset: 1 },
  ],
  flickHead: [
    { transform: 'rotate(0)', offset: 0 }, { transform: 'rotate(1.5deg)', offset: 0.12 },
    { transform: 'rotate(-3deg) translateX(-0.5px)', offset: 0.35 }, { transform: 'rotate(-3deg) translateX(-0.5px)', offset: 0.62 },
    { transform: 'rotate(0)', offset: 1 },
  ],
  crownLift: [
    { transform: 'translateY(0)', offset: 0 }, { transform: 'translateY(0)', offset: 0.14, easing: 'ease-out' },
    { transform: 'translateY(-9%) rotate(3deg)', offset: 0.4, easing: 'ease-in' }, { transform: 'translateY(-4%) rotate(2deg)', offset: 0.58 },
    { transform: 'translateY(1.5%) rotate(-0.5deg)', offset: 0.74, easing: 'ease-out' }, { transform: 'translateY(-1%)', offset: 0.88 },
    { transform: 'translateY(0)', offset: 1 },
  ],
  glanceRight: [{ transform: 'translate(0,0)', offset: 0 }, { transform: 'translate(0,0)', offset: 0.2 }, { transform: 'translate(10%,-4%)', offset: 0.38 }, { transform: 'translate(10%,-4%)', offset: 0.62 }, { transform: 'translate(0,0)', offset: 0.85 }, { transform: 'translate(0,0)', offset: 1 }],

  // ---- walk cycle: two hops per cycle, rest pose at 0, 0.5 and 1 ----
  hop2: [
    { transform: 'none', offset: 0, easing: 'ease-out' },
    { transform: 'translateY(1.5px) scaleY(0.95) scaleX(1.03)', offset: 0.06, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: 'translateY(-13px) scaleY(1.03) scaleX(0.985)', offset: 0.28, easing: 'cubic-bezier(.6,0,.9,.6)' },
    { transform: 'none', offset: 0.5, easing: 'ease-out' },
    { transform: 'translateY(1.5px) scaleY(0.95) scaleX(1.03)', offset: 0.56, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: 'translateY(-13px) scaleY(1.03) scaleX(0.985)', offset: 0.78, easing: 'cubic-bezier(.6,0,.9,.6)' },
    { transform: 'none', offset: 1 },
  ],
  headLag: [
    { transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.1, easing: 'ease-in-out' }, { transform: 'translateY(-3px)', offset: 0.36, easing: 'ease-in-out' },
    { transform: 'none', offset: 0.5 }, { transform: 'translateY(3px)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'translateY(-3px)', offset: 0.86, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
  ],
  fringeLag: [
    { transform: 'none', offset: 0 }, { transform: 'translateY(2px)', offset: 0.12, easing: 'ease-in-out' }, { transform: 'translateY(-2.5px)', offset: 0.38, easing: 'ease-in-out' },
    { transform: 'none', offset: 0.5 }, { transform: 'translateY(2px)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'translateY(-2.5px)', offset: 0.88, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
  ],
  earBounce: [
    { transform: 'scaleY(1)', offset: 0 }, { transform: 'scaleY(0.93)', offset: 0.08 }, { transform: 'scaleY(1.05)', offset: 0.32 },
    { transform: 'scaleY(1)', offset: 0.5 }, { transform: 'scaleY(0.93)', offset: 0.58 }, { transform: 'scaleY(1.05)', offset: 0.82 }, { transform: 'scaleY(1)', offset: 1 },
  ],
  feetDangle: [
    { transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 0.5 },
    { transform: 'translateY(3px)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
  ],
  shadowHop: [
    { transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(0.84)', offset: 0.28, easing: 'ease-in-out' }, { transform: 'scaleX(1)', offset: 0.5 },
    { transform: 'scaleX(0.84)', offset: 0.78, easing: 'ease-in-out' }, { transform: 'scaleX(1)', offset: 1 },
  ],

  // ---- one-shots ----
  jump: [
    { transform: 'none', offset: 0, easing: 'ease-in' },
    { transform: 'translateY(5px) scaleY(0.9) scaleX(1.06)', offset: 0.14, easing: 'cubic-bezier(.2,.8,.4,1)' },
    { transform: 'translateY(-46px) scaleY(1.09) scaleX(0.95)', offset: 0.52, easing: 'cubic-bezier(.6,0,.9,.6)' },
    { transform: 'translateY(0) scaleY(1)', offset: 1 },
  ],
  land: [
    { transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(1px) scaleY(0.9) scaleX(1.07)', offset: 0.28, easing: 'ease-in-out' },
    { transform: 'scaleY(1.03) scaleX(0.985)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
  ],
  shadowJump: [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(0.7)', opacity: 0.6, offset: 0.52, easing: 'ease-in-out' }, { transform: 'scaleX(1)', offset: 1 }],
  hopSmall: [
    { transform: 'none', offset: 0, easing: 'ease-in' }, { transform: 'scaleY(0.94)', offset: 0.1, easing: 'ease-out' },
    { transform: 'translateY(-16px) scaleY(1.04)', offset: 0.42, easing: 'ease-in' }, { transform: 'translateY(0) scaleY(0.96) scaleX(1.03)', offset: 0.7, easing: 'ease-out' },
    { transform: 'none', offset: 1 },
  ],
  chompHead: [{ transform: 'none', offset: 0, easing: 'ease-in' }, { transform: 'translateY(7px) rotate(2deg)', offset: 0.45, easing: 'ease-out' }, { transform: 'none', offset: 1 }],
  earWiggle: [{ transform: 'none', offset: 0 }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'rotate(-4deg)', offset: 0.7 }, { transform: 'none', offset: 1 }],
  lickHead: [{ transform: 'none', offset: 0 }, { transform: 'rotate(-4deg) translateY(-1px)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'rotate(-3deg)', offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }],
  shakeHead: [
    { transform: 'none', offset: 0 }, { transform: 'rotate(-13deg)', offset: 0.12 }, { transform: 'rotate(13deg)', offset: 0.26 }, { transform: 'rotate(-11deg)', offset: 0.4 },
    { transform: 'rotate(11deg)', offset: 0.54 }, { transform: 'rotate(-7deg)', offset: 0.68 }, { transform: 'rotate(5deg)', offset: 0.82 }, { transform: 'none', offset: 1 },
  ],
  shakeBody: [
    { transform: 'none', offset: 0 }, { transform: 'rotate(3deg)', offset: 0.12 }, { transform: 'rotate(-3deg)', offset: 0.26 }, { transform: 'rotate(3deg)', offset: 0.4 },
    { transform: 'rotate(-3deg)', offset: 0.54 }, { transform: 'rotate(2deg)', offset: 0.68 }, { transform: 'rotate(-1deg)', offset: 0.82 }, { transform: 'none', offset: 1 },
  ],
  shakeEar: [{ transform: 'scaleY(1)', offset: 0 }, { transform: 'scaleY(0.9)', offset: 0.12 }, { transform: 'scaleY(1.06)', offset: 0.26 }, { transform: 'scaleY(0.92)', offset: 0.4 }, { transform: 'scaleY(1.05)', offset: 0.54 }, { transform: 'scaleY(0.96)', offset: 0.68 }, { transform: 'scaleY(1)', offset: 1 }],
  shakeFringe: [{ transform: 'none', offset: 0 }, { transform: 'rotate(6deg)', offset: 0.14 }, { transform: 'rotate(-6deg)', offset: 0.28 }, { transform: 'rotate(5deg)', offset: 0.42 }, { transform: 'rotate(-5deg)', offset: 0.56 }, { transform: 'rotate(3deg)', offset: 0.7 }, { transform: 'none', offset: 1 }],
  stretchBody: [
    { transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'scaleY(0.97)', offset: 0.12, easing: 'ease-in-out' },
    { transform: 'scaleY(1.08) scaleX(0.97) translateY(-2px)', offset: 0.42 }, { transform: 'scaleY(1.08) scaleX(0.97) translateY(-2px)', offset: 0.68, easing: 'ease-in-out' },
    { transform: 'none', offset: 1 },
  ],
  stretchHead: [{ transform: 'none', offset: 0 }, { transform: 'rotate(-7deg) translateY(-3px)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'rotate(-7deg) translateY(-3px)', offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }],
  legStretch: [{ transform: 'none', offset: 0 }, { transform: 'scaleY(1.06)', offset: 0.42, easing: 'ease-in-out' }, { transform: 'scaleY(1.06)', offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }],
  rumble: [
    { transform: 'none', offset: 0 }, { transform: 'scaleX(1.05) scaleY(0.98)', offset: 0.2 }, { transform: 'scaleX(0.96) scaleY(1.02)', offset: 0.4 },
    { transform: 'scaleX(1.04) scaleY(0.98)', offset: 0.6 }, { transform: 'scaleX(0.98)', offset: 0.8 }, { transform: 'none', offset: 1 },
  ],
  rumbleHead: [{ transform: 'none', offset: 0 }, { transform: 'rotate(4deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(4deg) translateY(2px)', offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }],
  perkL: [{ transform: 'none', offset: 0 }, { transform: 'rotate(12deg)', offset: 0.35, easing: 'ease-out' }, { transform: 'rotate(5deg)', offset: 0.7 }, { transform: 'none', offset: 1 }],
  perkR: [{ transform: 'none', offset: 0 }, { transform: 'rotate(-12deg)', offset: 0.35, easing: 'ease-out' }, { transform: 'rotate(-5deg)', offset: 0.7 }, { transform: 'none', offset: 1 }],
  sweatOnce: [{ transform: 'translateY(-20%) scale(0.6)', opacity: 0, offset: 0 }, { transform: 'translateY(-8%) scale(0.9)', opacity: 1, offset: 0.3 }, { transform: 'translateY(70%) scale(1)', opacity: 0, offset: 1 }],
  sparkle: [
    { transform: 'scale(0) rotate(0)', opacity: 0, offset: 0 }, { transform: 'scale(1.3) rotate(20deg)', opacity: 1, offset: 0.3 },
    { transform: 'scale(0.9) rotate(70deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(0) rotate(110deg)', opacity: 0, offset: 1 },
  ],
  pendantSwing: [{ transform: 'none', offset: 0 }, { transform: 'rotate(14deg)', offset: 0.2 }, { transform: 'rotate(-10deg)', offset: 0.4 }, { transform: 'rotate(6deg)', offset: 0.6 }, { transform: 'rotate(-3deg)', offset: 0.8 }, { transform: 'none', offset: 1 }],

  // ---- loops with handles ----
  wag: [{ transform: 'rotate(-12deg)' }, { transform: 'rotate(12deg)' }],
  wiggle: [{ transform: 'translateX(-3px) rotate(-2deg)' }, { transform: 'translateX(3px) rotate(2deg)' }],
  wiggleHead: [{ transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }],
  purr: [{ transform: 'scale(1)' }, { transform: 'scale(1.006)' }],
  tremble: [{ transform: 'translateX(-0.4%)' }, { transform: 'translateX(0.4%)' }],
  pendantTremble: [{ transform: 'rotate(-1.5deg)' }, { transform: 'rotate(1.5deg)' }],

  // ---- moods ----
  nod: [{ transform: 'rotate(1deg)' }, { transform: 'rotate(4deg) translateY(2px)' }],
  breatheSlow: [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.02)' }],
  swaySlow: [{ transform: 'rotate(-2deg)' }, { transform: 'rotate(3deg)' }],
  crownSlip: [{ transform: 'none' }, { transform: 'rotate(2.5deg) translateY(1.5%)' }],
  z: [{ transform: 'translateY(6px) scale(0.6)', opacity: 0, offset: 0 }, { transform: 'translateY(1px) scale(0.75)', opacity: 1, offset: 0.25 }, { transform: 'translateY(-14px) scale(1.1)', opacity: 0, offset: 1 }],
  tearDrip: [{ transform: 'translateY(-30%) scale(0.5)', opacity: 0, offset: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.55, easing: 'ease-in' }, { transform: 'translateY(160%) scale(0.9)', opacity: 0, offset: 1 }],
  stinkWave: [{ transform: 'translateY(0) scaleX(1)', opacity: 0, offset: 0 }, { transform: 'translateY(-4px) scaleX(-1)', opacity: 0.9, offset: 0.4 }, { transform: 'translateY(-12px) scaleX(1)', opacity: 0, offset: 1 }],
} satisfies Record<string, KF>;

// ---------------- the outfits ----------------
/** The outfits the rig can draw, by name. The pieces are groups in cat.svg / frog.svg, hidden until worn. */
export type Costume = 'witch' | 'pumpkin' | 'mummy' | 'zombie' | 'kippah' | 'starofdavid' | 'keffiyeh' | 'bisht'
  | 'beanie' | 'emofit' | 'wristbands' | 'piercings';
export const COSTUMES: readonly Costume[] = ['witch', 'pumpkin', 'mummy', 'zombie', 'kippah', 'starofdavid', 'keffiyeh', 'bisht', 'beanie', 'emofit', 'wristbands', 'piercings'];
/** The outfits proper, worn one at a time on the site (the Habibi pack's bisht is one). The kippah, the Star of David and
 *  the keffiyeh are accessories like the emo hair: they go with any outfit (the rig draws the clashes: a hat or the pumpkin
 *  covers the kippah and the keffiyeh). */
export const OUTFITS: readonly Costume[] = ['witch', 'pumpkin', 'mummy', 'zombie', 'bisht', 'emofit'];
export const COSTUME_PARTS: Record<Costume, readonly string[]> = {
  witch: ['witchhat', 'robe', 'robeback', 'yoke', 'sleeveL', 'sleeveR', 'robebacksq', 'yokesq', 'sleeveLsq', 'sleeveRsq'],
  pumpkin: ['pumpkin'],
  mummy: ['mummyhead', 'mummyface', 'mummybody', 'wrapL', 'wrapR', 'mummytail', 'earwrap', 'mummybodysq', 'wrapLsq', 'wrapRsq', 'mummyfootL', 'mummyfootR'],
  zombie: ['zombiehead', 'zombiebody', 'zombieL', 'zombieR', 'zombiebodysq', 'zombieLsq'],
  // the kippah is its own group in the head unit (after the emo hair, before the crown); the payot (the side curls
  // that come with it) live at the end of #head, so a hat can cover the kippah and leave the curls showing
  kippah: ['kippah', 'payot'],
  // a Star of David on a chain: inside the cat's #pendant (it swings with the tag, which it replaces), over the frog's
  // robe (a copy on his pinched body), round the top of Sahur's log
  starofdavid: ['davidstar', 'davidstarsq'],
  // the Habibi pack: the keffiyeh is the cloth over the head with its agal (#keffiyeh, in the head unit after the kippah)
  // and the cloth hanging behind the head onto the shoulders (#keffiyehback, drawn behind the head, in the head unit too)
  // (on the frok the cloth's fall onto his shoulder is a third piece, #keffiyehdrape, drawn after his arms)
  keffiyeh: ['keffiyeh', 'keffiyehback', 'keffiyehdrape'],
  // the bisht: the cloak behind the body, its front (shoulders and the gold-trimmed edges) over the body, a sleeve on each
  // front leg / arm / flipper; the frok's pinched body has copies under ...sq ids like the witch's
  bisht: ['bishtback', 'bisht', 'bishtsleeveL', 'bishtsleeveR', 'bishtbacksq', 'bishtsq', 'bishtsleeveLsq', 'bishtsleeveRsq'],
  // the emo pack (DEV only until it is an item, /emopack): the beanie is the knit hat with black emo hair under it, swept
  // over one eye (#beanie, in the head unit after the keffiyeh) and the hair hanging behind the head (#beanieback, drawn
  // behind it); it is a head piece like the kippah and the keffiyeh, and it covers the emo hair item and the cat's own mop
  beanie: ['beanie', 'beanieback'],
  // the emo clothes: an outfit, cut for each pet (the body piece, a piece behind it, one for each arm or front leg, one for
  // each foot or leg, the frok's pinched copies)
  emofit: ['emofit', 'emofitback', 'emofitL', 'emofitR', 'emofitfootL', 'emofitfootR', 'emofitsq', 'emofitbacksq', 'emofitLsq', 'emofitRsq'],
  // the wristbands: a purple sweatband with a white stripe on each wrist (the cat wears hers already: her own look)
  wristbands: ['wristL', 'wristR', 'wristLsq', 'wristRsq'],
  // the lip piercings: two silver hoops through the lower lip (snakebites), in the face (gold when crowned)
  piercings: ['piercings'],
};

/** A piece that is on screen: not display:none (inline, or the file's attribute still in force) and not opacity 0 (the crown when off). */
const shown = (e: Element): boolean => {
  const st = (e as HTMLElement).style;
  if (st.display === 'none' || st.opacity === '0') return false;
  if (st.display === '' && e.getAttribute('display') === 'none') return false;
  return true;
};

/**
 * Tie `b` to `a`: whatever steers `a` (cancel, reverse, pause, persist, a new current time or rate...) steers `b` the
 * same way, so the rig keeps one handle for both. Used for the seal's flipper and its twin (one()).
 */
function tie(a: Animation, b: Animation) {
  const own = a as unknown as Record<string, unknown>;
  for (const m of ['cancel', 'finish', 'pause', 'play', 'reverse', 'persist', 'commitStyles'] as const) {
    const f = a[m].bind(a); own[m] = () => { f(); b[m](); };
  }
  const rate = a.updatePlaybackRate.bind(a); own.updatePlaybackRate = (r: number) => { rate(r); b.updatePlaybackRate(r); };
  for (const p of ['currentTime', 'startTime', 'playbackRate'] as const) {
    // (a part with two twins is tied twice: the second tie must keep the first's, so it sets through what is already there)
    const proto = Object.getOwnPropertyDescriptor(Animation.prototype, p);
    const d = Object.getOwnPropertyDescriptor(a, p) ?? proto;
    if (d?.get && d.set && proto?.set) Object.defineProperty(a, p, { configurable: true, get: () => d.get!.call(a), set: (v) => { d.set!.call(a, v); proto.set!.call(b, v); } });
  }
  // a retimed effect too (release() runs a hold back over its own time and easing)
  const ea = a.effect; const eb = b.effect;
  if (ea && eb) { const up = ea.updateTiming.bind(ea); (ea as unknown as { updateTiming: (t?: OptionalEffectTiming) => void }).updateTiming = (t) => { up(t); eb.updateTiming(t); }; }
}

// ---------------- the rig ----------------
/**
 * The falcon (the Habibi pack's Pet item): the perches' angles, measured on the rig. The frok's forward sleeve (#legR) is
 * drawn inside a mirror (frog.svg: translate(248 0) scale(-1 1) round it), so its rotations run the other way: +90 holds
 * it straight out in front, +25 draws it in with the falcon on it, in front of his belly, where his near sleeve (#legL,
 * not mirrored) strokes its breast between -48 and -64 (the sleeve's end over the bird, measured); +55 holds it out again
 * for the release, in front of his chest and clear of his snout (straight out, the bird sat level with his face and its
 * wing crossed his eye once it had turned away). Sahur's bat level
 * (+63.1: the bat leans 26.9 off plumb, sahur.py bat_ang) and his free hand up to the bird on his cap (-172 .. -160); the
 * seal's raised flipper held 10 lower, out from under its cheek (its head and a keffiyeh's drape reach x 28 at the bird's
 * height, measured: the bird, facing out, sits clear of them).
 */
/** The emo pack's beanie: how far the crown rises to sit on top of the hat, and the halo over it (svg units, measured). */
const BEANIE_CROWN: Partial<Record<Character, number>> = { cat: 8, frog: 26, sahur: 8, thiccums: 26, r3tards: 8 };
const BEANIE_HALO: Partial<Record<Character, number>> = { cat: 10, frog: 28, sahur: 10, thiccums: 10, r3tards: 10 };
/** How far a ghost floats up off the floor (svg units; it bobs 7 more). Sahur stands 1.4x in a room of 460 and is a tall
 *  log: at 40 his halo went through the ceiling with nothing on, crowned or not (by 5 units; 13 crowned in the emo
 *  pack's beanie), so he floats 20; the r3tard (1.25x) touched it crowned in the beanie. Measured in the room
 *  (tools/shots/ghost-ceiling.mjs). Sahur in the witch hat touches the ceiling alive, so no float fits his. */
const GHOST_RISE: Partial<Record<Character, number>> = { sahur: 20, r3tards: 34 };
const FALCON_ARM = { frog: 90, frogIn: 25, frogOut: 55, strokeLo: -48, strokeHi: -64, sahur: 63.1, patLo: -172, patHi: -160, seal: -10 } as const;

/** What holds the phone up in the mirror selfie (rig.selfieArm). */
export type SelfieArm = { limb: Element | null | undefined; raise: number; lift?: number; upper?: { limb: Element | null | undefined; deg: number }; phone: { host: string; at: [number, number]; w: number; tilt: number }; side: Dir; bring?: { id: string; from: string };
  /** how far out to the side the phone falls before it swoops into the hand (room units; by default far enough to clear
   *  the head: 0 for a hand held up clear of the head, so it drops straight into it) */
  out?: number;
  /** the hand giving under the phone as it is caught */
  catch?: () => void;
  /** a pet's own throw: the arm's wind-up and flick, calling `release` the moment it lets go (the director then sends the
   *  phone up and away out of the room from where the hand had it) */
  toss?: (release: () => void) => Promise<void> };
/** A limb that holds the guitar (rig.strumArm). */
export type StrumLimb = { limb: Element | null | undefined; deg: number; amp?: number; lift?: number; probe: [number, number]; upper?: { limb: Element | null | undefined; deg: number } };

export class PetRig {
  private el: Record<string, Element | null> = {};
  private q = new Map<string, Element[]>();
  private idle: Animation[] = [];
  private blinks: Animation[] = [];
  private moodAnims: Animation[] = [];
  private holds = new Map<string, Animation[]>();
  private mood: Mood = 'idle';
  private destroyed = false;
  private opacityLoopTargets = new Set<Element>();
  private eyesNow: Eyes = 'open';
  private mouthNow: Mouth = 'idle';
  private flickTimer: ReturnType<typeof setTimeout> | null = null;
  /** Which drawing this is (`data-character` on the #cat group; the cat's file has none). The frog and sahur have a few poses of their own. */
  readonly character: Character;

  /**
   * The lite profile, for the rabbit r1 (2026-09-25). Its WebView (Chrome 101, a Helio P35) charges every frame for
   * every path UNDER a group that is animating: one animation on #figure alone (262 paths) is 33 fps there, on #head
   * (66) 40, on a foot (1 path) 58. Lite changes nothing anyone can see: the head unit animates only the pieces that
   * are showing (a hidden hat still walks its paths), and every #figure motion is applied to the HTML box around the
   * drawing instead of the drawing (the same pivot, translations scaled from svg units to that box's pixels), which
   * the compositor moves without touching a path. The operator's bar is that the r1 looks exactly like the desktop.
   */
  readonly lite: boolean;
  /** the drawing's viewBox: what a translation in svg units is a fraction of when it lands on a layer box (lite) */
  private vb = { w: 200, h: 230 };
  /** `root` is the inline svg, or in lite mode the layered `div.petroot` that layers.ts built from it */
  /**
   * The calm idle, for a crowd (Emotown, 2026-09-26): no breathing and no head bob. At street size those are well
   * under a pixel of movement, but each one repaints the whole drawing every frame, and a street holds dozens of pets.
   * Blinks, drifting pupils, the tail, the ears and every action are untouched.
   */
  readonly calm: boolean;
  constructor(private root: Element, lite = false, opts: { calm?: boolean } = {}) {
    this.lite = lite;
    this.calm = !!opts.calm;
    root.classList.add('rig');
    const svgRoot = root instanceof SVGSVGElement ? root : root.querySelector('svg');
    if (root instanceof HTMLElement && root.classList.contains('petroot')) this.vb = viewBoxOf(root);
    else if (svgRoot?.viewBox?.baseVal?.width) this.vb = { w: svgRoot.viewBox.baseVal.width, h: svgRoot.viewBox.baseVal.height };
    this.character = (root.querySelector('#cat')?.getAttribute('data-character') as Character | null) ?? 'cat';
    // data-jointed: a stick figure (its body never moves apart from its legs, its limbs only turn); data-jointed="limbs":
    // a figure whose limbs only turn but whose body moves (its shirt hangs over the tops of its legs and its arms)
    const jt = root.querySelector('#cat')?.getAttribute('data-jointed');
    this.jointed = jt != null && jt !== 'limbs';
    this.pinLimbs = jt != null;
    for (const id of ['cat', 'figure', 'shadow', 'tail', 'headstack', 'earL', 'earR', 'hairback', 'body', 'pendant', 'head', 'eyeL', 'eyeR', 'mouth',
      'fringe', 'crown', 'crownlift', 'glintL', 'glintC', 'glintR', 'sweat', 'tear', 'dirt', 'stink', 'zzz', 'legL', 'legR', 'footL', 'footR',
      'mouth-idle', 'mouth-smug', 'mouth-open', 'mouth-smile', 'mouth-frown', 'mouth-yum', 'mouth-gape', 'whiskers', 'halo',
      'witchhat', 'robe', 'sleeveL', 'sleeveR', 'robeback', 'robebacksq', 'yoke', 'yokesq', 'sleeveLsq', 'sleeveRsq', 'arms', 'armssq', 'emohair', 'slapmark', 'bodysq', 'legLsq', 'legRsq', 'camera', 'camlevel', 'cambulb',
      'foreR', 'bowl', 'bowllevel', 'bowlfront', 'bowlfood1', 'bowlfood2', 'bowlfood3',
      ...COSTUME_PARTS.pumpkin, ...COSTUME_PARTS.mummy, ...COSTUME_PARTS.zombie, ...COSTUME_PARTS.kippah, ...COSTUME_PARTS.starofdavid,
      ...COSTUME_PARTS.keffiyeh, ...COSTUME_PARTS.bisht, ...COSTUME_PARTS.beanie, ...COSTUME_PARTS.emofit, ...COSTUME_PARTS.wristbands, ...COSTUME_PARTS.piercings]) {
      this.el[id] = root.querySelector('#' + id);
    }
    if (this.character === 'seal' && !(root instanceof HTMLElement && root.classList.contains('petroot'))) this.pitL = root.querySelector('#legLpit');
    // twins: a group marked data-twin="<id>" is another piece of that part drawn at another depth (a drawing whose
    // outline is one layer under all of its ink); it gets every animation, fade and show its part gets. In the layered
    // drawing too: there a layer's twin is a layer itself (layers.ts), and gets its own slot for every animation
    for (const t of root.querySelectorAll('[data-twin]')) {
      const of = root.querySelector('#' + t.getAttribute('data-twin'));
      if (of) this.twins.set(of, [...(this.twins.get(of) ?? []), t]);
    }
    this.q.set('pupil', [...root.querySelectorAll('.pupil')]);
    this.q.set('lid', [...root.querySelectorAll('.lid')]);
    for (const k of ['open', 'closed', 'happy', 'squeeze', 'x']) this.q.set(k, [...root.querySelectorAll('.eye .' + k)]);
    this.q.set('z', [...root.querySelectorAll('#zzz .z')]);
    this.q.set('s', [...root.querySelectorAll('#stink .s')]);
    root.setAttribute('data-rig', 'on');
    // alternates are hidden by attribute in the file; switch them to opacity so they can crossfade
    for (const id of ['mouth-smug', 'mouth-open', 'mouth-smile', 'mouth-frown', 'mouth-yum', 'mouth-gape', 'glintL', 'glintC', 'glintR', 'sweat', 'tear', 'zzz', 'stink']) this.show(this.el[id], 0);
    for (const e of [...this.q.get('closed')!, ...this.q.get('happy')!, ...this.q.get('squeeze')!, ...this.q.get('x')!, ...this.q.get('z')!, ...this.q.get('s')!]) this.show(e, 0);
    this.show(this.el.halo, 0);
    this.show(this.el.dirt, 0);
    this.show(this.el.slapmark, 0);
    // the held camera is out of the way until it is held
    this.startIdle();
    this.own = OWN_MOVES[this.character]?.(this) ?? null;
  }
  /** The character's own moves, when it brings any (registerOwnMoves). */
  readonly own: OwnMoves | null;
  /**
   * The rig's working parts, for a character's own moves (registerOwnMoves): its groups, its queries, and the same
   * helpers every move in this file is built from, bound to it.
   */
  kit() {
    return {
      el: this.el, q: this.q, root: this.root,
      heads: () => this.heads, bodies: () => this.bodies,
      one: (e: Element | null | undefined, kf: KF, o: Opts) => this.one(e, kf, o),
      shot: (ms: number, build: Parameters<PetRig['shot']>[1]) => this.shot(ms, build),
      hold: (key: string, build: Parameters<PetRig['hold']>[1], ms?: number) => this.hold(key, build, ms),
      release: (key: string, ms?: number) => this.release(key, ms),
      drop: (key: string) => this.drop(key),
      loop: (build: Parameters<PetRig['loop']>[0]) => this.loop(build),
      face: (e?: Eyes, m?: Mouth, ms?: number) => this.face(e, m, ms),
      fade: (e: Element | null | undefined, to: number, ms?: number) => this.fade(e, to, ms),
      wearing: () => this.costumes, crowned: () => this.crownOn, hair: () => this.hairOn, ghost: () => this.ghost,
      mood: () => this.mood, busy: () => this.busy, holds: () => this.holds.size, destroyed: () => this.destroyed,
      calm: this.calm, lite: this.lite,
    };
  }

  get currentMood() { return this.mood; }
  /** Face, back hair and crown always move as one unit around the neck pivot (pet.css gives all three the same origin). */
  /**
   * The body and, on the frog, his arms (their own group drawn over the head): every body motion drives both. On
   * sahur the shoulders sit on the upper log, above the neck seam, so his arms ride with the head unit instead.
   */
  private get bodies(): Element[] { return this.character === 'sahur' || this.jointed ? [] : [this.el.body, this.el.arms].filter((e): e is Element => !!e); }
  private get bodiessq(): Element[] { return [this.el.bodysq, this.el.armssq].filter((e): e is Element => !!e); }
  /** On sahur the head unit is the whole log: head, body, arms and crown turn together about the hips (he is rigid wood; a bend at the neck seam read as a broken log), and `bodies` is empty. */
  private get heads(): Element[] {
    const all = [this.el.keffiyehback, this.el.beanieback, this.el.head, this.el.headstack, this.el.crown, this.el.witchhat, this.el.emohair, this.el.kippah, this.el.keffiyeh, this.el.keffiyehdrape, this.el.beanie, this.el.pumpkin, ...(this.character === 'sahur' ? [this.el.arms, this.el.body, this.el.robeback, this.el.bishtback, this.el.emofitback] : [])].filter((e): e is Element => !!e);
    return this.lite ? all.filter(shown) : all;
  }

  private show(e: Element | null | undefined, opacity: number) {
    if (!e) return;
    const s = (e as HTMLElement).style;
    s.display = 'inline';
    s.opacity = String(opacity);
    for (const t of this.twins.get(e) ?? []) this.show(t, opacity);
  }
  private one(e: Element | null | undefined, kf: KF, opts: Opts): Animation | null {
    if (!e || this.destroyed) return null;
    if (this.pinLimbs && (e === this.el.footL || e === this.el.footR || e === this.el.legL || e === this.el.legR)) kf = this.pinned(kf);
    const pinned = kf;
    // (a layer box gets a slot of its own; a plain group is animated itself)
    const run = (x: Element) => (x instanceof HTMLElement && x.hasAttribute('data-layer') ? this.onSlot(x, pinned, opts) : x.animate(this.proxied(x, pinned), opts));
    const a = run(e);
    // the seal's raised flipper has a twin in the body (seal.svg #legLpit, its root edge inked and masked) that must turn
    // exactly as the flipper does: every animation on the flipper is made on the twin too, and tied to it
    if (e === this.el.legL && this.pitL) tie(a, this.pitL.animate(this.proxied(e, kf), opts));
    const twins = this.twins.get(e);
    if (twins) for (const t of twins) { if (t.classList.contains('lipring')) this.followLip(e, t, pinned, opts, a); else tie(a, run(t)); }
    return a;
  }
  /**
   * The emo pack's lip rings ride on the lower lip: each mouth has its own pair (a twin of the mouth, `.lipring`), and when
   * the rig scales a mouth (a chew, a yawn, a scream) a ring must move with the lip where it goes in, never grow with it.
   * So each hoop (`.hoop`, `data-at`: the point where it goes into the lip) is moved by exactly how far that point moves:
   * a scale (sx, sy) about the mouth's origin O takes it to O + s(P - O), which is linear in s, so the hoop keeps pace at
   * every frame. (A translation on the mouth moves it too.) Plain drawings only: a layered mouth is left to its slot.
   */
  private followLip(mouth: Element, rings: Element, kf: KF, opts: Opts, a: Animation | null) {
    if (!a || !(mouth instanceof SVGGraphicsElement) || !Array.isArray(kf)) return;
    const cs = getComputedStyle(mouth);
    const [ox, oy] = cs.transformOrigin.split(' ').map((v) => parseFloat(v) || 0) as [number, number];
    let O = { x: ox, y: oy };
    if (cs.transformBox === 'fill-box') { const b = mouth.getBBox(); O = { x: b.x + ox, y: b.y + oy }; }
    const parse = (t: unknown) => {
      let sx = 1, sy = 1, tx = 0, ty = 0;
      if (typeof t !== 'string' || t === 'none') return { sx, sy, tx, ty };
      for (const m of t.matchAll(/(scale[XY]?|translate[XY]?)\(([^)]*)\)/g)) {
        const v = m[2]!.split(',').map((x) => parseFloat(x));
        if (m[1] === 'scale') { sx *= v[0] ?? 1; sy *= v[1] ?? v[0] ?? 1; } else if (m[1] === 'scaleX') sx *= v[0] ?? 1; else if (m[1] === 'scaleY') sy *= v[0] ?? 1;
        else if (m[1] === 'translate') { tx += v[0] ?? 0; ty += v[1] ?? 0; } else if (m[1] === 'translateX') tx += v[0] ?? 0; else ty += v[0] ?? 0;
      }
      return { sx, sy, tx, ty };
    };
    for (const hoop of rings.querySelectorAll('.hoop')) {
      const [px, py] = (hoop.getAttribute('data-at') ?? '').split(' ').map(Number) as [number, number];
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const frames = (kf as Keyframe[]).map((k) => {
        if (!('transform' in k)) return { ...k };
        const { sx, sy, tx, ty } = parse(k.transform);
        return { ...k, transform: `translate(${((sx - 1) * (px - O.x) + tx).toFixed(3)}px, ${((sy - 1) * (py - O.y) + ty).toFixed(3)}px)` };
      });
      tie(a, hoop.animate(frames, opts));
    }
  }
  /**
   * A drawing that says `data-jointed` on its #cat is lines joined at points (a stick figure): its limbs may only TURN
   * about their joints and its body never moves apart from its legs, or it comes to pieces (a 3px body shift that is
   * nothing on a cat is a spine hanging beside its legs). So on it `bodies` is empty, and a limb's keyframes lose their
   * translations (pinned()); every shared move then holds together without knowing.
   */
  private jointed = false;
  /** limbs only turn about their joints (data-jointed, either kind) */
  private pinLimbs = false;
  private pinned(kf: KF): KF {
    const strip = (t: unknown) => (typeof t === 'string' ? (t.replace(/translate(?:X|Y|3d)?\([^)]*\)/g, '').trim() || 'none') : t);
    return (Array.isArray(kf) ? kf.map((k) => ('transform' in k ? { ...k, transform: strip(k.transform) } : k)) : kf) as KF;
  }
  /** groups marked data-twin (see the constructor), by the part they follow */
  private twins = new Map<Element, Element[]>();
  /** seal.svg #legLpit, when this is the seal (see one()) */
  private pitL: Element | null = null;
  /**
   * lite: a layer box never animates itself. Each animation gets a thin wrapper box of its own, nested inside the
   * previous animation's wrapper, and runs on that wrapper as a plain (replace) animation. Measured on the r1: this
   * Chrome keeps an additive animation on the main thread but hands a replace one to the GPU, and boxes get their own
   * layer only while they animate. Nesting newest-innermost is exactly additive composition: `underlying + new`
   * applies the new transform to the point first. The wrapper is unwrapped when the animation is cancelled, or
   * finishes without a forward fill (a persisted hold keeps its wrapper until its release cancels it, as before).
   */
  private onSlot(layer: HTMLElement, kf: KF, opts: Opts): Animation {
    let host: HTMLElement = layer;
    while (host.children.length === 1 && host.firstElementChild instanceof HTMLElement && host.firstElementChild.classList.contains('slot')) host = host.firstElementChild;
    const slot = document.createElement('div'); slot.className = 'slot'; slot.style.transformOrigin = layer.style.transformOrigin;
    slot.append(...host.childNodes); host.appendChild(slot);
    const a = slot.animate(this.proxied(layer, kf), { ...opts, composite: 'replace' });
    const free = () => { if (slot.isConnected) slot.replaceWith(...slot.childNodes); };
    a.addEventListener('cancel', free); a.addEventListener('remove', free);
    a.finished.then(() => { const t = a.effect?.getComputedTiming(); if (!t || (t.fill !== 'forwards' && t.fill !== 'both')) free(); }).catch(() => {});
    return a;
  }
  /**
   * Keyframes are written in svg units. On a layer box (lite) a translation becomes a percentage of the box, which is
   * the drawing's box, so `translateY(7px)` in a 230-unit drawing is `translateY(3.0435%)` whatever the pixel size.
   * A percentage that was a fraction of the group's own box (the tremble's 0.4%) is rescaled by that box first.
   */
  private unit = 0;
  private proxied(e: Element, kf: KF): KF {
    if (!(e instanceof HTMLElement) || !e.hasAttribute('data-layer')) return kf;
    const W = this.vb.w; const H = this.vb.h;
    const refW = Number(e.getAttribute('data-refw')) || W; const refH = Number(e.getAttribute('data-refh')) || H;
    // CSS px of the box per svg unit (the box is laid out at the drawing's width; its on-screen scale is the room's business)
    if (!(this.unit > 0)) { const w = (this.root as HTMLElement).offsetWidth || this.root.clientWidth; if (w > 0) this.unit = w / W; }
    const k = this.unit;
    const conv = (v: string, axis: 'x' | 'y') => {
      const t = v.trim(); const full = axis === 'x' ? W : H; const ref = axis === 'x' ? refW : refH;
      let m = /^(-?[\d.]+)px$/.exec(t); if (m) return k > 0 ? `${(Number(m[1]) * k).toFixed(3)}px` : `${((Number(m[1]) / full) * 100).toFixed(4)}%`;
      m = /^(-?[\d.]+)%$/.exec(t); if (m) { const units = (Number(m[1]) / 100) * ref; return k > 0 ? `${(units * k).toFixed(3)}px` : `${(units / full * 100).toFixed(4)}%`; }
      return t;
    };
    return kf.map((f) => (typeof f.transform === 'string' ? { ...f, transform: f.transform.replace(/translate(X|Y)?\(([^)]*)\)/g, (_m: string, axis: string | undefined, args: string) => {
      const parts = args.split(',');
      if (axis === 'X') return `translateX(${conv(parts[0] ?? '0', 'x')})`;
      if (axis === 'Y') return `translateY(${conv(parts[0] ?? '0', 'y')})`;
      return `translate(${conv(parts[0] ?? '0', 'x')}, ${conv(parts[1] ?? '0', 'y')})`;
    }) } : f));
  }
  private many(es: Element[] | undefined, kf: KF, opts: Opts): Animation[] {
    if (this.destroyed) return [];
    return (es ?? []).map((e) => (e instanceof HTMLElement && e.hasAttribute('data-layer') ? this.onSlot(e, kf, opts) : e.animate(this.proxied(e, kf), opts)));
  }

  // ---- idle: runs forever ----
  private startIdle() {
    if (reduceMotion()) return;
    if (this.calm) { this.startCalmIdle(); return; }
    const A = (e: Element | null | undefined, kf: KF, o: Opts) => { const a = this.one(e, kf, { ...ADD, ...o }); if (a) this.idle.push(a); };
    for (const l of this.q.get('lid') ?? []) { const b = this.one(l, K.blink, { ...ADD, duration: 9200, iterations: Infinity }); if (b) { this.idle.push(b); this.blinks.push(b); } }
    A(this.el.tail, K.sway, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    if (!this.calm) {
      for (const b of this.bodies) A(b, K.breathe, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      if (this.character === 'sahur') A(this.el.figure, K.breathe, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });   // `bodies` is empty on him: the whole log breathes from the floor
      for (const h of this.heads) A(h, K.headBob, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -250 });
    }
    for (const p of this.q.get('pupil') ?? []) A(p, K.pupilDrift, { duration: 14000, iterations: Infinity, easing: 'ease-in-out' });
    A(this.el.earL, K.earTwitch, { duration: 7000, iterations: Infinity });
    A(this.el.pendant, K.pendantIdle, { duration: 5500, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    const tick = () => {
      if (this.destroyed) return;
      if (this.mood === 'idle' && this.holds.size === 0 && !this.busy && !this.ghost) void this.hairflick();
      this.flickTimer = setTimeout(tick, 14000 + Math.random() * 6000);
    };
    this.flickTimer = setTimeout(tick, 9000 + Math.random() * 5000);
  }
  /**
   * The calm idle (Emotown): nothing loops. Every few seconds one small thing happens and is over: a blink, a glance,
   * a flick of the tail, a twitch of an ear, now and then the hair flick. Measured on the street (2026-09-26): Chrome
   * gives every SVG part with a running (or paused) animation a compositing layer of its own, so a crowd of looping
   * idles was ~950 layers on the compositor thread and a native swipe dropped a fifth of its frames; with nothing
   * looping, a pet standing about holds a layer only for the quarter second something moves.
   */
  private calmTimer: ReturnType<typeof setTimeout> | null = null;
  private dirtyCalm = false;
  private startCalmIdle() {
    const once = (e: Element | null | undefined, kf: KF, ms: number, easing = 'ease-in-out') => this.one(e, kf, { ...ADD, duration: ms, easing });
    const tick = () => {
      this.calmTimer = null;
      if (this.destroyed) return;
      if (HUSH) { this.calmTimer = setTimeout(tick, 600 + Math.random() * 1200); return; }
      // a grubby pet's stink wafts; a sad one's tear falls (each a one-shot, now and then)
      if (!this.busy && this.dirtyCalm && Math.random() < 0.35) (this.q.get('s') ?? []).forEach((st, i) => { this.one(st, K.stinkWave, { duration: 2400, easing: 'ease-in-out', delay: i * 500 }); });
      if (!this.busy && this.mood === 'sad' && this.el.tear && Math.random() < 0.4) { const t = this.el.tear as HTMLElement; t.style.opacity = '1'; this.one(t, K.tearDrip, { duration: 3200, easing: 'ease-in-out', composite: 'replace' })?.finished.then(() => { if (this.mood === 'sad') t.style.opacity = '0'; }, () => {}); }
      if (!this.busy && this.mood !== 'sleep' && !this.ghost && this.eyesNow === 'open') {
        const r = Math.random();
        if (r < 0.55) for (const l of this.q.get('lid') ?? []) once(l, K.blinkOnce, 230);
        else if (r < 0.72) { const dx = Math.random() < 0.5 ? -1 : 1; for (const p of this.q.get('pupil') ?? []) once(p, [{ transform: 'none' }, { transform: `translate(${dx * 6}%, ${Math.random() * 3 - 1.5}%)`, offset: 0.2 }, { transform: `translate(${dx * 6}%, 0)`, offset: 0.8 }, { transform: 'none' }], 1600); }
        else if (r < 0.86) once(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-7deg)', offset: 0.3 }, { transform: 'rotate(4deg)', offset: 0.65 }, { transform: 'none' }], 1300);
        else if (r < 0.95) once(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(9deg)', offset: 0.25 }, { transform: 'rotate(-4deg)', offset: 0.55 }, { transform: 'none' }], 520, 'ease-out');
        else if (this.mood === 'idle' && this.holds.size === 0) void this.hairflick();
      }
      this.calmTimer = setTimeout(tick, 1800 + Math.random() * 4200);
    };
    this.calmTimer = setTimeout(tick, 400 + Math.random() * 3000);
  }
  /** Set by the director while an action runs, so idle flourishes stay out of the way. */
  busy = false;
  /** Sound: whoever runs this rig (a room's director) hears what its moves say (a step, a bite, a yawn); with nobody
   *  listening, nothing is said. Names are sound/sfx.ts's. */
  sound: ((name: string, o?: { v?: number; rate?: number; delay?: number; n?: number; gap?: number; dur?: number }) => void) | null = null;
  private snd(name: string, o?: { v?: number; rate?: number; delay?: number; n?: number; gap?: number; dur?: number }) { this.sound?.(name, o); }

  // ---- crossfades ----
  private fade(e: Element | null | undefined, to: number, ms = 180): Animation | null {
    if (!e || this.destroyed) return null;
    const from = Number((e as HTMLElement).style.opacity || '1');
    (e as HTMLElement).style.opacity = String(to);
    for (const t of this.twins.get(e) ?? []) this.fade(t, to, ms);
    return e.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out' });
  }
  private mouth(which: Mouth, ms = 180) {
    this.mouthNow = which;
    for (const m of ['idle', 'smug', 'open', 'smile', 'frown', 'yum', 'gape'] as const) this.fade(this.el['mouth-' + m], m === which ? 1 : 0, ms);
  }
  private eyes(which: Eyes, ms = 180) {
    this.eyesNow = which;
    const kinds = ['open', 'closed', 'happy', 'squeeze', 'x'] as const;
    const swap = (fadeMs: number) => { for (const k of kinds) for (const e of this.q.get(k) ?? []) this.fade(e, k === which ? 1 : 0, fadeMs); };
    const lids = this.q.get('lid') ?? [];
    const lidVisible = lids.length > 0 && Number((lids[0] as HTMLElement).style.opacity || '1') > 0.5;
    const openNow = (this.q.get('open') ?? []).some((e) => Number((e as HTMLElement).style.opacity || '1') > 0.5);
    if (reduceMotion() || ms === 0 || (!lidVisible && openNow)) { swap(ms); return; }
    if (!openNow && which === 'open') {
      // waking: show the open eye with its lid already down, then lift the lid
      const holds = lids.map((l) => l.animate([{ transform: 'translateY(19px)' }, { transform: 'translateY(19px)' }], { duration: 1, fill: 'forwards', ...ADD }));
      for (const l of lids) (l as HTMLElement).style.opacity = '1';
      swap(0);
      setTimeout(() => {
        for (const h of holds) h.cancel();
        for (const l of lids) l.animate([{ transform: 'translateY(19px)' }, { transform: 'translateY(-1px)', offset: 0.8 }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out', ...ADD });
      }, 60);
      return;
    }
    if (!openNow) { swap(ms); return; }
    // the eye is open with its lid showing: close the lid, swap behind it, lift it
    for (const l of lids) l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(19px)', offset: 0.42 }, { transform: 'translateY(19px)', offset: 0.55 }, { transform: 'translateY(-1px)', offset: 0.9 }, { transform: 'translateY(0)' }], { duration: 260, easing: 'ease-in-out', ...ADD });
    setTimeout(() => swap(0), 115);
  }
  /** Change the face. Eye swaps hide behind a blink, mouths crossfade. */
  face(eyes?: Eyes, mouth?: Mouth, ms = 180) {
    if (eyes && eyes !== this.eyesNow) this.eyes(eyes, ms);
    if (mouth && mouth !== this.mouthNow) this.mouth(mouth, ms);
  }
  /** Back to the mood's resting face. */
  restFace(ms = 240) {
    if (this.ghost) this.face('x', 'frown', ms);
    else if (this.mood === 'sleep') this.face('closed', 'idle', ms);
    else if (this.mood === 'sad') this.face('open', 'frown', ms);
    else this.face('open', 'idle', ms);
  }

  // ---- facing ----
  private flipped = false;
  /**
   * Which way the character faces. The cat is drawn head-on and never turns. The frog is drawn in three-quarter
   * view looking right, so it turns to whatever it deals with: a mirror on the #cat group (pet.css eases it, a
   * quick squeeze through the middle). The director keeps talking in room directions; `w()` turns those into the
   * drawing's own left and right, which is what every pose below is built in.
   */
  facing(dir: Dir) {
    if (this.character !== 'frog') return;
    const flip = dir < 0;
    if (flip === this.flipped) return;
    this.flipped = flip;
    const c = this.el.cat as HTMLElement | null;
    if (c) c.style.transform = flip ? 'scaleX(-1)' : '';
  }
  private w<T extends number>(dir: T): T { return (this.flipped ? -dir : dir) as T; }
  /**
   * The frog bows from the hips: the body turns about its base (and may squash), and the head unit rides along on
   * the neck, then bends further by `headDeg`. Returns the two transforms. Neck (98,86) and base (100,212) are the
   * pivots pet.css gives the frog's head and body.
   */
  private bow(bodyDeg: number, headDeg: number, scaleY = 1, dx = 0, dy = 0) {
    const P = { x: 98, y: 86 }; const H = { x: 100, y: 212 };
    const b = (bodyDeg * Math.PI) / 180; const vx = P.x - H.x; const vy = (P.y - H.y) * scaleY;
    const nx = H.x + vx * Math.cos(b) - vy * Math.sin(b); const ny = H.y + vx * Math.sin(b) + vy * Math.cos(b);
    return { body: `rotate(${bodyDeg}deg) scaleY(${scaleY})`, head: `translate(${(nx - P.x + dx).toFixed(2)}px, ${(ny - P.y + dy).toFixed(2)}px) rotate(${bodyDeg + headDeg}deg)` };
  }

  // ---- toggles ----
  private crownOn = false;
  private costumes = new Set<Costume>();
  private hairOn = false;
  /**
   * Crown + costume = the golden version of the costume, since a hat hides the crown itself (the witch hat, the
   * pumpkin). The mummy and the zombie leave the crown in view and go gold under it anyway (gold wrappings, gold
   * thread): every outfit has its golden version. Crown + emo hair = golden hair and no crown: the hair takes the
   * crown's place rather than sit under it.
   */
  private gild() {
    for (const c of COSTUMES) for (const id of COSTUME_PARTS[c]) this.el[id]?.classList.toggle('gold', this.crownOn && this.costumes.has(c));
    this.el.emohair?.classList.toggle('gold', this.crownOn && this.hairOn);
    this.root.classList.toggle('goldpierce', this.crownOn && this.costumes.has('piercings'));   // (the lip rings: one pair per mouth, pet.css)
    const crown = this.el.crown as HTMLElement | null;
    if (crown) {
      // the pumpkin takes the crown's place like the hair does (hidden, so no animation can lift a point out past it);
      // so does the kippah, which sits where the crown would and goes gold instead
      // (on the seal the witch hat does too: its cone is narrower than the round head's crown, and a point peeked out behind it)
      // (the keffiyeh's agal sits where the crown would: crowned, it is the gold agal and the crown is hidden)
      const hidden = this.own?.crownHidden?.();
      crown.style.visibility = this.crownOn && (hidden ?? (this.hairOn || this.costumes.has('pumpkin') || this.costumes.has('kippah') || this.costumes.has('keffiyeh') || (this.character === 'seal' && this.costumes.has('witch')))) ? 'hidden' : '';
      // the zombie cat's brain comes out of the crown's seat: the crown perches on top of it instead of hiding it
      // (the beanie: the crown sits on top of the hat, a little higher than on the head; the brain is under the hat)
      const beanie = this.costumes.has('beanie') && !this.costumes.has('witch') && !this.costumes.has('pumpkin');
      crown.style.transform = this.own?.crownLift?.() ?? (beanie ? `translateY(-${BEANIE_CROWN[this.character] ?? 8}px)` : this.character !== 'frog' && this.costumes.has('zombie') ? 'translateY(-11px)' : '');
    }
  }
  setCrown(on: boolean, ms = 240) {
    this.crownOn = on; this.gild(); this.placeHalo();
    const c = this.el.crown as HTMLElement | null;
    if (!c) return;
    const cur = c.style.opacity === '' ? 1 : Number(c.style.opacity);
    if ((cur > 0.5) === on) return;
    this.fade(c, on ? 1 : 0, ms);
  }
  /**
   * The outfits. Each is a set of pieces drawn into the character (a hat in the head unit, a robe in the body, a
   * sleeve in each leg, bandages, stitches) that fade in together; the zombie also recolours the skin through a
   * class on the svg, like the ghost. `setCostume` takes one name (or `true` for the witch, the old switch, or
   * `false`/null for none); `setCostumes` takes any set, so outfits can be worn together where they do not clash.
   */
  setCostume(which: Costume | boolean | null, ms = 240) { this.setCostumes(which === true ? ['witch'] : which ? [which] : [], ms); }
  setCostumes(which: readonly Costume[], ms = 240) {
    const next = new Set(which);
    // Off means display:none, not opacity 0. #body and #figure take their transform pivot from their
    // bounding box, and an invisible robe still widens that box, which moved every cat's squash and
    // crouch pivot by a few pixels. Out of layout entirely until worn.
    // (the frog's cape, sleeves and wraps have copies on his pinched body under the ...sq ids; the cat has none of those)
    for (const c of COSTUMES) {
      const on = next.has(c);
      if (on === this.costumes.has(c)) continue;
      for (const id of COSTUME_PARTS[c]) this.toggle(id, on, ms);
    }
    if (this.lite) refreshPivots(this.root);
    this.costumes = next; this.gild();
    this.root.classList.toggle('zombie', next.has('zombie'));
    this.root.classList.toggle('pumpkinhead', next.has('pumpkin'));
    // pet.css: the witch hat and the pumpkin cover the kippah (the payot still show under the hat, not in the pumpkin);
    // the Star of David replaces the cat's own tag
    this.root.classList.toggle('hatted', next.has('witch'));
    this.root.classList.toggle('haskippah', next.has('kippah'));
    this.root.classList.toggle('hasstar', next.has('starofdavid'));
    // the Habibi pack: the keffiyeh covers the ears and the back hair (pet.css), and the kippah if both are on
    this.root.classList.toggle('haskeffiyeh', next.has('keffiyeh'));
    this.root.classList.toggle('hasbisht', next.has('bisht'));
    this.root.classList.toggle('hasmummy', next.has('mummy'));   // (a drawing whose bandages take the place of something: a lab's own stylesheet)
    // the emo pack: the beanie covers the emo hair item, the cat's own mop and ears and a zombie's brain (pet.css); the
    // clothes, the wristbands and the piercings each say they are on, for any part of a drawing they replace
    this.root.classList.toggle('hasbeanie', next.has('beanie'));
    this.root.classList.toggle('hasemofit', next.has('emofit'));
    this.root.classList.toggle('haswrist', next.has('wristbands'));
    this.root.classList.toggle('haspiercings', next.has('piercings'));
    this.placeHalo();
    const frog = this.character === 'frog';
    // the sleep z's rise beside the head; the frog's pumpkin fills that air, so they start a little further out
    const zzz = this.el.zzz as HTMLElement | null;
    if (zzz) zzz.style.transform = this.own?.zzzAt?.() ?? (next.has('pumpkin') ? (frog ? 'translate(19px, 4px)' : 'translate(14px, 0)') : next.has('beanie') && !next.has('witch') ? (frog ? 'translate(12px, -6px)' : this.character === 'sahur' ? 'translate(12px, -8px)' : 'translate(14px, -8px)') : next.has('keffiyeh') && !next.has('witch') ? (frog ? 'translate(8px, 0)' : this.character === 'cat' ? 'translate(12px, -2px)' : '') : '');
  }
  /** What it is wearing. */
  get wearing(): Costume[] { return COSTUMES.filter((c) => this.costumes.has(c)); }
  /** The emo hair item: a fringe in the head unit. Drawn only on characters that have one (the frog); the cat's own hair is the look. */
  setHair(on: boolean, ms = 240) {
    // asked again for what it already is (a room that opened dressed, then the page's own effect): nothing to fade
    const was = this.hairOn;
    this.hairOn = on; this.gild(); if (on !== was) this.toggle('emohair', on, ms);
    this.root.classList.toggle('hashair', on);   // pet.css: Sahur's kippah sits up on the hair
    this.placeHalo();
    if (this.lite) refreshPivots(this.root);
  }
  /** The halo floats over the hair; with a hat on it has to clear the tip of the cone, the pumpkin's stem, the kippah or the brain instead. */
  private placeHalo() {
    const frog = this.character === 'frog';
    const sahur = this.character === 'sahur';
    const c = this.costumes;
    const kippah = frog ? 4 : sahur ? (c.has('zombie') ? 16 : this.hairOn ? 14 : 6) : this.character === 'seal' && c.has('zombie') && !this.hairOn ? 26 : 14;
    // the keffiyeh: its cloth stands a little over the top of each head (the brain under it, a zombie's is no higher)
    const keffiyeh = frog ? 8 : sahur ? 12 : this.character === 'seal' ? 4 : 10;
    let lift = c.has('witch') ? 56 : c.has('pumpkin') ? (frog ? 24 : sahur ? 22 : 16) : c.has('beanie') ? (BEANIE_HALO[this.character] ?? 10) : c.has('keffiyeh') ? keffiyeh : c.has('kippah') ? kippah : c.has('zombie') ? (frog ? 14 : sahur ? 10 : 6) : 0;
    // the seal's halo floats close over its round head, where its crown sits: a crowned seal's halo rises over the crown
    // (and over the brain the crown perches on, for a zombie)
    if (this.character === 'seal' && this.crownOn && !c.has('witch') && !c.has('pumpkin') && !c.has('kippah') && !c.has('keffiyeh') && !this.hairOn) lift = Math.max(lift, c.has('zombie') ? 30 : 18);
    // (the frok's beanie stands tall: crowned, the crown sits up on it and the halo goes over the crown's points)
    if (frog && this.crownOn && c.has('beanie') && !c.has('witch') && !c.has('pumpkin')) lift += 12;
    lift = this.own?.haloLift?.() ?? lift;
    const halo = this.el.halo as HTMLElement | null;
    if (halo) halo.style.transform = lift ? `translateY(-${lift}px)` : '';
  }
  /** Show or hide a costume piece with a fade. Off means display:none, not opacity 0 (see setCostume). */
  private toggle(id: string, on: boolean, ms: number) {
    const e = this.el[id] as HTMLElement | null;
    if (!e) return;
    // (a twin is shown and hidden with its part; fade() fades it with it)
    const all = [e, ...((this.twins.get(e) ?? []) as HTMLElement[])];
    if (on) { for (const x of all) { x.style.display = 'inline'; x.style.opacity = '0'; } this.fade(e, 1, ms); }
    else if (e.style.display === 'inline') { this.fade(e, 0, ms); setTimeout(() => { if (e.style.opacity === '0') for (const x of all) x.style.display = 'none'; }, ms + 20); }
  }
  private stinkAnims: Animation[] = [];
  setDirty(on: boolean) {
    if (this.calm) {   // calm: the stink lines hang there and waft now and then (startCalmIdle), never looping
      this.fade(this.el.dirt, on ? 1 : 0, 500); this.fade(this.el.stink, on ? 1 : 0, 300); this.dirtyCalm = on;
      for (const s of this.q.get('s') ?? []) (s as HTMLElement).style.opacity = on ? '0.7' : '0';
      return;
    }
    this.fade(this.el.dirt, on ? 1 : 0, 500);
    if (on && this.stinkAnims.length === 0 && !reduceMotion()) {
      this.fade(this.el.stink, 1, 300);
      (this.q.get('s') ?? []).forEach((s, i) => { (s as HTMLElement).style.opacity = '1'; this.stinkAnims.push(s.animate(K.stinkWave, { duration: 2400, iterations: Infinity, easing: 'ease-in-out', delay: i * 800 })); });
    } else if (!on && this.stinkAnims.length) {
      this.fade(this.el.stink, 0, 300);
      const anims = this.stinkAnims; this.stinkAnims = [];
      setTimeout(() => anims.forEach((a) => a.cancel()), 320);
    }
  }

  // ---- held poses ----
  /** Hold a pose under a key; a second hold with the same key replaces the first smoothly. */
  private hold(key: string, build: (H: (e: Element | null | undefined, kf: KF, o?: Opts) => void, M: (es: Element[] | undefined, kf: KF, o?: Opts) => void) => void, ms = 280) {
    if (this.holds.has(key)) this.release(key, ms);
    if (reduceMotion()) return;
    const anims: Animation[] = [];
    const H = (e: Element | null | undefined, kf: KF, o: Opts = {}) => { const a = keep(this.one(e, kf, { duration: ms, fill: 'forwards', easing: 'ease-out', ...ADD, ...o })); if (a) anims.push(a); };
    const M = (es: Element[] | undefined, kf: KF, o: Opts = {}) => anims.push(...this.many(es, kf, { duration: ms, fill: 'forwards', easing: 'ease-out', ...ADD, ...o }).map(keep));
    build(H, M);
    this.holds.set(key, anims);
  }
  /** Reverse a held pose over `ms`, then drop it. */
  release(key: string, ms = 300) {
    const anims = this.holds.get(key);
    if (!anims) return;
    this.holds.delete(key);
    if (key === 'panic') this.stare(false);
    if (key === 'eat') setTimeout(() => { if (!this.holds.has('eat')) this.armsBehind(false); }, ms);
    for (const a of anims) {
      const timing = a.effect?.getComputedTiming();
      if (timing && timing.iterations === Infinity) { this.stopLoop(a); continue; }
      try {
        // freeze the current value, then run it back to nothing over ms
        const progress = Math.min(1, Math.max(0, Number(timing?.progress ?? 1)));
        a.pause();
        a.effect?.updateTiming({ duration: ms, delay: 0, easing: 'ease-in-out' });
        a.currentTime = progress * ms;
        a.reverse();
        a.finished.then(() => a.cancel()).catch(() => {});
      } catch { a.cancel(); }
    }
  }
  /**
   * Drop a held pose this instant, no run-back. For a one-shot that carries on from the held value: `release(key, 1)`
   * still applies the whole held value on the first frame, on top of the one-shot's first keyframe, and the part
   * jumps to double for one frame.
   */
  private drop(key: string) {
    const anims = this.holds.get(key);
    if (!anims) return;
    this.holds.delete(key);
    for (const a of anims) a.cancel();
  }
  /** Release every held pose except the ones that define a lasting state (death). */
  releaseAll(ms = 300) { for (const k of [...this.holds.keys()]) if (k !== 'dead') this.release(k, ms); }
  holding(key: string) { return this.holds.has(key); }

  /** Lean into a direction of travel (whole body, head, tail, eyes). 0 straightens up. */
  lean(dir: Dir | 0) { this.leanTo(this.w(dir)); }
  private leanTo(dir: Dir | 0) {
    if (dir === 0) { this.release('lean'); return; }
    this.hold('lean', (H, M) => {
      H(this.el.figure, [{ transform: 'rotate(0)' }, { transform: `rotate(${dir * 4}deg)` }]);
      for (const h of this.heads) H(h, [{ transform: 'rotate(0)' }, { transform: `rotate(${dir * 3}deg)` }]);
      H(this.el.tail, [{ transform: 'rotate(0)' }, { transform: `rotate(${-dir * 10}deg)` }]);
      M(this.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: `translate(${dir * 12}%, 0)` }]);
    });
  }
  /** Look toward a point; dx/dy in -1..1. */
  look(dx: number, dy: number) {
    dx = this.w(dx);
    this.hold('look', (H, M) => {
      M(this.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * 14}%, ${dy * 10}%)` }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dx * 3}deg) translateY(${dy * 1.5}px)` }]);
    }, 220);
  }
  unlook() { this.release('look', 260); }
  /** Anticipation before a pounce. */
  crouch(dir: Dir) {
    dir = this.w(dir);
    this.hold('crouch', (H, M) => {
      H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(4px) scaleY(0.88) scaleX(1.06)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 4}deg) translateY(2px)` }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-22deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(22deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: `rotate(${-dir * 6}deg)` }]);
      M(this.q.get('pupil'), [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }]);
    }, 320);
  }
  /** Straining pose for the bathroom. */
  squat() {
    if (this.own?.squat) return this.own.squat();
    this.face('squeeze', 'frown', 200);
    this.hold('squat', (H) => {
      H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(7px) scaleY(0.83) scaleX(1.1)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(3deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(28deg) translateX(6px)' }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-24deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(24deg)' }]);
      H(this.el.cat, K.tremble, { duration: 90, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      H(this.el.pendant, K.pendantTremble, { duration: 120, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
    }, 420);
  }
  /** One straining push during the squat: the body squeezes, the head ducks, the mouth opens in a grimace. */
  async push(n: number) {
    const ms = 520 + n * 60; const k = 1 + n * 0.25;
    this.snd('voice.effort', { rate: 1 + n * 0.12, delay: ms * 0.3 / 1000 });
    const p = this.shot(ms, (A) => {
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-in' }, { transform: `translateY(${2 * k}px) scaleY(${1 - 0.04 * k}) scaleX(${1 + 0.03 * k})`, offset: 0.45, easing: 'ease-in-out' }, { transform: `translateY(${2 * k}px) scaleY(${1 - 0.04 * k}) scaleX(${1 + 0.03 * k})`, offset: 0.65, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `translateY(${3 * k}px) rotate(${2 * k}deg)`, offset: 0.45 }, { transform: `translateY(${3 * k}px) rotate(${2 * k}deg)`, offset: 0.65 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.45 }, { transform: 'rotate(-10deg)', offset: 0.65 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(10deg)', offset: 0.45 }, { transform: 'rotate(10deg)', offset: 0.65 }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: `rotate(${8 * k}deg)`, offset: 0.5 }, { transform: 'none', offset: 1 }]);
      A(this.el.pendant, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-5deg)', offset: 0.3 }, { transform: 'rotate(4deg)', offset: 0.6 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * 0.35); this.face('squeeze', 'open', 100);
    if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(1)' }, { transform: 'scale(0.7, 0.55)' }], { duration: ms * 0.5, ...ADD, fill: 'none', easing: 'ease-in-out' });
    await wait(ms * 0.35); this.face('squeeze', 'frown', 120);
    await p;
    await wait(120);
  }
  /**
   * `n` bites as one continuous rhythm: the head bobs in a sine, the mouth opens on the way
   * down and closes at the bottom, ears take turns, the body and tail keep time.
   */
  async eat(n: number, dir: Dir, onBite?: (i: number) => void) {
    dir = this.w(dir);
    const period = 640;
    const o: Opts = { duration: period, iterations: n, ...ADD, easing: 'linear' };
    if (!reduceMotion()) {
      // dip into the bowl (the head foreshortens a touch), come up, chew on the way, settle
      for (const h of this.heads) this.one(h, [
        { transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `translateY(7px) rotate(${dir * 1.5}deg) scaleY(0.97)`, offset: 0.3, easing: 'ease-in-out' },
        { transform: `translateY(7px) rotate(${dir * 1.5}deg) scaleY(0.97)`, offset: 0.42, easing: 'ease-in-out' }, { transform: `translateY(1px) rotate(${-dir * 0.5}deg)`, offset: 0.62, easing: 'ease-in-out' },
        { transform: 'translateY(2px)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
      ], o);
      for (const b of this.bodies) this.one(b, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(2px) scaleY(0.975)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'translateY(2px) scaleY(0.975)', offset: 0.44, easing: 'ease-in-out' }, { transform: 'none', offset: 0.7 }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.tail, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(6deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 0.6 }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(-8deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.05)', offset: 0.3 }, { transform: 'scaleX(1)', offset: 0.5 }, { transform: 'scaleX(1)', offset: 1 }], o);
    }
    const small = () => { if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(0.55)' }, { transform: 'scale(0.55)' }], { duration: period * 0.12, ...ADD, fill: 'none' }); };
    for (let i = 0; i < n; i++) {
      await wait(period * 0.16); this.face(undefined, 'open', 110);              // mouth opens on the way down
      await wait(period * 0.26); this.face(undefined, 'idle', 120); onBite?.(i); this.snd('bite');  // bite at the bottom
      await wait(period * 0.22); small(); this.face(undefined, 'open', 70); this.snd('bite', { v: 0.45, rate: 1.25, delay: 0.06 });       // chew, chew
      await wait(period * 0.1); this.face(undefined, 'idle', 70);
      await wait(period * 0.08); small(); this.face(undefined, 'open', 70);
      await wait(period * 0.1); this.face(undefined, 'idle', 80);
      await wait(period * 0.08);
    }
  }
  /** Two quick sniffs at something in front. */
  sniff() {
    this.snd('sniff');
    return this.shot(700, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(3px) scale(1.02)', offset: 0.22 }, { transform: 'translateY(1px)', offset: 0.42 }, { transform: 'translateY(4px) scale(1.025)', offset: 0.64 }, { transform: 'none', offset: 1 }]);
      A(this.el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.08) translateY(-1px)', offset: 0.22 }, { transform: 'scaleX(1)', offset: 0.42 }, { transform: 'scaleX(1.08) translateY(-1px)', offset: 0.64 }, { transform: 'scaleX(1)', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(7deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-7deg)', offset: 0.3 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(-7deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Lick the bowl clean: head low, sweeping side to side with the tongue out. */
  async lickBowl(dir: Dir) {
    dir = this.w(dir);
    this.face('happy', 'yum', 160);
    this.snd('lick', { n: 3, gap: 0.27, delay: 0.1 });
    await this.shot(900, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `translate(${-dir * 4}px, 6px) scaleY(0.97)`, offset: 0.3, easing: 'ease-in-out' }, { transform: `translate(${dir * 4}px, 7px) scaleY(0.97)`, offset: 0.6, easing: 'ease-in-out' }, { transform: `translate(${-dir * 2}px, 5px)`, offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** A pleased full-body shimmy. */
  shimmy() {
    if (this.own?.shimmy) return this.own.shimmy();
    return this.shot(640, (A) => {
      for (const b of this.bodies) A(b, [{ transform: 'none', offset: 0 }, { transform: 'translateX(-3px) rotate(-1.5deg)', offset: 0.17 }, { transform: 'translateX(3px) rotate(1.5deg)', offset: 0.34 }, { transform: 'translateX(-3px) rotate(-1.5deg)', offset: 0.5 }, { transform: 'translateX(3px) rotate(1.5deg)', offset: 0.67 }, { transform: 'translateX(-1.5px)', offset: 0.84 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateX(-1px) rotate(-2.5deg)', offset: 0.17 }, { transform: 'translateX(1px) rotate(2.5deg)', offset: 0.34 }, { transform: 'translateX(-1px) rotate(-2.5deg)', offset: 0.5 }, { transform: 'translateX(1px) rotate(2.5deg)', offset: 0.67 }, { transform: 'translateX(-0.5px) rotate(-1deg)', offset: 0.84 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(12deg)', offset: 0.25 }, { transform: 'rotate(-10deg)', offset: 0.5 }, { transform: 'rotate(8deg)', offset: 0.75 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]); A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-8deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Bunny kicks: the hind feet take turns, fast. */
  bunnyKick(n = 5) {
    const per = 170;
    this.snd('pat', { n, gap: per / 1000, v: 0.7 });
    return this.shot(per * n, (A) => {
      A(this.el.footL, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(-7px) rotate(-12deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], { duration: per, iterations: n });
      A(this.el.footR, [{ transform: 'translateY(-7px) rotate(12deg)', offset: 0, easing: 'ease-in-out' }, { transform: 'none', offset: 0.5, easing: 'ease-in-out' }, { transform: 'translateY(-7px) rotate(12deg)', offset: 1 }], { duration: per, iterations: n });
      for (const b of this.bodies) A(b, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateX(2px) rotate(1deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], { duration: per, iterations: n });
      A(this.el.tail, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(14deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }], { duration: per * 2, iterations: Math.ceil(n / 2) });
    });
  }
  /** Caught out: wide eyes, small mouth, ears back. */
  sheepish() {
    this.face('open', 'open', 140);
    if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(0.6)' }, { transform: 'scale(0.6)' }], { duration: 900, ...ADD, fill: 'none' });
    this.hold('sheep', (H, M) => {
      M(this.q.get('pupil'), [{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-16deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(16deg)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(2px)' }]);
    }, 200);
  }
  /** A curious head tilt toward side `dir`. */
  tilt(dir: Dir) {
    dir = this.w(dir);
    if (this.own?.tilt) { this.own.tilt(dir); return; }
    const deg = (this.character === 'sahur' ? 6 : 11) * (this.own?.headTurn ?? 1);   // a log tilts less at the neck than a cat's head
    this.hold('tilt', (H) => { for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * deg}deg) translateY(1px)` }]); }, 380);
  }
  /** A quick tentative paw tap at something on side `dir`. */
  pat(dir: Dir) {
    dir = this.w(dir);
    if (this.own?.pat) return this.own.pat(dir);
    if (this.character === 'seal') return this.patSeal(dir);
    if (this.character === 'frog') {
      // the frog's arms hang high on a tall body: it leans over the ball and lays its near hand on top of it
      const b = this.bow(15, 0);
      return this.shot(380, (A) => {
        for (const bb of this.bodies) A(bb, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: b.body, offset: 0.45, easing: 'ease-in-out' }, { transform: b.body, offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: b.head, offset: 0.45, easing: 'ease-in-out' }, { transform: b.head, offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-26deg) translateY(-2px)', offset: 0.45, easing: 'ease-in' }, { transform: 'rotate(-26deg)', offset: 0.62, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
    }
    if (this.character === 'sahur') {
      // on his left the bat taps the ball (the arm lifts it out and lets it drop); on his right the free hand
      // reaches over, the whole log leaning after it. (A positive rotation swings a hanging arm to the left.)
      if (dir < 0) {
        return this.shot(360, (A) => {
          A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(26deg)', offset: 0.42, easing: 'ease-in' }, { transform: 'rotate(-2deg)', offset: 0.64, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
          A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-5deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
          for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-4deg) translateY(2px)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
        });
      }
      // his hands hang 45 units above the floor, so a straight swing never reaches a ball down there: the whole log
      // bends 50 from the hips with the free arm hanging plumb (-50 undoes the bend), which puts the fingertips into
      // the top of a ball 78 world units to his right (the director creeps him that close; the hand's bottom lands
      // at world y 355, the ball's top is 346); the bat arm swings back for balance
      return this.shot(420, (A, M) => {
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(50deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(50deg)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-50deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(-46deg)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(40deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(40deg)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(8%, 22%)', offset: 0.45 }, { transform: 'translate(8%, 22%)', offset: 0.62 }, { transform: 'none', offset: 1 }]);
      });
    }
    const leg = dir < 0 ? this.el.legL : this.el.legR;
    return this.shot(300, (A) => {
      A(leg, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 40}deg) translateY(-10px)`, offset: 0.4, easing: 'ease-in' }, { transform: `rotate(${dir * 42}deg) translateY(-4px)`, offset: 0.62, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 2}deg) translateY(1px)`, offset: 0.5 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** The pre-pounce butt wiggle. */
  wiggleButt() {
    return this.shot(660, (A) => {
      for (const b of this.bodies) A(b, [{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(-3px)', offset: 0.17 }, { transform: 'translateX(3px)', offset: 0.34 }, { transform: 'translateX(-3px)', offset: 0.5 }, { transform: 'translateX(3px)', offset: 0.67 }, { transform: 'translateX(-2px)', offset: 0.84 }, { transform: 'translateX(0)', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.tail, [{ transform: 'rotate(0)', offset: 0 }, { transform: 'rotate(-14deg)', offset: 0.17 }, { transform: 'rotate(10deg)', offset: 0.34 }, { transform: 'rotate(-14deg)', offset: 0.5 }, { transform: 'rotate(10deg)', offset: 0.67 }, { transform: 'rotate(-8deg)', offset: 0.84 }, { transform: 'rotate(0)', offset: 1 }], { easing: 'ease-in-out' });
      for (const h of this.heads) A(h, [{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(1.5px)', offset: 0.17 }, { transform: 'translateX(-1.5px)', offset: 0.34 }, { transform: 'translateX(1.5px)', offset: 0.5 }, { transform: 'translateX(-1.5px)', offset: 0.67 }, { transform: 'translateX(0)', offset: 1 }], { easing: 'ease-in-out' });
    });
  }
  /** Holding the ball between the paws. */
  hug() {
    this.face('happy', 'smile', 200);
    if (this.own?.hug) { this.own.hug(); return; }
    if (this.character === 'seal') { this.hugSeal(); return; }
    if (this.character === 'frog') {
      // leaning over the ball at its feet, both arms forward around it, looking down at it
      const b = this.bow(8, 12);
      this.hold('hug', (H) => {
        for (const bb of this.bodies) H(bb, [{ transform: 'none' }, { transform: b.body }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: b.head }]);
        H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(-24deg)' }]);
        H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(24deg)' }]);
        H(this.el.tail, K.wag, { duration: 520, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
      }, 360);
      return;
    }
    if (this.character === 'sahur') {
      // bent over the ball at his feet: the log squats a little, the head dips to look at it, the free hand swings
      // in across it and the bat comes in close beside his foot
      this.hold('hug', (H) => {
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(7px) rotate(-3deg)' }]);
        H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(32deg)' }]);
        H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(-7deg)' }]);
      }, 360);
      return;
    }
    this.hold('hug', (H) => {
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(14deg) translateY(-2px)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-14deg) translateY(-2px)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(-3deg)' }]);
      H(this.el.tail, K.wag, { duration: 520, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
    }, 360);
  }
  /** Hunker down over a bowl in front, a little to side `dir`: body low, head down into it. */
  /**
   * The frog's arms are drawn over the head (their own group after it), so a raised arm is in front of his face.
   * When he bows face-down into a bowl that puts the arms over his eating face, so for that pose the group is
   * moved behind the head in the DOM (animations stay on the elements through a move) and back afterwards.
   */
  private armsHome: Element | null = null;
  armsBehind(on: boolean) {
    const arms = this.el.arms; const head = this.el.head;
    if (!arms || !head || !head.parentNode) return;
    if (on) { if (!this.armsHome) this.armsHome = arms.nextElementSibling; head.parentNode.insertBefore(arms, head); }
    else if (this.armsHome) { head.parentNode.insertBefore(arms, this.armsHome); this.armsHome = null; }
  }
  eatPose(dir: Dir) {
    dir = this.w(dir);
    if (this.character === 'frog') {
      // face down into the bowl: a deep bow from the hips, the head bent on past it, the body hunched
      const b = this.bow(16, 56, 0.9, 0, 12);
      this.armsBehind(true);
      this.hold('eat', (H) => {
        for (const bb of this.bodies) H(bb, [{ transform: 'none' }, { transform: b.body }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: b.head }]);
        H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-8deg)' }]);
      }, 560);
      return;
    }
    this.hold('eat', (H) => {
      // the whole front hunches: shoulders drop with the body squash, the head unit follows them down and a little further
      for (const b of this.bodies) H(b, [{ transform: 'none' }, { transform: 'translateY(4px) scaleY(0.88) scaleX(1.04)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 5}deg) translate(${dir * 2}px, 26px)` }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-10deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-14deg)' }]);
    }, 520);
  }
  /** Lean into a stroke from side `dir`. */
  nuzzle(dir: Dir) {
    dir = this.w(dir);
    if (this.own?.nuzzle) { this.own.nuzzle(dir); return; }
    this.face('happy', 'smile', 200);
    this.hold('nuzzle', (H) => {
      const deg = (this.character === 'sahur' ? 5 : 9) * (this.own?.headTurn ?? 1);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * deg}deg) translate(${dir * 3}px, 2px)` }]);
      H(this.el.figure, [{ transform: 'none' }, { transform: `rotate(${dir * 2}deg)` }]);
      H(this.el.cat, K.purr, { duration: 80, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      H(this.el.tail, K.wag, { duration: 600, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
    }, 320);
  }
  /** Sunk into the tub: only the top half shows. */
  soak() {
    this.hold('soak', (H) => {
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-8deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(8deg)' }]);
      H(this.el.fringe, [{ transform: 'none' }, { transform: 'translateY(2px) rotate(1deg)' }]);
    }, 400);
  }

  // ---- loops with handles ----
  private loop(build: (L: (e: Element | null | undefined, kf: KF, o: Opts) => void, M: (es: Element[] | undefined, kf: KF, o: Opts) => void) => void): LoopHandle {
    const anims: Animation[] = [];
    if (!reduceMotion()) {
      const L = (e: Element | null | undefined, kf: KF, o: Opts) => { const a = this.one(e, kf, { iterations: Infinity, ...ADD, ...o }); if (a) anims.push(a); };
      const M = (es: Element[] | undefined, kf: KF, o: Opts) => anims.push(...this.many(es, kf, { iterations: Infinity, ...ADD, ...o }));
      build(L, M);
    }
    let stopped = false;
    return {
      stop: async () => {
        if (stopped) return; stopped = true;
        for (const a of anims) this.stopLoop(a);
        await wait(320);
      },
    };
  }
  /** The walk cycle: a bouncy front-facing shuffle leaning into `dir`. `cadence` is ms per hop. */
  walk(dir: Dir, cadence = 380): LoopHandle {
    dir = this.w(dir);
    this.leanTo(dir);
    const dur = cadence * 2;
    const leg = (sign: number): KF => [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${sign * dir * 14}deg)`, offset: 0.25, easing: 'ease-in-out' },
      { transform: 'rotate(0)', offset: 0.5, easing: 'ease-in-out' }, { transform: `rotate(${-sign * dir * 14}deg)`, offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    const pend: KF = [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${-dir * 9}deg)`, offset: 0.16, easing: 'ease-in-out' }, { transform: `rotate(${dir * 6}deg)`, offset: 0.4, easing: 'ease-in-out' },
      { transform: 'rotate(0)', offset: 0.5, easing: 'ease-out' }, { transform: `rotate(${-dir * 9}deg)`, offset: 0.66, easing: 'ease-in-out' }, { transform: `rotate(${dir * 6}deg)`, offset: 0.9, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    const tail: KF = [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 7}deg)`, offset: 0.28, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 0.5, easing: 'ease-in-out' },
      { transform: `rotate(${-dir * 7}deg)`, offset: 0.78, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    const rock: KF = [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${dir * 2.5}deg)`, offset: 0.25, easing: 'ease-in-out' },
      { transform: 'rotate(0)', offset: 0.5, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 1.5}deg)`, offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    // sahur: the near arm carries the bat, so it only ever lifts outward (a swing inward would put the tip through
    // the floor), and his legs are legs. He side-steps: on every hop the leading leg (the one toward `dir`) reaches
    // out that way and the trailing one pushes off the other way, and both come together as he lands. Both hops of
    // the cycle are the same. (A positive rotation swings a hanging leg to the screen's left.)
    const sahur = this.character === 'sahur';
    const batArm: KF = [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(9deg)', offset: 0.25, easing: 'ease-in-out' },
      { transform: 'rotate(0)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'rotate(9deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    const stride = (deg: number): KF => [
      { transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${deg}deg)`, offset: 0.25, easing: 'ease-in-out' },
      { transform: 'rotate(0)', offset: 0.5, easing: 'ease-out' }, { transform: `rotate(${deg}deg)`, offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
    ];
    const leadL = dir < 0;   // walking left, the left leg leads
    const handle = this.loop((L, M) => {
      const o: Opts = { duration: dur, easing: 'linear' };
      L(this.el.figure, K.hop2, o); L(this.el.figure, rock, o); L(this.el.shadow, K.shadowHop, o);
      const arms = this.own?.walkArms?.(dir);
      if (arms) { for (const [id, kf] of Object.entries(arms)) L(this.el[id] ?? this.root.querySelector('#' + id), kf, o); }
      else { L(this.el.legL, sahur ? batArm : leg(1), o); L(this.el.legR, leg(-1), o); }
      const legs = this.own?.walkLegs?.(dir);
      L(this.el.footL, legs?.footL ?? (sahur ? stride(leadL ? 15 : 6) : K.feetDangle), o); L(this.el.footR, legs?.footR ?? (sahur ? stride(leadL ? -6 : -15) : K.feetDangle), o);
      for (const h of this.heads) L(h, K.headLag, o);
      L(this.el.fringe, K.fringeLag, o); L(this.el.earL, K.earBounce, o); L(this.el.earR, K.earBounce, o);
      L(this.el.pendant, pend, o); L(this.el.tail, tail, o);
      void M;
    });
    // a step at each landing (every `cadence` ms)
    const steps = this.sound && !reduceMotion() ? setInterval(() => this.snd('step'), cadence) : null;
    return { stop: async () => { if (steps) clearInterval(steps); this.leanTo(0); await handle.stop(); } };
  }
  wag(): LoopHandle { return this.loop((L) => L(this.el.tail, K.wag, { duration: 480, direction: 'alternate', easing: 'ease-in-out' })); }
  wiggle(): LoopHandle {
    return this.loop((L) => {
      L(this.el.figure, K.wiggle, { duration: 240, direction: 'alternate', easing: 'ease-in-out' });
      for (const h of this.heads) L(h, K.wiggleHead, { duration: 240, direction: 'alternate', easing: 'ease-in-out', delay: -60 });
      L(this.el.fringe, [{ transform: 'rotate(2deg)' }, { transform: 'rotate(-2deg)' }], { duration: 240, direction: 'alternate', easing: 'ease-in-out', delay: -100 });
    });
  }

  // ---- one-shots ----
  private shot(ms: number, build: (A: (e: Element | null | undefined, kf: KF, o?: Opts) => void, M: (es: Element[] | undefined, kf: KF, o?: Opts) => void) => void): Promise<void> {
    if (!reduceMotion()) {
      const A = (e: Element | null | undefined, kf: KF, o: Opts = {}) => { this.one(e, kf, { duration: ms, ...ADD, ...o }); };
      const M = (es: Element[] | undefined, kf: KF, o: Opts = {}) => { this.many(es, kf, { duration: ms, ...ADD, ...o }); };
      build(A, M);
    }
    return wait(ms);
  }
  hairflick() {
    return this.shot(900, (A, M) => {
      A(this.el.fringe, K.hairflick); for (const h of this.heads) A(h, K.flickHead); A(this.el.crownlift, K.crownLift);
      M(this.q.get('pupil'), K.glanceRight);
    });
  }
  /** One big jump; the director moves the body across the floor at the same time. */
  jump(ms = 620) {
    this.snd('jump');
    return this.shot(ms, (A) => {
      A(this.el.figure, K.jump); A(this.el.shadow, K.shadowJump, { composite: 'replace' });
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-14deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(14deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
      A(this.el.fringe, [{ transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.22 }, { transform: 'translateY(-4px)', offset: 0.6 }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(18deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
      A(this.el.pendant, K.pendantSwing);
    });
  }
  /**
   * A high straight-up jump with cartoon hang time; rest at both ends. Phases (fractions of ms):
   * 0–0.12 squash, 0.12–0.4 rise, 0.4–0.64 hang, 0.64–0.86 fall, 0.86–1 landing squash.
   */
  superJump(ms = 1300, height = 100) {
    const h = -height;
    this.snd('leap', { dur: ms * 0.5 / 1000, delay: ms * 0.1 / 1000 });
    return this.shot(ms, (A) => {
      A(this.el.figure, [
        { transform: 'none', offset: 0, easing: 'ease-in' },
        { transform: 'translateY(6px) scaleY(0.86) scaleX(1.1)', offset: 0.12, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: `translateY(${h}px) scaleY(1.1) scaleX(0.94)`, offset: 0.4, easing: 'ease-in-out' },
        { transform: `translateY(${h - 6}px) scaleY(1.02) scaleX(0.99)`, offset: 0.52, easing: 'ease-in-out' },
        { transform: `translateY(${h}px) scaleY(1.06) scaleX(0.97)`, offset: 0.64, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'translateY(0) scaleY(0.88) scaleX(1.08)', offset: 0.86, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'scaleY(1.03) scaleX(0.99)', offset: 0.94, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 },
      ]);
      A(this.el.shadow, [{ transform: 'scaleX(1)', opacity: 0.55, offset: 0 }, { transform: 'scaleX(1)', offset: 0.12 }, { transform: 'scaleX(0.55)', opacity: 0.3, offset: 0.4 }, { transform: 'scaleX(0.55)', opacity: 0.3, offset: 0.64 }, { transform: 'scaleX(1)', opacity: 0.55, offset: 0.86 }, { transform: 'scaleX(1)', offset: 1 }], { composite: 'replace' });
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.12 }, { transform: 'rotate(-18deg)', offset: 0.4 }, { transform: 'rotate(-12deg)', offset: 0.64 }, { transform: 'rotate(10deg)', offset: 0.88 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-8deg)', offset: 0.12 }, { transform: 'rotate(18deg)', offset: 0.4 }, { transform: 'rotate(12deg)', offset: 0.64 }, { transform: 'rotate(-10deg)', offset: 0.88 }, { transform: 'none', offset: 1 }]);
      A(this.el.fringe, [{ transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.14 }, { transform: 'translateY(-6px)', offset: 0.42 }, { transform: 'translateY(-3px)', offset: 0.64 }, { transform: 'translateY(4px)', offset: 0.88 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.14 }, { transform: 'translateY(-3px)', offset: 0.44 }, { transform: 'translateY(-1px)', offset: 0.64 }, { transform: 'translateY(4px)', offset: 0.9 }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(6deg)', offset: 0.12 }, { transform: 'rotate(-22deg)', offset: 0.42 }, { transform: 'rotate(-16deg)', offset: 0.64 }, { transform: 'rotate(10deg)', offset: 0.88 }, { transform: 'none', offset: 1 }]);
      A(this.el.footL, [{ transform: 'none', offset: 0 }, { transform: 'translateY(4px)', offset: 0.45 }, { transform: 'translateY(4px)', offset: 0.64 }, { transform: 'none', offset: 0.86 }, { transform: 'none', offset: 1 }]);
      A(this.el.footR, [{ transform: 'none', offset: 0 }, { transform: 'translateY(4px)', offset: 0.45 }, { transform: 'translateY(4px)', offset: 0.64 }, { transform: 'none', offset: 0.86 }, { transform: 'none', offset: 1 }]);
      A(this.el.pendant, [{ transform: 'none', offset: 0 }, { transform: 'rotate(0)', offset: 0.12 }, { transform: 'rotate(-6deg)', offset: 0.3 }, { transform: 'rotate(4deg)', offset: 0.5 }, { transform: 'rotate(-3deg)', offset: 0.7 }, { transform: 'rotate(8deg)', offset: 0.9 }, { transform: 'none', offset: 1 }]);
    });
  }
  land() {
    this.snd('land');
    return this.shot(320, (A) => {
      A(this.el.figure, K.land); for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
      A(this.el.fringe, [{ transform: 'none', offset: 0 }, { transform: 'translateY(2px)', offset: 0.35 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, K.earWiggle); A(this.el.earR, K.earWiggle);
    });
  }
  hop() {
    this.snd('hop'); this.snd('step', { delay: 0.3 });
    return this.shot(420, (A) => {
      A(this.el.figure, K.hopSmall); A(this.el.shadow, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(0.85)', offset: 0.42 }, { transform: 'scaleX(1)', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(2px)', offset: 0.12 }, { transform: 'translateY(-2px)', offset: 0.5 }, { transform: 'translateY(2px)', offset: 0.78 }, { transform: 'none', offset: 1 }]);
      A(this.el.pendant, K.pendantSwing);
    });
  }
  /** Swipe a paw at something on side `dir`. */
  bat(dir: Dir) {
    dir = this.w(dir);
    if (this.own?.bat) return this.own.bat(dir);
    if (this.character === 'seal') return this.batSeal(dir);
    if (this.character === 'frog') {
      // a lean and a big forward swing of the far arm, out from behind the body and through the ball
      const b = this.bow(12, 0);
      return this.shot(340, (A) => {
        for (const bb of this.bodies) A(bb, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: b.body, offset: 0.4, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: b.head, offset: 0.4, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(50deg) translateY(-3px)', offset: 0.35, easing: 'ease-in' }, { transform: 'rotate(-4deg)', offset: 0.72, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
    }
    if (this.character === 'sahur') {
      // on his left: a quick wind-up inward and the bat sweeps out through the ball; on his right the free hand
      // swats the same way. The log whips with it. The director squashes the ball at 110 ms: the sweep is through by then.
      if (dir < 0) {
        return this.shot(340, (A) => {
          A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: 'rotate(-34deg)', offset: 0.16, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: 'rotate(56deg)', offset: 0.4, easing: 'ease-out' }, { transform: 'rotate(30deg)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
          A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: 'rotate(2deg)', offset: 0.16 }, { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.42 }, { transform: 'none', offset: 1 }]);
          for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-5deg)', offset: 0.45 }, { transform: 'none', offset: 1 }]);
        });
      }
      // the free hand cannot reach the floor from upright (see pat): the log lunges 60 from the hips as the arm winds
      // in, then the hand sweeps out along the floor, through the middle of the ball at 0.34 (the arm plumb, -60,
      // cancels the bend there: the hand's bottom is at world y 369, the ball's centre; measured, 44 only grazed its
      // top; the director squashes the ball at 110 ms) and on out past it, then everything comes back up
      return this.shot(340, (A, M) => {
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in' }, { transform: 'rotate(34deg)', offset: 0.12, easing: 'ease-out' }, { transform: 'rotate(60deg)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'rotate(60deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'rotate(36deg)', offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: 'rotate(24deg)', offset: 0.12, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: 'rotate(-60deg)', offset: 0.34, easing: 'ease-out' }, { transform: 'rotate(-92deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'rotate(-70deg)', offset: 0.72, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in' }, { transform: 'rotate(46deg)', offset: 0.34, easing: 'ease-out' }, { transform: 'rotate(46deg)', offset: 0.5 }, { transform: 'rotate(0)', offset: 1 }]);
        M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(10%, 20%)', offset: 0.34 }, { transform: 'translate(12%, 10%)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
      });
    }
    const leg = dir < 0 ? this.el.legL : this.el.legR;
    return this.shot(340, (A) => {
      A(leg, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 42}deg) translateY(-6px)`, offset: 0.35, easing: 'ease-in' }, { transform: `rotate(${-dir * 6}deg)`, offset: 0.72, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateX(${dir * 2}px)`, offset: 0.35 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg)`, offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** One bite: head dips, mouth opens and closes, an ear wiggles. */
  async chomp(dir: Dir) {
    dir = this.w(dir);
    this.face(undefined, 'open', 90);
    this.snd('bite', { delay: 0.18 });
    const p = this.shot(360, (A) => {
      for (const h of this.heads) A(h, K.chompHead); A(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(1.5px) scaleY(0.99)', offset: 0.45 }, { transform: 'none' }]);
      A(dir < 0 ? this.el.earL : this.el.earR, K.earWiggle);
    });
    await wait(190);
    this.face(undefined, 'idle', 90);
    await p;
  }
  async lick() {
    this.face('happy', 'yum', 160);
    this.snd('lick', { delay: 0.18 });
    await this.shot(760, (A) => { for (const h of this.heads) A(h, K.lickHead); });
  }
  /** Shake off water. */
  shake() {
    return this.shot(760, (A) => {
      for (const h of this.heads) A(h, K.shakeHead); A(this.el.figure, K.shakeBody);
      A(this.el.earL, K.shakeEar); A(this.el.earR, K.shakeEar); A(this.el.fringe, K.shakeFringe); A(this.el.pendant, K.pendantSwing);
    });
  }
  /** Wake-up stretch with a yawn. */
  async stretch() {
    this.snd('voice.yawn', { delay: 0.4, v: 0.8 });
    if (this.own?.stretch) return this.own.stretch();
    const ms = 1500;
    const p = this.shot(ms, (A) => {
      A(this.el.figure, K.stretchBody); for (const h of this.heads) A(h, K.stretchHead);
      A(this.el.legL, K.legStretch); A(this.el.legR, K.legStretch);
      A(this.el.earL, K.perkL, { delay: ms * 0.65, duration: ms * 0.35 }); A(this.el.earR, K.perkR, { delay: ms * 0.65, duration: ms * 0.35 });
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-14deg)', offset: 0.45 }, { transform: 'rotate(-14deg)', offset: 0.68 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * 0.3); this.face('closed', 'open', 160);
    if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: ms * 0.5, ...ADD, easing: 'ease-in-out' });
    await wait(ms * 0.45); this.face('open', 'idle', 200);
    await p;
  }
  /** A sleepy yawn: head tips back, mouth wide, eyes shut, ears back, then a shake of the head. */
  async yawn() {
    this.snd('voice.yawn', { delay: 0.2 });
    if (this.own?.yawn) return this.own.yawn();
    const ms = 1600;
    const p = this.shot(ms, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.3 }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(1.5deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-18deg)', offset: 0.3 }, { transform: 'rotate(-18deg)', offset: 0.62 }, { transform: 'rotate(6deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(18deg)', offset: 0.3 }, { transform: 'rotate(18deg)', offset: 0.62 }, { transform: 'rotate(-6deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      for (const b of this.bodies) A(b, [{ transform: 'none', offset: 0 }, { transform: 'scaleY(1.03)', offset: 0.35 }, { transform: 'scaleY(1.03)', offset: 0.6 }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * 0.14); this.face('closed', 'open', 200);
    if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(1)' }, { transform: 'scale(1.6, 1.7)', offset: 0.4 }, { transform: 'scale(1.6, 1.7)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: ms * 0.6, ...ADD, easing: 'ease-in-out' });
    await wait(ms * 0.56); this.face('open', 'idle', 220);
    await p;
  }
  /** Stomach growl. */
  async rumble() {
    this.face(undefined, 'frown', 160);
    this.snd('tummy');
    await this.shot(900, (A) => { for (const b of this.bodies) A(b, K.rumble); for (const h of this.heads) A(h, K.rumbleHead); A(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-14deg)', offset: 0.4 }, { transform: 'none' }]); A(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(14deg)', offset: 0.4 }, { transform: 'none' }]); });
    this.restFace();
  }
  /** Ears up, eyes up: noticed something. */
  perk() {
    return this.shot(500, (A, M) => {
      A(this.el.earL, K.perkL); A(this.el.earR, K.perkR);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(-2px)', offset: 0.35 }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
    });
  }
  sweat() { return this.shot(900, (A) => A(this.el.sweat, K.sweatOnce, { composite: 'replace' })); }
  sparkleCrown() {
    return this.shot(900, (A) => { A(this.el.glintL, K.sparkle, { composite: 'replace' }); A(this.el.glintC, K.sparkle, { composite: 'replace', delay: 150 }); A(this.el.glintR, K.sparkle, { composite: 'replace', delay: 300 }); });
  }

  // ---- the frog's own actions (screenshot, slap, squeeze, burn); nothing here is used by the cat ----
  /** Which way it faces, as the room sees it. */
  get facingDir(): Dir { return this.flipped ? -1 : 1; }
  /** Eyes held wide: no blinking (popped eyes with a lid sliding over them read as a lump on the head). */
  private stare(on: boolean) {
    for (const b of this.blinks) {
      if (on) { b.pause(); try { b.currentTime = 0; } catch { /* fine */ } } else b.play();
    }
  }
  /**
   * The camera. It is drawn at the near sleeve's end but as its own group over the head (#camera, turned in
   * lockstep with #legL about the sleeve's pivot), with #camlevel inside it turning it back about its own centre
   * so he holds it level at any arm angle. frog.py bakes it level for CAMERA_ARM.
   */
  static readonly CAMERA_ARM = -90;     // the arm up: the camera in front of his chin
  static readonly CATCH_ARM = -58;      // the arm out low in front: where he catches it and looks at it
  private get camArm(): Element[] { return [this.el.legL, this.el.camera].filter((e): e is Element => !!e); }
  /** The counter-turn that keeps the camera level with the arm at `arm` degrees. */
  private static level(arm: number) { return `rotate(${-(arm - PetRig.CAMERA_ARM)}deg)`; }
  /** Sleeves out low in front, ready to catch something falling, eyes up on it. */
  catchPose() {
    this.face('open', 'open', 120);
    this.hold('camera', (H, M) => {
      M(this.camArm, [{ transform: 'none' }, { transform: `rotate(${PetRig.CATCH_ARM}deg)` }]);
      H(this.el.camlevel, [{ transform: 'none' }, { transform: PetRig.level(PetRig.CATCH_ARM) }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(34deg)' }]);
    }, 300);
    this.hold('camhead', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(-12deg) translateY(-3px)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(6%, -18%)' }]);
    }, 300);
  }
  /** Caught it, low in the sleeves: the body and the arms dip under the weight, then he looks down at it. */
  async caught() {
    this.face('open', 'idle', 200);
    const p = this.shot(380, (A, M) => {
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(5px) scaleY(0.93) scaleX(1.04)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      M(this.camArm, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(9deg)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.camlevel, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-9deg)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(4px)', offset: 0.35 }, { transform: 'none', offset: 1 }]);
    });
    await wait(200);
    // eyes down to what landed in his hands
    this.hold('camhead', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(16deg) translateY(3px)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(8%, 24%)' }]);
    }, 320);
    await p;
  }
  /**
   * Up from the catch to his chin: the near sleeve raises the camera, level all the way, the far sleeve settles
   * under it, the head comes up to look into the finder. Held on top of the catch pose as a difference, not a
   * replacement: replacing a hold runs the old one out while the new one runs in, and the two curves together
   * overshoot.
   */
  raiseCamera() {
    const d = PetRig.CAMERA_ARM - PetRig.CATCH_ARM;
    const ease = { easing: 'cubic-bezier(.45,0,.2,1)' };
    this.hold('raise', (H, M) => {
      M(this.camArm, [{ transform: 'none' }, { transform: `rotate(${d}deg)` }], ease);
      H(this.el.camlevel, [{ transform: 'none' }, { transform: `rotate(${-d}deg)` }], ease);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-14deg)' }], ease);
    }, 520);
    this.hold('raisehead', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(-8deg) translateY(-2px)' }], ease);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0, -6%)' }], ease);
    }, 520);
  }
  /** Lining the shot up: a slow lean back and settle, the camera hand steadying; ends at rest, so nothing snaps before the click. */
  aim() {
    return this.shot(900, (A, M) => {
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-3deg) translateX(-2px)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(-2.5deg) translateX(-2px)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      M(this.camArm, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(2deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(-1.5deg)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
    });
  }
  /** The shutter: a little recoil through him as it fires. */
  click() {
    return this.shot(260, (A, M) => {
      M(this.camArm, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(4deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translate(-2px, 1px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Show or hide the held camera. */
  setCamera(on: boolean) {
    const c = this.el.camera as HTMLElement | null; if (!c) return;
    c.style.display = on ? 'inline' : 'none';
  }
  /** The bulb in the held camera goes off. */
  flashBulb() {
    const b = this.el.cambulb as HTMLElement | null; if (!b) return;
    b.style.transformBox = 'fill-box'; b.style.transformOrigin = '50% 50%';
    b.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0.2, offset: 0.35 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, easing: 'ease-out' });
  }
  /** Where an element of the drawing sits on screen right now (its box's centre). */
  screenBox(id: string): DOMRect | null { const e = this.el[id]; return e ? e.getBoundingClientRect() : null; }
  /**
   * Fling what is in the near sleeve away, underarm: the arm swings down and back past the hip (he leans back
   * with it, eyes following it down), then whips forward and up and lets go in front of him, follows through and
   * settles. Underarm because the camera is drawn over the head: an overhead wind-up would put it in front of his
   * face. It stays level in his hand until the release. Resolves at the release point; `onRelease` fires there
   * too, so the director can hand the camera over to a flying prop.
   */
  async throwAway(onRelease: () => void) {
    // the holds end this instant and the throw starts from the same angles, so nothing jumps
    for (const k of ['camera', 'camhead', 'raise', 'raisehead']) this.drop(k);
    const ms = 900; const REL = 0.56; const A0 = PetRig.CAMERA_ARM;
    const arm = [A0, 36, 36, -66, -112, -40, -10, 0];                          // hold, back past the hip, a beat, release in front, follow through up, settle
    const off = [0, 0.3, 0.38, REL, 0.7, 0.84, 0.94, 1];
    const ease = ['cubic-bezier(.4,0,.6,1)', 'ease-in-out', 'cubic-bezier(.7,0,.9,.5)', 'ease-out', 'ease-in-out', 'ease-in-out', 'ease-in-out', 'ease-in-out'];
    const p = this.shot(ms, (A, M) => {
      M(this.camArm, arm.map((a, i) => ({ transform: `rotate(${a}deg)`, offset: off[i], easing: ease[i] })));
      A(this.el.camlevel, arm.map((a, i) => ({ transform: PetRig.level(a), offset: off[i], easing: ease[i] })));
      A(this.el.legR, [{ transform: 'rotate(20deg)', offset: 0, easing: 'cubic-bezier(.4,0,.6,1)' }, { transform: 'rotate(-12deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(-12deg)', offset: 0.38, easing: 'cubic-bezier(.7,0,.9,.5)' }, { transform: 'rotate(46deg)', offset: REL, easing: 'ease-out' }, { transform: 'rotate(30deg)', offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'rotate(8deg) translateY(1px)', offset: 0 }, { transform: 'rotate(16deg) translateY(3px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(16deg) translateY(3px)', offset: 0.38, easing: 'ease-in-out' }, { transform: 'rotate(-10deg) translateY(-3px)', offset: REL, easing: 'ease-out' }, { transform: 'rotate(-12deg) translateY(-3px)', offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: 'rotate(5deg) translateX(3px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'rotate(5deg) translateX(3px)', offset: 0.38, easing: 'ease-in-out' }, { transform: 'rotate(-5deg) translateX(-4px)', offset: REL, easing: 'ease-out' }, { transform: 'rotate(-3deg) translateX(-2px)', offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'translate(8%, 18%)', offset: 0 }, { transform: 'translate(-6%, 22%)', offset: 0.3 }, { transform: 'translate(-6%, 22%)', offset: 0.38 }, { transform: 'translate(10%, -12%)', offset: REL }, { transform: 'translate(10%, -14%)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * REL);
    onRelease();
    await p;
  }
  /** The near arm reaches back behind the body (fetching something from under the robe). */
  reachBack() {
    return this.shot(520, (A) => {
      A(this.el.legL, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(40deg) translateY(-3px)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(38deg)', offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-6deg) translateX(-2px)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
    });
  }
  /** A blink and a squint against a flash. */
  async wince(ms = 420) {
    this.face('squeeze', 'idle', 80);
    await wait(ms);
    this.face('happy', 'smile', 200);
  }
  /**
   * Struck from side `dir` (room direction): the head whips away and squashes, the body leans and the whole figure
   * staggers a step, then everything reels back in decaying swings. The mark appears on the cheek at the moment of
   * impact. The whip lands at 120 ms and holds a beat before the reel, so it reads and is not just a flicker.
   */
  async hit(dir: Dir) {
    dir = this.w(dir);
    this.face('squeeze', 'frown', 50);
    this.fade(this.el.slapmark, 1, 60);
    const p = this.shot(1300, (A, M) => {
      for (const h of this.heads) A(h, [
        { transform: 'none', offset: 0, easing: 'cubic-bezier(.1,.8,.2,1)' },
        { transform: `rotate(${-dir * 46}deg) translate(${-dir * 12}px, 5px) scale(0.88, 1.1)`, offset: 0.09, easing: 'ease-in-out' },
        { transform: `rotate(${-dir * 42}deg) translate(${-dir * 11}px, 4px) scale(1.05, 0.97)`, offset: 0.2, easing: 'ease-in-out' },
        { transform: `rotate(${dir * 18}deg) translate(${dir * 4}px, 0)`, offset: 0.38, easing: 'ease-in-out' },
        { transform: `rotate(${-dir * 10}deg)`, offset: 0.54, easing: 'ease-in-out' }, { transform: `rotate(${dir * 5}deg)`, offset: 0.7, easing: 'ease-in-out' },
        { transform: `rotate(${-dir * 2}deg)`, offset: 0.85, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
      ]);
      for (const b of this.bodies) A(b, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${-dir * 11}deg) scaleX(1.03)`, offset: 0.1, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 9}deg)`, offset: 0.2, easing: 'ease-in-out' }, { transform: `rotate(${dir * 4}deg)`, offset: 0.4, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.6, easing: 'ease-in-out' }, { transform: `rotate(${dir * 1}deg)`, offset: 0.78, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      // a stagger step away from the blow, and back
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `translateX(${-dir * 16}px)`, offset: 0.1, easing: 'ease-in-out' }, { transform: `translateX(${-dir * 15}px)`, offset: 0.24, easing: 'ease-in-out' }, { transform: `translateX(${dir * 3}px)`, offset: 0.48, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.legL, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 42}deg)`, offset: 0.12, easing: 'ease-out' }, { transform: `rotate(${dir * 36}deg)`, offset: 0.24 }, { transform: `rotate(${-dir * 10}deg)`, offset: 0.48 }, { transform: 'none', offset: 1 }]);
      A(this.el.legR, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 42}deg)`, offset: 0.12, easing: 'ease-out' }, { transform: `rotate(${-dir * 36}deg)`, offset: 0.24 }, { transform: `rotate(${dir * 10}deg)`, offset: 0.48 }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${-dir * 14}%, 6%) scale(0.8)`, offset: 0.1 }, { transform: `translate(${dir * 8}%, -4%) scale(0.8)`, offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
    await p;
  }
  /** Seeing stars: a slow loose wobble of the head with the eyes screwed shut. Held until released. */
  dazed() {
    this.face('squeeze', 'frown', 120);
    this.hold('dazed', (H) => {
      for (const h of this.heads) H(h, [{ transform: 'rotate(-6deg) translateY(1px)' }, { transform: 'rotate(6deg) translateY(2px)' }], { duration: 520, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
      H(this.el.figure, [{ transform: 'rotate(-1.5deg)' }, { transform: 'rotate(1.5deg)' }], { duration: 520, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out', delay: -180 });
    }, 200);
  }
  /** Peering down at something by the hem. */
  peer() {
    const b = this.bow(5, 20, 1, 0, 2);
    this.hold('peer', (H, M) => {
      for (const bb of this.bodies) H(bb, [{ transform: 'none' }, { transform: b.body }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: b.head }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(6%, 12%)' }]);
    }, 360);
  }
  /** Eyes wide in alarm: a jolt through the head, pupils shrink to dots, mouth gapes. A one-shot, so it ends at rest: hold what should stay (panic) alongside it. */
  alarm() {
    this.face('open', 'open', 90);
    return this.shot(420, (A, M) => {
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'scale(0.55)', offset: 0.25 }, { transform: 'scale(0.7)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(-5px) scale(1.06)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'translateY(-2px)', offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el['mouth-open'], [{ transform: 'none', offset: 0 }, { transform: 'scale(1.5, 1.9)', offset: 0.4 }, { transform: 'scale(1.2, 1.4)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** The slap mark on the cheek fades away. */
  clearMark(ms = 700) { this.fade(this.el.slapmark, 0, ms); }
  /**
   * In a giant grip: the body is crushed narrow and tall, the head bulges, and the eyes pop right out of it,
   * pupils shrunk to dots; the mouth gapes.
   */
  /** The robe is swapped for the pinched drawing (frog.py bakes it) or back, in one frame: a squeeze is a snap, not a fade. */
  private pinched(on: boolean) {
    const sq = this.el.bodysq as HTMLElement | null; const body = this.el.body as HTMLElement | null;
    if (!sq || !body) return;
    for (const e of this.bodiessq as HTMLElement[]) { e.style.display = on ? 'inline' : 'none'; e.style.opacity = on ? '1' : '0'; }
    for (const e of this.bodies as HTMLElement[]) e.style.opacity = on ? '0' : '1';
  }
  squeezed() {
    this.face('open', 'open', 120);
    this.stare(true);
    this.pinched(true);
    this.hold('squeezed', (H, M) => {
      // the head balloons (one piece: the eyes grow with it) with a pop, the eyes bulge out of it, the mouth gapes.
      // Both eyes get the one transform about one shared point (pet.css): the near eye carries both eyes' inked
      // rims, so anything that moves the eyes apart pulls the rims off the whites.
      const pop = { easing: 'cubic-bezier(.3,1.5,.5,1)' };
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.22, 1.16)' }], pop);
      M([this.el.eyeL, this.el.eyeR].filter((e): e is Element => !!e), [{ transform: 'none' }, { transform: 'scale(1.08)' }], pop);   // a touch: the head's outline is drawn over the whites' edges, and eyes that grow past them show it as a line
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'scale(0.36)' }]);
      H(this.el['mouth-open'], [{ transform: 'none' }, { transform: 'scale(1.8, 2.2)' }], pop);
      // the arms fly out sideways from the grip (the near one out behind him, the far one up in front, clear of
      // the claw), the feet splay
      H(this.el.legLsq, [{ transform: 'none' }, { transform: 'rotate(64deg)' }], pop);
      H(this.el.legRsq, [{ transform: 'none' }, { transform: 'rotate(78deg)' }], pop);   // out to the side, under a hat's brim
      H(this.el.footL, [{ transform: 'none' }, { transform: 'translate(-6px, -2px) rotate(-18deg)' }]);
      H(this.el.footR, [{ transform: 'none' }, { transform: 'translate(6px, -2px) rotate(18deg)' }]);
    }, 200);
  }
  /** One extra crush of the grip: the head pumps up a size, the arms jerk. */
  crush() {
    return this.shot(360, (A, M) => {
      for (const b of this.bodiessq) A(b, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'scaleX(0.94) scaleY(1.04)', offset: 0.4, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(-8px) scale(1.1)', offset: 0.4, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const e of [this.el.eyeL, this.el.eyeR]) A(e, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'scale(1.12)', offset: 0.4, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.legLsq, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(14deg)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.legRsq, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(12deg)', offset: 0.35, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      // the feet kick
      A(this.el.footL, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(-7px) rotate(-14deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 0.6 }, { transform: 'translateY(-3px)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.footR, [{ transform: 'none', offset: 0.1, easing: 'ease-out' }, { transform: 'translateY(-7px) rotate(14deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'none', offset: 0.75 }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'scale(0.8)', offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Let go: the robe snaps back and everything springs back with a wobble. */
  async unsqueeze() {
    this.release('squeezed', 320);
    this.pinched(false);
    this.stare(false);
    await this.shot(560, (A) => {
      for (const e of [this.el.eyeL, this.el.eyeR]) A(e, [{ transform: 'none', offset: 0 }, { transform: 'scale(1.16)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'scale(0.94)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const b of this.bodies) A(b, [{ transform: 'scaleX(0.9) scaleY(1.03)', offset: 0, easing: 'ease-out' }, { transform: 'scaleX(1.12) scaleY(0.95)', offset: 0.28, easing: 'ease-in-out' }, { transform: 'scaleX(0.96) scaleY(1.02)', offset: 0.56, easing: 'ease-in-out' }, { transform: 'scaleX(1.02)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      // the arms carry on from where the pinched body's arms were flung (squeezed: 64 and 78), then settle
      A(this.el.legL, [{ transform: 'rotate(64deg)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-8deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(3deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.legR, [{ transform: 'rotate(78deg)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-8deg)', offset: 0.45, easing: 'ease-in-out' }, { transform: 'rotate(3deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
    });
    this.face('open', 'frown', 200);
  }
  /** On fire: arms straight up and flailing, eyes wide, mouth wide open, screaming. Held until released. */
  panic() {
    this.face('open', 'open', 120);
    this.stare(true);
    this.hold('panic', (H, M) => {
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(146deg) translateY(-2px)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(146deg) translateY(-2px)' }]);
      H(this.el.legL, [{ transform: 'rotate(-20deg)' }, { transform: 'rotate(20deg)' }], { duration: 150, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
      H(this.el.legR, [{ transform: 'rotate(20deg)' }, { transform: 'rotate(-20deg)' }], { duration: 150, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
      H(this.el['mouth-open'], [{ transform: 'none' }, { transform: 'scale(1.4, 1.8)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'scale(0.62)' }]);
      for (const h of this.heads) H(h, [{ transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }], { duration: 110, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
    }, 220);
  }
  /** Soaked and shivering. */
  shiver() {
    this.face('squeeze', 'frown', 160);
    this.hold('shiver', (H) => {
      H(this.el.cat, K.tremble, { duration: 70, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(-16deg)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-16deg)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(3px)' }]);
    }, 240);
  }

  // ---- Tung Tung Tung Sahur's own actions (the knock, the swing); nothing here is used by the others ----
  /**
   * One knock of the bat on the floor: the bat arm winds up and out (a positive rotation swings it to his left and
   * up, clear of his face since it hangs from the log's left wall), a beat, then whips down so the tip cracks the
   * floor beside his feet. `power` 0..2 grows the wind-up from a flick to an overhead swing; the log leans away
   * from the raised bat and dips on the strike. `onHit` fires at the strike, so the director can put the burst there.
   */
  async knock(power: number, onHit: () => void) {
    const ms = 560 + power * 90; const HIT = 0.66;
    this.snd('whoosh', { dur: 0.16, delay: ms * 0.5 / 1000, v: 0.5 + power * 0.2 });
    const up = 34 + power * 43;
    const p = this.shot(ms, (A, M) => {
      A(this.el.legL, [
        { transform: 'rotate(0)', offset: 0, easing: 'cubic-bezier(.3,0,.4,1)' }, { transform: `rotate(${up}deg)`, offset: 0.42, easing: 'ease-in-out' },
        { transform: `rotate(${up + 2}deg)`, offset: 0.5, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: 'rotate(-3deg)', offset: HIT, easing: 'ease-out' },
        { transform: 'rotate(3deg)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 },
      ]);
      A(this.el.legR, [{ transform: 'rotate(0)', offset: 0 }, { transform: `rotate(${-8 - power * 7}deg)`, offset: 0.42, easing: 'ease-in-out' }, { transform: `rotate(${-8 - power * 7}deg)`, offset: 0.5 }, { transform: 'rotate(8deg)', offset: HIT, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [
        { transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${2 + power * 1.5}deg) translateX(${2 + power}px)`, offset: 0.42, easing: 'ease-in-out' },
        { transform: `rotate(${2 + power * 1.5}deg) translateX(${2 + power}px)`, offset: 0.5, easing: 'ease-in' },
        { transform: `translateY(${3 + power * 1.5}px) scaleY(${0.96 - power * 0.015}) scaleX(${1.03 + power * 0.01})`, offset: HIT + 0.04, easing: 'ease-out' }, { transform: 'none', offset: 1 },
      ]);
      for (const h of this.heads) A(h, [
        { transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${-3 - power * 2}deg) translateY(-2px)`, offset: 0.42, easing: 'ease-in-out' },
        { transform: `rotate(${-3 - power * 2}deg) translateY(-2px)`, offset: 0.5, easing: 'ease-in' },
        { transform: `translateY(${4 + power * 2}px) rotate(${2 + power}deg)`, offset: HIT + 0.05, easing: 'ease-out' }, { transform: 'none', offset: 1 },
      ]);
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(-10%, -8%)', offset: 0.42 }, { transform: 'translate(-10%, -8%)', offset: 0.5 }, { transform: 'translate(-8%, 14%)', offset: HIT + 0.05 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * HIT);
    onHit();
    await p;
  }
  /**
   * Bent right down from the hips to his right, the whole log as one piece (on him `heads` is the whole log), the free
   * arm hanging plumb so the hand reaches the floor beside him (about 25 units above the floor, where a bowl's rim
   * is), the bat arm swung back over his shoulder for balance, eyes on what he is reaching for. Held.
   */
  reachDown(ms = 620) {
    this.hold('reach', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(68deg)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-68deg)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(52deg)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(8%, 22%)' }]);
    }, ms);
  }
  /**
   * Sahur reaching down to a guitar on the floor to his right (the emo pack): reachDown's bend, but less of it (60, the
   * hand still over the neck) and the bat-less arm only a little out for balance, eyes on the guitar. Held as 'reach'.
   */
  reachGuitar(ms = 620) {
    this.hold('reach', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(60deg)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-60deg)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(22deg)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(8%, 22%)' }]);
    }, ms);
  }
  /** Sahur's bat arm swung out to his left and back (`ms`), to let the bat go at the top (`onTop`, at `at` of the way). */
  async batOut(onTop: () => void, ms = 620, at = 0.42) {
    void wait(ms * at).then(() => { if (!this.destroyed) onTop(); });
    await this.shot(ms, (A, M) => {
      A(this.el.legL, [{ transform: 'none', easing: 'cubic-bezier(.3,0,.4,1)' }, { transform: 'rotate(26deg)', offset: at, easing: 'cubic-bezier(.4,0,.5,1)' }, { transform: 'none' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(-14%, 12%)', offset: at }, { transform: 'translate(-16%, 20%)' }]);
    });
  }
  /**
   * Standing with the bowl in the upturned hand, at his mouth, a bite above the food. Held; the eat bobs go on top of it.
   */
  carryPose() {
    // the upper arm swings out a little (-12: to his right) and the forearm folds 140 at the elbow, which brings the
    // bowl, resting on the upturned fingers, level under his mouth; the bowl's two halves are counter-turned by the
    // whole of it (-152) so it stays level
    this.hold('carry', (H) => {
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-12deg)' }]);
      H(this.el.foreR, [{ transform: 'none' }, { transform: 'rotate(140deg)' }]);
      H(this.el.bowllevel, [{ transform: 'none' }, { transform: 'rotate(-128deg)' }]);
      H(this.el.bowlfront, [{ transform: 'none' }, { transform: 'rotate(-128deg)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(3px)' }]);   // straight down only: a turn at the seam would kink the log
    }, 560);
  }
  /**
   * Flings what is in the free hand away to his right: from the carry (arm out -12, forearm folded 140) a small
   * wind-up inward, then the arm whips out and up to his right as the forearm straightens, the bowl level in the
   * hand until it leaves at the top of the swing (REL), a follow-through, and the arm settles. The log leans with
   * it and the bat arm swings the other way for balance. `onRelease` fires at the release, so the director can hand
   * the bowl over to a flying prop. Resolves when the arm is back at rest.
   */
  async flingBowl(onRelease: () => void) {
    this.drop('carry');
    const ms = 820; const REL = 0.52;
    const ease = ['cubic-bezier(.4,0,.6,1)', 'cubic-bezier(.7,0,.9,.5)', 'ease-out', 'ease-in-out', 'ease-in-out'];
    const off = [0, 0.26, REL, 0.72, 1];
    const upper = [-12, 12, -108, -128, 0];
    const fore = [140, 152, 26, 4, 0];
    const kf = (vals: number[]) => vals.map((v, i) => ({ transform: `rotate(${v}deg)`, offset: off[i], easing: ease[i] }));
    const p = this.shot(ms, (A, M) => {
      A(this.el.legR, kf(upper));
      A(this.el.foreR, kf(fore));
      const level = kf(upper.map((u, i) => -(u + (fore[i] ?? 0))));   // level in the hand until it leaves (the same easing per segment as the arm)
      A(this.el.bowllevel, level);
      A(this.el.bowlfront, level);
      A(this.el.legL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.26, easing: 'ease-in-out' }, { transform: 'rotate(30deg)', offset: REL, easing: 'ease-out' }, { transform: 'rotate(22deg)', offset: 0.72 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'translateY(3px)', offset: 0 }, { transform: 'rotate(4deg)', offset: 0.26, easing: 'ease-in-out' }, { transform: 'rotate(-7deg)', offset: REL, easing: 'ease-out' }, { transform: 'rotate(-5deg)', offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'translate(6%, 12%)', offset: 0 }, { transform: 'translate(-6%, 4%)', offset: 0.26 }, { transform: 'translate(14%, -14%)', offset: REL }, { transform: 'translate(14%, -16%)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * REL);
    onRelease();
    await p;
  }
  /** The bowl drawn in his free hand: shown when the floor prop hands over, hidden again when it leaves. */
  setBowl(on: boolean) {
    const b = this.el.bowl as HTMLElement | null; const f = this.el.bowlfront as HTMLElement | null; if (!b) return;
    b.style.display = on ? 'inline' : 'none'; if (f) f.style.display = on ? 'inline' : 'none';
    if (on) for (const k of [1, 2, 3]) { const f = this.el['bowlfood' + k] as HTMLElement | null; if (f) { for (const a of f.getAnimations()) a.cancel(); f.style.opacity = '1'; } }
  }
  /** One layer of the held bowl's food goes (0 = the top layer). */
  bowlFood(layer: number) { (this.el['bowlfood' + (3 - layer)] as HTMLElement | null)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }); }

  // ---- the seal's own moves (seal.svg); nothing here is used by the others ----
  /**
   * The seal's flippers. The raised one (#legL, on the picture's left) points out to the left and the hanging one
   * (#legR) down to the right, so "up" is a different turn on each: a positive rotation lifts the left one, a negative
   * one the right. `fin(dir)` is the flipper on side `dir` (room direction) and `up(dir, deg)` lifts it by `deg`
   * (a negative `deg` brings it down).
   */
  private fin(dir: Dir) { return dir < 0 ? this.el.legL : this.el.legR; }
  private up(dir: Dir, deg: number) { return `rotate(${(-dir * deg).toFixed(2)}deg)`; }
  /** A tap at something low on side `dir`: the flipper lifts, slaps down onto it (a ball 88 world units out: its tip lands on the top of it), the body leaning after it. The strike is at 0.55. */
  private patSeal(dir: Dir) {
    const fin = this.fin(dir);
    return this.shot(380, (A) => {
      A(fin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: this.up(dir, 16), offset: 0.3, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: this.up(dir, -34), offset: 0.55, easing: 'ease-out' }, { transform: this.up(dir, -28), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * -1.5}deg)`, offset: 0.3 }, { transform: `rotate(${dir * 4}deg)`, offset: 0.55, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateY(1px)`, offset: 0.55 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** A swipe on side `dir`: a quick lift and the flipper sweeps down and through, the body whipping with it. Through the low point at 0.45. */
  private batSeal(dir: Dir) {
    const fin = this.fin(dir);
    return this.shot(360, (A) => {
      A(fin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: this.up(dir, 28), offset: 0.22, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: this.up(dir, -42), offset: 0.45, easing: 'ease-out' }, { transform: this.up(dir, -20), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.22 }, { transform: `rotate(${dir * 5}deg) translateX(${dir * 2}px)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Both flippers in round something at its belly, the head bowed over it. Held. */
  private hugSeal() {
    this.hold('hug', (H, M) => {
      H(this.el.legL, [{ transform: 'none' }, { transform: this.up(-1, -42) }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: this.up(1, -26) }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(-3deg)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0, 10%)' }]);
    }, 360);
  }
  /** Both flippers flapping, happy: `n` quick beats, a bounce through the body. */
  flap(n = 4) {
    const per = 230;
    this.snd('flaps', { n, gap: per / 1000 });
    this.face('happy', 'smile', 160);
    return this.shot(per * n, (A) => {
      const o = { duration: per, iterations: n };
      A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: this.up(-1, 30), offset: 0.45, easing: 'ease-in' }, { transform: this.up(-1, -6), offset: 0.8, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }], o);
      A(this.el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: this.up(1, 34), offset: 0.45, easing: 'ease-in' }, { transform: this.up(1, -6), offset: 0.8, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }], o);
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(-3px) scaleY(1.02)', offset: 0.45, easing: 'ease-in' }, { transform: 'translateY(1px) scaleY(0.98) scaleX(1.01)', offset: 0.85 }, { transform: 'none', offset: 1 }], o);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(-1px)', offset: 0.45 }, { transform: 'translateY(1px)', offset: 0.85 }, { transform: 'none', offset: 1 }], o);
    });
  }
  /**
   * Mouth open for something coming in from side `dir` and dropping in from above: the head lifts, the eyes up on
   * it, the mouth wide, the flippers ready. Held until `gulp()`.
   */
  gape(dir: Dir, wide = 1) {
    // wide > 1 (the launch media): the seal's own drawn wide-open mouth instead of the small one; the game's feed is wide 1
    const drawn = wide > 1 && !!this.el['mouth-gape'];
    this.face('open', drawn ? 'gape' : 'open', 120);
    this.hold('gape', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-3px)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: `translate(${dir * 6}%, -10%)` }]);
      if (!drawn) H(this.el['mouth-open'], [{ transform: 'none' }, { transform: `scale(${1.25 * wide}, ${1.35 * wide})` }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: this.up(-1, 10) }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: this.up(1, 12) }]);
    }, 260);
  }
  /** Caught it: the mouth shuts on it, the head bobs, a big swallow down through the body. Ends the gape. */
  async gulp() {
    this.release('gape', 140);
    this.snd('gulp');
    this.face('squeeze', 'idle', 70);
    await this.shot(560, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(4px) scale(1.02, 0.98)', offset: 0.25, easing: 'ease-in-out' }, { transform: 'translateY(-2px)', offset: 0.55, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: 'scaleY(0.96) scaleX(1.03)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'scaleY(1.02)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.1)', offset: 0.3 }, { transform: 'scaleX(1)', offset: 1 }]);
    });
    this.face('happy', 'smile', 160);
  }
  /** The top of whatever it wears on its head (a hat, the pumpkin, the hair, the crown), or of the head itself, on screen: where a balanced ball sits. */
  headTopBox(): DOMRect | null {
    let best: DOMRect | null = null;
    for (const e of [this.el.witchhat, this.el.pumpkin, this.el.emohair, this.crownOn ? this.el.crown : null, this.el.head]) {
      if (!e) continue;
      if (e !== this.el.head && (!shown(e) || (e as HTMLElement).style.visibility === 'hidden')) continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0 && (!best || r.top < best.top)) best = r;
    }
    return best;
  }
  /** Balancing something on its head: chin up, eyes up on it, the flippers out a little for balance. Held. */
  balance() {
    this.face('open', 'smile', 160);
    this.hold('balance', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-2px)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(2%, -12%)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: this.up(-1, 12) }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: this.up(1, 16) }]);
    }, 300);
  }
  /** Both flippers up, happy: a cheer, held (the launch media's stills and stickers). */
  cheer() {
    this.face('happy', 'smile', 160);
    this.hold('cheer', (H) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-2px)' }]);
      H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(-2px) scaleY(1.015)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: this.up(-1, 36) }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: this.up(1, 42) }]);
    }, 300);
  }
  /** The hanging flipper raised high, the head tipped toward it: a wave, held (the launch media). */
  wave() {
    this.face('happy', 'smile', 160);
    this.hold('wave', (H) => {
      H(this.el.legR, [{ transform: 'none' }, { transform: this.up(1, 78) }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(4deg)' }]);
    }, 300);
  }
  /**
   * A header: what sits on its head lands (the head gives under it), then the head pops up and sends it back up; the
   * flippers flap with it. `power` 0..2 is how hard; `onHit` fires as the head pops, when the thing leaves it.
   */
  async header(power: number, onHit: () => void) {
    const ms = 420; const HIT = 0.46;
    const p = this.shot(ms, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(3px) scale(1.02, 0.97)', offset: 0.28, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: `translateY(${-(3 + power * 2.5)}px) scale(0.99, 1.02)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(2px) scaleY(0.96) scaleX(1.02)', offset: 0.28, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: `translateY(${-(2 + power * 2)}px) scaleY(1.03)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.legL, [{ transform: 'rotate(0)', offset: 0 }, { transform: this.up(-1, -8), offset: 0.28 }, { transform: this.up(-1, 14 + power * 6), offset: HIT, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.legR, [{ transform: 'rotate(0)', offset: 0 }, { transform: this.up(1, -8), offset: 0.28 }, { transform: this.up(1, 16 + power * 6), offset: HIT, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
    });
    await wait(ms * HIT);
    onHit();
    await p;
  }
  /** A scoop with the flipper on side `dir`: down under something and a quick flick up; `onHit` at the flick. */
  async boop(dir: Dir, onHit: () => void) {
    const fin = this.fin(dir); const ms = 440; const HIT = 0.5;
    const p = this.shot(ms, (A) => {
      A(fin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: this.up(dir, -30), offset: 0.32, easing: 'cubic-bezier(.5,0,.9,.4)' }, { transform: this.up(dir, 40), offset: HIT, easing: 'ease-out' }, { transform: this.up(dir, 30), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${dir * 4}deg) translateY(2px)`, offset: 0.32 }, { transform: `rotate(${-dir * 2}deg) translateY(-3px)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateY(2px)`, offset: 0.32 }, { transform: 'translateY(-3px)', offset: HIT }, { transform: 'none', offset: 1 }]);
    });
    await wait(ms * HIT);
    onHit();
    await p;
  }

  // ---- death ----
  private ghost = false;
  private ghostAnims: Animation[] = [];
  get isGhost() { return this.ghost; }
  /** Ghost look: pale fills (pet.css), halo, x eyes, a slow float. */
  setGhost(on: boolean) {
    if (on === this.ghost) return;
    this.ghost = on;
    this.root.classList.toggle('ghost', on);
    if (on) {
      this.fade(this.el.halo, 1, 700);
      this.face('x', 'frown', 200);
      if (!reduceMotion()) {
        const a = this.one(this.el.figure, [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }], { duration: 2600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', ...ADD });
        const t = this.one(this.el.tail, [{ transform: 'rotate(-5deg)' }, { transform: 'rotate(6deg)' }], { duration: 3400, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', ...ADD });
        for (const x of [a, t]) if (x) this.ghostAnims.push(x);
      }
    } else {
      this.fade(this.el.halo, 0, 500);
      for (const a of this.ghostAnims) this.stopLoop(a);
      this.ghostAnims = [];
    }
  }
  /** Keel over: a wobble, eyes go x, the body sinks, then it lifts off as a ghost. */
  async die() {
    this.releaseAll(200);
    this.face('squeeze', 'frown', 200);
    await this.shot(1200, (A) => {
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-5deg)', offset: 0.18 }, { transform: 'rotate(5deg)', offset: 0.36 }, { transform: 'rotate(-4deg)', offset: 0.54 }, { transform: 'rotate(3deg)', offset: 0.72 }, { transform: 'scaleY(0.94) translateY(3px)', offset: 0.9 }, { transform: 'scaleY(0.94) translateY(3px)', offset: 1 }], { easing: 'ease-in-out' });
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'rotate(4deg) translateY(2px)', offset: 0.3 }, { transform: 'rotate(-4deg) translateY(2px)', offset: 0.6 }, { transform: 'translateY(4px)', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-24deg)' }], { fill: 'none' }); A(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(24deg)' }], { fill: 'none' });
    });
    this.face('x', 'frown', 120);
    this.deadHold(1500);
    this.setGhost(true);
    await wait(1500);
  }
  /** The ghost's pose: lifted off the floor, ears and tail drooping. */
  private deadHold(ms: number) {
    this.hold('dead', (H) => {
      H(this.el.figure, [{ transform: 'none' }, { transform: `translateY(-${this.own?.ghostRise ?? GHOST_RISE[this.character] ?? 40}px)` }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-18deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(18deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
    }, ms);
  }
  /** Already a ghost (a page opening on a dead pet): the lifted pose and the pale look, with no keeling over. */
  ghostNow() {
    this.releaseAll(0);
    this.face('x', 'frown', 0);
    this.deadHold(1);
    this.setGhost(true);
  }
  /** Finish every animation that has an end (fades, held poses, a mood easing in), so this very frame shows where they
   *  were going. Loops carry on. For a room opening on a pet as it already is (director.arrive). */
  settle() {
    for (const a of this.root.getAnimations({ subtree: true })) {
      const t = a.effect?.getComputedTiming();
      if (!t || t.iterations === Infinity || t.endTime === Infinity) continue;
      try { a.finish(); } catch { /* one with nothing to finish */ }
    }
  }
  /** Come back: colour returns, it settles to the floor, a big stretch, a happy hop. */
  async revive() {
    this.setGhost(false);
    this.release('dead', 900);
    await wait(950);
    this.face('closed', 'idle', 200);
    await this.stretch();
    this.face('happy', 'smile', 200);
    await this.hop();
  }
  /** Freeze at a resting pose (portrait renders): idle loops to their rest point, everything else paused. */
  still() {
    for (const a of this.root.getAnimations({ subtree: true })) a.pause();
    for (const a of this.idle) { try { a.currentTime = 0; } catch { /* finished */ } }
  }

  // ---- moods ----
  setMood(mood: Mood) {
    if (mood === this.mood || this.destroyed) return;
    this.leaveMood(this.mood);
    this.mood = mood;
    if (reduceMotion()) { this.restFace(0); return; }
    const L = (e: Element | null | undefined, kf: KF, o: Opts) => { const a = keep(this.one(e, kf, { ...ADD, ...o })); if (a) this.moodAnims.push(a); };
    if (mood === 'sleep') {
      this.face('closed', 'idle', 320);
      if (!this.calm) {   // the calm idle sleeps still: head dipped, the z's still rise
        for (const h of this.heads) L(h, K.nod, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        for (const b of this.bodies) L(b, K.breatheSlow, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        L(this.el.tail, K.swaySlow, { duration: 6000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        L(this.el.crownlift, K.crownSlip, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      } else for (const h of this.heads) L(h, [{ transform: 'none' }, { transform: 'rotate(3deg) translateY(1.5px)' }], { duration: 900, fill: 'forwards', easing: 'ease-in-out' });
      L(this.el.fringe, [{ transform: 'none' }, { transform: 'rotate(2deg) translateY(1%)' }], { duration: 600, fill: 'forwards', easing: 'ease-out' });
      L(this.el.earL, [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }], { duration: 600, fill: 'forwards', easing: 'ease-out' });
      L(this.el.earR, [{ transform: 'rotate(0)' }, { transform: 'rotate(9deg)' }], { duration: 600, fill: 'forwards', easing: 'ease-out' });
      (this.q.get('z') ?? []).forEach((z, i) => { this.moodAnims.push(z.animate(K.z, { duration: 3000, iterations: Infinity, easing: 'ease-out', delay: i * 1000 })); this.opacityLoopTargets.add(z); });
      this.fade(this.el.zzz, 1, 200);
    } else if (mood === 'sad') {
      this.face('open', 'frown', 320);
      for (const h of this.heads) L(h, [{ transform: 'none' }, { transform: 'rotate(5deg) translateY(3px)' }], { duration: 700, fill: 'forwards', easing: 'ease-out' });
      L(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-20deg)' }], { duration: 700, fill: 'forwards', easing: 'ease-out' });
      L(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(20deg)' }], { duration: 700, fill: 'forwards', easing: 'ease-out' });
      L(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(14deg)' }], { duration: 700, fill: 'forwards', easing: 'ease-out' });
      L(this.el.fringe, [{ transform: 'none' }, { transform: 'translateY(1.5px)' }], { duration: 700, fill: 'forwards', easing: 'ease-out' });
      if (!this.calm) {   // calm: the tear falls now and then from startCalmIdle instead
        L(this.el.tear, K.tearDrip, { duration: 3200, iterations: Infinity, easing: 'ease-in-out', composite: 'replace' });
        if (this.el.tear) { this.opacityLoopTargets.add(this.el.tear); this.fade(this.el.tear, 1, 0); }
      }
    }
  }

  /** Bring a looping animation back to rest within ~300 ms, in whichever direction is shorter. */
  private stopLoop(a: Animation) {
    const timing = a.effect?.getComputedTiming();
    const dur = Number(timing?.duration) || 1;
    const ct = Number(a.currentTime) || 0;
    const iter = Math.floor(ct / dur);
    const p = (ct - iter * dur) / dur;
    const alternate = timing?.direction === 'alternate';
    let back: number; let ahead: number;
    if (alternate) {
      if (iter % 2 === 0) { back = p; ahead = 2 - p; } else { back = 1 + p; ahead = 1 - p; }
    } else { back = p; ahead = 1 - p; }
    const goBack = back < ahead;
    const dist = (goBack ? back : ahead) * dur;
    const rate = Math.max(1, dist / 300);
    try {
      a.playbackRate = goBack ? -rate : rate;
      setTimeout(() => a.cancel(), dist / rate + 20);
    } catch { a.cancel(); }
  }

  private leaveMood(mood: Mood) {
    const anims = this.moodAnims;
    this.moodAnims = [];
    for (const a of anims) {
      const timing = a.effect?.getComputedTiming();
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const opacityLoop = target ? this.opacityLoopTargets.has(target) : false;
      if (opacityLoop) a.cancel();
      else if (timing && timing.iterations === Infinity) this.stopLoop(a);
      else { try { a.reverse(); a.finished.then(() => a.cancel()).catch(() => {}); } catch { a.cancel(); } }
    }
    if (mood === 'sleep') { this.fade(this.el.zzz, 0, 200); for (const z of this.q.get('z') ?? []) this.fade(z, 0, 200); this.face('open', 'idle', 320); }
    if (mood === 'sad') { this.fade(this.el.tear, 0, 200); this.face('open', 'idle', 320); }
  }

  /** Freeze everything at `t` ms for filmstrips. Returns a cleanup. */
  freeze(t: number): () => void {
    const all = this.root.getAnimations({ subtree: true });
    for (const a of all) { a.pause(); a.currentTime = t; }
    return () => { for (const a of all) a.play(); };
  }

  destroy() {
    this.destroyed = true;
    this.own?.destroy?.();
    if (this.flickTimer) clearTimeout(this.flickTimer);
    if (this.calmTimer) clearTimeout(this.calmTimer);
    this.root.setAttribute('data-rig', 'destroyed');
    for (const a of this.root.getAnimations({ subtree: true })) a.cancel();
  }

  // ---- the dreidel (the Jewish pack's toy; director.spinDreidel). New moves: nothing above uses them ----
  /**
   * Take the dreidel's stem on side `dir` and twist it off: the paw (or sleeve, or hand) goes up to the stem, holds it
   * a beat, and snaps back toward the pet, which is when the director sets it spinning (660 ms, the flick at 0.56:
   * PetRig_TWIST in director.ts). Every reach is measured to land on the stem with the dreidel's point DREIDEL_REACH
   * from the pet. The cat's near front paw goes out and up (a positive rotation swings a hanging leg to the LEFT, so a
   * paw goes out toward `dir` with a rotation against it); the frog bows a little and reaches with his near sleeve;
   * Sahur, always on his free-hand side (his right), bends from the hips with the hand plumb onto the stem.
   */
  /** "Meh": a slow little shake of the head, the eyes off to one side (the dreidel's nun: nothing happens). */
  meh() {
    const deg = this.character === 'sahur' ? 3 : 6;
    return this.shot(900, (A, M) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-deg}deg)`, offset: 0.22 }, { transform: `rotate(${deg}deg)`, offset: 0.5 }, { transform: `rotate(${-deg * 0.6}deg)`, offset: 0.76 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(-12%, 6%)', offset: 0.25 }, { transform: 'translate(-12%, 6%)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.4 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(10deg)', offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
  }
  twist(dir: Dir) {
    dir = this.w(dir);
    if (this.own?.twist) return this.own.twist(dir);
    const ms = 660;
    if (this.character === 'seal') {
      // the flipper on that side comes down onto the knob (the dreidel stands DREIDEL_REACH out and its knob is about as
      // high as the flipper's tip, measured), leaning into it, holds it, and flicks up and back for the spin
      const fin = this.fin(dir); const low = dir < 0 ? 10 : 3;
      return this.shot(ms, (A, M) => {
        A(fin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: this.up(dir, -low), offset: 0.36, easing: 'ease-in-out' }, { transform: this.up(dir, -low - 1), offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' }, { transform: this.up(dir, 30), offset: 0.68, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 2}deg)`, offset: 0.36 }, { transform: `rotate(${dir * 2}deg)`, offset: 0.56, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 1.5}deg)`, offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.4 }, { transform: `rotate(${dir * 4}deg) translateY(1px)`, offset: 0.56 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.72 }, { transform: 'none', offset: 1 }]);
        M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: `translate(${dir * 8}%, 10%)`, offset: 0.36 }, { transform: `translate(${dir * 8}%, 10%)`, offset: 0.6 }, { transform: 'none', offset: 1 }]);
      });
    }
    if (this.character === 'sahur') {
      return this.shot(ms, (A, M) => {
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'rotate(46deg)', offset: 0.36, easing: 'ease-in-out' }, { transform: 'rotate(47deg)', offset: 0.54, easing: 'ease-in-out' }, { transform: 'rotate(38deg)', offset: 0.68, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-46deg)', offset: 0.36, easing: 'ease-in-out' }, { transform: 'rotate(-47deg)', offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' }, { transform: 'rotate(-14deg)', offset: 0.68, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(34deg)', offset: 0.36 }, { transform: 'rotate(34deg)', offset: 0.6, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(8%, 22%)', offset: 0.36 }, { transform: 'translate(8%, 22%)', offset: 0.6 }, { transform: 'none', offset: 1 }]);
      });
    }
    if (this.character === 'frog') {
      const grip = this.bow(24, 0); const back = this.bow(10, 0);
      return this.shot(ms, (A) => {
        for (const bb of this.bodies) A(bb, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: grip.body, offset: 0.36, easing: 'ease-in-out' }, { transform: grip.body, offset: 0.54, easing: 'ease-in-out' }, { transform: back.body, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: grip.head, offset: 0.36, easing: 'ease-in-out' }, { transform: grip.head, offset: 0.54, easing: 'ease-in-out' }, { transform: back.head, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(this.el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(-48deg)', offset: 0.36, easing: 'ease-in-out' }, { transform: 'rotate(-47deg)', offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' }, { transform: 'rotate(-8deg) translateY(-3px)', offset: 0.68, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
    }
    // the cat: her shoulder is only a little above the knob (the director gives her a smaller dreidel for it), so the
    // paw goes out and a little down onto the knob at 78 with the whole body leaning 2 into it (measured: the paw's end
    // centred on the knob), holds, and pulls back along the arm for the flick
    const leg = dir < 0 ? this.el.legL : this.el.legR;
    const out = -dir;
    return this.shot(ms, (A) => {
      A(leg, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${out * 78}deg)`, offset: 0.36, easing: 'ease-in-out' }, { transform: `rotate(${out * 77}deg) translateY(-1px)`, offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' }, { transform: `rotate(${out * 70}deg) translateY(-16px)`, offset: 0.66, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 2}deg)`, offset: 0.36 }, { transform: `rotate(${dir * 2}deg)`, offset: 0.56, easing: 'ease-in-out' }, { transform: `rotate(${-dir * 1}deg)`, offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 5}deg) translateY(1px)`, offset: 0.4 }, { transform: `rotate(${dir * 5}deg) translateY(1px)`, offset: 0.56 }, { transform: `rotate(${-dir * 2}deg)`, offset: 0.72 }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.5 }, { transform: 'rotate(-10deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-10deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(10deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
    });
  }

  // ---- kapparot (the Jewish pack's hen; director.kapparot). New moves: nothing above uses them ----
  /**
   * Lift the hen over the head: both paws (the seal's flippers; the frok's near sleeve; Sahur's free hand) raised, eyes
   * up, a quiet smile. Measured per character: the cat's paws end beside her cheeks (a raised front leg goes behind her
   * head), the frok's near sleeve and Sahur's free hand reach the top of the head, the seal's flippers rise to his cheeks.
   */
  kapparotRaise() {
    this.face('open', 'smile', 200);
    if (this.own?.kapparotRaise) { this.own.kapparotRaise(); return; }
    const c = this.character;
    // the cat keeps her paws on the floor (she sits on her front legs: any lift left them hanging in the air, and past ~45
    // their tops swing across her chest); the seal's left flipper only lifts a little (raised high it shows the end of his
    // side line, which his drawing hides under it at rest)
    const arms: [Element | null | undefined, number][] =
      c === 'cat' ? []
      : c === 'seal' ? [[this.el.legL, 15], [this.el.legR, -70]]
      : c === 'frog' ? [[this.el.legL, 150], [this.el.legR, -26]]
      : [[this.el.legR, -150], [this.el.legL, 10]];
    this.hold('kapparot', (H, M) => {
      for (const [e, deg] of arms) H(e, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-1.5px)' }]);
      M(this.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: 'translate(0, -18%)' }]);
    }, 460);
  }
  /**
   * While the hen circles over the head: the head and the eyes follow her round and the raised paws lean toward her side,
   * `laps` laps of `lapMs` each, in step with the director's circle (the hen is at the right at the start of each lap, then
   * in front, the left, behind). On top of kapparotRaise's hold.
   */
  kapparotFollow(laps: number, lapMs: number) {
    if (this.own?.kapparotFollow) return this.own.kapparotFollow(laps, lapMs);
    const c = this.character;
    const per = 16; const n = per * laps; const ms = laps * lapMs; const side = this.w(1);
    const kf = (f: (th: number) => string): Keyframe[] => Array.from({ length: n + 1 }, (_, i) => ({ transform: f((2 * Math.PI * i) / per), offset: i / n }));
    const arms: Element[] = (c === 'cat' ? [] : c === 'seal' ? [this.el.legR] : c === 'frog' ? [this.el.legL] : [this.el.legR]).filter((e): e is Element => !!e);
    const deg = c === 'sahur' ? 1.5 : 3;
    const sway = 7;
    return this.shot(ms, (A, M) => {
      for (const h of this.heads) A(h, kf((th) => `rotate(${(side * deg * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
      M(this.q.get('pupil'), kf((th) => `translate(${(side * 16 * Math.cos(th)).toFixed(1)}%, ${(3 * Math.sin(th)).toFixed(1)}%)`), { easing: 'linear' });
      for (const a of arms) A(a, kf((th) => `rotate(${(side * sway * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
      // the cat's tail swishes toward the side the hen is on
      if (c === 'cat') A(this.el.tail, kf((th) => `rotate(${(10 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
    });
  }

  // ---- the darbuka (the Habibi pack's toy; director.drumDarbuka). New moves: nothing above uses them ----
  /**
   * Drumming a darbuka that stands on side `dir` (a room direction). `drumReady` holds the striking limb over the drum's
   * head, the head turned to it and the eyes on it; `drumPlay` then plays a whole schedule of strokes as ONE animation per
   * part (a rhythm is one animation with its events on its phase, never chained one-shots): each stroke winds up (a DUM,
   * the deep one in the middle of the head, higher; a tek, the sharp one, a flick) and lands on the head at its time,
   * which is when the director puts up the note, the ripple and the squash. Who strikes: the cat's front paw on that side
   * (she sits on her front legs, which reach no higher than her shoulder: the whole leg lifts, and the paw comes out and
   * down onto a small drum), the frok's front arm swung forward from his shoulder onto a drum in front of him, Sahur's BAT (tung on the darbuka: his name is the meal before dawn in Ramadan, and his
   * meme comes from drumming people awake for it), the seal's flipper on that side while the other keeps time. The angles
   * are measured so the limb lands on the head of the drum the director stands DARBUKA_REACH out (director.ts).
   */
  private drumArm(dir: Dir): DrumArm {
    const own = this.own?.drumArm?.(dir); if (own) return own;
    const c = this.character;
    // the limb's lift in degrees from rest: `hover` over the head (held), `hit` on it, `dum` / `tek` the wind-up before each
    const T: Partial<Record<Character | 'sealR', { hover: number; hit: number; dum: number; tek: number; lift?: number; bow?: number }>> = {
      cat: { hover: 86, hit: 77, dum: 94, tek: 85, lift: 16 },   // out to her side like the dreidel's twist, the leg lifted a little (its top stays under the collar): the paw comes down on a small drum
      frog: { hover: 50, hit: 42, dum: 62, tek: 51, bow: 6 },    // his FRONT arm (#legR, down the front of his robe), swung forward from the shoulder onto a drum in front of him
      sahur: { hover: 48, hit: 42, dum: 60, tek: 49 },            // the bat's barrel onto the head, from the length of it
      seal: { hover: 12, hit: -10, dum: 40, tek: 10 },    // the raised flipper (#legL), a drum on its left
      sealR: { hover: 38, hit: 14, dum: 62, tek: 38 },    // the hanging one (#legR), a drum on its right: it comes up a way before it comes down
    };
    const t = T[c === 'seal' && dir > 0 ? 'sealR' : c] ?? T.cat!;
    if (c === 'cat') {
      const out = -dir;   // a positive rotation swings a hanging leg to the LEFT: out toward `dir` is a rotation against it
      return { ...t, limb: dir < 0 ? this.el.legL : this.el.legR, rot: (d: number) => `rotate(${(out * d).toFixed(2)}deg)`, base: `translateY(${-(t.lift ?? 0)}px) ` };
    }
    if (c === 'frog') return { ...t, limb: this.el.legR, rot: (d: number) => `rotate(${d.toFixed(2)}deg)`, base: '' };   // he faces the drum, so it is always at his front: a positive turn swings his front arm forward
    if (c === 'sahur') return { ...t, limb: this.el.legL, rot: (d: number) => `rotate(${d.toFixed(2)}deg)`, base: '' };   // the bat arm, out to his left
    return { ...t, limb: this.fin(dir), rot: (d: number) => this.up(dir, d), base: '' };
  }
  /** Over the drum on side `dir`, ready: the limb held over its head, leaning to it, eyes on it. Held as 'drum'. */
  drumReady(dir: Dir) {
    dir = this.w(dir);
    const c = this.character; const a = this.drumArm(dir);
    this.face('open', 'smug', 200);
    this.hold('drum', (H, M) => {
      H(a.limb, [{ transform: 'none' }, { transform: `${a.base}${a.rot(a.hover)}` }]);
      if (c === 'frog') {
        const b = this.bow(a.bow ?? 10, 4);
        for (const bb of this.bodies) H(bb, [{ transform: 'none' }, { transform: b.body }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: b.head }]);
        M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(10%, 18%)' }]);
      } else if (c === 'sahur') {
        H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-6deg)' }]);   // the free hand out a little, keeping time
        M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(-16%, 16%)' }]);
      } else {
        H(this.el.figure, [{ transform: 'none' }, { transform: `rotate(${dir * 2}deg)` }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 4}deg) translateY(1px)` }]);
        M(this.q.get('pupil'), [{ transform: 'none' }, { transform: `translate(${dir * 14}%, 14%)` }]);
        if (c === 'cat') H(this.el.tail, [{ transform: 'none' }, { transform: `rotate(${-dir * 6}deg)` }]);
      }
    }, 360);
  }
  /**
   * Play `strokes` (each one's time in ms from now, when it lands on the head; 'dum' or 'tek'), `end` ms long in all, on
   * top of drumReady's hold. The limb: one animation through every wind-up and landing (strokes closer than a wind-up,
   * a roll, flutter at the head between them); the head nods and the body bounces on the DUMs; the cat's tail and ears
   * flick with the beat; the seal's other flipper keeps time on the DUMs.
   */
  drumPlay(dir: Dir, strokes: readonly { t: number; kind: 'dum' | 'tek' }[], end: number) {
    dir = this.w(dir);
    const c = this.character; const a = this.drumArm(dir);
    const kf = (pts: [number, number, string][], f: (v: number) => string): Keyframe[] => pts.map(([t, v, e]) => ({ transform: f(v), offset: Math.min(1, Math.max(0, t / end)), easing: e }));
    // the limb
    const L: [number, number, string][] = [[0, a.hover, 'ease-in-out']];
    let prev = -Infinity;
    for (const s of strokes) {
      const wind = s.kind === 'dum' ? a.dum : a.tek; const lead = s.kind === 'dum' ? 120 : 75;
      const gap = s.t - prev;
      if (gap >= lead + 110) {
        if (Number.isFinite(prev)) L.push([prev + 90, a.hover, 'ease-in-out']);
        L.push([s.t - lead, wind, 'cubic-bezier(.55,0,1,.5)']);                       // up, then down fast onto the head
      } else {
        L.push([(prev + s.t) / 2, a.hit + (wind - a.hit) * Math.max(0.35, gap / (lead + 110)), 'cubic-bezier(.55,0,1,.5)']);   // a roll: flutter off the head
      }
      L.push([s.t, a.hit, 'ease-out']);
      prev = s.t;
    }
    L.push([prev + 130, a.hover, 'ease-in-out'], [end, a.hover, 'linear']);
    // a nod and a bounce on every DUM
    const P: [number, number, string][] = [[0, 0, 'ease-in-out']];
    for (const s of strokes) {
      if (s.kind !== 'dum') continue;
      const last = P[P.length - 1]![0];
      if (s.t - 90 > last) P.push([s.t - 90, 0, 'ease-in']);
      P.push([s.t + 20, 1, 'ease-out'], [s.t + 200, 0, 'ease-in-out']);
    }
    P.push([Math.max(end, P[P.length - 1]![0] + 1), 0, 'linear']);
    // the tail and ears: a flick to each stroke's side, alternately
    const F: [number, number, string][] = [[0, 0, 'ease-in-out']];
    strokes.forEach((s, i) => { if (s.t - 40 > F[F.length - 1]![0]) F.push([s.t - 40, 0, 'ease-in-out']); F.push([s.t + 40, i % 2 ? 1 : -1, 'ease-in-out']); });
    F.push([Math.max(end, F[F.length - 1]![0] + 1), 0, 'linear']);
    return this.shot(end, (A, M) => {
      A(a.limb, kf(L, (v) => a.rot(v - a.hover)), { easing: 'linear' });
      if (c === 'sahur') {
        // he is a rigid log: no nod (his head unit is the whole log, bat and all); the eyes widen on each DUM
        M(this.q.get('pupil'), kf(P, (v) => `scale(${(1 + 0.12 * v).toFixed(3)})`), { easing: 'linear' });
        A(this.el.legR, kf(P, (v) => `rotate(${(-8 * v).toFixed(2)}deg)`), { easing: 'linear' });
      } else if (c === 'frog') {
        for (const h of this.heads) A(h, kf(P, (v) => `rotate(${(4 * v).toFixed(2)}deg) translateY(${(1.5 * v).toFixed(2)}px)`), { easing: 'linear' });
        A(this.el.legL, kf(P, (v) => `rotate(${(-5 * v).toFixed(2)}deg)`), { easing: 'linear' });   // the back arm keeps time
      } else {
        for (const h of this.heads) A(h, kf(P, (v) => `rotate(${(dir * 3 * v).toFixed(2)}deg) translateY(${(2 * v).toFixed(2)}px)`), { easing: 'linear' });
        A(this.el.figure, kf(P, (v) => `translateY(${(1.5 * v).toFixed(2)}px) scaleY(${(1 - 0.012 * v).toFixed(4)})`), { easing: 'linear' });
        if (c === 'cat') {
          A(this.el.tail, kf(F, (v) => `rotate(${(9 * v).toFixed(2)}deg)`), { easing: 'linear' });
          A(this.el.earL, kf(P, (v) => `rotate(${(-12 * v).toFixed(2)}deg)`), { easing: 'linear' });
          A(this.el.earR, kf(P, (v) => `rotate(${(12 * v).toFixed(2)}deg)`), { easing: 'linear' });
        }
        if (c === 'seal') A(this.fin(-dir as Dir), kf(P, (v) => this.up(-dir as Dir, 16 * v)), { easing: 'linear' });
      }
    });
  }

  // ---- the guitar (the emo pack's toy; director.playGuitar; DEV only: /emopack). New moves: nothing above uses them ----
  /**
   * How each pet holds the guitar: the strumming limb is held at `deg` (a positive CSS rotate swings a hanging limb to the
   * screen's LEFT) and swings `amp` either side of it, the fretting one is held at `deg`; `lift` raises a cat's leg (she
   * sits on them). `probe` is the end of each in that limb's own units: the director reads both off the screen in the
   * playing pose and fits the guitar between them (its strings under the strumming end, its neck in the other hand).
   */
  strumArm(): { strum: StrumLimb; fret: StrumLimb | null } {
    const own = this.own?.strumArm?.(); if (own) return own;
    const c = this.character; const e = this.el;
    // the cat: both front paws lifted onto it in her lap, her right paw (our left) on the strings, the left on the neck
    if (c === 'cat') return { strum: { limb: e.legL, deg: -22, amp: 6, lift: 14, probe: [80, 199] }, fret: { limb: e.legR, deg: -64, lift: 6, probe: [120, 199] } };
    // the frok, facing right: the near arm strums at his belly, the far arm reaches forward along the neck
    // (his far arm is drawn mirrored: a positive turn swings it to the RIGHT, forward and up)
    if (c === 'frog') return { strum: { limb: e.legL, deg: -14, amp: 8, probe: [74, 147] }, fret: { limb: e.legR, deg: 48, probe: [123, 158] } };
    // Sahur: his bat set down, the empty fist strums at his left hip and the free hand holds the neck out to his right
    // (the forearm raised from the elbow: `upper` is the upper arm)
    if (c === 'sahur') return { strum: { limb: e.legL, deg: -14, amp: 8, probe: [84, 134] }, fret: { limb: e.foreR, deg: -48, probe: [124.5, 134], upper: { limb: e.legR, deg: -22 } } };
    // Thiccums: the near flipper strums; the guitar lies across his belly (no fretting flipper: the far one is behind him)
    if (c === 'thiccums') return { strum: { limb: e.legR, deg: 8, amp: 7, probe: [181, 150] }, fret: null };
    // the r3tard: his right hand (our left) over the strings at his hip, the left one out and up on the neck
    return { strum: { limb: e.legL, deg: -18, amp: 7, probe: [78.2, 154] }, fret: { limb: e.legR, deg: -44, probe: [121.6, 154] } };
  }
  /** Both hands where they will be on the guitar, the eyes down to it. Held as 'guitar'. `ms` 0 puts the pose on at once
   *  (the director measures where the hands will be, then drop('guitar') takes it off before anything is drawn). */
  strumReady(ms = 420) {
    const a = this.strumArm();
    if (ms) this.face('open', 'smile', 200);
    this.hold('guitar', (H) => {
      H(a.strum.limb, [{ transform: 'none' }, { transform: `${a.strum.lift ? `translateY(${-a.strum.lift}px) ` : ''}rotate(${a.strum.deg}deg)` }]);
      if (a.fret) H(a.fret.limb, [{ transform: 'none' }, { transform: `${a.fret.lift ? `translateY(${-a.fret.lift}px) ` : ''}rotate(${a.fret.deg}deg)` }]);
      if (a.fret?.upper) H(a.fret.upper.limb, [{ transform: 'none' }, { transform: `rotate(${a.fret.upper.deg}deg)` }]);
      if (a.strum.upper) H(a.strum.upper.limb, [{ transform: 'none' }, { transform: `rotate(${a.strum.upper.deg}deg)` }]);
    }, ms);
  }
  /** The playing pose taken off at once, no easing (after strumReady(0) was put on to measure it). */
  strumUnready() { this.drop('guitar'); }
  /**
   * Bent down over the guitar lying on the floor in front of the feet (body under the strumming hand, neck under the
   * fretting one) with both hands on it: the cat crouches, both front paws down on it, her tail up out of the way; the
   * frok bows forward with both hands down; Sahur bends right down to his right, the free hand on its neck (reachDown);
   * the r3tard sits on the floor with both hands out to it (his bowl pose: standing, his arms cannot reach). Held;
   * returns the holds' keys, for unhold()/release(). `ms` 0: on at once (to measure).
   */
  pickUp(ms = 420): string[] {
    if (this.own?.pickUp) return this.own.pickUp(ms);
    const c = this.character;
    if (c === 'sahur') { this.reachGuitar(ms); return ['reach']; }
    if (c === 'r3tards' && this.own?.sit) {
      this.own.sit(true, ms);
      this.hold('pickup', (H) => { for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(4deg) translateY(3px)' }]); }, ms);
      return ['sit', 'pickup'];
    }
    this.hold('pickup', (H) => {
      if (c === 'frog') {
        const b = this.bow(28, 8);
        for (const bb of this.bodies) H(bb, [{ transform: 'none' }, { transform: b.body }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: b.head }]);
        H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(-22deg)' }]);
        H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
      } else {
        H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(3px) scaleY(0.95) scaleX(1.03)' }]);
        for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(4deg) translateY(3px)' }]);
        H(this.el.legL, [{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-14deg)' }]);
        H(this.el.legR, [{ transform: 'none' }, { transform: 'translateY(-4px) rotate(-30deg)' }]);
        H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-26deg)' }]);   // (out of the way, up behind her)
      }
    }, ms);
    return ['pickup'];
  }
  /**
   * The cat, before she takes the guitar: both front paws up and out to the sides, clear of it (she sits on them behind
   * it, so standing they are behind it; from here they come down in front of it, onto it: pickUp). Held as 'pickspread';
   * the director lets it go as pickUp comes on. Nothing for the others (their hands are above it already). Returns its key.
   */
  pickSpread(ms = 260): string | null {
    if (this.character !== 'cat') return null;
    this.hold('pickspread', (H) => {
      H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(-2px)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: 'translateY(-12px) rotate(52deg)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'translateY(-12px) rotate(-52deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-16deg)' }]);
    }, ms);
    return 'pickspread';
  }
  /** Holds taken off at once, no easing (after a pose was put on with ms 0 to measure it). */
  unhold(keys: readonly string[]) { for (const k of keys) this.drop(k); }
  /**
   * The guitar thrown off: the hand that holds its neck winds back and swings it out and up over his shoulder, letting go
   * at `RELEASE` of the way (`onRelease`: the director takes it from the hand there), and the arm comes back down; the
   * other hand lets go of the strings. Starts from the playing pose (strumReady's hold, taken off here).
   */
  async throwGuitar(onRelease: () => void, onStart?: (ms: number, release: number) => void) {
    if (this.own?.throwGuitar) return this.own.throwGuitar(onRelease, onStart);
    const a = this.strumArm(); const c = this.character; const f = a.fret;
    if (!f) return;
    const pose = (l: StrumLimb) => `${l.lift ? `translateY(${-l.lift}px) ` : ''}rotate(${l.deg}deg)`;
    // the fretting arm's swing: [wind-up, the top of the swing, the follow-through] (a negative turn swings a hanging arm
    // to the RIGHT; the frok's far arm is drawn mirrored, so on him it is the other way)
    // (the top is out to the side and up, not overhead: swung right over, the guitar's body crossed the face)
    const T: Record<string, [number, number, number]> = { cat: [-30, -128, -112], frog: [26, 128, 112], r3tards: [-20, -128, -112] };
    // (Sahur lets go with his arm out to his right: the director turns the guitar in his hand meanwhile, `onStart`)
    const ms = 760; const RELEASE = c === 'sahur' ? 0.54 : 0.52;
    this.drop('guitar'); this.drop('guitarlook'); this.drop('gaze');
    onStart?.(ms, RELEASE);
    void wait(ms * RELEASE).then(() => { if (!this.destroyed) onRelease(); });
    await this.shot(ms, (A, M) => {
      A(a.strum.limb, [{ transform: pose(a.strum), offset: 0 }, { transform: 'none', offset: 0.35, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      if (c === 'sahur' && f.upper) {
        A(f.upper.limb, [{ transform: `rotate(${f.upper.deg}deg)`, offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(8deg)', offset: 0.3, easing: 'cubic-bezier(.5,0,.6,1)' },
          { transform: 'rotate(-118deg)', offset: 0.62, easing: 'ease-out' }, { transform: 'rotate(-100deg)', offset: 0.76, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(f.limb, [{ transform: `rotate(${f.deg}deg)`, offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-70deg)', offset: 0.3, easing: 'cubic-bezier(.5,0,.6,1)' },
          { transform: 'rotate(-12deg)', offset: 0.62, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      } else {
        const [w, top, fol] = T[c] ?? T.cat!;
        const lift = f.lift ? `translateY(${-f.lift}px) ` : '';
        A(f.limb, [{ transform: pose(f), offset: 0, easing: 'ease-in-out' }, { transform: `${lift}rotate(${w}deg)`, offset: 0.3, easing: 'cubic-bezier(.5,0,.6,1)' },
          { transform: `${lift}rotate(${top}deg)`, offset: 0.62, easing: 'ease-out' }, { transform: `rotate(${fol}deg)`, offset: 0.76, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      }
      const lean = c === 'frog' ? -1 : 1;
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-lean * 4}deg)`, offset: 0.3, easing: 'ease-in-out' }, { transform: `rotate(${lean * 5}deg) translateY(-2px)`, offset: 0.62, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
      M(this.q.get('pupil'), [{ transform: 'none', offset: 0 }, { transform: 'translate(10%, -10%)', offset: 0.5 }, { transform: 'translate(24%, -30%)', offset: 0.8 }, { transform: 'translate(20%, -24%)', offset: 1 }]);
    });
  }
  /** Sahur bent down to his LEFT, the bat arm hanging plumb to the floor there (to pick his bat back up). Held as 'reach'. */
  reachDownLeft(ms = 560) {
    this.hold('reach', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'rotate(-46deg)' }]);
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(46deg)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-30deg)' }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(-10%, 22%)' }]);
    }, ms);
  }
  /** The catch: a little dip under the weight, the eyes down onto it. Held under 'guitarlook' (playPose replaces it). */
  strumCatch() {
    const c = this.character;
    this.drop('guitarlook');
    this.hold('guitarlook', (H) => {
      if (c !== 'sahur') for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${c === 'frog' ? 4 : -3}deg) translateY(1.5px)` }]);
    }, 220);
    return this.shot(300, (A) => { A(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(2.5px) scaleY(0.985)', offset: 0.35 }, { transform: 'none' }], { easing: 'ease-out' }); });
  }
  /**
   * Play `strokes` (each one's time in ms from now, when the hand crosses the strings; 'down' or 'up', and its `bar`),
   * `end` ms long in all, on top of strumReady's hold: ONE animation of the strumming limb through every stroke (between
   * two strokes the same way it swings back clear of the strings, as a player's hand does), the fretting hand sliding a
   * little along the neck at each change of chord, the head nodding on the downs.
   */
  strumPlay(strokes: readonly { t: number; kind: 'down' | 'up'; bar: number }[], end: number) {
    const a = this.strumArm(); const c = this.character;
    const kf = (pts: [number, number, string][], f: (v: number) => string): Keyframe[] => pts.map(([t, v, e]) => ({ transform: f(v), offset: Math.min(1, Math.max(0, t / end)), easing: e }));
    const L: [number, number, string][] = [[0, 0, 'ease-in-out']];
    let side = 0; let prev = 0;
    for (const s of strokes) {
      const from = s.kind === 'down' ? -1 : 1;
      const lead = Math.min(110, (s.t - prev) * 0.45);
      if (side !== from) L.push([Math.max(prev + 1, s.t - lead), from, 'cubic-bezier(.4,0,.6,1)']);
      L.push([s.t, 0, 'linear']);
      L.push([s.t + 60, -from * 0.9, 'ease-out']);
      side = -from; prev = s.t + 60;
    }
    L.push([Math.max(end - 1, prev + 120), 0, 'ease-in-out'], [end, 0, 'linear']);
    // the fretting hand: a small slide at each new bar (to the next chord's place on the neck), back home at the end
    const SLIDE = [0, 2.2, -1.6, 1.2, 0];
    const Fr: [number, number, string][] = [[0, 0, 'ease-in-out']];
    let bar = 0;
    for (const s of strokes) if (s.bar !== bar) { Fr.push([Math.max(Fr[Fr.length - 1]![0] + 1, s.t - 140), SLIDE[bar] ?? 0, 'ease-in-out'], [s.t - 30, SLIDE[s.bar] ?? 0, 'ease-out']); bar = s.bar; }
    Fr.push([Math.max(end, Fr[Fr.length - 1]![0] + 1), SLIDE[bar] ?? 0, 'linear']);
    const P: [number, number, string][] = [[0, 0, 'ease-in-out']];
    for (const s of strokes) {
      if (s.kind !== 'down') continue;
      const last = P[P.length - 1]![0];
      if (s.t - 80 > last) P.push([s.t - 80, 0, 'ease-in']);
      P.push([s.t + 30, 1, 'ease-out'], [s.t + 220, 0, 'ease-in-out']);
    }
    P.push([Math.max(end, P[P.length - 1]![0] + 1), 0, 'linear']);
    return this.shot(end, (A, M) => {
      A(a.strum.limb, kf(L, (v) => `rotate(${(v * (a.strum.amp ?? 7)).toFixed(2)}deg)`), { easing: 'linear' });
      if (a.fret) A(a.fret.limb, kf(Fr, (v) => `rotate(${v.toFixed(2)}deg)`), { easing: 'linear' });
      if (c === 'sahur') M(this.q.get('pupil'), kf(P, (v) => `scale(${(1 + 0.08 * v).toFixed(3)})`), { easing: 'linear' });
      else for (const h of this.heads) A(h, kf(P, (v) => `rotate(${((c === 'frog' ? 2.5 : -2.5) * v).toFixed(2)}deg) translateY(${(1.4 * v).toFixed(2)}px)`), { easing: 'linear' });
      if (c === 'cat') A(this.el.tail, kf(P, (v) => `rotate(${(8 * v).toFixed(2)}deg)`), { easing: 'linear' });
    });
  }
  /** Done: the eyes up after the guitar as it is thrown up and away (let go with release('guitarlook')). */
  strumDone(side: Dir) { this.gaze(side * 22, -26, 180); }
  /**
   * Where the eyes look, in % of their travel (the guitar's own: one hold, 'gaze', that each call REPLACES, so looks never
   * add up and push the pupils out of the eyes). gaze() with no arguments lets go.
   */
  gaze(x?: number, y?: number, ms = 220) {
    if (x === undefined) { this.release('gaze', ms); return; }
    this.drop('gaze');
    this.hold('gaze', (_H, M) => { M(this.q.get('pupil'), [{ transform: 'none' }, { transform: `translate(${x}%, ${y ?? 0}%)` }]); }, ms);
  }

  // ---- the mirror selfie (the emo pack's Pet item; director.selfie; DEV only: /emopack). New moves: nothing above uses them ----
  /**
   * What holds the phone up and how far it is raised (degrees; a positive rotate swings a hanging limb to the screen's
   * LEFT), and where the phone goes: into `phone.host` (a group of the drawing) at `phone.at` (the hand, in that group's
   * own units), `w` wide, turned back by the raise so it stands upright (`tilt` more, toward the face). We are the
   * mirror: its camera looks at us. The cat raises her right paw (as we see it) up beside her cheek: her front legs are
   * drawn in her body, under her head, so for the selfie that leg is brought in front of the head (`bring`: the director
   * moves it, keeping her body's every move on it); it was her tail until the operator asked for the paw. The r3tard
   * holds it out from his chest, under his face, on the empty front copy of his left arm (#legLover): his arms are drawn
   * behind his face, and raised any higher his arm went behind it.
   */
  selfieArm(): SelfieArm {
    const own = this.own?.selfieArm?.(); if (own) return own;
    const c = this.character;
    if (c === 'cat') return { limb: this.el.legR, raise: -150, lift: 6, phone: { host: 'legR', at: [120, 199], w: 26, tilt: -8 }, side: 1, bring: { id: 'legR', from: 'body' } };
    if (c === 'frog') return { limb: this.el.legR, raise: 118, phone: { host: 'legR', at: [124, 160], w: 24, tilt: 8 }, side: 1 };
    if (c === 'sahur') return { limb: this.el.legR, raise: -128, upper: { limb: this.el.foreR, deg: -30 }, phone: { host: 'foreR', at: [124.5, 140], w: 20, tilt: -6 }, side: 1 };
    if (c === 'thiccums') return { limb: this.el.legR, raise: -112, phone: { host: 'legR', at: [182, 150], w: 26, tilt: -8 }, side: 1 };
    return { limb: this.el.legL, raise: 64, phone: { host: 'legLover', at: [78.2, 153], w: 22, tilt: 4 }, side: -1 };
  }
  /** The phone up, the head turned a little to it, eyes on us (the mirror). Held as 'selfie'. */
  selfieReady() {
    const a = this.selfieArm();
    this.face('open', 'smug', 200);
    this.hold('selfie', (H, M) => {
      H(a.limb, [{ transform: 'none' }, { transform: `${a.lift ? `translateY(${-a.lift}px) ` : ''}rotate(${a.raise}deg)` }]);
      if (a.upper) H(a.upper.limb, [{ transform: 'none' }, { transform: `rotate(${a.upper.deg}deg)` }]);
      M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0%, 0%)' }]);
    }, 480);
  }
  /** One of the three poses for a shot: smug with the head tipped to the phone; the emo pout, chin down and eyes up; happy.
   *  Held as 'selfiepose' (each replaces the last). */
  selfiePose(n: number) {
    const a = this.selfieArm(); const c = this.character; const side = a.side;
    const sahur = c === 'sahur';
    this.drop('selfiepose');
    const tilt = sahur ? 2 : n === 1 ? -4 : 6;
    if (n === 0) this.face('open', 'smug', 120);
    else if (n === 1) this.face('open', 'frown', 120);
    else this.face('happy', 'smile', 120);
    this.hold('selfiepose', (H, M) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${(side * tilt * (n === 2 ? -1 : 1)).toFixed(1)}deg) translateY(${n === 1 ? 2 : 0}px)` }]);
      if (n === 1) M(this.q.get('pupil'), [{ transform: 'none' }, { transform: 'translate(0%, -16%)' }]);
    }, 160);
  }
  /** The selfie over: the pose let go (the arm comes down with release('selfie')). */
  selfieDone() { this.release('selfiepose', 200); }
  /** After the shots: the eyes down to the phone, to look at what it took. */
  /** Eyes up to the phone as it comes down to the raised hand. Held as 'selfiepose' (the poses replace it). */
  selfieUp() {
    const a = this.selfieArm();
    this.drop('selfiepose');
    this.face('open', 'open', 140);
    this.hold('selfiepose', (_H, M) => { M(this.q.get('pupil'), [{ transform: 'none' }, { transform: `translate(${a.side * 18}%, -30%)` }]); }, 220);
  }
  selfieLook() {
    const a = this.selfieArm();
    this.drop('selfiepose');
    this.face('open', 'smile', 160);
    this.hold('selfiepose', (_H, M) => { M(this.q.get('pupil'), [{ transform: 'none' }, { transform: `translate(${a.side * 26}%, -12%)` }]); }, 260);
  }

  // ---- the falcon (the Habibi pack's Pet item; director.falcon). New moves: nothing above uses them ----
  /**
   * Ready for the falcon: the perch held out for it. The cat keeps still (it lands on her head: she sits on her front legs
   * and cannot raise a paw, see kapparotRaise); the frok holds his forward sleeve straight out in front (-90: the arm
   * level, the falconer's fist); Sahur holds his bat out level to his left (+63.1 undoes the bat's lean, bat_ang in
   * sahur.py); the seal holds its raised flipper out a little lower. A smile. Held as 'falcon'.
   */
  falconReady() {
    const c = this.character;
    this.face('open', 'smile', 200);
    if (this.own?.falconReady) { this.own.falconReady(); return; }
    this.hold('falcon', (H) => {
      if (c === 'frog') H(this.el.legR, [{ transform: 'rotate(0)' }, { transform: `rotate(${FALCON_ARM.frog}deg)` }]);
      if (c === 'sahur') H(this.el.legL, [{ transform: 'rotate(0)' }, { transform: `rotate(${FALCON_ARM.sahur}deg)` }]);
      if (c === 'seal') H(this.el.legL, [{ transform: 'rotate(0)' }, { transform: this.up(-1, FALCON_ARM.seal) }]);
      if (c === 'cat') for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(-1px)' }]);
    }, 520);
  }
  /** The perch gives as the falcon lands on it (a sleeve, the bat, a flipper dips and springs back; the cat's head dips under the weight). */
  falconGive() {
    if (this.own?.falconGive) return this.own.falconGive();
    const c = this.character;
    return this.shot(420, (A) => {
      const dip = (deg: number): KF => [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${deg}deg)`, offset: 0.3, easing: 'ease-in-out' }, { transform: `rotate(${(-0.3 * deg).toFixed(2)}deg)`, offset: 0.65, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }];
      if (c === 'frog') A(this.el.legR, dip(-7));   // (mirrored: a smaller angle is lower)
      if (c === 'sahur') A(this.el.legL, dip(-5));
      if (c === 'seal') A(this.el.legL, dip(-6));
      if (c === 'cat') for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(3px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'translateY(-0.6px)', offset: 0.65 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** The frok draws his arm in (from straight out to FALCON_ARM.frogIn), bringing the falcon close in front of his chest. Held as 'falconIn', over 'falcon'. */
  falconDrawIn(ms = 620): number {
    const deg = FALCON_ARM.frogIn - FALCON_ARM.frog;
    this.hold('falconIn', (H) => { H(this.el.legR, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }]); }, ms);
    return deg;   // the director turns the perched falcon back by as much, the same way, so it stays upright
  }
  /** The frok holds his arm out again for the release (from drawn in to FALCON_ARM.frogOut). Held as 'falconOut', over 'falconIn'. */
  falconHoldOut(ms = 560): number {
    const deg = FALCON_ARM.frogOut - FALCON_ARM.frogIn;
    this.hold('falconOut', (H) => { H(this.el.legR, [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)` }]); }, ms);
    return deg;   // the director turns the perched falcon back by as much
  }
  /**
   * Stroking the falcon, `n` strokes. The frok strokes its breast with his other sleeve (it is on his forward arm, drawn
   * in, measured: the sleeve's end runs down over the breast); Sahur, with the falcon on his cap, waves his free hand up at
   * it (an arm on him cannot reach above his own cap); the seal leans its cheek to it (it is on the flipper by its cheek);
   * the cat, preened, leans into it. All purr and beam.
   */
  falconStroke(n = 3, per = 440, hand = true) {
    const c = this.character;
    this.face('happy', 'smile', 200);
    const ms = per * n + 700;
    return this.shot(ms, (A) => {
      const reach = 350 / ms; const back = 1 - 350 / ms;
      const strokes = (lo: number, hi: number, head = 0): KF => {
        const kf: KF = [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${lo}deg)`, offset: reach, easing: 'ease-in-out' }];
        for (let i = 0; i < n; i++) {
          const t0 = reach + ((back - reach) * (i + 0.5)) / n; const t1 = reach + ((back - reach) * (i + 1)) / n;
          kf.push({ transform: `rotate(${hi}deg)`, offset: t0, easing: 'ease-in-out' }, { transform: `rotate(${lo}deg)`, offset: t1, easing: 'ease-in-out' });
        }
        kf.push({ transform: `rotate(${head}deg)`, offset: 1 });
        return kf;
      };
      if (c === 'frog') A(this.el.legL, strokes(FALCON_ARM.strokeLo, FALCON_ARM.strokeHi));
      if (c === 'sahur' && hand) A(this.el.legR, strokes(FALCON_ARM.patLo, FALCON_ARM.patHi));   // (not while it is out on his bat)
      const tilt = c === 'seal' ? -4 : c === 'cat' ? 3 : c === 'frog' ? 4 : 2;   // (the seal leans its cheek to the bird by its flipper: more, and its head hid it)
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${tilt}deg)`, offset: 0.25, easing: 'ease-in-out' }, { transform: `rotate(${tilt}deg)`, offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.cat, K.purr, { duration: 80, iterations: Math.floor(ms / 80) - 1, direction: 'alternate', easing: 'linear' });
      A(this.el.tail, K.wag, { duration: 520, iterations: Math.max(1, Math.floor(ms / 520)), direction: 'alternate', easing: 'ease-in-out' });
      if (c === 'seal') A(this.el.legR, [{ transform: 'rotate(0)', offset: 0 }, { transform: this.up(1, 22), offset: 0.3 }, { transform: this.up(1, 8), offset: 0.45 }, { transform: this.up(1, 22), offset: 0.6 }, { transform: 'rotate(0)', offset: 1 }], { easing: 'ease-in-out' });
    });
  }
  /** It shakes out its feathers right by the face: a squint and a flinch. */
  falconFlinch(ms = 560) {
    this.face('squeeze', 'smile', 90);
    return this.shot(ms, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(1.5px) rotate(-1.5deg)', offset: 0.2 }, { transform: 'translateY(1.5px) rotate(1.5deg)', offset: 0.5 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-14deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(14deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
    });
  }

  // ---- Fight Club (2026-09-28): the one door into the rig that fight/moves.ts uses. Every fight move lives there, so the
  // rig itself stays as it is; this only hands out the building blocks the rig's own moves are made of. ----
  /** @internal for fight/moves.ts only */
  fightKit() {
    return {
      el: this.el, q: this.q, heads: this.heads, bodies: this.bodies, root: this.root, lite: this.lite,
      shot: this.shot.bind(this), hold: this.hold.bind(this), w: <T extends number>(d: T) => this.w(d), up: this.up.bind(this),
    };
  }
}
