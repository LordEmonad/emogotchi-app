/**
 * What a profile shows, shared by the full page (/u/…) and the owner's card in town: loading it, the follow and message
 * buttons, the social links (only as each platform's own link, and marked unverified), the badges, and the numbers
 * worked out from the pets they hold on chain right now.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CatView } from '@emo-pets/chain';
import { chainCfg, chainClient } from '../game/chain';
import { api, ApiError } from './api';
import { PLATFORMS, socialLink, type Platform } from './rules';
import { askSignIn } from './SignIn';
import { social } from './store';
import type { Profile } from './types';
import { askToOpen, nameOf, useSocial } from './ui';

export function useProfile(key: string | null) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const s = useSocial();
  const load = useCallback(async () => {
    if (!key) return;
    try { setP(await api.get<Profile>(`/profile/${encodeURIComponent(key)}`)); setErr(null); setMissing(false); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setMissing(true); else setErr((e as Error).message); }
  }, [key]);
  // reload when who is looking changes (the "me" part of a profile is theirs)
  useEffect(() => { void load(); }, [load, s.me?.address]);
  return { p, err, missing, reload: load, setP };
}

/** The pets an address holds, live from the chain (for stats, badges and the grid). */
export function usePets(address: string | null, nonce = 0) {
  const [pets, setPets] = useState<CatView[] | null>(null);
  const [worn, setWorn] = useState<Record<string, number[]>>({});
  useEffect(() => {
    setPets(null); setWorn({});
    if (!address || !chainClient) return;
    let off = false;
    void (async () => {
      try {
        const list = await chainClient!.petsOf(address as `0x${string}`);
        if (off) return;
        setPets(list);
        const w: Record<string, number[]> = {};
        await Promise.all(chainClient!.collections.map(async (col) => {
          const ids = list.filter((v) => v.col === col).map((v) => v.id); if (!ids.length) return;
          const m = await chainClient!.equippedMany(ids, col).catch(() => ({} as Record<number, number[]>));
          for (const id of ids) w[`${col}:${id}`] = m[id] ?? [];
        }));
        if (!off) setWorn(w);
      } catch { if (!off) setPets([]); }
    })();
    return () => { off = true; };
  }, [address, nonce]);
  return { pets, worn };
}

export type HeldItem = { id: number; name: string; count: number; soulbound: boolean };
/** What an address holds from the item shop, live from the chain: each item with its name and count, and its picture. */
export function useItems(address: string | null, nonce = 0) {
  const [items, setItems] = useState<HeldItem[] | null>(null);
  const [svgs, setSvgs] = useState<Record<number, string>>({});
  useEffect(() => {
    setItems(null);
    if (!address || !chainClient || !chainCfg?.items) { setItems([]); return; }
    let off = false;
    void (async () => {
      try {
        const [held, list] = await Promise.all([chainClient!.holdings(address as `0x${string}`), chainClient!.items()]);
        if (off) return;
        const mine = list.filter((i) => (held[i.id] ?? 0) > 0).map((i) => ({ id: i.id, name: i.name, count: held[i.id]!, soulbound: i.soulbound }));
        setItems(mine);
        for (const it of mine) void chainClient!.itemImage(it.id).then((svg) => { if (!off) setSvgs((m) => ({ ...m, [it.id]: svg })); }).catch(() => {});
      } catch { if (!off) setItems([]); }
    })();
    return () => { off = true; };
  }, [address, nonce]);
  return { items, svgs };
}

/** A pet to show for someone who has not picked one: a living named one first, then any living one, then any. */
export function fallbackAvatar(pets: CatView[] | null): { col: CatView['col']; id: number } | null {
  if (!pets?.length) return null;
  const v = pets.find((x) => x.alive && x.name) ?? pets.find((x) => x.alive) ?? pets[0]!;
  return { col: v.col, id: v.id };
}

