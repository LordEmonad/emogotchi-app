// The trailer's compositor: runs in Chrome (opened by render.mjs), draws frame n of the timeline on a 1920x1080 canvas
// from the filmed takes plus the type and frames laid over them, and encodes the frames with WebCodecs into an MP4.
// Nothing here is timed by a clock: frame n is a pure function of n, so the render is exact however slow it runs.
const W = 1920, H = 1080, FPS = 60;
const INK = '#F8F8FF', INK2 = 'rgba(248,248,255,0.66)', INK3 = 'rgba(248,248,255,0.45)', PINK = '#E84D7F', LILAC = '#B894D8';
const FONT = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { alpha: false });
ctx.imageSmoothingQuality = 'high';

let T = null;          // { fps, frames, clips: [...], takes: { name: { frames, marks } } }

// ---------- frames of the takes ----------
const cache = new Map();   // key -> Promise<ImageBitmap>
const order = [];
const pad = (n) => String(n).padStart(5, '0');
function frameOf(take, i) {
  const meta = T.takes[take];
  if (!meta) throw new Error(`timeline names a take that was not filmed: ${take}`);
  const idx = Math.max(0, Math.min(meta.frames - 1, i));
  const key = `${take}/${idx}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/raw/${take}/f-${pad(idx)}.png`).then((r) => { if (!r.ok) throw new Error(`missing ${key}`); return r.blob(); }).then((b) => createImageBitmap(b));
    cache.set(key, p); order.push(key);
    while (order.length > 90) { const old = order.shift(); const q = cache.get(old); cache.delete(old); void q.then((b) => b.close()).catch(() => {}); }
  }
  return p;
}

const pics = new Map();
/** a picture out of the site's build */
function pic(src) {
  let p = pics.get(src);
  if (!p) { p = fetch(`/dist/${src}`).then((r) => { if (!r.ok) throw new Error(`missing ${src}`); return r.blob(); }).then((b) => createImageBitmap(b)); pics.set(src, p); }
  return p;
}

