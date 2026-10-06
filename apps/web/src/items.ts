/**
 * What the site knows about items beyond what the contract says. The contract is pet-agnostic and
 * only stores an item's own picture; how an item looks *on* a cat is the site's business, so each
 * cosmetic the rig can draw is listed here by item id.
 */
import { formatEther } from 'viem';

import type { Character, Costume } from './pet/Pet';
import type { SceneName } from './scene/Scenery';
import type { PetMove, Toy } from './scene/director';

/** What the rig can put on a pet: an outfit by the rig's name, or the emo hair. */
export type Wearable = Costume | 'emohair';
/** Item id → the rig's costume name. Anything not listed is held but not drawn on the pet (yet).
 *  The Halloween outfits (pumpkin, mummy, zombie) are drawn and reviewed at /halloween; they get an id here once
 *  they are created in the shop. */
export const COSTUME_ITEMS: Record<number, Wearable> = { 1: 'witch', 3: 'emohair', 4: 'pumpkin', 5: 'mummy', 6: 'zombie', 8: 'kippah', 9: 'starofdavid', 13: 'keffiyeh', 14: 'bisht',
  // the emo pack: the paid edition (18-21) and the holders' (25-28) draw the same thing
  18: 'beanie', 19: 'emofit', 20: 'wristbands', 21: 'piercings', 25: 'beanie', 26: 'emofit', 27: 'wristbands', 28: 'piercings' };
export const WITCH = 1;
/** The Halloween outfits (created by contracts/script/CreateHalloween.s.sol, which refuses to run unless they land at 4, 5, 6). */
export const PUMPKIN = 4;
export const MUMMY = 5;
export const ZOMBIE = 6;
/** The outfits (one worn at a time), in the order the pet page's buttons appear. The hair and rooms are not outfits. */
export const OUTFIT_ITEMS: readonly number[] = [WITCH, PUMPKIN, MUMMY, ZOMBIE, 14, 19, 26];   // 14: the Habibi pack's bisht; 19, 26: the emo fit
/** The emo hair (item 3): drawn on inversebrah only; the cat was born with it. */
export const EMO_HAIR = 3;
/** The Jewish pack (contracts/script/CreateJudaica.s.sol, which refuses to run unless they land at 8-12). */
export const KIPPAH = 8;
export const STAR_OF_DAVID = 9;
export const KOTEL = 10;
export const DREIDEL = 11;
export const KAPPAROT = 12;
/** Accessories: drawn on the pet like an outfit but worn WITH one (the kippah under a witch hat keeps its payot showing;
 *  the pumpkin covers the kippah and the payot; the star goes over anything). Any number at once. */
export const ACCESSORY_ITEMS: readonly number[] = [KIPPAH, STAR_OF_DAVID, 13, 18, 25, 20, 27, 21, 28];   // 13: the Habibi pack's keffiyeh; 18-21/25-28: the emo pack's beanie, wristbands, lip piercings
/**
 * Items that go one at a time within their group, like outfits and rooms: a head piece (the kippah or the keffiyeh: the
 * operator's rule, 2026-09-28), a toy (the dreidel or the darbuka), a Pet move (the hen or the falcon). Putting one on
 * takes the others of its group off first, a transaction each.
 */
export const EXCLUSIVE_GROUPS: readonly (readonly number[])[] = [[KIPPAH, 13, 18, 25], [11, 16, 23, 30], [12, 17, 24, 31], [20, 27], [21, 28]];   // (and an emo item's two editions are one thing on a pet)
/** The items a new one takes off: the rest of its group that the pet has on. */
export const exclusiveOf = (id: number, worn: readonly number[] | undefined): number[] => {
  const g = EXCLUSIVE_GROUPS.find((grp) => grp.includes(id));
  return g ? (worn ?? []).filter((w) => w !== id && g.includes(w)) : [];
};
/** Items that change what an action does rather than how the pet looks: Play brings out the dreidel instead of the
 *  yarn; Pet becomes kapparot (the pet page's Kapparot button: a tap stays the quick nuzzle). */
