/**
 * The town's simulation: where every resident is, at every moment, whether or not anyone is looking.
 *
 * It is cheap on purpose. A resident is a point on the pavement and at most one straight trip (from, to, when), so
 * its position at any time is a lerp; nothing ticks per frame. A few times a second the sim looks for residents whose
 * pause is over and gives them somewhere to go, chosen from their on-chain state: the hungry drift to the diner, the
 * grubby to the bathhouse, the bored to the park, the sleeping doze on the inn's porch, the crowned hold court on the
 * town hall's steps, ghosts haunt the graveyard, and everyone else strolls where they like.
 *
 * The pets you can see are drawn by actors (Actor.tsx), which read the same trip and animate it; a live event from
 * the chain goes to the actor if the pet is on screen and waits a while for the camera otherwise.
 */
import type { CatView, Collection } from '@emo-pets/chain';
import type { Character, Dir } from '../pet/Pet';
import { characterOf } from '../pets';
import { isHushed } from '../pet/rig';
import { sceneOf } from '../items';
import { GATE_X, INDOOR_FOR, LANDMARK, LANDMARKS, LANE_BACK, LANE_FRONT, OBSTACLES, STREET_DENSITY, TOWN, WANDER, walkSpeed, type Obstacle, type ZoneId } from './layout';
import type { LiveEvent } from './data';

