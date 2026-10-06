/**
 * Demo game rules. No chain yet: every action "costs 1 MON" and the burn is a
 * mocked EMO amount so the flow reads the way it will on Monad.
 */
export type Stats = { food: number; clean: number; fun: number; energy: number };
/** Lifetime record. On chain these are packed counters that stay with the token forever. */
export type Record_ = { feeds: number; washes: number; plays: number; naps: number; cleanups: number; pets: number; names: number; deaths: number; revives: number; screenshots: number; slaps: number; squeezes: number; burns: number; tungs: number; bounces?: number };
/** inversebrah's four stunts, Sahur's one and Thiccums' one: gas only, counted for life, touching no meter. */
export type Stunt = 'screenshot' | 'slap' | 'squeeze' | 'burn' | 'tung' | 'bounce';
export const STUNTS: Stunt[] = ['screenshot', 'slap', 'squeeze', 'burn', 'tung', ...(__THICCUMS__ ? ['bounce' as const] : [])];
export type Game = {
  stats: Stats;
  record: Record_;
  alive: boolean;
  /** Game seconds a stat has sat at zero; death at DEATH_AFTER. */
  zeroFor: number;
  diedOnDay: number | null;
  lastPetDay: number | null;
  sleeping: boolean;
  poop: boolean;
  /** Game-time (seconds) at which the next poop is due, or null. */
  poopDue: number | null;
  /** Game-time in seconds (advances with `speed`). */
  t: number;
  speed: number;
  spentMon: number;
  burnedEmo: number;
  actions: number;
  log: string[];
};
export type PaidAction = 'feed' | 'wash' | 'play' | 'sleep' | 'clean' | 'name' | 'revive';
export type Event =
  | { type: 'tick'; dt: number }
  | { type: 'pay'; action: PaidAction }
  | { type: 'fed' } | { type: 'washed' } | { type: 'played' } | { type: 'slept'; on: boolean } | { type: 'cleaned' }
  | { type: 'pooped' } | { type: 'petted' }
  | { type: 'revived' } | { type: 'kill' } | { type: 'named' } | { type: 'stunt'; kind: Stunt }
  | { type: 'speed'; speed: number }
  | { type: 'set'; stats: Partial<Stats> }
  | { type: 'reset' };

/**
 * Time. Rules are written in real hours; the demo runs them on a fast clock.
 * TIME_SCALE game-seconds pass per real second (180 = a game day every 8 real minutes, so a fed cat
 * is hungry after ~5 minutes and dead 16 minutes after its last meal). On chain a day is a day.
 */
