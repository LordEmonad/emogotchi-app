/**
 * /pfplab (unlisted, a tool's page): one pet, in one of the nine wallet moods, dressed as asked, standing still on a
 * real stage: the plain room by day or night, or a room theme (the Spooky theme, the Backrooms, the Western Wall, the
 * Majlis). `node tools/pfps.mjs` screenshots it
 * for the profile pictures with room backgrounds, so the pet stands on the real floor in the real light instead of
 * being pasted over a picture of the room.
 *   /pfplab?character=cat|frog|sahur|thiccums&card=<mood>&scene=halloween|backrooms|kotel|majlis&night=1&crown=1&costume=witch,emohair
 * `window.__card_ready` is set once the pose has settled and the rig is frozen (the same flag the card route sets).
 * With `&action=<director method>` the pet is not frozen: `window.__act()` starts the action (feed, wash, play, pet,
 * poop, yawn, rumble, screenshot, slap, squeeze, burn, tung, ...) and the caller freezes the page itself at the moment
 * it wants (`document.getAnimations().forEach((a) => a.pause())`), for the pictures of the pets in action. Four action
 * names are the shop's toys and Pet items: `dreidel` and `darbuka` are Play with that toy out, `kapparot` and `falcon`
 * are the Pet button with that item on.
 */
import { useEffect, useState } from 'react';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import type { Character } from '../pet/Pet';
import { NFT_STATES, poseState, type NftState } from './NftArt';

export function PfpLab() {
  const params = new URLSearchParams(location.search);
  const character: Character = params.get('character') === 'frog' ? 'frog' : params.get('character') === 'sahur' ? 'sahur' : __THICCUMS__ && params.get('character') === 'thiccums' ? 'thiccums' : params.get('character') === 'r3tards' ? 'r3tards' : (import.meta.env.DEV || __EMONAD__) && params.get('character') === 'emonad' ? 'emonad' : 'cat';
  const card = params.get('card') ?? 'content';
  const state = ((NFT_STATES as readonly string[]).includes(card) ? card : 'content') as NftState;
  const sceneParam = params.get('scene');
  const scene: SceneName | null = sceneParam === 'halloween' || sceneParam === 'backrooms' || sceneParam === 'kotel' || sceneParam === 'majlis' || sceneParam === 'emoroom' ? sceneParam : null;
  const night = params.get('night') === '1' || state === 'sleeping';
  const action = params.get('action');
  const [d, setD] = useState<Director | null>(null);
  useEffect(() => {
    if (!d) return;
    d.wanderEnabled = false;
    const rig = d.rig;
    const w = window as unknown as { __card_ready?: boolean; __act?: () => Promise<unknown>; __lab?: unknown };
    if (action) {
      // dressed and in the mood, but free to move: the caller starts the action and freezes the page when it likes
      poseState(rig, state, params.has('crown'), params.get('costume') ?? undefined);
      const dd = d as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      // a director method, or a pet's own move (its registered ways, e.g. a butt bounce)
      const own = d.own as unknown as Record<string, (() => Promise<unknown>) | undefined> | null;
      // the toys and the Pet items are a setting on the director and then the ordinary Play or Pet
      if (action === 'dreidel' || action === 'darbuka') d.setToy(action);
      if (action === 'kapparot' || action === 'falcon') d.setPetMove(action);
      w.__act = () => (action === 'pet' || action === 'kapparot' || action === 'falcon' ? dd.pet!(1)
        : action === 'dreidel' || action === 'darbuka' ? dd.play!()
        : dd[action] ? dd[action]!() : own?.[action] ? own[action]!() : Promise.resolve());
      w.__lab = { d };
      // start the action and freeze the whole page `ms` later: every animation paused, every pending timer cleared (so
      // no step of the director's choreography can fire between the freeze and the screenshot), and any animation
      // started after that paused at birth. Timed inside the page, so the moment is exact to the frame.
      (w as unknown as { __shoot?: (ms: number) => Promise<void> }).__shoot = (ms: number) => new Promise<void>((res) => {
        void w.__act!();
        window.setTimeout(() => {
          for (const an of document.getAnimations()) an.pause();
          const hi = window.setTimeout(() => {}, 0);
          for (let i = 0; i <= hi; i++) { window.clearTimeout(i); window.clearInterval(i); }
          const animate = Element.prototype.animate;
          Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) { const an = animate.apply(this, args); an.pause(); return an; };
          res();
        }, ms);
      });
      const t = setTimeout(() => { w.__card_ready = true; }, 1200);
      return () => clearTimeout(t);
    }
    rig.busy = true;   // no idle flourishes
    poseState(rig, state, params.has('crown'), params.get('costume') ?? undefined);
    const t = setTimeout(() => { rig.still(); w.__card_ready = true; }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  // &bare=1: the room is hidden and the page transparent, so an action shot can sit on a colour background: the pet
  // and its props (bowl, ball, tub, glove, claw, fire) with nothing behind them
  return (
    <div className={`pfplab ${params.has('bare') ? 'is-bare' : ''}`}>
      <div className="shell"><Stage quiet onDirector={setD} night={night} thought={null} scene={scene} character={character} /></div>
    </div>
  );
}
