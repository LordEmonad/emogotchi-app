/**
 * What the site knows about items beyond what the contract says. The contract is pet-agnostic and
 * only stores an item's own picture; how an item looks *on* a cat is the site's business, so each
 * cosmetic the rig can draw is listed here by item id.
 */
import { formatEther } from 'viem';

/** Item id → the rig's costume name. Anything not listed is held but not drawn on the cat (yet). */
export const COSTUME_ITEMS: Record<number, 'witch'> = { 1: 'witch' };
export const WITCH = 1;

/** The first costume among what a cat is wearing, or null. */
export const costumeOf = (worn: readonly number[] | undefined): 'witch' | null => {
  for (const id of worn ?? []) { const c = COSTUME_ITEMS[id]; if (c) return c; }
  return null;
};

/** The claim rule in words, per item; the contract only knows the gate's address. */
export const REQUIREMENT: Record<number, string> = { 1: 'A living, named Emogotchi · one per cat' };

export const priceLabel = (wei: bigint) => (wei === 0n ? 'Free' : `${formatEther(wei)} MON`);

/** The wallet portrait of a costumed cat, drawn ahead of time for every mood. */
export const costumePortrait = (costume: 'witch', mood: string, crowned: boolean) => `/nft/${costume}/${mood}${crowned ? '-crown' : ''}-1024.png`;
