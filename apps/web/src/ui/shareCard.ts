/**
 * The share card: a 1200x630 picture of one cat, drawn in the browser.
 *
 * There is no server, so this paints on a canvas: the room, the cat's own picture fetched from the
 * contract, and its real numbers. Canvas text uses fonts already loaded by the page, so the card
 * comes out in the site's typeface without embedding anything.
 *
 * The animated card is the same drawing with a moving portrait, so everything except the picture in
 * the frame lives in `paintCard` and both callers share it. Change the card once, change it for both.
 */
import { PETS, anA, fallbackName, petHref } from '../pets';
import type { CatView } from '@emo-pets/chain';

export const W = 1200;
export const H = 630;
/** The frame the cat sits in, the one thing that differs between the still card and the video. */
export const PORTRAIT = { x: 50, y: (H - 500) / 2, size: 500, r: 28 };
const FONT = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';

const rounded = (x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) => {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
};

/** The cat's SVG as an <img>, ready to draw. */
export const loadSvg = (svg: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('could not draw the cat'));
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
});

/**
 * The whole card except the picture itself. `portrait` is called with the context already clipped to
 * the rounded frame, so it can draw a still picture or one frame of an animation into the same box.
 */
export function paintCard(x: CanvasRenderingContext2D, cat: CatView, portrait: (x: CanvasRenderingContext2D) => void) {
  // room
  const bg = x.createRadialGradient(W * 0.5, H * 0.2, 0, W * 0.5, H * 0.2, W * 0.75);
  bg.addColorStop(0, '#3a1f5c'); bg.addColorStop(0.55, '#24123f'); bg.addColorStop(1, '#170b2a');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(234,198,234,0.10)';
  for (let gy = 22; gy < H * 0.8; gy += 44) for (let gx = 22; gx < W; gx += 44) { x.beginPath(); x.arc(gx, gy, 2.4, 0, 7); x.fill(); }
  const floor = x.createLinearGradient(0, H * 0.82, 0, H);
  floor.addColorStop(0, '#2c1a44'); floor.addColorStop(1, '#150a24');
  x.fillStyle = floor; x.beginPath(); x.ellipse(W / 2, H * 0.92 + 120, W * 0.85, 150, 0, Math.PI, 0); x.fill();
  x.fillStyle = floor; x.fillRect(0, H * 0.92, W, H);

  // The cat, left. Its picture carries its own room, so rather than trying to hide the seam against
  // ours it is framed like a portrait: rounded, with a soft edge and a shadow under it.
  const { x: px, y: py, size, r } = PORTRAIT;
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 40; x.shadowOffsetY = 10;
  x.fillStyle = '#24123f'; rounded(x, px, py, size, size, r); x.fill();
  x.restore();
  x.save(); rounded(x, px, py, size, size, r); x.clip();
  portrait(x);
  x.restore();
  x.strokeStyle = 'rgba(184,148,216,0.35)'; x.lineWidth = 2;
  rounded(x, px + 1, py + 1, size - 2, size - 2, r - 1); x.stroke();

  // copy, right
  const L = 580;
  const dead = !cat.alive;
  x.textBaseline = 'alphabetic';

  x.font = `600 20px ${FONT}`;
  x.fillStyle = '#EAC6EA';
  const P = PETS[cat.col];
  x.fillText(dead ? 'IN MEMORY OF' : cat.crowned ? '♛  WEARS THE CROWN' : `${anA(P.kind).toUpperCase()} ${P.kind.toUpperCase()} THAT LIVES IN A WALLET`, L, 132);

  const title = cat.name || fallbackName(cat.col, cat.id);
  x.font = `700 ${title.length > 16 ? 52 : 68}px ${FONT}`;
  x.fillStyle = '#F8F8FF';
  x.fillText(title.length > 24 ? title.slice(0, 23) + '…' : title, L, 200);

  x.font = `400 22px ${FONT}`;
  x.fillStyle = 'rgba(248,248,255,0.62)';
  x.fillText(`#${cat.id} · ${dead ? 'dead' : !cat.started ? `asleep until ${P.his} first week is up` : cat.mood}`, L, 236);

  // meters, only once the cat is actually running
  let y = 290;
  if (cat.alive && cat.started) {
    for (const [label, v] of [['FOOD', cat.food], ['CLEAN', cat.clean], ['FUN', cat.fun], ['ENERGY', cat.energy]] as const) {
      x.font = `600 14px ${FONT}`;
      x.fillStyle = 'rgba(248,248,255,0.5)';
      x.fillText(label, L, y);
      const bx = L + 90, bw = 400;
      x.fillStyle = 'rgba(255,255,255,0.12)'; rounded(x, bx, y - 11, bw, 10, 5); x.fill();
      const g = x.createLinearGradient(bx, 0, bx + bw, 0);
      if (v < 35) { g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#ff8f8f'); } else { g.addColorStop(0, '#B894D8'); g.addColorStop(1, '#E84D7F'); }
      x.fillStyle = g; rounded(x, bx, y - 11, Math.max(8, (bw * Math.max(0, Math.min(100, v))) / 100), 10, 5); x.fill();
      x.font = `600 14px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.5)';
      x.fillText(`${Math.round(v)}`, bx + bw + 14, y);
      y += 34;
    }
    y += 14;
  } else { y = 320; }

  // the record
  const stats: [string, string][] = cat.alive && cat.started
    ? [['CARE SCORE', cat.score.toFixed(0)], ['STREAK', `${cat.streak}d`], ['DAY', `${cat.day}`], ['MON SPENT', `${Math.round(Number(cat.monPaid) / 1e18)}`]]
    : dead
      ? [['FED', `${cat.feeds}`], ['PETTED', `${cat.pets}`], ['DEATHS', `${cat.deaths}`], ['MON SPENT', `${Math.round(Number(cat.monPaid) / 1e18)}`]]
      : [['FED', `${cat.feeds}`], ['WASHED', `${cat.washes}`], ['PLAYED', `${cat.plays}`], ['PETTED', `${cat.pets}`]];
  stats.forEach(([label, v], i) => {
    const sx = L + (i % 4) * 140;
    x.font = `700 30px ${FONT}`; x.fillStyle = '#F8F8FF'; x.fillText(v, sx, y + 30);
    x.font = `600 12px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.45)'; x.fillText(label, sx, y + 50);
  });

  // footer
  x.font = `600 18px ${FONT}`;
  x.fillStyle = 'rgba(234,198,234,0.75)';
  x.fillText('emogotchi.emonad.lol', L, H - 46);
  x.fillStyle = 'rgba(248,248,255,0.4)';
  x.font = `400 16px ${FONT}`;
  x.fillText('fully on chain · Monad', L + 232, H - 46);
}