export type Trip = { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; float: boolean };
/** what an on-screen pet can be asked to do (Actor.tsx implements it) */
export type ActorHandle = {
  busy: () => boolean;
  go: (t: Trip) => void;
  halt: () => void;
  perform: (e: LiveEvent) => void;
  dress: () => void;
  /** on screen (animating) or just off it (every animation paused: a paused rig costs nothing) */
  setAwake: (on: boolean) => void;
  isAwake: () => boolean;
  /** awake (on screen), paused (just off it: frozen but drawn, ready to scroll in), hidden (far off: display:none) */
  setMode: (m: 'awake' | 'paused' | 'hidden', anims?: Animation[]) => void;
  /** its running animations (read them for every switching pet first, then switch: see Actor) */
  animations: () => Animation[];
  mode: () => 'awake' | 'paused' | 'hidden';
  /** it did not go in at the door after all (see `enter`): shown again, as it was */
  reappear: () => void;
  /** a neighbour says hello: turn toward it and nuzzle the air (false if busy, asleep or a ghost) */
  greet: (toward: 1 | -1) => boolean;
  /** it has reached a door: fade into the building (the sim then takes it off the street) */
  enter: () => Promise<void>;
};
export type Resident = {
  key: string; col: Collection; id: number; character: Character;
  view: CatView | null; worn: number[];
  /** the latest thing its owner did, and when (unix seconds) */
  last: { ts: number; what: string } | null;
  x: number; y: number; dir: Dir;
  zone: ZoneId;
  trip: Trip | null;
  /** when the current pause ends (ms) */
  nextAt: number;
  actor: ActorHandle | null;
  /** live events that happened while it was off screen: played when the camera arrives, dropped after a minute */
  pending: { e: LiveEvent; at: number }[];
  /** it arrived in town while the page was open */
  fresh: boolean;
  /** indoors (not drawn), heading for a door, when it comes back out, when it last came out */
  inside: ZoneId | null; goingIn: ZoneId | null; outAt: number; exitedAt: number;
  /** the rest of a walk that goes round something: the points still to reach after this leg */
  route: { x: number; y: number }[];
  /** a visitor: not in the day's index, here because its owner is in the town square (social/); walks out when they go */
  visitor?: boolean;
  /** walking out through the gate, to be taken off the street when it gets there */
  departing?: boolean;
  /** mid-action (a meal, a bath, a stunt) until this time (ms): the others keep a wider berth */
  stage?: number;
  /** when it was last moved on for standing on someone (ms) */
  nudgedAt?: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const keyOf = (col: Collection, id: number) => `${col}:${id}`;
/** The pets Emotown draws: the cat, the frok, Sahur and (with his switch on) Thiccums. A newer pet is not in town until his
 *  drawing is built for it (the street's thinned drawings and the phones' layered rig); every way in asks this first. */
export const inTown = (col: Collection): boolean => col === 'cat' || col === 'frok' || col === 'sahur' || (!!__THICCUMS__ && col === 'thiccums') || (!!__R3TARDS__ && col === 'r3tards') || (!!__EMONAD__ && col === 'emonad');

/** Where a pet would rather be, from its state. */
export function homeZone(r: Resident): ZoneId | null {
  const v = r.view;
  if (!v) return null;
  if (!v.alive) return 'graveyard';
  if (v.asleep) return 'inn';
  if (v.crowned && Math.random() < 0.55) return 'hall';   // most of the crowned hold court on the steps; the rest are out and about
  switch (v.mood) {
    case 'hungry': return 'diner';
    case 'grubby': return 'baths';
    case 'bored': return 'park';
    case 'sleepy': return 'inn';
  }
  const scene = sceneOf(r.worn);
  if (scene === 'halloween' && Math.random() < 0.55) return 'haunted';
  if (scene === 'backrooms' && Math.random() < 0.55) return 'backrooms';
  return null;
}
function pickWander(): ZoneId {
  const total = WANDER.reduce((a, [, w]) => a + w, 0); let t = Math.random() * total;
  for (const [z, w] of WANDER) { t -= w; if (t <= 0) return z; }
  return 'hall';
}

export class TownSim {
  readonly residents = new Map<string, Resident>();
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** asleep and ghost residents keep still; everyone else pauses this long between strolls */
  pause = (): number => rand(10000, 32000);

  /** the sim's clock runs while a page shows it (start/stop pair with an effect, so React's dev double mount is harmless) */
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 400); }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  /** bumps on every change anyone might draw (a resident added, a state read) */
  version = 0;
  private changed() { this.version++; for (const s of this.subs) s(); }
  /** tell the page to look again (an actor just mounted and wants to know if it is on screen); nothing redraws */
  poke() { for (const s of this.subs) s(); }

  // ---- indoors ----
  /** pets that must stay in view: the one being looked at, the one followed, yours */
  readonly pinned = new Set<string>();
  /** the visitor's own pets: always out where they can be seen */
  readonly mine = new Set<string>();
  /** pets whose owners are in the town square right now: out on the street while they are (social/) */
  readonly guests = new Set<string>();
  /** departing visitors in their last half second (fading out at the gate) */
  private fading = new Set<string>();
  keepOut(key: string) { this.mine.add(key); const r = this.residents.get(key); if (r?.inside) this.exit(r); if (r?.goingIn) { r.goingIn = null; this.halt(r); } }
  /** 1 on a machine that keeps up; lowered by the page's frame-rate governor on a slow one (more pets go indoors) */
  crowdScale = 1;
  /**
   * What the camera shows, in town units (the page keeps it current). Pets are only ever SENT indoors from outside it:
   * on a phone the window is a tenth of the street, and a governor making room sent a stream of pets into doors right
   * in front of you ("characters are disappearing in the town a lot and then back in", operator, 2026-09-27).
   */
  view = { lo: -Infinity, hi: Infinity };
  private unseen(r: Resident, now: number) { const x = this.pos(r, now).x; return x < this.view.lo - 90 || x > this.view.hi + 90; }
  get maxOut() { return Math.round((TOWN.w / 1000) * STREET_DENSITY * this.crowdScale); }
  get outsideCount() { let n = 0; for (const r of this.residents.values()) if (!r.inside) n++; return n; }
  insideOf(z: ZoneId): Resident[] { return [...this.residents.values()].filter((r) => r.inside === z); }
  /** which building suits it: bed if asleep, the diner if hungry, the baths if grubby, court if crowned, its own theme's door, else anywhere with a door */
  indoorFor(r: Resident): ZoneId {
    const v = r.view;
    if (v?.asleep) return 'inn';
    const need = v ? INDOOR_FOR[v.mood] : undefined; if (need) return need;
    if (v?.crowned && Math.random() < 0.5) return 'hall';
    const scene = sceneOf(r.worn);
    if (scene === 'halloween' && Math.random() < 0.6) return 'haunted';
    if (scene === 'backrooms' && Math.random() < 0.6) return 'backrooms';
    const doors: [ZoneId, number][] = [['diner', 1], ['baths', 0.7], ['shop', 1.3], ['inn', 0.8], ['hall', 0.5], ['haunted', 0.25], ['backrooms', 0.2]];
    let t = Math.random() * doors.reduce((a, [, w]) => a + w, 0);
    for (const [z, w] of doors) { t -= w; if (t <= 0) return z; }
    return 'shop';
  }
  putInside(r: Resident, z: ZoneId, initial = false) {
    const L = LANDMARK[z];
    r.inside = z; r.goingIn = null; r.trip = null; r.zone = z;
    r.x = L.door ?? (L.x0 + L.x1) / 2; r.y = LANE_BACK;
    const stay = r.view?.asleep ? rand(150_000, 420_000) : rand(40_000, 150_000);
    r.outAt = Date.now() + (initial ? rand(8_000, stay) : stay);
    this.changed();
  }
  /** Out of its door and back on the street (its time is up, or someone asked for it). */
  exit(r: Resident) {
    if (!r.inside) return;
    const L = LANDMARK[r.inside];
    // out at the door, or beside it when someone is standing on the step
    const door = L.door ?? (L.x0 + L.x1) / 2;
    let at = { x: door + rand(-8, 8), y: LANE_BACK + rand(4, 16) }; let best = this.room(r, at);
    for (let i = 0; i < 12 && best < 1; i++) {
      const c = { x: door + rand(-70, 70), y: LANE_BACK + rand(4, 56) };
      if (blockedAt(c.x, c.y)) continue;
      const k = this.room(r, c); if (k > best) { at = c; best = k; }
    }
    r.inside = null; r.x = at.x; r.y = at.y;
    r.exitedAt = Date.now(); r.nextAt = Date.now() + rand(900, 2200); r.trip = null;
    this.changed();
  }
  /** Walk to a door and go in. */
  sendIn(r: Resident, z: ZoneId) {
    const L = LANDMARK[z]; if (L.door === undefined) return;
    r.goingIn = z; r.zone = z;
    this.send(r, { x: L.door + rand(-6, 6), y: LANE_BACK });
    if (!r.trip) void this.arrive(r);
  }
  private async arrive(r: Resident) {
    const z = r.goingIn; if (!z) return;
    if (r.actor) await r.actor.enter().catch(() => {});
    if (r.goingIn === z) this.putInside(r, z);
    else r.actor?.reappear();   // it was called away on the doorstep: it must not be left faded out
  }
  private lastChurn = 0;
  private ticks = 0;
  private balance(now: number) {
    // out: whoever's time is up, one at a time, while the street has room
    let out = this.outsideCount;
    for (const r of this.residents.values()) {
      if (r.inside && now >= r.outAt && out < this.maxOut) {
        if (r.view?.asleep && r.inside === 'inn' && Math.random() < 0.6) { r.outAt = now + rand(60_000, 200_000); continue; }   // still sleeping it off
        this.exit(r); out++; break;
      }
    }
    // in: a street over its limit sends someone indoors; now and then someone goes in anyway (the doors are alive)
    const over = out > this.maxOut + 2;
    if (!over && now - this.lastChurn < 7000) return;
    if (over && now - this.lastChurn < 250) return;   // over the limit: one in every quarter second until it is not
    this.lastChurn = now;
    const cands = [...this.residents.values()].filter((r) => !r.inside && !r.goingIn && !r.trip && !r.departing && !this.pinned.has(r.key) && !this.mine.has(r.key) && !this.guests.has(r.key) && !r.actor?.busy() && this.unseen(r, now) && r.view?.alive && now - r.exitedAt > 20_000);
    if (!cands.length || (!over && out < this.maxOut - 6)) return;
    const r = cands[Math.floor(Math.random() * cands.length)]!;
    const want = this.indoorFor(r);
    const near = LANDMARKS.filter((l) => l.door !== undefined).sort((a, b) => Math.abs(a.door! - r.x) - Math.abs(b.door! - r.x));
    this.sendIn(r, Math.abs(LANDMARK[want].door! - r.x) < 900 ? want : near[0]!.id);
  }

  /** Where a resident is right now. */
  pos(r: Resident, now = Date.now()): { x: number; y: number } {
    const t = r.trip; if (!t) return { x: r.x, y: r.y };
    const u = clamp((now - t.t0) / Math.max(1, t.t1 - t.t0), 0, 1);
    return { x: t.x0 + (t.x1 - t.x0) * u, y: t.y0 + (t.y1 - t.y0) * u };
  }

  /** Move in: placed straight into its zone (the first load), or walking in through the gate (arrived live). */
  add(col: Collection, id: number, init: { view: CatView | null; worn: number[]; last: Resident['last'] }, arriving = false): Resident {
    const key = keyOf(col, id);
    const had = this.residents.get(key); if (had) return had;
    const r: Resident = { key, col, id, character: characterOf(col), view: init.view, worn: init.worn, last: init.last, x: 0, y: 0, dir: 1, zone: 'gate', trip: null, nextAt: 0, actor: null, pending: [], fresh: arriving, inside: null, goingIn: null, outAt: 0, exitedAt: 0, route: [] };
    const z = this.roomy(r, homeZone(r) ?? pickWander());
    r.zone = z;
    // a full street, or a sleeper (most of whom are in bed): indoors, in the building that suits it
    const bed = !!init.view?.asleep && !!init.view.alive && Math.random() < 0.7;
    if (!arriving && (bed || this.outsideCount >= this.maxOut)) {
      this.residents.set(key, r);
      this.putInside(r, this.indoorFor(r), true);
      this.changed();
      return r;
    }
    if (arriving) {
      r.x = GATE_X + rand(-10, 10); r.y = LANE_BACK + rand(2, 14); r.nextAt = Date.now() + 1200; r.exitedAt = Date.now();
    } else {
      const s = this.spot(r, z); r.x = s.x; r.y = s.y; r.dir = Math.random() < 0.5 ? -1 : 1;
      r.nextAt = Date.now() + rand(1500, 16000);
    }
    this.residents.set(key, r);
    this.changed();
    return r;
  }

  /** How many are in a zone (standing there or headed there), and how many it holds before it feels packed. */
  private load(z: ZoneId, except: Resident): number { let n = 0; for (const o of this.residents.values()) if (o !== except && o.zone === z) n++; return n; }
  /** about one pet per 70 units of its stretch: two or three deep with every face showing (34 made a pile on a phone) */
  private capacity(z: ZoneId): number { const L = LANDMARK[z]; return Math.max(3, Math.round((L.stand[1] - L.stand[0]) / 70)); }
  /** Its zone of choice, unless that is packed: then the least crowded of the zones a pet at a loose end would pick. */
  private roomy(r: Resident, want: ZoneId): ZoneId {
    if (this.load(want, r) < this.capacity(want)) return want;
    let best: ZoneId = want; let bestFree = -Infinity;
    for (const [z] of WANDER) { if (z === 'graveyard' || z === 'haunted' || z === 'backrooms') continue; const free = this.capacity(z) - this.load(z, r); if (free > bestFree) { bestFree = free; best = z; } }
    return best;
  }

  /** A free spot in a zone: not on top of anyone already standing (or headed) there. */
  spot(r: Resident, z: ZoneId): { x: number; y: number } {
    const c = this.clearSpot(r, z); if (c) return c;
    // no clear ground left there (the park is mostly slide and swings): the nearest zone that has some
    const L = LANDMARK[z]; const mid = (L.stand[0] + L.stand[1]) / 2;
    const others = LANDMARKS.filter((l) => l.id !== z && l.id !== 'graveyard').sort((a, b) => Math.abs((a.stand[0] + a.stand[1]) / 2 - mid) - Math.abs((b.stand[0] + b.stand[1]) / 2 - mid)).slice(0, 4);
    for (const o of others) { const s2 = this.clearSpot(r, o.id, 10); if (s2) { r.zone = o.id; return s2; } }
    // nowhere clear near here: the roomiest of a few tries in its own zone, never a spot picked blind (that was how
    // pets ended up standing on each other on a full street)
    let best = { x: rand(L.stand[0], L.stand[1]), y: rand(LANE_BACK, LANE_FRONT) }; let most = -1;
    for (let i = 0; i < 16; i++) {
      const c = { x: rand(L.stand[0], L.stand[1]), y: rand(LANE_BACK, LANE_FRONT) };
      if (blockedAt(c.x, c.y)) continue;
      const k = this.room(r, c); if (k > most) { most = k; best = c; }
    }
    return best;
  }
  /** a spot in a zone with a pet's room round it and no prop underfoot, or null after enough tries */
  private clearSpot(r: Resident, z: ZoneId, tries = 18): { x: number; y: number } | null {
    const L = LANDMARK[z];
    for (let i = 0; i < tries; i++) {
      const c = { x: rand(L.stand[0], L.stand[1]), y: rand(LANE_BACK, LANE_FRONT) };
      if (!blockedAt(c.x, c.y) && this.room(r, c) >= 1) return c;
    }
    return null;
  }
  /**
   * How much room a spot has: 1 or more is clear. Two pets at about the same depth need more than a pet's width between
   * them; one a row further back may stand closer (its head shows over the one in front) but never right behind it;
   * a pet in the middle of an action gets its whole stretch of room. Each pet counts where it is going, not where it is.
   */
  private room(r: Resident, c: { x: number; y: number }, now = Date.now()): number {
    let worst = Infinity;
    for (const o of this.residents.values()) {
      if (o === r || o.inside) continue;
      // where it is going: the end of its route, else (x, y), which leg() sets to the end of the walk under way
      const last = o.route.length ? o.route[o.route.length - 1]! : null;
      const dy = Math.abs((last ? last.y : o.y) - c.y); if (dy >= 130) continue;
      const dx = Math.abs((last ? last.x : o.x) - c.x);
      const need = (o.stage ?? 0) > now ? (dy < 70 ? 190 : 0) : dy < 45 ? 105 : dy < 90 ? 75 : 45;
      if (need > 0 && dx < need * worst) worst = dx / need;
    }
    return worst;
  }

  /**
   * Send a resident somewhere now, round anything in the way (a trip per leg, at its walking pace). With `mayWait` it
   * does not set off at all when every way there would walk through another pet (false: the caller tries again in a
   * moment, the way a person waits for a gap); otherwise it takes the way that is at least clear of the props.
   */
  send(r: Resident, to: { x: number; y: number }, now = Date.now(), mayWait = false): boolean {
    const p = this.pos(r, now);
    let pts: { x: number; y: number }[] | null;
    if (r.view && !r.view.alive) pts = [to];   // a ghost floats over everything
    else {
      pts = this.path(r, p, to, now);
      if (!pts) { if (mayWait) return false; pts = propsPath(p, to); }
    }
    r.route = pts.slice(1);
    this.leg(r, pts[0]!, now);
    return true;
  }
  /**
   * The way from a to b that walks through nobody: straight if it can, else along one lane (a depth clear of the props
   * and, at the moment the walker would be there, of every other pet), in front of or behind whatever is in the way.
   * Null when no lane is clear of the pets. Before this only pets standing still were avoided, and two pets walking
   * at the same depth went straight through each other (operator, 2026-09-27: "the pets are still walking over each
   * other weird").
   */
  private path(r: Resident, a: { x: number; y: number }, b: { x: number; y: number }, now: number): { x: number; y: number }[] | null {
    const lo = Math.min(a.x, b.x); const hi = Math.max(a.x, b.x);
    const pace = walkSpeed((a.y + b.y) / 2) * 0.92;
    const walks = this.walksNear(r, a, lo, hi, now);
    const ok = (pts: { x: number; y: number }[]) => clearOfProps(a, pts) && !clash(a, pts, now, pace, walks);
    if (ok([b])) return [b];
    const mid = (a.y + b.y) / 2; const dir = b.x >= a.x ? 1 : -1;
    for (let d = 0; d <= LANE_FRONT - LANE_BACK; d += 12) {
      for (const y of d ? [mid + d, mid - d] : [mid]) {
        if (y < LANE_BACK || y > LANE_FRONT) continue;
        for (const frac of [3, 6, 20]) {
          const step = Math.min(70, Math.abs(b.x - a.x) / frac);
          const pts = [{ x: a.x + dir * step, y }, { x: b.x - dir * step, y }, b];
          if (ok(pts)) return pts;
        }
      }
    }
    return null;
  }
  /**
   * The other pets on the street anywhere near a walk from lo to hi, as their walks packed into numbers (x0, y0, x1, y1,
   * t0, t1, acting-until; one standing still is a walk that goes nowhere). Ghosts float through everyone and are left
   * out; so is anyone already beside the walker as it sets off (it is walking away from them, not through them).
   */
  private walksNear(r: Resident, from: { x: number; y: number }, lo: number, hi: number, now: number): Float64Array {
    const out: number[] = [];
    for (const o of this.residents.values()) {
      if (o === r || o.inside || (o.view && !o.view.alive)) continue;
      const p = this.pos(o, now); const x1 = o.trip ? o.trip.x1 : o.x;
      if (Math.max(p.x, x1) < lo - 200 || Math.min(p.x, x1) > hi + 200) continue;
      if (Math.abs(p.x - from.x) < 90 && Math.abs(p.y - from.y) < 45) continue;
      const t = o.trip;
      if (t) out.push(t.x0, t.y0, t.x1, t.y1, t.t0, t.t1, o.stage ?? 0);
      else out.push(o.x, o.y, o.x, o.y, 0, 1, o.stage ?? 0);
    }
    return Float64Array.from(out);
  }
  /**
   * A pet about to do something on the street (a meal, a bath, a game, a stunt: its props take the stretch round it)
   * gets its room: anyone standing in the way steps aside first, and nobody walks through it while it is at it.
   */
  makeRoom(r: Resident, now = Date.now()) {
    r.stage = now + 15_000;
    const p = this.pos(r, now);
    for (const o of this.residents.values()) {
      if (o === r || o.inside || o.goingIn || o.departing || o.trip || !o.view?.alive || o.view.asleep || o.actor?.busy()) continue;
      if (Math.abs(o.x - p.x) > 170 || Math.abs(o.y - p.y) > 60) continue;
      this.send(o, this.spot(o, o.zone), now);
      o.nextAt = this.walkEnds(o, now) + this.pause();
    }
  }
  /** The action is over (it may have walked the pet across its room, into someone): it steps to clear ground if need be. */
  settle(r: Resident) {
    r.stage = 0;
    if (r.inside || r.trip || r.goingIn || r.departing || r.view?.asleep) return;
    if (blockedAt(r.x, r.y) || this.room(r, r) < 0.8) {
      this.send(r, this.spot(r, r.zone));
      r.nextAt = this.walkEnds(r, Date.now()) + this.pause();
    }
  }
  /** when the walk it has just been sent on ends (now if it did not have to move) */
  private walkEnds(r: Resident, now: number) { const t = r.trip as Trip | null; return t ? t.t1 : now; }
  private leg(r: Resident, to: { x: number; y: number }, now: number) {
    const p = this.pos(r, now);
    const float = !!r.view && !r.view.alive;
    const dist = Math.hypot(to.x - p.x, to.y - p.y);
    if (dist < 8) return;
    const pace = float ? 42 : walkSpeed((p.y + to.y) / 2) * 0.92;
    r.trip = { x0: p.x, y0: p.y, x1: clamp(to.x, 40, TOWN.w - 40), y1: clamp(to.y, LANE_BACK, LANE_FRONT), t0: now, t1: now + (dist / pace) * 1000, float };
    r.x = r.trip.x1; r.y = r.trip.y1;
    if (Math.abs(to.x - p.x) > 4) r.dir = to.x > p.x ? 1 : -1;
    r.actor?.go(r.trip);
  }
  /** A leg of a route is done: straight on to the next point (the actor calls this the moment it arrives). */
  nextLeg(r: Resident): boolean {
    const next = r.route.shift(); if (!next) return false;
    r.trip = null; this.leg(r, next, Date.now()); return true;
  }
  /** Stop a trip where it has got to (an event interrupts it). */
  halt(r: Resident, now = Date.now()) {
    r.route = [];
    if (!r.trip) return;
    const p = this.pos(r, now); r.trip = null; r.x = p.x; r.y = p.y;
  }
  /** The actor moved the pet itself (a performance walked it to the bowl): the sim follows. */
  shift(r: Resident, dx: number) { r.x = clamp(r.x + dx, 40, TOWN.w - 40); }

  private tick() {
    const now = Date.now();
    // while the street is being scrolled, nobody sets off anywhere new (walks under way carry on): a walk starting is
    // twenty parts starting to move, and it can wait the second or two until the street is still
    if (isHushed()) return;
    this.ticks++;
    this.balance(now);
    // a few new walks a tick at most: after a scroll (which holds every new walk) the whole street would otherwise plan
    // its routes in one go, a long task on a phone the moment the finger lifts; the rest simply set off 0.4 s later
    let plans = 2;
    for (const r of this.residents.values()) {
      if (r.inside) continue;
      if (r.trip && now >= r.trip.t1) {
        r.trip = null;
        const next = r.route.shift();
        if (next) { this.leg(r, next, now); continue; }   // round the obstacle: on to the next point without a pause
        if (r.departing) { void this.gone(r); continue; }
        if (r.goingIn) { void this.arrive(r); continue; }
        if (r.nextAt < now) r.nextAt = now + this.pause();
      }
      if (r.pending.length) r.pending = r.pending.filter((p) => now - p.at < 60_000);
      if (!r.trip && !r.goingIn && blockedAt(r.x, r.y) && !r.actor?.busy()) { this.send(r, this.spot(r, r.zone), now); continue; }   // never left standing in a prop
      if (r.departing) { if (!r.trip) void this.gone(r); continue; }
      // standing on top of someone (a crowded load, a neighbour's action that walked into it): off it goes, soon
      // (once in 20 s at most: on a street with no clear ground left it would otherwise shuffle about for ever)
      if (!r.trip && !r.goingIn && now < r.nextAt - 2500 && (this.ticks + r.id) % 5 === 0 && now - (r.nudgedAt ?? 0) > 20_000 && r.view?.alive && !r.view.asleep && !r.actor?.busy() && this.room(r, r) < 0.7) { r.nudgedAt = now; r.nextAt = now + rand(300, 2500); }
      if (r.goingIn || r.trip || now < r.nextAt) continue;
      if (r.actor?.busy()) { r.nextAt = now + 1500; continue; }
      if (plans-- <= 0) continue;
      this.decide(r, now);
    }
  }

  /** The pause is over: where next? */
  private decide(r: Resident, now: number) {
    const v = r.view;
    const home = homeZone(r);
    const asleep = !!v?.asleep && !!v?.alive;
    // a sleeper gets to the inn and stays put; a ghost drifts about the graveyard
    if (asleep && r.x >= LANDMARK[r.zone].stand[0] - 40 && r.x <= LANDMARK[r.zone].stand[1] + 40) { r.nextAt = now + 60_000; return; }
    let z: ZoneId;
    if (home) z = home === 'graveyard' ? home : this.roomy(r, home);   // ghosts always haunt the graveyard
    else if (Math.random() < 0.72 && r.zone) z = r.zone;       // mostly pottering about where it already is
    else z = this.roomy(r, Math.random() < 0.7 ? this.nearby(r) : pickWander());   // next door, now and then across town
    // a stroll within the zone is short; a change of zone is a walk down the street (spot() may settle on a
    // neighbouring zone when this one has no clear ground, and says so in r.zone)
    const was = r.zone;
    let to: { x: number; y: number };
    if (z === was && !asleep) {
      const L = LANDMARK[z];
      const reach = rand(60, 240);
      to = { x: clamp(r.x + (Math.random() < 0.5 ? -1 : 1) * reach, L.stand[0], L.stand[1]), y: clamp(r.y + rand(-60, 60), LANE_BACK, LANE_FRONT) };
      if (this.crowded(r, to) || blockedAt(to.x, to.y)) to = this.spot(r, z);
    } else { r.zone = z; to = this.spot(r, z); }
    // every way there goes through someone right now: wait for a gap and think again
    if (!this.send(r, to, now, true)) { r.zone = was; r.nextAt = now + rand(1500, 4000); return; }
    r.nextAt = (r.trip ? r.trip.t1 : now) + this.pause();
  }
  /** a zone a short walk away (its neighbours on the street) */
  private nearby(r: Resident): ZoneId {
    const near = LANDMARKS.filter((l) => l.id !== 'graveyard' && Math.abs((l.stand[0] + l.stand[1]) / 2 - r.x) < 1300);
    return (near[Math.floor(Math.random() * near.length)] ?? LANDMARK.hall).id;
  }
  private crowded(r: Resident, c: { x: number; y: number }) { return this.room(r, c) < 1; }


  /** New state from the chain (after an event, or the periodic refresh): its zone may change. */
  update(key: string, view: CatView, worn: number[]) {
    const r = this.residents.get(key); if (!r) return;
    const was = r.view; r.view = view; r.worn = worn;
    r.actor?.dress();
    const moved = !was || was.alive !== view.alive || was.asleep !== view.asleep || was.crowned !== view.crowned || was.mood !== view.mood;
    if (moved) { const h = homeZone(r); if (h && h !== r.zone && !r.trip) r.nextAt = Math.min(r.nextAt, Date.now() + rand(2500, 6000)); }
    this.changed();
  }

  /**
   * A pet whose owner is in the town square (social/): it comes to town while they are here. Already a resident, it
   * just stays out on the street; otherwise it moves in as a visitor (walking in through the gate, or placed in its
   * zone when the page has only just opened).
   */
  visit(col: Collection, id: number, arriving: boolean): Resident {
    const key = keyOf(col, id);
    let r = this.residents.get(key);
    // already fading out at the gate: start it again from scratch (its drawing is faded to nothing)
    if (r && this.fading.has(key)) { this.residents.delete(key); this.fading.delete(key); r = undefined; }
    if (r?.departing) { r.departing = false; this.halt(r); r.nextAt = Date.now() + 800; }
    if (!r) { r = this.add(col, id, { view: null, worn: [], last: null }, arriving); r.visitor = true; }
    this.guests.add(key);
    if (r.inside) this.exit(r);
    else if (r.goingIn) { r.goingIn = null; this.halt(r); }
    return r;
  }
  /** Their owner has left the square: a visitor walks out through the gate; a resident just carries on its day. */
  /**
   * A fight at the bar (Fight Club, sandbox): up to `n` of the pets out on the street nearest to `at` walk over and stand
   * about it to watch, until `until` (ms), then go on with their day. Never the one being looked at or followed, never a
   * sleeper, a ghost or a pet mid-action; nobody is taken out of a building for it. Returns how many came.
   */
  gather(at: { x: number; y: number }, n: number, until: number): number {
    const now = Date.now();
    const cands = [...this.residents.values()]
      .filter((r) => !r.inside && !r.goingIn && !r.departing && r.view?.alive && !r.view.asleep && !r.actor?.busy() && !this.pinned.has(r.key))
      .map((r) => ({ r, d: Math.abs(this.pos(r, now).x - at.x) }))
      .filter((c) => c.d < 1800)
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
    let came = 0;
    cands.forEach(({ r }, i) => {
      const side = i % 2 ? 1 : -1; const k = Math.floor(i / 2);
      const to = { x: clamp(at.x + side * (60 + k * 64 + rand(-12, 12)), 40, TOWN.w - 40), y: clamp(at.y + rand(-6, 70), LANE_BACK, LANE_FRONT) };
      if (blockedAt(to.x, to.y)) return;
      this.halt(r, now);
      if (this.send(r, to, now)) { r.zone = 'arena'; r.nextAt = until + rand(0, 5000); came++; }
    });
    if (came) this.changed();
    return came;
  }
  depart(key: string) {
    this.guests.delete(key);
    const r = this.residents.get(key);
    if (!r || !r.visitor || this.mine.has(key) || this.pinned.has(key)) return;
    if (r.inside) { this.residents.delete(key); this.changed(); return; }
    r.departing = true; r.goingIn = null;
    this.send(r, { x: GATE_X + rand(-10, 10), y: LANE_BACK + rand(2, 12) });
    if (!r.trip) void this.gone(r);
  }
  private async gone(r: Resident) {
    if (!r.departing || !this.residents.has(r.key) || this.fading.has(r.key)) return;
    this.fading.add(r.key);
    try { if (r.actor) await r.actor.enter().catch(() => {}); }
    finally { if (this.residents.get(r.key) === r) this.fading.delete(r.key); }
    // the same pet may have come back as a new visitor meanwhile: only this one leaves
    if (r.departing && this.residents.get(r.key) === r) { this.residents.delete(r.key); this.changed(); }
    else r.actor?.reappear();   // it is staying after all: shown again
  }

  /** A live event about this resident: perform it now if it is on screen, or keep it for the camera. */
  deliver(r: Resident, e: LiveEvent) {
    if (r.inside) this.exit(r);            // something happened to it: out it comes to show us
    else if (r.goingIn) { r.goingIn = null; this.halt(r); }
    if (r.actor) r.actor.perform(e);
    else { r.pending.push({ e, at: Date.now() }); if (r.pending.length > 3) r.pending.shift(); }
  }
}

