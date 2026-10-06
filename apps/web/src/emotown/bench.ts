/** `?bench=N`: a synthetic town of N residents (no chain), for measuring and for drawing the town before data flows. */
import type { CatView, Collection } from '@emo-pets/chain';
import type { Row } from './data';

const MOODS = ['content', 'content', 'happy', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'] as const;
const NAMES = ['Kimi', 'Mochi', 'Pixel', 'Brah', 'Sahurito', 'Nyx', 'Gloom', 'Tofu', 'Void', 'Chad', 'Luna', 'Emo Boi', '', '', ''];
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function benchTown(n: number): { rows: Row[]; views: Map<string, { view: CatView; worn: number[] }> } {
  const rows: Row[] = []; const views = new Map<string, { view: CatView; worn: number[] }>();
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < n; i++) {
    const mix: Collection[] = ['cat', 'cat', 'frok', 'frok', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])];
    const col: Collection = mix[i % mix.length]!;
    const id = 100 + i;
    const mood = MOODS[Math.floor(rnd() * MOODS.length)]!;
    const worn = rnd() < 0.35 ? [[1, 4, 5, 6][Math.floor(rnd() * 4)]!] : [];
    if (col !== 'cat' && rnd() < 0.3) worn.push(3);
    if (rnd() < 0.12) worn.push(rnd() < 0.5 ? 2 : 7);
    const view = {
      col, id, owner: '0x0000000000000000000000000000000000000001', name: NAMES[Math.floor(rnd() * NAMES.length)]!, started: true,
      alive: mood !== 'dead', asleep: mood === 'sleeping', poop: false, crowned: rnd() < 0.15, crownEligible: true,
      food: mood === 'hungry' ? 20 : 80, clean: mood === 'grubby' ? 20 : 80, fun: mood === 'bored' ? 20 : 80, energy: mood === 'sleepy' ? 20 : 80,
      mood, streak: Math.floor(rnd() * 9), score: Math.round(rnd() * 9000) / 100, day: 3, mintedAt: now - 86400 * 5, startsAt: 0, bornAt: 0, deadAt: 0, poopAt: 0, wakesAt: 0, diesAt: now + 86400,
      feeds: Math.floor(rnd() * 40), washes: Math.floor(rnd() * 30), plays: Math.floor(rnd() * 30), naps: Math.floor(rnd() * 20), cleanups: Math.floor(rnd() * 10), pets: Math.floor(rnd() * 90),
      names: 1, deaths: mood === 'dead' ? 1 : 0, revives: 0, monPaid: 0n, screenshots: 0, slaps: 0, squeezes: 0, burns: 0, tungs: col === 'sahur' ? Math.floor(rnd() * 20) : 0, ...(__THICCUMS__ && col === 'thiccums' ? { bounces: Math.floor(rnd() * 20) } : {}),
    } as CatView;
    rows.push({ col, id, ts: now - Math.floor(rnd() * 86000), what: 'feed' });
    views.set(`${col}:${id}`, { view, worn });
  }
  return { rows, views };
}

/** `?lineup=1`: every character in every look, content, standing in a row from x0 (for comparing with the room's own renders) */
export const LINEUP: { col: Collection; worn: number[]; crowned?: boolean; dead?: boolean }[] = [];
for (const col of ['cat', 'frok', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])] as Collection[]) {
  for (const worn of [[], [1], [4], [5], [6], ...(col === 'cat' || (__EMONAD__ && col === 'emonad') ? [] : [[3]])]) LINEUP.push({ col, worn });
  LINEUP.push({ col, worn: [], crowned: true });
  // the Jewish pack's accessories (8 kippah, 9 Star of David): alone, crowned (gold), under the witch hat and the pumpkin,
  // and on a ghost (2026-09-28: the town's thinned drawings had been built before them)
  LINEUP.push({ col, worn: [8, 9] }, { col, worn: [8, 9], crowned: true }, { col, worn: [1, 8, 9] }, { col, worn: [4, 8, 9] }, { col, worn: [8, 9], dead: true });
}
export function lineupTown(): { rows: Row[]; views: Map<string, { view: CatView; worn: number[] }> } {
  const base = benchTown(1).views.values().next().value!.view;
  const rows: Row[] = []; const views = new Map<string, { view: CatView; worn: number[] }>();
  LINEUP.forEach((l, i) => {
    const id = 1000 + i;
    const view = { ...base, col: l.col, id, name: `look ${i}`, mood: l.dead ? 'dead' as const : 'content' as const, alive: !l.dead, asleep: false, crowned: !!l.crowned, food: 70, clean: 70, fun: 70, energy: 70 } as CatView;
    rows.push({ col: l.col, id, ts: 0, what: 'feed' }); views.set(`${l.col}:${id}`, { view, worn: l.worn });
  });
  return { rows, views };
}
