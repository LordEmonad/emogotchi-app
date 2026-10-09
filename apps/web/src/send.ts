/**
 * Sending a pet or an item to someone (2026-09-27; operator: "make sure its totally fucking safe"): who it goes to.
 *
 * What a person types is either an Emotown name (resolved by the social Worker to the address that owns it) or a
 * wallet address. Nothing is ever sent to a guess: the address is checked, the checksum is honoured when the capitals
 * carry one, the obvious black holes are refused outright, and the page then asks the chain whether the send would go
 * through (SendSheet). The transfer itself is only ever the owner's own call from their own wallet.
 */
import { getAddress, isAddress, type Address } from 'viem';
import { chainCfg, chainClient } from './game/chain';
import { api, ApiError } from './social/api';
import type { PetRef, Profile } from './social/types';

export type Recipient = {
  /** checksummed */
  address: Address;
  /** their Emotown name, when they have one */
  name: string | null;
  /** their face: the picture they uploaded, else their pet's head */
  pet: PetRef | null;
  pic: string | null;
  resident: number | null;
  /** when that name was last claimed (ms), when the Worker says: a name can change hands, so a new one asks for a tick */
  nameSince: number | null;
  /** a plain wallet, an EIP-7702 wallet (a person's key with smart-account code), or a contract */
  kind: 'wallet' | 'delegated' | 'contract';
  /** how it was given: a name was looked up, or an address was pasted */
  via: 'name' | 'address';
};

export type Parsed = { kind: 'empty' } | { kind: 'bad'; why: string } | { kind: 'address'; address: Address } | { kind: 'name'; name: string };

// characters a copy and paste can carry that nobody can see
const INVISIBLE = new RegExp('[' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f) + String.fromCharCode(0x2060, 0xfeff, 0xa0) + ']', 'g');