const inside = (x: number, y: number, o: Obstacle) => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1;
/**
 * Would a walk along these points go through another pet: at the same moment, at about the same depth, closer than a
 * pet's width (a pet mid-action keeps a wider berth)? `walks` is walksNear()'s packing.
 */
function clash(from: { x: number; y: number }, pts: { x: number; y: number }[], now: number, pace: number, walks: Float64Array): boolean {
  if (!walks.length) return false;
  let px = from.x; let py = from.y; let t = now;
  for (const q of pts) {
    const len = Math.hypot(q.x - px, q.y - py); const n = Math.max(1, Math.ceil(len / 24));
    for (let i = 1; i <= n; i++) {
      const u = i / n; const x = px + (q.x - px) * u; const y = py + (q.y - py) * u;
      const when = t + ((len * u) / pace) * 1000;
      for (let k = 0; k < walks.length; k += 7) {
        const t0 = walks[k + 4]!; const t1 = walks[k + 5]!;
        const v = when <= t0 ? 0 : when >= t1 ? 1 : (when - t0) / (t1 - t0);
        const ox = walks[k]! + (walks[k + 2]! - walks[k]!) * v; const oy = walks[k + 1]! + (walks[k + 3]! - walks[k + 1]!) * v;
        const acting = walks[k + 6]! > when;
        if (Math.abs(ox - x) < (acting ? 150 : 80) && Math.abs(oy - y) < (acting ? 60 : 38)) return true;
      }
    }
    t += (len / pace) * 1000; px = q.x; py = q.y;
  }
  return false;
}
/** a polyline from a through pts that stays out of every prop's footprint */
function clearOfProps(a: { x: number; y: number }, pts: { x: number; y: number }[]): boolean {
  let prev = a;
  for (const q of pts) { if (segmentHits(prev, q, OBSTACLES)) return false; prev = q; }
  return true;
}
/** the way round the props alone (when no way is clear of the pets too and the walk cannot wait) */
function propsPath(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  if (clearOfProps(a, [b])) return [b];
  const lo = Math.min(a.x, b.x); const hi = Math.max(a.x, b.x);
  const props = OBSTACLES.filter((o) => o.x1 > lo && o.x0 < hi);
  const mid = (a.y + b.y) / 2; const dir = b.x >= a.x ? 1 : -1;
  for (let d = 0; d <= LANE_FRONT - LANE_BACK; d += 8) {
    for (const y of [mid + d, mid - d]) {
      if (y < LANE_BACK || y > LANE_FRONT || props.some((o) => y > o.y0 - 10 && y < o.y1 + 10)) continue;
      for (const frac of [3, 6, 20]) {
        const step = Math.min(70, Math.abs(b.x - a.x) / frac);
        const pts = [{ x: a.x + dir * step, y }, { x: b.x - dir * step, y }, b];
        if (clearOfProps(a, pts)) return pts;
      }
    }
  }
  return [b];
}
/** a spot in a prop's footprint */
export const blockedAt = (x: number, y: number) => OBSTACLES.some((o) => inside(x, y, o));
/** does the straight walk from a to b pass through any of these (sampled every 20 units) */
function segmentHits(a: { x: number; y: number }, b: { x: number; y: number }, blocks: Obstacle[]): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
  for (let i = 1; i < n; i++) { const t = i / n; const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t; if (blocks.some((o) => inside(x, y, o))) return true; }
  return false;
}
