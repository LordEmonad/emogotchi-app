/**
 * Emonad's shoulders as a pet (LAB ONLY): redrawn every frame from where each arm is.
 *
 * His tee's sleeves turn with his arms, and the piece of shirt between the sleeve's root and the body (the shoulder line
 * over the top, the armpit underneath) has to follow, or a raised arm leaves a square block at the shoulder and a step
 * at the armpit. His standalone rig (apps/web/src/emonad/rig.ts shoulderPath, armpitPath) draws that piece every frame
 * from data measured on the turnaround sheet; this is the same arithmetic on his pet drawing: emonadgotchi.py writes each
 * shoulder piece (#egshoulderL / R, in his drawing's units inside #body) with its data, and here the arm's turn relative
 * to the body, read off the arm group's own computed transform, takes the sleeve's root (T-I) where the arm has gone.
 * At rest it is the drawing as built.
 *
 * Every rig on the page shares ONE frame loop that reads every arm first and then writes every shoulder (a street of
 * Emonads in Emotown: a read after a write would force the browser to work its styles out again, once per pet).
 */

type V2 = [number, number];
type Shoulder = { root: Element; path: SVGPathElement; side: 'L' | 'R'; arm: Element; N: V2; tN: V2; T: V2; tT: V2; I: V2; tI: V2; A: V2; tA: V2; a: number; b: number; last: string; born: number };

const K = 0.3, CX = 100, FLOOR = 212;            // his drawing's units -> the pet's view (emonadgotchi.py)
const PIVOT: Record<'L' | 'R', V2> = { L: [81.634, 89.624], R: [118.198, 89.624] };   // the shoulders (emonadgotchi.css)
const D2R = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth01 = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

const ALL = new Set<Shoulder>();
let running = false;
/** The shared loop: every arm read, then every changed shoulder written; a rig that has left the page drops out (one
 *  that is not on the page yet, the first frame after it is made, waits a second for it). */
function frame() {
  const now = performance.now();
  const todo: Shoulder[] = [];
  for (const sh of ALL) {
    if (!sh.root.isConnected) { if (now - sh.born > 1000) ALL.delete(sh); continue; }
    const t = getComputedStyle(sh.arm).transform;
    if (t !== sh.last) { sh.last = t; todo.push(sh); }
  }
  for (const sh of todo) sh.path.setAttribute('d', shoulderPath(sh, relOf(sh.last, PIVOT[sh.side])));
  if (ALL.size) requestAnimationFrame(frame); else running = false;
}

/** Starts redrawing the shoulders of the drawing in `root`; stops by itself once `root` has left the page. */
export function startShoulders(root: Element) {
  for (const side of ['L', 'R'] as const) {
    const path = root.querySelector<SVGPathElement>(`#egshoulder${side}`);
    const arm = root.querySelector(`#leg${side}`);
    if (!path || !arm || !path.dataset.shoulder) continue;
    const d = JSON.parse(path.dataset.shoulder);
    ALL.add({ root, path, side, arm, N: d.N, tN: d.tN, T: d.T, tT: d.tT, I: d.I, tI: d.tI, A: d.A, tA: d.tA, a: d.a, b: d.b, last: '', born: performance.now() });
  }
  if (ALL.size && !running) { running = true; requestAnimationFrame(frame); }
}

/** The arm's transform (a CSS matrix about its pivot, in view units) as a matrix in his drawing's units. */
function relOf(t: string, o: V2): number[] {
  if (!t || t === 'none') return [1, 0, 0, 1, 0, 0];
  const m = new DOMMatrix(t);
  // in the view: p -> o + L (p - o) + (e, f); in his units P -> (p - (CX, FLOOR)) / K with p = (CX, FLOOR) + K P
  const ox = (o[0] - CX) / K, oy = (o[1] - FLOOR) / K;
  const e = m.e / K, f = m.f / K;
  return [m.a, m.b, m.c, m.d, ox - (m.a * ox + m.c * oy) + e, oy - (m.b * ox + m.d * oy) + f];
}

const at = (r: number[], x: number, y: number): V2 => [r[0]! * x + r[2]! * y + r[4]!, r[1]! * x + r[3]! * y + r[5]!];

/** The standalone rig's shoulderPath: the piece of shirt from N along the shoulder line into the top of the sleeve
 *  wherever the arm has taken it, along the sleeve's root, round the armpit to the shirt's side, and back through the body. */
