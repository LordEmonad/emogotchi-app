/** The shapes the social API answers with (worker/social/*). */
import type { Collection } from '@emo-pets/chain';
import type { BannerId, Gif, Platform, Reactions, ReplyQuote } from './rules';

export type PetRef = { col: Collection; id: number };
/** the small version of a person, for lists and chat */
export type Card = { address: string; name: string | null; pet: PetRef | null; /** an uploaded picture, live (pics.ts) */ pic?: string | null };
export type Relation = { following: boolean; followedBy: boolean; blocked: boolean; canDM: boolean };
export type Profile = {
  address: string;
  name: string | null;
  bio: string;
  avatar: PetRef | null;
  /** the avatar was picked (not just the gate's named pet standing in) */
  avatarChosen: boolean;
  banner: BannerId;
  /** the uploaded profile picture and banner in use, when there are (pics.ts); null = the pet's head / the banner above */
  pic: string | null;
  bannerPic: string | null;
  /** their link card, when one is live: the picture a shared /u/ link shows (linkCard.ts) */
  card: string | null;
  /** on your own profile only: your pictures still waiting for a check, and your link card (live or waiting) */
  held?: { avatar: string | null; banner: string | null; card: { id: string; status: 'live' | 'held'; at: number } | null };
  /** on your own profile only: when it last changed (the link card is redrawn when it is older than this) */
  updatedAt?: number;
  socials: Partial<Record<Platform, string>>;
  joinedAt: number | null;
  resident: number | null;
  /** when the current name was claimed (ms) */
  nameSince?: number | null;
  followers: number;
  following: number;
  named: boolean;
  admin: boolean;
  me?: Relation;
};
export type Gate = { ok: boolean; pet: (PetRef & { name: string }) | null; checkedAt: number; unknown?: boolean; stale?: boolean };
export type MeIn = {
  signedIn: true;
  address: string;
  admin: boolean;
  muteUntil: number;
  profile: Profile;
  gate: Gate;
  unread: { dms: number; notifications: number };
  blocked: string[];
  following: string[];
  /** admins only: uploaded pictures waiting for a decision */
  picsWaiting?: number;
  /** GIF search is set up (the Worker holds a KLIPY key): the composers show the GIF button */
  gifs?: boolean;
};
export type Me = MeIn | { signedIn: false };

/** A square message: `g` a GIF (KLIPY's, rules.ts cleanGif), `re` the message it answers, `rx` its reactions ([emoji, n],
 *  most first); `likes` is only the heart count of a message kept from before reactions (read as that many red hearts). */
/** The town crier's event behind a line of the square (worker/social/crier.js): what kind, and whom it is about. */
export type CrierEvent = { k: 'fight'; id: number; w: PetRef; l: PetRef; stake: number; mon: number } | { k: 'name'; pet: PetRef; name: string } | { k: 'revive'; pet: PetRef; mon: number } | { k: 'buy'; item: number; qty: number; mon: number; by: string } | { k: 'mints'; n: Record<string, number>; since: number };
export type ChatMsg = { id: number; a: string; n: string | null; p: PetRef | null; text: string; men: { n: string; a: string }[]; at: number; g?: Gif | null; re?: ReplyQuote; rx?: Reactions; likes?: number; sys?: CrierEvent };
export type Person = { a: string; n: string | null; p: PetRef | null };
/** A DM: `rx` each of the two people's reaction to it, by address. */
export type Dm = { id: number; conv?: string; from: string; to: string; text: string; at: number; g?: Gif | null; re?: ReplyQuote; rx?: Record<string, string> };
export type Note = { id: number; kind: 'follow' | 'dm' | 'mention' | 'pic' | 'reply' | 'like' | `react:${string}`; actor: string; ref: string | null; count: number; at: number; read: boolean; name: string | null; pet: PetRef | null; pic?: string | null };
export type Thread = { id: string; with: Card; lastAt: number; last: { text: string; from: string; gif?: boolean }; unread: number; blocked: boolean };
export type Activity = { col: Collection; id: number; what: string; by: string | null; at: number };
