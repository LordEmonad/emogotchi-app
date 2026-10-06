/**
 * The layered pet, for the rabbit r1 (the rig's lite profile).
 *
 * Measured on the r1's WebView (Chrome 101 on a Helio P35, 2026-09-25): a transform animation on an SVG group costs,
 * every frame, roughly in proportion to the number of paths under that group. One animation on the whole cat (262
 * paths) alone holds the page at 33 fps; on the head (66) 40; on a foot (1 path) it is free. A walk animates the
 * head, the back of the head, the body, both legs, the tail and more at once, which is 25 to 30 ms a frame: 24 to
 * 34 fps, and it looks it. No CSS changes that; it is how that Chrome lays SVG out.
 *
 * So on the r1 the drawing is rebuilt, once, at mount, into a stack of HTML boxes: every group the rig animates
 * becomes a `div.lyr` the compositor moves without touching a path, and the plain drawing between those groups is
 * split into `svg.frag` fragments (same viewBox, same box) in the same document order, so the z-order is exactly the
 * file's. A wrapper group that carries a static transform (the head's 3° tilt, the frog's mirrored arm) becomes a
 * `div.wrap` with the same transform in CSS, so nesting composes as it did. Each layer box takes its group's id and
 * classes (the rig and pet.css find it exactly as before), its hidden state, and a `transform-origin` computed from
 * what pet.css gave the group: view-box pivots verbatim, fill-box pivots from the group's own bounding box, both as
 * percentages of the box, which is what makes the motion pixel-identical at any size.
 *
 * The rig then only has to know two things (rig.ts): a layer box is a valid target, and a translation written in
 * svg units becomes a percentage of the box (`px / viewBox width`). Everything else in the rig is untouched.
 */

/** The groups that become layers: every group the rig moves whose subtree is worth keeping off the main thread. */
export const LAYER_IDS: ReadonlySet<string> = new Set([
  'cat', 'shadow', 'figure', 'tail', 'headstack', 'earL', 'earR', 'hairback', 'body', 'footL', 'footR', 'legL', 'legR', 'pendant',
  'head', 'crown', 'crownlift', 'pumpkin', 'witchhat', 'emohair', 'kippah', 'arms', 'armssq', 'bodysq', 'legLsq', 'legRsq', 'robeback', 'robebacksq', 'camera',
  'keffiyeh', 'keffiyehback', 'keffiyehdrape', 'bishtback', 'bishtbacksq',
]);

/** A group is a layer if the rig moves it, or if it is the TWIN of one (data-twin="<a layer's id>": another piece of that
 *  part at another depth, which the rig animates exactly as it does the part, so it must be a box as the part is). */
const isLayer = (g: Element) => LAYER_IDS.has(g.id) || LAYER_IDS.has(g.getAttribute('data-twin') ?? '');

const SVG_NS = 'http://www.w3.org/2000/svg';
type Pivot = { origin: string; refW: number; refH: number; box: 'fill-box' | 'view-box' };

/** The viewBox of the drawing a layered root was built from (data attributes on the root). */
export function viewBoxOf(root: Element): { w: number; h: number } {
  const w = Number(root.getAttribute('data-vbw')) || 200; const h = Number(root.getAttribute('data-vbh')) || 230;
  return { w, h };
}

/**
 * Rebuild `svg` (already in the document, laid out) into a layered stack inside a new `div.petroot`, which replaces
 * the svg in its parent. Returns the new root, which is what the rig is given.
 */