// the contracts' own split: every care, name and mint is 80% to the burn; a cat's 1,000 MON revive is half
const BURN = 0.8, REVIVE_BURN = 0.5, REVIVE = 1000;
export type PetStats = { pets: number; crowns: number; neverDied: number; cares: number; petted: number; burnMon: number; burnByCol: Partial<Record<CatView['col'], number>>; longestStreak: number; named: number };
export function statsOf(pets: CatView[]): PetStats {
  let crowns = 0, neverDied = 0, cares = 0, petted = 0, burnMon = 0, streak = 0, named = 0;
  const burnByCol: Partial<Record<CatView['col'], number>> = {};
  for (const v of pets) {
    if (v.crowned) crowns++;
    if (v.alive && v.deaths === 0 && v.revives === 0) neverDied++;
    if (v.name) named++;
    cares += v.feeds + v.washes + v.plays + v.naps + v.cleanups;
    petted += v.pets;
    streak = Math.max(streak, v.streak);
    const paid = Number(v.monPaid / 10n ** 15n) / 1000;   // MON, three decimals
    const revives = v.col === 'cat' ? v.revives * REVIVE : 0;
    const b = Math.max(0, paid - revives) * BURN + Math.min(paid, revives) * REVIVE_BURN;
    burnMon += b; burnByCol[v.col] = (burnByCol[v.col] ?? 0) + b;
  }
  return { pets: pets.length, crowns, neverDied, cares, petted, burnMon, burnByCol, longestStreak: streak, named };
}

/**
 * About how much EMO their pets have burned. The chain buys and burns in batches (a crank), not per pet, so this is
 * each collection's own rate so far (EMO burned / MON burned, both counted by the contract) applied to the MON their
 * pets sent to the burn. Shown with a "≈", and only once every rate it needs has been read.
 */
export function useEmoEstimate(stats: PetStats | null): number | null {
  const [rates, setRates] = useState<Partial<Record<CatView['col'], number>> | null>(null);
  const cols = stats ? (Object.keys(stats.burnByCol) as CatView['col'][]) : [];
  const key = cols.join(',');
  useEffect(() => {
    if (!chainClient || !key) { setRates(key ? null : {}); return; }
    let off = false;
    void Promise.all(key.split(',').map(async (col) => {
      const t = await chainClient!.totals(col as CatView['col']);
      return [col, t.monBurned > 0n ? Number(t.emoBurned) / Number(t.monBurned) : 0] as const;
    })).then((r) => { if (!off) setRates(Object.fromEntries(r)); }).catch(() => { if (!off) setRates(null); });
    return () => { off = true; };
  }, [key]);
  if (!stats || !rates) return stats && !key ? 0 : null;
  let emo = 0;
  for (const c of cols) { const r = rates[c]; if (r === undefined) return null; emo += (stats.burnByCol[c] ?? 0) * r; }
  return emo;
}

export type Badge = { key: string; icon: string; label: string; tip: string };
/** Earned, never bought: each one is read off the chain or the town's own records. */
export function badgesOf(p: Profile, pets: CatView[] | null): Badge[] {
  const out: Badge[] = [];
  if (p.admin) out.push({ key: 'mayor', icon: '🎩', label: 'Mayor', tip: 'Looks after Emotown.' });
  if (p.resident && p.resident <= 500) out.push({ key: 'early', icon: '🏡', label: `Early resident #${p.resident}`, tip: 'One of the first 500 people to sign in to Emotown.' });
  if (!pets) return out;
  const s = statsOf(pets);
  if (s.crowns) out.push({ key: 'crown', icon: '👑', label: s.crowns > 1 ? `${s.crowns} crowns` : 'Crowned', tip: 'Holds a pet wearing one of the 100 crowns right now.' });
  if (s.neverDied) out.push({ key: 'never', icon: '✨', label: 'Never died', tip: 'Holds a pet that has never died.' });
  if (pets.some((v) => v.col === 'cat' && v.id <= 82_423)) out.push({ key: 'og', icon: '🐈', label: 'Launch cat', tip: 'Holds one of the 82,423 cats airdropped at launch.' });
  const held = new Set(pets.map((v) => v.col));
  if (held.has('cat') && held.has('frok') && held.has('sahur')) {
    if (__EMONAD__ && __R3TARDS__ && __THICCUMS__ && held.has('thiccums') && held.has('r3tards') && held.has('emonad')) out.push({ key: 'trio', icon: '🎪', label: 'All six', tip: 'Holds a cat, an inversebrah, a Sahur, a Thiccums, a r3tard and an Emonad.' });
    else if (__R3TARDS__ && __THICCUMS__ && held.has('thiccums') && held.has('r3tards')) out.push({ key: 'trio', icon: '🎪', label: 'All five', tip: 'Holds a cat, an inversebrah, a Sahur, a Thiccums and a r3tard.' });
    else if (__THICCUMS__ && held.has('thiccums')) out.push({ key: 'trio', icon: '🎪', label: 'All four', tip: 'Holds a cat, an inversebrah, a Sahur and a Thiccums.' });
    else out.push({ key: 'trio', icon: '🎪', label: 'All three', tip: 'Holds a cat, an inversebrah and a Sahur.' });
  }
  if (s.longestStreak >= 7) out.push({ key: 'streak', icon: '🔥', label: `${s.longestStreak}-day streak`, tip: 'A pet cared for every day, this many days running.' });
  if (s.cares >= 500) out.push({ key: 'carer', icon: '💗', label: 'Devoted', tip: '500 or more cares across their pets.' });
  if (s.named) out.push({ key: 'named', icon: '🏷️', label: s.named > 1 ? `${s.named} named pets` : 'Named pet', tip: 'Named a pet (10 MON, 80% burned). This is what lets them talk in town.' });
  return out;
}