export const TOY_ITEMS: Record<number, Toy> = { [DREIDEL]: 'dreidel', 16: 'darbuka', 23: 'guitar', 30: 'guitar' };
export const PET_MOVE_ITEMS: Record<number, PetMove> = { [KAPPAROT]: 'kapparot', 17: 'falcon', 24: 'selfie', 31: 'selfie' };
/** Which costumes the rig draws on which pet. Every one is drawn on Thiccums too (only in a build with his switch on). */
const withThicc = (list: Character[], k: string): Character[] => [...list, ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []),   // (and on the r3tard: r3items.py)
  // and on Emonad (emonaditems.py), all but the emo hair and the wristbands: both are his own look already
  ...(__EMONAD__ && k !== 'emohair' && k !== 'wristbands' ? ['emonad' as const] : [])];
const DRAWN: Record<Wearable, Character[]> = { witch: ['cat', 'frog', 'sahur'], pumpkin: ['cat', 'frog', 'sahur'], mummy: ['cat', 'frog', 'sahur'], zombie: ['cat', 'frog', 'sahur'], emohair: ['frog', 'sahur'], kippah: ['cat', 'frog', 'sahur'], starofdavid: ['cat', 'frog', 'sahur'],
  keffiyeh: ['cat', 'frog', 'sahur'], bisht: ['cat', 'frog', 'sahur'],   // the Habibi pack
  // the emo pack (items 18-31); the cat wears her own wristbands already
  beanie: ['cat', 'frog', 'sahur'], emofit: ['cat', 'frog', 'sahur'], wristbands: ['frog', 'sahur'], piercings: ['cat', 'frog', 'sahur'] };
export const DRAWN_ON = Object.fromEntries(Object.entries(DRAWN).map(([k, v]) => [k, withThicc(v, k)])) as Record<Wearable, Character[]>;
export const ITEM_LABEL: Record<number, string> = { 1: 'Witch outfit', 2: 'Spooky theme', 3: 'Emo hair', 4: 'Pumpkin head', 5: 'Mummy wraps', 6: 'Zombie', 7: 'Backrooms theme',
  8: 'Kippah', 9: 'Star of David', 10: 'Western Wall theme', 11: 'Dreidel', 12: 'Kapparot hen',
  13: 'Keffiyeh', 14: 'Bisht', 15: 'Majlis theme', 16: 'Darbuka', 17: 'Falcon',
  18: 'Beanie', 19: 'Emo fit', 20: 'Wristbands', 21: 'Lip piercings', 22: 'Emo bedroom theme', 23: 'Guitar', 24: 'Flip phone',
  25: 'Beanie (Holders)', 26: 'Emo fit (Holders)', 27: 'Wristbands (Holders)', 28: 'Lip piercings (Holders)', 29: 'Emo bedroom theme (Holders)', 30: 'Guitar (Holders)', 31: 'Flip phone (Holders)' };

/** Item id → room theme the stage can draw. The Spooky theme is item 2 (created after the witch); the Backrooms is
 *  item 7 (contracts/script/CreateBackrooms.s.sol; its dry run prints the id it would get, and this must match it). */
export const SCENE_ITEMS: Record<number, SceneName> = { 2: 'halloween', 7: 'backrooms', 10: 'kotel', 15: 'majlis', 22: 'emoroom', 29: 'emoroom' };
export const SPOOKY = 2;
export const BACKROOMS = 7;
/** The room theme items, in id order: ONE at a time, like outfits (operator, 2026-09-25: the Backrooms went on over the Spooky
 *  theme and both stayed on; putting a room on now takes the other off first). */
export const ROOM_ITEMS: number[] = Object.keys(SCENE_ITEMS).map(Number);
/** The room a pet is shown in: the last room item in its list wins (the newest put on), like `costumeOf`. */
export const sceneOf = (worn: readonly number[] | undefined): SceneName | null => {
  let out: SceneName | null = null;
  for (const id of worn ?? []) { const s = SCENE_ITEMS[id]; if (s) out = s; }
  return out;
};
/** The room items among what a pet is wearing: the ones a new room takes off. */
export const roomIdsOf = (worn: readonly number[] | undefined): number[] => (worn ?? []).filter((id) => id in SCENE_ITEMS);

/**
 * The outfit a pet is shown in: ONE at a time (the operator's rule, 2026-09-23). The site takes the old outfit off when
 * a new one goes on, so normally only one is worn; if a pet's list holds several anyway (equipped straight on the
 * contract, which allows up to 16 items), the last one in its list wins, everywhere the pet is drawn.
 */