// ---------- small tools ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);
/** 0..1 for something entering `delay` ms after the clip starts, over `dur` ms */
const enter = (ms, delay = 0, dur = 340) => easeOut(clamp((ms - delay) / dur));
const lerp = (a, b, p) => a + (b - a) * p;

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function grad(x0, x1) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#ff7aa6'); g.addColorStop(0.45, '#E84D7F'); g.addColorStop(1, '#B894D8'); return g; }
function setFont(size, weight = 700, tracking = -0.03) { ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = `${(size * tracking).toFixed(2)}px`; }
function widthOf(str, size, weight, tracking) { setFont(size, weight, tracking); return ctx.measureText(str).width; }
/** the largest size up to `size` at which every line fits `max` */
function fit(lines, size, max, weight = 700, tracking = -0.03) {
  let s = size;
  while (s > 20 && Math.max(...lines.map((l) => widthOf(l.replace(/^\*/, ''), s, weight, tracking))) > max) s -= 2;
  return s;
}
/** one line of type; a leading * paints it in the site's pink-to-lilac gradient */
function line(str, x, y, { size, weight = 700, tracking = -0.03, color = INK, align = 'left', alpha = 1, dy = 0, glow = false }) {
  const g = str.startsWith('*');
  const s = g ? str.slice(1) : str;
  setFont(size, weight, tracking);
  const w = ctx.measureText(s).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (glow || g) { ctx.shadowColor = g ? 'rgba(232,77,127,0.35)' : 'rgba(0,0,0,0.6)'; ctx.shadowBlur = g ? 34 : 18; }
  ctx.fillStyle = g ? grad(x0, x0 + w) : color;
  ctx.fillText(s, x0, y + dy);
  ctx.restore();
  return w;
}
function heart(cx, cy, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy); ctx.scale(s / 24, s / 24); ctx.translate(-12, -12);
  const g = ctx.createLinearGradient(2, 3, 22, 21); g.addColorStop(0, '#ff7aa6'); g.addColorStop(1, '#E84D7F');
  ctx.fillStyle = g;
  ctx.fill(new Path2D('M12 21.2l-1.3-1.2C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.5 2.8c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.8 22 5.2 22 8.3c0 3.8-3.4 6.9-8.7 11.7L12 21.2z'));
  ctx.restore();
}
/** the small capital tag the site puts over a headline */
function kicker(str, x, y, { align = 'left', alpha = 1, dy = 0 } = {}) {
  setFont(22, 600, 0.12);
  const tw = ctx.measureText(str).width;
  const w = tw + 78, h = 50;
  const x0 = align === 'center' ? x - w / 2 : x;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.translate(0, dy);
  rr(x0, y - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(42,27,48,0.85)'; ctx.fill();
  ctx.strokeStyle = 'rgba(184,148,216,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  heart(x0 + 28, y + 1, 20);
  ctx.fillStyle = '#EAC6EA'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  setFont(22, 600, 0.12);
  ctx.fillText(str, x0 + 48, y + 1.5);
  ctx.restore();
  return w;
}
/** a label pill */
function chip(str, cx, cy, { alpha = 1, size = 30, dy = 0 } = {}) {
  setFont(size, 600, -0.01);
  const tw = ctx.measureText(str).width;
  const w = tw + size * 1.7, h = size * 1.95;
  ctx.save();
  ctx.globalAlpha *= alpha; ctx.translate(0, dy);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  rr(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(18,10,26,0.9)'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(184,148,216,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  setFont(size, 600, -0.01);
  ctx.fillText(str, cx, cy + 1.5);
  ctx.restore();
}

function backdrop(tint = 0) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.28, H * 0.18, 0, W * 0.28, H * 0.18, W * 0.62);
  g.addColorStop(0, `rgba(96,48,150,${0.34 + tint})`); g.addColorStop(1, 'rgba(96,48,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.82, H * 0.95, 0, W * 0.82, H * 0.95, W * 0.5);
  g.addColorStop(0, 'rgba(232,77,127,0.16)'); g.addColorStop(1, 'rgba(232,77,127,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/** a block of type: kicker, headline lines, sub lines; anchored by its vertical middle */
function block(c, ms, x, cy, max, { align = 'left', size = 104, subSize = 34 } = {}) {
  const lines = c.title ? [].concat(c.title) : [];
  const subs = c.sub ? [].concat(c.sub) : [];
  const s = fit(lines, c.size ?? size, max);
  const lh = s * 1.02;
  const sh = subSize * 1.42;
  const kh = c.kicker ? 86 : 0;
  const total = kh + lines.length * lh + (subs.length ? 26 + subs.length * sh : 0);
  let y = cy - total / 2;
  let i = 0;
  const step = c.stagger ?? 90;
  const out = c.textOut && c._left != null ? easeOut(clamp(c._left / 240)) : 1;
  ctx.save(); ctx.globalAlpha *= out;
  if (c.kicker) { const p = enter(ms, 0); kicker(c.kicker, x, y + 25, { align, alpha: p, dy: (1 - p) * 22 }); y += kh; i += 1; }
  for (const l of lines) { const p = enter(ms, i * step); y += lh; line(l, x, y - s * 0.2, { size: s, align, alpha: p, dy: (1 - p) * 30 }); i += 1; }
  if (subs.length) y += 26;
  for (const l of subs) { const p = enter(ms, i * step + 60); y += sh; line(l, x, y - subSize * 0.3, { size: subSize, weight: 400, tracking: -0.005, color: INK2, align, alpha: p, dy: (1 - p) * 20 }); i += 1; }
  ctx.restore();
}

// ---------- the layouts ----------
/** type alone */
function drawCard(c, ms) {
  backdrop(0.06);
  if (c.logo) {
    // the wordmark, as the site's header draws it
    const p = enter(ms, 0, 420);
    const size = c.size ?? 150;
    const w = widthOf('Emogotchi', size, 700, -0.035);
    const hw = size * 0.62;
    const x0 = W / 2 - (w + hw + size * 0.2) / 2;
    const y = (c.sub ? H / 2 - 20 : H / 2 + size * 0.3);
    heart(x0 + hw / 2, y - size * 0.34, hw * (0.86 + 0.14 * p), p);
    line('Emogotchi', x0 + hw + size * 0.2, y, { size, tracking: -0.035, alpha: p, dy: (1 - p) * 26 });
    const subs = c.sub ? [].concat(c.sub) : [];
    subs.forEach((l, i) => { const q = enter(ms, 220 + i * 110); line(l, W / 2, y + 96 + i * 56, { size: 40, weight: 400, tracking: -0.005, color: INK2, align: 'center', alpha: q, dy: (1 - q) * 20 }); });
    return;
  }
  block(c, ms, W / 2, H / 2, W - 320, { align: 'center', size: c.size ?? 132, subSize: 40 });
}

/** a take filling the frame */
async function drawFull(c, ms, f) {
  const img = await frameOf(c.take, f);
  if ((c.title || c.sub) && !c.over) {
    // the page in a window with its caption on a line of its own underneath: nothing of the page is covered
    backdrop(0.04);
    const k = 0.875;
    const w = W * k, h = H * k, x = (W - w) / 2, y = 16;
    const punch = 1 + 0.012 * (1 - easeOut(clamp(ms / 260)));
    ctx.save();
    ctx.translate(W / 2, y + h / 2); ctx.scale(punch, punch); ctx.translate(-W / 2, -(y + h / 2));
    ctx.save(); ctx.shadowColor = 'rgba(132,70,210,0.42)'; ctx.shadowBlur = 90; rr(x, y, w, h, 26); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ctx.save(); rr(x, y, w, h, 26); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
    rr(x + 1, y + 1, w - 2, h - 2, 25); ctx.strokeStyle = 'rgba(184,148,216,0.38)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    const title = c.title ? [].concat(c.title).join(' ') : '';
    const sub = c.sub ? [].concat(c.sub).join(' ') : '';
    const ts = 52, ss = 38, gap = title && sub ? 32 : 0;
    const tw = title ? widthOf(title.replace(/\*/g, ''), ts, 700, -0.02) : 0;
    const sw2 = sub ? widthOf(sub, ss, 400, -0.005) : 0;
    const cy = y + h + (H - y - h) / 2 + 15;
    let cx = W / 2 - (tw + gap + sw2) / 2;
    const q = enter(ms, 60);
    if (title) { line(title, cx, cy, { size: ts, tracking: -0.02, alpha: q, dy: (1 - q) * 14 }); cx += tw + gap; }
    if (sub) { const q2 = enter(ms, 160); line(sub, cx, cy - 1, { size: ss, weight: 400, tracking: -0.005, color: INK2, alpha: q2, dy: (1 - q2) * 14 }); }
    return;
  }
  const z0 = c.zoom?.[0] ?? 1, z1 = c.zoom?.[1] ?? 1;
  const p = c.zoom ? easeInOut(clamp(ms / (c.lenMs || 1))) : 0;
  const z = lerp(z0, z1, c.zoomLinear ? clamp(ms / c.lenMs) : p);
  const [fx, fy] = c.focus ?? [0.5, 0.5];
  const sw = img.width / z, sh = img.height / z;
  ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, 0, 0, W, H);
  if (c.title || c.sub || c.kicker) {
    const side = c.side ?? 'left';
    const bottom = c.pos !== 'top';
    const g = ctx.createLinearGradient(0, bottom ? H : 0, 0, bottom ? H - 520 : 520);
    g.addColorStop(0, 'rgba(6,2,12,0.97)'); g.addColorStop(bottom ? 0.55 : 0.5, bottom ? 'rgba(6,2,12,0.6)' : 'rgba(6,2,12,0.965)'); g.addColorStop(1, 'rgba(6,2,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, bottom ? H - 520 : 0, W, 520);
    const lines = c.title ? [].concat(c.title) : [];
    const subs = c.sub ? [].concat(c.sub) : [];
    const size = fit(lines, c.size ?? 84, W - 240);
    const x = side === 'center' ? W / 2 : side === 'right' ? W - 110 : 110;
    const align = side;
    const total = lines.length * size * 1.04 + (subs.length ? 14 + subs.length * 48 : 0);
    let y = bottom ? H - 84 - total : 96;
    let i = 0;
    for (const l of lines) { const q = enter(ms, 80 + i * 90); y += size * 1.04; line(l, x, y - size * 0.22, { size, align, alpha: q, dy: (1 - q) * 28, glow: true }); i += 1; }
    if (subs.length) y += 14;
    for (const l of subs) { const q = enter(ms, 140 + i * 90); y += 48; line(l, x, y - 12, { size: 34, weight: 400, tracking: -0.005, color: 'rgba(248,248,255,0.82)', align, alpha: q, dy: (1 - q) * 18, glow: true }); i += 1; }
  }
  if (c.chip) { const q = enter(ms, 60); chip(c.chip, c.chipAt?.[0] ?? W / 2, c.chipAt?.[1] ?? H - 110, { alpha: q, dy: (1 - q) * 16, size: 34 }); }
}

/** a pet's room as a card, type beside it (or the card alone, centred, with a label) */
async function drawRoom(c, ms, f) {
  backdrop();
  const img = await frameOf(c.take, f);
  // crop: [x0, y0, x1, y1] as fractions of the picture, for a card that shows one part of a page
  const crop = c.crop ?? null;
  const ar = crop ? ((crop[2] - crop[0]) * img.width) / ((crop[3] - crop[1]) * img.height) : img.width / img.height;
  const solo = !(c.title || c.kicker || c.sub);
  const h = solo ? 960 : (c.h ?? 860);
  const w = h * ar;
  const right = (c.side ?? 'right') === 'right';
  const x = solo ? (W - w) / 2 : right ? W - 84 - w : 84;
  const y = (H - h) / 2;
  const punch = 1 + 0.03 * (1 - easeOut(clamp(ms / 260)));
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(punch, punch); ctx.translate(-(x + w / 2), -(y + h / 2));
  ctx.save();
  ctx.shadowColor = 'rgba(132,70,210,0.5)'; ctx.shadowBlur = 110;
  rr(x, y, w, h, 44); ctx.fillStyle = '#1a0f2e'; ctx.fill();
  ctx.restore();
  ctx.save();
  rr(x, y, w, h, 44); ctx.clip();
  // a hair inside the capture's own rounded corners
  if (crop) ctx.drawImage(img, crop[0] * img.width, crop[1] * img.height, (crop[2] - crop[0]) * img.width, (crop[3] - crop[1]) * img.height, x, y, w, h);
  else {
    const z = c.zoom ?? 1;
    const [fx, fy] = c.focus ?? [0.5, 1];
    const sw = (img.width - 12) / z, sh = (img.height - 12) / z;
    ctx.drawImage(img, 6 + (img.width - 12 - sw) * fx, 6 + (img.height - 12 - sh) * fy, sw, sh, x, y, w, h);
  }
  ctx.restore();
  rr(x + 1.5, y + 1.5, w - 3, h - 3, 43); ctx.strokeStyle = 'rgba(184,148,216,0.42)'; ctx.lineWidth = 3; ctx.stroke();
  if (c.chip) { const q = enter(ms, 40, 260); chip(c.chip, x + w / 2, y + h - 78, { alpha: q, dy: (1 - q) * 18, size: 36 }); }
  ctx.restore();
  if (!solo) {
    const colW = W - w - 84 - 96 - 70;
    block(c, ms, right ? 96 : W - 96 - colW, H / 2, colW, { size: c.size ?? 120, subSize: 40 });
  }
}

/** the pet page on a phone, type beside it: the whole device is in the frame, showing the top `vis` css px of the page */
async function drawPhone(c, ms, f) {
  backdrop();
  const img = await frameOf(c.take, f);
  const k = c.scale ?? 1.24;                         // css px of the page -> frame px
  const dpr = img.width / 430;
  const vis = c.vis ?? 772;
  const scroll = c.scroll ?? 0;
  const sw = 430 * k, bar = 54, b = 15;
  const sh = bar + vis * k;
  const right = (c.side ?? 'right') === 'right';
  const cx = right ? W - 190 - sw / 2 : 190 + sw / 2;
  const x = cx - sw / 2;
  const top = (H - sh) / 2;
  ctx.save();
  // the body
  ctx.save();
  ctx.shadowColor = 'rgba(132,70,210,0.45)'; ctx.shadowBlur = 120;
  rr(x - b, top - b, sw + 2 * b, sh + 2 * b, 74); ctx.fillStyle = '#0b0710'; ctx.fill();
  ctx.restore();
  rr(x - b, top - b, sw + 2 * b, sh + 2 * b, 74); ctx.strokeStyle = 'rgba(184,148,216,0.4)'; ctx.lineWidth = 3; ctx.stroke();
  // the screen
  ctx.save();
  rr(x, top, sw, sh, 60); ctx.clip();
  ctx.fillStyle = '#000'; ctx.fillRect(x, top, sw, sh);
  ctx.drawImage(img, 0, scroll * dpr, img.width, vis * dpr, x, top + bar, sw, vis * k);
  // the status bar
  ctx.fillStyle = '#000'; ctx.fillRect(x, top, sw, bar);
  rr(cx - 58, top + 13, 116, 32, 16); ctx.fillStyle = '#16101d'; ctx.fill();
  setFont(20, 600, 0); ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('9:41', x + 38, top + 30);
  for (let i = 0; i < 4; i += 1) { ctx.fillStyle = INK; ctx.fillRect(x + sw - 122 + i * 8, top + 37 - (i + 1) * 4.2, 5, (i + 1) * 4.2); }
  rr(x + sw - 76, top + 21, 36, 18, 6); ctx.strokeStyle = 'rgba(248,248,255,0.6)'; ctx.lineWidth = 1.6; ctx.stroke();
  rr(x + sw - 73, top + 24, 26, 12, 3.5); ctx.fillStyle = INK; ctx.fill();
  // a finger's press, where the take's own presses landed
  const marks = T.takes[c.take].marks ?? [];
  for (const m of marks) {
    const dt = (f / FPS) * 1000 - m.at;
    if (dt < -180 || dt > 520) continue;
    const px = x + m.x * k, py = top + bar + (m.y - scroll) * k;
    const p = clamp((dt + 180) / 700);
    ctx.beginPath(); ctx.arc(px, py, 24 + 42 * easeOut(p), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.30 * (1 - p)})`; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${dt < 120 ? 0.5 * clamp((dt + 180) / 120) : 0.5 * (1 - clamp((dt - 120) / 300))})`; ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  const colW = W - sw - 190 - 110 - 120;
  const tx = right ? 110 : W - 110 - colW;
  if (c.receipts) {
    // the type higher, and under it the take's own transactions as they happen (the hackathon demo)
    block(c, ms, tx, c.blockY ?? 330, colW, { size: c.size ?? 110, subSize: 38 });
    drawReceipts(c, ms, tx, c.receiptsY ?? 590, Math.min(colW, 860), f);
  } else block(c, ms, tx, H / 2, colW, { size: c.size ?? 128, subSize: 40 });
}

// ---------- the hackathon demo: real transactions on screen ----------
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
const GREEN = '#5BD38A';
const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '');
/**
 * What a take's transactions have done by take time `tms`, for a clip's `receipts`: [{ label, kind: 'tx', n }] names the
 * take's n-th sent transaction; { kind: 'drip' } the starter (sent by the server; arrived when the page first saw the
 * account hold MON). Each row: when it went, and when the page learned it was in a block (real latency: lib.mjs REALNET).
 */
function receiptRows(c, tms) {
  const txs = T.takes[c.take]?.txs ?? [];
  const sent = txs.filter((e) => e.kind === 'sent');
  const rows = [];
  for (const r of c.receipts) {
    let s = null, m = null;
    if (r.kind === 'drip') { s = txs.find((e) => e.kind === 'drip'); m = txs.find((e) => e.kind === 'funded' && (!r.address || e.address?.toLowerCase() === r.address.toLowerCase())); }
    else { s = sent[r.n ?? 0]; m = s ? txs.find((e) => e.kind === 'mined' && e.hash === s.hash) : null; }
    if (!s || tms < s.t) continue;
    rows.push({ label: r.label, hash: s.hash, took: m ? (m.t - s.t) / 1000 : null, done: !!m && tms >= m.t, age: tms - s.t, doneAge: m ? tms - m.t : -1 });
  }
  return rows.slice(-(c.keep ?? 4));
}
function drawReceipts(c, ms, x, y, w, f) {
  // the take's own time (from its frame, so a clip marked still or carry reads the same clock)
  const tms = f * 1000 / (T.takes[c.take]?.fps ?? FPS);
  const rows = receiptRows(c, tms);
  const carry = c.still || c.carry;   // carried on from the clip before: the list is already there
  const q0 = carry ? 1 : enter(ms, 120, 380);
  kicker(c.receiptsTitle ?? 'ON MONAD MAINNET', x, y, { alpha: q0, dy: (1 - q0) * 16 });
  const rh = 92, gap = 14;
  rows.forEach((r, i) => {
    const ry = y + 46 + i * (rh + gap);
    const p = carry && r.age > 400 ? 1 : easeOut(clamp(r.age / 320));
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(0, (1 - p) * 18);
    rr(x, ry, w, rh, 22); ctx.fillStyle = 'rgba(28,16,40,0.88)'; ctx.fill();
    ctx.strokeStyle = r.done ? 'rgba(91,211,138,0.45)' : 'rgba(184,148,216,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    // the state: a ring that turns while it waits, a tick once it is in a block
    const cx = x + 46, cy = ry + rh / 2;
    if (r.done) {
      const k = easeOut(clamp(r.doneAge / 260));
      ctx.beginPath(); ctx.arc(cx, cy, 20 * (0.7 + 0.3 * k), 0, Math.PI * 2); ctx.fillStyle = GREEN; ctx.fill();
      ctx.strokeStyle = '#0b1f12'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 8, cy + 1); ctx.lineTo(cx - 2, cy + 7); ctx.lineTo(cx + 9, cy - 6); ctx.stroke();
    } else {
      const a = (r.age / 1000) * Math.PI * 2.2;
      ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(184,148,216,0.25)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 17, a, a + Math.PI * 1.1); ctx.strokeStyle = PINK; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    }
    setFont(31, 700, -0.01); ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText(r.label, x + 86, ry + 40);
    ctx.font = `500 23px ${MONO}`; ctx.letterSpacing = '0px'; ctx.fillStyle = INK3;
    ctx.fillText(shortHash(r.hash), x + 86, ry + 72);
    ctx.textAlign = 'right';
    if (r.done) { setFont(28, 600, -0.005); ctx.fillStyle = GREEN; ctx.fillText(`on chain · ${r.took.toFixed(1)} s`, x + w - 30, ry + rh / 2 + 10); }
    else { setFont(28, 500, -0.005); ctx.fillStyle = INK2; ctx.fillText('sending…', x + w - 30, ry + rh / 2 + 10); }
    ctx.restore();
  });
}

/**
 * A block explorer's page (a still taken in a real browser: tools/trailer/demo-scan.mjs), in a window with its caption
 * underneath, a slow push in, and pink outlines on what to look at: `marks` [{ r: [x0, y0, x1, y1] as fractions of the
 * picture, at: ms }].
 */