export function layerize(svg: SVGSVGElement): HTMLElement {
  const vb = svg.viewBox.baseVal; const W = vb.width || 200; const H = vb.height || 230;
  const pivots = new Map<Element, Pivot>();
  for (const g of svg.querySelectorAll<SVGGElement>('g[id]')) if (isLayer(g)) pivots.set(g, measurePivot(g, W, H));

  const root = document.createElement('div');
  root.className = 'petroot';
  root.setAttribute('data-vbw', String(W)); root.setAttribute('data-vbh', String(H));
  const frag = (parent: HTMLElement, of: string) => {
    const s = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'frag');
    const g = document.createElementNS(SVG_NS, 'g'); g.setAttribute('data-of', of); s.appendChild(g);
    parent.appendChild(s);
    return g;
  };
  const hasLayerInside = (e: Element) => [...e.querySelectorAll('g[id]')].some(isLayer);

  /** Move `children` under `parent` (a layer or wrapper box): runs of plain drawing into fragments, layers into boxes. */
  const distribute = (children: Node[], parent: HTMLElement, of: string) => {
    let cur: Element | null = null;   // the current fragment's <g>
    const into = () => cur ?? (cur = frag(parent, of));
    for (const n of children) {
      if (!(n instanceof Element)) continue;   // text between elements is whitespace
      if (n instanceof SVGGElement && n.id && isLayer(n)) { cur = null; parent.appendChild(buildLayer(n)); continue; }
      if (n instanceof SVGGElement && hasLayerInside(n)) {
        cur = null;
        const attrs = [...n.attributes].filter((a) => a.name !== 'id' && a.name !== 'class');
        if (attrs.length === 0 || (attrs.length === 1 && attrs[0]!.name === 'transform')) {
          // a see-through wrapper (or one with a static transform): a box, its plain children as fragments inside
          const box = document.createElement('div'); box.className = 'wrap';
          if (n.getAttribute('class')) box.setAttribute('data-class', n.getAttribute('class')!);
          const t = n.getAttribute('transform'); if (t) { box.style.transform = svgTransformToCss(t, W, H); box.style.transformOrigin = '0 0'; }
          parent.appendChild(box);
          distribute([...n.childNodes], box, n.id || of);
          continue;
        }
        // a wrapper with a clip, mask or opacity round a layer: cannot be a box; the whole subtree stays a fragment
      }
      into().appendChild(n);
    }
  };

  /** A layer box for group `g`: id, classes, hidden state and pivot carried over, children distributed inside. */
  const buildLayer = (g: SVGGElement): HTMLDivElement => {
    const div = document.createElement('div');
    div.className = 'lyr' + (g.getAttribute('class') ? ' ' + g.getAttribute('class') : '');
    div.id = g.id; div.setAttribute('data-layer', g.id);
    for (const a of [...g.attributes]) if (a.name.startsWith('data-')) div.setAttribute(a.name, a.value);
    if (g.getAttribute('display') === 'none') div.style.display = 'none';
    const style = g.getAttribute('style'); if (style) div.style.cssText += style;   // the crown's opacity:0
    const op = g.getAttribute('opacity'); if (op) div.style.opacity = op;
    const p = pivots.get(g); if (p) { div.style.transformOrigin = p.origin; div.setAttribute('data-refw', String(p.refW)); div.setAttribute('data-refh', String(p.refH)); }
    distribute([...g.childNodes], div, g.id);
    return div;
  };

  // the drawing's own top-level nodes: defs and the #cat group (which is itself a layer)
  distribute([...svg.childNodes], root, 'svg');
  svg.replaceWith(root);
  return root;
}

/**
 * Recompute the fill-box pivots after a costume changed the drawing (pet.css's fill-box follows the box; so does
 * this). A layer's box is the union of its fragments' and sub-layers' content, at rest.
 */
export function refreshPivots(root: Element): void {
  const { w: W, h: H } = viewBoxOf(root);
  for (const div of root.querySelectorAll<HTMLElement>('div.lyr[data-fillbox="1"]')) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of div.querySelectorAll<SVGGElement>('svg.frag > g')) {
      try { const b = g.getBBox(); if (b.width === 0 && b.height === 0) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); } catch { /* not rendered */ }
    }
    if (!Number.isFinite(x0)) continue;
    const ox = Number(div.getAttribute('data-ox')) || 0.5; const oy = Number(div.getAttribute('data-oy')) || 1;
    div.style.transformOrigin = `${(((x0 + (x1 - x0) * ox) / W) * 100).toFixed(4)}% ${(((y0 + (y1 - y0) * oy) / H) * 100).toFixed(4)}%`;
    div.setAttribute('data-refw', String(x1 - x0)); div.setAttribute('data-refh', String(y1 - y0));
    for (const slot of div.querySelectorAll<HTMLElement>('.slot')) if (slot.closest('.lyr') === div) slot.style.transformOrigin = div.style.transformOrigin;
  }
}

