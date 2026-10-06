/**
 * Thiccums' own ways in the room (LAB ONLY: only the lab imports this, and the lab exists only in dev builds). The
 * director asks these first (director.ts registerOwnWays); every other action is the shared one, with `tune` giving the
 * numbers it needs for him (all measured on the rig in the lab: see the notes by each).
 *
 * He is fed like a seal: his face is up at the top of a big round body (a floor bowl would be 150 units under his chin), so
 * fish are lobbed in and he catches them in his mouth. He plays ball like one: it rolls in on his right, the side of his
 * hanging flipper (his left is his tail), he pats it, flicks it up onto his head, heads it three times and sends it off.
 */
import { Prop, type Director, type OwnWays } from '../scene/director';
import type { Dir } from '../pet/rig';
import { ASPECT } from '../scene/props';
import { WALK_MAX, WALK_MIN, WORLD } from '../scene/world';
import type { ThiccMoves } from './moves';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** The middle of his head in the drawing's own units (thiccums.py V(236, 90)): hearts and sparkles come from there. */
export const HEAD: [number, number] = [127, 64];

export type ThiccWays = OwnWays & { bounce(): Promise<void> };

export function thiccWays(d: Director): ThiccWays {
  const k = d.kit();
  const rig = d.rig;
  const own = () => rig.own as ThiccMoves;
  const at = (sx: number, sy: number) => k.at(sx, sy);
  /**
   * The top of whatever is on his head (a hat, the pumpkin, the hair, the keffiyeh, the crown), or of the head itself, on
   * screen. The head's own outline is its first path (thiccums.py): the whole #head group measures taller, because the
   * eyelids' covers inside it reach up past the head (hidden by their clips, which a box's size ignores).
   */
  const headTop = (): DOMRect | null => {
    const root = k.L.cat;
    const shown = (e: Element | null) => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0.05;
    let best: DOMRect | null = null;
    for (const sel of ['#witchhat', '#pumpkin', '#emohair', '#keffiyeh', '#kippah', '#crown', '#head > path']) {
      const e = root.querySelector(sel);
      if (!e || (sel !== '#head > path' && !shown(e))) continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0 && (!best || r.top < best.top)) best = r;
    }
    return best;
  };

  /**
   * Three fish, lobbed in from the roomier side one after another. Each time he lifts his head toward the throw with his
   * mouth open, the fish drops in nose first from above, he gulps it down with a swallow through his whole body (and the
   * butt wobbles with it); after the third he licks his lips and flaps his flippers.
   */
  async function feed() {
    const st = k.st();
    const from: Dir = st.x < WORLD.w / 2 ? 1 : -1;
    k.voice('huh');
    await rig.perk();
    rig.look(from * 0.9, -0.3);
    await wait(420);
    rig.release('look', 200);
    const FW = 62; const fh = FW * 56 / 100;
    const NOSE = { x: 0.08, y: 0.52 };
    for (let i = 0; i < 3; i++) {
      own().gape(from);
      await wait(300);
      const m = k.roomPos('mouth-open');
      const nx = from > 0 ? NOSE.x : 1 - NOSE.x;
      const fish = new Prop(k.L.front, 'sealfish', FW).place(m.x + FW / 2 - nx * FW, m.y + (1 - NOSE.y) * fh);
      fish.el.style.transformOrigin = `${nx * 100}% ${NOSE.y * 100}%`;
      if (from < 0) fish.inner.style.transform = 'scaleX(-1)';
      const sx = (from > 0 ? WORLD.w + 50 : -50) - m.x; const sy = 20 - i * 20; const peak = -(130 + i * 20);
      const N = 14; const kf: Keyframe[] = []; const head = from > 0 ? 180 : 0;
      for (let j = 0; j <= N; j++) {
        const t = j / N; const x = sx * (1 - t) * (1 - t); const y = sy * (1 - t) + 4 * peak * t * (1 - t);
        const vx = -2 * sx * (1 - t) - 0.002 * sx; const vy = -sy + 4 * peak * (1 - 2 * t);
        let rot = (Math.atan2(vy, vx) * 180) / Math.PI - head; rot = ((rot + 540) % 360) - 180;
        kf.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`, offset: t });
      }
      const last = kf[N]!.transform as string;
      k.sfx('whoosh', { dur: 0.6, v: 0.7 });
      await fish.el.animate(kf, { duration: 620 + i * 40, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
      fish.el.animate([{ transform: last, opacity: 1 }, { transform: `${last} scale(0.45)`, opacity: 1, offset: 0.6 }, { transform: `${last} scale(0.1)`, opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' }).finished.then(() => fish.el.remove(), () => fish.el.remove());
      k.sfx('gulp');
      await own().gulp();
      if (i < 2) { rig.look(from * 0.8, -0.2); await wait(260); rig.release('look', 160); }
    }
    await wait(200);
    await rig.lick();
    k.hearts(3);
    k.voice('happy'); k.sfx('flaps', { n: 4, gap: 0.23 });
    await own().flap(4);
    await wait(300);
    rig.restFace();
  }

  /**
   * Ball, like a seal. It rolls in on his right; he looks, shuffles over, pats it twice with the near flipper, scoops it up
   * with a flick of the flipper and catches it on the top of his head (on the crown, or the hat, if he wears one). Three
   * headers, each higher; the last sends it off across the room, and he flaps, very pleased.
   */
  async function play() {
    const YW = 58; const YH = YW / ASPECT.yarn; const circ = Math.PI * YW * (50 / 72);
    const REACH = 100;                                                  // the near flipper's tip comes down on the ball's top at this distance (moves.pat, measured)
    const dir: Dir = 1;                                                 // always on his right: his left is his tail
    const EDGE = YW / 2 + 12;
    if (k.st().x > WALK_MAX - REACH - 70) await k.walkTo(WALK_MAX - REACH - 70);
    let bx = clamp(k.st().x + dir * 190, WALK_MIN + REACH, WORLD.w - EDGE);
    const FLOOR_B = WORLD.floor + 8;
    const BALL_BELOW = YH * (74 - 62.4) / 74;
    const yarn = new Prop(k.L.front, 'yarn', YW).place(bx, FLOOR_B);
    for (const t of [yarn.find('#yarntail'), yarn.find('#yarntail2')]) if (t) t.style.opacity = '0';
    const ball = yarn.find('#ball');
    if (ball) { ball.style.transformBox = 'fill-box'; ball.style.transformOrigin = '50% 100%'; }
    yarn.inner.style.transformOrigin = `50% ${(36 / 74) * 100}%`;
    let rot = 0; let by = FLOOR_B;
    const spin = (deg: number) => { yarn.inner.style.transform = `rotate(${deg}deg)`; };
    const moveTo = async (nx: number, nb: number, ms: number, kf: (dx: number, dy: number, t: number) => [number, number], dr = 0, easing = 'linear') => {
      const dx = bx - nx; const dy = by - nb; const N = 16; const frames: Keyframe[] = [];
      for (let j = 0; j <= N; j++) { const t = j / N; const [x, y] = kf(dx, dy, t); frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, offset: t }); }
      yarn.place(nx, nb); bx = nx; by = nb;
      const a1 = yarn.el.animate(frames, { duration: ms, easing, fill: 'backwards' });
      const a2 = dr ? yarn.inner.animate([{ transform: `rotate(${rot}deg)` }, { transform: `rotate(${rot + dr}deg)` }], { duration: ms, easing, fill: 'forwards' }) : null;
      rot += dr;
      await Promise.all([a1.finished.catch(() => {}), a2?.finished.catch(() => {})]);
      spin(rot); a2?.cancel();
    };
    const roll = (nx: number, ms: number, easing = 'cubic-bezier(.1,.6,.3,1)') => moveTo(nx, FLOOR_B, ms, (dx, _dy, t) => [dx * (1 - t), 0], ((nx - bx) / circ) * 360, easing);
    const fly = (nx: number, nb: number, ms: number, h: number, dr = 0) => moveTo(nx, nb, ms, (dx, dy, t) => {
      const top = Math.min(dy, 0) - h;
      const s1 = Math.sqrt(Math.max(0, dy - top)); const s0 = Math.sqrt(-top);
      const tp = s1 / (s1 + s0); const a = (dy - top) / (tp * tp || 1);
      return [dx * (1 - t), tp > 0 ? top + a * (t - tp) * (t - tp) : top * (1 - t * t)];
    }, dr);
    const squash = (kk: number, side: Dir | 0 = 0) => ball?.animate([{ transform: 'scale(1,1)' }, { transform: `scale(${1 + 0.22 * kk}, ${1 - 0.2 * kk}) translateX(${side * 3 * kk}px)`, offset: 0.3, easing: 'ease-out' }, { transform: `scale(${1 - 0.04 * kk}, ${1 + 0.05 * kk})`, offset: 0.7 }, { transform: 'scale(1,1)' }], { duration: 360, easing: 'ease-in-out', composite: 'add' });
    const wobble = (side: Dir) => yarn.anim([{ transform: 'rotate(0)' }, { transform: `rotate(${side * 9}deg) translateX(${side * 3}px)`, offset: 0.35, easing: 'ease-out' }, { transform: `rotate(${-side * 4}deg)`, offset: 0.7 }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-in-out' });
    // where the ball sits on his head: the top of the head, or of whatever is on it, a little into the curve
    const perch = () => {
      const r = headTop(); const w = k.L.cat.parentElement?.getBoundingClientRect();
      if (!r || !w) return { x: k.st().x + 27 * k.S, b: k.B.top + 20 };
      const kx = w.width / WORLD.w;
      return { x: (r.left + r.width / 2 - w.left) / kx, b: (r.top - w.top) / kx + 4 + BALL_BELOW };
    };
    // ---- in it rolls, from off stage, and settles ----
    const target = bx; bx = bx + dir * 330; yarn.place(bx, FLOOR_B);
    const inRoll = roll(target, 1150, 'cubic-bezier(.2,.6,.3,1)').then(() => wobble(-dir as Dir));
    k.sfx('roll', { dur: 1.1 });
    await wait(380);
    k.voice('huh');
    await rig.perk();
    rig.look(dir * 0.9, 0.5);
    rig.tilt(dir);
    await wait(620);
    rig.release('tilt', 300);
    await inRoll;
    // ---- over to it, and two pats ----
    rig.release('look', 200);
    await k.walkTo(bx - dir * REACH, 'walk');
    rig.look(dir * 0.8, 0.8);
    await wait(200);
    for (let i = 0; i < 2; i++) {
      const p = rig.pat(dir);
      setTimeout(() => { squash(0.45, dir); wobble(dir); k.sfx('pat'); }, 380 * 0.55);
      await p;
      await wait(i === 0 ? 240 : 120);
    }
    rig.release('look', 200);
    await rig.perk();
    rig.face('open', 'smile', 160);
    // ---- a flick of the flipper and up it goes, onto his head ----
    let landed: Promise<void> = Promise.resolve();
    await own().boop(dir, () => {
      k.sfx('kick', { v: 0.7 });
      k.dust(bx, 0.8);
      own().balance();
      const p = perch();
      landed = fly(p.x, p.b, 700, 90, -dir * 300);
    });
    await landed;
    squash(0.6); k.sfx('bounce', { v: 0.6 });
    own().kick(60);
    // ---- headers: three, each higher; the last sends it away ----
    const away: Dir = k.st().x < WORLD.w / 2 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const p = perch(); const S = k.S;
      const dip = moveTo(p.x, p.b - (3 + i * 2.5) * S, 420 * 0.46, (dx, dy, t) => [dx * (1 - t), t < 0.61 ? dy + 3 * S * (t / 0.61) * (2 - t / 0.61) : (dy + 3 * S) * (1 - (t - 0.61) / 0.39)]);
      let flight: Promise<void> = Promise.resolve();
      await own().header(i, () => {
        k.sfx('bonk', { rate: 1 + i * 0.12 });
        if (i < 2) { const q = perch(); flight = fly(q.x + rand(-3, 3), q.b, 560 + i * 90, 70 + i * 40, rand(-120, 120)); }
        else {
          const farX = clamp(k.st().x + away * rand(200, 250), EDGE, WORLD.w - EDGE);
          flight = fly(farX, FLOOR_B, 900, 90, away * 540).then(async () => {
            squash(0.8, away); k.dust(bx, 0.7); k.sfx('bounce');
            const room = away > 0 ? WORLD.w - EDGE - bx : bx - EDGE;
            const on = Math.min(rand(60, 110), Math.max(0, room));
            await fly(bx + away * on * 0.5, FLOOR_B, 380, 26, away * 160);
            squash(0.5, away); k.sfx('bounce', { v: 0.6 });
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
    // ---- off it goes; very pleased with himself ----
    rig.release('balance', 300);
    rig.look(away * 0.9, 0.5);
    await wait(300);
    k.hearts(3);
    k.voice('happy'); k.sfx('flaps', { n: 4, gap: 0.23 });
    await own().flap(4);
    rig.release('look', 300);
    await wait(700);
    rig.restFace();
    void yarn.remove(420, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }]);
    await wait(220);
  }

  return {
    feed, play,
    cheer: () => { k.sfx('flaps', { n: 3, gap: 0.23 }); return own().flap(3); },
    /** The showcase: the butt bounce, with a sparkle of approval off the top of it. */
    bounce: () => k.run(async () => {
      const p = at(122, 165);
      k.voice('giggle');
      // each landing of the butt (moves.ts bounce: a beat every 240 ms, the landing 67 ms into it, the first at 120)
      for (let i = 0; i < 8; i++) k.sfx('boing', { delay: (187 + 240 * i) / 1000, rate: i % 2 ? 0.8 : 0.72, v: 0.8 });
      await own().bounce(8);
      k.voice('happy');
      k.sparkles(3, p.x - 10, p.y - 10, 50);
      k.hearts(2);
      await wait(900);
      rig.restFace();
    }),
    tune: {
      head: HEAD,
      poopX: 118,                   // (unused: poopFrom)
      poopFrom: [79, 189],          // between his cheeks: the bottom of the cleft (the near cheek's arc), as it sits while he squats
      graveX: 132,                  // he is wide: the grave stands clear of him either side
      dreidel: { w: 150, reach: 100, dir: 1 },      // on his right, the knob under the near flipper's tip (measured)
      darbuka: { w: 44, reach: 104, dir: 1 },       // on his right, its head under the near flipper's tip (measured)
      kapparot: { top: 198, cx: 28, rx: 78 },       // round his head, which is up to the right of his middle
      falcon: { at: [128, 60], reach: 150, from: 1 },   // it lands on his head (he has no free arm to hold out)
    },
  };
}