async function drawScan(c, ms) {
  const img = await frameOf(c.take, 0);
  backdrop(0.04);
  const k = 0.875;
  const w = W * k, h = H * k, x = (W - w) / 2, y = 16;
  const p = easeInOut(clamp(ms / (c.lenMs || 1)));
  const z = lerp(c.zoom?.[0] ?? 1, c.zoom?.[1] ?? 1.08, p);
  const [fx, fy] = c.focus ?? [0.4, 0.4];
  const sw = img.width / z, sh = img.height / z, sx = (img.width - sw) * fx, sy = (img.height - sh) * fy;
  ctx.save(); ctx.shadowColor = 'rgba(132,70,210,0.42)'; ctx.shadowBlur = 90; rr(x, y, w, h, 26); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.save(); rr(x, y, w, h, 26); ctx.clip(); ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  for (const m of c.marks ?? []) {
    const q = enter(ms, m.at ?? 700, 420);
    if (q <= 0) continue;
    const X = (u) => x + ((u * img.width - sx) / sw) * w, Y = (v) => y + ((v * img.height - sy) / sh) * h;
    const x0 = X(m.r[0]) - 10, y0 = Y(m.r[1]) - 8, x1 = X(m.r[2]) + 10, y1 = Y(m.r[3]) + 8;
    const grow = 1 + 0.08 * (1 - q);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    ctx.save();
    ctx.globalAlpha = q;
    ctx.translate(mx, my); ctx.scale(grow, grow); ctx.translate(-mx, -my);
    ctx.shadowColor = 'rgba(232,77,127,0.55)'; ctx.shadowBlur = 24;
    rr(x0, y0, x1 - x0, y1 - y0, 14); ctx.strokeStyle = PINK; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  rr(x + 1, y + 1, w - 2, h - 2, 25); ctx.strokeStyle = 'rgba(184,148,216,0.38)'; ctx.lineWidth = 2; ctx.stroke();
  const title = c.title ? [].concat(c.title).join(' ') : '';
  const sub = c.sub ? [].concat(c.sub).join(' ') : '';
  const ts = 52, ss = 38, gap = title && sub ? 32 : 0;
  const tw = title ? widthOf(title.replace(/\*/g, ''), ts, 700, -0.02) : 0;
  const sw2 = sub ? widthOf(sub, ss, 400, -0.005) : 0;
  const cy = y + h + (H - y - h) / 2 + 15;
  let cx = W / 2 - (tw + gap + sw2) / 2;
  const q = enter(ms, 60);
  if (title) { line(title, cx, cy, { size: ts, tracking: -0.02, alpha: q, dy: (1 - q) * 14 }); cx += tw + gap; }
  if (sub) { const q2 = enter(ms, 160); line(sub, cx, cy - 1, { size: ss, weight: 400, tracking: -0.005, color: INK2, alpha: q2, dy: (1 - q2) * 14 }); }
}

/** a card of points, left aligned: a kicker, a title, then lines that enter a beat apart (the demo's "under the hood") */
function drawList(c, ms) {
  backdrop(0.06);
  const x = 150, colW = W - 300;
  let y = 128;
  if (c.kicker) { const p = enter(ms, 0); kicker(c.kicker, x, y, { alpha: p, dy: (1 - p) * 20 }); y += 60; }
  const lines = [].concat(c.title ?? []);
  const s = fit(lines, c.size ?? 92, colW);
  lines.forEach((l, i) => { const p = enter(ms, 60 + i * 90); y += s * 1.02; line(l, x, y - s * 0.12, { size: s, alpha: p, dy: (1 - p) * 26 }); });
  y += 26;
  const items = c.items ?? [];
  const beat = (T.beat ?? 30) * 1000 / FPS;
  const rowH = Math.min(c.rowH ?? 110, (H - y - 70) / Math.max(items.length, 1));
  items.forEach((it, i) => {
    const p = enter(ms, 420 + i * (c.stagger ?? 0.5) * beat, 380);
    const cy = y + i * rowH + rowH / 2;
    ctx.save(); ctx.globalAlpha *= p; ctx.translate((1 - p) * -24, 0);
    heart(x + 14, cy - 1, 26);
    // as big as asked, smaller until the head and its tail fit the column on one line
    let hs = it.size ?? c.itemSize ?? 38;
    const wide = (sz) => widthOf(it.head, sz, 700, -0.015) + (it.tail ? 16 + widthOf(it.tail, sz - 4, 400, -0.005) : 0);
    while (hs > 24 && wide(hs) > colW - 58) hs -= 1;
    line(it.head, x + 58, cy + hs * 0.33, { size: hs, weight: 700, tracking: -0.015 });
    if (it.tail) { const w = widthOf(it.head, hs, 700, -0.015); line(it.tail, x + 58 + w + 16, cy + hs * 0.33, { size: hs - 4, weight: 400, tracking: -0.005, color: INK2 }); }
    ctx.restore();
  });
}

/** the last card: the pets' faces, the name, where to find it */
async function drawEnd(c, ms) {
  backdrop(0.1);
  const faces = c.faces ?? [];
  const d = 236, gap = 44;
  const total = faces.length * d + (faces.length - 1) * gap;
  const cy = 290;
  for (let i = 0; i < faces.length; i += 1) {
    const img = await pic(faces[i]);
    const p = enter(ms, 60 + i * 90, 420);
    const back = 1 + 0.18 * Math.sin(Math.PI * clamp((ms - 60 - i * 90) / 420));   // a small overshoot on the way in
    const r = (d / 2) * (0.55 + 0.45 * p) * back;
    const cx = W / 2 - total / 2 + d / 2 + i * (d + gap);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.shadowColor = 'rgba(232,77,127,0.45)'; ctx.shadowBlur = 50;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fillStyle = PINK; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  // the wordmark
  const p = enter(ms, 520, 420);
  const size = 168;
  const w = widthOf('Emogotchi', size, 700, -0.035);
  const hw = size * 0.62;
  const x0 = W / 2 - (w + hw + size * 0.2) / 2;
  const y = 664;
  heart(x0 + hw / 2, y - size * 0.34, hw * (0.86 + 0.14 * p), p);
  line('Emogotchi', x0 + hw + size * 0.2, y, { size, tracking: -0.035, alpha: p, dy: (1 - p) * 26 });
  const subs = c.sub ? [].concat(c.sub) : [];
  subs.forEach((l, i) => { const q = enter(ms, 760 + i * 110); line(l, W / 2, y + 92 + i * 56, { size: 42, weight: 400, tracking: -0.005, color: INK2, align: 'center', alpha: q, dy: (1 - q) * 20 }); });
  if (c.url) {
    const q = enter(ms, 1000, 420);
    setFont(46, 700, -0.01);
    const tw = ctx.measureText(c.url).width;
    const bw = tw + 110, bh = 104, bx = W / 2 - bw / 2, by = y + 92 + subs.length * 56 + 40 + (1 - q) * 22;
    ctx.save();
    ctx.globalAlpha = q;
    ctx.shadowColor = 'rgba(232,77,127,0.5)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 12;
    const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, '#F26A97'); g.addColorStop(1, '#E84D7F');
    rr(bx, by, bw, bh, bh / 2); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    setFont(46, 700, -0.01);
    ctx.fillText(c.url, W / 2, by + bh / 2 + 3);
    ctx.restore();
  }
}

// ---------- the emo cut (tools/trailer/emo-timeline.mjs: T.style === 'emo') ----------
// Black, hot pink and plum; type in the site's Space Grotesk set heavy and caps with a hard pink offset (a zine's
// print), scrawled lines in a marker hand (Gloria Hallelujah, the r3tards mint page's); film grain, scanlines and a
// vignette over everything; RGB-split glitches on the hits and a checkerboard wipe into each section.
const HOT = '#FF2E88', PLUM = '#7B3FB8', HAND = '"Gloria Hallelujah", "Space Grotesk Variable", cursive';
const beatOf = (n) => (n % (T.beat ?? 30)) / (T.beat ?? 30);
/** 1 on a beat, falling away over the first part of it (a kick drum's punch) */
const beatKick = (n) => 1 - easeOut(clamp(beatOf(n) * 2.6));

/** a picture drawn to cover a box: `z` zoom, (fx, fy) the point of the picture at the box's middle (fractions); the
 *  capture's own rounded border is kept out */
function cover(img, z, fx, fy, x, y, w, h) {
  // (tools/trailer/emo-frame.mjs is this same rule in numbers: the cut frames its shots with it; keep the two in step)
  const ins = Math.round(img.width * 0.012);
  const iw = img.width - 2 * ins, ih = img.height - 2 * ins;
  const ar = w / h;
  let sw = iw, sh = sw / ar; if (sh > ih) { sh = ih; sw = sh * ar; }
  sw /= z; sh /= z;
  const cl = (v, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
  const sx = ins + cl(iw * fx - sw / 2, 0, iw - sw), sy = ins + cl(ih * fy - sh / 2, 0, ih - sh);
  if (sw <= iw + 0.5 && sh <= ih + 0.5) { ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h); return { sx, sy, sw, sh }; }
  // the window is wider (or taller) than the picture: the picture whole inside it, feathered into a blurred, darker copy
  // of itself that fills the rest (a pet too tall for a 16:9 slice of its room is shown whole, never cut)
  const k = w / sw, dx = (ins - sx) * k, dy = (ins - sy) * k, dw = iw * k, dh = ih * k;
  const small = offscreen('blur', 240, Math.max(2, Math.round(240 * h / w))), sc = small.getContext('2d');
  sc.filter = 'blur(3px) brightness(0.5) saturate(1.15)';
  let bw = iw, bh = bw / ar; if (bh > ih) { bh = ih; bw = bh * ar; }
  sc.drawImage(img, ins + (iw - bw) / 2, ins + (ih - bh) / 2, bw, bh, 0, 0, small.width, small.height);
  sc.filter = 'none';
  ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(small, x, y, w, h); ctx.restore();
  const sharp = offscreen('sharp', Math.ceil(w), Math.ceil(h)), pc = sharp.getContext('2d');
  pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, sharp.width, sharp.height); pc.drawImage(img, ins, ins, iw, ih, dx, dy, dw, dh);
  pc.globalCompositeOperation = 'destination-out';
  const F = Math.min(70, w * 0.06);
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = pc.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); pc.fillStyle = g; pc.fillRect(rx, ry, rw, rh); };
  if (dx > 0.5) { pc.fillStyle = '#000'; pc.fillRect(0, 0, dx, h); edge(dx, 0, dx + F, 0, dx, 0, F, h); }
  if (dx + dw < w - 0.5) { pc.fillStyle = '#000'; pc.fillRect(dx + dw, 0, w, h); edge(dx + dw, 0, dx + dw - F, 0, dx + dw - F, 0, F, h); }
  if (dy > 0.5) { pc.fillStyle = '#000'; pc.fillRect(0, 0, w, dy); edge(0, dy, 0, dy + F, 0, dy, w, F); }
  if (dy + dh < h - 0.5) { pc.fillStyle = '#000'; pc.fillRect(0, dy + dh, w, h); edge(0, dy + dh, 0, dy + dh - F, 0, dy + dh - F, w, F); }
  pc.globalCompositeOperation = 'source-over';
  ctx.drawImage(sharp, 0, 0, Math.ceil(w), Math.ceil(h), x, y, Math.ceil(w), Math.ceil(h));
  return { sx, sy, sw, sh };
}
/** (DEBUG_BOXES=1 renders) the measured box of a shot's pet at this moment, drawn where the cut put it */
function debugBox(c, ms, img, src, x, y, w, h) {
  if (!c.dbg || !src) return;
  const t = (c.from ?? 0) * 1000 + ms;
  let best = null; for (const d of c.dbg) if (!best || Math.abs(d[0] - t) < Math.abs(best[0] - t)) best = d;
  if (!best || best.length < 5) return;
  const X = (u) => x + ((u * img.width - src.sx) / src.sw) * w, Y = (v) => y + ((v * img.height - src.sy) / src.sh) * h;
  ctx.save(); ctx.strokeStyle = '#39FF6A'; ctx.lineWidth = 4; ctx.setLineDash([14, 8]);
  ctx.strokeRect(X(best[1]), Y(best[2]), X(best[3]) - X(best[1]), Y(best[4]) - Y(best[2])); ctx.restore();
}
const OFF = new Map();
function offscreen(name, w, h) {
  const key = `${name}:${w}x${h}`;
  let c = OFF.get(key); if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; OFF.set(key, c); }
  return c;
}
function emoBack(n) {
  ctx.fillStyle = '#07030B'; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.22, H * 0.15, 0, W * 0.22, H * 0.15, W * 0.6);
  g.addColorStop(0, 'rgba(123,63,184,0.30)'); g.addColorStop(1, 'rgba(123,63,184,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.85, H * 0.95, 0, W * 0.85, H * 0.95, W * 0.55);
  g.addColorStop(0, 'rgba(255,46,136,0.20)'); g.addColorStop(1, 'rgba(255,46,136,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // a checkered floor going away, very faint
  ctx.save();
  ctx.globalAlpha = 0.07;
  const hz = H * 0.62, rows = 9, cols = 16, drift = ((n ?? 0) % 120) / 120;
  for (let r = 0; r < rows; r += 1) {
    const a = (r + drift) / rows, b = (r + 1 + drift) / rows;
    const y0 = hz + (H - hz) * a * a, y1 = hz + (H - hz) * b * b;
    for (let c = -cols; c < cols; c += 1) {
      if ((r + c) % 2) continue;
      const sp = (yy) => (W * 0.5 + (c * W / cols) * (0.25 + 1.6 * ((yy - hz) / (H - hz))));
      const spb = (yy) => (W * 0.5 + ((c + 1) * W / cols) * (0.25 + 1.6 * ((yy - hz) / (H - hz))));
      ctx.beginPath(); ctx.moveTo(sp(y0), y0); ctx.lineTo(spb(y0), y0); ctx.lineTo(spb(y1), y1); ctx.lineTo(sp(y1), y1); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
  }
  ctx.restore();
}
/** heavy caps with a hard pink print offset behind (a punk zine's two-colour print) */
function zine(str, x, y, { size, align = 'left', alpha = 1, scale = 1, color = INK, offset = 0.06, shade = HOT } = {}) {
  setFont(size, 700, -0.035);
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x0 + w / 2, y - size * 0.35); ctx.scale(scale, scale); ctx.translate(-(x0 + w / 2), -(y - size * 0.35));
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = shade; ctx.fillText(str, x0 + size * offset, y + size * offset);
  ctx.fillStyle = color; ctx.fillText(str, x0, y);
  ctx.restore();
  return w;
}
/** a line in the marker hand */
function scrawl(str, x, y, { size = 64, color = INK, alpha = 1, rot = 0, align = 'left', reveal = 1 } = {}) {
  ctx.save();
  ctx.font = `400 ${size}px ${HAND}`; ctx.letterSpacing = '0px';
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.globalAlpha *= alpha;
  ctx.translate(x0, y); ctx.rotate(rot * Math.PI / 180);
  // written left to right, as a hand would
  ctx.beginPath(); ctx.rect(-10, -size * 1.4, (w + 20) * reveal, size * 2.2); ctx.clip();
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 16;
  ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.fillText(str, 0, 0);
  ctx.restore();
  return w;
}
/** a heart broken down the middle; `apart` pushes the halves away from the crack */
function brokenHeart(cx, cy, s, apart = 0, alpha = 1) {
  const path = new Path2D('M12 21.2l-1.3-1.2C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.5 2.8c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.8 22 5.2 22 8.3c0 3.8-3.4 6.9-8.7 11.7L12 21.2z');
  const crack = [[12, 4.9], [10.4, 8.6], [13.2, 11.4], [10.8, 14.8], [12.6, 17.6], [12, 21.2]];
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx + side * apart * s * 0.05, cy + apart * s * 0.01); ctx.rotate(side * apart * 0.06);
    ctx.scale(s / 24, s / 24); ctx.translate(-12, -12);
    ctx.beginPath();
    if (side < 0) { ctx.moveTo(-1, -1); ctx.lineTo(12, -1); for (const [x, y] of crack) ctx.lineTo(x, y); ctx.lineTo(12, 25); ctx.lineTo(-1, 25); }
    else { ctx.moveTo(25, -1); ctx.lineTo(12, -1); for (const [x, y] of crack) ctx.lineTo(x, y); ctx.lineTo(12, 25); ctx.lineTo(25, 25); }
    ctx.closePath(); ctx.clip();
    const g = ctx.createLinearGradient(2, 3, 22, 21); g.addColorStop(0, '#FF78B4'); g.addColorStop(1, HOT);
    ctx.fillStyle = g; ctx.fill(path);
    ctx.lineWidth = 1.3; ctx.strokeStyle = '#0B0610'; ctx.stroke(path);
    ctx.restore();
  }
}
/** the pack's name, slammed in (`name`/`top`: another name, the Emonadgotchi cut's; it is set as big as fits) */
function emoLogo(ms, cy, size = 210, { name = 'EMO PACK', top = 'THE' } = {}) {
  const p = clamp(ms / 160);
  const sc = 1 + 0.35 * (1 - easeOut(p));
  const hs = size;
  size = Math.min(size, fitZine(name, size, W - 240));
  brokenHeart(W / 2, cy - hs * 1.32, hs * 0.56 * (0.9 + 0.1 * p), 0.5 + 1.2 * easeOut(clamp(ms / 500)), p);
  if (top) {
    setFont(Math.round(hs * 0.26), 600, 0.34);
    ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = '#EAC6EA'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(top, W / 2, cy - hs * 0.72); ctx.restore();
  }
  zine(name, W / 2, cy + size * 0.3, { size, align: 'center', scale: sc, alpha: p, offset: 0.05 });
}
/** a small tag in the corner: a pink bar and the pet's name */
function tag(str, ms, top = false, right = W) {
  const p = enter(ms, 40, 220);
  setFont(46, 700, 0.12);
  // (beside a print, a tag ends short of its paper: pale letters on the white border vanish; it shrinks to fit)
  const room = right - 96 - 26;
  if (ctx.measureText(str).width > room) setFont(Math.floor(46 * room / ctx.measureText(str).width), 700, 0.12);
  const w = ctx.measureText(str).width;
  const x = 96 - (1 - p) * 40, y = top ? 140 : H - 110;
  ctx.save(); ctx.globalAlpha = p;
  ctx.fillStyle = HOT; ctx.fillRect(x, y - 42, 12, 58);
  ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 18;
  ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(str, x + 26, y + 6);
  ctx.restore();
  return w;
}
/** an item's caption: its name in heavy caps, a scrawled line under it, in a column on the left (the pet stands to the
 * right of it: the cut keeps every pet out of CAPTION_ZONE); set once for the whole group */
