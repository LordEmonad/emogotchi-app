/**
 * Emotown's geometry, in town units. The town is one street, TOWN.w long and TOWN.h tall; the page scales it so its
 * height fits the screen (clamped, see `townScale`) and the camera slides along x. Buildings stand on BASE; the pets
 * walk the pavement in front of them, their feet anywhere between LANE_BACK and LANE_FRONT, smaller further back.
 */
import type { Character } from '../pet/Pet';

export const TOWN = { w: 6700, h: 1000 } as const;   // 6000 before Fight Club's arena (sandbox) took the far end
/** where the facades meet the pavement */
export const BASE = 706;
/** the band the pets' feet walk in: back (small, behind) to front (full size, in front) */
export const LANE_BACK = 762;
export const LANE_FRONT = 930;
/** the pets' box height at the front lane, in town units (the room's cat box is 240 room units) */
export const PET_H = 150;
/** the room (scene/world.ts) is 600x460 with its floor at 400; a pocket room is that room, scaled onto the street */
export const ROOM = { w: 600, h: 460, floor: 400, catH: 240 } as const;
/** how big a pet stands at depth y: 0.8 at the back lane, 1 at the front */
export const depthScale = (y: number) => 0.8 + 0.2 * Math.max(0, Math.min(1, (y - LANE_BACK) / (LANE_FRONT - LANE_BACK)));
/** the pocket room's scale at depth y: room units to town units */
export const pocketScale = (y: number) => (PET_H / ROOM.catH) * depthScale(y);
/** walking pace in town units a second at depth y: the room's walk is 58 room units a hop at 380 ms a hop */
export const walkSpeed = (y: number) => (58 / 0.38) * pocketScale(y);
/** how far each character's pet reaches above its feet, in town units at the front lane (for hit boxes and labels) */
export const PET_TALL = { cat: 140, frog: 142, sahur: 196, ...(__THICCUMS__ ? { thiccums: 140 } : {}), ...(__R3TARDS__ ? { r3tards: 222 } : {}), ...(__EMONAD__ ? { emonad: 250 } : {}) } as Record<Character, number>;   // (the town's pets only: sim.ts inTown; Thiccums stands 195 svg units, the frok 196)

/** The town's page scale: its height fits the viewport, but a pet never gets tiny (a short landscape phone) or huge. */
export function townScale(vh: number): number { return Math.max(0.5, Math.min(1.15, vh / TOWN.h)); }

export type ZoneId = 'gate' | 'diner' | 'baths' | 'hall' | 'park' | 'shop' | 'inn' | 'furnace' | 'haunted' | 'backrooms' | 'graveyard' | 'arena';
export type Landmark = {
  id: ZoneId;
  /** the name on its sign and on the map */
  name: string;
  /** what it is for, in the map's tooltip */
  blurb: string;
  /** its stretch of the street */
  x0: number; x1: number;
  /** where pets stand when they come here (a sub-range of the street) */
  stand: [number, number];
  /** the map's icon (an emoji is fine: the map is small) */
  icon: string;
  /** a door pets can go in and out of (town x), and what they do in there */
  door?: number;
  /** where its tag hangs on the door (town y of the tag's bottom) */
  doorY?: number;
  inside?: string;
};