export type Portrait = string | { url: string };
/** An <img> from SVG text or from a URL (the costumed portraits are PNGs on the site). */
export const loadPortrait = (p: Portrait) => (typeof p === 'string' ? loadSvg(p) : new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('could not draw the cat'));
  img.src = p.url;
}));

export async function renderShareCard(cat: CatView, svg: Portrait): Promise<Blob> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  let img: HTMLImageElement | null = null;
  try { img = await loadPortrait(svg); } catch { /* text-only card rather than no card */ }
  paintCard(x, cat, (c) => { if (img) c.drawImage(img, PORTRAIT.x, PORTRAIT.y, PORTRAIT.size, PORTRAIT.size); });
  return new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('could not make the image'))), 'image/png'));
}

/** The X composer, pre-filled. The image has to be attached by hand; X has no way to take it from us. */
export function shareText(cat: CatView): string {
  const P = PETS[cat.col];
  const frok = cat.col === 'frok'; const sahur = cat.col === 'sahur';
  const who = cat.name ? `${cat.name} (#${cat.id})` : fallbackName(cat.col, cat.id);
  const abused = cat.screenshots + cat.slaps + cat.squeezes + cat.burns;
  const line = !cat.alive
    ? `${who} is dead. I did this.`
    : !cat.started
      ? `${who} is asleep for ${P.his} first week. Then ${P.he === 'he' ? "he's" : "it's"} my problem.`
      : cat.crowned
        ? `${who} wears the crown. Care score ${cat.score.toFixed(0)}, ${cat.streak} day streak.`
        : frok
          ? `${who} · care score ${cat.score.toFixed(0)} · ${cat.streak} day streak · abused ${abused} times · still alive.`
          : sahur
            ? `${who} · care score ${cat.score.toFixed(0)} · ${cat.streak} day streak · tung tung tung ${cat.tungs} times · still alive.`
            : __THICCUMS__ && cat.col === 'thiccums'
              ? `${who} · care score ${cat.score.toFixed(0)} · ${cat.streak} day streak · bounced ${cat.bounces ?? 0} times · still alive.`
              : `${who} · care score ${cat.score.toFixed(0)} · ${cat.streak} day streak · still alive.`;
  return P.free
    ? `${line}\n\n${anA(P.kind)} ${P.kind} that lives in your wallet, fully on chain on @monad. Free to mint, one each.\n\nemogotchi.emonad.lol${petHref(cat.col, cat.id)}`
    : `${line}\n\nA cat that lives in your wallet, fully on chain on @monad.\n\nemogotchi.emonad.lol${petHref(cat.col, cat.id)}`;
}
