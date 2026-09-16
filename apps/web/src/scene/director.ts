/**
 * The director owns the room: where the cat stands, which props exist, and the
 * choreography of every action (feed, wash, play, poop, clean, sleep, wake, pet).
 * Sequences are promise chains over the rig's additive animations plus a few
 * imperative prop elements, so every action flows out of the last one without
 * a snap. Actions queue; the cat wanders on its own when nothing is queued.
 */
import type { PetRig, Dir } from '../pet/rig';
import { ASPECT, PROPS, type PropName } from './props';
import { CAT, CAT_PAD, CAT_TOP, HOST_TOP, WALK_MAX, WALK_MIN, WORLD } from './world';

export type Layers = { back: HTMLElement; front: HTMLElement; cat: HTMLElement };
export type DirectorState = {
  x: number; dir: Dir; busy: string | null; poop: boolean; sleeping: boolean; inTub: boolean; dead: boolean;
};
export type ActionName = 'feed' | 'wash' | 'play' | 'poop' | 'clean' | 'sleep' | 'wake' | 'pet' | 'walk' | 'wander' | 'rumble' | 'tour' | 'die' | 'revive';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const S = CAT.h / 230;               // svg unit → world unit
const TUB_W = 320;
const SINK = 26;                     // how far the cat sinks into the tub
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A prop is one absolutely positioned div holding an inline SVG, anchored at its bottom centre. */
class Prop {
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
    this.inner.innerHTML = PROPS[name];
    this.el.appendChild(this.inner);
    layer.appendChild(this.el);
  }
  place(x: number, bottom: number) { this.el.style.left = `${x - this.w / 2}px`; this.el.style.top = `${bottom - this.h}px`; return this; }
  anim(kf: Keyframe[], opts: KeyframeAnimationOptions) { return this.el.animate(kf, { composite: 'add', fill: 'none', ...opts }); }
  find(sel: string) { return this.inner.querySelector(sel) as (SVGElement & { style: CSSStyleDeclaration }) | null; }
  findAll(sel: string) { return [...this.inner.querySelectorAll(sel)] as (SVGElement & { style: CSSStyleDeclaration })[]; }
  async remove(ms = 240, kf: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]) {
    if (ms > 0) { const a = this.el.animate(kf, { duration: ms, easing: 'ease-in', fill: 'forwards' }); await a.finished.catch(() => {}); }
    this.el.remove();
  }
}

export class Director {
  private st: DirectorState = { x: WORLD.w / 2, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false };
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

  constructor(private rig: PetRig, private L: Layers) {
    this.setX(this.st.x);
    L.cat.style.top = `${HOST_TOP}px`;
    this.scheduleWander(3000);
  }
  yawn() { if (this.isBusy || this.st.sleeping) return Promise.resolve(); return this.run('wander', () => this.rig.yawn()); }

  /** The rig, for tests and the dev panel. */
  get petRig() { return this.rig; }

  // ---- state for React ----
  getState() { return this.st; }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private set(patch: Partial<DirectorState>) { this.st = { ...this.st, ...patch }; for (const s of this.subs) s(); }
  get isBusy() { return this.st.busy !== null || this.pending > 0; }

  // ---- moods from the game ----
  setSad(on: boolean) { this.sad = on; if (!this.isBusy) this.settleMood(); }
  setDirty(on: boolean) { this.rig.setDirty(on); }
  setCrown(on: boolean) { this.rig.setCrown(on); }
  setCostume(on: boolean) { this.rig.setCostume(on); }
  private settleMood() {
    if (this.destroyed) return;
    this.rig.setMood(this.st.dead ? 'idle' : this.st.sleeping ? 'sleep' : this.sad ? 'sad' : 'idle');
  }

