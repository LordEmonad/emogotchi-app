/**
 * The pet's drawing for the street: pet/Pet.tsx, except that the SVG is cloned from a copy parsed once per character
 * instead of being parsed from its 100-360 KB of text every time a pet walks on screen (measured 2026-09-26: 1.6 ms a
 * cat on an M3, 6.9 ms on a phone-class CPU, against 0.5 and 2.2 cloned). The rig gets exactly what Pet gives it.
 */
// the street versions of the cat and the frok: the same drawings with their outlines thinned (design/town_lite.py:
// 5x fewer curve segments for the cat, 3x for the frok, no visible difference at street size), because every pet has
// to be rendered afresh as it scrolls into view and that is what made a swipe drop frames (measured 2026-09-26)
import catSvg from '@emo-pets/pet/cat-lite.svg?raw';
import frogSvg from '@emo-pets/pet/frog-lite.svg?raw';
import sahurSvg from '@emo-pets/pet/sahur.svg?raw';
// Thiccums' street drawing (thinned like the cat's and the frok's: 528 -> 166 KB; his crown kept exact); in the town only
// with his switch on (a build without him never references it, so it is left out)
import thiccumsSvg from '@emo-pets/pet/thiccums-lite.svg?raw';
// the r3tard's (584 -> 203 KB), the same way: only with his switch on
import r3tardsSvg from '@emo-pets/pet/r3tards-lite.svg?raw';
// Emonad's (644 -> 325 KB: his traced hair keeps more of its points than the others), the same way
import emonadSvg from '@emo-pets/pet/emonadgotchi-lite.svg?raw';
import { useLayoutEffect, useRef } from 'react';
import { PetRig, type Character } from '../pet/Pet';
import { layerize } from '../pet/layers';
import '../pet/pet.css';

const SRC = { cat: catSvg, frog: frogSvg, sahur: sahurSvg, ...(__THICCUMS__ ? { thiccums: thiccumsSvg } : {}), ...(__R3TARDS__ ? { r3tards: r3tardsSvg } : {}), ...(__EMONAD__ ? { emonad: emonadSvg } : {}) } as Record<Character, string>;   // (the town's pets only: sim.ts inTown)

/**
 * WebKit (Safari, and every browser on an iPhone) gets the rig's lite profile: each pet rebuilt into a stack of layers
 * (pet/layers.ts, made for the rabbit r1), so a moving leg is the GPU sliding a layer rather than the whole drawing
 * repainted. WebKit repaints an SVG whose groups animate, every frame: in WebKit at iPhone size the street ran 35 ms a
 * frame with ~14 pets awake against 16.7 with none (2026-09-27), and the governor then emptied the street. Chrome
 * composites them well and keeps the plain drawing. `?lite=1` / `?lite=0` forces it.
 */
const LITE_ASKED = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lite') : null;
export const TOWN_LITE = LITE_ASKED === '1' || (LITE_ASKED !== '0' && typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Android|Firefox/.test(navigator.userAgent));
const TEMPLATES = new Map<Character, HTMLTemplateElement>();
function template(c: Character): HTMLTemplateElement {
  let t = TEMPLATES.get(c);
  if (!t) {
    t = document.createElement('template');
    t.innerHTML = SRC[c].replace('width="200" height="230"', 'width="100%" height="100%"').replace('<g id="crown">', '<g id="crown" style="opacity:0">');
    TEMPLATES.set(c, t);
  }
  return t;
}

/**
 * A clip the rig MOVES (its shape carries the class `lid`: a drawing with no eyelids to slide shuts its eyes by moving
 * their clip) must be this pet's own. Every pet on the page has the same ids and url(#id) finds the first in the document
 * (the donor's, which never moves), so each such clip gets an id of its own in this copy, and what it clips points at it.
 */
let ownSeq = 0;
function ownMovingClips(svg: SVGSVGElement) {
  for (const c of svg.querySelectorAll('clipPath')) {
    if (!c.id || !c.querySelector('.lid')) continue;
    const was = c.id; const own = `${was}-${++ownSeq}`;
    c.id = own;
    for (const u of svg.querySelectorAll(`[clip-path="url(#${was})"]`)) u.setAttribute('clip-path', `url(#${own})`);
  }
}

export function TownPet({ character, onRig }: { character: Character; onRig: (rig: PetRig | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onRig); cb.current = onRig;
  useLayoutEffect(() => {
    const h = host.current; if (!h) return;
    const svg = template(character).content.firstElementChild!.cloneNode(true) as SVGSVGElement;
    ownMovingClips(svg);
    h.appendChild(svg);
    // lite: layerize puts its stack where the svg was, and that stack is what must go when this unmounts (StrictMode
    // mounts twice in dev: removing only the svg left the first stack behind, a second, undressed copy of every pet)
    const el = TOWN_LITE ? layerize(svg) : svg;
    const rig = new PetRig(el, TOWN_LITE, { calm: true });
    cb.current(rig);
    return () => { rig.destroy(); cb.current(null); el.remove(); };
  }, [character]);
  return <div ref={host} className={`pet ${character}`} style={{ width: '100%', height: '100%', aspectRatio: '200 / 230' }} />;
}

/**
 * Every pet's drawing uses the same ids for its gradients, clips and masks, and url(#id) resolves to the FIRST element
 * with that id in the document, which must never sit inside a display:none tree (it then resolves to nothing). One
 * still copy of each drawing at the top of the page is that first element, always: then any pet on the street can be
 * display:none when it is off screen (the only way a paused rig costs nothing at all).
 *
 * The donors must be RENDERED, only parked off screen: `visibility` is inherited into clip-path and mask contents, so
 * a visibility:hidden donor clips away everything that uses its clips (2026-09-26: every pupil gone, every pumpkin
 * head gone; the operator saw "missing heads" and "the eyes are not right").
 */
export function Donors() {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = host.current; if (!h) return;
    for (const c of ['cat', 'frog', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])] as Character[]) {
      const svg = template(c).content.firstElementChild!.cloneNode(true) as SVGSVGElement;
      // every group shown: a clip or mask defined inside a costume that is hidden by default (display="none") would
      // otherwise resolve to nothing for every pet wearing that costume
      for (const e of svg.querySelectorAll('[display="none"]')) e.removeAttribute('display');
      for (const e of svg.querySelectorAll<SVGElement>('[style*="display"]')) e.style.removeProperty('display');
      h.appendChild(svg);
    }
    return () => { h.replaceChildren(); };
  }, []);
  return <div ref={host} className="pet-donors" aria-hidden />;
}
