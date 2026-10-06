import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pet, COSTUMES, type Drawing, type Costume, type PetRig } from '../pet/Pet';
import { PROPS } from '../scene/props';
import '../scene/stage.css';

/** The wallet-facing states. The contract's tokenURI picks one of these images from the pet's on-chain state. */
export const NFT_STATES = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'] as const;
export type NftState = (typeof NFT_STATES)[number];
export const NFT_STATE_LABEL: Record<NftState, string> = {
  content: 'Content', happy: 'Happy', hungry: 'Hungry', grubby: 'Grubby', bored: 'Bored', sleepy: 'Sleepy', sleeping: 'Sleeping', sad: 'Sad', dead: 'Dead',
};
export const NFT_STATE_RULE: Record<NftState, string> = {
  content: 'default', happy: 'all meters above 78', hungry: 'food below 35', grubby: 'clean below 35, or a poop on the floor', bored: 'fun below 35', sleepy: 'energy below 30', sleeping: 'asleep', sad: 'any meter below 20', dead: 'alive = false',
};

const SIZE = 1024; const CAT_W = 620; const CAT_H = CAT_W * 230 / 200; const FLOOR = 870;

/**
 * One square portrait, 1024 world units scaled to its box. `still` freezes the pose after the
 * state has eased in (portrait renders); otherwise the cat idles.
 */
/** Dress a rig and put it in one of the nine wallet moods, instantly: the portrait's pose, shared with the PFP lab
 *  (/pfplab), which does the same on a real stage. `costume` is the outfit's name, or several joined by commas (the
 *  lab stacks them); 'emohair' among them is the hair. */
export function poseState(rig: PetRig, state: NftState, crown: boolean, costume?: string) {
  const worn = (costume ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  rig.setCrown(crown, 0);
  rig.setCostumes(worn.filter((c): c is Costume => (COSTUMES as readonly string[]).includes(c)), 0);
  rig.setHair(worn.includes('emohair'), 0);
  switch (state) {
    case 'happy': rig.face('happy', 'smile', 0); break;
    case 'hungry': rig.face('open', 'frown', 0); rig.look(0.4, 0.5); break;
    case 'grubby': rig.setDirty(true); rig.face('open', 'frown', 0); break;
    case 'bored': rig.look(0.9, 0.1); rig.tilt(-1); break;
    // (sleepy is a yawn. The r3tard's open mouth is a grin and read as laughing: his yawn is the dropped jaw)
    case 'sleepy': rig.face('closed', rig.character === 'r3tards' ? 'gape' : 'open', 0); rig.tilt(1); break;
    case 'sleeping': rig.setMood('sleep'); break;
    case 'sad': rig.setMood('sad'); break;
    case 'dead': rig.setGhost(true); rig.face('x', 'frown', 0); break;
    default: break;
  }
}

export function NftArt({ state, still = false, crown = false, costume, character = 'cat', onReady }: { state: NftState; still?: boolean; crown?: boolean; costume?: string; character?: Drawing; onReady?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [rig, setRig] = useState<PetRig | null>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setK(e.contentRect.width / SIZE); });
    ro.observe(el); setK(el.clientWidth / SIZE);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!rig) return;
    rig.busy = true; // no idle flourishes in a portrait
    poseState(rig, state, crown, costume);
    if (!still && !onReady) return;
    const t = setTimeout(() => { if (still) rig.still(); onReady?.(); }, 1600);
    return () => clearTimeout(t);
  }, [rig, state, still, crown, costume, onReady]);
  const night = state === 'sleeping'; const dead = state === 'dead';
  // a hat rises above the cat's own box, and the ghost floats up further with a halo over the hat, so a
  // costumed cat is drawn 10% smaller to keep all of that inside the frame
  // inversebrah and sahur are tall and narrow in the same 200x230 box, so they are drawn larger to fill the frame the way the cat does
  const baseW = character === 'cat' ? CAT_W : 720;   // the seal is as wide as the cat's box: the cat's size
  // (the frog's pumpkin adds a stem's height on top of a tall character: smaller again, or the dead tile crops it)
  // (the emo pack's beanie stands as tall as a head on the tall pets and a crown sits on top of it: the dead tile cropped
  // the frok's, Thiccums' and the r3tard's crowns, so it is drawn the witch hat's size)
  const tall = character !== 'cat' && (costume?.includes('witch') || costume?.includes('beanie')) ? 0.8 : 0;
  const shrink = tall || (costume ? 0.9 : 1);
  const catW = Math.round(baseW * shrink); const catH = catW * 230 / 200;
  return (
    <div ref={box} className="nft-art" data-state={state} data-night={night ? 'on' : 'off'} style={{ aspectRatio: '1 / 1' }}>
      <div className="nft-world" style={{ width: SIZE, height: SIZE, transform: `scale(${k})` }}>
        <div className="nft-wall" /><div className="nft-dots" />
        {night && <div className="nft-moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />}
        <div className="nft-floor" style={{ top: FLOOR - 40 }} />
        <div className="nft-rug" style={{ top: FLOOR - 6 }} />
        <div className="nft-cat" style={{ width: catW, height: catH, left: (SIZE - catW) / 2, top: FLOOR - catH * (212 / 230) + (dead ? -70 : 0) }}>
          <Pet onRig={setRig} character={character} style={{ width: '100%', height: '100%' }} />
        </div>
        {dead && <div className="nft-prop" style={{ left: 512 + 200 - 75, top: FLOOR + 26 - 161, width: 150, height: 161 }} dangerouslySetInnerHTML={{ __html: PROPS.grave }} />}
        {state === 'grubby' && <div className="nft-prop" style={{ left: 512 - 262 - 75, top: FLOOR + 22 - 135, width: 150, height: 135 }} dangerouslySetInnerHTML={{ __html: PROPS.poop }} />}
        {(state === 'hungry' || state === 'bored') && (
          <div className="nft-thought" style={{ left: 512 + (costume?.includes('pumpkin') ? (character === 'frog' ? 176 : 170) : 150), top: FLOOR - catH - 30 }}>
            <div className="thought-cloud" dangerouslySetInnerHTML={{ __html: PROPS.thought }} />
            <div className="thought-icon" dangerouslySetInnerHTML={{ __html: PROPS[state === 'hungry' ? 'bowl' : 'yarn'] }} />
          </div>
        )}
        {state === 'happy' && <><div className="nft-prop" style={{ left: 512 + 170, top: 250, width: 70, height: 70 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /><div className="nft-prop" style={{ left: 512 + 240, top: 190, width: 48, height: 48 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /></>}
      </div>
    </div>
  );
}