/** What was typed: a name, an address, or why it is neither. Pure: no lookups. */
export function parseRecipient(raw: string): Parsed {
  let t = raw.replace(INVISIBLE, '').trim();
  if (!t) return { kind: 'empty' };
  // a profile link works too: https://emogotchi.emonad.lol/u/<name or address>
  const u = /\/u\/([A-Za-z0-9_]{3,20}|0x[0-9a-fA-F]{40})\/?(?:[?#].*)?$/.exec(t);
  if (u) t = u[1]!;
  if (t.startsWith('@')) t = t.slice(1);
  if (/^0x/i.test(t)) {
    if (!/^0x[0-9a-fA-F]*$/.test(t)) return { kind: 'bad', why: 'A wallet address is 0x followed by 40 letters and digits (0-9, a-f). This one has something else in it.' };
    if (t.length !== 42) return { kind: 'bad', why: `A wallet address is 0x followed by 40 characters. This one has ${t.length - 2}.` };
    // capitals in an address are a checksum: if they are mixed and do not match, a character is wrong
    const mixed = /[a-f]/.test(t.slice(2)) && /[A-F]/.test(t.slice(2));
    if (mixed && !isAddress(t, { strict: true })) return { kind: 'bad', why: 'The capital letters in this address do not match its checksum, so a character is probably wrong. Copy it again.' };
    if (!isAddress(t, { strict: false })) return { kind: 'bad', why: 'That is not a wallet address.' };
    return { kind: 'address', address: getAddress(t) };
  }
  if (/\.(eth|nad|mon)$/i.test(t)) return { kind: 'bad', why: 'Names like that are not looked up here. Paste their wallet address instead.' };
  if (/^[A-Za-z0-9_]{3,20}$/.test(t)) return { kind: 'name', name: t };
  return { kind: 'bad', why: 'Type an Emotown name (letters, digits and _) or paste a wallet address.' };
}

const DEAD = ['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dEaD'];
// the game's own contracts beyond the ones the build is configured with: its art, its gates, the dead-end first frok
// contract, and the gas drip wallet. None of them is a place a pet or an item should ever go.
const OURS = [
  '0x0cbdEAaE8Bb4c706156e0513127D1822834e660C', '0xD0F03e8Fb11cea4D53E0635c064c56dCf9906518', '0x9a73BC05d448Ba846693Aa7B71B334EBD48CF2a9',
  '0xf376b47c00Cb3C70Fbc6F6F3924e8A43Aa97817F', '0x2CC30bc5d0470c8a9Df554204f2fb54174467AE5', '0x0f7f0AEA1A748f4e521eFC874FBa2e5Bd6F0B515',
  '0xA6b3b94DD997D6eCea5E64ba6b9Ca8c2B9df3871', '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8',
  ...(__THICCUMS__ ? ['0xBf36394F4345A2c450fEbAa8A83B54a9C5214025'] : []),   // Thiccums' art
  ...(__R3TARDS__ ? ['0x5Fd03A7dd3Cbc19ba3D4eD9deF027ea3B12922eb'] : []),   // the r3tard's art
  ...(__EMONAD__ ? ['0xfF5d44611A37265597Be2D178dDD6D656106682A'] : []),   // Emonad's art
];

/** Why nothing may be sent to this address, or null. */
export function refuseAddress(a: Address, me: string | null): string | null {
  const x = a.toLowerCase();
  if (DEAD.some((d) => d.toLowerCase() === x)) return 'That address is a black hole: anything sent there is gone for good.';
  if (me && x === me.toLowerCase()) return 'That is this wallet.';
  const c = chainCfg;
  const game = c ? [c.contract, c.inverse, c.sahur, c.items, c.drop, ...(__THICCUMS__ ? [c.thiccums] : []), ...(__R3TARDS__ ? [c.r3tards] : []), ...(__EMONAD__ ? [c.emonad] : [])] : [];
  if ([...game, ...OURS].some((k) => typeof k === 'string' && k.toLowerCase() === x)) return 'That is one of Emogotchi\'s own contracts, not a wallet. Nothing should ever be sent there.';
  return null;
}

/**
 * Who a parsed name or address is: the address, their Emotown face and name if they have one, and what kind of
 * account it is. `me` is the sending wallet.
 */
export async function resolveRecipient(p: Extract<Parsed, { kind: 'address' | 'name' }>, me: string | null): Promise<{ ok: true; r: Recipient } | { ok: false; why: string }> {
  let profile: Profile | null = null;
  let address: Address;
  if (p.kind === 'name') {
    try { profile = await api.get<Profile>(`/profile/${encodeURIComponent(p.name)}`); }
    catch (e) {
      if (e instanceof ApiError && e.status === 404) return { ok: false, why: `Nobody in Emotown is called ${p.name}. Check the spelling, or paste their wallet address.` };
      return { ok: false, why: 'Names cannot be looked up right now. Paste their wallet address instead.' };
    }
    // the answer must be for the name that was asked about, and carry a real address
    if (!profile?.address || !isAddress(profile.address, { strict: false }) || profile.name?.toLowerCase() !== p.name.toLowerCase()) return { ok: false, why: `Nobody in Emotown is called ${p.name}.` };
    address = getAddress(profile.address);
  } else {
    address = p.address;
    // the address may belong to someone in Emotown: show their face so the sender can see who it is (and only if the
    // answer is about this very address)
    try { profile = await api.get<Profile>(`/profile/${address}`); } catch { profile = null; }
    if (profile && profile.address?.toLowerCase() !== address.toLowerCase()) profile = null;
  }
  const no = refuseAddress(address, me);
  if (no) return { ok: false, why: no };
  if (!chainClient) return { ok: false, why: 'This build is not connected to Monad.' };
  let kind: Recipient['kind'];
  try { kind = await chainClient.accountKind(address); }
  catch { return { ok: false, why: 'Monad did not answer. Try again in a moment.' }; }
  return { ok: true, r: { address, name: profile?.name ?? null, pet: profile?.avatar ?? null, pic: profile?.pic ?? null, resident: profile?.resident ?? null, nameSince: typeof profile?.nameSince === 'number' ? profile.nameSince : null, kind, via: p.kind } };
}

/** An address as a reader can check it: in groups of four after the 0x. */
export const grouped = (a: string) => `0x ${a.slice(2).match(/.{1,4}/g)!.join(' ')}`;
