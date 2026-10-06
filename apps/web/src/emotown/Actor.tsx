/**
 * One pet on the street: the real rig, driven by the real director, in a "pocket room".
 *
 * A pocket room is the room from scene/Stage.tsx with nothing drawn in it: the same 600x460 box, the same back and
 * front prop layers and the same cat host, scaled down onto the pavement so the room's floor is the pet's feet. The
 * director runs in it untouched, so every action the site already has (the bowl dropping in, the tub, the yarn, the
 * frok's camera, tung tung tung) plays on the street exactly as it plays in the pet's own room. The town moves the
 * whole pocket when the pet strolls (Trip); the director moves the pet inside it during an action, and afterwards
 * `recenter()` hands that offset back to the town so the pet never jumps.
 */
import { memo, useEffect, useRef, useState } from 'react';
import type { Costume, Dir, PetRig } from '../pet/Pet';
import { TownPet, TOWN_LITE } from './TownPet';
import { isHushed } from '../pet/rig';
import { Director } from '../scene/director';
import { CAT_PAD, petBox } from '../scene/world';
import { accessoriesOf, costumeOf, costumesOf, hairOf, petMoveOf, toyOf } from '../items';
import { PETS, fallbackName } from '../pets';
import { ROOM, depthZ, pocketScale, tieOf } from './layout';
import type { ActorHandle, Resident, TownSim, Trip } from './sim';
import type { LiveEvent } from './data';
import { banner, confetti, glow, hearts, sparkles } from './fx';
import { animationsOf } from './anims';
import { lookOf, wear } from '../fight/wear';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** the pocket's transform for feet at (x, y) on the street */
/** Where a pet's box goes for its feet to be at (x, y); `k` shrinks it toward its feet (going in at a door). */
const at = (x: number, y: number, k = 1) => { const s = pocketScale(y) * k; return `translate(${(x - (ROOM.w / 2) * s).toFixed(2)}px, ${(y - ROOM.floor * s).toFixed(2)}px) scale(${s.toFixed(4)})`; };
/** the walk's cadence at the town's pace (sim.send walks at 0.92 of the room's speed) */
const CADENCE = 380 / 0.92;

/**
 * What a street full of pets does by itself, and so is never heard in town: their footsteps, and the sleepers' snores,
 * the hungry ones' tummies, the yawns and the settling down and waking up as they come and go. With sixty pets out that
 * was one rattle after another (the operator: "the prr or whatever that is in town is too much i just keep hearing that").
 */
const TOWN_SILENT = new Set(['step', 'hop', 'snore', 'tummy', 'voice.yawn', 'sleep', 'wake']);

type Props = { r: Resident; sim: TownSim; selected: boolean; mine: boolean };

