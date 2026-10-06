/**
 * The in-betweens of Emonad's turn (see packages/pet/design/emonad_morph.py): for each pair of neighbouring drawings,
 * a smooth map from where a point of a piece of him is in one drawing to where it is in the other. The rig bends the
 * drawing shown towards the halfway shape of its pair as he turns, so the two drawings have the same outline in the
 * same place when one gives way to the other. Here: reading the maps, evaluating them, and rewriting a path's points.
 */

/** A thin-plate spline as the build writes it (fitted in units of `sc`): centres, their weights, the affine part. */
export type Spline = { c: number[][]; w: number[][]; a: number[][] };
export type GroupMap = Spline & { kind: 'half' | 'full' };
export type EyeGeom = Record<'L' | 'R' | 'cu' | 'cl' | 'cc' | 'P', [number, number]>;
export type ShoulderGeom = { N: [number, number]; tN: [number, number]; T: [number, number]; tT: [number, number]; I: [number, number];
  tI: [number, number]; A: [number, number]; tA: [number, number]; a: number; b: number };
export type PairMap = { groups: Record<string, GroupMap>; parts: Record<string, string>; eyes: Record<string, EyeGeom>; shoulders: Record<string, ShoulderGeom> };
export type MorphData = { sc: number; maps: Record<string, PairMap> };

export const pairKey = (a: string, b: string, rm: number) => `${a}>${b}${rm > 0 ? '+' : '-'}`;

/** A path's points and how to write it again: the commands with the count of numbers after each. */
export type PathTpl = { cmds: string; counts: Uint16Array; nums: Float64Array };

const TOK = /[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?/g;
export function parsePath(d: string): PathTpl | null {
  const toks = d.match(TOK);
  if (!toks) return null;
  let cmds = '';
  const counts: number[] = [], nums: number[] = [];
  let n = -1;
  for (const t of toks) {
    const c = t.charCodeAt(0);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
      // (only absolute commands: the build writes no others; a relative one would be bent wrongly, so refuse it)
      if (t !== t.toUpperCase()) return null;
      cmds += t; counts.push(0); n++;
    } else { nums.push(+t); counts[n]!++; }
  }
  return { cmds, counts: Uint16Array.from(counts), nums: Float64Array.from(nums) };
}

/** A lighter copy of a path for while it is being bent (a turn, a fraction of a second): runs of straight segments thinned
 *  to within `tol` units (Douglas-Peucker), curves kept. Returns the copy's commands and which of the full path's numbers
 *  it writes, in order. As drawn (not turning) the full path is written back. */
export function thinPath(t: PathTpl, tol: number): { tpl: PathTpl; idx: Uint32Array } {
  const cmds: string[] = [], counts: number[] = [], idx: number[] = [];
  let j = 0;
  const N = t.cmds.length;
  let i = 0;
  while (i < N) {
    const c = t.cmds[i]!, n = t.counts[i]!;
    if (c === 'L' && n === 2) {
      // a run of L's: from the point before it (the end of the last command) to its last point
      let e = i;
      while (e < N && t.cmds[e] === 'L' && t.counts[e] === 2) e++;
      const startIdx = j - 2;   // the previous point's x
      const pts: number[] = [];
      if (startIdx >= 0) pts.push(startIdx);
      for (let q = i; q < e; q++) pts.push(j + 2 * (q - i));
      const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
      const stack: [number, number][] = [[0, pts.length - 1]];
      while (stack.length) {
        const [a, b] = stack.pop()!;
        if (b - a < 2) continue;
        const ax = t.nums[pts[a]!]!, ay = t.nums[pts[a]! + 1]!, bx = t.nums[pts[b]!]!, by = t.nums[pts[b]! + 1]!;
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
        let worst = -1, wi = -1;
        for (let q = a + 1; q < b; q++) {
          const px = t.nums[pts[q]!]!, py = t.nums[pts[q]! + 1]!;
          const dd = Math.abs((px - ax) * dy - (py - ay) * dx) / L;
          if (dd > worst) { worst = dd; wi = q; }
        }
        if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
      }
      for (let q = startIdx >= 0 ? 1 : 0; q < pts.length; q++) if (keep[q]) { cmds.push('L'); counts.push(2); idx.push(pts[q]!, pts[q]! + 1); }
      j += 2 * (e - i);
      i = e;
      continue;
    }
    cmds.push(c); counts.push(n);
    for (let q = 0; q < n; q++) idx.push(j + q);
    j += n; i++;
  }
  const nums = Float64Array.from(idx, (x) => t.nums[x]!);
  return { tpl: { cmds: cmds.join(''), counts: Uint16Array.from(counts), nums }, idx: Uint32Array.from(idx) };
}

