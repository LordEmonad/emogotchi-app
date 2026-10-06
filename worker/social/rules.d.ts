export declare const SIWE_STATEMENT: string;
// Types for rules.js, which the site imports directly (apps/web/src/social/rules.ts).
export declare const LIMITS: { nameMin: number; nameMax: number; bio: number; bioLines: number; chat: number; dm: number; note: number };
export type Platform = 'x' | 'telegram' | 'discord' | 'farcaster' | 'github' | 'website';
export declare const PLATFORMS: Platform[];
export type BannerId = 'hall' | 'diner' | 'baths' | 'park' | 'shop' | 'inn' | 'furnace' | 'haunted' | 'backrooms' | 'graveyard' | 'spring' | 'summer' | 'autumn' | 'winter';
export declare const BANNERS: BannerId[];
export declare function cleanText(raw: unknown, opts?: { multiline?: boolean; maxLines?: number }): string;
export declare const charCount: (s: string) => number;
export declare const clip: (s: string, n: number) => string;
export declare function checkName(raw: unknown): { ok: true; name: string; key: string } | { ok: false; error: string };
export declare function normalizeSocial(platform: string, raw: unknown): { ok: true; handle: string } | { ok: false; error: string };
export declare function normalizeUrl(raw: unknown): string | null;
export declare function socialLink(platform: string, handle: string): { href: string | null; label: string };
export declare function findMentions(text: string): string[];
export type Segment = { kind: 'text'; v: string } | { kind: 'link'; v: string; href: string | null } | { kind: 'mention'; v: string; address: string };
export declare function segments(text: string, known?: Record<string, string>): Segment[];
export declare function linkHref(v: string): string | null;
export declare const looksLikePhish: (text: string) => boolean;
export declare const isAddr: (a: unknown) => a is string;
export declare const lower: (a: string) => string;
export type Gif = { id: string; url: string; still: string | null; w: number; h: number };
export declare const GIF_HOST: string;
export declare function gifUrl(raw: unknown): string | null;
export declare function cleanGif(g: unknown): Gif | null;
export declare const REPLY_SNIPPET: number;
/** a reply's quote; once the original is deleted it is only { id, gone: true } (no author, no words) */
export type ReplyQuote = { id: number; a?: string; n?: string | null; t?: string; g?: 0 | 1; gone?: boolean };
export declare const replyQuote: (id: number, address: string, name: string | null, body: string | null, gif: unknown) => ReplyQuote;
export declare const emojiOnly: (s: string) => boolean;
export declare function cleanEmoji(raw: unknown): string | null;
export declare const REACTION_PRESETS: string[];
export declare const MAX_REACTION_KINDS: number;
/** a message's reactions: [emoji, how many], most given first */
export type Reactions = [string, number][];
export declare const ROLE_LIMITS: { name: number; roles: number; perPerson: number; shown: number; holders: number };
export type RoleColor = 'pink' | 'gold' | 'mint' | 'sky' | 'violet' | 'coral' | 'lime' | 'silver';
export declare const ROLE_COLORS: RoleColor[];
export declare function checkRoleName(raw: unknown): { ok: true; name: string; key: string } | { ok: false; error: string };