export const Actor = memo(function Actor({ r, sim, selected, mine }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [rig, setRig] = useState<PetRig | null>(null);
  const B = petBox(r.character);
  const name = r.view?.name || fallbackName(r.col, r.id);

  useEffect(() => {
    const el = outer.current;
    if (!rig || !el || !room.current || !back.current || !front.current || !host.current) return;
    const d = new Director(rig, { back: back.current, front: front.current, cat: host.current });
    d.wanderEnabled = false;
    // sound: a pet is heard only while it is on screen, to the left or right as it stands, quieter toward the edges. What
    // pets do by themselves all day is not heard at all (TOWN_SILENT): only what somebody did to one is
    d.soundAt = (name) => {
      if (mode !== 'awake' || TOWN_SILENT.has(name)) return null;
      const b = el.getBoundingClientRect(); const mid = (b.left + b.width / 2) / Math.max(1, window.innerWidth);
      if (mid < -0.1 || mid > 1.1) return null;
      const pan = Math.max(-0.8, Math.min(0.8, (mid - 0.5) * 1.8));
      return { v: 0.85 - 0.35 * Math.abs(pan), pan };
    };
    let dead = false;
    let move: Animation | null = null; let walking: { stop: () => Promise<void> } | null = null; let zTimer: ReturnType<typeof setTimeout> | null = null;
    let busy = false; let queue: Promise<void> = Promise.resolve();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let awake = true;
    let mode: 'awake' | 'paused' | 'hidden' = 'awake';
    const S = () => pocketScale(sim.pos(r).y);

    const tie = tieOf(r.key);
    const put = (x: number, y: number) => { el.style.transform = at(x, y); el.style.zIndex = String(depthZ(y, tie)); };
    let walkDir: Dir | 0 = 0;
    /** stop sliding; and stop the stride too, unless the next leg carries straight on the same way */
    const stopMove = (keepWalk = false) => {
      if (zTimer) { clearInterval(zTimer); zTimer = null; }
      if (move) { move.cancel(); move = null; }
      if (!keepWalk && walking) { const w = walking; walking = null; walkDir = 0; void w.stop(); rig.busy = false; }
    };
    const faceDir = (dir: Dir) => { rig.facing(dir); };

    // ---- looks: everything it wears and how it feels, from its on-chain state ----
    const dress = () => {
      const v = r.view; if (!v || dead) return;
      d.setCrown(v.crowned);
      d.setCostumes(costumesOf(r.worn, r.character));   // its outfit and the pack's accessories
      d.setHair(hairOf(r.worn, r.character));
      d.setToy(toyOf(r.worn)); d.setPetMove(petMoveOf(r.worn));   // the dreidel on Play, kapparot when it is petted
      wear(rig, r.character, lookOf(r), !!v.alive);   // Fight Club's belt or black eye, the day after a fight
      el.classList.toggle('is-ghost', !v.alive);
      if (!v.alive) { if (!rig.isGhost) { rig.setGhost(true); rig.face('x', 'frown', 0); } return; }
      if (rig.isGhost) rig.setGhost(false);
      d.setDirty(v.mood === 'grubby' || v.poop);
      d.setSad(v.mood === 'sad');
      const sleeping = d.getState().sleeping;
      if (v.asleep && !sleeping && !r.trip) void d.sleep();
      if (!v.asleep && sleeping) void d.wake();
      mood();
    };
    /** the held face of its mood (released by any action, put back after) */
    const mood = () => {
      const v = r.view; if (!v || !v.alive || v.asleep || busy || rig.busy) return;
      if (v.mood === 'hungry') rig.face('open', 'frown', 200);
      else if (v.mood === 'happy') rig.face('happy', 'smile', 200);
      else if (v.mood === 'sleepy') rig.face('closed', 'open', 200);
      else if (v.mood === 'grubby' || v.mood === 'bored') rig.face('open', 'idle', 200);
      else rig.restFace(200);
    };

    // ---- strolling ----
    const go = (t: Trip) => {
      const now = Date.now(); const left = t.t1 - now;
      const u = Math.max(0, Math.min(1, (now - t.t0) / Math.max(1, t.t1 - t.t0)));
      const x0 = t.x0 + (t.x1 - t.x0) * u; const y0 = t.y0 + (t.y1 - t.y0) * u;
      const dir: Dir = t.x1 >= x0 ? 1 : -1;
      const keep = !!walking && walkDir === dir && !t.float && mode === 'awake';
      stopMove(keep);
      // off screen it does not walk (twenty animated parts nobody can see): it waits where the sim has it, and walks
      // on from there the moment it comes back into view (setMode 'awake')
      if (mode !== 'awake') { const p = sim.pos(r); put(p.x, p.y); return; }
      if (left <= 30) { put(t.x1, t.y1); return; }
      if (d.getState().sleeping) void d.wake();
      faceDir(dir);
      if (!t.float && !keep) { rig.busy = true; rig.releaseAll(200); walking = rig.walk(dir, CADENCE); walkDir = dir; }
      put(x0, y0);
      move = el.animate([{ transform: at(x0, y0) }, { transform: at(t.x1, t.y1) }], { duration: left, easing: t.float ? 'ease-in-out' : 'linear', fill: 'forwards' });
      // the depth order follows the pet all the way (it walks in front of or behind others as it goes)
      zTimer = setInterval(() => { el.style.zIndex = String(depthZ(sim.pos(r).y, tie)); }, 120) as unknown as ReturnType<typeof setTimeout>;
      const m = move;
      m.finished.then(() => {
        if (move !== m || dead) return;
        put(t.x1, t.y1); move = null; if (zTimer) { clearInterval(zTimer); zTimer = null; }
        if (r.route.length && sim.nextLeg(r) && move) return;   // round an obstacle: straight on, still striding
        const w = walking; walking = null; walkDir = 0; rig.busy = false;
        void (w ? w.stop() : Promise.resolve()).then(() => { if (!dead) { mood(); if (r.view?.asleep && r.view.alive && !d.getState().sleeping && !r.trip) void d.sleep(); } });
      }, () => {});
    };
    const halt = () => { if (!r.trip && !move) return; sim.halt(r); stopMove(); put(r.x, r.y); };
    /**
     * Three ways to be. Awake: on screen, everything plays. Paused: just off it, drawn but standing still (a walk is
     * stopped where the sim says it has got to and picked up again when it comes back into view; its idle
     * flourishes are one-shots that simply finish). Nothing is ever frozen with `pause()`: a paused animation still
     * counts as running to the browser and keeps its part on a compositing layer of its own. Hidden: far away,
     * display:none (safe only because TownPet's Donors keep the shared gradient and clip ids resolving to a copy that
     * is always showing); what it had running is paused there, which costs nothing out of the render tree.
     */
    /**
     * `anims` is this pet's animations (anims.ts keeps the list as they are made: asking the browser for a 500-node
     * drawing's animations cost 2-3 ms a pet, measured 2026-09-26).
     */
    const animations = () => animationsOf(el);
    const setMode = (m: 'awake' | 'paused' | 'hidden', given?: Animation[]) => {
      if (m === mode || dead) return;
      const was = mode; mode = m; awake = m === 'awake';
      const anims = given ?? animationsOf(el);
      el.style.display = m === 'hidden' ? 'none' : '';
      if (m === 'hidden') { stopMove(); for (const a of anims) if (a.playState === 'running') a.pause(); return; }
      // drawn again after being hidden: what was left paused carries on (a loop the rig was winding down, played
      // backwards to its rest, cannot be played on: let it go)
      if (was === 'hidden') for (const a of anims) if (a.playState === 'paused') { try { a.play(); } catch { a.cancel(); } }
      if (busy) return;
      if (m === 'paused') { if (move) { const p = sim.pos(r); stopMove(); put(p.x, p.y); } return; }
      if (r.trip && Date.now() < r.trip.t1) { if (!move) go(r.trip); }
      else { if (move) stopMove(); put(r.x, r.y); }
    };
    const setAwake = (on: boolean) => setMode(on ? 'awake' : 'hidden');

    // ---- live events ----
    const head = () => ({ x: d.getState().x, y: B.top + 40 * B.S });
    const perform = (e: LiveEvent) => { queue = queue.then(() => play(e)).catch(() => {}); };
    const play = async (e: LiveEvent) => {
      if (dead) return;
      reappear();   // (a pet caught on a doorstep is shown again before it does anything)
      busy = true;
      halt();
      // a meal, a bath, a game or a stunt fills the stretch round it: the neighbours step aside first
      if ((e.kind === 'care' && e.what !== 'sleep' && e.what !== 'wake' && e.what !== 'name') || e.kind === 'stunt') sim.makeRoom(r);
      const v = r.view; const L = front.current!; const h = head();
      const wake = async () => { if (d.getState().sleeping) await d.wake(); };
      try {
        if (e.kind === 'care') {
          switch (e.what) {
            case 'feed': await wake(); await d.feed(); break;
            case 'play': await wake(); await d.play(); break;
            case 'wash': await wake(); await d.wash(); break;
            case 'clean': await wake(); await d.poop(); await wait(500); await d.clean(); break;
            case 'sleep': await d.sleep(); break;
            case 'wake': await d.wake(); break;
            case 'revive': {
              glow(L, h.x, ROOM.floor + 6); sparkles(L, 12, h.x, h.y, 120);
              el.classList.remove('is-ghost');
              await wait(250); await rig.revive(); hearts(L, 4, h.x, h.y); break;
            }
            case 'name': break;   // the Named event carries the name and does the showing
          }
        } else if (e.kind === 'pet') {
          await wake(); await d.pet(Math.random() < 0.5 ? -1 : 1);
        } else if (e.kind === 'stunt') {
          await wake();
          if (e.what === 'tung') await d.tung();
          else if (__THICCUMS__ && e.what === 'bounce') await (d.own as { bounce?(): Promise<void> } | null)?.bounce?.();   // his own showcase (thiccums/ways.ts)
          else if (e.what === 'screenshot') await d.screenshot();
          // the slap's arm and the claw's pole are room-long (their far ends hide past the room's wall); on the street
          // they would reach across town, so for these two the props fade out a short way either side of the pet
          else if (e.what === 'slap' || e.what === 'squeeze') {
            room.current?.classList.add('reach');
            try { await (e.what === 'slap' ? d.slap() : d.squeeze()); } finally { room.current?.classList.remove('reach'); }
          }
          else if (e.what === 'burn') await d.burn();
        } else if (e.kind === 'named') {
          banner(L, e.name || r.view?.name || fallbackName(r.col, r.id), h.x, h.y - 70); confetti(L, 26, h.x, h.y - 20);
          if (!v?.asleep) { rig.face('happy', 'smile', 200); await rig.hop(); await wait(600); rig.restFace(); }
        } else if (e.kind === 'mint') {
          glow(L, h.x, ROOM.floor + 6, 'rgba(232, 216, 155, 0.9)'); confetti(L, 30, h.x, h.y - 30);
          rig.face('happy', 'smile', 200); await rig.hop(); await wait(500); rig.restFace();
        } else if (e.kind === 'dress') {
          sparkles(L, 8, h.x, h.y + 30, 80);
        } else if (e.kind === 'crown') {
          if (e.won) { d.setCrown(true); await wait(300); await rig.sparkleCrown(); sparkles(L, 6, h.x, h.y - 40, 50); } else d.setCrown(false);
        }
      } catch { /* an action that could not play is simply skipped */ }
      if (dead) return;
      // an action may have walked the pet across its room: hand that back to the street
      const dx = d.recenter();
      if (dx) { sim.shift(r, dx * S()); put(r.x, r.y); }
      busy = false;
      dress();
      sim.settle(r);
    };

    // ---- a little life while it stands about ----
    const idle = () => {
      idleTimer = setTimeout(async () => {
        idleTimer = null;
        const v = r.view;
        if (!dead && awake && !isHushed() && v?.alive && !v.asleep && !busy && !rig.busy && !r.trip && !d.isBusy) {
          const roll = Math.random();
          if (v.mood === 'hungry' && roll < 0.35) void d.rumble();
          else if (v.mood === 'sleepy' && roll < 0.4) void d.yawn();
          else if (v.crowned && roll < 0.3) void rig.sparkleCrown();
          else if (roll < 0.22) {
            // say hello to a neighbour standing close by, if it is free: both lean in, hearts between them
            for (const o of sim.residents.values()) {
              if (o === r || !o.actor || o.trip || Math.abs(o.x - r.x) > 150 || Math.abs(o.x - r.x) < 40 || Math.abs(o.y - r.y) > 50) continue;
              const toward: Dir = o.x > r.x ? 1 : -1;
              if (!o.actor.greet(toward === 1 ? -1 : 1)) continue;
              await greet(toward);
              break;
            }
          }
          else if (roll < 0.7) {
            // look about: at a neighbour if there is one close, else anywhere
            let nx = rand(-1, 1);
            for (const o of sim.residents.values()) { if (o !== r && Math.abs(o.x - r.x) < 260 && Math.abs(o.y - r.y) < 90) { nx = o.x > r.x ? 1 : -1; break; } }
            rig.look(nx, rand(-0.4, 0.3)); await rig.perk(); await wait(rand(900, 2200)); if (!busy && !rig.busy) rig.release('look', 420);
          }
        }
        if (!dead) idle();
      }, rand(5000, 13000));
    };

    const greet = async (toward: Dir) => {
      rig.busy = true; faceDir(toward); rig.nuzzle(toward); rig.face('happy', 'smile', 200);
      hearts(front.current!, 2, d.getState().x + toward * 60, B.top + 30 * B.S);
      await wait(1500);
      if (dead) return;
      rig.release('nuzzle', 400); rig.restFace(300); rig.busy = false; mood();
    };
    const canGreet = (toward: Dir) => {
      const v = r.view;
      if (dead || !awake || busy || rig.busy || d.isBusy || r.trip || !v?.alive || v.asleep) return false;
      void greet(toward); return true;
    };
    // Going in at a door. In Chrome the pet fades. In WebKit's layered rig a fade of the whole pet is not one fade: the
    // parts that are layers of their own (a crown, an outfit, whatever is moving) stay solid while the rest goes
    // see-through (the operator, on an iPhone: "the characters skin goes transparent sometimes"), so there it shrinks
    // into the doorway instead, which is only a transform.
    let entering = false, vanish: Animation | null = null;
    const enter = async () => {
      if (dead) return;
      entering = true; stopMove();
      const p = sim.pos(r);
      const a = TOWN_LITE
        ? el.animate([{ transform: at(p.x, p.y) }, { transform: at(p.x, p.y, 0.06) }], { duration: 300, easing: 'ease-in', fill: 'forwards' })
        : el.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(1.6)' }], { duration: 520, easing: 'ease-in', fill: 'forwards' });
      vanish = a;
      await a.finished.catch(() => {});
    };
    /** It did not go in after all (something happened to it on the doorstep): it is shown again, as it was. Without
     *  this it stayed on the street faded out for good, and busy for good. */
    const reappear = () => {
      entering = false;
      if (vanish) { try { vanish.cancel(); } catch { /* gone */ } vanish = null; if (!dead) { const p = sim.pos(r); put(p.x, p.y); } }
    };
    const handle: ActorHandle = { busy: () => busy || entering || d.isBusy, go, halt, perform, dress, setAwake, setMode, animations, mode: () => mode, isAwake: () => awake, greet: canGreet, enter, reappear };
    r.actor = handle;
    const p = sim.pos(r); put(p.x, p.y);
    // coming out of a door: faded in (Chrome), or grown from the doorway (WebKit's layered rig, where a fade is not one fade)
    if (Date.now() - r.exitedAt < 1500) {
      if (TOWN_LITE) el.animate([{ transform: at(p.x, p.y, 0.06) }, { transform: at(p.x, p.y) }], { duration: 360, easing: 'ease-out' });
      else el.animate([{ opacity: 0, transform: `${at(p.x, p.y)} translateY(-10px)` }, { opacity: 1, transform: at(p.x, p.y) }], { duration: 480, easing: 'ease-out' });
    }
    if (r.character !== 'cat') faceDir(r.dir);
    dress();
    if (r.trip) go(r.trip);
    for (const { e } of r.pending.splice(0)) perform(e);
    idle();
    sim.poke();
    return () => {
      dead = true;
      if (r.actor === handle) r.actor = null;
      if (idleTimer) clearTimeout(idleTimer);
      stopMove();
      d.destroy();
    };
  }, [rig, r, sim, B.top, B.S]);

  // the name, over its head, when hovered, selected or yours
  const tall = r.view?.crowned || costumeOf(r.worn) === 'witch' ? 34 : costumeOf(r.worn) === 'pumpkin' ? 16 : accessoriesOf(r.worn, r.character).includes('kippah') ? 8 : 0;
  return (
    <div ref={outer} className={`pocket${selected ? ' is-selected' : ''}${mine ? ' is-mine' : ''}`} data-col={r.col}>
      <div ref={room} className="pocket-room stage">
        <div className="pocket-mark" style={{ left: ROOM.w / 2, top: ROOM.floor }} />
        <div className="pocket-aura" style={{ left: ROOM.w / 2, top: B.top + B.h * 0.45 }} />
        <div ref={back} className="layer" />
        <div ref={host} className="cathost" style={{ width: B.hostW, height: B.hostH, top: B.hostTop, left: ROOM.w / 2 - B.w / 2 - CAT_PAD.side }}>
          <div className="catbody" data-key={r.key} style={{ width: B.w, height: B.h, top: CAT_PAD.top, left: CAT_PAD.side }}>
            <TownPet onRig={setRig} character={r.character} />
            <div className="pocket-tag" style={{ top: -tall }}><span className="dot" style={{ background: PETS[r.col].color }} />{name}</div>
          </div>
        </div>
        <div ref={front} className="layer" />
      </div>
    </div>
  );
});
