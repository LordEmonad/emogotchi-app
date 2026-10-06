/**
 * A person's link card: the 1200x630 picture shown when their /u/ link is shared (operator, 2026-09-27: "what if it
 * was the users person og card"). Drawn here, on a canvas, from their banner, their picture (or their pet), their name
 * and their pets' heads, then uploaded as a picture of kind 'card' (pics.ts): the Worker has Cloudflare remake it as a
 * JPEG, screens it like any picture, and the /u/ preview points at it (worker/social/preview.js). Nothing on it goes
 * stale by the day (no counts): it is redrawn when the profile changes, and once a week for the pets.
 *
 * Their own uploaded pictures are fetched through the API with the session (a blob, same origin), so the canvas is
 * never tainted and the media host needs no CORS.
 */
import type { CatView } from '@emo-pets/chain';
import { costumePortrait, plainPortrait, portraitSetOf } from '../items';
import { characterOf } from '../pets';
import { BANNER_SRC } from './banners';
import { uploadPic } from './pics';
import type { Profile } from './types';
import { avatarSrc, short } from './ui';

const W = 1200, H = 630;
const FONT = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';
const PINK = '#E84D7F', NIGHT = '#120a22';
const WEEK = 7 * 86_400_000;

const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.decoding = 'async';
  i.onload = () => res(i); i.onerror = () => rej(new Error(`could not load ${src.slice(0, 60)}`)); i.src = src;
});
/** one of their own uploaded pictures, through the API (live or still waiting: it is theirs) */
async function own(id: string): Promise<HTMLImageElement> {
  const r = await fetch(`/api/social/pic/view/${id}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error('picture unavailable');
  return load(URL.createObjectURL(await r.blob()));
}
const free = (i: HTMLImageElement | null) => { if (i?.src.startsWith('blob:')) URL.revokeObjectURL(i.src); };
/** draw `img` to cover the box, centred (a share of the spare room given by ax, ay) */
function cover(x: CanvasRenderingContext2D, img: HTMLImageElement, l: number, t: number, w: number, h: number, ax = 0.5, ay = 0.5) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  x.drawImage(img, l + (w - dw) * ax, t + (h - dh) * ay, dw, dh);
}
function pill(x: CanvasRenderingContext2D, text: string, l: number, t: number, size: number, alignRight = false) {
  x.font = `700 ${size}px ${FONT}`;
  const w = x.measureText(text).width + size * 1.3, h = size * 1.9;
  const left = alignRight ? l - w : l;
  x.fillStyle = 'rgba(14, 7, 26, 0.74)'; x.beginPath(); x.roundRect(left, t, w, h, h / 2); x.fill();
  x.strokeStyle = 'rgba(234, 198, 234, 0.22)'; x.lineWidth = 1.5; x.stroke();
  x.fillStyle = '#F8F8FF'; x.textBaseline = 'middle'; x.fillText(text, left + size * 0.65, t + h / 2 + 1);
}

/** The card, as an image file (WebP where the browser can make one, else JPEG). */
export async function drawLinkCard(p: Profile, pets: CatView[] | null, worn: Record<string, number[]>): Promise<Blob> {
  await Promise.all([document.fonts.load(`700 84px ${FONT}`), document.fonts.load(`500 30px ${FONT}`)]).catch(() => {});
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const avatarPet = p.avatar ?? (pets?.[0] ? { col: pets[0].col, id: pets[0].id } : null);
  const avatarView = avatarPet ? pets?.find((v) => v.col === avatarPet.col && v.id === avatarPet.id) ?? null : null;
  const [banner, face, heads] = await Promise.all([
    (p.held?.banner ? own(p.held.banner) : p.bannerPic ? own(p.bannerPic) : load(BANNER_SRC(p.banner))).catch(() => load(BANNER_SRC(p.banner))),
    (p.held?.avatar ? own(p.held.avatar) : p.pic ? own(p.pic) : null)?.catch(() => null) ?? null,
    Promise.all((pets ?? []).slice(0, 6).map((v) => { const s = avatarSrc({ col: v.col, id: v.id }, v, worn[`${v.col}:${v.id}`]); return s ? load(s).catch(() => null) : Promise.resolve(null); })),
  ]);
  // the pet in the ring when there is no picture of their own: its wallet portrait, in its look and mood right now
  let portrait: HTMLImageElement | null = null;
  if (!face && avatarPet) {
    const ch = characterOf(avatarPet.col);
    const mood = avatarView ? (avatarView.alive ? avatarView.mood : 'dead') : 'content';
    const dressed = portraitSetOf(worn[`${avatarPet.col}:${avatarPet.id}`], ch);   // its outfit, else the pack's accessories, else the emo hair
    portrait = await load(dressed ? costumePortrait(dressed, mood, !!avatarView?.crowned, ch) : plainPortrait(mood, !!avatarView?.crowned, ch)).catch(() => null);
  }

  // night, and the banner across the top fading into it
  x.fillStyle = NIGHT; x.fillRect(0, 0, W, H);
  x.save(); x.beginPath(); x.rect(0, 0, W, 430); x.clip(); cover(x, banner, 0, 0, W, 430, 0.5, 0.6); x.restore();
  const fade = x.createLinearGradient(0, 200, 0, 432);
  fade.addColorStop(0, 'rgba(18, 10, 34, 0)'); fade.addColorStop(0.72, 'rgba(18, 10, 34, 0.82)'); fade.addColorStop(1, NIGHT);
  x.fillStyle = fade; x.fillRect(0, 200, W, 232);
  const glow = x.createRadialGradient(W * 0.72, H, 0, W * 0.72, H, 520);
  glow.addColorStop(0, 'rgba(232, 77, 127, 0.16)'); glow.addColorStop(1, 'rgba(232, 77, 127, 0)');
  x.fillStyle = glow; x.fillRect(0, 300, W, H - 300);

  // the ring and what is in it
  const cx = 214, cy = 432, r = 150;
  x.fillStyle = 'rgba(232, 77, 127, 0.75)'; x.beginPath(); x.arc(cx, cy, r + 13, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1a1420'; x.beginPath(); x.arc(cx, cy, r + 7, 0, Math.PI * 2); x.fill();
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.clip();
  const well = x.createRadialGradient(cx, cy - r * 0.25, 0, cx, cy, r); well.addColorStop(0, '#4a2a6e'); well.addColorStop(1, '#1c0f30');
  x.fillStyle = well; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (face) cover(x, face, cx - r, cy - r, r * 2, r * 2);
  else if (portrait) x.drawImage(portrait, cx - r * 1.12, cy - r * 1.02, r * 2.24, r * 2.24);
  x.restore();

  // who, in the site's own type
  const name = p.name ?? short(p.address);
  let size = 86;
  x.font = `700 ${size}px ${FONT}`;
  while (x.measureText(name).width > 740 && size > 40) { size -= 2; x.font = `700 ${size}px ${FONT}`; }
  x.fillStyle = '#F8F8FF'; x.textBaseline = 'alphabetic';
  x.shadowColor = 'rgba(0, 0, 0, 0.45)'; x.shadowBlur = 18;
  x.fillText(name, 404, 468);
  x.shadowBlur = 0;
  x.font = `500 30px ${FONT}`; x.fillStyle = 'rgba(234, 198, 234, 0.9)';
  x.fillText(`lives in Emotown${p.resident ? ` · resident #${p.resident}` : ''}`, 406, 514);

  // their pets
  const shown = heads.filter((h): h is HTMLImageElement => !!h);
  shown.forEach((img, i) => {
    const hx = 438 + i * 74, hy = 572, hr = 30;
    x.fillStyle = '#2a1846'; x.beginPath(); x.arc(hx, hy, hr + 3, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(hx, hy, hr, 0, Math.PI * 2); x.clip(); cover(x, img, hx - hr, hy - hr, hr * 2, hr * 2); x.restore();
    x.strokeStyle = 'rgba(234, 198, 234, 0.22)'; x.lineWidth = 2; x.beginPath(); x.arc(hx, hy, hr + 3, 0, Math.PI * 2); x.stroke();
  });
  const more = (pets?.length ?? 0) - shown.length;
  if (more > 0 && shown.length) { x.font = `700 24px ${FONT}`; x.fillStyle = 'rgba(248, 248, 255, 0.7)'; x.textBaseline = 'middle'; x.fillText(`+${more}`, 438 + shown.length * 74 - 18, 573); }

  // the town's name and their link
  pill(x, 'Emotown', 40, 34, 30);
  pill(x, `emogotchi.emonad.lol/u/${p.name ?? p.address}`.slice(0, 48), W - 40, 34, 22, true);

  for (const i of [banner, face, portrait, ...heads]) free(i);
  const as = (type: string) => new Promise<Blob | null>((res) => c.toBlob(res, type, 0.92));
  const webp = await as('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await as('image/jpeg');
  if (!jpeg) throw new Error('could not make the card');
  return jpeg;
}

/** Their card needs drawing: none yet, the profile changed since, or a week has passed (their pets may have changed). */
export const cardIsStale = (p: Profile) => !p.held?.card || p.held.card.at < (p.updatedAt ?? 0) || Date.now() - p.held.card.at > WEEK;

let inflight: Promise<unknown> | null = null;
/** Draw and upload their card (one at a time). */
export function refreshLinkCard(p: Profile, pets: CatView[] | null, worn: Record<string, number[]>): Promise<unknown> {
  if (!inflight) inflight = drawLinkCard(p, pets, worn).then((blob) => uploadPic('card', blob)).finally(() => { inflight = null; });
  return inflight;
}
