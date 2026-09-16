import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pet, type PetRig } from '../pet/Pet';
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
export function NftArt({ state, still = false, crown = false, costume, onReady }: { state: NftState; still?: boolean; crown?: boolean; costume?: string; onReady?: () => void }) {
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
    rig.setCrown(crown, 0);
    rig.setCostume(costume === 'witch', 0);
    switch (state) {
      case 'happy': rig.face('happy', 'smile', 0); break;
      case 'hungry': rig.face('open', 'frown', 0); rig.look(0.4, 0.5); break;
      case 'grubby': rig.setDirty(true); rig.face('open', 'frown', 0); break;
      case 'bored': rig.look(0.9, 0.1); rig.tilt(-1); break;
      case 'sleepy': rig.face('closed', 'open', 0); rig.tilt(1); break;
      case 'sleeping': rig.setMood('sleep'); break;
      case 'sad': rig.setMood('sad'); break;
      case 'dead': rig.setGhost(true); rig.face('x', 'frown', 0); break;
      default: break;
    }
    if (!still && !onReady) return;
    const t = setTimeout(() => { if (still) rig.still(); onReady?.(); }, 1600);
    return () => clearTimeout(t);
  }, [rig, state, still, crown, onReady]);
  const night = state === 'sleeping'; const dead = state === 'dead';
  // a hat rises above the cat's own box, and the ghost floats up further with a halo over the hat, so a
  // costumed cat is drawn 10% smaller to keep all of that inside the frame
  const catW = costume ? 560 : CAT_W; const catH = catW * 230 / 200;
  return (
    <div ref={box} className="nft-art" data-state={state} data-night={night ? 'on' : 'off'} style={{ aspectRatio: '1 / 1' }}>
      <div className="nft-world" style={{ width: SIZE, height: SIZE, transform: `scale(${k})` }}>
        <div className="nft-wall" /><div className="nft-dots" />
        {night && <div className="nft-moon" dangerouslySetInnerHTML={{ __html: PROPS.moon }} />}
        <div className="nft-floor" style={{ top: FLOOR - 40 }} />
        <div className="nft-rug" style={{ top: FLOOR - 6 }} />
        <div className="nft-cat" style={{ width: catW, height: catH, left: (SIZE - catW) / 2, top: FLOOR - catH * (212 / 230) + (dead ? -70 : 0) }}>
          <Pet onRig={setRig} style={{ width: '100%', height: '100%' }} />
        </div>
        {dead && <div className="nft-prop" style={{ left: 512 + 200 - 75, top: FLOOR + 26 - 161, width: 150, height: 161 }} dangerouslySetInnerHTML={{ __html: PROPS.grave }} />}
        {state === 'grubby' && <div className="nft-prop" style={{ left: 512 - 262 - 75, top: FLOOR + 22 - 135, width: 150, height: 135 }} dangerouslySetInnerHTML={{ __html: PROPS.poop }} />}
        {(state === 'hungry' || state === 'bored') && (
          <div className="nft-thought" style={{ left: 512 + 150, top: FLOOR - catH - 30 }}>
            <div className="thought-cloud" dangerouslySetInnerHTML={{ __html: PROPS.thought }} />
            <div className="thought-icon" dangerouslySetInnerHTML={{ __html: PROPS[state === 'hungry' ? 'bowl' : 'yarn'] }} />
          </div>
        )}
        {state === 'happy' && <><div className="nft-prop" style={{ left: 512 + 170, top: 250, width: 70, height: 70 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /><div className="nft-prop" style={{ left: 512 + 240, top: 190, width: 48, height: 48 }} dangerouslySetInnerHTML={{ __html: PROPS.heart }} /></>}
      </div>
    </div>
  );
}
