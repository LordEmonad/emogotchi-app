/**
 * The camera: where along the street the screen is looking, in town units.
 *
 * The street is a NATIVE horizontal scroller (Emotown.tsx `.town-scroll`): touch and trackpad scrolling are the
 * platform's own, run on the browser's compositor thread with its momentum and rubber band, so the street glides at
 * the screen's full rate however busy the page is drawing pets. This class reads that scroll position, and drives it
 * for everything the platform does not do by itself:
 * - a mouse wheel's notches (and vertical trackpad swipes) glide sideways to where they point;
 * - a mouse drag moves the street with the pointer and flings it on with the release speed, easing to a stop before
 *   either end rather than hitting it;
 * - `flyTo` glides somewhere, `follow` keeps a pet in the middle while it walks, the arrow keys glide.
 * Any touch or wheel from the person stops whatever the camera was doing on its own.
 */
import { TOWN, townScale } from './layout';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** the fling's glide: speed decays with this time constant (ms); total glide = speed x TAU */
const TAU = 420;

export class Camera {
  /** page pixels per town unit */
  k = 1;
  vw = 1; vh = 1;
  private el: HTMLElement | null = null;
  private sx = 0;                        // the scroller's scrollLeft, px
  private v = 0;                         // fling speed, town units per ms
  private raf = 0;
  private fly: { from: number; to: number; t0: number; ms: number } | null = null;
  private target: (() => number | null) | null = null;
  private glide: { to: number; tau: number } | null = null;
  private drag: { px: number; x: number; samples: { t: number; px: number }[] } | null = null;
  private subs = new Set<() => void>();
  private want: number | null = null;    // where to be once the scroller has its size (the first layout, a resize)

  /** the left edge of the view, in town units */
  get x() { return this.sx / this.k; }
  get viewW() { return this.vw / this.k; }
  get maxX() { return Math.max(0, TOWN.w - this.viewW); }
  get centre() { return this.x + this.viewW / 2; }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { for (const s of this.subs) s(); }

  /** the scroller this camera reads and drives */
  attach(el: HTMLElement | null) {
    this.el = el; if (!el) return;
    el.addEventListener('scroll', () => { this.sx = el.scrollLeft; this.emit(); }, { passive: true });
    // the person takes over: whatever the camera was doing by itself stops
    const takeOver = () => { if (!this.drag) this.stop(); };
    el.addEventListener('touchstart', takeOver, { passive: true });
    this.sx = el.scrollLeft;
  }
  resize(vw: number, vh: number) {
    const c = this.centre; this.vw = vw; this.vh = vh; this.k = townScale(vh);
    this.want = c - this.viewW / 2;   // applied by `settle()` once the scroller has its new width
  }
  /** after a layout: go where we were meant to be (keeps the same centre through a resize) */
  settle() { if (this.want !== null) { const w = this.want; this.want = null; this.set(w); } }
  set(x: number) {
    const px = clamp(x, 0, this.maxX) * this.k;
    if (this.el) { this.el.scrollLeft = px; this.sx = this.el.scrollLeft; } else this.sx = px;
    this.emit();
  }
  /** start at x before the first layout */
  start(x: number) { this.want = x; }

  // ---- a mouse drag (touch scrolls natively) ----
  dragStart(px: number) { this.stop(); this.drag = { px, x: this.x, samples: [{ t: performance.now(), px }] }; }
  dragMove(px: number) {
    const d = this.drag; if (!d) return;
    this.set(d.x - (px - d.px) / this.k);
    const t = performance.now(); d.samples.push({ t, px });
    while (d.samples.length > 2 && t - d.samples[0]!.t > 90) d.samples.shift();
  }
  dragEnd() {
    const d = this.drag; this.drag = null; if (!d || d.samples.length < 2) return;
    const a = d.samples[0]!; const b = d.samples[d.samples.length - 1]!;
    const dt = b.t - a.t; if (dt <= 0 || performance.now() - b.t > 70) return;   // held still before letting go: no fling
    this.v = clamp(-((b.px - a.px) / dt) / this.k, -8, 8);
    const travel = this.v * TAU;   // a fling that would run into an end is slowed to glide to a stop right at it
    if (this.x + travel < 0) this.v = -this.x / TAU; else if (this.x + travel > this.maxX) this.v = (this.maxX - this.x) / TAU;
    if (Math.abs(this.v) > 0.02) this.loop();
  }
  get dragging() { return this.drag !== null; }

  // ---- wheel, keys, glides ----
  /** a wheel turn of dx town units; `notched` is a mouse wheel's big step (glides a little slower) */
  wheel(dx: number, notched: boolean) {
    this.v = 0; this.fly = null; this.target = null;
    const base = this.glide ? this.glide.to : this.x;
    this.glide = { to: clamp(base + dx, 0, this.maxX), tau: notched ? 95 : 34 };
    this.loop();
  }
  nudge(dx: number) { this.wheel(dx, true); }
  flyTo(centre: number, ms = 900) { this.stop(); this.fly = { from: this.x, to: clamp(centre - this.viewW / 2, 0, this.maxX), t0: performance.now(), ms }; this.loop(); }
  /** keep something in the middle (a pet walking); null lets go */
  follow(fn: (() => number | null) | null) { this.stop(); this.target = fn; if (fn) this.loop(); }
  get following() { return this.target !== null; }
  stop() { this.v = 0; this.fly = null; this.target = null; this.glide = null; }

  private loop() {
    if (this.raf) return;
    let last = performance.now();
    const step = (t: number) => {
      this.raf = 0;
      const dt = Math.min(40, t - last); last = t;
      let more = false;
      if (this.drag) { /* the pointer drives it */ }
      else if (this.fly) {
        const u = Math.min(1, (t - this.fly.t0) / this.fly.ms);
        this.set(this.fly.from + (this.fly.to - this.fly.from) * ease(u));
        if (u < 1) more = true; else this.fly = null;
      } else if (this.glide) {
        const g = this.glide; const nx = g.to + (this.x - g.to) * Math.exp(-dt / g.tau);
        if (Math.abs(nx - g.to) < 0.25) { this.set(g.to); this.glide = null; } else { this.set(nx); more = true; }
      } else if (this.target) {
        const c = this.target();
        if (c === null) this.target = null;
        else { const want = clamp(c - this.viewW / 2, 0, this.maxX); this.set(this.x + (want - this.x) * (1 - Math.exp(-dt / 260))); more = true; }
      } else if (Math.abs(this.v) > 0.004) {
        this.set(this.x + this.v * dt);
        this.v *= Math.exp(-dt / TAU);
        if (this.x <= 0 || this.x >= this.maxX) this.v = 0;
        more = Math.abs(this.v) > 0.004;
      }
      if (more) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
