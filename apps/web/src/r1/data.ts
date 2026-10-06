/**
 * What the r1's other screens read: the shop's catalogue and pictures, the crown list, the stats index. Each is loaded
 * when first asked for and kept for the session, so reopening a screen costs nothing and the public RPC is not asked
 * twice for the same immutable item picture.
 */
import { useEffect, useState } from 'react';
import type { CatView, Collection, ItemView } from '@emo-pets/chain';
import { chainClient } from '../game/chain';
import { svgSrc } from '../ui/svgImg';

type Loaded<T> = { data: T | null; error: string | null };

// ---------------------------------------------------------------- the shop
let itemsCache: ItemView[] | null = null;
const imageCache = new Map<number, string>();
export function useItems(enabled: boolean): Loaded<ItemView[]> & { images: Record<number, string> } {
  const [data, setData] = useState<ItemView[] | null>(itemsCache);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Record<number, string>>(() => Object.fromEntries(imageCache));
  useEffect(() => {
    if (!enabled || !chainClient || itemsCache) return;
    let on = true;
    chainClient.items().then((list) => { itemsCache = list; if (on) { setData(list); setError(null); } }).catch((e) => { if (on) setError((e as Error).message); });
    return () => { on = false; };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !chainClient || !data) return;
    let on = true;
    for (const it of data) {
      if (imageCache.has(it.id)) continue;
      chainClient.itemImage(it.id).then((svg) => { const src = svgSrc(svg); imageCache.set(it.id, src); if (on) setImages((m) => ({ ...m, [it.id]: src })); }).catch(() => {});
    }
    return () => { on = false; };
  }, [enabled, data]);
  return { data, error, images };
}

// ---------------------------------------------------------------- the crown list
export type BoardRow = { rank: number; id: number; col: Collection; name: string; score: number; streak: number; crowned: boolean; view: CatView };
const boardCache = new Map<Collection, { at: number; rows: BoardRow[] }>();
export function useBoard(col: Collection, enabled: boolean): Loaded<BoardRow[]> {
  const [data, setData] = useState<BoardRow[] | null>(boardCache.get(col)?.rows ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const cached = boardCache.get(col);
    setData(cached?.rows ?? null);
    if (!enabled || !chainClient || (cached && Date.now() - cached.at < 60_000)) return;
    let on = true;
    (async () => {
      const list = await chainClient!.crownList(col);
      const views = await chainClient!.catsByIds(list.map((e) => e.id), col);
      const rows = views.map((v) => ({ v, live: list.find((e) => e.id === v.id)! })).filter(({ v }) => v.alive)
        .sort((a, b) => b.live.score - a.live.score || b.live.streak - a.live.streak)
        .map(({ v, live }, i): BoardRow => ({ rank: i + 1, id: v.id, col, name: v.name, score: live.score, streak: v.streak, crowned: v.crowned, view: v }));
      boardCache.set(col, { at: Date.now(), rows });
      if (on) { setData(rows); setError(null); }
    })().catch((e) => { if (on) setError((e as Error).message); });
    return () => { on = false; };
  }, [col, enabled]);
  return { data, error };
}

// ---------------------------------------------------------------- the stats index
export type StatsIndex = {
  generatedAt: string;
  cats: { mints: number; deadNow: number; neverDied: number; namesGiven: number; careTotal: number; pets: number; holders: number; active24h: number; burn: { emo?: number; mon?: number; emoBurned?: number; monBurned?: number } };
  froks: { mints: number; deadNow: number; neverDied: number; namesGiven: number; careTotal: number; pets: number; holders: number; active24h: number; abuseTotal: number; burn: { emo?: number; mon?: number; emoBurned?: number; monBurned?: number } };
  sahurs?: { mints: number; deadNow: number; neverDied: number; namesGiven: number; careTotal: number; pets: number; holders: number; active24h: number; abuseTotal: number; burn: { emo?: number; mon?: number; emoBurned?: number; monBurned?: number } };
  shop?: { items?: unknown[]; burn?: { emo?: number; mon?: number; emoBurned?: number; monBurned?: number } };
};
let statsCache: { at: number; data: StatsIndex } | null = null;
export function useStats(enabled: boolean): Loaded<StatsIndex> {
  const [data, setData] = useState<StatsIndex | null>(statsCache?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || (statsCache && Date.now() - statsCache.at < 300_000)) return;
    let on = true;
    fetch('/api/stats', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`stats ${r.status}`); return r.json() as Promise<StatsIndex>; })
      .then((d) => { statsCache = { at: Date.now(), data: d }; if (on) { setData(d); setError(null); } })
      .catch((e) => { if (on) setError((e as Error).message); });
    return () => { on = false; };
  }, [enabled]);
  return { data, error };
}
