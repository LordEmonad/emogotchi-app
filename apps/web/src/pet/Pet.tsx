import petSvg from '@emo-pets/pet/cat.svg?raw';
import { useLayoutEffect, useRef } from 'react';
import { PetRig } from './rig';
import './pet.css';

export type { Mood, Eyes, Mouth, Dir } from './rig';
export { PetRig } from './rig';

// One stable object: React 19 re-inserts innerHTML whenever this object changes identity,
// which would destroy the rig and every running animation on each re-render.
// The crown is an accessory that is off by default; hide it in the markup itself so it never flashes on load.
const HTML = { __html: petSvg.replace('width="200" height="230"', 'width="100%" height="100%"').replace('<g id="crown">', '<g id="crown" style="opacity:0">') };

type Props = {
  className?: string;
  style?: React.CSSProperties;
  /** Receives the rig once, when the SVG is in the document. */
  onRig: (rig: PetRig | null) => void;
};

/** The cat, inlined once and never re-inserted. */
export function Pet({ className = '', style, onRig }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onRig);
  cb.current = onRig;
  useLayoutEffect(() => {
    const svg = host.current?.querySelector('svg');
    if (!svg) return;
    const rig = new PetRig(svg);
    cb.current(rig);
    return () => { rig.destroy(); cb.current(null); };
  }, []);
  return <div ref={host} className={`pet ${className}`} style={{ aspectRatio: '200 / 230', ...style }} dangerouslySetInnerHTML={HTML} />;
}
