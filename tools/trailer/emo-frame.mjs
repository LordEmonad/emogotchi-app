// Where a part of a filmed room lands in the film's frame, and the zoom and centre that put it where it should be.
// The SAME arithmetic as cover() in compose.js (keep the two in step): a room picture is drawn into a box of the frame
// (the whole frame, or a grid's tile) at zoom z with its centre at (fx, fy); below z 1 the picture no longer covers the
// box and it is placed whole inside it, the rest filled with a blurred copy (a pet too tall for a 16:9 slice of its
// room is shown whole, never cut).
// Everything is in fractions: a box in the picture is [u0, v0, u1, v1] of its width and height; in the frame [x0, y0, x1, y1].

export const PIC_AR = 2106 / 1614;   // every take's picture (the lab's stage, 702 x 538 css px)
const INS = 0.012;                   // cover() trims 1.2% of the picture's width off every edge (the stage's own border)

/** the source window of a box `bw` x `bh` px at zoom z, in picture fractions: [width, height] (and the trimmed picture) */
function window(z, boxAR) {
  const iw = 1 - 2 * INS, ih = 1 - 2 * INS * PIC_AR;       // the trimmed picture, as fractions of its width and height
  // at z 1 the window covers the box's shape: as wide as the picture, or as tall
  let sw = iw, sh = (iw * PIC_AR) / boxAR;                  // sh in height fractions: (iw * W) / ar / H
  if (sh > ih) { sh = ih; sw = (ih / PIC_AR) * boxAR; }
  return { sw: sw / z, sh: sh / z, iw, ih, insX: INS, insY: INS * PIC_AR };
}
const clampR = (x, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), x));

/** the source window's left and top (picture fractions) for zoom z and centre (fx, fy): cover()'s own rule */
export function sourceRect(z, fx, fy, boxAR) {
  const w = window(z, boxAR);
  const sx = w.insX + clampR(w.iw * fx - w.sw / 2, 0, w.iw - w.sw);
  const sy = w.insY + clampR(w.ih * fy - w.sh / 2, 0, w.ih - w.sh);
  return { sx, sy, sw: w.sw, sh: w.sh, ...w };
}
/** a picture box mapped into the frame box (fractions of it) */
export function toFrame(b, z, fx, fy, boxAR) {
  const r = sourceRect(z, fx, fy, boxAR);
  return [(b[0] - r.sx) / r.sw, (b[1] - r.sy) / r.sh, (b[2] - r.sx) / r.sw, (b[3] - r.sy) / r.sh];
}
/** the (fx, fy) that puts picture point (u, v) at frame point (X, Y) at zoom z, before cover()'s clamp */
function centreFor(z, u, v, X, Y, boxAR) {
  const w = window(z, boxAR);
  // sx = insX + iw*fx - sw/2 = u - X*sw  =>  fx = (u - X*sw - insX + sw/2) / iw
  return [(u - X * w.sw - w.insX + w.sw / 2) / w.iw, (v - Y * w.sh - w.insY + w.sh / 2) / w.ih];
}

/**
 * The zoom and centre that show picture box `b` whole inside `safe` (frame fractions), filling `fill` of the frame's
 * height if it can, its middle at (`at`, `ay`) of the safe rect (0..1 across it) when the picture allows. Returns
 * { zoom, focus, frame } where frame is where `b` lands. Never cuts `b`: it zooms out (below 1 if need be) until it fits.
 */
export function solve(b, { boxAR = 16 / 9, safe = [0.04, 0.05, 0.96, 0.95], fill = 0.86, at = 0.5, ay = 0.5, zmin = 0.5, zmax = 6 } = {}) {
  const bw = b[2] - b[0], bh = b[3] - b[1];
  const [X0, Y0, X1, Y1] = safe;
  const w1 = window(1, boxAR);
  // the zoom that fills, no more than the safe rect allows either way; then down from there to the first that fits
  const top = Math.max(zmin, Math.min(zmax, (fill * w1.sh) / bh, ((Y1 - Y0) * w1.sh) / bh, ((X1 - X0) * w1.sw) / bw));
  for (let z = top; z >= zmin - 1e-9; z = z > zmin ? Math.max(zmin, z * 0.99) : zmin - 1) {
    const w = window(z, boxAR);
    // where the box's middle should land, kept so the whole box is inside the safe rect
    const fw = bw / w.sw, fh = bh / w.sh;
    if (fw > X1 - X0 + 1e-9 || fh > Y1 - Y0 + 1e-9) continue;
    const X = Math.min(X1 - fw / 2, Math.max(X0 + fw / 2, X0 + (X1 - X0) * at));
    const Y = Math.min(Y1 - fh / 2, Math.max(Y0 + fh / 2, Y0 + (Y1 - Y0) * ay));
    // the window's left/top that does it, then the range the box allows, then cover()'s own clamp
    const want = { x: (b[0] + b[2]) / 2 - X * w.sw, y: (b[1] + b[3]) / 2 - Y * w.sh };
    const okX = [b[2] - X1 * w.sw, b[0] - X0 * w.sw], okY = [b[3] - Y1 * w.sh, b[1] - Y0 * w.sh];
    const cl = { x: [w.insX + Math.min(0, w.iw - w.sw), w.insX + Math.max(0, w.iw - w.sw)], y: [w.insY + Math.min(0, w.ih - w.sh), w.insY + Math.max(0, w.ih - w.sh)] };
    const lo = { x: Math.max(okX[0], cl.x[0]), y: Math.max(okY[0], cl.y[0]) }, hi = { x: Math.min(okX[1], cl.x[1]), y: Math.min(okY[1], cl.y[1]) };
    if (lo.x > hi.x + 1e-9 || lo.y > hi.y + 1e-9) continue;
    const sx = Math.min(hi.x, Math.max(lo.x, want.x)), sy = Math.min(hi.y, Math.max(lo.y, want.y));
    const focus = [(sx - w.insX + w.sw / 2) / w.iw, (sy - w.insY + w.sh / 2) / w.ih];
    return { zoom: z, focus, frame: toFrame(b, z, focus[0], focus[1], boxAR) };
  }
  throw new Error(`cannot fit box ${b.map((v) => v.toFixed(3))} in ${safe} at zoom ${zmin}..${zmax}`);
}
export { centreFor };
