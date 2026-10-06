/**
 * His showreel: the list of actions and the beats (a look, a room and the moves played in them) that the lab's Showreel
 * button and the mint page's stage both play. Kept apart from the lab (R3Lab.tsx, dev only) so the mint page can use it
 * without carrying the lab.
 */
import type { Director, PetMove, Toy } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import type { Costume } from '../pet/Pet';

export type Head = 'kippah' | 'keffiyeh' | null;
export type Act = { label: string; run: (d: Director) => Promise<unknown> };
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const ACTS: Act[] = [
  { label: 'Feed', run: (d) => d.feed() },
  { label: 'Play', run: (d) => d.play() },
  { label: 'Pet', run: (d) => d.pet(1) },
  { label: 'Wash', run: (d) => d.wash() },
  { label: 'Poop', run: (d) => d.poop() },
  { label: 'Clean', run: (d) => d.clean() },
  { label: 'Sleep', run: (d) => d.sleep() },
  { label: 'Wake', run: (d) => d.wake() },
  { label: 'Walk left', run: (d) => d.walk(160) },
  { label: 'Walk right', run: (d) => d.walk(440) },
  { label: 'Rumble', run: (d) => d.rumble() },
  { label: 'Yawn', run: (d) => d.yawn() },
  { label: 'Die', run: (d) => d.die() },
  { label: 'Revive', run: (d) => d.revive() },
];

/**
 * The showreel: each beat is a look, a room and the moves played in them. Between them the beats wear every outfit (plain
 * and crowned, so the golden versions show), the emo hair, both head pieces and the star, stand in all five rooms by day
 * and by night, use all three toys and all three Pet moves, and play every action. A pack's toy and Pet move are shown in
 * its own room and dress.
 */
export type Beat = { outfit?: Costume; hair?: boolean; head?: Head; star?: boolean; crown?: boolean; scene?: SceneName | null; night?: boolean; toy?: Toy; pet?: PetMove; acts: string[] };
const KOTEL = 'kotel' as SceneName; const MAJLIS = 'majlis' as SceneName;
export const REEL: Beat[] = [
  { acts: ['Pet', 'Walk left'] },
  { outfit: 'witch', scene: 'halloween', night: true, acts: ['Play', 'Rumble'] },
  { head: 'kippah', star: true, scene: KOTEL, toy: 'dreidel', pet: 'kapparot', acts: ['Play', 'Pet'] },
  { outfit: 'bisht' as Costume, head: 'keffiyeh', scene: MAJLIS, toy: 'darbuka' as Toy, pet: 'falcon' as PetMove, acts: ['Play', 'Pet'] },
  { outfit: 'mummy', scene: 'backrooms', acts: ['Feed'] },
  { outfit: 'zombie', scene: 'halloween', acts: ['Poop', 'Walk right'] },
  { outfit: 'pumpkin', scene: 'halloween', night: true, acts: ['Wash'] },
  { hair: true, night: true, acts: ['Sleep'] },
  { crown: true, scene: MAJLIS, night: true, acts: ['Yawn', 'Walk left'] },
  { outfit: 'witch', hair: true, crown: true, scene: KOTEL, night: true, acts: ['Play'] },
  { outfit: 'mummy', head: 'kippah', crown: true, scene: 'backrooms', acts: ['Rumble', 'Pet'] },
  { outfit: 'zombie', crown: true, acts: ['Die'] },
  { hair: true, head: 'kippah', star: true, crown: true, scene: KOTEL, toy: 'dreidel', acts: ['Play'] },
  { outfit: 'pumpkin', crown: true, scene: 'backrooms', night: true, acts: ['Rumble', 'Walk right'] },
  { outfit: 'bisht' as Costume, head: 'keffiyeh', crown: true, scene: MAJLIS, night: true, toy: 'darbuka' as Toy, acts: ['Play', 'Walk left'] },
];
/** An action, and what clears up after it (a poop, a sleep and a death each leave the room in a state). */
export async function act(d: Director, name: string) {
  const a = ACTS.find((x) => x.label === name); if (!a) return;
  await a.run(d);
  if (name === 'Poop') await d.clean();
  if (name === 'Sleep') { await wait(1400); await d.wake(); }
  if (name === 'Die') { await wait(1600); await d.revive(); }
}