// (written byte by byte, to hundredths: building it as a string of numbers was most of a turn's cost on a phone)
let buf = new Uint8Array(1 << 16);
const dec = new TextDecoder();
export function writePath(t: PathTpl, xy: Float64Array): string {
  const need = xy.length * 12 + t.cmds.length + 16;
  if (buf.length < need) buf = new Uint8Array(need * 2);
  const b = buf;
  let w = 0, j = 0;
  for (let i = 0; i < t.cmds.length; i++) {
    b[w++] = t.cmds.charCodeAt(i);
    const n = t.counts[i]!;
    for (let q = 0; q < n; q++) {
      if (q) b[w++] = 32;
      let v = Math.round(xy[j++]! * 100);
      if (v < 0) { b[w++] = 45; v = -v; }
      let ip = Math.floor(v / 100);
      const fp = v - ip * 100;
      if (ip >= 10000) { const s = String(ip); for (let c = 0; c < s.length; c++) b[w++] = s.charCodeAt(c); }
      else {
        if (ip >= 1000) { b[w++] = 48 + Math.floor(ip / 1000); ip %= 1000; b[w++] = 48 + Math.floor(ip / 100); ip %= 100; b[w++] = 48 + Math.floor(ip / 10); b[w++] = 48 + (ip % 10); }
        else if (ip >= 100) { b[w++] = 48 + Math.floor(ip / 100); ip %= 100; b[w++] = 48 + Math.floor(ip / 10); b[w++] = 48 + (ip % 10); }
        else if (ip >= 10) { b[w++] = 48 + Math.floor(ip / 10); b[w++] = 48 + (ip % 10); }
        else b[w++] = 48 + ip;
      }
      if (fp) { b[w++] = 46; b[w++] = 48 + Math.floor(fp / 10); if (fp % 10) b[w++] = 48 + (fp % 10); }
    }
  }
  return dec.decode(b.subarray(0, w));
}

/** The spline at many points (xs, ys flat), through a grid over their box (the spline is smooth: bilinear between nodes a
 *  few units apart is within a hundredth of a unit, at a fraction of the cost of the spline at every point). */
export function splineAt(T: Spline, sc: number, xs: Float64Array, ys: Float64Array, outX: Float64Array, outY: Float64Array) {
  const n = xs.length;
  if (!n) return;
  const C = T.c, Wt = T.w, A = T.a;
  const ev = (x: number, y: number, o: number[]) => {
    const px = x / sc, py = y / sc;
    let fx = A[0]![0]! + A[1]![0]! * px + A[2]![0]! * py, fy = A[0]![1]! + A[1]![1]! * px + A[2]![1]! * py;
    for (let i = 0; i < C.length; i++) {
      const dx = px - C[i]![0]!, dy = py - C[i]![1]!, rr = dx * dx + dy * dy;
      if (rr > 1e-12) { const u = 0.5 * rr * Math.log(rr); fx += Wt[i]![0]! * u; fy += Wt[i]![1]! * u; }
    }
    o[0] = fx * sc; o[1] = fy * sc;
  };
  const o = [0, 0];
  if (!C.length || n < 64) {
    for (let i = 0; i < n; i++) { ev(xs[i]!, ys[i]!, o); outX[i] = o[0]!; outY[i] = o[1]!; }
    return;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = xs[i]!, y = ys[i]!; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const H = 2.5;
  const nx = Math.max(2, Math.ceil((x1 - x0) / H) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / H) + 1);
  const gx = new Float64Array(nx * ny), gy = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { ev(x0 + i * H, y0 + j * H, o); gx[j * nx + i] = o[0]!; gy[j * nx + i] = o[1]!; }
  for (let q = 0; q < n; q++) {
    const u = (xs[q]! - x0) / H, v = (ys[q]! - y0) / H;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(u))), j = Math.min(ny - 2, Math.max(0, Math.floor(v)));
    const fu = u - i, fv = v - j, k = j * nx + i;
    outX[q] = (gx[k]! * (1 - fu) + gx[k + 1]! * fu) * (1 - fv) + (gx[k + nx]! * (1 - fu) + gx[k + nx + 1]! * fu) * fv;
    outY[q] = (gy[k]! * (1 - fu) + gy[k + 1]! * fu) * (1 - fv) + (gy[k + nx]! * (1 - fu) + gy[k + nx + 1]! * fu) * fv;
  }
}

/** The spline at one point. */
export function splineAt1(T: Spline, sc: number, x: number, y: number): [number, number] {
  const ox = new Float64Array(1), oy = new Float64Array(1);
  splineAt(T, sc, Float64Array.of(x), Float64Array.of(y), ox, oy);
  return [ox[0]!, oy[0]!];
}
