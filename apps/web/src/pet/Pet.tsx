import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { layerize } from './layers';
import { PetRig } from './rig';
import './pet.css';

export type { Mood, Eyes, Mouth, Dir, Costume } from './rig';
export { COSTUMES, COSTUME_PARTS, OUTFITS } from './rig';
export { PetRig } from './rig';

/** The site's pets. Thiccums is one only in a build with his switch on (__THICCUMS__); his drawing is not in this module:
 *  thiccums/launch.ts registers it (and his moves) before the app renders, and a build without him has neither. */
export type Character = 'cat' | 'frog' | 'sahur' | 'thiccums' | 'r3tards' | 'emonad';   // (r3tards: r3tardgotchi, a pet once his switch is on, __R3TARDS__; emonad: Emonadgotchi, the same with __EMONAD__)
/** Every drawing the rig can take: the site's pets. */
export type Drawing = Character;
/** ...and a drawing a module registers itself (registerDrawing): a Pet or a Stage can take it. */
export type AnyDrawing = Drawing;

// One stable object per character: React 19 re-inserts innerHTML whenever this object changes identity,
// which would destroy the rig and every running animation on each re-render.
// The crown is an accessory that is off by default; hide it in the markup itself so it never flashes on load.
const prep = (svg: string) => ({ __html: svg.replace('width="200" height="230"', 'width="100%" height="100%"').replace('<g id="crown">', '<g id="crown" style="opacity:0">') });
const HTML: Partial<Record<AnyDrawing, { __html: string }>> = {};
/**
 * Each drawing is its own chunk, fetched the first time a page shows that pet (the mobile pass, 2026-09-29: all four
 * rode in the main bundle, so a phone showing a frok first downloaded the cat's 200 KB). A character that lives in its own
 * module registers its drawing itself (registerDrawing: Thiccums' chunk), so a production build carries only what it can show.
 */
const LOADERS: Partial<Record<AnyDrawing, () => Promise<{ default: string }>>> = {
  cat: () => import('@emo-pets/pet/cat.svg?raw'),
  frog: () => import('@emo-pets/pet/frog.svg?raw'),
  sahur: () => import('@emo-pets/pet/sahur.svg?raw'),
  // Thiccums' chunk registers his drawing, his moves and his ways together (only in a build with his switch on)
  ...(__THICCUMS__ ? { thiccums: () => import('../thiccums/register') } : {}),
  // the r3tards character: his chunk registers the drawing with its moves and ways (his mint page imports it itself;
  // his pets' pages, the gallery's live pet and the rest come through here)
  r3tards: () => import('../r3tards/register'),
  // Emonad as a pet (Emonadgotchi): his chunk registers his drawing, moves and ways. In a dev build always (his lab, his
  // mint page's preview); in a production build only with his switch on (__EMONAD__), so until launch none of him ships
  ...(import.meta.env.DEV || __EMONAD__ ? { emonad: () => import('../emonadgotchi/register') } : {}),
};
const loading: Partial<Record<AnyDrawing, Promise<void>>> = {};
const waiting = new Set<() => void>();
export function registerDrawing(name: AnyDrawing, svg: string) {
  HTML[name] ??= prep(svg);
  for (const f of [...waiting]) f();
}
/** Fetch a pet's drawing now (a page that knows which pet it will show can start it early); resolves once it is there. */
export function loadDrawing(name: AnyDrawing): Promise<void> {
  if (HTML[name]) return Promise.resolve();
  const load = LOADERS[name];
  if (!load) return Promise.resolve();   // registered by its own module when that loads
  return (loading[name] ??= load().then((m) => registerDrawing(name, m.default), () => { delete loading[name]; }));
}
const NOTHING = { __html: '' };
/** Fetch drawings a page may show next (the home page's other pets, the wallet's other kinds of pet) once the page is idle,
 *  so switching to one never opens on an empty room. Not on a slow line or with Data Saver on: there a drawing is fetched
 *  when it is asked for (a finger on the switch, loadDrawing), not on the chance it will be. */
export function prefetchDrawings(names: readonly AnyDrawing[]) {
  const net = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (net?.saveData || /(^|-)(2g|3g)$/.test(net?.effectiveType ?? '')) return;
  const go = () => { for (const n of names) void loadDrawing(n); };
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}

type Props = {
  className?: string;
  style?: React.CSSProperties;
  /** Receives the rig once, when the SVG is in the document. */
  onRig: (rig: PetRig | null) => void;
  /** Which drawing to rig. All three carry the same group ids, so the rig and the director never know the difference. */
  character?: AnyDrawing;
  /** the rig's lite profile (see PetRig): decided before the rig exists, because its idle loop starts in the constructor */
  lite?: boolean;
  /** the rig's calm idle (a crowd: nothing loops, see PetRig) */
  calm?: boolean;
};

/** The cat, inlined once and never re-inserted. */
export function Pet({ className = '', style, onRig, character = 'cat', lite = false, calm = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onRig);
  cb.current = onRig;
  // the drawing arrives in its own chunk: until then the box is empty (same size), and the rig is made once it is in
  const html = HTML[character];
  const [, arrived] = useState(0);
  useEffect(() => {
    if (html) return;
    const f = () => { if (HTML[character]) arrived((n) => n + 1); };
    waiting.add(f);
    void loadDrawing(character).then(f);
    return () => { waiting.delete(f); };
  }, [character, html]);
  useLayoutEffect(() => {
    const h = host.current; if (!h || !html) return;
    // lite (the rabbit r1): the drawing is rebuilt into GPU layers before the rig sees it (layers.ts). The rebuild is
    // done once per host: an effect that runs again (StrictMode mounts twice) rigs the stack that is already there.
    const built = h.querySelector<HTMLElement>(':scope > .petroot');
    const svg = built ? null : h.querySelector('svg');
    if (!built && !svg) return;
    const rig = new PetRig(built ?? (lite && svg ? layerize(svg) : svg!), lite, { calm });
    cb.current(rig);
    return () => { rig.destroy(); cb.current(null); };
  }, [character, lite, html, calm]);
  return <div ref={host} key={character} className={`pet ${character} ${className}`} style={{ aspectRatio: '200 / 230', ...style }} dangerouslySetInnerHTML={html ?? NOTHING} />;
}