/** What pet.css gives this group: its transform-box and origin, resolved to a point in the viewBox, as percentages. */
function measurePivot(g: SVGGElement, W: number, H: number): Pivot {
  const cs = getComputedStyle(g);
  const box = cs.transformBox === 'view-box' ? 'view-box' : 'fill-box';
  const [oxs, oys] = cs.transformOrigin.split(' ');
  const ox = parseFloat(oxs ?? '0') || 0; const oy = parseFloat(oys ?? '0') || 0;
  if (box === 'view-box') return { origin: `${((ox / W) * 100).toFixed(4)}% ${((oy / H) * 100).toFixed(4)}%`, refW: W, refH: H, box };
  // fill-box: the origin is relative to the group's own bounding box; a hidden group is measured shown-but-invisible
  const wasDisplay = g.style.display; const wasVis = g.style.visibility; const hidden = getComputedStyle(g).display === 'none';
  if (hidden) { g.style.display = 'inline'; g.style.visibility = 'hidden'; }
  let b = { x: 0, y: 0, width: 0, height: 0 };
  try { const r = g.getBBox(); b = { x: r.x, y: r.y, width: r.width, height: r.height }; } catch { /* not rendered */ }
  if (hidden) { g.style.display = wasDisplay; g.style.visibility = wasVis; }
  // pet.css origins are percentages of the box; the computed value is that percentage of the CURRENT box, so keep the ratio
  const fx = b.width > 0 ? ox / b.width : 0.5; const fy = b.height > 0 ? oy / b.height : 1;
  g.setAttribute('data-ox', fx.toFixed(4)); g.setAttribute('data-oy', fy.toFixed(4)); g.setAttribute('data-fillbox', '1');
  return { origin: `${(((b.x + ox) / W) * 100).toFixed(4)}% ${(((b.y + oy) / H) * 100).toFixed(4)}%`, refW: b.width, refH: b.height, box };
}

/** An SVG `transform` attribute as a CSS transform on a host-sized box: distances become percentages of the box. */
export function svgTransformToCss(t: string, W: number, H: number): string {
  const px = (v: number, axis: 'x' | 'y') => `${((v / (axis === 'x' ? W : H)) * 100).toFixed(4)}%`;
  const out: string[] = [];
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const fn = m[1]!; const a = m[2]!.trim().split(/[\s,]+/).map(Number);
    if (fn === 'translate') out.push(`translate(${px(a[0] ?? 0, 'x')}, ${px(a[1] ?? 0, 'y')})`);
    else if (fn === 'scale') out.push(`scale(${a[0] ?? 1}, ${a[1] ?? a[0] ?? 1})`);
    else if (fn === 'rotate') { if (a.length >= 3) out.push(`translate(${px(a[1]!, 'x')}, ${px(a[2]!, 'y')}) rotate(${a[0]}deg) translate(${px(-a[1]!, 'x')}, ${px(-a[2]!, 'y')})`); else out.push(`rotate(${a[0]}deg)`); }
    else if (fn === 'skewX') out.push(`skewX(${a[0]}deg)`);
    else if (fn === 'skewY') out.push(`skewY(${a[0]}deg)`);
    else if (fn === 'matrix' && a.length === 6) out.push(`translate(${px(a[4]!, 'x')}, ${px(a[5]!, 'y')}) matrix(${a[0]}, ${a[1]}, ${a[2]}, ${a[3]}, 0, 0)`);
  }
  return out.join(' ');
}
