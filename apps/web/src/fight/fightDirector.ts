/**
 * The fight director: two pets in a basement. Where the room's director owns one pet and its props, this owns two hosts
 * (each a pet's box, like Stage's `.cathost`) and plays a fight as a script: both walk into the circle, square up, trade
 * blows, and the one the chain says won lands the finisher; the loser is knocked out cold, flat on the floor, the black
 * eye comes up, and the winner celebrates as the belt appears.
 *
 * The script comes from the fight's random number (planFight), so a fight replays the same everywhere, and it always
 * ends in the result the contract decided (`random % 2`, never anything this file does).
 *
 * Every blow LANDS (operator, 2026-09-29: "the cat attack is terrible its not making contact"): the attacker closes to
 * the distance its strike reaches at the moment of impact (REACH, measured with tools/fightclub/limbs.mjs), plus the
 * near half of the other one's body, less a bite; and the impact is sold with a hit-stop (both frozen a beat), a knock
 * back, a burst on the side the blow came from, and a jolt of the room.
 *
 * Layering per fighter: the host moves across the room (translateX), the body inside it tips over for the knockout
 * (rotate about the feet), the drawing inside that is mirrored when it must face the other way (Sahur, whose bat is on
 * his left, is flipped when he fights from the left). The whole room sits in a camera layer that a knockout pans and
 * zooms out, because a pet lying flat is as long as it is tall and Sahur's would not fit the room.
 */
import { cue, type CueOpts } from '../sound/cue';
import type { Dir, PetRig } from '../pet/Pet';
import type { Character } from '../pet/Pet';

/** The pets that fight: the three collections the contract accepts. Thiccums is not one (the contract is immutable). */
export type FightChar = 'cat' | 'frog' | 'sahur';
export const isFightChar = (c: Character): c is FightChar => c === 'cat' || c === 'frog' || c === 'sahur';
import { ASPECT, PROPS, loadStuntProps, type PropName } from '../scene/props';
import { CAT_PAD, petBox, WORLD } from '../scene/world';
import { knockedOut, stance, strike, striker, victory } from './moves';
import type { CrowdCtl } from './Crowd';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How big the pets stand in the basement against their size in the room (a smaller figure leaves room to fall). */
export const ARENA_SCALE = 0.84;
/** A pet's box in the basement: petBox scaled, its pad for the animations that reach outside it scaled with it. */
export function fbox(c: Character) {
  const b = petBox(c); const k = ARENA_SCALE;
  const h = b.h * k, w = b.w * k, footY = b.footY * k;
  const pad = { top: CAT_PAD.top * k, side: CAT_PAD.side * k, bottom: CAT_PAD.bottom * k };
  return { h, w, footY, top: WORLD.floor - footY, hostTop: WORLD.floor - footY - pad.top, hostW: w + pad.side * 2, hostH: h + pad.top + pad.bottom, pad, S: h / 230 };
}

export type Fighter = {
  rig: PetRig;
  character: FightChar;
  /** the host box (moves across the room), the body inside it (tips over), the drawing inside that (mirrored) */
  host: HTMLElement; body: HTMLElement; drawing: HTMLElement;
  looks: { setBelt(on: boolean): void; setBlackEye(on: boolean): void };
};
export type Layers = { back: HTMLElement; front: HTMLElement; world: HTMLElement; cam: HTMLElement | null };
/** how far a knockout blows the loser back before it goes over */
const KNOCK = 30;
/** the room the camera may show (the basement is drawn this far past the room's edges) */
const VIEW = { x0: -50, x1: 650 };

/** Where each fighter stands (the centre of its box, world units) when squared up in the chalk circle. */
export const MARK: [number, number] = [196, 404];

// ---------------------------------------------------------------- the script

export type Blow = { by: 0 | 1; land: boolean; big?: boolean };
export type Plan = { blows: Blow[]; winner: 0 | 1 };

