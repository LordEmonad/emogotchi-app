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
export type Mouth = 'idle' | 'smug' | 'open' | 'smile' | 'frown' | 'yum';
export type Dir = -1 | 1;

type KF = Keyframe[];
type Opts = KeyframeAnimationOptions;
export type LoopHandle = { stop: () => Promise<void> };

const ADD: Opts = { composite: 'add' };
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
    { transform: 'scale(0) rotate(0)', opacity: 0, offset: 0 }, { transform: 'scale(1.3) rotate(30deg)', opacity: 1, offset: 0.3 },
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

// ---------------- the rig ----------------
export class PetRig {
  private el: Record<string, Element | null> = {};
  private q = new Map<string, Element[]>();
  private idle: Animation[] = [];
  private moodAnims: Animation[] = [];
  private holds = new Map<string, Animation[]>();
  private mood: Mood = 'idle';
  private destroyed = false;
  private opacityLoopTargets = new Set<Element>();
  private eyesNow: Eyes = 'open';
  private mouthNow: Mouth = 'idle';
  private flickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private root: SVGSVGElement) {
    for (const id of ['cat', 'figure', 'shadow', 'tail', 'headstack', 'earL', 'earR', 'hairback', 'body', 'pendant', 'head', 'eyeL', 'eyeR', 'mouth',
      'fringe', 'crown', 'crownlift', 'glintL', 'glintC', 'glintR', 'sweat', 'tear', 'dirt', 'stink', 'zzz', 'legL', 'legR', 'footL', 'footR',
      'mouth-idle', 'mouth-smug', 'mouth-open', 'mouth-smile', 'mouth-frown', 'mouth-yum', 'whiskers', 'halo',
      'witchhat', 'robe', 'sleeveL', 'sleeveR']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.q.set('pupil', [...root.querySelectorAll('.pupil')]);
    this.q.set('lid', [...root.querySelectorAll('.lid')]);
    for (const k of ['open', 'closed', 'happy', 'squeeze', 'x']) this.q.set(k, [...root.querySelectorAll('.eye .' + k)]);
    this.q.set('z', [...root.querySelectorAll('#zzz .z')]);
    this.q.set('s', [...root.querySelectorAll('#stink .s')]);
    root.setAttribute('data-rig', 'on');
    // alternates are hidden by attribute in the file; switch them to opacity so they can crossfade
    for (const id of ['mouth-smug', 'mouth-open', 'mouth-smile', 'mouth-frown', 'mouth-yum', 'glintL', 'glintC', 'glintR', 'sweat', 'tear', 'zzz', 'stink']) this.show(this.el[id], 0);
    for (const e of [...this.q.get('closed')!, ...this.q.get('happy')!, ...this.q.get('squeeze')!, ...this.q.get('x')!, ...this.q.get('z')!, ...this.q.get('s')!]) this.show(e, 0);
    this.show(this.el.halo, 0);
    this.show(this.el.dirt, 0);
    this.startIdle();
  }

  get currentMood() { return this.mood; }
  /** Face, back hair and crown always move as one unit around the neck pivot (pet.css gives all three the same origin). */
  private get heads(): Element[] { return [this.el.head, this.el.headstack, this.el.crown, this.el.witchhat].filter((e): e is Element => !!e); }

  private show(e: Element | null | undefined, opacity: number) {
    if (!e) return;
    const s = (e as HTMLElement).style;
    s.display = 'inline';
    s.opacity = String(opacity);
  }
  private one(e: Element | null | undefined, kf: KF, opts: Opts): Animation | null {
    if (!e || this.destroyed) return null;
    return e.animate(kf, opts);
  }
  private many(es: Element[] | undefined, kf: KF, opts: Opts): Animation[] {
    if (this.destroyed) return [];
    return (es ?? []).map((e) => e.animate(kf, opts));
  }

  // ---- idle: runs forever ----
  private startIdle() {
    if (reduceMotion()) return;
    const A = (e: Element | null | undefined, kf: KF, o: Opts) => { const a = this.one(e, kf, { ...ADD, ...o }); if (a) this.idle.push(a); };
    for (const l of this.q.get('lid') ?? []) A(l, K.blink, { duration: 9200, iterations: Infinity });
    A(this.el.tail, K.sway, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    A(this.el.body, K.breathe, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    for (const id of ['head', 'headstack', 'crown', 'witchhat']) A(this.el[id], K.headBob, { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -250 });
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
  /** Set by the director while an action runs, so idle flourishes stay out of the way. */
  busy = false;

  // ---- crossfades ----
  private fade(e: Element | null | undefined, to: number, ms = 180): Animation | null {
    if (!e || this.destroyed) return null;
    const from = Number((e as HTMLElement).style.opacity || '1');
    (e as HTMLElement).style.opacity = String(to);
    return e.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out' });
  }
  private mouth(which: Mouth, ms = 180) {
    this.mouthNow = which;
    for (const m of ['idle', 'smug', 'open', 'smile', 'frown', 'yum'] as const) this.fade(this.el['mouth-' + m], m === which ? 1 : 0, ms);
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

  // ---- toggles ----
  private crownOn = false;
  private costumeOn = false;
  /** Crown + costume = the golden version of the costume, since a hat hides the crown itself. */
  private gild() {
    this.el.witchhat?.classList.toggle('gold', this.crownOn && this.costumeOn);
  }
  setCrown(on: boolean, ms = 240) {
    this.crownOn = on; this.gild();
    const c = this.el.crown as HTMLElement | null;
    if (!c) return;
    const cur = c.style.opacity === '' ? 1 : Number(c.style.opacity);
    if ((cur > 0.5) === on) return;
    this.fade(c, on ? 1 : 0, ms);
  }
  /**
   * The witch outfit: hat in the head unit, robe in the body, a sleeve in each leg. One switch, because
   * they are one costume; the pieces fade together.
   */
  setCostume(on: boolean, ms = 240) {
    this.costumeOn = on; this.gild();
    // Off means display:none, not opacity 0. #body and #figure take their transform pivot from their
    // bounding box, and an invisible robe still widens that box, which moved every cat's squash and
    // crouch pivot by a few pixels. Out of layout entirely until worn.
    for (const id of ['witchhat', 'robe', 'sleeveL', 'sleeveR']) {
      const e = this.el[id] as HTMLElement | null;
      if (!e) continue;
      if (on) { e.style.display = 'inline'; e.style.opacity = '0'; this.fade(e, 1, ms); }
      else if (e.style.display === 'inline') { this.fade(e, 0, ms); setTimeout(() => { if (e.style.opacity === '0') e.style.display = 'none'; }, ms + 20); }
    }
    // the halo floats over the hair; with a hat on it has to clear the tip of the cone instead
    const halo = this.el.halo as HTMLElement | null;
    if (halo) halo.style.transform = on ? 'translateY(-56px)' : '';
  }
  private stinkAnims: Animation[] = [];
  setDirty(on: boolean) {
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
  /** Release every held pose except the ones that define a lasting state (death). */
  releaseAll(ms = 300) { for (const k of [...this.holds.keys()]) if (k !== 'dead') this.release(k, ms); }
  holding(key: string) { return this.holds.has(key); }

  /** Lean into a direction of travel (whole body, head, tail, eyes). 0 straightens up. */
  lean(dir: Dir | 0) {
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
    this.hold('look', (H, M) => {
      M(this.q.get('pupil'), [{ transform: 'translate(0,0)' }, { transform: `translate(${dx * 14}%, ${dy * 10}%)` }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dx * 3}deg) translateY(${dy * 1.5}px)` }]);
    }, 220);
  }
  unlook() { this.release('look', 260); }
  /** Anticipation before a pounce. */
  crouch(dir: Dir) {
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
    const period = 640;
    const o: Opts = { duration: period, iterations: n, ...ADD, easing: 'linear' };
    if (!reduceMotion()) {
      // dip into the bowl (the head foreshortens a touch), come up, chew on the way, settle
      for (const h of this.heads) this.one(h, [
        { transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `translateY(7px) rotate(${dir * 1.5}deg) scaleY(0.97)`, offset: 0.3, easing: 'ease-in-out' },
        { transform: `translateY(7px) rotate(${dir * 1.5}deg) scaleY(0.97)`, offset: 0.42, easing: 'ease-in-out' }, { transform: `translateY(1px) rotate(${-dir * 0.5}deg)`, offset: 0.62, easing: 'ease-in-out' },
        { transform: 'translateY(2px)', offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 },
      ], o);
      this.one(this.el.body, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(2px) scaleY(0.975)', offset: 0.34, easing: 'ease-in-out' }, { transform: 'translateY(2px) scaleY(0.975)', offset: 0.44, easing: 'ease-in-out' }, { transform: 'none', offset: 0.7 }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.tail, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(6deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 0.6 }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(-8deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], o);
      this.one(this.el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.05)', offset: 0.3 }, { transform: 'scaleX(1)', offset: 0.5 }, { transform: 'scaleX(1)', offset: 1 }], o);
    }
    const small = () => { if (this.el['mouth-open']) this.one(this.el['mouth-open'], [{ transform: 'scale(0.55)' }, { transform: 'scale(0.55)' }], { duration: period * 0.12, ...ADD, fill: 'none' }); };
    for (let i = 0; i < n; i++) {
      await wait(period * 0.16); this.face(undefined, 'open', 110);              // mouth opens on the way down
      await wait(period * 0.26); this.face(undefined, 'idle', 120); onBite?.(i);  // bite at the bottom
      await wait(period * 0.22); small(); this.face(undefined, 'open', 70);       // chew, chew
      await wait(period * 0.1); this.face(undefined, 'idle', 70);
      await wait(period * 0.08); small(); this.face(undefined, 'open', 70);
      await wait(period * 0.1); this.face(undefined, 'idle', 80);
      await wait(period * 0.08);
    }
  }
  /** Two quick sniffs at something in front. */
  sniff() {
    return this.shot(700, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(3px) scale(1.02)', offset: 0.22 }, { transform: 'translateY(1px)', offset: 0.42 }, { transform: 'translateY(4px) scale(1.025)', offset: 0.64 }, { transform: 'none', offset: 1 }]);
      A(this.el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.08) translateY(-1px)', offset: 0.22 }, { transform: 'scaleX(1)', offset: 0.42 }, { transform: 'scaleX(1.08) translateY(-1px)', offset: 0.64 }, { transform: 'scaleX(1)', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(7deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-7deg)', offset: 0.3 }, { transform: 'none', offset: 0.5 }, { transform: 'rotate(-7deg)', offset: 0.7 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Lick the bowl clean: head low, sweeping side to side with the tongue out. */
  async lickBowl(dir: Dir) {
    this.face('happy', 'yum', 160);
    await this.shot(900, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `translate(${-dir * 4}px, 6px) scaleY(0.97)`, offset: 0.3, easing: 'ease-in-out' }, { transform: `translate(${dir * 4}px, 7px) scaleY(0.97)`, offset: 0.6, easing: 'ease-in-out' }, { transform: `translate(${-dir * 2}px, 5px)`, offset: 0.8, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.5 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** A pleased full-body shimmy. */
  shimmy() {
    return this.shot(640, (A) => {
      A(this.el.body, [{ transform: 'none', offset: 0 }, { transform: 'translateX(-3px) rotate(-1.5deg)', offset: 0.17 }, { transform: 'translateX(3px) rotate(1.5deg)', offset: 0.34 }, { transform: 'translateX(-3px) rotate(-1.5deg)', offset: 0.5 }, { transform: 'translateX(3px) rotate(1.5deg)', offset: 0.67 }, { transform: 'translateX(-1.5px)', offset: 0.84 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateX(-1px) rotate(-2.5deg)', offset: 0.17 }, { transform: 'translateX(1px) rotate(2.5deg)', offset: 0.34 }, { transform: 'translateX(-1px) rotate(-2.5deg)', offset: 0.5 }, { transform: 'translateX(1px) rotate(2.5deg)', offset: 0.67 }, { transform: 'translateX(-0.5px) rotate(-1deg)', offset: 0.84 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.tail, [{ transform: 'none', offset: 0 }, { transform: 'rotate(12deg)', offset: 0.25 }, { transform: 'rotate(-10deg)', offset: 0.5 }, { transform: 'rotate(8deg)', offset: 0.75 }, { transform: 'none', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(8deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]); A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-8deg)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** Bunny kicks: the hind feet take turns, fast. */
  bunnyKick(n = 5) {
    const per = 170;
    return this.shot(per * n, (A) => {
      A(this.el.footL, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateY(-7px) rotate(-12deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], { duration: per, iterations: n });
      A(this.el.footR, [{ transform: 'translateY(-7px) rotate(12deg)', offset: 0, easing: 'ease-in-out' }, { transform: 'none', offset: 0.5, easing: 'ease-in-out' }, { transform: 'translateY(-7px) rotate(12deg)', offset: 1 }], { duration: per, iterations: n });
      A(this.el.body, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'translateX(2px) rotate(1deg)', offset: 0.5, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }], { duration: per, iterations: n });
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
    this.hold('tilt', (H) => { for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 11}deg) translateY(1px)` }]); }, 380);
  }
  /** A quick tentative paw tap at something on side `dir`. */
  pat(dir: Dir) {
    const leg = dir < 0 ? this.el.legL : this.el.legR;
    return this.shot(300, (A) => {
      A(leg, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 40}deg) translateY(-10px)`, offset: 0.4, easing: 'ease-in' }, { transform: `rotate(${dir * 42}deg) translateY(-4px)`, offset: 0.62, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 2}deg) translateY(1px)`, offset: 0.5 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** The pre-pounce butt wiggle. */
  wiggleButt() {
    return this.shot(660, (A) => {
      A(this.el.body, [{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(-3px)', offset: 0.17 }, { transform: 'translateX(3px)', offset: 0.34 }, { transform: 'translateX(-3px)', offset: 0.5 }, { transform: 'translateX(3px)', offset: 0.67 }, { transform: 'translateX(-2px)', offset: 0.84 }, { transform: 'translateX(0)', offset: 1 }], { easing: 'ease-in-out' });
      A(this.el.tail, [{ transform: 'rotate(0)', offset: 0 }, { transform: 'rotate(-14deg)', offset: 0.17 }, { transform: 'rotate(10deg)', offset: 0.34 }, { transform: 'rotate(-14deg)', offset: 0.5 }, { transform: 'rotate(10deg)', offset: 0.67 }, { transform: 'rotate(-8deg)', offset: 0.84 }, { transform: 'rotate(0)', offset: 1 }], { easing: 'ease-in-out' });
      for (const h of this.heads) A(h, [{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(1.5px)', offset: 0.17 }, { transform: 'translateX(-1.5px)', offset: 0.34 }, { transform: 'translateX(1.5px)', offset: 0.5 }, { transform: 'translateX(-1.5px)', offset: 0.67 }, { transform: 'translateX(0)', offset: 1 }], { easing: 'ease-in-out' });
    });
  }
  /** Holding the ball between the paws. */
  hug() {
    this.face('happy', 'smile', 200);
    this.hold('hug', (H) => {
      H(this.el.legL, [{ transform: 'none' }, { transform: 'rotate(14deg) translateY(-2px)' }]);
      H(this.el.legR, [{ transform: 'none' }, { transform: 'rotate(-14deg) translateY(-2px)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(-3deg)' }]);
      H(this.el.tail, K.wag, { duration: 520, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'ease-in-out' });
    }, 360);
  }
  /** Hunker down over a bowl in front, a little to side `dir`: body low, head down into it. */
  eatPose(dir: Dir) {
    this.hold('eat', (H) => {
      // the whole front hunches: shoulders drop with the body squash, the head unit follows them down and a little further
      H(this.el.body, [{ transform: 'none' }, { transform: 'translateY(4px) scaleY(0.88) scaleX(1.04)' }]);
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 5}deg) translate(${dir * 2}px, 26px)` }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-10deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(-14deg)' }]);
    }, 520);
  }
  /** Lean into a stroke from side `dir`. */
  nuzzle(dir: Dir) {
    this.face('happy', 'smile', 200);
    this.hold('nuzzle', (H) => {
      for (const h of this.heads) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 9}deg) translate(${dir * 3}px, 2px)` }]);
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
    this.lean(dir);
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
    const handle = this.loop((L, M) => {
      const o: Opts = { duration: dur, easing: 'linear' };
      L(this.el.figure, K.hop2, o); L(this.el.figure, rock, o); L(this.el.shadow, K.shadowHop, o);
      L(this.el.legL, leg(1), o); L(this.el.legR, leg(-1), o);
      L(this.el.footL, K.feetDangle, o); L(this.el.footR, K.feetDangle, o);
      L(this.el.head, K.headLag, o); L(this.el.headstack, K.headLag, o); L(this.el.crown, K.headLag, o); L(this.el.witchhat, K.headLag, o);
      L(this.el.fringe, K.fringeLag, o); L(this.el.earL, K.earBounce, o); L(this.el.earR, K.earBounce, o);
      L(this.el.pendant, pend, o); L(this.el.tail, tail, o);
      void M;
    });
    return { stop: async () => { this.lean(0); await handle.stop(); } };
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
    return this.shot(320, (A) => {
      A(this.el.figure, K.land); for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(3px)', offset: 0.3 }, { transform: 'none', offset: 1 }]);
      A(this.el.fringe, [{ transform: 'none', offset: 0 }, { transform: 'translateY(2px)', offset: 0.35 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, K.earWiggle); A(this.el.earR, K.earWiggle);
    });
  }
  hop() {
    return this.shot(420, (A) => {
      A(this.el.figure, K.hopSmall); A(this.el.shadow, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(0.85)', offset: 0.42 }, { transform: 'scaleX(1)', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(2px)', offset: 0.12 }, { transform: 'translateY(-2px)', offset: 0.5 }, { transform: 'translateY(2px)', offset: 0.78 }, { transform: 'none', offset: 1 }]);
      A(this.el.pendant, K.pendantSwing);
    });
  }
  /** Swipe a paw at something on side `dir`. */
  bat(dir: Dir) {
    const leg = dir < 0 ? this.el.legL : this.el.legR;
    return this.shot(340, (A) => {
      A(leg, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: `rotate(${dir * 42}deg) translateY(-6px)`, offset: 0.35, easing: 'ease-in' }, { transform: `rotate(${-dir * 6}deg)`, offset: 0.72, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      A(this.el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 3}deg) translateX(${dir * 2}px)`, offset: 0.35 }, { transform: 'none', offset: 1 }]);
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${dir * 4}deg)`, offset: 0.4 }, { transform: 'none', offset: 1 }]);
    });
  }
  /** One bite: head dips, mouth opens and closes, an ear wiggles. */
  async chomp(dir: Dir) {
    this.face(undefined, 'open', 90);
    const p = this.shot(360, (A) => {
      A(this.el.head, K.chompHead); A(this.el.headstack, K.chompHead); A(this.el.crown, K.chompHead); A(this.el.witchhat, K.chompHead); A(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(1.5px) scaleY(0.99)', offset: 0.45 }, { transform: 'none' }]);
      A(dir < 0 ? this.el.earL : this.el.earR, K.earWiggle);
    });
    await wait(190);
    this.face(undefined, 'idle', 90);
    await p;
  }
  async lick() {
    this.face('happy', 'yum', 160);
    await this.shot(760, (A) => { A(this.el.head, K.lickHead); A(this.el.headstack, K.lickHead); A(this.el.crown, K.lickHead); A(this.el.witchhat, K.lickHead); });
  }
  /** Shake off water. */
  shake() {
    return this.shot(760, (A) => {
      A(this.el.head, K.shakeHead); A(this.el.headstack, K.shakeHead); A(this.el.crown, K.shakeHead); A(this.el.witchhat, K.shakeHead); A(this.el.figure, K.shakeBody);
      A(this.el.earL, K.shakeEar); A(this.el.earR, K.shakeEar); A(this.el.fringe, K.shakeFringe); A(this.el.pendant, K.pendantSwing);
    });
  }
  /** Wake-up stretch with a yawn. */
  async stretch() {
    const ms = 1500;
    const p = this.shot(ms, (A) => {
      A(this.el.figure, K.stretchBody); A(this.el.head, K.stretchHead); A(this.el.headstack, K.stretchHead); A(this.el.crown, K.stretchHead); A(this.el.witchhat, K.stretchHead);
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
    const ms = 1600;
    const p = this.shot(ms, (A) => {
      for (const h of this.heads) A(h, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.3 }, { transform: 'rotate(-5deg) translateY(-3px)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'rotate(1.5deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.earL, [{ transform: 'none', offset: 0 }, { transform: 'rotate(-18deg)', offset: 0.3 }, { transform: 'rotate(-18deg)', offset: 0.62 }, { transform: 'rotate(6deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.earR, [{ transform: 'none', offset: 0 }, { transform: 'rotate(18deg)', offset: 0.3 }, { transform: 'rotate(18deg)', offset: 0.62 }, { transform: 'rotate(-6deg)', offset: 0.8 }, { transform: 'none', offset: 1 }]);
      A(this.el.body, [{ transform: 'none', offset: 0 }, { transform: 'scaleY(1.03)', offset: 0.35 }, { transform: 'scaleY(1.03)', offset: 0.6 }, { transform: 'none', offset: 1 }]);
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
    await this.shot(900, (A) => { A(this.el.body, K.rumble); for (const h of this.heads) A(h, K.rumbleHead); A(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-14deg)', offset: 0.4 }, { transform: 'none' }]); A(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(14deg)', offset: 0.4 }, { transform: 'none' }]); });
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
    this.hold('dead', (H) => {
      H(this.el.figure, [{ transform: 'none' }, { transform: 'translateY(-40px)' }]);
      H(this.el.earL, [{ transform: 'none' }, { transform: 'rotate(-18deg)' }]);
      H(this.el.earR, [{ transform: 'none' }, { transform: 'rotate(18deg)' }]);
      H(this.el.tail, [{ transform: 'none' }, { transform: 'rotate(10deg)' }]);
    }, 1500);
    this.setGhost(true);
    await wait(1500);
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
      for (const h of this.heads) L(h, K.nod, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      L(this.el.body, K.breatheSlow, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      L(this.el.tail, K.swaySlow, { duration: 6000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      L(this.el.crownlift, K.crownSlip, { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
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
      L(this.el.tear, K.tearDrip, { duration: 3200, iterations: Infinity, easing: 'ease-in-out', composite: 'replace' });
      if (this.el.tear) { this.opacityLoopTargets.add(this.el.tear); this.fade(this.el.tear, 1, 0); }
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
    if (this.flickTimer) clearTimeout(this.flickTimer);
    this.root.setAttribute('data-rig', 'destroyed');
    for (const a of this.root.getAnimations({ subtree: true })) a.cancel();
  }
}
