/**
 * The emo pack's items as its page and its banner in the shop show them: the shop ids, terms and card pictures are
 * items.ts's (EMO_PACK, the paid edition at 18-24; EMO_HOLDERS_PACK, the holders' at 25-31); this adds what each one does
 * on a pet, in a line, and how the page's live room tries it. The cards are the pictures stored on chain (written by
 * tools/items/emo-cards.mjs), served from /brand/emo/; the hero is tools/emo-promo.mjs's.
 */
import { EMO_HOLDERS_PACK, EMO_HOLD_EMO, EMO_PACK, EMO_PRICE_MON } from '../items';

export const EMO_HERO = '/brand/emo-pack.png';
export const EMO_PRICE = EMO_PRICE_MON;   // MON, the paid edition
export const EMO_HOLD = EMO_HOLD_EMO;     // $EMO, the holders' edition

export type EmoTry = { kind: 'wear'; costume: 'beanie' | 'emofit' | 'wristbands' | 'piercings' } | { kind: 'room' } | { kind: 'toy' } | { kind: 'move' };
export type EmoItem = { key: string; label: string; id: number; holderId: number; card: string; holder: string; does: string; tryIt: EmoTry };

const DOES: Record<string, { does: string; tryIt: EmoTry }> = {
  beanie: { tryIt: { kind: 'wear', costume: 'beanie' },
    does: 'A black slouch beanie with a ribbed cuff and a broken-heart patch, the black emo hair under it. Crowned pets wear the crown on top.' },
  fit: { tryIt: { kind: 'wear', costume: 'emofit' },
    does: 'The fit, cut for each pet: stripes under a band tee, a zip hoodie, skinny jeans and a studded belt, checkered slip-ons. An outfit, one at a time.' },
  wristbands: { tryIt: { kind: 'wear', costume: 'wristbands' },
    does: 'Purple sweatbands with a white stripe, on both wrists. Goes with anything. (The cat already wears hers.)' },
  piercings: { tryIt: { kind: 'wear', costume: 'piercings' },
    does: 'Snakebites: two silver hoops through the lower lip, on every mouth your pet makes. Gold when your pet is crowned.' },
  bedroom: { tryIt: { kind: 'room' },
    does: 'A room theme: fairy lights, rain on the window, posters, a lava lamp, an old monitor with eight friends on it. With its own tune.' },
  guitar: { tryIt: { kind: 'toy' },
    does: 'Play brings a guitar down from the sky: your pet picks it up, shreds with a band behind it and throws it away.' },
  selfie: { tryIt: { kind: 'move' },
    does: 'Pet becomes a mirror selfie: a flip phone falls in, three poses, a flash, and it gets thrown. A tap on your pet is still a quick pet.' },
};

export const EMO_ITEMS: EmoItem[] = EMO_PACK.items.map((it, i) => {
  const h = EMO_HOLDERS_PACK.items[i]!;
  return { key: it.key, label: it.label, id: it.id, holderId: h.id, card: it.card, holder: h.card, ...DOES[it.key]! };
});