const PLATFORM_NAME: Record<Platform, string> = { x: 'X', telegram: 'Telegram', discord: 'Discord', farcaster: 'Farcaster', github: 'GitHub', website: 'Website' };
const PLATFORM_ICON: Record<Platform, string> = { x: '𝕏', telegram: '✈', discord: '◎', farcaster: '⌂', github: '⌥', website: '🔗' };

/** Their links: each platform's own address, opened through the warning, and never presented as checked. */
export function SocialLinks({ socials, who }: { socials: Profile['socials']; who: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const list = PLATFORMS.filter((pf) => socials[pf]);
  if (!list.length) return null;
  return (
    <div className="so-socials">
      {list.map((pf) => {
        const h = socials[pf]!; const l = socialLink(pf, h);
        return l.href
          ? <button key={pf} type="button" className="so-social" onClick={() => askToOpen(l.href!, l.href, who)} title={`${PLATFORM_NAME[pf]} (not verified)`}><b aria-hidden>{PLATFORM_ICON[pf]}</b>{l.label}</button>
          : <button key={pf} type="button" className="so-social" onClick={() => { void navigator.clipboard?.writeText(h).then(() => { setCopied(pf); setTimeout(() => setCopied(null), 1400); }); }} title={`${PLATFORM_NAME[pf]} (not verified): tap to copy`}><b aria-hidden>{PLATFORM_ICON[pf]}</b>{copied === pf ? 'Copied' : l.label}</button>;
      })}
      <span className="so-unverified" title="Anyone can type any handle. Emotown does not check that these accounts belong to this wallet.">unverified</span>
    </div>
  );
}

/** Follow / Following. Signed out, it asks you to sign in first. */
export function FollowButton({ p, onChange }: { p: Profile; onChange?: () => void }) {
  const s = useSocial();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (s.me?.address === p.address) return null;
  const on = s.following.has(p.address);
  const click = async () => {
    if (!s.me) { askSignIn(`Sign in to follow ${nameOf(p)}.`); return; }
    setBusy(true); setErr(null);
    try { await social.follow(p.address, !on); onChange?.(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={`so-btn ${on ? 'on' : 'primary'}`} onClick={() => void click()} disabled={busy || !!p.me?.blocked}>{on ? 'Following' : p.me?.followedBy ? 'Follow back' : 'Follow'}</button>
      {err && <span className="so-err">{err}</span>}
    </>
  );
}

/** Why the Message button is off, in a sentence (or null when it is on). */
export function dmClosed(p: Profile, signedIn: boolean): string | null {
  if (!signedIn) return null;
  if (p.me?.blocked) return 'You blocked them.';
  if (!p.me?.canDM) return `You can message ${nameOf(p)} once they follow you, or answer if they write to you first.`;
  return null;
}