  // ---- the queue ----
  private run(name: ActionName, fn: () => Promise<void>): Promise<void> {
    // a dead cat only revives (the contract refuses everything else too)
    if (this.st.dead && name !== 'revive' && name !== 'die') return Promise.resolve();
    this.pending += 1;
    const job = async () => {
      this.pending -= 1;
      if (this.destroyed) return;
      this.set({ busy: name });
      this.rig.busy = true;
      if (this.wanderTimer) { clearTimeout(this.wanderTimer); this.wanderTimer = null; }
      if (this.rig.currentMood !== 'idle' && name !== 'wander') this.rig.setMood('idle');
      try { await fn(); } catch (e) { console.error(`[emo-pets] ${name} failed`, e); }
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
  private setX(x: number) { this.st = { ...this.st, x }; this.L.cat.style.left = `${x - CAT.w / 2 - CAT_PAD.side}px`; for (const s of this.subs) s(); }
  private headPos() { return { x: this.st.x, y: CAT_TOP + (this.st.inTub ? SINK : 0) + 96 * S }; }
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
    this.set({ dir });
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
    if (Math.abs(x - this.st.x) > 4) this.set({ dir });
    const ms = Math.round(560 + Math.min(220, Math.abs(x - this.st.x)) * 0.6);
    // dy is the old top minus the new top: the host is re-anchored now and the offset animates to zero
    if (dy !== 0) this.L.cat.style.top = `${HOST_TOP + (this.st.inTub ? SINK : 0)}px`;
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
    this.set({ dir: x > this.st.x ? 1 : -1 });
    const p = this.moveHost(x, (dx) => [{ transform: `translateX(${dx}px)`, offset: 0 }, { transform: `translateX(${dx}px)`, offset: 0.1, easing: 'linear' }, { transform: 'translateX(0)', offset: 0.7 }, { transform: 'translateX(0)', offset: 1 }], { duration: 420, easing: 'linear' });
    await this.rig.hop();
    await p;
  }

  private crumbs(n: number, x: number, y: number, dir: Dir) {
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
  private sparkles(n: number, cx: number, cy: number, spread = 90) {
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
  private puff(x: number, y: number, w = 80) {
    const p = new Prop(this.L.front, 'puff', w).place(x, y);
    p.anim([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.25) translateY(-14px)', opacity: 0 }], { duration: 750, easing: 'ease-out' })
      .finished.then(() => p.el.remove(), () => p.el.remove());
  }

  // ================= actions =================
  /** A bowl drops in across the room; the cat trots over, sniffs, eats in two sittings with a pleased look between, licks the bowl clean, shimmies. */
  feed() {
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
      setTimeout(() => this.crumbs(3, bx, WORLD.floor - 28, dir), 520);
      await wait(520);
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
      await this.rig.shimmy();
      const wag = this.rig.wag();
      await wait(800);
      await wag.stop();
      this.rig.restFace();
      void bowl.remove(460, [{ transform: 'translateX(0)', opacity: 1, easing: 'ease-in' }, { transform: `translateX(${dir * 280}px)`, opacity: 0 }]);
      await wait(200);
    });
  }

  /** The cat strains, a poop appears behind it, it hops away relieved. The poop stays until cleaned. */
  poop() {
    return this.run('poop', async () => {
      if (this.st.poop) return;
      const side: Dir = this.st.x > WORLD.w / 2 ? 1 : -1;          // poop toward the wall, hop toward the room
      this.rig.squat();
      await wait(520);
      // three pushes, each a little harder, with a grimace at the top of each
      for (let i = 0; i < 3; i++) {
        await this.rig.push(i);
        if (i === 1) void this.rig.sweat();
      }
      await wait(200);
      // it comes out from under the cat: starts hidden behind the body and slides out sideways as it grows
      const poop = new Prop(this.L.back, 'poop', 72, 'prop-poop-live').place(this.st.x + side * 52, WORLD.floor - 4);
      poop.el.style.transformOrigin = '50% 100%';
      poop.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); void this.clean(); });
      poop.anim([
        { transform: `translateX(${-side * 44}px) scale(0.5, 0.3)`, offset: 0, easing: 'ease-out' },
        { transform: `translateX(${-side * 14}px) scale(0.9, 0.8)`, offset: 0.55, easing: 'ease-in-out' },
        { transform: 'translateX(0) scale(1.06, 0.94)', offset: 0.82, easing: 'ease-in-out' }, { transform: 'translateX(0) scale(1)', offset: 1 },
      ], { duration: 620 });
      if (!reduceMotion()) poop.findAll('#stink .s').forEach((s, i) => {
        s.style.transformBox = 'fill-box'; s.style.transformOrigin = '50% 100%';
        s.animate([{ transform: 'translateY(0) scaleX(1)', opacity: 0 }, { transform: 'translateY(-4px) scaleX(-1)', opacity: 0.9, offset: 0.4 }, { transform: 'translateY(-12px) scaleX(1)', opacity: 0 }], { duration: 2400, iterations: Infinity, easing: 'ease-in-out', delay: i * 800 });
      });
      this.poopProp = poop;
      this.set({ poop: true });
      await wait(260);
      this.rig.release('squat', 260);
      this.rig.face('open', 'smile', 200);
      await wait(160);
      await this.jumpTo(this.st.x - side * 96);
      this.rig.look(side * 0.9, 0.35);
      await this.rig.perk();
      this.puff(this.st.x - side * 20, this.headPos().y - 40, 56);   // phew
      await wait(600);
      this.rig.release('look', 300);
      this.rig.restFace();
      await wait(200);
    });
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
      await scoop.anim([{ transform: `translateX(${inX}px) rotate(${side * 10}deg)`, opacity: 0 }, { transform: `translateX(${inX * 0.7}px) rotate(${side * 10}deg)`, opacity: 1, offset: 0.2 }, { transform: 'translateX(0) rotate(0)', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
      const push = scoop.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${-side * 18}deg) translateX(${-side * 10}px)` }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
      await push.finished;
      const fling: KeyframeAnimationOptions = { duration: 520, easing: 'cubic-bezier(.4,0,.9,.4)', fill: 'forwards' };
      poop.anim([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${side * 120}px,-120px) rotate(${side * 40}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${side * 300}px,-40px) rotate(${side * 160}deg)`, opacity: 0 }], fling);
      scoop.anim([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${side * 80}px,-90px) rotate(${-side * 30}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${side * 320}px,-30px)`, opacity: 0 }], fling);
      this.puff(px, WORLD.floor + 6, 84);
      this.sparkles(4, px, WORLD.floor - 20, 50);
      await wait(200);
      this.rig.face('happy', 'smile');
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

  /** The cat leaps straight up, the tub slides in underneath, splash. Bubbles, a sponge, foam, a shake, then the reverse. */
  wash() {
    return this.run('wash', async () => {
      const cx = clamp(this.st.x, TUB_W / 2 + 10, WORLD.w - TUB_W / 2 - 10);
      if (Math.abs(cx - this.st.x) > 6) await this.walkTo(cx);
      const from: Dir = cx <= WORLD.w / 2 ? 1 : -1;                  // tub arrives from the roomier side
      const bottom = WORLD.floor + 44;
      const JUMP = 1300;
      // the cat hears it coming
      await this.rig.perk();
      this.rig.look(from * 0.8, 0.3);
      await wait(380);
      this.rig.release('look', 200);
      // up it goes; while it hangs, the tub slides under it; it comes down into the water
      this.set({ inTub: true });
      this.L.cat.style.top = `${HOST_TOP + SINK}px`;
      const sink = this.L.cat.animate([
        { transform: `translateY(${-SINK}px)`, offset: 0 }, { transform: `translateY(${-SINK}px)`, offset: 0.64, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'translateY(0)', offset: 0.86 }, { transform: 'translateY(0)', offset: 1 },
      ], { duration: JUMP, composite: 'add' });
      const jump = this.rig.superJump(JUMP, 118);
      await wait(JUMP * 0.3);
      const back = new Prop(this.L.back, 'tubBack', TUB_W).place(cx, bottom);
      const front = new Prop(this.L.front, 'tubFront', TUB_W).place(cx, bottom);
      const slide: Keyframe[] = [{ transform: `translateX(${from * 480}px)`, offset: 0, easing: 'cubic-bezier(.15,.7,.25,1)' }, { transform: `translateX(${-from * 6}px)`, offset: 0.85, easing: 'ease-in-out' }, { transform: 'translateX(0)', offset: 1 }];
      back.anim(slide, { duration: 420 }); front.anim(slide, { duration: 420 });
      const waterY = bottom - front.h * 0.6;
      setTimeout(() => { this.droplets(8, cx - 50, waterY, 1.1); this.droplets(8, cx + 50, waterY, 1.1); this.puff(cx - 78, waterY + 22, 60); this.puff(cx + 78, waterY + 22, 60); }, JUMP * 0.84 - JUMP * 0.3);
      await jump; await sink.finished.catch(() => {});
      this.rig.soak();
      this.rig.face('happy', 'smile');
      // bubbles rise while a sponge scrubs and foam builds on the hair
      let bubbling = true;
      const bubbleLoop = async () => { while (bubbling && !this.destroyed) { this.bubble(cx + rand(-120, 120), waterY - rand(0, 10)); await wait(rand(140, 260)); } };
      void bubbleLoop();
      await wait(500);
      const head = this.headPos();
      const sponge = new Prop(this.L.front, 'sponge', 66).place(head.x + 64, head.y - 26);
      sponge.el.style.transformOrigin = '50% 50%';
      sponge.anim([{ transform: 'translateY(-50px) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      await wait(300);
      this.rig.face('squeeze', 'smile', 200);
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
      bubbling = false;
      this.rig.face('closed', 'smile', 200);
      await wait(260);
      // shake it off: the foam flies, droplets everywhere
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
      this.L.cat.style.top = `${HOST_TOP}px`;
      const rise = this.L.cat.animate([
        { transform: `translateY(${SINK}px)`, offset: 0 }, { transform: `translateY(${SINK}px)`, offset: 0.12, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'translateY(0)', offset: 0.4 }, { transform: 'translateY(0)', offset: 1 },
      ], { duration: JUMP, composite: 'add' });
      const jump2 = this.rig.superJump(JUMP, 118);
      this.droplets(5, cx - 30, waterY, 0.7); this.droplets(5, cx + 30, waterY, 0.7);
      await wait(JUMP * 0.4);
      const leave: Keyframe[] = [{ transform: 'translateX(0)', easing: 'cubic-bezier(.5,0,.8,.5)' }, { transform: `translateX(${from * 520}px)` }];
      void back.remove(360, leave); void front.remove(360, leave);
      await jump2; await rise.finished.catch(() => {});
      const wag = this.rig.wag();
      this.hearts(2);
      await wait(1100);
      await wag.stop();
      this.rig.restFace();
    });
  }

  /** A ball of yarn rolls in. Curious tilt, creep up, two pats, butt wiggle, pounce over it, bat it across the room, chase, catch, bunny kicks, then sit proud with it. */
  play() {
    return this.run('play', async () => {
      const YW = 62; const circ = Math.PI * YW;
      const Y_MIN = WALK_MIN + 78; const Y_MAX = WALK_MAX - 78;
      const REACH = 56;                                              // paw tip lands past the ball's centre on a swipe
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
      await wait(380);
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
        setTimeout(() => { squash(0.4, dir); wobble(dir); if (i === 1) void rollTo(clamp(yarnX + dir * 34, Y_MIN, Y_MAX), 700); }, 130);
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
      const bat = this.rig.bat(back);
      await wait(110);
      squash(1, back);
      const room = back > 0 ? Y_MAX - yarnX : yarnX - Y_MIN;
      const want = rand(190, 240);
      const hitsWall = want > room;
      const far = clamp(yarnX + back * Math.min(want, room), Y_MIN, Y_MAX);
      showTail(back);
      const rolled = rollTo(far, 1050, 22).then(async () => { if (hitsWall) { squash(0.7, -back as Dir); await rollTo(far - back * 30, 420); } });
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
      squash(0.6, 1);
      this.rig.hug();
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

  /** Nod off where it stands. */
  sleep() {
    return this.run('sleep', async () => {
      if (this.st.sleeping) return;
      this.rig.face('closed', 'idle', 300);
      await wait(200);
      this.set({ sleeping: true });
      this.rig.setMood('sleep');
      await wait(400);
    });
  }
  /** Wake with a stretch and a yawn. */
  wake() {
    return this.run('wake', async () => {
      if (!this.st.sleeping) return;
      this.set({ sleeping: false });
      this.rig.setMood('idle');
      await wait(350);
      await this.rig.stretch();
      await wait(100);
    });
  }
  /** Stroke the cat from one side: it leans in, purrs, hearts. */
  pet(side: Dir) {
    if (this.isBusy || this.st.dead) return Promise.resolve();
    return this.run('pet', async () => {
      this.rig.nuzzle(side);
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

  /** Neglected to death: it keels over, a little grave appears, and it floats above it as a ghost. */
  die() {
    return this.run('die', async () => {
      if (this.st.dead) return;
      if (this.st.sleeping) { this.set({ sleeping: false }); this.rig.setMood('idle'); await wait(400); }
      this.rig.setDirty(false);
      if (this.poopProp) { void this.poopProp.remove(400); this.poopProp = null; this.set({ poop: false }); }
      const side: Dir = this.st.x < WORLD.w / 2 ? 1 : -1;
      const p = this.rig.die();
      await wait(1300);
      const grave = new Prop(this.L.front, 'grave', 70).place(this.st.x + side * 62, WORLD.floor + 10);
      grave.el.style.transformOrigin = '50% 100%';
      grave.anim([{ transform: 'translateY(30px) scale(0.6)', opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.3,1.2)' }, { transform: 'translateY(0) scale(1)', opacity: 1, offset: 1 }], { duration: 600 });
      this.grave = grave;
      this.set({ dead: true });
      await p;
      this.sparkles(3, this.st.x, CAT_TOP + 40, 80);
    });
  }
  /** Bought back: a burst of sparks, the grave puffs away, colour returns and it stretches awake. */
  revive() {
    return this.run('revive', async () => {
      if (!this.st.dead) return;
      const head = this.headPos();
      this.sparkles(10, this.st.x, head.y, 120);
      this.puff(this.st.x, WORLD.floor + 6, 130);
      await wait(300);
      if (this.grave) { const g = this.grave; this.grave = null; this.puff(g.el.offsetLeft + g.w / 2, WORLD.floor + 4, 90); void g.remove(300, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.4)', opacity: 0 }]); }
      this.set({ dead: false });
      await this.rig.revive();
      this.hearts(4);
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
      if (this.destroyed || this.isBusy || this.st.sleeping || this.st.dead) { this.scheduleWander(); return; }
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
    if (this.wanderTimer) clearTimeout(this.wanderTimer);
    this.grave = null;
    this.L.back.replaceChildren(); this.L.front.replaceChildren();
  }
}
