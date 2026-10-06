/**
 * Emonadgotchi's actions and his showreel: the list of actions, and the beats (a look, a room and the moves played in them)
 * the lab's Showreel button plays round and round. Kept apart from the lab so a mint page could play it later without the lab.
 */
import type { Director, PetMove, Toy } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import type { Costume } from '../pet/Pet';

export type Head = 'kippah' | 'keffiyeh' | 'beanie' | null;
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
 * The showreel. Between them the beats wear every outfit plain and crowned (the golden versions), every head piece, the
 * star and the lip piercings, stand in all six rooms by day and by night, use all four toys and all four Pet moves, and
 * play every action. A pack's toy and Pet move are shown in its own room and dress.
 */
export type Beat = { outfit?: Costume; head?: Head; star?: boolean; lip?: boolean; crown?: boolean; scene?: SceneName | null; night?: boolean; toy?: Toy; pet?: PetMove; acts: string[] };
const KOTEL = 'kotel' as SceneName; const MAJLIS = 'majlis' as SceneName; const EMOROOM = 'emoroom' as SceneName;
export const REEL: Beat[] = [
  { acts: ['Pet', 'Walk left'] },
  { outfit: 'witch', scene: 'halloween', night: true, acts: ['Play', 'Rumble'] },
  { head: 'kippah', star: true, scene: KOTEL, toy: 'dreidel', pet: 'kapparot', acts: ['Play', 'Pet'] },
  { outfit: 'bisht', head: 'keffiyeh', scene: MAJLIS, toy: 'darbuka', pet: 'falcon', acts: ['Play', 'Pet'] },
  { outfit: 'emofit', head: 'beanie', lip: true, scene: EMOROOM, toy: 'guitar', pet: 'selfie', acts: ['Play', 'Pet'] },
  { outfit: 'mummy', scene: 'backrooms', acts: ['Feed'] },
  { outfit: 'zombie', scene: 'halloween', acts: ['Poop', 'Walk right'] },
  { outfit: 'pumpkin', scene: 'halloween', night: true, acts: ['Wash'] },
  { night: true, acts: ['Sleep'] },
  { crown: true, scene: MAJLIS, night: true, acts: ['Yawn', 'Walk left'] },
  { outfit: 'witch', crown: true, scene: KOTEL, night: true, acts: ['Play'] },
  { outfit: 'mummy', head: 'kippah', crown: true, scene: 'backrooms', acts: ['Rumble', 'Pet'] },
  { outfit: 'zombie', crown: true, acts: ['Die'] },
  { outfit: 'emofit', head: 'beanie', lip: true, crown: true, scene: EMOROOM, night: true, toy: 'guitar', acts: ['Play'] },
  { outfit: 'pumpkin', crown: true, scene: 'backrooms', night: true, acts: ['Rumble', 'Walk right'] },
  { outfit: 'bisht', head: 'keffiyeh', crown: true, scene: MAJLIS, night: true, toy: 'darbuka', acts: ['Play', 'Walk left'] },
  { star: true, lip: true, crown: true, scene: EMOROOM, pet: 'selfie', acts: ['Pet', 'Feed'] },
];
/** An action, and what clears up after it (a poop, a sleep and a death each leave the room in a state). */
export async function act(d: Director, name: string) {
  const a = ACTS.find((x) => x.label === name); if (!a) return;
  await a.run(d);
  if (name === 'Poop') await d.clean();
  if (name === 'Sleep') { await wait(1400); await d.wake(); }
  if (name === 'Die') { await wait(1600); await d.revive(); }
}
