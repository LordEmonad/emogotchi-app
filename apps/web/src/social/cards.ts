/**
 * People's current names and avatars, for lists that were written earlier (a message keeps the name its author had
 * when they said it; this is what they are called now). Asked for in batches of up to a hundred, kept a minute.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { Card } from './types';

const FRESH = 60_000;
const cache = new Map<string, { card: Card; at: number }>();
const want = new Set<string>();
const subs = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const cardFor = (a: string): Card | undefined => cache.get(a.toLowerCase())?.card;
/** Forget someone (their profile just changed), so the next look asks again. */
export function forgetCard(a: string) { cache.delete(a.toLowerCase()); }

function ask(addresses: readonly string[]) {
  const now = Date.now();
  for (const a of addresses) { const k = a.toLowerCase(); const c = cache.get(k); if (!c || now - c.at > FRESH) want.add(k); }
  if (!want.size || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...want].slice(0, 100); for (const a of batch) want.delete(a);
    try {
      const r = await api.get<{ items: Card[] }>(`/cards?a=${batch.join(',')}`);
      const t = Date.now();
      for (const c of r.items) cache.set(c.address.toLowerCase(), { card: c, at: t });
      version++; for (const f of subs) f();
    } catch { /* keep what we had; the message's own name shows meanwhile */ }
    if (want.size) ask([]);
  }, 120);
}

/** Subscribe to the cards of these addresses; re-renders when any arrive. */
export function useCards(addresses: readonly string[]): number {
  const key = addresses.join(',');
  useEffect(() => { ask(addresses); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
}