export const TIME_SCALE = 180;
export const HOUR = 3600; export const DAY = 24 * HOUR;
/** Hours for a full meter to drain to zero (awake). Every care fills its meter, so each one is due once every 24 h from the last time it was done. */
export const DRAIN_H = { food: 24, clean: 24, fun: 24, energy: 24 } as const;
/** Asleep: energy refills in 8 h; the other meters drain at their normal rate, as on chain. */
export const SLEEP_REFILL_H = 8; export const SLEEP_DRAIN = 1;
/** Hours after a meal until it needs the litter tray. */
export const POOP_AFTER_H = 4;
/** A poop on the floor drains cleanliness this much faster. */
export const POOP_DIRT = 2.5;
/** Petting is gas-only; the first pet each day gives this much fun. */
export const PET_FUN = 5;
export const MON_PER_ACTION = 1;
export const MON_TO_NAME = 10;
export const MON_TO_REVIVE = 1000;
/** Seconds (game time) a meter may sit at zero before the pet dies: one day. */
export const DEATH_AFTER = 24 * HOUR;
export const costOf = (a: PaidAction) => (a === 'name' ? MON_TO_NAME : a === 'revive' ? MON_TO_REVIVE : MON_PER_ACTION);
export const dayOf = (t: number) => Math.floor(t / DAY) + 1;
/** Game clock as HH:MM within the current day. */
export const clockOf = (t: number) => { const s = t % DAY; const h = Math.floor(s / HOUR); const m = Math.floor((s % HOUR) / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
/** Mock rate; the real thing buys EMO through nad.fun at the market price. */
const EMO_PER_MON = 38_000;
/** Share of every payment that buys and burns EMO (decided 2026-09-12). The rest is not shown in the UI. */
export const BURN_SHARE = 0.8;
const clamp = (v: number) => Math.min(100, Math.max(0, v));

export const initial = (): Game => ({
  stats: { food: 72, clean: 80, fun: 64, energy: 85 }, record: { feeds: 0, washes: 0, plays: 0, naps: 0, cleanups: 0, pets: 0, names: 0, deaths: 0, revives: 0, screenshots: 0, slaps: 0, squeezes: 0, burns: 0, tungs: 0 }, alive: true, zeroFor: 0, diedOnDay: null, lastPetDay: null, sleeping: false, poop: false, poopDue: null, t: 0, speed: 1,
  spentMon: 0, burnedEmo: 0, actions: 0, log: [],
});

export function reduce(g: Game, e: Event): Game {
  switch (e.type) {
    case 'tick': {
      const dt = e.dt * g.speed * TIME_SCALE;               // game seconds
      if (!g.alive) return { ...g, t: g.t + dt };
      const h = dt / HOUR;
      const s = { ...g.stats };
      const drain = (k: keyof typeof DRAIN_H, mult = 1) => clamp(s[k] - (100 / DRAIN_H[k]) * h * mult);
      if (g.sleeping) {
        s.energy = clamp(s.energy + (100 / SLEEP_REFILL_H) * h);
        s.food = drain('food', SLEEP_DRAIN); s.fun = drain('fun', SLEEP_DRAIN); s.clean = drain('clean', g.poop ? POOP_DIRT * SLEEP_DRAIN : SLEEP_DRAIN);
      } else {
        s.food = drain('food'); s.fun = drain('fun'); s.clean = drain('clean', g.poop ? POOP_DIRT : 1); s.energy = drain('energy');
      }
      const starving = s.food <= 0;                          // only hunger kills; grubby or bored just makes it sad
      const zeroFor = starving ? g.zeroFor + dt : 0;
      const dies = zeroFor >= DEATH_AFTER;
      return { ...g, stats: s, t: g.t + dt, zeroFor, alive: !dies, diedOnDay: dies ? dayOf(g.t) : g.diedOnDay, sleeping: dies ? false : g.sleeping, record: dies ? { ...g.record, deaths: g.record.deaths + 1 } : g.record };
    }
    case 'pay': {
      const mon = costOf(e.action);
      const emo = Math.round(EMO_PER_MON * mon * BURN_SHARE * (0.96 + Math.random() * 0.08));
      const line = `${label(e.action)} · ${mon} MON → bought & burned ${emo.toLocaleString()} EMO`;
      return { ...g, spentMon: g.spentMon + mon, burnedEmo: g.burnedEmo + emo, actions: g.actions + 1, log: [line, ...g.log].slice(0, 6) };
    }
    // a feed fills the bowl: the 48 h clock restarts
    case 'fed': return { ...g, record: { ...g.record, feeds: g.record.feeds + 1 }, stats: { ...g.stats, food: 100 }, poopDue: g.poop ? g.poopDue : g.t + POOP_AFTER_H * HOUR * (0.8 + Math.random() * 0.4) };
    case 'washed': return { ...g, record: { ...g.record, washes: g.record.washes + 1 }, stats: { ...g.stats, clean: 100 } };
    case 'played': return { ...g, record: { ...g.record, plays: g.record.plays + 1 }, stats: { ...g.stats, fun: 100 } };
    case 'slept': return { ...g, sleeping: e.on, record: e.on ? { ...g.record, naps: g.record.naps + 1 } : g.record };
    case 'cleaned': return { ...g, poop: false, record: { ...g.record, cleanups: g.record.cleanups + 1 }, stats: { ...g.stats, clean: clamp(g.stats.clean + 10) } };
    case 'pooped': return { ...g, poop: true, poopDue: null };
    case 'petted': {
      const day = dayOf(g.t);
      if (!g.alive) return g;
      const rec = { ...g.record, pets: g.record.pets + 1 };
      if (g.lastPetDay === day) return { ...g, record: rec };
      return { ...g, record: rec, lastPetDay: day, stats: { ...g.stats, fun: clamp(g.stats.fun + PET_FUN) }, log: [`Pet · gas only → +${PET_FUN} fun`, ...g.log].slice(0, 6) };
    }
    case 'revived': if (g.alive) return g; return { ...g, record: { ...g.record, revives: g.record.revives + 1 }, alive: true, zeroFor: 0, diedOnDay: null, poop: false, poopDue: null, stats: { food: 60, clean: 60, fun: 60, energy: 60 } };
    case 'kill': if (!g.alive) return g; return { ...g, record: { ...g.record, deaths: g.record.deaths + 1 }, alive: false, diedOnDay: dayOf(g.t), sleeping: false, zeroFor: DEATH_AFTER };
    case 'named': return { ...g, record: { ...g.record, names: g.record.names + 1 } };
    case 'stunt': { const k = ({ screenshot: 'screenshots', slap: 'slaps', squeeze: 'squeezes', burn: 'burns', tung: 'tungs', ...(__THICCUMS__ ? { bounce: 'bounces' } : {}) } as Record<Stunt, keyof Record_>)[e.kind]; return { ...g, record: { ...g.record, [k]: (g.record[k] ?? 0) + 1 } }; }
    case 'speed': return { ...g, speed: e.speed };
    case 'set': return { ...g, stats: { ...g.stats, ...e.stats } };
    case 'reset': return initial();
  }
}

export const label = (a: PaidAction | 'pet' | 'wake') => ({ feed: 'Feed', wash: 'Wash', play: 'Play', sleep: 'Sleep', clean: 'Clean up', name: 'Name', revive: 'Revive', pet: 'Pet', wake: 'Wake' })[a];

/** Which need is most pressing, for the thought bubble. */
export function need(g: Game): 'food' | 'clean' | 'fun' | 'energy' | 'poop' | null {
  if (g.sleeping || !g.alive) return null;
  if (g.poop && g.stats.clean < 70) return 'poop';
  const entries: [keyof Stats, number][] = [['food', g.stats.food], ['clean', g.stats.clean], ['fun', g.stats.fun], ['energy', g.stats.energy]];
  entries.sort((a, b) => a[1] - b[1]);
  const [k, v] = entries[0]!;
  return v < 35 ? k : null;
}
export const isSad = (g: Game) => g.alive && !g.sleeping && (g.stats.food < 20 || g.stats.fun < 20 || g.stats.clean < 20);
export const isDirty = (g: Game) => g.alive && g.stats.clean < 40;
