/**
 * The fight card (2026-10-02; operator: "a sharable fight card image would be great ... so users can download or
 * copy it to share but no posting on our end"): a 1200x630 picture of one decided fight, drawn in the browser like
 * the pet share card (ui/shareCard.ts). Both pets as they are dressed, the winner lit and ringed in gold, the loser in
 * the dark with a black eye's worth of grey, the pot, the stakes, and the proof line: decided by Pyth Entropy, 50/50.
 * Nothing is posted anywhere: the sheet (FightShare in FightClubPage.tsx) copies it or downloads it, that is all.
 */
import type { CatView } from '@emo-pets/chain';
import { PETS, fallbackName } from '../pets';
import { costumePortrait, plainPortrait, portraitSetOf } from '../items';
import { loadPortrait } from '../ui/shareCard';
import { mon, winnerSide, type Fight, type PetRef } from './chain';

export const W = 1200;
export const H = 630;
const FONT = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';
const BOX = 306;                         // a portrait's frame
const TOP = 182;                         // the frames' top
const LEFT = 118, RIGHT = W - 118 - BOX; // the two frames' left edges

type View = CatView & { worn?: number[] };
export type Sides = { winner: PetRef; loser: PetRef };

const rounded = (x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) => {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
};
const fit = (x: CanvasRenderingContext2D, text: string, max: number) => { let t = text; while (t.length > 3 && x.measureText(t).width > max) t = t.slice(0, -2) + '…'; return t; };

/** Who won and who lost, from the fight's random number (the challenger on an even one). */
export const sidesOf = (f: Fight): Sides | null => {
  if (f.status !== 'fought' || !f.random || !f.acceptorPet) return null;
  const a = winnerSide(f.random) === 0;
  return { winner: a ? f.challengerPet : f.acceptorPet, loser: a ? f.acceptorPet : f.challengerPet };
};

/** The pet's portrait as it is dressed, in the mood the fight left it in. */
const portraitUrl = (p: PetRef, v: View | undefined, mood: 'happy' | 'sad') => {
  const character = PETS[p.col].character;
  const crowned = !!v?.crowned;
  const set = portraitSetOf(v?.worn, character);
  return set ? costumePortrait(set, mood, crowned, character) : plainPortrait(mood, crowned, character);
};

const nameOf = (p: PetRef, v: View | undefined) => v?.name || fallbackName(p.col, p.id);

