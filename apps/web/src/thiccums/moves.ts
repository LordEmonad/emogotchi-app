/**
 * Thiccums' own moves (LAB ONLY: only the lab imports this, and the lab exists only in dev builds). The rig asks these
 * first wherever a character's own move goes (rig.ts registerOwnMoves); everything else he does is the shared rig.
 *
 * The butt. Two groups in thiccums.svg: #butt, the near cheek (a round cheek whose lines are all inside the silhouette),
 * and #buttfar, the far cheek (the haunch bulging out on his left, its outline part of the silhouette, its two ends in
 * creases, so it is bent, not squashed: see bendFar). Every frame a spring works out how far the butt lags behind the body: a tiny mark in #body is read on the
 * screen, its acceleration drives damped springs (vertical and sideways), and their stretch goes onto both cheeks (the
 * near one squashes and stretches about its bottom, the far one bulges and draws in, on its own slower spring, so they
 * wobble against each other), onto the fin (#fin, in #body: a flick about its root) and onto a cape if he wears one (a sway). So
 * it bounces on everything he does, the walk's hops, a jump, a landing, a shake, a squat, being carried across the room,
 * without any move having to know. On top of that: `kick()` gives it a shove, and `bounce()` is the showcase.
 *
 * His flippers are twins, each hanging from a shoulder under the head: the near one (#legR) down his right side, the far
 * one (#legL) down his left, short, its tip low on his side. up() swings the near one out and up, upL() the far one.
 */
import type { PetRig, Dir, OwnMoves, DrumArm } from '../pet/rig';

type Kit = ReturnType<PetRig['kit']>;
type KF = Keyframe[];
const SVG_NS = 'http://www.w3.org/2000/svg';
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** out and up by `deg` (negative: in and down): the near flipper (up) and the far one (upL), which hang on opposite sides */
const up = (deg: number) => `rotate(${(-deg).toFixed(2)}deg)`;
const upL = (deg: number) => `rotate(${deg.toFixed(2)}deg)`;
/** thiccums.py: where he sits (#body's pivot) and the neck (the head unit's pivot), in svg units */
const SEAT = { x: 106.21, y: 210.7 }; const NECK = { x: 118.97, y: 113.49 };
/**
 * The head unit's transform that keeps it on a body turned `deg` and scaled (sx, sy) about the seat (#body's transform
 * `rotate(deg) scale(sx, sy)`): the neck goes where the body takes it, and the head turns with it about the neck. The
 * head is not in #body (it is drawn over it), so anything that squashes the body has to carry the head along like this.
 */
