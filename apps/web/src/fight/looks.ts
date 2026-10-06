/**
 * Fight Club's two looks, worn for a day after a fight (FightClub.sol `looksOf`): the winner's CHAMPIONSHIP BELT and the
 * loser's BLACK EYE. Drawn into the pet's own svg at runtime, inside the rigged group they belong to, so every
 * animation carries them (the belt rides the body, the shiner the face) without touching the design files: the frok's
 * belt goes round his robe and the log's round the lower log, each strap clipped to the silhouette with the clip the
 * mummy wraps already use; the cat sits with her front legs over her belly, so hers is a gold plate on her own collar
 * (the $EMO tag steps aside while she wears it, as it does for the Star of David). The shiner is drawn UNDER one eye,
 * so the eye sits on it and only the bruise round it shows.
 *
 * Positions are in each drawing's own units (viewBox 200 x 230), measured with tools/fightclub/measure.mjs and
 * tools/fightclub/tree.mjs off the rest pose.
 */
import type { Drawing } from '../pet/Pet';

const NS = 'http://www.w3.org/2000/svg';
const GOLD = { lite: '#FFF0B3', main: '#F2C94C', deep: '#C9962B', dark: '#8A6214' };
const STRAP = '#1E1528';

type Spot = {
  /** the eye the shiner goes under: its group id, its centre and radii (the white), and the ink and line weight; the
   *  bruise is clipped to the head's outline (`headClip`), so it never spills past the edge of the head */
  eye: { id: string; cx: number; cy: number; rx: number; ry: number; headClip: string };
  ink: string; lw: number;
  belt:
    | { kind: 'collar'; cx: number; cy: number; scale: number; sides: [number, number, number] }
    | { kind: 'waist'; clip: string; y: number; x0: number; x1: number; sag: number; h: number; cx: number; scale: number };
};

const SPOT: Partial<Record<Drawing, Spot>> = {
  // the fringe covers her right eye: the shiner is on the one we see
  cat: { eye: { id: 'eyeL', cx: 76, cy: 108, rx: 17, ry: 16, headClip: 'headwrapclip' }, ink: '#111111', lw: 2.4, belt: { kind: 'collar', cx: 100, cy: 147, scale: 1, sides: [72, 128, 137] } },
  frog: { eye: { id: 'eyeL', cx: 107, cy: 46, rx: 16, ry: 13, headClip: 'frogheadwrapclip' }, ink: '#111111', lw: 2.2, belt: { kind: 'waist', clip: 'frogbodywrapclip', y: 146, x0: 46, x1: 144, sag: 4, h: 12, cx: 100, scale: 0.6 } },   // (his arms hang over the robe's sides at the waist: a smaller buckle, so the strap shows either side of it between his arms)
  sahur: { eye: { id: 'eyeL', cx: 87.5, cy: 42, rx: 10.5, ry: 9.5, headClip: 'sahurheadclip' }, ink: '#2B1607', lw: 1.5, belt: { kind: 'waist', clip: 'sahurbodyclip', y: 117, x0: 76, x1: 124, sag: 3, h: 8, cx: 100, scale: 0.72 } },
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, kids: Element[] = []): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.appendChild(k);
  return e;
}