const CAPTION_COL = Math.round(W * 0.40) - 104;
function caption(c, gms) {
  const col = c.print ? c.print.x - 60 - 104 : CAPTION_COL;
  if (!c.title && !c.hand) return;
  // a dark corner under the words, bottom left (over a full-bleed picture)
  if (!c.print) {
    const g = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.6);
    g.addColorStop(0, 'rgba(7,3,11,0.86)'); g.addColorStop(0.55, 'rgba(7,3,11,0.5)'); g.addColorStop(1, 'rgba(7,3,11,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (c.title) {
    const p = clamp(gms / 150);
    const lines = [].concat(c.title);
    const size = Math.min(...lines.map((l) => fitZine(l, 140, col)));
    // (a list of lines breaks where it says; each line still wraps if it is wider than the column)
    const sub = c.sub ? [].concat(c.sub).flatMap((s) => wrapHand(s, 46, col)) : [];
    const subTop = H - 74 - (sub.length - 1) * 56;
    const last = sub.length ? subTop - 62 : H - 84;
    lines.forEach((l, i) => zine(l, 104, last - (lines.length - 1 - i) * size * 0.96, { size, alpha: p, scale: 1 + 0.25 * (1 - easeOut(p)) }));
    sub.forEach((l, i) => scrawl(l, 112, subTop + i * 56, { size: 46, color: '#FF9CC8', rot: -1.5, reveal: easeOut(clamp((gms - 180 - i * 380) / 520)) }));
  }
  if (c.hand) {
    const lines = [].concat(c.hand);
    // as big as the column allows (the scrawl is tilted 3 degrees: a little room for that)
    ctx.save(); let size = 96; for (; size > 40; size -= 2) { ctx.font = `400 ${size}px ${HAND}`; if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= col - 30) break; } ctx.restore();
    lines.forEach((l, i) => scrawl(l, 112, H - 90 - (lines.length - 1 - i) * size * 1.15, { size, color: i ? '#FF9CC8' : INK, rot: -3, reveal: easeOut(clamp((gms - 120 - i * 520) / 600)) }));
  }
}
/** a line in the marker hand broken into lines no wider than `max` */
function wrapHand(str, size, max) {
  ctx.save(); ctx.font = `400 ${size}px ${HAND}`;
  const out = []; let cur = '';
  for (const word of str.split(' ')) { const t = cur ? `${cur} ${word}` : word; if (cur && ctx.measureText(t).width > max) { out.push(cur); cur = word; } else cur = t; }
  if (cur) out.push(cur);
  ctx.restore(); return out;
}
function fitZine(str, size, max) { let s = size; while (s > 40 && widthOf(str, s, 700, -0.035) > max) s -= 4; return s; }

/** a take covering the frame, zooming and drifting; its caption over the group */
async function drawFill(c, ms, f, n, gms) {
  const img = await frameOf(c.take, f);
  const p = easeInOut(clamp(ms / (c.lenMs || 1)));
  const z0 = c.zoom?.[0] ?? 1.04, z1 = c.zoom?.[1] ?? z0;
  let z = lerp(z0, z1, p);
  if (c.pulse) z *= 1 + 0.02 * beatKick(n);
  const fc = c.focus ?? [0.5, 0.6];
  const fx = fc.length === 4 ? lerp(fc[0], fc[2], p) : fc[0], fy = fc.length === 4 ? lerp(fc[1], fc[3], p) : fc[1];
  const src = cover(img, z, fx, fy, 0, 0, W, H);
  if (c.dim) { ctx.fillStyle = `rgba(7,3,11,${c.dim})`; ctx.fillRect(0, 0, W, H); }
  debugBox(c, ms, img, src, 0, 0, W, H);
  for (const s of c.scrawl ?? []) {
    const at = s.at * (T.beat ?? 30) * 1000 / FPS;
    scrawl(s.text, s.x, s.y, { size: s.size ?? 70, rot: s.rot ?? -3, color: s.color ?? INK, reveal: easeOut(clamp((ms - at) / 700)) });
  }
  if (c.tag) tag(c.tag, ms);
  caption(c, gms);
}

/**
 * A take as a print in a scrapbook: the WHOLE room is the photo (zoomed in only as far as its pet stays whole: the cut
 * frames it so), a paper border, a strip of pink tape, a shadow, on the emo backdrop; the words beside it, never over
 * it. `c.print` = { x, y, w, h, rot } the photo in px. A group's print comes in once and its shots cut inside it.
 */
