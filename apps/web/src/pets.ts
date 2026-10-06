/**
 * The pets, in one place: which collection is which character, what each one is called in copy, where its pages
 * live, and whether its care is free. Every page that used to ask `col === 'frok'` asks this instead, so a third
 * pet (Tung Tung Tung Sahur, 2026-09-25) is one row here and not a ternary in thirty files.
 */
import type { Collection } from '@emo-pets/chain';
import { FREE } from '@emo-pets/chain';
import type { Character } from './pet/Pet';
import { chainCfg } from './game/chain';

export type PetMeta = {
  col: Collection;
  character: Character;
  /** the pet in a sentence: "cat", "inversebrah", "Sahur" */
  one: string;
  many: string;
  /** the collection's name: Emogotchi, Inversegotchi, Sahuragotchi */
  brand: string;
  /** the full name where there is room for it */
  fullBrand: string;
  /** the pet-switch / tab label */
  label: string;
  /** what a share card and a link preview call the animal: "cat", "frok", "Sahur" */
  kind: string;
  /** "it" for the cat; the other two are "he" */
  he: 'it' | 'he';
  his: 'its' | 'his';
  /** a small marker beside a pet's number in tabs and pickers (the cat has none) */
  mark: string;
  /** the pet page prefix: /pet, /inversebrah/pet, /tung/pet */
  path: string;
  /** the mint page, for the pets anyone can mint */
  mint: string | null;
  /** the value of ?pet= on /pets and /api/cats */
  api: string;
  /** where its pre-drawn portraits live under public/nft/ */
  portraits: string;
  /** every care, pet, stunt and revive is gas only; a name is 10 MON on all three */
  free: boolean;
  /** dataviz colour, on the dark surface */
  color: string;
};

export const PETS = {
  cat: { col: 'cat', character: 'cat', one: 'cat', many: 'cats', brand: 'Emogotchi', fullBrand: 'Emogotchi', label: 'Cats', kind: 'cat', he: 'it', his: 'its', mark: '', path: '/pet', mint: null, api: 'cat', portraits: '', free: false, color: '#e84d7f' },
  frok: { col: 'frok', character: 'frog', one: 'inversebrah', many: 'inversebrahs', brand: 'Inversegotchi', fullBrand: 'Inversegotchi', label: 'inversebrah', kind: 'frok', he: 'he', his: 'his', mark: '🐸', path: '/inversebrah/pet', mint: '/mint', api: 'frok', portraits: 'inversebrah/', free: true, color: '#5da03a' },
  sahur: { col: 'sahur', character: 'sahur', one: 'Sahur', many: 'Sahurs', brand: 'Sahuragotchi', fullBrand: 'Tung Tung Tung Sahuragotchi', label: 'Tung Tung Tung Sahur', kind: 'Sahur', he: 'he', his: 'his', mark: '🪵', path: '/tung/pet', mint: '/tung', api: 'sahur', portraits: 'sahur/', free: true, color: '#d2822e' },
  // the fourth pet, only in a build with his switch on (vite.config.ts): without it this row, like every mention of him, is dropped
  ...(__THICCUMS__ ? { thiccums: { col: 'thiccums', character: 'thiccums', one: 'Thiccums', many: 'Thiccums', brand: 'Thiccumsgotchi', fullBrand: 'Thiccumsgotchi', label: 'Thiccums', kind: 'Thiccums', he: 'he', his: 'his', mark: '🦭', path: '/thiccums/pet', mint: '/thiccums', api: 'thiccums', portraits: 'thiccums/', free: true, color: '#6fb7e8' } } : {}),
  // the fifth pet, r3tardgotchi, only in a build with his switch on (__R3TARDS__: his contract address). No stunt.
  ...(__R3TARDS__ ? { r3tards: { col: 'r3tards', character: 'r3tards', one: 'r3tard', many: 'r3tards', brand: 'r3tardgotchi', fullBrand: 'r3tardgotchi', label: 'r3tards', kind: 'r3tard', he: 'he', his: 'his', mark: '👄', path: '/r3tardgotchi/pet', mint: '/r3tardgotchi', api: 'r3tards', portraits: 'r3tards/', free: true, color: '#e6cf5a' } } : {}),
  // the sixth pet, Emonadgotchi (Emonad, the $EMO mascot), only in a build with his switch on (__EMONAD__: his contract address). No stunt.
  ...(__EMONAD__ ? { emonad: { col: 'emonad', character: 'emonad', one: 'Emonad', many: 'Emonads', brand: 'Emonadgotchi', fullBrand: 'Emonadgotchi', label: 'Emonad', kind: 'Emonad', he: 'he', his: 'his', mark: '🥀', path: '/emonadgotchi/pet', mint: '/emonadgotchi', api: 'emonad', portraits: 'emonad/', free: true, color: '#c4a0f2' } } : {}),
} as Record<Collection, PetMeta>;
/** every pet, in the order the site lists them */
export const PET_ORDER: Collection[] = ['cat', 'frok', 'sahur', ...(__THICCUMS__ ? ['thiccums' as const] : []), ...(__R3TARDS__ ? ['r3tards' as const] : []), ...(__EMONAD__ ? ['emonad' as const] : [])];
export const characterOf = (col: Collection): Character => PETS[col].character;
export const collectionOf = (c: Character): Collection => c === 'frog' ? 'frok' : c === 'sahur' ? 'sahur' : __THICCUMS__ && c === 'thiccums' ? 'thiccums' : __R3TARDS__ && c === 'r3tards' ? 'r3tards' : __EMONAD__ && c === 'emonad' ? 'emonad' : 'cat';
export const isFree = (col: Collection): boolean => FREE.has(col);
/** the collections this build has an address for */
export const knownPets = (): Collection[] => PET_ORDER.filter((c) => c === 'cat' || (c === 'frok' ? !!chainCfg?.inverse : c === 'sahur' ? !!chainCfg?.sahur : __THICCUMS__ && c === 'thiccums' ? !!chainCfg?.thiccums : __R3TARDS__ && c === 'r3tards' ? !!chainCfg?.r3tards : __EMONAD__ && c === 'emonad' ? !!chainCfg?.emonad : false));
export const hasPet = (col: Collection): boolean => knownPets().includes(col);
/** `?pet=` on a URL → a collection this build knows (the cat otherwise) */
export const petParam = (v: string | null): Collection => { const c = PET_ORDER.find((k) => PETS[k].api === v); return c && hasPet(c) ? c : 'cat'; };
/** `?pet=` → the character the demo should show */
export const characterParam = (v: string | null): Character => { const c = PET_ORDER.find((k) => PETS[k].api === v); return c ? PETS[c].character : 'cat'; };
/** "A" or "An" before a pet's name in a sentence: an Emonad, an inversebrah, a Sahur, a r3tard */
export const anA = (w: string): 'A' | 'An' => (/^[aeiou]/i.test(w) ? 'An' : 'A');
/** a pet's own page */
export const petHref = (col: Collection, id: number): string => `${PETS[col].path}/${id}`;
/** the gallery, filtered to one pet */
export const galleryHref = (col: Collection): string => col === 'cat' ? '/pets' : `/pets?pet=${PETS[col].api}`;
/** "Emogotchi #7", "inversebrah #7", "Sahur #7": the fallback for an unnamed pet */
export const fallbackName = (col: Collection, id: number): string => `${col === 'cat' ? 'Emogotchi' : PETS[col].one} #${id}`;