/** The gold plate at the belt's front: an oval with a raised rim, a lighter centre, a red gem, and a shine. */
function plate(cx: number, cy: number, s: number, ink: string, lw: number, uid: string) {
  const g = el('g', { class: 'fc-plate' });
  const rx = 18 * s, ry = 13 * s;
  g.appendChild(el('ellipse', { cx, cy, rx: rx + 3.2 * s, ry: ry + 3 * s, fill: `url(#${uid}-rim)`, stroke: ink, 'stroke-width': lw }));
  g.appendChild(el('ellipse', { cx, cy, rx, ry, fill: `url(#${uid}-face)`, stroke: GOLD.dark, 'stroke-width': lw * 0.55 }));
  // a laurel of little ticks round the face, the belt's engraving
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2; const r1 = 0.78, r2 = 0.9;
    g.appendChild(el('line', { x1: cx + Math.cos(a) * rx * r1, y1: cy + Math.sin(a) * ry * r1, x2: cx + Math.cos(a) * rx * r2, y2: cy + Math.sin(a) * ry * r2, stroke: GOLD.deep, 'stroke-width': lw * 0.45, 'stroke-linecap': 'round' }));
  }
  g.appendChild(el('circle', { cx, cy, r: 4.6 * s, fill: '#C0263A', stroke: ink, 'stroke-width': lw * 0.6 }));
  g.appendChild(el('circle', { cx: cx - 1.4 * s, cy: cy - 1.5 * s, r: 1.5 * s, fill: '#FFD7DC' }));
  g.appendChild(el('path', { d: `M ${cx - rx * 0.62} ${cy - ry * 0.35} Q ${cx - rx * 0.3} ${cy - ry * 0.78} ${cx + rx * 0.1} ${cy - ry * 0.74}`, fill: 'none', stroke: GOLD.lite, 'stroke-width': lw * 0.8, 'stroke-linecap': 'round', opacity: 0.9 }));
  return g;
}
function sidePlate(x: number, y: number, s: number, ink: string, lw: number, uid: string) {
  return el('rect', { x: x - 5 * s, y: y - 6 * s, width: 10 * s, height: 12 * s, rx: 2.4 * s, fill: `url(#${uid}-rim)`, stroke: ink, 'stroke-width': lw * 0.8 });
}
function defs(uid: string) {
  const d = el('defs', {});
  d.appendChild(el('linearGradient', { id: `${uid}-rim`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
    el('stop', { offset: 0, 'stop-color': GOLD.lite }), el('stop', { offset: 0.45, 'stop-color': GOLD.main }), el('stop', { offset: 1, 'stop-color': GOLD.deep }),
  ]));
  d.appendChild(el('radialGradient', { id: `${uid}-face`, cx: 0.42, cy: 0.38, r: 0.75 }, [
    el('stop', { offset: 0, 'stop-color': GOLD.lite }), el('stop', { offset: 0.55, 'stop-color': GOLD.main }), el('stop', { offset: 1, 'stop-color': GOLD.deep }),
  ]));
  d.appendChild(el('radialGradient', { id: `${uid}-bruise`, cx: 0.5, cy: 0.55, r: 0.5 }, [
    el('stop', { offset: 0, 'stop-color': '#3A1260', 'stop-opacity': 0.95 }), el('stop', { offset: 0.62, 'stop-color': '#5C2A8C', 'stop-opacity': 0.9 }),
    el('stop', { offset: 0.84, 'stop-color': '#8A5BB8', 'stop-opacity': 0.55 }), el('stop', { offset: 1, 'stop-color': '#8A5BB8', 'stop-opacity': 0 }),
  ]));
  return d;
}

let seq = 0;

/**
 * A copy of one of the drawing's own clip shapes, in the fight's own defs. The costume clips (the mummy's wraps) live
 * inside groups that are hidden until worn, and a clip inside a display:none group does not resolve (CLAUDE.md, the
 * pumpkin's lesson): referenced there, the belt's strap simply vanished. The copy is always resolvable.
 */
function cloneClip(svg: SVGSVGElement, defs: Element, src: string, id: string): string | null {
  const c = svg.querySelector(`clipPath#${src}`);
  if (!c) return null;
  const copy = el('clipPath', { id });
  for (const k of c.children) copy.appendChild(k.cloneNode(true));
  defs.appendChild(copy);
  return `url(#${id})`;
}

/**
 * Put the belt and the shiner into this pet's svg (once; hidden), and return a switch for each. The ids carry a per-pet
 * suffix: several pets share a page, and a gradient id resolves to the first element with it in the document.
 */