/** Draw the whole card. `views` by `col:id`, as the page has them (names, crowns, outfits); a missing view still draws. */
export function paintFightCard(x: CanvasRenderingContext2D, f: Fight, sides: Sides, views: Record<string, View | undefined>, imgs: { winner: HTMLImageElement | null; loser: HTMLImageElement | null }) {
  const vw = views[`${sides.winner.col}:${sides.winner.id}`], vl = views[`${sides.loser.col}:${sides.loser.id}`];
  const winnerLeft = sides.winner.col === f.challengerPet.col && sides.winner.id === f.challengerPet.id;   // the challenger stands on the left, as in the ring
  const wx = winnerLeft ? LEFT : RIGHT, lx = winnerLeft ? RIGHT : LEFT;

  // the basement: brick-dark, one lamp over the ring
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120a16'); bg.addColorStop(1, '#1f1322');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const lamp = x.createRadialGradient(W / 2, 40, 20, W / 2, 40, 560);
  lamp.addColorStop(0, 'rgba(255,214,140,0.30)'); lamp.addColorStop(0.5, 'rgba(255,214,140,0.08)'); lamp.addColorStop(1, 'rgba(255,214,140,0)');
  x.fillStyle = lamp; x.fillRect(0, 0, W, H);
  // the floor and the chalk ring
  const floor = x.createLinearGradient(0, H * 0.76, 0, H);
  floor.addColorStop(0, '#2a1c2a'); floor.addColorStop(1, '#150d17');
  x.fillStyle = floor; x.fillRect(0, H * 0.78, W, H);
  x.strokeStyle = 'rgba(248,248,255,0.22)'; x.lineWidth = 5; x.setLineDash([]);
  x.beginPath(); x.ellipse(W / 2, TOP + BOX + 6, 470, 44, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(248,248,255,0.08)'; x.lineWidth = 2;
  x.beginPath(); x.ellipse(W / 2, TOP + BOX + 6, 440, 36, 0, 0, Math.PI * 2); x.stroke();
  // the ring's ropes, a hint of them
  x.strokeStyle = 'rgba(232,77,127,0.35)'; x.lineWidth = 3;
  for (const yy of [TOP + BOX * 0.55, TOP + BOX * 0.68, TOP + BOX * 0.81]) { x.beginPath(); x.moveTo(0, yy); x.lineTo(LEFT - 40, yy); x.moveTo(RIGHT + BOX + 40, yy); x.lineTo(W, yy); x.stroke(); }

  // the heading
  x.textBaseline = 'alphabetic'; x.textAlign = 'center';
  x.font = `700 17px ${FONT}`; x.fillStyle = '#FFB3CB';
  x.letterSpacing = '0.14em'; x.fillText('EMOGOTCHI FIGHT CLUB', W / 2, 62); x.letterSpacing = '0px';
  const title = `${nameOf(sides.winner, vw)} beat ${nameOf(sides.loser, vl)}`;
  x.font = `700 ${title.length > 26 ? 44 : 56}px ${FONT}`; x.fillStyle = '#F8F8FF';
  x.fillText(fit(x, title, W - 160), W / 2, 124);
  x.font = `500 21px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.68)';
  x.fillText(`Fight #${f.id}  ·  ${mon(f.stake)} MON a side  ·  the winner took ${mon(f.payout)} MON`, W / 2, 160);

  // the two portraits
  const frame = (fx: number, img: HTMLImageElement | null, won: boolean) => {
    x.save();
    if (won) { x.shadowColor = 'rgba(255,196,77,0.55)'; x.shadowBlur = 60; } else { x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 30; x.shadowOffsetY = 8; }
    x.fillStyle = '#24123f'; rounded(x, fx, TOP, BOX, BOX, 26); x.fill();
    x.restore();
    x.save(); rounded(x, fx, TOP, BOX, BOX, 26); x.clip();
    if (img) x.drawImage(img, fx, TOP, BOX, BOX);
    if (!won) { x.fillStyle = 'rgba(10,4,14,0.42)'; x.fillRect(fx, TOP, BOX, BOX); }
    x.restore();
    if (won) {
      const gold = x.createLinearGradient(fx, TOP, fx + BOX, TOP + BOX);
      gold.addColorStop(0, '#FFE08A'); gold.addColorStop(0.5, '#E0AE3E'); gold.addColorStop(1, '#FFD36B');
      x.strokeStyle = gold; x.lineWidth = 6; rounded(x, fx + 3, TOP + 3, BOX - 6, BOX - 6, 23); x.stroke();
    } else { x.strokeStyle = 'rgba(184,148,216,0.3)'; x.lineWidth = 2; rounded(x, fx + 1, TOP + 1, BOX - 2, BOX - 2, 25); x.stroke(); }
  };
  frame(wx, imgs.winner, true);
  frame(lx, imgs.loser, false);

  // the ribbons under them
  const ribbon = (fx: number, text: string, won: boolean) => {
    x.font = `800 15px ${FONT}`; x.letterSpacing = '0.12em';
    const tw = x.measureText(text).width + 36;
    const rx = fx + BOX / 2 - tw / 2, ry = TOP + BOX - 18;
    x.fillStyle = won ? '#E0AE3E' : 'rgba(26,22,32,0.96)';
    rounded(x, rx, ry, tw, 34, 17); x.fill();
    if (!won) { x.strokeStyle = 'rgba(248,248,255,0.25)'; x.lineWidth = 1.5; x.stroke(); }
    x.fillStyle = won ? '#2a1a05' : 'rgba(248,248,255,0.7)';
    x.fillText(text, fx + BOX / 2, ry + 23);
    x.letterSpacing = '0px';
  };
  ribbon(wx, `WINNER  +${mon(f.payout)} MON`, true);
  ribbon(lx, `LOST  ${mon(f.stake)} MON`, false);
  // the names, with what each pet is, on one line under the ribbons
  const under = (fx: number, p: PetRef, v: View | undefined) => {
    const name = fit(x, nameOf(p, v), BOX - 110), tail = v?.name ? `  ·  ${PETS[p.col].kind} #${p.id}` : '';   // an unnamed pet's name already says which it is
    x.font = `700 22px ${FONT}`; const nw = x.measureText(name).width;
    x.font = `500 15px ${FONT}`; const tw = x.measureText(tail).width;
    const left = fx + BOX / 2 - (nw + tw) / 2;
    x.textAlign = 'start';
    x.font = `700 22px ${FONT}`; x.fillStyle = '#F8F8FF'; x.fillText(name, left, TOP + BOX + 54);
    x.font = `500 15px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.5)'; x.fillText(tail, left + nw, TOP + BOX + 54);
    x.textAlign = 'center';
  };
  under(wx, sides.winner, vw); under(lx, sides.loser, vl);

  // VS between them
  x.font = `800 54px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.16)';
  x.fillText('VS', W / 2, TOP + BOX / 2 + 20);

  // the proof, and the site
  x.font = `500 16px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.5)';
  x.fillText('Decided by Pyth Entropy on Monad: a random number nobody could see or change. 50/50.', W / 2, H - 48);
  x.font = `700 18px ${FONT}`; x.fillStyle = '#EAC6EA';
  x.fillText('emogotchi.emonad.lol/fightclub', W / 2, H - 20);
  x.textAlign = 'start';
}

/** The card as a PNG. */
export async function renderFightCard(f: Fight, views: Record<string, View | undefined>): Promise<Blob> {
  const sides = sidesOf(f);
  if (!sides) throw new Error('This fight has not been decided.');
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  const vw = views[`${sides.winner.col}:${sides.winner.id}`], vl = views[`${sides.loser.col}:${sides.loser.id}`];
  const [winner, loser] = await Promise.all([
    loadPortrait({ url: portraitUrl(sides.winner, vw, 'happy') }).catch(() => null),
    loadPortrait({ url: portraitUrl(sides.loser, vl, 'sad') }).catch(() => null),
  ]);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  paintFightCard(x, f, sides, views, { winner, loser });
  return new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('could not make the image'))), 'image/png'));
}

/** The file's name: who beat whom. */
export const fightCardName = (f: Fight, views: Record<string, View | undefined>) => {
  const s = sidesOf(f);
  const slug = (t: string) => t.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return s ? `fight-${f.id}-${slug(nameOf(s.winner, views[`${s.winner.col}:${s.winner.id}`]))}-beat-${slug(nameOf(s.loser, views[`${s.loser.col}:${s.loser.id}`]))}.png` : `fight-${f.id}.png`;
};
