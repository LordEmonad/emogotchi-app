/**
 * Where the fights happen (operator, 2026-09-29: "change the fight arena to a dingy basement. like in fight club they were
 * fighting in a basement bar", then "the basement in general also needs improved a lot"): the cellar under a bar, drawn
 * in the pets' own style by packages/pet/design/fightprops.py (`python3 packages/pet/design/fightprops.py`, run by hand):
 * red brick gone black with soot and damp, joists and pipes under the bar's floor, the bar's stock on shelves and in
 * crates, kegs, a dead neon pint, a chalkboard of tallies, the stairs down from a door left ajar, stained concrete and a
 * chalk circle. One lamp over the ring (Light.tsx does its light).
 *
 * The drawings are inlined once (their ids prefixed, `fc-…`, so nothing clashes with a pet's or a prop's) and never move:
 * what glows or flickers is an overlay: the neon's tubes lit (a copy of just that group, recoloured, its opacity
 * stuttering), the light round the door, footsteps crossing the bar's floor overhead (the slits of light between the
 * boards going dark in turn). `BasementBack` is behind the crowd and the fighters, `BasementFront` over them (a column,
 * a post, crates and a mop bucket, only at the edges).
 */
import backSvg from '@emo-pets/pet/props/fightback.svg?raw';
import frontSvg from '@emo-pets/pet/props/fightfront.svg?raw';
import lampSvg from '@emo-pets/pet/props/fightlamp.svg?raw';

/** the drawings cover this much of the world: the room and 60 / 30 units past it on every side (camera shake, zoom) */
export const ART = { x: -60, y: -30, w: 720, h: 520 };

const prefix = (svg: string) => svg.replace(/\bid="/g, 'id="fc-').replace(/<svg\b/, '<svg class="fc-art"');
/** one group (balanced <g>…</g>) out of a drawing, by id */
function group(svg: string, id: string) {
  const i = svg.indexOf(`<g id="${id}"`); if (i < 0) return '';
  const re = /<g\b|<\/g>/g; re.lastIndex = i; let depth = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) { depth += m[0] === '<g' ? 1 : -1; if (depth === 0) return svg.slice(i, m.index + 4); }
  return '';
}
const view = `viewBox="${ART.x} ${ART.y} ${ART.w} ${ART.h}" width="${ART.w}" height="${ART.h}"`;
const HTML = {
  back: { __html: prefix(backSvg) },
  front: { __html: prefix(frontSvg) },
  lamp: { __html: prefix(lampSvg) },
  // the neon's tubes on their own, to be lit over the dead ones
  neon: { __html: `<svg xmlns="http://www.w3.org/2000/svg" ${view}>${group(backSvg, 'neon').replace('id="neon"', 'class="fc-neonlit"')}</svg>` },
  // the slits of light between the bar's floorboards, to be crossed by footsteps
  steps: { __html: `<svg xmlns="http://www.w3.org/2000/svg" ${view}>${group(backSvg, 'floorlight').replace('id="floorlight"', 'class="fc-steps"')}</svg>` },
};

export function BasementBack() {
  return (
    <div className="fc-basement fc-back" aria-hidden>
      <div className="fc-draw" dangerouslySetInnerHTML={HTML.back} />
      <div className="fc-draw fc-neon" dangerouslySetInnerHTML={HTML.neon} />
      <div className="fc-neonglow" />
      <div className="fc-draw fc-overhead" dangerouslySetInnerHTML={HTML.steps} />
      <div className="fc-doorglow" />
    </div>
  );
}

/** The lamp on its flex, inside Light's swinging box (the flex's top is its pivot). */
export function Lamp() {
  return <div className="fc-lamp" aria-hidden dangerouslySetInnerHTML={HTML.lamp} />;
}

export function BasementFront() {
  return <div className="fc-basement fc-front" aria-hidden><div className="fc-draw" dangerouslySetInnerHTML={HTML.front} /></div>;
}

/** The dark round the edges of the picture, over everything (fixed to the view, outside the camera). */
export function Vignette() {
  return <div className="fc-vignette" aria-hidden />;
}