export function fightLooks(svgRoot: Element, character: Drawing) {
  const spot = SPOT[character];
  const svg = (svgRoot.tagName.toLowerCase() === 'svg' ? svgRoot : svgRoot.querySelector('svg')) as SVGSVGElement | null;
  if (!spot || !svg) return { setBelt: (_on: boolean) => {}, setBlackEye: (_on: boolean) => {} };
  const uid = `fc${++seq}`;
  const d = defs(uid);
  svg.insertBefore(d, svg.firstChild);
  const headClip = cloneClip(svg, d, spot.eye.headClip, `${uid}-head`);
  const bodyClip = spot.belt.kind === 'waist' ? cloneClip(svg, d, spot.belt.clip, `${uid}-body`) : null;

  // ---- the black eye, under the eye
  const eye = svg.querySelector(`#${spot.eye.id}`);
  const { cx, cy, rx, ry } = spot.eye;
  const shiner = el('g', { class: 'fc-shiner', style: 'display:none', ...(headClip ? { 'clip-path': headClip } : {}) }, [
    el('ellipse', { cx, cy: cy + 1.5, rx: rx + 7, ry: ry + 7, fill: `url(#${uid}-bruise)` }),
    // the swelling's darker crescent under the eye, and a sore highlight on the cheekbone
    el('path', { d: `M ${cx - rx - 2} ${cy + ry * 0.35} Q ${cx} ${cy + ry + 9} ${cx + rx + 2} ${cy + ry * 0.35}`, fill: 'none', stroke: '#2E0D4D', 'stroke-width': spot.lw * 1.1, 'stroke-linecap': 'round', opacity: 0.8 }),
    el('path', { d: `M ${cx - rx * 0.5} ${cy + ry + 5} Q ${cx} ${cy + ry + 7.5} ${cx + rx * 0.45} ${cy + ry + 4.5}`, fill: 'none', stroke: '#C9A6E6', 'stroke-width': spot.lw * 0.7, 'stroke-linecap': 'round', opacity: 0.7 }),
  ]);
  eye?.parentNode?.insertBefore(shiner, eye);

  // ---- the belt
  const b = spot.belt;
  let belt: SVGGElement;
  let host: Element | null;
  if (b.kind === 'collar') {
    // on the cat's own collar: a side plate on the strap each side and the big plate at the front
    host = svg.querySelector('#collar');
    belt = el('g', { class: 'fc-belt', style: 'display:none' }, [
      sidePlate(b.sides[0], b.sides[2], 0.9, spot.ink, spot.lw, uid), sidePlate(b.sides[1], b.sides[2], 0.9, spot.ink, spot.lw, uid),
      plate(b.cx, b.cy, b.scale, spot.ink, spot.lw, uid),
    ]);
  } else {
    // round the waist: the strap follows the body's roundness (it sags a little at the front), clipped to the body
    host = svg.querySelector('#body');
    const { y, x0, x1, sag, h } = b; const mid = (x0 + x1) / 2;
    const band = `M ${x0} ${y} Q ${mid} ${y + sag * 2} ${x1} ${y} L ${x1} ${y + h} Q ${mid} ${y + h + sag * 2} ${x0} ${y + h} Z`;
    const stitch = (dy: number) => el('path', { d: `M ${x0} ${y + dy} Q ${mid} ${y + dy + sag * 2} ${x1} ${y + dy}`, fill: 'none', stroke: GOLD.main, 'stroke-width': spot.lw * 0.45, 'stroke-dasharray': `${2.2 * b.scale} ${1.8 * b.scale}`, opacity: 0.85 });
    const strap = el('g', bodyClip ? { 'clip-path': bodyClip } : {}, [
      el('path', { d: band, fill: STRAP, stroke: spot.ink, 'stroke-width': spot.lw }),
      stitch(h * 0.22), stitch(h * 0.78),
    ]);
    const py = y + h / 2 + sag * 1.6;
    belt = el('g', { class: 'fc-belt', style: 'display:none' }, [
      strap,
      sidePlate(b.cx - 27 * b.scale * 1.15, y + h / 2 + sag * 1.1, b.scale, spot.ink, spot.lw, uid),
      sidePlate(b.cx + 27 * b.scale * 1.15, y + h / 2 + sag * 1.1, b.scale, spot.ink, spot.lw, uid),
      plate(b.cx, py, b.scale, spot.ink, spot.lw, uid),
    ]);
  }
  host?.appendChild(belt);
  const tag = svg.querySelector<SVGElement>('#emotag');

  return {
    setBelt(on: boolean) {
      belt.style.display = on ? '' : 'none';
      if (character === 'cat' && tag) tag.style.visibility = on ? 'hidden' : '';
    },
    setBlackEye(on: boolean) { shiner.style.display = on ? '' : 'none'; },
  };
}