export const costumeOf = (worn: readonly number[] | undefined): Costume | null => {
  let out: Costume | null = null;
  for (const id of worn ?? []) { const c = COSTUME_ITEMS[id]; if (c && c !== 'emohair' && OUTFIT_ITEMS.includes(id)) out = c; }
  return out;
};
/** The accessories a pet is wearing (the kippah, the Star of David), in the rig's names, only those drawn on it. */
export const accessoriesOf = (worn: readonly number[] | undefined, character: Character): Costume[] =>
  ACCESSORY_ITEMS.filter((id) => (worn ?? []).includes(id)).map((id) => COSTUME_ITEMS[id] as Costume).filter((c) => DRAWN_ON[c]?.includes(character));
/** Everything the rig draws on a pet: its one outfit and its accessories (the emo hair is `hairOf`). What `setCostumes` takes. */
export const costumesOf = (worn: readonly number[] | undefined, character: Character): Costume[] => {
  const c = costumeOf(worn);
  return [...(c && DRAWN_ON[c]?.includes(character) ? [c] : []), ...accessoriesOf(worn, character)];
};
/** What Play brings out: the dreidel or the darbuka while it is on the pet (the last put on, if a list holds both), else the yarn. */
export const toyOf = (worn: readonly number[] | undefined): Toy => {
  let out: Toy = 'yarn';
  for (const id of worn ?? []) { const t = TOY_ITEMS[id]; if (t) out = t; }
  return out;
};
/** What Pet does: kapparot or the falcon while its item is on the pet (the last put on, if a list holds both), else the ordinary pet. */
export const petMoveOf = (worn: readonly number[] | undefined): PetMove => {
  let out: PetMove = 'pet';
  for (const id of worn ?? []) { const m = PET_MOVE_ITEMS[id]; if (m) out = m; }
  return out;
};
/** The outfit items (not the hair, not rooms) among what a pet is wearing: the ones a new outfit takes off. */
export const outfitIdsOf = (worn: readonly number[] | undefined): number[] => (worn ?? []).filter((id) => OUTFIT_ITEMS.includes(id));
/** Is the pet wearing the emo hair? Only drawn on pets that have no hair of their own. */
export const hairOf = (worn: readonly number[] | undefined, character: Character): boolean => character !== 'cat' && (worn ?? []).includes(EMO_HAIR);

/**
 * What kind of thing an item is, for the pet page's Items menu (every item the wallet holds, by kind): the outfits (one at
 * a time), what goes on the head (the emo hair; the kippah or the keffiyeh, one at a time), what hangs round the neck,
 * the rooms (one at a time), the toys Play brings out and the companions Pet brings in (one of each at a time). An item
 * this build does not know yet is 'other'.
 */
export type ItemKind = 'outfit' | 'head' | 'neck' | 'room' | 'toy' | 'companion' | 'other';
export const ITEM_KINDS: readonly { kind: ItemKind; title: string }[] = [
  { kind: 'outfit', title: 'Outfits' }, { kind: 'head', title: 'Headwear' }, { kind: 'neck', title: 'Accessories' },
  { kind: 'room', title: 'Rooms' }, { kind: 'toy', title: 'Toys' }, { kind: 'companion', title: 'Companions' }, { kind: 'other', title: 'Other items' },
];
export const itemKind = (id: number): ItemKind =>
  OUTFIT_ITEMS.includes(id) ? 'outfit'
    : id === EMO_HAIR || id === KIPPAH || id === 13 || id === 18 || id === 25 ? 'head'
      : ACCESSORY_ITEMS.includes(id) ? 'neck'
        : id in SCENE_ITEMS ? 'room'
          : id in TOY_ITEMS ? 'toy'
            : id in PET_MOVE_ITEMS ? 'companion' : 'other';
/** Can this pet use the item: a thing drawn on the pet only if the rig draws it on this character (the emo hair is not
 *  drawn on the cat: her own hair is the look); a room, a toy or a companion goes with any pet. */
export const itemFits = (id: number, character: Character): boolean => {
  const k = itemKind(id);
  if (k === 'other') return false;
  const w = COSTUME_ITEMS[id];
  return w ? (DRAWN_ON[w] ?? []).includes(character) : true;
};