function shoulderPath(sh: Shoulder, rel: number[]): string {
  const T = at(rel, sh.T[0], sh.T[1]), I = at(rel, sh.I[0], sh.I[1]);
  const tT: V2 = [rel[0]! * sh.tT[0] + rel[2]! * sh.tT[1], rel[1]! * sh.tT[0] + rel[3]! * sh.tT[1]];
  const tI: V2 = [rel[0]! * sh.tI[0] + rel[2]! * sh.tI[1], rel[1]! * sh.tI[0] + rel[3]! * sh.tI[1]];
  const { N, A, tA } = sh;
  const inward = sh.side === 'L' ? 1 : -1;
  const dist = Math.hypot(T[0] - N[0], T[1] - N[1]);
  const turn = Math.abs(Math.atan2(rel[1]!, rel[0]!)) / D2R;
  const k = clamp((turn - 20) / 60, 0, 1), kk = k * k * (3 - 2 * k);
  const dN = dist > 1e-6 ? [(T[0] - N[0]) / dist, (T[1] - N[1]) / dist] : sh.tN;
  let tN0 = sh.tN[0] * (1 - kk) + dN[0]! * kk, tN1 = sh.tN[1] * (1 - kk) + dN[1]! * kk;
  const tl = Math.hypot(tN0, tN1) || 1; tN0 /= tl; tN1 /= tl;
  const ha = sh.a * (1 - kk) + 0.3 * kk, hb = sh.b * (1 - kk) + 0.5 * kk;
  const P = (x: number, y: number) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
  return `M${P(N[0], N[1])}C${P(N[0] + tN0 * ha * dist, N[1] + tN1 * ha * dist)} ${P(T[0] - tT[0] * hb * dist, T[1] - tT[1] * hb * dist)} ${P(T[0], T[1])}`
    + `L${P(T[0] + tT[0] * 3, T[1] + tT[1] * 3)}L${P(I[0] + tI[0] * 3, I[1] + tI[1] * 3)}L${P(I[0], I[1])}`
    + armpitPath(I, tI, A, tA, P, inward, 0.8 * Math.hypot(N[0] - A[0], N[1] - A[1]))
    + `L${P(A[0] + inward * 4, A[1])}L${P(N[0] + inward * 4, N[1] + 4)}Z`;
}

/** The standalone rig's armpitPath: from the sleeve's underside corner I to the shirt's side at A, the two edges run on
 *  until they meet and the corner is rounded, the more the arm is raised. */
function armpitPath(I: V2, tT: V2, A: V2, tA: V2, P: (x: number, y: number) => string, inward = 0, reach = 10): string {
  const cosA = tA[0] * tT[0] + tA[1] * tT[1];
  const open = Math.acos(clamp(cosA, -1, 1)) / D2R;
  const kc = clamp((open - 20) / 30, 0, 1), cap = 10 + (Math.max(10, reach) - 10) * kc * kc * (3 - 2 * kc);
  const det = -tA[0] * tT[1] + tA[1] * tT[0];
  let s = 10;
  if (Math.abs(det) > 1e-6) {
    const rx = I[0] - A[0], ry = I[1] - A[1];
    const ss = (rx * tT[1] - ry * tT[0]) / det;
    s = Math.min(cap, 10 + (ss - 10) * smooth01(-26, -6, ss));
  }
  const X = [A[0] - tA[0] * s, A[1] - tA[1] * s];
  const li = Math.hypot(X[0]! - I[0], X[1]! - I[1]);
  const k = clamp((open - 25) / 75, 0, 1), kk = k * k * (3 - 2 * k);
  const rr = 3 + 9 * kk;
  const r = Math.min(rr, Math.max(0, s) + 10, Math.max(0.45 * li, rr * 0.999));
  const p1 = [X[0]! + tT[0] * r, X[1]! + tT[1] * r];
  const p2 = [X[0]! + tA[0] * r, X[1]! + tA[1] * r];
  if (s - r > 0) return `L${P(p1[0]!, p1[1]!)}Q${P(X[0]!, X[1]!)} ${P(p2[0]!, p2[1]!)}L${P(A[0], A[1])}`;
  return `L${P(p1[0]!, p1[1]!)}Q${P(X[0]!, X[1]!)} ${P(p2[0]!, p2[1]!)}L${P(p2[0]! + inward * 4, p2[1]!)}L${P(A[0] + inward * 4, A[1])}L${P(A[0], A[1])}`;
}