export function bodyHead(sx: number, sy: number, deg: number) {
  const a = (deg * Math.PI) / 180; const nx = (NECK.x - SEAT.x) * sx; const ny = (NECK.y - SEAT.y) * sy;
  const x = nx * Math.cos(a) - ny * Math.sin(a); const y = nx * Math.sin(a) + ny * Math.cos(a);
  return `translate(${(x - (NECK.x - SEAT.x)).toFixed(2)}px, ${(y - (NECK.y - SEAT.y)).toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
}

/** A damped spring on one axis: `x` is how far the mass lags behind its anchor, in svg units. */
class Spring {
  x = 0; v = 0;
  constructor(private w: number, private z: number) {}
  step(a: number, dt: number) {
    // semi-implicit Euler in a few sub-steps (w * dt stays well under 1)
    const n = 3; const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-this.w * this.w * this.x - 2 * this.z * this.w * this.v - a) * h; this.x += this.v * h; }
    if (this.x > 7) { this.x = 7; this.v = Math.min(this.v, 0); }
    if (this.x < -7) { this.x = -7; this.v = Math.max(this.v, 0); }
  }
  get quiet() { return Math.abs(this.x) < 0.004 && Math.abs(this.v) < 0.02; }
}

/**
 * The far cheek's outline and fill from its points (thiccums.py far_polys(), the same arithmetic to the digit, so the
 * drawing at rest and a reshaped one match): c is the outline from the wedge up to the crease, [x, y, width, t]; inner is
 * the rest of the fill's edge. Returns [fill d, line d].
 */
type P4 = [number, number, number, number]; type P2 = [number, number];
function farPolys(c: P4[], inner: P2[]): [string, string] {
  const f = (v: number) => v.toFixed(2);
  const fill = 'M' + c.map((p) => `${f(p[0])},${f(p[1])}`).join(' L') + ' L' + inner.map((p) => `${f(p[0])},${f(p[1])}`).join(' L') + ' Z';
  const n = c.length; const L: P2[] = []; const R: P2[] = [];
  c.forEach(([x, y, w], i) => {
    const a = c[Math.max(i - 1, 0)]!; const b = c[Math.min(i + 1, n - 1)]!;
    const tx = b[0] - a[0]; const ty = b[1] - a[1]; const m = Math.hypot(tx, ty) || 1; const nx = -ty / m; const ny = tx / m;
    L.push([x + (nx * w) / 2, y + (ny * w) / 2]); R.push([x - (nx * w) / 2, y - (ny * w) / 2]);
  });
  const cap = (i: number, j: number) => {
    const [x, y, w] = c[i]!; const q = c[j]!; const tx = x - q[0]; const ty = y - q[1]; const m = Math.hypot(tx, ty) || 1;
    const a0 = Math.atan2(ty / m, tx / m); const out: P2[] = [];
    for (let k = 1; k < 6; k++) out.push([x + (w / 2) * Math.cos(a0 - Math.PI / 2 + (Math.PI * k) / 6), y + (w / 2) * Math.sin(a0 - Math.PI / 2 + (Math.PI * k) / 6)]);
    return out;
  };
  const ring = [...L, ...cap(n - 1, n - 2).reverse(), ...R.reverse(), ...cap(0, 1).reverse()];
  return [fill, 'M' + ring.map((p) => `${f(p[0])},${f(p[1])}`).join(' L') + ' Z'];
}

/**
 * Every live Jiggle on the page runs off ONE frame loop that first reads where each one's mark is (all the reads) and then
 * moves every spring and writes every cheek (all the writes): with a street of seals (Emotown), one seal's writes would
 * otherwise force the browser to lay the page out again before the next seal's read, once per seal a frame.
 */
const LIVE = new Set<Jiggle>();
let RAF = 0;
function frame(t: number) {
  RAF = 0;
  const all = [...LIVE];
  for (const j of all) j.measure(t);
  for (const j of all) j.step();
  if (LIVE.size) RAF = requestAnimationFrame(frame);
}
/** the nearest ancestor that scrolls (the town's street, a panel), or null for the document itself */
function scrollParent(e: Element): Element | null {
  for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) return p;
  }
  return null;
}

/**
 * The bouncy butt: the springs, the frame loop, and what they do to the two cheeks. Reads one tiny mark in #body a frame
 * (the mark moves with every body, figure and room move there is) and writes the two cheeks' inline transforms, which the
 * rig's own animations on them (bounce) add onto. The mark is measured against what he is drawn on (the page, or the
 * street it scrolls in), not the screen: scrolling moves him on the screen without moving him, and must not shake him.
 * A calm rig (Emotown's street) springs only while it is on screen (an IntersectionObserver); the layered rig (WebKit on
 * the street, the r1) has no svg to put the mark in and does not spring at all (the showcase's keyframes still play).
 */
class Jiggle {
  private near: SVGGElement | null; private far: SVGGElement | null; private mark: SVGCircleElement | null = null;
  private fin: SVGGElement | null; private capes: SVGGElement[];
  /** the far cheek, bendable: its points, each point's outward normal, and the three paths drawn from them */
  private farC: P4[] = []; private farN: P2[] = []; private farI: P2[] = [];
  private farEls: { fill: SVGPathElement | null; line: SVGPathElement | null; clip: SVGPathElement | null; rest: [string, string] } | null = null;
  private vy = new Spring(2 * Math.PI * 5.2, 0.16); private vx = new Spring(2 * Math.PI * 4.4, 0.18);
  private fy = new Spring(2 * Math.PI * 4.6, 0.2); private fx = new Spring(2 * Math.PI * 3.9, 0.2);
  private last = 0; private p: { x: number; y: number } | null = null; private vel = { x: 0, y: 0 }; private acc = { x: 0, y: 0 };
  private rest = true; private dt = 1 / 60; private seen = false;
  private scroller: Element | null | undefined = undefined;   // undefined: not looked for yet; null: the document
  private io: IntersectionObserver | null = null;
  /** how hard it lags (multiplies the anchor's acceleration) */
  gain = 2;
  constructor(private k: Kit) {
    this.near = k.root.querySelector<SVGGElement>('#butt');
    this.far = k.root.querySelector<SVGGElement>('#buttfar');
    this.fin = k.root.querySelector<SVGGElement>('#fin');
    try {
      const m = JSON.parse(this.far?.getAttribute('data-morph') ?? 'null') as { c: P4[]; i: P2[] } | null;
      if (m && this.far) {
        this.farC = m.c; this.farI = m.i;
        // each point's outward normal (the outline runs from the wedge up his left side to the crease: outside is to its left)
        this.farN = m.c.map((_, i): P2 => {
          const a = m.c[Math.max(i - 1, 0)]!; const b = m.c[Math.min(i + 1, m.c.length - 1)]!;
          const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1;
          return [dy / l, -dx / l];
        });
        this.farEls = { fill: this.far.querySelector('#thiccfarfill'), line: this.far.querySelector('#thiccfarline'), clip: k.root.querySelector('#thiccfarclippath'), rest: farPolys(m.c, m.i) };
      }
    } catch { /* no morph: the far cheek just stays put */ }
    this.capes = [...k.root.querySelectorAll<SVGGElement>('#robe, #bisht')];
    const body = k.root.querySelector('#body');
    if (body && !(k.root instanceof HTMLElement)) {
      const c = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement;
      c.setAttribute('cx', '120'); c.setAttribute('cy', '165'); c.setAttribute('r', '0.01'); c.setAttribute('fill', 'none');
      c.setAttribute('class', 'thicc-mark');
      body.appendChild(c); this.mark = c;
    }
    if (reduceMotion() || !this.mark) return;
    if (!k.calm) this.wake();
    else if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) this.wake(); else this.sleep(); } });
      this.io.observe(k.root);
    }
  }
  private wake() {
    if (LIVE.has(this)) return;
    this.p = null; this.last = 0; this.vel = { x: 0, y: 0 }; this.acc = { x: 0, y: 0 };   // no jump from where it was when it slept
    LIVE.add(this);
    if (!RAF) RAF = requestAnimationFrame(frame);
  }
  private sleep() {
    if (!LIVE.delete(this)) return;
    this.vy.x = this.vx.x = this.fy.x = this.fx.x = 0; this.vy.v = this.vx.v = this.fy.v = this.fx.v = 0;
    this.rest = false; this.apply();   // back to rest, drawn so
  }
  /** A shove: `vy` downward (a landing) or upward (negative), `vx` sideways, in svg units a second. */
  kick(vy: number, vx = 0) { this.vy.v += vy; this.fy.v += vy * 0.9; this.vx.v += vx; this.fx.v += vx * 0.9; this.rest = false; }
  /** a shove for the far cheek alone (the showcase's beats) */
  kickFar(vy: number, vx = 0) { this.fy.v += vy; this.fx.v += vx; this.rest = false; }
  /** The read half of a frame: where the mark is now, against what he is drawn on, and how it is accelerating. */
  measure(t: number) {
    this.seen = false;
    if (this.k.destroyed() || !this.mark) { LIVE.delete(this); return; }
    this.dt = this.last ? Math.min(0.05, Math.max(0.001, (t - this.last) / 1000)) : 1 / 60;
    this.last = t;
    const svg = this.k.root as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    if (box.width <= 0) return;   // not drawn (display:none off the street): nothing to measure
    if (this.scroller === undefined) this.scroller = scrollParent(svg);
    const sc = this.scroller;
    const o = sc ? (() => { const b = sc.getBoundingClientRect(); return { x: b.left - sc.scrollLeft, y: b.top - sc.scrollTop }; })() : { x: -window.scrollX, y: -window.scrollY };
    const s = box.width / 200;   // screen px a unit
    const r = this.mark.getBoundingClientRect();
    const p = { x: (r.left + r.width / 2 - o.x) / s, y: (r.top + r.height / 2 - o.y) / s };
    if (this.p) {
      const vx = (p.x - this.p.x) / this.dt; const vy = (p.y - this.p.y) / this.dt;
      // a light low-pass on the acceleration (a frame's rounding on screen is noise)
      const ax = (vx - this.vel.x) / this.dt; const ay = (vy - this.vel.y) / this.dt;
      this.acc.x = this.acc.x * 0.35 + ax * 0.65; this.acc.y = this.acc.y * 0.35 + ay * 0.65;
      this.vel = { x: vx, y: vy };
    }
    this.p = p; this.seen = true;
  }
  /** The write half: the springs move, and the cheeks, fin and cape are drawn where they are. */
  step() {
    if (!this.seen) return;
    const a = Math.abs(this.acc.x) + Math.abs(this.acc.y) > 30 ? this.acc : { x: 0, y: 0 };
    const dt = this.dt;
    this.vy.step(a.y * this.gain, dt); this.fy.step(a.y * this.gain, dt); this.vx.step(a.x * this.gain * 0.8, dt); this.fx.step(a.x * this.gain * 0.8, dt);
    this.apply();
  }
  private apply() {
    const quiet = this.vy.quiet && this.vx.quiet && this.fy.quiet && this.fx.quiet;
    if (quiet && this.rest) return;
    this.rest = quiet;
    if (quiet) { this.vy.x = this.vx.x = this.fy.x = this.fx.x = 0; }
    // each cheek: a lag downward (it has not come up with the body yet) squashes it onto its bottom, a lag upward
    // stretches it; a sideways lag leans it (a skew about its bottom). The far one (the haunch on his left, taller) on its
    // own slower spring, so the two wobble a beat apart
    const s = this.vy.x * 0.032; const lean = this.vx.x * 2.2;
    if (this.near) this.near.style.transform = quiet ? '' : `skewX(${(-lean).toFixed(2)}deg) scale(${(1 + s * 0.75).toFixed(4)}, ${(1 - s).toFixed(4)})`;
    this.bendFar(quiet);
    // the fin, lying on the floor behind him: its tip flicks up when the butt squashes and settles back (it may not go
    // down through the floor, so it barely goes the other way)
    const fin = Math.max(-1.5, Math.min(10, this.vy.x * 3.2 - this.vx.x * 1.2));
    if (this.fin) this.fin.style.transform = quiet ? '' : `rotate(${fin.toFixed(2)}deg)`;
    // a cape sways behind a sideways move (a skew about the shoulders)
    const sway = Math.max(-3, Math.min(3, -this.fx.x * 1.4));
    for (const c of this.capes) c.style.transform = quiet ? '' : `skewX(${sway.toFixed(2)}deg)`;
  }
  /**
   * The far cheek wobbles by bending its outline, not by squashing the whole group (a squash moved its crease off his
   * side's line and it came to a point, the operator: "keeps his cheek round"). Each outline point moves along its outward
   * normal, and down a little, by an amount that is 0 at both ends (the crease under the far flipper, the wedge on the tail)
   * and most in the middle: lagging down it bulges out and sags, lagging up it draws in, and a sideways lag throws it.
   */
  private bendFar(quiet: boolean) {
    const e = this.farEls; if (!e) return;
    let d: [string, string];
    if (quiet) d = e.rest;
    else {
      const u = Math.max(-2.4, Math.min(3.0, this.fy.x * 1.5)); const side = Math.max(-2.2, Math.min(2.2, -this.fx.x * 1.3));
      const c = this.farC.map((p, i): P4 => {
        const w = Math.pow(Math.sin(Math.PI * p[3]), 1.4); const n = this.farN[i] ?? [0, 0];
        return [p[0] + w * (u * n[0] + side), p[1] + w * (u * n[1] + 0.45 * u), p[2], p[3]];
      });
      d = farPolys(c, this.farI);
    }
    e.fill?.setAttribute('d', d[0]); e.clip?.setAttribute('d', d[0]); e.line?.setAttribute('d', d[1]);
  }
  destroy() {
    LIVE.delete(this); this.io?.disconnect(); this.io = null; this.mark?.remove();
    for (const e of [this.near, this.fin, ...this.capes]) if (e) e.style.transform = '';
    this.bendFar(true);
  }
}

export type ThiccMoves = OwnMoves & {
  flap(n?: number): Promise<void>;
  gape(dir: Dir, wide?: number): void;
  gulp(): Promise<void>;
  balance(): void;
  header(power: number, onHit: () => void): Promise<void>;
  boop(dir: Dir, onHit: () => void): Promise<void>;
  bounce(n?: number): Promise<void>;
  kick(vy: number, vx?: number): void;
  /** the spring behind the bouncy butt */
  jiggle: Jiggle;
};

export function thiccMoves(rig: PetRig): ThiccMoves {
  const k = rig.kit();
  const el = k.el;
  const heads = () => k.heads();
  const pupils = () => k.q.get('pupil');
  const near = k.root.querySelector('#butt');
  const fin = k.root.querySelector('#fin');
  const jiggle = new Jiggle(k);
  // now and then, standing about, he settles his weight: a little shift and the butt wobbles
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const idle = () => {
    idleTimer = setTimeout(() => {
      if (k.destroyed()) return;
      if (!k.busy() && k.holds() === 0 && k.mood() === 'idle' && !k.ghost() && !reduceMotion()) {
        if (Math.random() < 0.4) {
          // a flick of the fin
          void k.shot(620, (A) => {
            A(fin, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: 'rotate(9deg)', offset: 0.3, easing: 'ease-in' }, { transform: 'rotate(-1deg)', offset: 0.55, easing: 'ease-out' }, { transform: 'rotate(2deg)', offset: 0.75, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
          });
        } else {
          const side = Math.random() < 0.5 ? -1 : 1;
          void k.shot(700, (A) => {
            A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${side * 1.6}deg) translateY(1.5px) scaleY(0.985)`, offset: 0.3, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
          });
        }
      }
      idle();
    }, 7000 + Math.random() * 6000);
  };
  if (!k.calm) idle();

  const moves: ThiccMoves = {
    jiggle,
    kick: (vy, vx = 0) => jiggle.kick(vy, vx),

    /** A tap at something low on his right: he leans over to it and the near flipper lifts and slaps down on it (the strike at 0.55). */
    pat(dir) {
      const s = dir;
      return k.shot(380, (A) => {
        A(el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: up(22), offset: 0.3, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: up(-6), offset: 0.55, easing: 'ease-out' }, { transform: up(-2), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${-s * 1.5}deg)`, offset: 0.3 }, { transform: `rotate(${s * 7}deg)`, offset: 0.55, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${s * 3}deg) translateY(1px)`, offset: 0.55 }, { transform: 'none', offset: 1 }]);
      });
    },
    /** A swipe on his right: a lift and the near flipper sweeps down and through, the body whipping with it (through the low point at 0.45). */
    bat(dir) {
      const s = dir;
      return k.shot(360, (A) => {
        A(el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: up(34), offset: 0.22, easing: 'cubic-bezier(.6,0,1,.4)' }, { transform: up(-6), offset: 0.45, easing: 'ease-out' }, { transform: up(4), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0 }, { transform: `rotate(${-s * 2}deg)`, offset: 0.22 }, { transform: `rotate(${s * 6}deg) translateX(${s * 2}px)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${s * 4}deg)`, offset: 0.45 }, { transform: 'none', offset: 1 }]);
      });
    },
    /** Both flippers in round something in front of him, the head bowed to it. Held. */
    hug() {
      k.hold('hug', (H, M) => {
        H(el.legR, [{ transform: 'none' }, { transform: up(-5) }]);
        H(el.legL, [{ transform: 'none' }, { transform: upL(-3) }]);
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(4deg)' }]);
        M(pupils(), [{ transform: 'none' }, { transform: 'translate(-2%, 14%)' }]);
      }, 360);
    },
    /** Both flippers flapping, happy: `n` quick beats, a bounce through the body (and so through the butt). */
    flap(n = 4) {
      const per = 230;
      k.face('happy', 'smile', 160);
      return k.shot(per * n, (A) => {
        const o = { duration: per, iterations: n };
        A(el.legL, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: upL(38), offset: 0.45, easing: 'ease-in' }, { transform: upL(-3), offset: 0.8, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }], o);
        A(el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: up(38), offset: 0.45, easing: 'ease-in' }, { transform: up(-5), offset: 0.8, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }], o);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(-3px) scaleY(1.02)', offset: 0.45, easing: 'ease-in' }, { transform: 'translateY(1px) scaleY(0.98) scaleX(1.01)', offset: 0.85 }, { transform: 'none', offset: 1 }], o);
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: 'translateY(-1px)', offset: 0.45 }, { transform: 'translateY(1px)', offset: 0.85 }, { transform: 'none', offset: 1 }], o);
      });
    },
    /** Mouth open for something dropping in from above on side `dir`: head up, eyes on it, flippers ready. Held until gulp(). */
    gape(dir, wide = 1) {
      const drawn = wide > 1 && !!el['mouth-gape'];
      k.face('open', drawn ? 'gape' : 'open', 120);
      k.hold('gape', (H, M) => {
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-3px) rotate(-2deg)' }]);
        M(pupils(), [{ transform: 'none' }, { transform: `translate(${dir * 6}%, -12%)` }]);
        if (!drawn) H(el['mouth-open'], [{ transform: 'none' }, { transform: `scale(${1.25 * wide}, ${1.35 * wide})` }]);
        H(el.legL, [{ transform: 'none' }, { transform: upL(4) }]);
        H(el.legR, [{ transform: 'none' }, { transform: up(12) }]);
      }, 260);
    },
    /** Caught it: the mouth shuts on it, the head bobs, a big swallow down through the body (the butt wobbles). */
    async gulp() {
      k.release('gape', 140);
      k.face('squeeze', 'idle', 70);
      await k.shot(560, (A) => {
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(4px) scale(1.02, 0.98)', offset: 0.25, easing: 'ease-in-out' }, { transform: 'translateY(-2px)', offset: 0.55, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0 }, { transform: 'scaleY(0.96) scaleX(1.03)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'scaleY(1.02)', offset: 0.62, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        A(el.whiskers, [{ transform: 'scaleX(1)', offset: 0 }, { transform: 'scaleX(1.1)', offset: 0.3 }, { transform: 'scaleX(1)', offset: 1 }]);
      });
      k.face('happy', 'smile', 160);
    },
    /** Balancing something on his head: chin up, eyes up on it, flippers out a little. Held. */
    balance() {
      k.face('open', 'smile', 160);
      k.hold('balance', (H, M) => {
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-2px)' }]);
        M(pupils(), [{ transform: 'none' }, { transform: 'translate(-2%, -14%)' }]);
        H(el.legL, [{ transform: 'none' }, { transform: upL(5) }]);
        H(el.legR, [{ transform: 'none' }, { transform: up(18) }]);
      }, 300);
    },
    /** A header: what sits on his head lands (the head gives under it), then the head pops it back up. `onHit` at the pop. */
    async header(power, onHit) {
      const ms = 420; const HIT = 0.46;
      const p = k.shot(ms, (A) => {
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(3px) scale(1.02, 0.97)', offset: 0.28, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: `translateY(${-(3 + power * 2.5)}px) scale(0.99, 1.02)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(2px) scaleY(0.96) scaleX(1.02)', offset: 0.28, easing: 'cubic-bezier(.6,0,1,.5)' }, { transform: `translateY(${-(2 + power * 2)}px) scaleY(1.03)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        A(el.legL, [{ transform: 'rotate(0)', offset: 0 }, { transform: upL(-3), offset: 0.28 }, { transform: upL(5 + power * 2), offset: HIT, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.legR, [{ transform: 'rotate(0)', offset: 0 }, { transform: up(-6), offset: 0.28 }, { transform: up(18 + power * 7), offset: HIT, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
      });
      await wait(ms * HIT);
      onHit();
      await p;
    },
    /** A scoop with the near flipper: down under something beside him and a quick flick up; `onHit` at the flick. */
    async boop(dir, onHit) {
      const ms = 440; const HIT = 0.5; const s = dir;
      const p = k.shot(ms, (A) => {
        A(el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-in-out' }, { transform: up(-4), offset: 0.32, easing: 'cubic-bezier(.5,0,.9,.4)' }, { transform: up(52), offset: HIT, easing: 'ease-out' }, { transform: up(40), offset: 0.7, easing: 'ease-in-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-in-out' }, { transform: `rotate(${s * 6}deg) translateY(2px)`, offset: 0.32 }, { transform: `rotate(${-s * 2}deg) translateY(-3px)`, offset: HIT, easing: 'ease-out' }, { transform: 'none', offset: 1 }]);
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${s * 3}deg) translateY(2px)`, offset: 0.32 }, { transform: 'translateY(-3px)', offset: HIT }, { transform: 'none', offset: 1 }]);
      });
      await wait(ms * HIT);
      onHit();
      await p;
    },
    /**
     * The showcase: he looks back over his shoulder at it and gives it a bounce. The body drops and pops up on each beat
     * (so the spring throws the cheeks about), rocking side to side, the cheeks themselves bouncing on top, alternately;
     * the fin keeps time. He is extremely pleased with himself.
     */
    async bounce(n = 8) {
      const per = 240;
      k.face('happy', 'smug', 160);
      const ms = per * n + 360;
      // each beat the whole body lands (squashed onto the floor, leaning to one side) and springs back up (stretched), the
      // cheeks thrown about on top of that, the one on the leaning side most; the head rides the body exactly (bodyHead)
      const body: KF = [{ transform: 'none', offset: 0 }];
      const head: KF = [{ transform: 'none', offset: 0 }];
      const cheekN: KF = [{ transform: 'none', offset: 0 }];
      const finK: KF = [{ transform: 'rotate(0)', offset: 0 }];
      const beats: [number, number, number][] = [];
      const o = (t: number) => Math.min(0.999, Math.max(0.001, t / ms));
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1; const t0 = 120 + per * i;
        const land = { deg: side * 2.6, sx: 1.07, sy: 0.9 }; const up_ = { deg: side * 0.8, sx: 0.97, sy: 1.05 };
        body.push({ transform: `rotate(${land.deg}deg) scale(${land.sx}, ${land.sy})`, offset: o(t0 + per * 0.28), easing: 'ease-out' },
          { transform: `rotate(${up_.deg}deg) scale(${up_.sx}, ${up_.sy})`, offset: o(t0 + per * 0.68), easing: 'ease-in-out' });
        head.push({ transform: bodyHead(land.sx, land.sy, land.deg), offset: o(t0 + per * 0.28), easing: 'ease-out' },
          { transform: bodyHead(up_.sx, up_.sy, up_.deg), offset: o(t0 + per * 0.68), easing: 'ease-in-out' });
        cheekN.push({ transform: side > 0 ? 'scale(1.08, 0.88)' : 'scale(1.04, 0.94)', offset: o(t0 + per * 0.34), easing: 'ease-out' },
          { transform: side > 0 ? 'scale(0.95, 1.09)' : 'scale(0.97, 1.05)', offset: o(t0 + per * 0.74), easing: 'ease-in-out' });
        // the far cheek (the haunch on his left) gets a shove on each landing, hardest on the beats that lean its way
        beats.push([t0 + per * 0.3, side < 0 ? 95 : 60, side * 18]);
        // the fin slaps the floor on every landing: up as he drops, down flat as he lands
        finK.push({ transform: `rotate(${side < 0 ? 9 : 6}deg)`, offset: o(t0 + per * 0.12), easing: 'ease-in' }, { transform: 'rotate(-1deg)', offset: o(t0 + per * 0.34), easing: 'ease-out' });
      }
      for (const kf of [body, head, cheekN]) kf.push({ transform: 'none', offset: 1 });
      finK.push({ transform: 'rotate(0)', offset: 1 });
      k.hold('bouncelook', (H, M) => {
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'rotate(-5deg)' }]);
        M(pupils(), [{ transform: 'none' }, { transform: 'translate(-24%, 22%)' }]);
      }, 300);
      const timers = beats.map(([t, vy, vx]) => setTimeout(() => { if (!k.destroyed()) jiggle.kickFar(vy, vx); }, t));
      await k.shot(ms, (A) => {
        A(el.body, body, { easing: 'linear' });
        for (const h of heads()) A(h, head, { easing: 'linear' });
        A(near, cheekN, { easing: 'linear' });
        A(fin, finK, { easing: 'linear' });
        A(el.legR, [{ transform: 'rotate(0)', offset: 0 }, { transform: up(16), offset: 0.15 }, { transform: up(12), offset: 0.85 }, { transform: 'rotate(0)', offset: 1 }]);
      });
      timers.forEach(clearTimeout);
      k.release('bouncelook', 320);
      jiggle.kick(60, -16);
      k.face('happy', 'smile', 200);
    },

    /** The dreidel's stem, on his right: the near flipper comes down onto the knob, holds it, and flicks up and out for the spin. */
    twist(dir) {
      const s = dir; const ms = 660;
      return k.shot(ms, (A, M) => {
        A(el.legR, [{ transform: 'rotate(0)', offset: 0, easing: 'ease-out' }, { transform: up(-3), offset: 0.36, easing: 'ease-in-out' }, { transform: up(-4), offset: 0.54, easing: 'cubic-bezier(.5,0,1,.5)' }, { transform: up(34), offset: 0.68, easing: 'ease-out' }, { transform: 'rotate(0)', offset: 1 }]);
        A(el.figure, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: `rotate(${s * 3}deg)`, offset: 0.36 }, { transform: `rotate(${s * 3}deg)`, offset: 0.56, easing: 'ease-in-out' }, { transform: `rotate(${-s * 1.5}deg)`, offset: 0.72, easing: 'ease-in-out' }, { transform: 'none', offset: 1 }]);
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0 }, { transform: `rotate(${s * 4}deg) translateY(1px)`, offset: 0.4 }, { transform: `rotate(${s * 4}deg) translateY(1px)`, offset: 0.56 }, { transform: `rotate(${-s * 2}deg)`, offset: 0.72 }, { transform: 'none', offset: 1 }]);
        M(pupils(), [{ transform: 'none', offset: 0 }, { transform: `translate(${s * 8}%, 14%)`, offset: 0.36 }, { transform: `translate(${s * 8}%, 14%)`, offset: 0.6 }, { transform: 'none', offset: 1 }]);
      });
    },
    /** The hen held up over his head: the near flipper up high beside the head, the far one out, eyes up. Held. */
    kapparotRaise() {
      k.hold('kapparot', (H, M) => {
        H(el.legR, [{ transform: 'rotate(0)' }, { transform: up(72) }]);
        H(el.legL, [{ transform: 'rotate(0)' }, { transform: upL(40) }]);
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-1.5px) rotate(-3deg)' }]);
        M(pupils(), [{ transform: 'translate(0,0)' }, { transform: 'translate(-4%, -20%)' }]);
      }, 460);
    },
    /** While the hen circles: the head and the eyes follow her round, the raised flipper sways under her. */
    kapparotFollow(laps, lapMs) {
      const per = 16; const n = per * laps; const ms = laps * lapMs;
      const kf = (f: (th: number) => string): KF => Array.from({ length: n + 1 }, (_, i) => ({ transform: f((2 * Math.PI * i) / per), offset: i / n }));
      return k.shot(ms, (A, M) => {
        for (const h of heads()) A(h, kf((th) => `rotate(${(3 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        M(pupils(), kf((th) => `translate(${(16 * Math.cos(th)).toFixed(1)}%, ${(3 * Math.sin(th)).toFixed(1)}%)`), { easing: 'linear' });
        A(el.legR, kf((th) => `rotate(${(7 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
        A(fin, kf((th) => `rotate(${(3 + 3 * Math.cos(th)).toFixed(2)}deg)`), { easing: 'linear' });
      });
    },
    /** The darbuka, on his right: the near flipper drums its head. Angles measured so its tip lands on the head (ways.ts DARBUKA). */
    drumArm(): DrumArm {
      return { hover: 30, hit: 4, dum: 44, tek: 30, limb: el.legR, rot: (d: number) => up(d), base: '' };
    },
    falconReady() {
      k.hold('falcon', (H, M) => {
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: 'translateY(-1px)' }]);
        M(pupils(), [{ transform: 'none' }, { transform: 'translate(4%, -18%)' }]);
      }, 520);
    },
    falconGive() {
      return k.shot(420, (A) => {
        for (const h of heads()) A(h, [{ transform: 'none', offset: 0, easing: 'ease-out' }, { transform: 'translateY(3px)', offset: 0.3, easing: 'ease-in-out' }, { transform: 'translateY(-0.6px)', offset: 0.65 }, { transform: 'none', offset: 1 }]);
      });
    },

    /** his head is joined to his body along a wide neck: the shared tilt and nuzzle turn it less than half as far */
    headTurn: 0.45,
    /** A curious tilt: he leans his whole self a little, the head a touch more (turned alone, far, it came away from his
     *  far shoulder, the operator: "his left shoulder behind it looks a bit weird"). */
    tilt(dir) {
      k.hold('tilt', (H) => {
        H(el.figure, [{ transform: 'none' }, { transform: `rotate(${dir * 2.5}deg)` }]);
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 1.5}deg) translateY(0.5px)` }]);
      }, 380);
    },
    /** Nuzzling into a hand: the whole of him leans into it, the head a touch more, a purr through him. */
    nuzzle(dir) {
      k.face('happy', 'smile', 200);
      k.hold('nuzzle', (H) => {
        H(el.figure, [{ transform: 'none' }, { transform: `rotate(${dir * 3.5}deg)` }]);
        for (const h of heads()) H(h, [{ transform: 'none' }, { transform: `rotate(${dir * 1.5}deg) translate(${dir * 0.8}px, 0.6px)` }]);
        H(el.cat, [{ transform: 'translate(0, 0)' }, { transform: 'translate(0.35px, 0)' }], { duration: 80, iterations: Infinity, direction: 'alternate', fill: 'none', easing: 'linear' });
      }, 320);
    },
    crownHidden() {
      const c = k.wearing();
      return (k.hair() && !c.has('beanie')) || c.has('pumpkin') || c.has('kippah') || c.has('keffiyeh') || c.has('witch');   // (the beanie: the crown sits on top of it)
    },
    haloLift() {
      const c = k.wearing();
      let lift = c.has('witch') ? 56 : c.has('pumpkin') ? 18 : c.has('beanie') ? 30 : c.has('keffiyeh') ? 8 : c.has('kippah') ? 12 : c.has('zombie') ? 10 : k.hair() ? 8 : 0;
      if (k.crowned() && !c.has('witch') && !c.has('pumpkin') && !c.has('kippah') && !c.has('keffiyeh') && (!k.hair() || c.has('beanie'))) lift = Math.max(lift, c.has('beanie') ? 60 : c.has('zombie') ? 44 : 32);   // over the crown (and the brain it perches on)
      return lift;
    },
    destroy() { jiggle.destroy(); if (idleTimer) clearTimeout(idleTimer); },
  };
  return moves;
}