const PAPER = '#EEE6EF';
async function drawPrint(c, ms, f, n, gms) {
  emoBack(n);
  const img = await frameOf(c.take, f);
  const r = c.print;
  const p = easeInOut(clamp(ms / (c.lenMs || 1)));
  const z = lerp(c.zoom[0], c.zoom[1] ?? c.zoom[0], p);
  const fc = c.focus;
  const fx = fc.length === 4 ? lerp(fc[0], fc[2], p) : fc[0], fy = fc.length === 4 ? lerp(fc[1], fc[3], p) : fc[1];
  // a print is there from its first frame: it lands (a little big and turned, settling in a fifth of a second); a
  // group's print lands once and its shots cut inside it; only the opening fades up (`fadeIn`)
  const e = easeOut(clamp((c.slam ? ms : c.group ? gms : ms) / 220));
  let sc = 1 + (c.fadeIn ? 0 : (c.slam ? 0.07 : 0.045) * (1 - e));
  if (c.pulse) sc *= 1 + 0.012 * beatKick(n);
  const B = 13;
  ctx.save();
  ctx.globalAlpha = c.fadeIn ? easeOut(clamp(ms / 500)) : 1;
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(((r.rot ?? 0) + (c.fadeIn ? 0 : (1 - e) * (r.rot >= 0 ? 1.6 : -1.6))) * Math.PI / 180);
  ctx.scale(sc, sc);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.62)'; ctx.shadowBlur = 46; ctx.shadowOffsetY = 18;
  rr(-r.w / 2 - B, -r.h / 2 - B, r.w + 2 * B, r.h + 2 * B, 7); ctx.fillStyle = PAPER; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-r.w / 2, -r.h / 2, r.w, r.h); ctx.clip();
  const src = cover(img, z, fx, fy, -r.w / 2, -r.h / 2, r.w, r.h);
  if (c.dim) { ctx.fillStyle = `rgba(7,3,11,${c.dim})`; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
  debugBox(c, ms, img, src, -r.w / 2, -r.h / 2, r.w, r.h);
  // a little gloss across the print
  const gl = ctx.createLinearGradient(-r.w / 2, -r.h / 2, r.w / 2, r.h / 2);
  gl.addColorStop(0, 'rgba(255,255,255,0.07)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
  ctx.restore();
  tape(0, -r.h / 2 - B + 2, Math.min(230, r.w * 0.2), -3.5);
  ctx.restore();
  for (const s of c.scrawl ?? []) {
    const at = s.at * (T.beat ?? 30) * 1000 / FPS;
    scrawl(s.text, s.x, s.y, { size: s.size ?? 70, rot: s.rot ?? -3, color: s.color ?? INK, reveal: easeOut(clamp((ms - at) / 700)) });
  }
  if (c.name) bigName(c.name, r.x - 60, ms);
  // (the print's left edge, its paper and turn allowed for, less a gap)
  if (c.tag) tag(c.tag, ms, c.tagTop, r.x - B - Math.abs(r.rot ?? 0) * 0.02 * r.h - 34);
  caption(c, gms);
}
/** a strip of pink tape */
function tape(x, y, w, deg) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(deg * Math.PI / 180);
  const h = w * 0.24;
  ctx.globalAlpha *= 0.82;
  ctx.fillStyle = 'rgba(255,46,136,0.62)'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalAlpha *= 0.35; ctx.fillStyle = '#ffffff';
  for (let k = -w / 2 + 6; k < w / 2; k += 22) { ctx.beginPath(); ctx.moveTo(k, -h / 2); ctx.lineTo(k + 10, -h / 2); ctx.lineTo(k + 10 - h * 0.6, h / 2); ctx.lineTo(k - h * 0.6, h / 2); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
/** a pet's name, big, in the column left of its print, slammed in */
function bigName(name, right, ms) {
  const lines = [].concat(name);
  const col = right - 104;
  const size = Math.min(...lines.map((l) => fitZine(l, 170, col)));
  const p = clamp(ms / 130);
  const lh = size * 0.96, top = H / 2 - (lines.length * lh) / 2 + size * 0.78;
  ctx.save(); ctx.fillStyle = HOT; ctx.globalAlpha = p; ctx.fillRect(104, top - size * 0.78 - 34, 64, 10); ctx.restore();
  lines.forEach((l, i) => zine(l, 104, top + i * lh, { size, alpha: p, scale: 1 + 0.4 * (1 - easeOut(p)) }));
}

/** words slammed in one at a time, a beat apart (or the pack's name) */
async function drawTitle(c, ms, f, n) {
  emoBack(n);
  const beatMs = (T.beat ?? 30) * 1000 / FPS;
  if (c.logo) {
    emoLogo(ms, H / 2 + 60, 210, c.logo === true ? {} : c.logo);
    if (c.sub) scrawl(c.sub, W / 2, H / 2 + 230, { size: 58, color: '#FF9CC8', align: 'center', rot: -2, reveal: easeOut(clamp((ms - 380) / 600)) });
    return;
  }
  const words = c.words ?? [];
  // the whole line fits with room either side (it is set for the whole sentence, so no word moves as the next lands)
  let size = 230, ws, total, sp;
  for (; size > 60; size -= 6) {
    setFont(size, 700, -0.035); sp = size * 0.26;
    ws = words.map((w) => ctx.measureText(w.text).width);
    total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    if (total <= W - 300) break;
  }
  let x = W / 2 - total / 2;
  let shake = 0;
  words.forEach((w, i) => {
    const t = ms - w.at * beatMs;
    if (t >= 0) {
      const p = clamp(t / 110);
      if (t < 140) shake = Math.max(shake, 1 - t / 140);
      zine(w.text, x, H / 2 + size * 0.34, { size, scale: 1 + 0.6 * (1 - easeOut(p)), alpha: clamp(t / 40), shade: HOT, color: w.pink ? '#FF78B4' : INK });
    }
    x += ws[i] + sp;
  });
  if (c.shake && shake > 0) {
    // the frame jolts on each word
    const img = ctx.getImageData(0, 0, W, H);
    ctx.putImageData(img, Math.round((frac(n * 7.13) - 0.5) * 18 * shake), Math.round((frac(n * 3.71) - 0.5) * 12 * shake));
  }
}
const frac = (x) => x - Math.floor(x);

/** N takes side by side, a pet a tile, in turn */
async function drawGrid(c, ms, f, n) {
  emoBack(n);
  const tiles = c.tiles ?? [];
  const N = tiles.length, gap = 26, top = 60, th = H - 330, tw = (W - gap * (N + 1)) / N;
  const i0 = n - c.start;
  for (let i = 0; i < N; i += 1) {
    const t = tiles[i];
    const at = i * (c.stagger ?? 0.5) * (T.beat ?? 30) * 1000 / FPS;
    // (a frame ahead: the first print is on the page on the grid's first frame)
    const p = easeOut(clamp((ms - at + 1000 / FPS) / 240));
    if (p <= 0) continue;
    const img = await frameOf(t.take, Math.round((t.from ?? 0) * FPS) + i0);
    if (t.print) {
      // a print of the whole room (see drawPrint), dropped onto the page in turn
      const r = t.print, B = 10;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 3);
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2 - (1 - p) * 40); ctx.rotate(((r.rot ?? 0) + (1 - p) * 5) * Math.PI / 180);
      const ks = (1 + 0.1 * (1 - p)) * (1 + 0.008 * beatKick(n)); ctx.scale(ks, ks);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
      rr(-r.w / 2 - B, -r.h / 2 - B, r.w + 2 * B, r.h + 2 * B, 6); ctx.fillStyle = PAPER; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(-r.w / 2, -r.h / 2, r.w, r.h); ctx.clip();
      const src = cover(img, t.zoom, t.focus[0], t.focus[1], -r.w / 2, -r.h / 2, r.w, r.h);
      debugBox({ dbg: t.dbg, from: t.from }, ms, img, src, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
      tape(0, -r.h / 2 - B + 2, r.w * 0.26, i % 2 ? 4 : -4);
      ctx.restore();
      continue;
    }
    const x = gap + i * (tw + gap), y = top + (1 - p) * 60;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.save(); ctx.shadowColor = 'rgba(255,46,136,0.35)'; ctx.shadowBlur = 50; rr(x, y, tw, th, 28); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ctx.save(); rr(x, y, tw, th, 28); ctx.clip();
    cover(img, (t.zoom ?? 1.4) * (1 + 0.015 * beatKick(n)), t.focus?.[0] ?? 0.5, t.focus?.[1] ?? 0.62, x, y, tw, th);
    ctx.restore();
    rr(x + 1.5, y + 1.5, tw - 3, th - 3, 27); ctx.strokeStyle = i % 2 ? 'rgba(184,148,216,0.6)' : 'rgba(255,46,136,0.6)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  if (c.title) {
    const q = clamp((ms - 120) / 150);
    zine(c.title, W / 2, H - 132, { size: fitZine(c.title, 110, W - 200), align: 'center', alpha: q, scale: 1 + 0.25 * (1 - easeOut(q)) });
  }
  if (c.sub) scrawl(c.sub, W / 2, H - 52, { size: 54, color: '#FF9CC8', align: 'center', rot: -1.5, reveal: easeOut(clamp((ms - 500) / 600)) });
}

/** the last card: the five in a row, the pack's name, where */
async function drawEmoEnd(c, ms, f, n) {
  emoBack(n);
  const faces = c.faces ?? [];
  const d = 252, gap = 52, total = faces.length * d + (faces.length - 1) * gap, cy = 262;
  for (let i = 0; i < faces.length; i += 1) {
    const [take, sec, fx, fy, fr] = faces[i];
    const img = await frameOf(take, Math.round(sec * FPS));
    const p = enter(ms, 80 + i * 90, 380);
    const r = (d / 2) * (0.5 + 0.5 * p) * (1 + 0.16 * Math.sin(Math.PI * clamp((ms - 80 - i * 90) / 380)));
    const cx = W / 2 - total / 2 + d / 2 + i * (d + gap);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.shadowColor = 'rgba(255,46,136,0.5)'; ctx.shadowBlur = 50;
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? PLUM : HOT; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const s = fr * img.width;
    ctx.drawImage(img, fx * img.width - s, fy * img.height - s, s * 2, s * 2, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  emoLogo(Math.max(0, ms - 520), 690, 170);
  if (c.sub) { const q = enter(ms, 900, 420); line(c.sub, W / 2, 846, { size: 40, weight: 500, tracking: -0.005, color: INK2, align: 'center', alpha: q, dy: (1 - q) * 18 }); }
  if (c.url) {
    const q = enter(ms, 1150, 420);
    setFont(46, 700, -0.01);
    const tw = ctx.measureText(c.url).width;
    const bw = tw + 110, bh = 100, bx = W / 2 - bw / 2, by = 900 + (1 - q) * 20;
    ctx.save(); ctx.globalAlpha = q;
    ctx.shadowColor = 'rgba(255,46,136,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 12;
    const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, '#FF5C9E'); g.addColorStop(1, HOT);
    rr(bx, by, bw, bh, bh / 2); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(c.url, W / 2, by + bh / 2 + 3);
    ctx.restore();
  }
}

// ---------- the third emo trailer's layouts ----------
/** a page torn out of a notebook (ruled, a red margin), lying turned on the dark, the diary's lines written in a hand as
 *  each comes (`c.lines`: [{ text, at: beats, size, pink }]); a broken heart doodled in the corner */
async function drawDiary(c, ms, f, n) {
  emoBack(n);
  const beatMs = (T.beat ?? 30) * 1000 / FPS;
  const pw = 1180, ph = 860, cx = W / 2, cy = H / 2 + 10;
  const e = easeOut(clamp(ms / 900));
  ctx.save();
  ctx.translate(cx, cy + (1 - e) * 30); ctx.rotate((-2.2 + (1 - e) * 1.5) * Math.PI / 180);
  ctx.globalAlpha = c.fadeIn ? e : 1;
  // the page, its torn top edge
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ctx.beginPath(); ctx.moveTo(-pw / 2, -ph / 2 + 12);
  for (let x = -pw / 2; x <= pw / 2; x += 18) ctx.lineTo(x, -ph / 2 + 6 + 10 * frac(Math.sin(x * 12.9898) * 43758.5453));
  ctx.lineTo(pw / 2, ph / 2); ctx.lineTo(-pw / 2, ph / 2); ctx.closePath();
  ctx.fillStyle = '#EDE7F2'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(96,130,210,0.38)'; ctx.lineWidth = 2;
  for (let y = -ph / 2 + 110; y < ph / 2; y += 62) { ctx.beginPath(); ctx.moveTo(-pw / 2, y); ctx.lineTo(pw / 2, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(232,77,127,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-pw / 2 + 150, -ph / 2); ctx.lineTo(-pw / 2 + 150, ph / 2); ctx.stroke();
  // three holes punched down the left
  ctx.fillStyle = '#07030B'; for (const y of [-260, 0, 260]) { ctx.beginPath(); ctx.arc(-pw / 2 + 62, y, 20, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // the lines, written in as each comes
  // (each line written on a rule, two rules apart: the rules are 62 apart from 110 down the page)
  let y = -ph / 2 + 110 + 62 * 2 - 8;
  for (const l of c.lines ?? []) {
    const t = ms - l.at * beatMs;
    const size = l.size ?? 80;
    if (t >= 0) {
      ctx.save(); ctx.font = `400 ${size}px ${HAND}`; ctx.letterSpacing = '0px';
      const w = ctx.measureText(l.text).width, reveal = easeOut(clamp(t / 650));
      ctx.beginPath(); ctx.rect(-pw / 2 + 190, y - size * 1.2, (w + 20) * reveal, size * 1.8); ctx.clip();
      ctx.fillStyle = l.pink ? HOT : '#241534'; ctx.textBaseline = 'alphabetic'; ctx.fillText(l.text, -pw / 2 + 200, y);
      ctx.restore();
    }
    y += 124;
  }
  // a broken heart doodled in the corner, in the same pen
  if (ms > 5 * beatMs) {
    const q = easeOut(clamp((ms - 5 * beatMs) / 500));
    ctx.save(); ctx.translate(pw / 2 - 190, ph / 2 - 170); ctx.rotate(0.18); ctx.globalAlpha *= q;
    ctx.strokeStyle = HOT; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 60); ctx.bezierCurveTo(-90, 0, -70, -70, 0, -30); ctx.bezierCurveTo(70, -70, 90, 0, 0, 60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -30); ctx.lineTo(-12, -2); ctx.lineTo(10, 14); ctx.lineTo(-6, 40); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
/** a sticker slapped on: heavy caps on a hot pink strip with a dark print offset, turned a little, landing big */
function sticker(str, x, y, { size = 64, rot = 0, p = 1, color = '#0B0610', bg = HOT } = {}) {
  setFont(size, 700, -0.01);
  const w = ctx.measureText(str).width, padX = size * 0.32, h = size * 1.18;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot * Math.PI / 180);
  const sc = 1 + 0.5 * (1 - easeOut(p)); ctx.scale(sc, sc);
  ctx.globalAlpha *= clamp(p * 2.5);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(10, 10, w + padX * 2, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w + padX * 2, h);
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(str, padX, h / 2 + size * 0.04);
  ctx.restore();
  return w + padX * 2;
}
/**
 * The transformation: a print of a pet going emo a piece a beat. `c.pops`: [{ at: beats into the clip, text }], each
 * piece's name stuck on in the column left of the print as it goes on; `c.flipAt` the beat the room turns into the
 * bedroom: "before" is struck out and "after." scrawled under it.
 */
async function drawXform(c, ms, f, n, gms) {
  await drawPrint({ ...c, title: null, hand: null, sub: null, scrawl: null }, ms, f, n, gms);
  const beatMs = (T.beat ?? 30) * 1000 / FPS;
  const flip = (c.flipAt ?? 99) * beatMs;
  scrawl('before', 108, 170, { size: 78, rot: -4, reveal: easeOut(clamp(ms / 500)) });
  if (ms >= flip) {
    const q = clamp((ms - flip) / 160);
    ctx.save(); ctx.strokeStyle = HOT; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(98, 150); ctx.lineTo(98 + 290 * q, 132); ctx.stroke(); ctx.restore();
    scrawl('after.', 150, 268, { size: 92, rot: -6, color: '#FF78B4', reveal: easeOut(clamp((ms - flip - 120) / 420)) });
  }
  (c.pops ?? []).forEach((pp, i) => {
    const t = ms - pp.at * beatMs;
    if (t < 0) return;
    sticker(pp.text, 104 + (i % 2 ? 22 : 0), 336 + i * 142, { size: 54, rot: i % 2 ? 2 : -2.5, p: clamp(t / 130), bg: i === (c.pops.length - 1) ? '#B894D8' : HOT });
  });
}
/**
 * The band: five pets cut out of their own takes (filmed with the room taken away) put into one room (the plate), two
 * rows, playing the same riff on the same beat. `c.plate`/`c.plateFrom`; `c.members`: [{ take, from (its seconds), ax,
 * ay (the point of its picture that is its feet's middle, px), x, y (where that goes in the plate, px), s (scale),
 * z (order: the back row first) }]; `c.cam`: [zoom from, to], `c.focus`: [fx, fy, fx, fy]; `c.punch`: a beat the
 * camera kicks in on (the last chord).
 */
async function drawBand(c, ms, f, n) {
  const i0 = n - c.start;
  const plate = await frameOf(c.plate, Math.round((c.plateFrom ?? 0) * FPS) + i0);
  const comp = offscreen('band', plate.width, plate.height), bx = comp.getContext('2d');
  bx.globalCompositeOperation = 'copy'; bx.drawImage(plate, 0, 0); bx.globalCompositeOperation = 'source-over';
  bx.imageSmoothingQuality = 'high';
  const mem = [...(c.members ?? [])].sort((a, b) => a.z - b.z);
  const imgs = await Promise.all(mem.map((m) => frameOf(m.take, Math.round(m.from * (T.takes[m.take]?.fps ?? FPS)) + i0)));
  for (const m of mem) void frameOf(m.take, Math.round(m.from * (T.takes[m.take]?.fps ?? FPS)) + i0 + 2).catch(() => {});
  // (the top rows of a cut-out are left out: a faint bar of the room's was left there in every take: emo3-band.py's TOP)
  const TOP = 12;
  mem.forEach((m, k) => { const img = imgs[k], L = m.left ?? 0; bx.drawImage(img, L, TOP, img.width - L, img.height - TOP, m.x + (L - m.ax) * m.s, m.y + (TOP - m.ay) * m.s, (img.width - L) * m.s, (img.height - TOP) * m.s); });
  const p = easeInOut(clamp(ms / (c.lenMs || 1)));
  let z = lerp(c.cam?.[0] ?? 1, c.cam?.[1] ?? 1, p);
  if (c.punch !== undefined) { const k = i0 - Math.round(c.punch * (T.beat ?? 30)); if (k >= 0) z *= 1 + 0.07 * Math.exp(-k / 9); }
  z *= 1 + 0.008 * beatKick(n);
  const fc = c.focus ?? [0.5, 0.55];
  const fx = fc.length === 4 ? lerp(fc[0], fc[2], p) : fc[0], fy = fc.length === 4 ? lerp(fc[1], fc[3], p) : fc[1];
  cover(comp, z, fx, fy, 0, 0, W, H);
}
/** a print as a flip phone's camera screen: brackets in its corners, the time, a battery; the flashes are emoFinish's */
async function drawViewfinder(c, ms, f, n, gms) {
  await drawPrint(c, ms, f, n, gms);
  const r = c.print, e = easeOut(clamp((c.group ? gms : ms) / 220));
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate((r.rot ?? 0) * Math.PI / 180);
  const sc = 1 + 0.045 * (1 - e); ctx.scale(sc, sc);
  const hw = r.w / 2 - 34, hh = r.h / 2 - 34, L = 70;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7; ctx.lineCap = 'square';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * hw, sy * (hh - L)); ctx.lineTo(sx * hw, sy * hh); ctx.lineTo(sx * (hw - L), sy * hh); ctx.stroke(); }
  // a dot that blinks, the time, a battery and the signal
  setFont(40, 600, 0.04); ctx.textBaseline = 'middle';
  if (Math.floor(ms / 500) % 2 === 0) { ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(-hw + 30, -hh + 40, 13, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'left'; ctx.fillText('11:47 PM', -hw + 58, -hh + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4; ctx.strokeRect(hw - 96, -hh + 26, 62, 30); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(hw - 34, -hh + 34, 6, 14);
  ctx.fillRect(hw - 90, -hh + 32, 18, 18); ctx.fillRect(hw - 70, -hh + 32, 18, 18);
  for (let k = 0; k < 4; k += 1) ctx.fillRect(hw - 200 + k * 16, -hh + 54 - (k + 1) * 7, 10, (k + 1) * 7);
  ctx.textAlign = 'right'; setFont(34, 600, 0.06); ctx.fillText(c.shot ?? 'IMG_0417', hw - 10, hh - 40);
  ctx.restore();
}
/** the photo dump: stills (`c.pics`: [{ take, at (its seconds), zoom, focus, x, y, rot, cap }]) as polaroids dropped
 * onto the page a beat apart, a line scrawled under each */
async function drawDump(c, ms, f, n) {
  emoBack(n);
  const beatMs = (T.beat ?? 30) * 1000 / FPS;
  const pics = c.pics ?? [];
  for (let i = 0; i < pics.length; i += 1) {
    const q = pics[i], t = ms - i * (c.stagger ?? 1) * beatMs;
    if (t < 0) continue;
    const p = easeOut(clamp(t / 230));
    const img = await frameOf(q.take, Math.round(q.at * (T.takes[q.take]?.fps ?? FPS)));
    const S = q.size ?? 400, B = S * 0.055, BB = S * 0.27;
    ctx.save();
    ctx.translate(q.x, q.y - (1 - p) * 70); ctx.rotate(((q.rot ?? 0) + (1 - p) * (i % 2 ? -9 : 9)) * Math.PI / 180);
    const ks = 1 + 0.28 * (1 - p); ctx.scale(ks, ks); ctx.globalAlpha = clamp(p * 3);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#F4F0EA'; ctx.fillRect(-S / 2 - B, -S / 2 - B, S + 2 * B, S + B + BB); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-S / 2, -S / 2, S, S); ctx.clip();
    cover(img, q.zoom, q.focus[0], q.focus[1], -S / 2, -S / 2, S, S);
    // the flash's glare on a print
    const gl = ctx.createLinearGradient(-S / 2, -S / 2, S / 2, S / 2); gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(-S / 2, -S / 2, S, S);
    ctx.restore();
    if (q.cap) { ctx.save(); ctx.font = `400 ${Math.round(S * 0.12)}px ${HAND}`; ctx.fillStyle = '#2A1830'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(q.cap, 0, S / 2 + BB * 0.5); ctx.restore(); }
    if (i % 2 === 0) tape(0, -S / 2 - B + 2, S * 0.36, i % 4 ? 3 : -3);
    ctx.restore();
  }
  if (c.title) { const q = clamp((ms - (c.titleAt ?? 0) * beatMs) / 150); if (q > 0) zine(c.title, W / 2, H - 70, { size: fitZine(c.title, 104, W - 200), align: 'center', alpha: q, scale: 1 + 0.25 * (1 - easeOut(q)) }); }
}

// ---------- the Emonadgotchi trailer's layouts ----------
/**
 * Fit check: a print of one take in which the look changes on the beat (the lab's chips pressed mid-take), the column
 * left of it naming each look as it lands: `c.head` a heading slammed in once, `c.looks`: [{ at: beats into the clip,
 * text, gold }] each a sticker (the current one big, the ones before it stacked small and dim above it).
 */
async function drawFit(c, ms, f, n, gms) {
  await drawPrint({ ...c, title: null, hand: null, sub: null, name: null }, ms, f, n, gms);
  const beatMs = (T.beat ?? 30) * 1000 / FPS;
  const col = c.print.x - 60 - 104;
  if (c.head) { const q = clamp(gms / 150); zine(c.head, 104, 210, { size: fitZine(c.head, 130, col), alpha: q, scale: 1 + 0.3 * (1 - easeOut(q)) }); }
  const looks = c.looks ?? [];
  let cur = -1;
  looks.forEach((lk, i) => { if (ms >= lk.at * beatMs) cur = i; });
  if (cur < 0) return;
  // the ones before, small and dim, a list growing down under the heading
  for (let i = 0; i < cur; i += 1) {
    ctx.save(); ctx.globalAlpha = 0.5;
    setFont(34, 700, 0.02); ctx.fillStyle = looks[i].gold ? '#E8C25A' : '#EAC6EA'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText(looks[i].text, 108, 300 + i * 46);
    ctx.restore();
  }
  const lk = looks[cur], t = ms - lk.at * beatMs;
  const y = Math.min(300 + cur * 46 + 40, 760);
  sticker(lk.text, 104, y, { size: lk.text.length > 12 ? 56 : 70, rot: cur % 2 ? 2 : -2.5, p: clamp(t / 130), bg: lk.gold ? '#E8C25A' : HOT });
}
/** the last card: his face in one big circle, his name slammed in, a line, where */
async function drawEgEnd(c, ms, f, n) {
  emoBack(n);
  const [take, sec, fx, fy, fr] = c.face;
  const img = await frameOf(take, Math.round(sec * FPS));
  const d = 360, cx = W / 2, cy = 268;
  const p = enter(ms, 60, 420);
  const r = (d / 2) * (0.55 + 0.45 * p) * (1 + 0.12 * Math.sin(Math.PI * clamp((ms - 60) / 420)));
  ctx.save();
  ctx.globalAlpha = p;
  ctx.shadowColor = 'rgba(255,46,136,0.6)'; ctx.shadowBlur = 70;
  ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fillStyle = HOT; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const sz = fr * img.width;
  ctx.drawImage(img, fx * img.width - sz, fy * img.height - sz, sz * 2, sz * 2, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  // his name: no broken heart over it here (the face is the picture); a kicker over it
  const q = clamp((ms - 420) / 160);
  if (q > 0) {
    if (c.kicker) { setFont(46, 600, 0.3); ctx.save(); ctx.globalAlpha = q; ctx.fillStyle = '#EAC6EA'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(c.kicker, W / 2, 560); ctx.restore(); }
    const size = fitZine(c.name, 200, W - 220);
    zine(c.name, W / 2, 560 + 30 + size * 0.78, { size, align: 'center', alpha: q, scale: 1 + 0.35 * (1 - easeOut(q)), offset: 0.05 });
  }
  if (c.sub) scrawl(c.sub, W / 2, 870, { size: 64, color: '#FF9CC8', align: 'center', rot: -2, reveal: easeOut(clamp((ms - 900) / 600)) });
  if (c.url) {
    const q2 = enter(ms, 1300, 420);
    setFont(44, 700, -0.01);
    const tw = ctx.measureText(c.url).width;
    const bw = tw + 110, bh = 92, bx = W / 2 - bw / 2, by = 930 + (1 - q2) * 20;
    ctx.save(); ctx.globalAlpha = q2;
    ctx.shadowColor = 'rgba(255,46,136,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 12;
    const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, '#FF5C9E'); g.addColorStop(1, HOT);
    rr(bx, by, bw, bh, bh / 2); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(c.url, W / 2, by + bh / 2 + 3);
    ctx.restore();
  }
}

// the finish over every emo frame: a glitch on the hits, a checkerboard wipe into a section, grain, scanlines, vignette
const buf = [0, 1, 2].map(() => Object.assign(document.createElement('canvas'), { width: W, height: H }));
function rgbSplit(amount, n) {
  const [a, r, b] = buf;
  const ax = a.getContext('2d'); ax.globalCompositeOperation = 'copy'; ax.drawImage(cv, 0, 0);
  const tint = (cnv, col) => { const x = cnv.getContext('2d'); x.globalCompositeOperation = 'copy'; x.drawImage(a, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; };
  tint(r, '#ff0000'); tint(b, '#00ffff');
  ctx.save();
  ctx.globalCompositeOperation = 'copy'; ctx.drawImage(b, amount * 0.6, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(r, -amount, 0);
  ctx.restore();
  // a few bands of the picture knocked sideways
  for (let k = 0; k < 4; k += 1) {
    const y = Math.floor(frac(n * 0.618 + k * 0.37) * H), h = 14 + Math.floor(frac(n * 0.31 + k) * 70), dx = (frac(n * 0.77 + k * 0.53) - 0.5) * amount * 6;
    ctx.drawImage(a, 0, y, W, h, dx, y, W, h);
  }
}
function wipe(i) {
  // squares of black shrinking away, the top-left first
  const s = 120, cols = Math.ceil(W / s), rows = Math.ceil(H / s);
  ctx.save(); ctx.fillStyle = '#07030B';
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const k = clamp(1 - (i - (r + c) * 0.42) / 7);
    if (k <= 0) continue;
    const q = s * k * ((r + c) % 2 ? 1 : 0.92);
    ctx.fillRect(c * s + (s - q) / 2, r * s + (s - q) / 2, q, q);
  }
  ctx.restore();
}
const grains = [];
function grain(n) {
  if (!grains.length) for (let k = 0; k < 6; k += 1) {
    const g = Object.assign(document.createElement('canvas'), { width: 480, height: 270 });
    const x = g.getContext('2d'); const d = x.createImageData(480, 270);
    let s = 0x1234567 + k * 7919;
    for (let i = 0; i < d.data.length; i += 4) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const v = (s >>> 0) % 256; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); grains.push(g);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.09; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grains[n % grains.length], 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.045; ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, W * 0.66);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
/** a light leak: warm light bleeding in from an edge and drifting, faded in and out over `len` frames */
function leak(i, len, seed = 0) {
  const p = clamp(i / len), a = Math.sin(Math.PI * p) * 0.55;
  if (a <= 0.01) return;
  const x = W * (0.12 + 0.8 * frac(0.37 + seed * 0.61) + 0.25 * p), y = H * (0.2 + 0.6 * frac(0.71 + seed * 0.29));
  const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.55);
  g.addColorStop(0, `rgba(255,170,120,${a})`); g.addColorStop(0.35, `rgba(255,70,140,${a * 0.6})`); g.addColorStop(1, 'rgba(255,46,136,0)');
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function emoFinish(c, n) {
  const i = n - c.start;
  if (c.glitch && i < 5) rgbSplit(16 * (1 - i / 5), n);
  if (c.flash && i < 7) { ctx.fillStyle = `rgba(255,214,234,${0.42 * (1 - i / 7)})`; ctx.fillRect(0, 0, W, H); }
  // `flashes`: beats into the clip with a flash on them (a camera's: white, sharp); `bursts`: a softer pink one
  for (const b of c.flashes ?? []) { const k = i - Math.round(b * (T.beat ?? 30)); if (k >= 0 && k < 10) { ctx.fillStyle = `rgba(255,255,255,${0.92 * (1 - k / 10) ** 1.6})`; ctx.fillRect(0, 0, W, H); } }
  for (const b of c.bursts ?? []) { const k = i - Math.round(b * (T.beat ?? 30)); if (k >= 0 && k < 7) { ctx.fillStyle = `rgba(255,214,234,${0.4 * (1 - k / 7)})`; ctx.fillRect(0, 0, W, H); } }
  for (const b of c.splits ?? []) { const k = i - Math.round(b * (T.beat ?? 30)); if (k >= 0 && k < 5) rgbSplit(14 * (1 - k / 5), n); }
  if (c.leak) leak(i, c.leak, c.start);
  if (c.wipe && i < 22) wipe(i);
  grain(n);
}

const LAYOUT = { list: drawList, scan: drawScan, print: drawPrint, card: drawCard, full: drawFull, room: drawRoom, phone: drawPhone, end: drawEnd, fill: drawFill, title: drawTitle, grid: drawGrid, emoend: drawEmoEnd, xform: drawXform, band: drawBand, diary: drawDiary, viewfinder: drawViewfinder, dump: drawDump, fit: drawFit, egend: drawEgEnd };

async function draw(n) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const c = T.clips.find((k) => n >= k.start && n < k.start + k.len);
  if (!c) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  const i = n - c.start;
  c._left = (c.start + c.len - n) * 1000 / FPS;   // what is left of the clip (captions leaving before a cut)
  const ms = c.still ? 5000 + i * 1000 / FPS : i * 1000 / FPS;   // still: the type carried over from the clip before, so nothing enters again
  // until: the take's picture is held from that second on (a sheet that closes itself a moment after it says what it has to)
  // (a take filmed at another rate, `fps` in its meta: `from` is in its own seconds; at 180 it plays three times slower)
  const tf = c.take ? (T.takes[c.take]?.fps ?? FPS) : FPS;
  const f = c.take ? Math.min(Math.round((c.from ?? 0) * tf) + Math.round(i * (c.speed ?? 1)), c.until ? Math.round(c.until * tf) : 1e9) : 0;
  if (c.take) for (let a = 1; a <= 4; a += 1) void frameOf(c.take, f + Math.round(a * (c.speed ?? 1))).catch(() => {});   // decode ahead
  // a group's type is timed from the group's start (the emo cut)
  const gms = (n - (c.gstart ?? c.start)) * 1000 / FPS;
  await LAYOUT[c.layout](c, ms, f, n, gms);
  if (T.style === 'emo') emoFinish(c, n);
  // a soft flash on a cut, for the hits
  else if (c.flash && i < 6) { ctx.fillStyle = `rgba(255,230,244,${0.2 * (1 - i / 6)})`; ctx.fillRect(0, 0, W, H); }
  // the film opens from black and closes to it
  const inF = 20, outF = 36;
  if (n < inF) { ctx.fillStyle = `rgba(0,0,0,${1 - n / inF})`; ctx.fillRect(0, 0, W, H); }
  if (n >= T.frames - outF) { ctx.fillStyle = `rgba(0,0,0,${clamp((n - (T.frames - outF)) / (outF - 6))})`; ctx.fillRect(0, 0, W, H); }
}

async function setup() {
  T = await (await fetch('/timeline.json')).json();
  const face = new FontFace('Space Grotesk Variable', 'url(/font.woff2)', { weight: '300 700' });
  document.fonts.add(await face.load());
  if (T.style === 'emo') { try { const h = new FontFace('Gloria Hallelujah', 'url(/hand.woff2)'); document.fonts.add(await h.load()); } catch { /* the hand falls back */ } }
  await document.fonts.ready;
}

/** frame n as a PNG (base64), for looking at */
window.still = async (n, scale = 1) => {
  if (!T) await setup();
  await draw(n);
  if (scale === 1) return cv.toDataURL('image/png').slice(22);
  const s = document.createElement('canvas'); s.width = W * scale; s.height = H * scale;
  const x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, s.width, s.height);
  return s.toDataURL('image/jpeg', 0.9).slice(23);
};

// ---------- sound ----------
// The film's sound is the site's own: every cue the pages made while they were filmed (T.sfx, in film seconds), played
// again through the site's sound engine (bundled from apps/web/src/sound/engine.ts) on an offline context. Rendered a
// stretch at a time and added together, so no one context holds a whole film of waiting notes.
const SR = 48000;
const BODY = { cat: 1, frog: 1.1, sahur: 0.7, thiccums: 0.78, seal: 0.78, r3tards: 1.3 };
const HEAVY = new Set(['step', 'hop', 'land', 'jump', 'thud']);
async function mixSfx(from, to) {
  const { buildGraph, play } = await import('/sound-engine.mjs');
  const t0 = from / FPS, t1 = to / FPS;
  const total = Math.ceil((t1 - t0 + 0.5) * SR);
  const L = new Float32Array(total), R = new Float32Array(total);
  const SEG = 8, TAIL = 9;
  const events = T.sfx.filter((e) => e.at >= t0 - 0.001 && e.at < t1).sort((a, b) => a.at - b.at);
  const last = new Map();
  let made = 0, unknown = new Set();
  for (let s0 = t0; s0 < t1; s0 += SEG) {
    const evs = events.filter((e) => e.at >= s0 && e.at < s0 + SEG);
    if (!evs.length) continue;
    const ac = new OfflineAudioContext(2, (SEG + TAIL) * SR, SR);
    const g = buildGraph(ac, { on: true, music: 0, sfx: T.sfxLevel ?? 0.9 });
    for (const e of evs) {
      // the engine's own rules: the same sound twice within a moment is one sound; a heavy pet lands lower
      const prev = last.get(e.name);
      if (prev !== undefined && Math.abs(e.at - prev) < 0.03) continue;
      last.set(e.name, e.at);
      let o = { ...e.o }; delete o.delay;
      if ((o.v ?? 1) <= 0.001) continue;
      const body = BODY[o.who ?? ''];
      if (body && HEAVY.has(e.name)) o = { ...o, rate: (o.rate ?? 1) * body };
      const at = e.at - s0 + 0.01;
      const m = play(g, e.name, o, at);
      if (!m) { unknown.add(e.name); continue; }
      made += 1;
      if (e.stopAt !== undefined) {
        const st = Math.max(at + 0.02, e.stopAt - s0), tc = (e.fade ?? 120) / 3000;
        m.out.gain.setTargetAtTime(0, st, tc); m.wet.gain.setTargetAtTime(0, st, tc);
      }
    }
    const buf = await ac.startRendering();
    const a = buf.getChannelData(0), b = buf.getChannelData(1);
    const off = Math.round((s0 - t0) * SR);
    for (let i = 0; i < a.length && off + i < total; i += 1) { L[off + i] += a[i]; R[off + i] += b[i]; }
  }
  let peak = 0;
  for (let i = 0; i < total; i += 1) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (p > peak) peak = p; }
  const k = peak > 0 ? Math.min(4, (T.sfxPeak ?? 0.8) / peak) : 1;
  for (let i = 0; i < total; i += 1) { L[i] *= k; R[i] *= k; }
  return { L, R, made, peak, gain: k, unknown: [...unknown] };
}
// ---------- the emo cut's soundtrack (T.song): tools/trailer/emo-song.js, served as /emo-song.js ----------
let SONG_MOD = null;
const songMod = async () => (SONG_MOD ??= await import('/emo-song.js'));
async function renderSong(t0, t1, only = null) { return (await songMod()).renderSong(T, t0, t1, { only }); }
/** the pets' sounds and the song together: the song under, everything through a soft limiter */
async function mixAll(from, to) {
  const fx = await mixSfx(from, to);
  if (!T.song) { tailFade(fx.L, fx.R, fx.L.length); return fx; }
  const song = await renderSong(from / FPS, to / FPS);
  // the song set by its loudness, not its peaks: its loud stretches (the 90th percentile of 400 ms windows) at
  // T.songLevel dBFS; the limiter below catches what stands out
  let peak = 0; for (let i = 0; i < song.L.length; i += 1) peak = Math.max(peak, Math.abs(song.L[i]), Math.abs(song.R[i]));
  const win = Math.round(0.4 * SR), rms = [];
  for (let i = 0; i + win <= song.L.length; i += win) { let q = 0; for (let j = i; j < i + win; j += 1) q += song.L[j] * song.L[j] + song.R[j] * song.R[j]; rms.push(Math.sqrt(q / (2 * win))); }
  rms.sort((a, b) => a - b);
  const loud = rms[Math.floor(rms.length * 0.9)] || 1;
  const k = 10 ** ((T.songLevel ?? -16) / 20) / loud;
  const n = Math.min(fx.L.length, song.L.length);
  // a section of the song can sit lower under the pets (`duck`, dB), eased in and out over a tenth of a second
  const duck = new Float32Array(n).fill(1);
  const B = (T.beat ?? 30) / FPS;
  for (const sec of T.song) {
    if (!sec.duck) continue;
    const g = 10 ** (sec.duck / 20), a = Math.round((sec.at * B - from / FPS) * SR), b = Math.round(((sec.at + sec.beats) * B - from / FPS) * SR), r = Math.round(0.1 * SR);
    for (let i = Math.max(0, a - r); i < Math.min(n, b + r); i += 1) { const e = Math.min(1, (i - (a - r)) / r, ((b + r) - i) / r); duck[i] = Math.min(duck[i], 1 - (1 - g) * Math.max(0, e)); }
  }
  for (let i = 0; i < n; i += 1) { fx.L[i] += song.L[i] * k * duck[i]; fx.R[i] += song.R[i] * k * duck[i]; }
  const gr = limit(fx.L, fx.R, n);
  tailFade(fx.L, fx.R, n);
  return { ...fx, song: { made: song.made, peak, gain: k, limited: gr } };
}
/** the last 40 ms down to nothing, so the file never stops on a sample that is not silent (a click at the very end) */
function tailFade(L, R, n) {
  const f = Math.min(n, Math.round(0.04 * SR));
  for (let i = 0; i < f; i += 1) { const v = i / f; L[n - 1 - i] *= v; R[n - 1 - i] *= v; }
}
/**
 * A look-ahead peak limiter: nothing over the ceiling (-1 dBFS), the gain coming down 3 ms before a peak arrives and
 * going back up over ~120 ms, so it ducks instead of clipping. Returns the most it took off, in dB.
 */
function limit(L, R, n, ceil = 0.891) {
  const BL = 48, look = 3, rel = Math.exp(-BL / (0.12 * SR));
  const blocks = Math.ceil(n / BL), need = new Float32Array(blocks);
  for (let b = 0; b < blocks; b += 1) { let pk = 0; for (let i = b * BL; i < Math.min(n, (b + 1) * BL); i += 1) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); need[b] = pk > ceil ? ceil / pk : 1; }
  const g = new Float32Array(blocks + 1); let cur = 1, most = 1;
  for (let b = 0; b < blocks; b += 1) {
    let m = 1; for (let k = b; k <= Math.min(blocks - 1, b + look); k += 1) m = Math.min(m, need[k]);
    cur = m < cur ? m : 1 - (1 - cur) * rel;
    if (cur > m) cur = m;
    g[b] = cur; most = Math.min(most, cur);
  }
  g[blocks] = g[blocks - 1] ?? 1;
  for (let b = 0; b < blocks; b += 1) { const a = g[b], c = g[b + 1]; for (let i = b * BL, j = 0; i < Math.min(n, (b + 1) * BL); i += 1, j += 1) { const v = a + (c - a) * (j / BL); L[i] *= v; R[i] *= v; } }
  // (the interpolation between blocks can leave a sample a hair over: a final safety)
  for (let i = 0; i < n; i += 1) { if (L[i] > ceil) L[i] = ceil; else if (L[i] < -ceil) L[i] = -ceil; if (R[i] > ceil) R[i] = ceil; else if (R[i] < -ceil) R[i] = -ceil; }
  return 20 * Math.log10(most);
}
/** the song alone, set and limited as the film has it (render.mjs songwav: to listen to, or to measure) */
window.songOnly = async (from, to) => {
  if (!T) await setup();
  const song = await renderSong(from / FPS, to / FPS);
  const n = song.L.length, win = Math.round(0.4 * SR), rms = [];
  for (let i = 0; i + win <= n; i += win) { let q = 0; for (let j = i; j < i + win; j += 1) q += song.L[j] * song.L[j] + song.R[j] * song.R[j]; rms.push(Math.sqrt(q / (2 * win))); }
  rms.sort((a, b) => a - b);
  const k = 10 ** ((T.songLevel ?? -16) / 20) / (rms[Math.floor(rms.length * 0.9)] || 1);
  for (let i = 0; i < n; i += 1) { song.L[i] *= k; song.R[i] *= k; }
  const gr = limit(song.L, song.R, n);
  await post('sfx', wavOf(song.L, song.R));
  return { limited: gr };
};
/** loudness of each stem a tenth of a second at a time (for balancing the song): { stem: [rms...] } */
window.songStems = async (from, to) => {
  if (!T) await setup();
  const out = {};
  for (const stem of (await songMod()).STEMS) {
    const m = await renderSong(from / FPS, to / FPS, stem);
    const step = SR / 10, lv = [];
    let pk = 0;
    for (let i = 0; i + step <= m.L.length; i += step) { let s = 0; for (let j = i; j < i + step; j += 1) { const v = (m.L[j] + m.R[j]) / 2; s += v * v; pk = Math.max(pk, Math.abs(m.L[j]), Math.abs(m.R[j])); } lv.push(Math.round(Math.sqrt(s / step) * 1000) / 1000); }
    out[stem] = { levels: lv, peak: pk };
  }
  return out;
};
function wavOf(L, R) {
  const n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i += 1) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return new Uint8Array(out.buffer);
}
async function post(name, buf) {
  const PIECE = 8 << 20;
  for (let o = 0, i = 0; o < buf.length; o += PIECE, i += 1) {
    const r = await fetch(`/out?name=${encodeURIComponent(name)}&part=${i}`, { method: 'POST', body: buf.subarray(o, Math.min(buf.length, o + PIECE)) });
    if (!r.ok) throw new Error('the server refused a piece of the film');
  }
}
/** how loud the mix is, a tenth of a second at a time (for checking it against the picture) */
window.sfxLevels = async (from, to) => {
  if (!T) await setup();
  const m = await mixAll(from, to);
  const step = SR / 10, out = [];
  for (let i = 0; i + step <= m.L.length; i += step) { let s = 0; for (let j = i; j < i + step; j += 1) s += m.L[j] * m.L[j] + m.R[j] * m.R[j]; out.push(Math.round(Math.sqrt(s / step / 2) * 1000) / 1000); }
  return { levels: out, made: m.made, peak: m.peak, gain: m.gain, unknown: m.unknown };
};

/** frames [from, to) encoded to an MP4, posted to the server in pieces */
window.render = async (from, to, { mbps = 16, name = 'out', fps = FPS, height = H } = {}) => {
  // a smaller picture (height 720) for a copy that has to be small: drawn at full size, scaled down for the encoder
  const OW = Math.round(W * height / H / 2) * 2, OH = height;
  const small = OH === H ? null : Object.assign(document.createElement('canvas'), { width: OW, height: OH });
  const sx = small ? small.getContext('2d', { alpha: false }) : null;
  if (sx) sx.imageSmoothingQuality = 'high';
  const skip = Math.max(1, Math.round(FPS / fps));   // fps 30: every other frame, for a smaller file
  if (!T) await setup();
  const { Muxer, ArrayBufferTarget } = await import('/mp4-muxer.mjs');
  // the sound first: mixed, kept as a WAV beside the film, and encoded for its own track
  let sound = null, audioCodec = null;
  if (T.sfx?.length || T.song) {
    sound = await mixAll(from, to);
    for (const [codec, c] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
      if ((await AudioEncoder.isConfigSupported({ codec: c, sampleRate: SR, numberOfChannels: 2, bitrate: 192000 })).supported) { audioCodec = [codec, c]; break; }
    }
    if (!audioCodec) throw new Error('this browser cannot encode the sound');
    await post('sfx', wavOf(sound.L, sound.R));
  }
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: OW, height: OH, frameRate: FPS / skip }, ...(sound ? { audio: { codec: audioCodec[0], numberOfChannels: 2, sampleRate: SR } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  if (sound) {
    let bad = null;
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { bad = e; } });
    aenc.configure({ codec: audioCodec[1], sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });
    const N = 4800, len = Math.round((to - from) / FPS * SR);
    for (let i = 0; i < len; i += N) {
      const n = Math.min(N, len - i);
      const data = new Float32Array(n * 2);
      data.set(sound.L.subarray(i, i + n), 0); data.set(sound.R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush();
    if (bad) throw bad;
  }
  let failed = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  const base = { width: OW, height: OH, bitrate: mbps * 1e6, framerate: FPS / skip, latencyMode: 'quality', bitrateMode: 'variable', avc: { format: 'avc' } };
  let config = null;
  for (const codec of ['avc1.640033', 'avc1.64002A', 'avc1.4D402A', 'avc1.42E02A']) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const c = { ...base, codec, hardwareAcceleration };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; }
    }
    if (config) break;
  }
  if (!config) throw new Error('this browser has no H.264 encoder for 1080p60');
  enc.configure(config);
  const cuts = new Set(T.clips.map((c) => c.start));
  const t0 = performance.now();
  for (let n = from; n < to; n += skip) {
    if (failed) throw failed;
    await draw(n);
    if (sx) sx.drawImage(cv, 0, 0, OW, OH);
    const vf = new VideoFrame(small ?? cv, { timestamp: Math.round((n - from) * 1e6 / FPS), duration: Math.round(skip * 1e6 / FPS) });
    enc.encode(vf, { keyFrame: n === from || cuts.has(n) || (skip > 1 && cuts.has(n - 1)) || (n - from) % 120 === 0 });
    vf.close();
    while (enc.encodeQueueSize > 6) await new Promise((r) => { enc.addEventListener('dequeue', r, { once: true }); });
    if ((n - from) % 60 === 0) window.__progress = { n, of: to - from, s: (performance.now() - t0) / 1000 };
  }
  await enc.flush();
  if (failed) throw failed;
  muxer.finalize();
  const buf = new Uint8Array(muxer.target.buffer);
  await post(name, buf);
  return { bytes: buf.length, codec: config.codec, hw: config.hardwareAcceleration, seconds: (performance.now() - t0) / 1000, sound: sound ? { codec: audioCodec[0], sounds: sound.made, peak: sound.peak, gain: sound.gain, unknown: sound.unknown } : null };
};
window.__ready = true;