/** A small deterministic generator (mulberry32) seeded from the fight's random number (hex). */
function rng(seedHex: string) {
  const h = seedHex.replace(/^0x/, '').padEnd(8, '0');
  let a = 0;
  for (let i = 0; i < h.length; i += 8) a = (a ^ parseInt(h.slice(i, i + 8), 16)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Three to five exchanges before the finisher. Both sides land something (it should look like a fight either way),
 * the winner is never the one knocked down, and the last word is always the winner's big blow.
 */
export function planFight(seedHex: string, winner: 0 | 1): Plan {
  const r = rng(seedHex);
  const n = 3 + Math.floor(r() * 3);
  const blows: Blow[] = [];
  let by: 0 | 1 = r() < 0.5 ? 0 : 1;
  for (let i = 0; i < n; i++) {
    blows.push({ by, land: r() < 0.72 });
    if (r() < 0.68) by = by === 0 ? 1 : 0;
  }
  const loser = winner === 0 ? 1 : 0;
  for (const side of [loser, winner] as const) {
    if (!blows.some((b) => b.by === side && b.land)) { const b = blows.find((x) => x.by === side) ?? blows[blows.length - 1]!; b.by = side; b.land = true; }
  }
  blows.push({ by: winner, land: true, big: true });
  return { blows, winner };
}

// ---------------------------------------------------------------- where things are

/**
 * How far out from its centre (world units, at ARENA_SCALE) each pet's strike reaches at the moment it lands, and how
 * wide each pet's body is either side of its centre at the height it gets hit. Measured off the rig
 * (tools/fightclub/limbs.mjs): the cat's paw at level from her shoulder, the frok's sleeve at level, Sahur's bat out.
 */
export const REACH: Record<FightChar, number> = { cat: 78, frog: 90, sahur: 165 };
export const HALF: Record<FightChar, number> = { cat: 56, frog: 34, sahur: 24 };
/** how high the cat rears to strike: a Sahur's log starts well above her paw's level, so she goes up to it */
const rearFor = (a: FightChar, d: FightChar) => (a === 'cat' && d === 'sahur' ? 62 : undefined);
/** how far into the other one a blow goes (the paw is in the fur, not in the air beside it) */
const BITE = 12;
const contact = (a: FightChar, d: FightChar) => REACH[a] + HALF[d] - BITE;
/** how far from the other one the frok stands for his giant slap (the glove does the reaching) */
const SLAP_FROM = 124;

// ---------------------------------------------------------------- the director

export class FightDirector {
  private x: [number, number] = [MARK[0], MARK[1]];
  private busy = false;
  private stopped = false;
  /** Sahur fighting from the left is mirrored (his bat faces his opponent) */
  private mirror: [boolean, boolean];
  /** the onlookers (Crowd.tsx), once their rigs exist; the fight never waits on them */
  private crowd: CrowdCtl | null = null;
  /** during the finisher the blows do not knock the loser back: the knockout's own flight does (setUp placed it) */
  private finishing = false;
  setCrowd(c: CrowdCtl | null) { this.crowd = c; }
  /** Sound. A ring that is only on show (the page's looping demo, the Tavern's window on the street) is `muted`. */
  muted = false;
  private sfx(name: string, o?: CueOpts) { if (!this.muted && !this.stopped) cue(name, o); }

  constructor(private f: [Fighter, Fighter], private L: Layers) {
    this.mirror = [f[0].character === 'sahur', false];
    this.f[0].drawing.style.transform = this.mirror[0] ? 'scaleX(-1)' : '';
    this.f[1].drawing.style.transform = '';
    for (const i of [0, 1] as const) this.f[i].body.style.transformOrigin = `50% ${fbox(f[i].character).footY}px`;
    // what the fighters' own moves say (a landing, a swing), in each one's voice; their walking about is not heard
    for (const i of [0, 1] as const) this.f[i].rig.sound = (name, o) => { if (name !== 'step' && name !== 'hop') this.sfx(name, { who: this.f[i].character, pan: i === 0 ? -0.25 : 0.25, ...o }); };
    this.face();
    // a frok's finisher is the giant glove, one of the stunt props that come in a chunk of their own: fetch it while
    // the two square up, so the slap does not wait on it
    if (f.some((x) => x.character === 'frog')) void loadStuntProps();
  }
  destroy() { this.stopped = true; }
  get isBusy() { return this.busy; }
  /** where a fighter stands now (world units; the lab and the checks read it) */
  xOf(i: 0 | 1) { return this.x[i]; }

  /** the side a fighter's opponent is on, in the room (+1 = to its right) */
  private toward(i: 0 | 1): Dir { return i === 0 ? 1 : -1; }
  /** a room direction in the fighter's own drawing (flipped for a mirrored drawing) */
  private dd(i: 0 | 1, room: Dir): Dir { return (this.mirror[i] ? -room : room) as Dir; }
  private face() { for (const i of [0, 1] as const) this.f[i].rig.facing(this.toward(i)); }

  /** Put both at their marks, standing, clean, and the camera back (the lab's reset, and every fight's start). */
  reset() {
    for (const i of [0, 1] as const) {
      const f = this.f[i];
      for (const a of f.host.getAnimations()) a.cancel();
      for (const a of f.body.getAnimations()) a.cancel();
      for (const k of ['fc-stance', 'fc-ko', 'fc-win', 'dazed']) f.rig.release(k, 100);
      f.rig.releaseAll(100);
      f.rig.restFace(100);
      f.rig.clearMark(1);
      f.looks.setBelt(false); f.looks.setBlackEye(false);
      f.body.style.transformOrigin = `50% ${fbox(f.character).footY}px`;
      f.host.style.zIndex = '';
      this.x[i] = MARK[i];
      this.place(i);
    }
    for (const el of [...this.L.front.querySelectorAll('.fc-fx'), ...this.L.back.querySelectorAll('.fc-fx')]) el.remove();
    this.camera(300, 1, 0);
    this.face();
    this.crowd?.settle();
    this.finishing = false;
  }

  // ---------------------------------------------------------------- movement

  private place(i: 0 | 1) { const b = fbox(this.f[i].character); this.f[i].host.style.left = `${this.x[i] - b.hostW / 2}px`; }
  /** Move a fighter to x over ms (the host slides; the rig walks, hops, or just slides for a knock back). */
  private async move(i: 0 | 1, to: number, ms: number, how: 'walk' | 'dash' | 'hop' | 'slide' = 'walk') {
    const f = this.f[i]; const from = this.x[i]; const d = to - from;
    if (Math.abs(d) < 1) return;
    const dir: Dir = d > 0 ? 1 : -1;
    const walk = how === 'walk' ? f.rig.walk(this.dd(i, dir), 300) : null;
    if (how === 'dash') void f.rig.hop();
    const easing = how === 'dash' ? 'cubic-bezier(.3,.9,.4,1)' : how === 'slide' ? 'cubic-bezier(.1,.8,.3,1)' : how === 'hop' ? 'ease-out' : 'linear';
    const a = f.host.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${d}px)` }], { duration: ms, easing, fill: 'forwards' });
    await a.finished.catch(() => {});
    this.x[i] = to; this.place(i);
    a.cancel();
    await walk?.stop();
  }

  /**
   * The camera: world point `cx` in the middle of the view at zoom `z` (the floor stays where it is on screen). Bare
   * (Emotown's outdoor ring) has no camera.
   */
  private camera(cx: number, z: number, ms: number) {
    const cam = this.L.cam; if (!cam) return;
    // never past the drawn basement
    const half = WORLD.w / 2 / z;
    cx = Math.max(VIEW.x0 + half, Math.min(VIEW.x1 - half, cx));
    const to = `translate(${(WORLD.w / 2 - z * cx).toFixed(1)}px, ${(WORLD.floor * (1 - z)).toFixed(1)}px) scale(${z})`;
    if (!ms) { for (const a of cam.getAnimations()) a.cancel(); cam.style.transform = to; return; }
    const from = getComputedStyle(cam).transform;
    const a = cam.animate([{ transform: from === 'none' ? 'none' : from }, { transform: to }], { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    void a.finished.then(() => { cam.style.transform = to; a.cancel(); }).catch(() => {});
  }

  /** A beat where everything stops: the moment of impact, held (a hit-stop). */
  private async hitStop(ms: number) {
    const anims = this.L.world.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
    for (const a of anims) a.pause();
    await wait(ms);
    for (const a of anims) { try { a.play(); } catch { /* gone */ } }
  }

  /** The one throwing the blow is drawn in front of the one taking it (a paw in the fur, not behind it). */
  private front(a: 0 | 1) { this.f[a].host.style.zIndex = '4'; this.f[a === 0 ? 1 : 0].host.style.zIndex = '3'; }
  /** A point on screen, in the room's own units (inside the camera: what the effect layers use). */
  private toRoom(sx: number, sy: number) {
    const r = (this.L.cam ?? this.L.world).getBoundingClientRect();
    return { x: ((sx - r.left) * WORLD.w) / r.width, y: ((sy - r.top) * WORLD.h) / r.height };
  }
  /**
   * Where a blow meets the other one, read off the drawings at that instant: the middle of where the striking limb's box
   * overlaps the other's head or body (whichever it overlaps more); if it falls short, the gap's middle.
   */
  private impact(a: 0 | 1, d: 0 | 1) {
    const A = this.f[a]; const t = this.toward(a);
    const limb = A.rig.fightKit().el[striker(A.rig, this.dd(a, t)).id];
    const kd = this.f[d].rig.fightKit();
    if (!limb) return this.hitAt(a, d);
    const L = limb.getBoundingClientRect();
    let best: { x: number; y: number; area: number } | null = null;
    for (const part of [kd.el.head, kd.el.body]) {
      if (!part) continue;
      const P = part.getBoundingClientRect();
      const x0 = Math.max(L.left, P.left), x1 = Math.min(L.right, P.right), y0 = Math.max(L.top, P.top), y1 = Math.min(L.bottom, P.bottom);
      if (x1 > x0 && y1 > y0 && (!best || (x1 - x0) * (y1 - y0) > best.area)) best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, area: (x1 - x0) * (y1 - y0) };
    }
    if (best) return this.toRoom(best.x, best.y);
    const P = (kd.el.body ?? kd.el.head)!.getBoundingClientRect();
    const tip = t > 0 ? L.right : L.left; const near = t > 0 ? P.left : P.right;
    return this.toRoom((tip + near) / 2, L.top + L.height * 0.5);
  }
  /** The cat's claws: three streaks raked across where the paw landed, drawn on and gone. */
  private slash(x: number, y: number, dir: Dir, big: boolean) {
    const w = big ? 96 : 74;
    const el = document.createElement('div');
    el.className = 'prop fc-fx fc-slash';
    Object.assign(el.style, { position: 'absolute', width: `${w}px`, height: `${w}px`, left: `${x - w / 2}px`, top: `${y - w / 2}px`, pointerEvents: 'none', transform: `scaleX(${dir})` });
    const streak = (k: number) => `M ${14 + k * 16} 12 Q ${46 + k * 12} ${40 + k * 4} ${54 + k * 14} ${88 - k * 4}`;
    el.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" overflow="visible">${[0, 1, 2].map((k) => `<path d="${streak(k)}" fill="none" stroke="#111" stroke-width="11" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path d="${streak(k)}" fill="none" stroke="#FFF6F0" stroke-width="5.5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('')}</svg>`;
    this.L.front.appendChild(el);
    el.querySelectorAll('path').forEach((p, i) => p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 110, delay: Math.floor(i / 2) * 26, easing: 'ease-out', fill: 'forwards' }));
    const a = el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 620, fill: 'forwards' });
    void a.finished.then(() => el.remove()).catch(() => el.remove());
  }

  /** Sweat flying off a pet that has just been hit: a few drops thrown away from the blow in little arcs. */
  private spray(x: number, y: number, dir: Dir, n: number) {
    for (let k = 0; k < n; k++) {
      const el = document.createElement('div');
      el.className = 'prop fc-fx prop-droplet';
      const w = 12 + Math.random() * 6;
      Object.assign(el.style, { position: 'absolute', width: `${w}px`, height: `${w * 1.5}px`, left: `${x - w / 2}px`, top: `${y - w}px`, pointerEvents: 'none' });
      el.innerHTML = PROPS.droplet;
      this.L.front.appendChild(el);
      const dx = dir * (40 + Math.random() * 60); const up = 30 + Math.random() * 40; const spin = dir * (40 + Math.random() * 80);
      const a = el.animate([
        { transform: 'translate(0,0) rotate(0) scale(0.6)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${-up}px) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${up * 0.4}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
      ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      void a.finished.then(() => el.remove()).catch(() => el.remove());
    }
  }
  /** The one hit flashes white for an instant. */
  private flash(i: 0 | 1) {
    this.f[i].drawing.animate([{ filter: 'brightness(2.2) saturate(0.4)' }, { filter: 'brightness(1)' }], { duration: 170, easing: 'ease-out' });
  }

  // ---------------------------------------------------------------- effects

  /** A prop in a layer, centred at (x, y) (world units), animated in and out, then gone. */
  private burst(name: PropName, x: number, y: number, w: number, ms = 520, layer: 'front' | 'back' = 'front', spin = 0) {
    const el = document.createElement('div');
    el.className = `prop fc-fx prop-${name}`;
    const h = w / ASPECT[name];
    Object.assign(el.style, { position: 'absolute', width: `${w}px`, height: `${h}px`, left: `${x - w / 2}px`, top: `${y - h / 2}px`, pointerEvents: 'none' });
    el.innerHTML = PROPS[name];
    this.L[layer].appendChild(el);
    const a = el.animate([
      { transform: `scale(0.2) rotate(${-spin}deg)`, opacity: 0 }, { transform: `scale(1.15) rotate(0deg)`, opacity: 1, offset: 0.25 },
      { transform: 'scale(1)', opacity: 1, offset: 0.6 }, { transform: `scale(1.05) rotate(${spin / 2}deg)`, opacity: 0 },
    ], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    void a.finished.then(() => el.remove()).catch(() => el.remove());
  }
  /** Big words over the fight ("FIGHT!", "K.O.!"), fixed to the view (outside the camera). */
  banner(text: string, ms = 1100, tone: 'go' | 'ko' = 'go') {
    const el = document.createElement('div');
    el.className = `fc-banner fc-banner-${tone}`;
    el.textContent = text;
    this.L.world.appendChild(el);
    const a = el.animate([
      { transform: 'translate(-50%, -50%) scale(0.3) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.12) rotate(2deg)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%, -50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -50%) scale(1.3) rotate(0)', opacity: 0 },
    ], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    void a.finished.then(() => el.remove()).catch(() => el.remove());
    return wait(ms * 0.35);
  }
  private shake(power = 1) {
    const t = this.L.cam ?? this.L.world;
    t.animate([
      { translate: '0 0' }, { translate: `${-6 * power}px ${3 * power}px` }, { translate: `${5 * power}px ${-2 * power}px` }, { translate: `${-3 * power}px ${1 * power}px` }, { translate: '0 0' },
    ], { duration: 260, easing: 'ease-out', composite: 'add' });
  }
  /** Where a fighter's face is, in the room. */
  private faceAt(i: 0 | 1) {
    const b = fbox(this.f[i].character);
    return { x: this.x[i], y: b.top + b.h * (this.f[i].character === 'cat' ? 0.42 : 0.2) };
  }
  /** Where a blow lands on a fighter: its body at the height the strike comes in (the cat's paw is lower than a sleeve). */
  private hitAt(a: 0 | 1, d: 0 | 1) {
    const f = this.faceAt(d); const from: Dir = a === 0 ? -1 : 1;
    const low = this.f[a].character === 'cat' && this.f[d].character === 'frog' ? 40 : 0;
    return { x: f.x + from * HALF[this.f[d].character] * 0.6, y: f.y + low };
  }

  // ---------------------------------------------------------------- the beats

  /** Both walk in from the crowd to their marks and square up. */
  async intro() {
    this.busy = true;
    for (const i of [0, 1] as const) { this.x[i] = i === 0 ? -80 : WORLD.w + 80; this.place(i); }
    this.face();
    await Promise.all([this.move(0, MARK[0], 1500), this.move(1, MARK[1], 1500)]);
    this.face();
    for (const i of [0, 1] as const) stance(this.f[i].rig);
    await wait(250);
    this.busy = false;
  }

  /** One exchange: the attacker closes to striking distance and strikes; it lands, or the other skips back out of reach. */
  async blow(b: Blow) {
    this.busy = true;
    const a = b.by; const d = a === 0 ? 1 : 0;
    const A = this.f[a]; const D = this.f[d];
    const t = this.toward(a);
    A.rig.release('fc-stance', 100);
    this.front(a);
    const spot = this.x[d] - t * contact(A.character, D.character);
    this.crowd?.watch((spot + this.x[d]) / 2);
    await this.move(a, spot, 280, 'dash');
    if (!b.land) {
      // the defender sees it coming and skips back out of reach as the blow comes through
      D.rig.release('fc-stance', 60);
      const back = this.move(d, this.x[d] + t * 60, 220, 'hop');
      await strike(A.rig, this.dd(a, t), () => { this.sfx('fight.swing'); this.sfx('fight.crowd', { dur: 0.7, v: 0.35, rate: 1.2 }); this.burst('whoosh', this.x[a] + t * REACH[A.character], this.faceAt(a).y + 10, 70, 420, 'front'); this.crowd?.gasp(); }, { rear: rearFor(A.character, D.character) });
      await back;
      await wait(260);
    } else {
      await strike(A.rig, this.dd(a, t), () => void this.land(a, d, b.big ? 2 : 1), { rear: rearFor(A.character, D.character) });
      await wait(b.big ? 760 : 560);
    }
    // back to the marks and square up again; the frok's slap mark fades as they reset
    await Promise.all([this.move(a, MARK[a], 420, 'walk'), this.move(d, MARK[d], 420, 'walk')]);
    this.face();
    D.rig.clearMark(700);
    stance(A.rig); stance(D.rig);
    this.busy = false;
  }

  /** A blow lands on the defender: a hit-stop, the reaction and a knock back, the burst on the side it came from, a jolt. */
  private async land(a: 0 | 1, d: 0 | 1, power: 1 | 2, at?: { x: number; y: number }) {
    const A = this.f[a]; const D = this.f[d]; const from: Dir = a === 0 ? -1 : 1;
    D.rig.release('fc-stance', 40);
    const p = at ?? this.impact(a, d);
    // the blow, the one hit crying out, the crowd
    const pan = ((p.x - WORLD.w / 2) / (WORLD.w / 2)) * 0.4;
    if (A.character === 'sahur' && power === 2) this.sfx('tung', { pan, v: 1.1 }); else this.sfx('fight.hit', { pan, rate: power === 2 ? 0.82 : 1.05, v: power === 2 ? 1.15 : 0.85 });
    if (A.character === 'cat') this.sfx('fight.swing', { pan, v: 0.7 });
    this.sfx('voice.ouch', { who: D.character, pan, delay: 0.07, v: 0.9 });
    this.sfx('fight.crowd', { dur: power === 2 ? 1.3 : 0.8, v: power === 2 ? 0.7 : 0.45 });
    if (A.character === 'cat') this.slash(p.x, p.y, (-from) as Dir, power === 2);
    this.burst(A.character === 'sahur' && power === 2 ? 'tung' : 'pow', p.x, p.y, A.character === 'sahur' && power === 2 ? 130 : power === 2 ? 118 : 84, 560, 'front', 12);
    if (power === 2) this.burst('sparkle', p.x - from * 20, p.y - 34, 54, 700, 'front', 30);
    this.spray(p.x, p.y, (-from) as Dir, power === 2 ? 4 : 2);
    this.flash(d);
    this.crowd?.roar(power);
    this.shake(power);
    await this.hitStop(power === 2 ? 130 : 80);
    void D.rig.hit(this.dd(d, from));
    if (!this.finishing) void this.move(d, this.x[d] - from * (power === 2 ? 34 : 20), 180, 'slide');
  }

  /** The finisher lands and the loser is knocked out cold; the black eye; the winner celebrates, and the belt. */
  async finish(winner: 0 | 1) {
    this.busy = true;
    const l = winner === 0 ? 1 : 0;
    const W = this.f[winner]; const Lo = this.f[l];
    const t = this.toward(winner);
    await this.setUp(winner, l);
    this.finishing = true;
    W.rig.release('fc-stance', 100);
    this.front(winner);
    this.crowd?.watch(this.x[l]);
    if (W.character === 'sahur') {
      // tung tung tung: three knocks from right up close, the third one the knockout
      await this.move(winner, this.x[l] - t * contact('sahur', Lo.character), 280, 'dash');
      for (let k = 0; k < 3; k++) {
        await W.rig.knock(k === 2 ? 2 : 1, () => {
          if (k < 2) { const p = this.impact(winner, l); this.sfx('tung', { rate: 0.92 + k * 0.08 }); this.sfx('voice.ouch', { who: Lo.character, delay: 0.07, v: 0.8 }); this.burst('tung', p.x, p.y - 10, 96, 520, 'front', 6); this.shake(1); this.crowd?.roar(1); void Lo.rig.hit(this.dd(l, (-t) as Dir)); }
          else void this.land(winner, l, 2);
        });
      }
    } else if (W.character === 'frog') {
      // the frok's own slap: the giant glove swings in from behind him and lands on the other one's cheek
      await this.giantSlap(winner, l);
    } else {
      // the cat pounces across the gap and lands a one-two, the second the big one
      await this.pounce(winner, l);
      await strike(W.rig, this.dd(winner, t), () => void this.land(winner, l, 1), { rear: rearFor('cat', Lo.character) });
      await strike(W.rig, this.dd(winner, t), () => void this.land(winner, l, 2), { rear: rearFor('cat', Lo.character) });
    }
    await this.knockOut(winner, l);
    this.finishing = false;
    // the winner's turn: the camera comes back out, the cheek clears, a leap with the arms up, the belt at the top of it
    this.camera(300, 1, 900);
    this.crowd?.watch(this.x[winner], 300);
    W.rig.clearMark(400);
    const cheer = victory(W.rig);
    this.sfx('fight.win'); this.sfx('voice.happy', { who: W.character, delay: 0.3 });
    await wait(420);
    W.looks.setBelt(true);
    const b = fbox(W.character);
    this.burst('sparkle', this.x[winner], b.top + b.h * 0.55, 110, 900, 'front', 40);
    this.burst('sparkle', this.x[winner] - 40, b.top + b.h * 0.4, 60, 800, 'front', 20);
    await cheer;
    this.busy = false;
  }

  /** How long a pet is lying down (its feet to the top of its head, about), and how thick (its body's width). */
  private lying(i: 0 | 1) { const c = this.f[i].character; return { len: fbox(c).footY * 0.92, half: HALF[c] + (c === 'cat' ? 0 : 8) }; }

  /**
   * Before the finisher both shuffle along the circle to where it will be thrown from, chosen so that the loser, blown
   * back and lying flat, ends up in the middle of the room with the winner in view: a Sahur lying down is longer than
   * half the room, and from the marks he would go over out of it.
   */
  private async setUp(winner: 0 | 1, l: 0 | 1) {
    const W = this.f[winner]; const Lo = this.f[l]; const t = this.toward(winner);
    const { len, half } = this.lying(l);
    const reach = W.character === 'frog' ? SLAP_FROM : contact(W.character, Lo.character);
    const back = fbox(W.character).w * 0.3;
    // along the winner's direction, from the loser's spot: the winner's back at -(reach + back), the loser's head at
    // KNOCK + half + len. Centred when it fits; when it does not, the loser's head is kept in the room first.
    const ahead = KNOCK + half + len;
    let xl = 300 - t * (ahead - reach - back) / 2;
    const headLimit = t > 0 ? 568 - ahead : 32 + ahead;
    if (t > 0 ? xl > headLimit : xl < headLimit) xl = headLimit;
    let pre = W.character === 'cat' ? 120 : W.character === 'sahur' ? 70 : 0;
    const room = t > 0 ? xl - reach - 50 : 550 - xl - reach;
    pre = Math.max(0, Math.min(pre, room));
    const xw = xl - t * (reach + pre);
    for (const i of [0, 1] as const) this.f[i].rig.release('fc-stance', 80);
    await Promise.all([this.move(winner, xw, 560, 'walk'), this.move(l, xl, 560, 'walk')]);
    this.face();
    stance(W.rig); stance(Lo.rig);
    await wait(260);
  }

  /**
   * Knocked out: the loser is blown back off its feet and goes over flat on its side, tipping over the edge of its body
   * away from the winner (feet toward the winner, head away), bounces once and lies still with its eyes crossed, stars
   * going round its head and the black eye coming up. The camera pushes in on it for the K.O.
   */
  private async knockOut(winner: 0 | 1, l: 0 | 1) {
    const Lo = this.f[l]; const away = (-this.toward(l)) as Dir;
    const LB = fbox(Lo.character); const { len, half } = this.lying(l);
    Lo.rig.release('fc-stance', 40);
    // tip over the edge of the body on the far side, so the whole of it ends up on the floor, not half through it
    Lo.body.style.transformOrigin = `${LB.w / 2 + away * half}px ${LB.footY}px`;
    const lx = this.x[l] + away * KNOCK;
    const fly = this.move(l, lx, 360, 'slide');
    const down = Lo.body.animate([
      { transform: 'rotate(0)' },
      { transform: `rotate(${away * 14}deg) translateY(-22px)`, offset: 0.28 },
      { transform: `rotate(${away * 90}deg) translateY(0)`, offset: 0.7, easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: `rotate(${away * 80}deg) translateY(0)`, offset: 0.82, easing: 'ease-in' },
      { transform: `rotate(${away * 90}deg) translateY(0)` },
    ], { duration: 860, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
    if ('persist' in down) down.persist();
    knockedOut(Lo.rig);
    await fly; await down.finished.catch(() => {});
    const edge = lx + away * half;                       // the edge it went over: where it lies from
    const headX = edge + away * len * 0.78;
    this.shake(1.8);
    this.sfx('fight.ko'); this.sfx('fight.crowd', { dur: 2.2, v: 0.95 }); this.sfx('stars', { delay: 0.5, v: 0.8 });
    this.burst('puff', edge + away * len * 0.4, WORLD.floor - 8, 130, 700, 'front');
    this.burst('puff', edge + away * len * 0.85, WORLD.floor - 12, 90, 700, 'front');
    this.crowd?.erupt();
    this.crowd?.watch(edge + away * len * 0.5, 380);
    // push in on the one lying there
    this.camera(edge + away * len * 0.45, 1.16, 600);
    Lo.looks.setBlackEye(true);
    this.orbitStars(headX, WORLD.floor - half * 2 - 10);
    this.sfx('fight.bell', { n: 3, delay: 0.1 });
    await this.banner('K.O.!', 1700, 'ko');
    await wait(500);
  }

  /** The cat's leap: a high arcing jump across the gap that lands her in reach of the other one. */
  private async pounce(a: 0 | 1, d: 0 | 1) {
    const A = this.f[a]; const t = this.toward(a);
    const to = this.x[d] - t * contact('cat', this.f[d].character); const dx = to - this.x[a];
    const jump = A.rig.superJump(820, 70);
    const hop = A.host.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx * 0.1}px)`, offset: 0.12 }, { transform: `translateX(${dx}px)`, offset: 0.86 }, { transform: `translateX(${dx}px)` }], { duration: 820, easing: 'ease-in-out', fill: 'forwards' });
    await hop.finished.catch(() => {});
    this.x[a] = to; this.place(a); hop.cancel();
    this.burst('puff', to + t * 10, WORLD.floor - 10, 80, 520, 'front');
    await jump;
  }

  /**
   * The frok's slap, fought: the room's giant glove (a 1400 x 260 picture, the hand upright at its left end and the
   * sleeve running off to the right; palm (100,168), wrist (168,200)) comes in from the frok's side, cocks, and lands on
   * the other one's cheek, then draws back out. Driven in absolute poses, as in the room (a translate after a persisted
   * rotate would slide along the tilted axis). At the basement's scale.
   */
  private async giantSlap(a: 0 | 1, d: 0 | 1) {
    // the glove is not in the main bundle (scene/stuntProps.ts): without this the prop was the word "undefined"
    await loadStuntProps();
    if (this.stopped) return;
    const A = this.f[a]; const t = this.toward(a);
    const dir = (-t) as Dir;
    const cheek = this.faceAt(d);
    const PW = 735 * ARENA_SCALE; const k = PW / 1400; const PH = 260 * k;
    const palm = { x: 100 * k, y: 168 * k }; const wrist = { x: 168 * k, y: 200 * k };
    const HOVER = 150 * ARENA_SCALE;
    const el = document.createElement('div');
    el.className = 'prop fc-fx prop-slaphand';
    const inner = document.createElement('div'); inner.className = 'prop-inner'; inner.innerHTML = PROPS.slaphand ?? '';
    el.appendChild(inner);
    const cx = cheek.x + dir * (HOVER + PW / 2 - palm.x); const bottom = cheek.y - palm.y + PH;
    Object.assign(el.style, { position: 'absolute', width: `${PW}px`, height: `${PH}px`, left: `${cx - PW / 2}px`, top: `${bottom - PH}px`, pointerEvents: 'none', transformOrigin: `${dir > 0 ? wrist.x : PW - wrist.x}px ${wrist.y}px` });
    if (dir < 0) inner.style.transform = 'scaleX(-1)';
    this.L.front.appendChild(el);
    const TILT = -10;
    const P = (tx: number, ty: number, rot: number) => ({ transform: `translate(${dir * tx * ARENA_SCALE}px, ${ty * ARENA_SCALE}px) rotate(${dir * (rot + TILT)}deg)` });
    let last: Animation | null = null;
    const move = (kf: Keyframe[], ms: number) => { const an = el.animate(kf, { duration: ms, fill: 'forwards', composite: 'replace' }); last?.cancel(); last = an; return an; };
    // the frok points at his target as the glove comes in behind him
    void strike(A.rig, this.dd(a, t), () => {});
    move([{ ...P(560, 0, 0), easing: 'cubic-bezier(.2,.8,.3,1)' }, { ...P(-10, 0, 0), offset: 0.74, easing: 'ease-in-out' }, P(0, 0, 0)], 560);
    this.sfx('whoosh', { dur: 0.5, rate: 0.6, v: 0.7 });
    await wait(620);
    move([{ ...P(0, 0, 0), easing: 'cubic-bezier(.3,0,.2,1)' }, P(80, 0, 18)], 380);
    await wait(420);
    const LAND = -(150 - 8);
    move([{ ...P(80, 0, 18), easing: 'cubic-bezier(.6,0,1,.4)' }, P(LAND, 0, -8)], 95);
    this.sfx('slap.wind', { dur: 0.16 });
    await wait(95);
    this.sfx('slap.hit');
    await this.land(a, d, 2);
    await wait(60);
    move([{ ...P(LAND, 0, -8), easing: 'ease-out' }, P(LAND - 70, -78, -16)], 170);
    await wait(240);
    const out = move([{ ...P(LAND - 70, -78, -16), easing: 'cubic-bezier(.5,0,.8,.4)' }, P(760, -60, 10)], 480);
    void out.finished.then(() => el.remove(), () => el.remove());
  }

  /** Stars going round over a knocked-out head, for a good while. */
  private orbitStars(cx: number, cy: number) {
    for (let k = 0; k < 4; k++) {
      const el = document.createElement('div');
      el.className = 'prop fc-fx fc-star';
      Object.assign(el.style, { position: 'absolute', width: '26px', height: '26px', left: `${cx - 13}px`, top: `${cy - 13}px`, pointerEvents: 'none' });
      el.innerHTML = PROPS.sparkle;
      this.L.front.appendChild(el);
      const a = el.animate(Array.from({ length: 9 }, (_, j) => {
        const ang = ((j / 8) * Math.PI * 2) + (k * Math.PI * 2) / 4;
        return { transform: `translate(${Math.cos(ang) * 38}px, ${Math.sin(ang) * 11 - 20}px) scale(${0.8 + 0.3 * Math.sin(ang)})` };
      }), { duration: 1000, iterations: 6, easing: 'linear' });
      void a.finished.then(() => el.remove()).catch(() => el.remove());
    }
  }

  /** The whole fight from the top: walk in, FIGHT!, the exchanges, the finisher. */
  async play(plan: Plan) {
    if (this.busy) return;
    this.reset();
    this.sfx('fight.crowd', { dur: 1.8, v: 0.5 });
    await this.intro();
    if (this.stopped) return;
    this.sfx('fight.bell', { n: 2 });
    await this.banner('FIGHT!', 1000, 'go');
    await wait(500);
    for (const b of plan.blows.slice(0, -1)) { if (this.stopped) return; await this.blow(b); await wait(160); }
    if (this.stopped) return;
    await this.finish(plan.winner);
  }
}