export const LANDMARKS: Landmark[] = [
  { id: 'gate', name: 'Town gate', blurb: 'New pets arrive here', x0: 0, x1: 360, stand: [150, 330], icon: '🚪' },
  { id: 'diner', name: 'Emo Diner', blurb: 'Hungry pets hang around the diner', x0: 360, x1: 900, stand: [420, 860], icon: '🍜', door: 813, doorY: 606, inside: 'eating' },
  { id: 'baths', name: 'Bathhouse', blurb: 'Grubby pets wait for a wash', x0: 900, x1: 1500, stand: [940, 1480], icon: '🛁', door: 1178, doorY: 648, inside: 'in the bath' },
  { id: 'hall', name: 'Town hall', blurb: 'Crowned pets gather on the steps', x0: 1500, x1: 2260, stand: [1560, 2210], icon: '👑', door: 1890, doorY: 584, inside: 'at court' },
  { id: 'park', name: 'The park', blurb: 'Bored pets want to play', x0: 2260, x1: 2900, stand: [2300, 2860], icon: '🌳' },
  { id: 'shop', name: 'Item shop', blurb: 'Outfits and rooms for every pet', x0: 2900, x1: 3420, stand: [2940, 3390], icon: '🎩', door: 3318, doorY: 590, inside: 'trying things on' },
  { id: 'inn', name: 'Sleepy Inn', blurb: 'Sleeping pets doze on the porch', x0: 3420, x1: 3960, stand: [3460, 3930], icon: '🌙', door: 3690, doorY: 576, inside: 'asleep' },
  { id: 'furnace', name: 'The Furnace', blurb: 'Where EMO gets burned', x0: 3960, x1: 4480, stand: [4000, 4450], icon: '🔥' },
  { id: 'haunted', name: 'Haunted house', blurb: 'Pets with the Spooky theme', x0: 4480, x1: 5000, stand: [4520, 4970], icon: '🎃', door: 4741, doorY: 590, inside: 'being haunted' },
  { id: 'backrooms', name: 'The Backrooms', blurb: 'Pets with the Backrooms theme', x0: 5000, x1: 5320, stand: [5030, 5300], icon: '🚧', door: 5150, doorY: 618, inside: 'lost in the Backrooms' },
  { id: 'graveyard', name: 'Graveyard', blurb: 'Ghosts drift here', x0: 5320, x1: 6000, stand: [5380, 5940], icon: '🪦' },
  { id: 'arena', name: 'Fight Club', blurb: 'The bar with a basement: pets fight down there for MON; everyone watches', x0: 6000, x1: 6700, stand: [6060, 6640], icon: '🥊', door: 6359, doorY: 540, inside: 'at the bar' },
];
export const LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])) as Record<ZoneId, Landmark>;
/** where pets with nowhere in particular to be spend their time, weighted */
export const WANDER: [ZoneId, number][] = [['gate', 0.4], ['diner', 1], ['baths', 1], ['hall', 1.6], ['park', 1.8], ['shop', 1.2], ['inn', 0.8], ['furnace', 1], ['haunted', 0.5], ['backrooms', 0.4], ['graveyard', 0.3], ['arena', 0.9]];

/** how many pets the street holds before some go indoors (per 1000 town units): a crowd, not a wall */
export const STREET_DENSITY = 11;
/** which building a pet goes into, by what it needs (the rest pick any door) */
export const INDOOR_FOR: Partial<Record<string, ZoneId>> = { sleeping: 'inn', sleepy: 'inn', hungry: 'diner', grubby: 'baths' };
/** where a newly minted pet walks in: out of the gatehouse's passage */
export const GATE_X = 124;

/**
 * What stands on the pavement among the pets (Street.tsx StreetProps), as the ground it takes up: no pet stands inside
 * one, and a walk that would pass through one goes round it, in front or behind (sim.ts). A footprint is the band of
 * feet positions (y) that would look like standing IN the thing; further back a pet is simply behind it.
 */
export type Obstacle = { x0: number; x1: number; y0: number; y1: number };
/**
 * A footprint is where a pet's FEET may not be, so it is the prop's own half-width plus half a pet's: a pet whose
 * middle stood just past the prop's edge had half its body in the slide (operator, 2026-09-27: "the things on the map
 * they just kind of walk over or are layered weird").
 */
export const PET_HALF = 44;
const ob = (x: number, half: number, feet: number, back: number, front = 12): Obstacle => ({ x0: x - half - PET_HALF, x1: x + half + PET_HALF, y0: feet - back, y1: feet + front });
export const OBSTACLES: Obstacle[] = [
  ob(1470, 116, 790, 42),          // the fountain
  ob(2185, 112, 778, 20),          // the crown board (on two posts)
  ob(2330, 28, 764, 18, 10),       // tree trunks
  ob(2840, 28, 770, 18, 10),
  ob(2590, 64, 782, 26),           // the big yarn
  ob(2440, 104, 806, 42, 10),      // the slide
  ob(2720, 114, 800, 36, 10),      // the swings
  ob(2520, 84, 930, 26),           // the flowerbed (at the front)
  ob(3560, 84, 780, 20, 10),       // benches
  ob(3820, 84, 784, 20, 10),
  ob(5650, 72, 786, 26),           // the obelisk
  ob(5410, 46, 800, 16, 10),       // tombstones
  ob(5520, 42, 870, 16, 10),
  ob(5790, 50, 818, 16, 10),
  ob(5900, 46, 892, 16, 10),
];

/**
 * The stacking order for something whose feet are at depth y: by whole units of depth, then by a pet's own tiebreak
 * (0-9, never a prop's 5), so two pets at the same depth keep one order instead of swapping as they sway.
 */
export const depthZ = (y: number, tie = 5) => Math.floor(y) * 10 + tie;
export const tieOf = (key: string) => { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; const t = h % 9; return t < 5 ? t : t + 1; };