/** The claim rule in words, per item; the contract only knows the gate's address. */
/** Items whose gate keys on a cat (NamedCatGate): the claim names the cat and the cap is per cat. */
export const CAT_GATED = new Set<number>([1]);
/** Items whose gate wants the collection you hold a pet of (AnyPetGate): the claim passes that address. */
export const PET_GATED = new Set<number>([3, 18, 19, 20, 21, 22, 23, 24]);   // 18-24: the emo pack's paid edition (the same AnyPetGate as the hair)
/** Items whose gate keys on a living, named pet of any kind (NamedPetGate): the claim names the pet, collection and id. */
export const NAMED_PET_GATED = new Set<number>([PUMPKIN, MUMMY, ZOMBIE, 13, 14, 15, 16, 17]);   // 13-17: the Habibi pack (free, one of each per pet)
export const REQUIREMENT: Record<number, string> = {
  1: 'A living, named Emogotchi · one per cat', 2: 'Anyone · no limit', 3: 'Hold any pet · one per wallet · 1,000 in all',
  4: 'A living, named pet · one per pet · 100 in all', 5: 'A living, named pet · one per pet · 100 in all', 6: 'A living, named pet · one per pet · 100 in all',
  7: 'Anyone · no limit',
  8: 'Anyone · no limit · 613 in all', 9: 'Anyone · no limit · 613 in all', 10: 'Anyone · no limit · 613 in all',
  11: 'Anyone · no limit · 613 in all', 12: 'Anyone · no limit · 613 in all',
  13: 'A living, named pet · one per pet · 1,001 in all', 14: 'A living, named pet · one per pet · 1,001 in all', 15: 'A living, named pet · one per pet · 1,001 in all',
  16: 'A living, named pet · one per pet · 1,001 in all', 17: 'A living, named pet · one per pet · 1,001 in all',
  ...Object.fromEntries([18, 19, 20, 21, 22, 23, 24].map((id) => [id, 'Hold any pet · no limit'])),
  ...Object.fromEntries([25, 26, 27, 28, 29, 30, 31].map((id) => [id, 'Hold 7,000 $EMO · one per wallet · soulbound'])),
};

export const priceLabel = (wei: bigint) => (wei === 0n ? 'Free' : `${formatEther(wei)} MON`);

/** Where a character's pre-drawn portraits live under public/nft/ (the cat's at the root). */
export const PORTRAIT_DIR = { cat: '', frog: 'inversebrah/', sahur: 'sahur/', ...(__THICCUMS__ ? { thiccums: 'thiccums/' } : {}), ...(__R3TARDS__ ? { r3tards: 'r3tards/' } : {}), ...(__EMONAD__ ? { emonad: 'emonad/' } : {}) } as Record<Character, string>;
/** The wallet portrait of a costumed pet, drawn ahead of time for every mood (the cat's under /nft/<costume>/, inversebrah's under /nft/inversebrah/<costume>/, Sahur's under /nft/sahur/<costume>/).
 *  'judaica' is the kippah and the Star of David together (`node tools/portrait.mjs [who] kippah,starofdavid`, renamed). */
export type PortraitSet = Wearable | 'judaica' | 'habibi';
export const costumePortrait = (costume: PortraitSet, mood: string, crowned: boolean, character: Character = 'cat') => `/nft/${PORTRAIT_DIR[character]}${costume}/${mood}${crowned ? '-crown' : ''}-1024.png`;
/** Which pre-drawn portrait set shows a pet as it is dressed: its outfit first (an outfit's set has no accessories in
 *  it), then the pack's accessories, then the emo hair; null = the plain portrait. */
export const portraitSetOf = (worn: readonly number[] | undefined, character: Character): PortraitSet | null => {
  const c = costumeOf(worn);
  const acc = accessoriesOf(worn, character);
  // the Habibi pack: the bisht with the keffiyeh is its own set ('habibi' = `portrait.mjs [who] bisht,keffiyeh`, renamed); the
  // keffiyeh covers a kippah, so with the keffiyeh on the Jewish pack's accessories do not count
  if (c === 'bisht' && acc.includes('keffiyeh') && DRAWN_ON.bisht.includes(character)) return 'habibi';
  if (c && PORTRAIT_SETS.has(c) && DRAWN_ON[c]?.includes(character)) return c;
  if (acc.includes('keffiyeh')) return 'keffiyeh';
  const jew = acc.filter((a) => a === 'kippah' || a === 'starofdavid');
  if (jew.length === 2) return 'judaica';
  if (jew.length === 1) return jew[0]!;
  return hairOf(worn, character) ? 'emohair' : null;
};
/** The outfits that have portraits drawn ahead of time (public/nft/<set>/): an outfit without one (the emo fit, for now)
 *  shows the pet's plain portrait rather than a picture that is not there. */
const PORTRAIT_SETS = new Set<Wearable>(['witch', 'pumpkin', 'mummy', 'zombie', 'bisht']);
/** The plain wallet portrait preview for a pet. */
export const plainPortrait = (mood: string, crowned: boolean, character: Character = 'cat') => `/nft/${PORTRAIT_DIR[character]}${mood}${crowned ? '-crown' : ''}-1024.png`;

/**
 * The Jewish pack (reviewed at /judaica; NOT created on chain yet). Five items, planned as shop ids 8-12 in this order:
 * the create script will refuse to run unless the shop's next id is 8 (the Backrooms precedent), so these stay true.
 * Until `created`, the site shows them (shop section, pack page) with claim buttons that say "Coming soon", and none of
 * them is in COSTUME_ITEMS / SCENE_ITEMS, so nothing a wallet holds can switch them on by accident. Terms as decided
 * by the operator on 2026-09-28: 36 MON each, the hen too ("double chai"), 613 of each (the commandments); any limits
 * are still open. What each one does on a pet: `effect`.
 */
export type PackEffect = { kind: 'wear'; costume: Costume } | { kind: 'room'; scene: SceneName } | { kind: 'toy'; toy: Toy } | { kind: 'petMove'; move: PetMove };
export type PackItem = { id: number; key: string; label: string; card: string; effect: PackEffect; priceMon: number | null; supply: number };
export const JEWISH_PACK: { items: readonly PackItem[] } = {
  items: [
    { id: KIPPAH, key: 'kippah', label: 'Kippah', card: '/brand/item-kippah.png', effect: { kind: 'wear', costume: 'kippah' }, priceMon: 36, supply: 613 },
    { id: STAR_OF_DAVID, key: 'starofdavid', label: 'Star of David', card: '/brand/item-starofdavid.png', effect: { kind: 'wear', costume: 'starofdavid' }, priceMon: 36, supply: 613 },
    { id: KOTEL, key: 'kotel', label: 'Western Wall theme', card: '/brand/item-kotel.png', effect: { kind: 'room', scene: 'kotel' }, priceMon: 36, supply: 613 },
    { id: DREIDEL, key: 'dreidel', label: 'Dreidel', card: '/brand/item-dreidel.png', effect: { kind: 'toy', toy: 'dreidel' }, priceMon: 36, supply: 613 },
    { id: KAPPAROT, key: 'kapparot', label: 'Kapparot hen', card: '/brand/item-kapparot.png', effect: { kind: 'petMove', move: 'kapparot' }, priceMon: 36, supply: 613 },
  ],
};

/**
 * The Habibi pack (reviewed at /habibi and /shop/habibi, both DEV ONLY until the operator has tested it; NOT created on
 * chain). Five items, planned as shop ids 13-17 in this order (check `itemCount()` at create time: nothing else may be
 * created first). Terms as decided by the operator on 2026-09-28: FREE, 1,001 of each (the Thousand and One Nights), one
 * of each per living, named pet: the Halloween items' rule and gate (NamedPetGate 0x0f7f…), because a free item with no
 * limit would go to the first bot in one transaction. Not in COSTUME_ITEMS / SCENE_ITEMS / TOY_ITEMS / PET_MOVE_ITEMS
 * yet, so nothing a wallet holds can switch them on.
 */
/** The pack on the site at all: its page (/shop/habibi) and its banner and section in the shop. On since 2026-09-28 (the
 *  operator tested it and asked for it to ship as "Coming soon"); the items switch on by themselves once created. */
export const HABIBI_ON: boolean = true;
export const KEFFIYEH = 13;
export const BISHT = 14;
export const MAJLIS = 15;
export const DARBUKA = 16;
export const FALCON = 17;
export const HABIBI_PACK: { items: readonly PackItem[] } = {
  items: [
    { id: KEFFIYEH, key: 'keffiyeh', label: 'Keffiyeh', card: '/brand/item-keffiyeh.png', effect: { kind: 'wear', costume: 'keffiyeh' }, priceMon: 0, supply: 1001 },
    { id: BISHT, key: 'bisht', label: 'Bisht', card: '/brand/item-bisht.png', effect: { kind: 'wear', costume: 'bisht' }, priceMon: 0, supply: 1001 },
    { id: MAJLIS, key: 'majlis', label: 'Majlis theme', card: '/brand/item-majlis.png', effect: { kind: 'room', scene: 'majlis' }, priceMon: 0, supply: 1001 },
    { id: DARBUKA, key: 'darbuka', label: 'Darbuka', card: '/brand/item-darbuka.png', effect: { kind: 'toy', toy: 'darbuka' }, priceMon: 0, supply: 1001 },
    { id: FALCON, key: 'falcon', label: 'Falcon', card: '/brand/item-falcon.png', effect: { kind: 'petMove', move: 'falcon' }, priceMon: 0, supply: 1001 },
  ],
};

/** Is a pack on chain? True once the shop holds all its items at their ids under their names (read from the catalogue,
 *  so the site switches from "Coming soon" to claims by itself the moment the create script has run, no deploy). A
 *  different item at one of those ids (the shop moved on before the script ran) reads as not created. The Jewish pack
 *  unless another is named. */
export const packCreated = (names: ReadonlyMap<number, string> | Record<number, string> | null | undefined, pack: { items: readonly PackItem[] } = JEWISH_PACK): boolean => {
  if (!names) return false;
  const get = (id: number) => (names instanceof Map ? names.get(id) : (names as Record<number, string>)[id]);
  return pack.items.every((it) => get(it.id) === it.label);
};

/**
 * The emo pack (2026-10-03): seven items in two editions, created by contracts/script/CreateEmo.s.sol, which refuses to run
 * unless they land at 18-31: the paid edition at 18-24 (30 MON, any wallet holding a pet: the AnyPetGate, no limit,
 * tradeable) and the holders' edition at 25-31 (free to a wallet holding 7,000 $EMO: a HoldsGate, one of each, soulbound),
 * the same seven in the same order. Both editions draw the same thing on a pet. Its page is /shop/emo; until both
 * editions exist under their names the page and the shop say "Coming soon".
 */
export const EMO_ON: boolean = true;
export const EMO_HOLD_EMO = 7000;   // $EMO the holders' edition asks (the gate's bar, fixed when it is deployed)
export const EMO_PRICE_MON = 30;
const EMO_KEYS = [['beanie', 'Beanie', { kind: 'wear', costume: 'beanie' }], ['fit', 'Emo fit', { kind: 'wear', costume: 'emofit' }],
  ['wristbands', 'Wristbands', { kind: 'wear', costume: 'wristbands' }], ['piercings', 'Lip piercings', { kind: 'wear', costume: 'piercings' }],
  ['bedroom', 'Emo bedroom theme', { kind: 'room', scene: 'emoroom' }], ['guitar', 'Guitar', { kind: 'toy', toy: 'guitar' }],
  ['selfie', 'Flip phone', { kind: 'petMove', move: 'selfie' }]] as const;
/** The paid edition (18-24); its cards are the pictures stored on chain, served from /brand/emo/. */
export const EMO_PACK: { items: readonly PackItem[] } = {
  items: EMO_KEYS.map(([key, label, effect], i) => ({ id: 18 + i, key, label, card: `/brand/emo/${key}.svg`, effect: effect as PackEffect, priceMon: EMO_PRICE_MON, supply: 0 })),
};
/** The holders' edition (25-31), in the same order. */
export const EMO_HOLDERS_PACK: { items: readonly PackItem[] } = {
  items: EMO_KEYS.map(([key, label, effect], i) => ({ id: 25 + i, key, label: `${label} (Holders)`, card: `/brand/emo/${key}-holder.svg`, effect: effect as PackEffect, priceMon: 0, supply: 0 })),
};
/** The emo pack's ids, for the shop's section. */
export const EMO_IDS: ReadonlySet<number> = new Set([...EMO_PACK.items, ...EMO_HOLDERS_PACK.items].map((i) => i.id));

