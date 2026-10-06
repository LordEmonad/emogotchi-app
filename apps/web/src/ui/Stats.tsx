/**
 * /stats: everything, every pet and the shop, in numbers. History comes from the Worker (/api/stats: every
 * event that ever happened, folded per day, plus the latest ones); the live numbers (supply, queues, crowns, the
 * catalogue) come from the contracts as you look. Charts are plain SVG drawn here: no library, so nothing ships
 * that the page does not use.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { chainClient, chainCfg } from '../game/chain';
import type { CrownEntry, ItemView, Totals } from '@emo-pets/chain';
import { Icon } from './Icon';
import { ASPECT, type PropName } from '../scene/props';
import { shortAddr } from '../wallet';
import { svgSrc } from './svgImg';

// ---- the data the Worker folds
type Day = { day: number; actions: number; feeds: number; pets: number; names: number; deaths: number; revives: number; mints: number; abuses: number; monIn: number; monBurned: number; emoBurned: number; wallets: number };
type Named = { id: number; name: string; v: number };
type Recent = { ts: number; kind: 'care' | 'name' | 'revive' | 'pet' | 'burn' | 'abuse' | 'mint' | 'transfer'; a?: number; id?: number; name?: string; by?: string; n?: number; mon?: number; emo?: number };
type PetKey = 'cat' | 'frok' | 'sahur' | 'thiccums' | 'r3tards' | 'emonad';
type PetStats = {
  key: PetKey; address: string; firstTs: number; lastTs: number;
  mints: number; airdropped?: number; holders: number; transfers: number; deaths: number; deadNow?: number; neverDied?: number; revives: number; namesGiven: number;
  actions: Record<string, number>; careTotal: number; pets: number; petCalls: number; monIn: number; uniqueCarers: number; active24h: number; active7d: number;
  burn: { cranks: number; monBurned: number; emoBurned: number; lastCrank: number; biggest?: { ts: number; mon: number; emo: number } | null };
  abuses: Record<string, number>; abuseTotal: number;
  top: { caredPets: Named[]; carers: { wallet: string; v: number }[]; spenders: { wallet: string; v: number }[]; spentPets: Named[]; pettedPets: Named[]; abusedPets: Named[]; abuseKind: Record<string, Named[]>; revivedPets?: Named[] };   // revivedPets: since 2026-09-25, absent from a blob folded before
  recent?: Recent[];
  series: Day[]; hourly: { hour: number; actions: number }[];
};
type ShopStats = { address: string; items: { id: number; claims: number; qty: number; wallets: number; monIn: number; first: number; last: number }[]; series: { day: number; claims: number }[]; burn: { cranks: number; monBurned: number; emoBurned: number } };
/** `sahurs` arrives once the Worker has his address (worker/stats.js SAHURS) */
/** `all`: across every pet, each wallet once (since 2026-09-26); `stale`: the Worker served its last good fold */
type AllStats = { generatedAt: string; now: number; cats: PetStats; froks: PetStats; sahurs?: PetStats; thiccums?: PetStats; r3tards?: PetStats; emonad?: PetStats; all?: { active24h: number; active7d: number }; shop: ShopStats; stale?: boolean };
type Live = { totals: Partial<Record<PetKey, Totals | null>>; crowns: Partial<Record<PetKey, CrownEntry[]>>; items: ItemView[] };

// ---- palette, validated for the site's dark surface (dataviz: 3 categorical slots, all checks pass)
// (the fourth pet's entries exist only in a build with his switch on: __THICCUMS__)
const C = { cat: '#e84d7f', frok: '#5da03a', sahur: '#d2822e', ...(__THICCUMS__ ? { thiccums: '#6fb7e8' } : {}), ...(__R3TARDS__ ? { r3tards: '#e6cf5a' } : {}), ...(__EMONAD__ ? { emonad: '#c4a0f2' } : {}), shop: '#8f6fc8', ink3: 'rgba(248,248,255,0.4)', grid: 'rgba(248,248,255,0.08)' } as Record<PetKey | 'shop' | 'ink3' | 'grid', string>;
const PET_LABEL = { cat: 'Cats', frok: 'inversebrah', sahur: 'Tung Tung Tung Sahur', ...(__THICCUMS__ ? { thiccums: 'Thiccums' } : {}), ...(__R3TARDS__ ? { r3tards: 'r3tards' } : {}), ...(__EMONAD__ ? { emonad: 'Emonad' } : {}) } as Record<PetKey, string>;
// the charts' legends: the same names, Sahur's short (with six pets the full "Tung Tung Tung Sahur" pushed the last name
// onto a line of its own in every half-width chart)
const LEGEND_LABEL = { ...PET_LABEL, sahur: 'Sahur' } as Record<PetKey, string>;
const PET_ONE = { cat: 'cat', frok: 'inversebrah', sahur: 'Sahur', ...(__THICCUMS__ ? { thiccums: 'Thiccums' } : {}), ...(__R3TARDS__ ? { r3tards: 'r3tard' } : {}), ...(__EMONAD__ ? { emonad: 'Emonad' } : {}) } as Record<PetKey, string>;
const PET_MANY = { cat: 'cats', frok: 'inversebrahs', sahur: 'Sahurs', ...(__THICCUMS__ ? { thiccums: 'Thiccums' } : {}), ...(__R3TARDS__ ? { r3tards: 'r3tards' } : {}), ...(__EMONAD__ ? { emonad: 'Emonads' } : {}) } as Record<PetKey, string>;
const PET_PATH = { cat: '/pet', frok: '/inversebrah/pet', sahur: '/tung/pet', ...(__THICCUMS__ ? { thiccums: '/thiccums/pet' } : {}), ...(__R3TARDS__ ? { r3tards: '/r3tardgotchi/pet' } : {}), ...(__EMONAD__ ? { emonad: '/emonadgotchi/pet' } : {}) } as Record<PetKey, string>;
const PET_Q = { cat: '', frok: 'pet=frok&', sahur: 'pet=sahur&', ...(__THICCUMS__ ? { thiccums: 'pet=thiccums&' } : {}), ...(__R3TARDS__ ? { r3tards: 'pet=r3tards&' } : {}), ...(__EMONAD__ ? { emonad: 'pet=emonad&' } : {}) } as Record<PetKey, string>;
const PET_GALLERY = { cat: '/pets', frok: '/pets?pet=frok', sahur: '/pets?pet=sahur', ...(__THICCUMS__ ? { thiccums: '/pets?pet=thiccums' } : {}), ...(__R3TARDS__ ? { r3tards: '/pets?pet=r3tards' } : {}), ...(__EMONAD__ ? { emonad: '/pets?pet=emonad' } : {}) } as Record<PetKey, string>;
const PORTRAIT = { cat: '/nft/happy-1024.png', frok: '/nft/inversebrah/happy-1024.png', sahur: '/nft/sahur/happy-1024.png', ...(__THICCUMS__ ? { thiccums: '/nft/thiccums/happy-1024.png' } : {}), ...(__R3TARDS__ ? { r3tards: '/social/av/r3tards/content.webp' } : {}), ...(__EMONAD__ ? { emonad: '/social/av/emonad/content.webp' } : {}) } as Record<PetKey, string>;   // (his: the face. He is a face on a stick, and whole he is a smudge at this size)
const ABUSED: Record<string, string> = { screenshot: 'screenshotted', slap: 'slapped', squeeze: 'squeezed', burn: 'burned', tung: 'tung tung tung', ...(__THICCUMS__ ? { bounce: 'bounced' } : {}) };
const CARE_ICON: Record<string, PropName> = { feed: 'bowl', play: 'yarn', wash: 'sponge', sleep: 'moon', clean: 'scoop' };
const ABUSE_ICON: Record<string, PropName> = { screenshot: 'camera', slap: 'pow', squeeze: 'clawjaw', burn: 'fire', tung: 'tung', ...(__THICCUMS__ ? { bounce: 'sparkle' as PropName } : {}) };
const ACTIONS = ['feed', 'play', 'wash', 'sleep', 'clean'] as const;
const ABUSES = ['screenshot', 'slap', 'squeeze', 'burn'] as const;
/** each pet's stunts, in its contract's kind order (the Worker names them the same way) */
const STUNTS_OF = { cat: [], frok: ABUSES, sahur: ['tung'], ...(__THICCUMS__ ? { thiccums: ['bounce'] } : {}), ...(__R3TARDS__ ? { r3tards: [] } : {}), ...(__EMONAD__ ? { emonad: [] } : {}) } as Record<PetKey, readonly string[]>;
const petName = (key: PetKey, r: Named) => r.name || `${key === 'cat' ? 'Emogotchi' : PET_ONE[key]} #${r.id}`;

const fmt = (n: number, dp = 0) => n.toLocaleString(undefined, { maximumFractionDigits: dp });
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const trim = (t: string) => t.replace(/\.0(?=[KM]$)/, '');
const compact = (n: number) => (n >= 1e6 ? trim(`${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`) : n >= 1e4 ? trim(`${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`) : fmt(n, n < 10 && n % 1 ? 1 : 0));
const dateOf = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });   // days are UTC days, as on chain
const hourOf = (ts: number) => { const d = new Date(ts * 1000); return d.getHours() === 0 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.toLocaleTimeString(undefined, { hour: 'numeric' }); };   // the viewer's clock
const hourTip = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
const sixHourly = (ts: number) => { const h = new Date(ts * 1000).getHours(); return h === 0 ? 2 : h % 6 === 0 ? 1 : 0; };   // midnight (the date) wins the space
const timeOf = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const ago = (ts: number, now: number) => { const d = Math.max(0, now - ts); return d < 60 ? 'just now' : d < 3600 ? `${Math.floor(d / 60)}m ago` : d < 86400 ? `${Math.floor(d / 3600)}h ago` : `${Math.floor(d / 86400)}d ago`; };
const wei = (v: bigint) => Number(v / 1_000_000_000_000_000n) / 1000;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Range = 7 | 30 | 0;

export function Stats() {
  const [data, setData] = useState<AllStats | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [tables, setTables] = useState(false);
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1000));
  // the per-pet panel shows one pet across the whole width (three side by side squished every tile and list, the
  // operator, 2026-09-25); ?pet=frok|sahur opens on that one, like the gallery
  const [sel, setSel] = useState<PetKey>(() => { const v = new URLSearchParams(location.search).get('pet'); return v === 'frok' || v === 'sahur' || (__THICCUMS__ && v === 'thiccums') || (__R3TARDS__ && v === 'r3tards') || (__EMONAD__ && v === 'emonad') ? v : 'cat'; });
  const pick = (k: PetKey) => { setSel(k); history.replaceState(null, '', k === 'cat' ? '/stats' : `/stats?pet=${k}`); };

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch('/api/stats', { cache: 'no-cache' });
        const j = (await r.json()) as AllStats & { error?: string };
        if (j.error) throw new Error(j.error);
        if (!dead) { setData(j); setError(null); }
      } catch (e) { if (!dead) setError((e as Error).message); }
    };
    void load();
    const id = setInterval(() => void load(), 300_000);   // the Worker refolds every 15 min; asking every 5 picks a new fold up within 5 of it
    const t = setInterval(() => setTick(Math.floor(Date.now() / 1000)), 30_000);
    return () => { dead = true; clearInterval(id); clearInterval(t); };
  }, []);
  useEffect(() => {
    const client = chainClient; if (!client) return;
    let dead = false;
    const seen = new Set<number>();
    const load = async () => {
      try {
        const cols = client.collections;
        const [totalsBy, crownsBy, items] = await Promise.all([
          Promise.all(cols.map((c) => client.totals(c).catch(() => null))), Promise.all(cols.map((c) => client.crownList(c).catch(() => [] as CrownEntry[]))), chainCfg?.items ? client.items().catch(() => []) : Promise.resolve([]),
        ]);
        const totals: Partial<Record<PetKey, Totals | null>> = {}; const crowns: Partial<Record<PetKey, CrownEntry[]>> = {};
        cols.forEach((c, i) => { totals[c] = totalsBy[i] ?? null; crowns[c] = crownsBy[i] ?? []; });
        if (!dead) setLive({ totals, crowns, items });
        for (const it of items) if (!seen.has(it.id)) { seen.add(it.id); void client.itemImage(it.id).then((svg) => { if (!dead) setImages((m) => ({ ...m, [it.id]: svg })); }).catch(() => {}); }
      } catch { /* the next tick */ }
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  const now = Math.max(tick, data?.now ?? 0);
  const cut = range ? now - range * 86400 : 0;
  const petList = useMemo(() => (data ? [data.cats, data.froks, ...(data.sahurs ? [data.sahurs] : []), ...(__THICCUMS__ && data.thiccums ? [data.thiccums] : []), ...(__R3TARDS__ && data.r3tards ? [data.r3tards] : []), ...(__EMONAD__ && data.emonad ? [data.emonad] : [])] : []), [data]);
  // one row per day in the range, with each pet's day (or null) in the pets' order
  const days = useMemo(() => {
    if (!data) return [] as DayRow[];
    const blank = (day: number): DayRow => ({ day, by: petList.map(() => null) });
    const map = new Map<number, DayRow>();
    petList.forEach((p, i) => { for (const d of p.series) if (d.day >= cut) { const o = map.get(d.day) ?? blank(d.day); o.by[i] = d; map.set(d.day, o); } });
    // every day in the range, even quiet ones, so the axis is honest
    const first = Math.min(...[...map.keys()], Math.floor(now / 86400) * 86400);
    const out: DayRow[] = [];
    for (let d = cut ? Math.max(first, Math.floor(cut / 86400) * 86400) : first; d <= Math.floor(now / 86400) * 86400; d += 86400) out.push(map.get(d) ?? blank(d));
    return out;
  }, [data, petList, cut, now]);

  if (error && !data) return <main className="stats"><div className="lb-head"><h1>Stats</h1></div><p className="lb-note">The stats index is not answering: {error}</p></main>;
  if (!data) return <main className="stats"><div className="lb-head"><h1>Emogotchi, in numbers</h1><p>Folding every event that ever happened…</p></div><div className="stats-skeleton" aria-hidden /></main>;

  const { cats, froks, sahurs, shop } = data;
  const pets = petList;
  const sum = (f: (p: PetStats) => number) => pets.reduce((n, p) => n + f(p), 0);
  const emoBurned = sum((p) => p.burn.emoBurned) + shop.burn.emoBurned;
  const monBurned = sum((p) => p.burn.monBurned) + shop.burn.monBurned;
  const cranks = sum((p) => p.burn.cranks) + shop.burn.cranks;
  const queued = live ? pets.reduce((n, p) => n + (live.totals[p.key] ? wei(live.totals[p.key]!.pendingBurnMon) : 0), 0) : null;
  const supplyOf = (p: PetStats) => live?.totals[p.key]?.totalSupply ?? p.mints;
  const lastCrank = Math.max(...pets.map((p) => p.burn.lastCrank));
  const colSeries = pets.map((p) => ({ key: p.key, label: LEGEND_LABEL[p.key], color: C[p.key] }));

  // the records: the biggest of everything, all time
  const allDays = mergeDays(...pets.map((p) => p.series));
  const busiest = maxBy(allDays, (d) => d.actions);
  const burniest = maxBy(allDays, (d) => d.emoBurned);
  const namiest = maxBy(allDays, (d) => d.names);
  const crank = maxBy(pets.map((p) => p.burn.biggest).filter((b): b is { ts: number; mon: number; emo: number } => !!b), (b) => b.emo);
  const hour = maxBy(cats.hourly.map((h, i) => ({ hour: h.hour, actions: pets.reduce((n, p) => n + (p.hourly[i]?.actions ?? 0), 0) })), (h) => h.actions);
  const cared = maxBy(pets.flatMap((p) => p.top.caredPets.slice(0, 1).map((r) => ({ ...r, col: p.key }))), (r) => r.v);
  const abused = froks.top.abusedPets[0];
  const tunged = sahurs?.top.abusedPets[0];
  const bounced = __THICCUMS__ ? data.thiccums?.top.abusedPets[0] : undefined;

  const feed = pets.flatMap((p) => (p.recent ?? []).map((e) => ({ ...e, col: p.key }))).sort((a, b) => b.ts - a.ts).slice(0, 14);

  return (
    <main className="stats">
      <div className="lb-head stats-head">
        <h1>Emogotchi, in numbers</h1>
        <p>Every care, pet, name, death, mint, transfer, burn and stunt on every pet contract, and every claim in the item shop, folded from the chain's own event log. Live numbers (supply, queues, crowns) are read from the contracts as you look. Nothing is estimated.</p>
      </div>
      <div className="stats-bar">
        <div className="stats-filters" role="group" aria-label="Range">
          {([7, 30, 0] as Range[]).map((r) => <button key={r} className={`chip-btn ${range === r ? 'is-on' : ''}`} onClick={() => setRange(r)}>{r === 0 ? 'All time' : `Last ${r} days`}</button>)}
          <button className={`chip-btn ${tables ? 'is-on' : ''}`} onClick={() => setTables((t) => !t)} aria-pressed={tables}>Tables</button>
        </div>
        <span className="stats-updated tnum"><i className="stats-live" aria-hidden /> history updated {ago(Math.floor(new Date(data.generatedAt).getTime() / 1000), now)} · live numbers every 30s</span>
      </div>

      {/* ---- the headline */}
      <section className="stats-hero" aria-label="Headline">
        <div className="stats-hero-main">
          <span className="stats-hero-label"><Icon name="flame" size={18} /> EMO burned, all of it</span>
          <span className="stats-hero-value tnum"><Num v={emoBurned} /></span>
          <span className="stats-hero-sub tnum">from <b>{fmt(monBurned, 1)} MON</b> in <b>{fmt(cranks)} cranks</b>{lastCrank ? <>, the last one {ago(lastCrank, now)}</> : null}</span>
          {queued !== null && <span className="stats-queued tnum"><i className="stats-live" aria-hidden /> {fmt(queued, 2)} MON queued for the next crank</span>}
          <Spark days={allDays.slice(-21)} />
        </div>
        <div className={`stats-kpis ${__EMONAD__ && data.emonad ? 'is-six' : __R3TARDS__ && data.r3tards ? 'is-five' : __THICCUMS__ && data.thiccums ? 'is-four' : ''}`}>
          {pets.map((p) => <Tile key={p.key} label={p.key === 'cat' ? 'Cats' : PET_MANY[p.key]} value={supplyOf(p)} sub={`${fmt(p.holders)} holders${p.key === 'cat' ? '' : ' · free mint'}`} color={C[p.key]} img={PORTRAIT[p.key]} href={PET_GALLERY[p.key]} />)}
          <Tile label="Care actions" value={sum((p) => p.careTotal)} sub={`plus ${fmt(sum((p) => p.pets))} times petted`} icon="bowl" />
          <Tile label="Active wallets" value={data.all?.active24h ?? sum((p) => p.active24h)} sub={`24h · ${fmt(data.all?.active7d ?? sum((p) => p.active7d))} this week`} icon="coin" />
          <Tile label="Names given" value={sum((p) => p.namesGiven)} sub={`${fmt(sum((p) => p.namesGiven) * 10)} MON, 80% burned`} icon="sparkle" />
          <Tile label="Abuse" value={froks.abuseTotal} sub="on inversebrahs, counted forever" color={C.frok} icon="pow" />
          {sahurs && <Tile label="Tung tung tungs" value={sahurs.abuseTotal} sub="knocked out on chain, counted forever" color={C.sahur} icon="tung" />}
          {__THICCUMS__ && data.thiccums && <Tile label="Butt bounces" value={data.thiccums.abuseTotal} sub="bounced on chain, counted forever" color={C.thiccums} icon="sparkle" />}
          <Tile label="Items claimed" value={live ? live.items.reduce((a, it) => a + it.minted, 0) : shop.items.reduce((a, it) => a + it.qty, 0)} sub={`${live?.items.length ?? shop.items.length} items in the shop, all free`} color={C.shop} icon="pumpkin" href="/shop" />
        </div>
      </section>

      {/* ---- the records */}
      <section className="stats-records" aria-label="Records">
        {busiest && <Record icon="bowl" label="Busiest day" value={plural(busiest.actions, 'care')} sub={dateOf(busiest.day)} />}
        {burniest && <Record icon="flame" label="Biggest burn day" value={`${fmt(burniest.emoBurned)} EMO`} sub={dateOf(burniest.day)} />}
        {crank && <Record icon="fire" label="Biggest crank" value={`${fmt(crank.emo)} EMO`} sub={`${fmt(crank.mon, 1)} MON · ${dateOf(crank.ts)}`} />}
        {hour && hour.actions > 0 && <Record icon="sparkle" label="Busiest hour, 48h" value={plural(hour.actions, 'action')} sub={hourTip(hour.hour)} />}
        {namiest && <Record icon="heart" label="Names in a day" value={plural(namiest.names, 'name')} sub={dateOf(namiest.day)} />}
        {cared && <Record icon={cared.col === 'frok' ? 'emohair' : cared.col === 'sahur' ? 'tung' : __THICCUMS__ && cared.col === 'thiccums' ? 'sparkle' : 'yarn'} label="Most cared-for" value={petName(cared.col, cared)} sub={plural(cared.v, 'care')} href={`${PET_PATH[cared.col]}/${cared.id}`} />}
        {abused && <Record icon="pow" label="Most abused" value={petName('frok', abused)} sub={`${fmt(abused.v)}× and counting`} href={`/inversebrah/pet/${abused.id}`} />}
        {tunged && <Record icon="tung" label="Most tung tung tung" value={petName('sahur', tunged)} sub={`${fmt(tunged.v)}× and counting`} href={`/tung/pet/${tunged.id}`} />}
        {__THICCUMS__ && bounced && <Record icon="sparkle" label="Most bounced" value={petName('thiccums', bounced)} sub={`${fmt(bounced.v)}× and counting`} href={`/thiccums/pet/${bounced.id}`} />}
      </section>

      {/* ---- burning over time */}
      <Card title="EMO burned over time" sub="every pet contract, stacked; a crank turns the queued MON into EMO and burns it">
        <BurnChart key={range} pets={pets} days={days} now={now} tables={tables} />
        <div className="stats-facts tnum">
          {pets.map((p) => <span key={p.key}><i className="stats-dot" style={{ background: C[p.key] }} /> {p.key === 'cat' ? 'cats' : PET_ONE[p.key]}: {fmt(p.burn.emoBurned)} EMO · {fmt(p.burn.cranks)} cranks{p.burn.lastCrank ? ` · last ${ago(p.burn.lastCrank, now)}` : ''}</span>)}
          {shop.burn.cranks > 0 && <span><i className="stats-dot" style={{ background: C.shop }} /> shop: {fmt(shop.burn.emoBurned)} EMO · {fmt(shop.burn.cranks)} cranks</span>}
        </div>
      </Card>

      {/* ---- activity */}
      <div className="stats-grid2">
        <Card title="Care actions per day" sub="feed, play, wash, sleep, clean; per pet contract">
          <Columns key={range} series={colSeries} days={days} pick={(d) => d.actions} unit="actions" tables={tables} W={360} partialLast />
        </Card>
        <Card title="Mints per day" sub={`cat claims, and every ${__EMONAD__ && data.emonad ? 'inversebrah, Sahur, Thiccums, r3tard and Emonad' : __R3TARDS__ && data.r3tards ? 'inversebrah, Sahur, Thiccums and r3tard' : __THICCUMS__ && data.thiccums ? 'inversebrah, Sahur and Thiccums' : sahurs ? 'inversebrah and Sahur' : 'inversebrah'} a wallet mints for itself${cats.airdropped ? `; the ${fmt(cats.airdropped)} cats airdropped at launch are left out` : ''}`}>
          <Columns key={range} series={colSeries} days={days} pick={(d) => d.mints} unit="mints" tables={tables} W={360} partialLast />
        </Card>
        <Card title="Names per day" sub="10 MON each, on every pet; on the free pets it is the only thing that costs anything">
          <Columns key={range} series={colSeries} days={days} pick={(d) => d.names} unit="names" tables={tables} W={360} partialLast />
        </Card>
        <Card title="Wallets active per day" sub="wallets that cared, petted or did a stunt, per pet (a wallet with two pets counts in both)">
          <Columns key={range} series={colSeries} days={days} pick={(d) => d.wallets} unit="wallets" tables={tables} W={360} partialLast />
        </Card>
      </div>
      <Card title="The last 48 hours, by the hour" sub="care actions and stunts, every pet">
        <Hourly series={colSeries} hourly={pets.map((p) => p.hourly)} tables={tables} />
      </Card>

      {/* ---- the latest events */}
      {feed.length > 0 && (
        <Card title="Latest on chain" sub="the newest events in the index, every pet">
          <ol className="stats-feed">
            {feed.map((e, i) => <li key={`${e.col}${e.ts}${i}`} style={{ animationDelay: `${i * 40}ms` }}><FeedRow e={e} now={now} /></li>)}
          </ol>
        </Card>
      )}

      {/* ---- one pet at a time, the whole width */}
      <section className="stats-perpet" aria-label="Each pet on its own">
        <div className="stats-perpet-head">
          <div><h2>One pet at a time</h2><p>Its own numbers, what the care is made of, and who is winning at it.</p></div>
          <div className="pet-switch stats-petswitch" role="tablist" aria-label="Which pet">
            {pets.map((p) => <button key={p.key} role="tab" aria-selected={sel === p.key} className={`chip-btn ${sel === p.key ? 'is-on' : ''}`} onClick={() => pick(p.key)}><img src={PORTRAIT[p.key]} alt="" />{PET_LABEL[p.key]}</button>)}
          </div>
        </div>
        {(() => { const cur = pets.find((p) => p.key === sel) ?? cats; return <PetPanel key={cur.key} s={cur} supply={supplyOf(cur)} crown={live?.crowns[cur.key] ?? []} now={now} color={C[cur.key]} tables={tables} />; })()}
      </section>

      {/* ---- the shop */}
      <Card title="Item shop" sub="claims per item; supply from the contract" href="/shop" link="Open the shop">
        <div className="stats-items">
          {(live?.items ?? []).map((it) => {
            const h = shop.items.find((x) => x.id === it.id);
            const cap = it.maxSupply === 0 ? null : it.maxSupply;
            return (
              <a className="stats-item" key={it.id} href="/shop">
                <div className="stats-item-img">{images[it.id] ? <img src={svgSrc(images[it.id]!)} alt="" /> : <div className="stats-item-ph" />}</div>
                <div className="stats-item-body">
                  <div className="stats-item-head"><b>{it.name}</b><span className="tnum">{fmt(it.minted)}{cap ? ` / ${fmt(cap)}` : ' · unlimited'}</span></div>
                  {cap ? <div className="stats-meter" role="meter" aria-valuenow={it.minted} aria-valuemin={0} aria-valuemax={cap} aria-label={`${it.name} claimed`}><span style={{ width: `${Math.min(100, (it.minted / cap) * 100)}%` }} /></div> : <div className="stats-meter is-open"><span style={{ width: '100%' }} /></div>}
                  <div className="stats-item-facts tnum">
                    <span>{plural(h?.claims ?? 0, 'claim')}</span><span>{plural(h?.wallets ?? 0, 'wallet')}</span><span>{it.price === 0n ? 'free' : `${fmt(wei(it.price))} MON`}</span>{h?.monIn ? <span>{fmt(h.monIn)} MON in</span> : null}{h?.last ? <span>last {ago(h.last, now)}</span> : null}
                  </div>
                </div>
              </a>
            );
          })}
          {(!live || live.items.length === 0) && <p className="lb-note">Reading the shop…</p>}
        </div>
      </Card>
      <p className="lb-note stats-contracts">
        <Contract label="cats" address={cats.address} /> · <Contract label="inversebrah" address={froks.address} />{sahurs && <> · <Contract label="Sahur" address={sahurs.address} /></>}{__THICCUMS__ && data.thiccums && <> · <Contract label="Thiccums" address={data.thiccums.address} /></>}{__R3TARDS__ && data.r3tards && <> · <Contract label="r3tards" address={data.r3tards.address} /></>}{__EMONAD__ && data.emonad && <> · <Contract label="Emonad" address={data.emonad.address} /></>} · <Contract label="items" address={shop.address} />
        <br />History indexed by Envio HyperSync and refreshed every fifteen minutes; supply, queues and crowns read live from Monad.
      </p>
    </main>
  );
}

function maxBy<T>(xs: T[], f: (x: T) => number) { return xs.reduce<T | null>((b, x) => (b === null || f(x) > f(b) ? x : b), null); }
function mergeDays(...lists: Day[][]) {
  const m = new Map<number, Day>();
  for (const d of lists.flat()) {
    const o = m.get(d.day);
    if (!o) m.set(d.day, { ...d });
    else for (const k of Object.keys(d) as (keyof Day)[]) if (k !== 'day') o[k] += d[k];
  }
  return [...m.values()].sort((x, y) => x.day - y.day);
}

// ---- motion: a number that counts up to its value (and again to every new value); off under reduced motion
function useCountUp(target: number, ms = 1400) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(target); return; }
    const start = performance.now(), a = from.current, b = target;
    let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - p, 3); setV(a + (b - a) * e); if (p < 1) raf = requestAnimationFrame(step); else from.current = b; };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [target, ms]);
  return v;
}
function Num({ v, dp = 0 }: { v: number; dp?: number }) { return <>{fmt(useCountUp(v), dp)}</>; }

// ---- pieces
/** A prop as an icon at its own aspect (the claw and the camera are wide; a square box squashes them). */
function Ico({ name, size }: { name: PropName; size: number }) {
  const ar = Math.min(1.7, Math.max(0.6, ASPECT[name]));
  return <span className="stats-ico" style={{ height: size, width: Math.round(size * ar) }}><Icon name={name} size={size} /></span>;
}
function Card({ title, sub, children, href, link }: { title: string; sub?: string; children: ReactNode; href?: string; link?: string }) {
  return (
    <section className="stats-card">
      <header className="stats-card-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{href && <a className="stats-more" href={href}>{link ?? 'More'} →</a>}</header>
      {children}
    </section>
  );
}
function Tile({ label, value, sub, color, icon, img, href }: { label: string; value: number; sub?: string; color?: string; icon?: PropName; img?: string; href?: string }) {
  const body = (
    <>
      {img ? <img className="stats-tile-img" src={img} alt="" /> : icon ? <span className="stats-tile-ico"><Ico name={icon} size={18} /></span> : null}
      <span className="stats-tile-label">{label}</span>
      <span className="stats-tile-value tnum"><Num v={value} /></span>
      {sub && <span className="stats-tile-sub tnum">{sub}</span>}
    </>
  );
  const style = color ? { ['--tile' as string]: color } : undefined;
  return href ? <a className="stats-tile is-link" href={href} style={style}>{body}</a> : <div className="stats-tile" style={style}>{body}</div>;
}
function Record({ icon, label, value, sub, href }: { icon: PropName; label: string; value: string; sub: string; href?: string }) {
  const body = <><span className="stats-rec-ico"><Ico name={icon} size={20} /></span><span className="stats-rec-label">{label}</span><span className="stats-rec-value">{value}</span><span className="stats-rec-sub tnum">{sub}</span></>;
  return href ? <a className="stats-rec is-link" href={href}>{body}</a> : <div className="stats-rec">{body}</div>;
}
function Contract({ label, address }: { label: string; address: string }) {
  const ex = chainCfg?.explorer;
  return <>{label} {ex ? <a href={`${ex}/address/${address}`} target="_blank" rel="noreferrer"><code>{address}</code></a> : <code>{address}</code>}</>;
}

const CARE_VERB = ['was fed', 'played', 'had a bath', 'was put to bed', 'had a clean-up', 'woke up'];
const ABUSE_VERB: Record<string, string> = { screenshot: 'got screenshotted', slap: 'got slapped', squeeze: 'got squeezed', burn: 'got set on fire', tung: 'went tung tung tung', ...(__THICCUMS__ ? { bounce: 'bounced that butt' } : {}) };
function FeedRow({ e, now }: { e: Recent & { col: PetKey }; now: number }) {
  const frok = e.col !== 'cat';
  const path = PET_PATH[e.col];
  const stunt = STUNTS_OF[e.col][e.a ?? 0] ?? STUNTS_OF[e.col][0] ?? 'slap';
  const who = e.id !== undefined ? <a href={`${path}/${e.id}`} className="stats-feed-pet">{e.name || `${e.col === 'cat' ? 'Emogotchi' : PET_ONE[e.col]} #${e.id}`}</a> : null;
  const by = e.by ? <a href={`/pets?${PET_Q[e.col]}q=${e.by}`} className="stats-feed-by">{shortAddr(e.by)}</a> : null;
  let icon: PropName = 'heart'; let text: ReactNode;
  switch (e.kind) {
    case 'care': icon = CARE_ICON[ACTIONS[e.a ?? 0] ?? 'feed'] ?? 'bowl'; text = <>{who} {CARE_VERB[e.a ?? 0]}{by && <>, by {by}</>}</>; break;
    case 'name': icon = 'sparkle'; text = <>{who} got a name{by && <>, from {by}</>}</>; break;
    case 'revive': icon = 'grave'; text = <>{who} came back from the dead</>; break;
    case 'pet': icon = 'heart'; text = <>{who} was petted{e.n && e.n > 1 ? ` ${e.n}×` : ''}{by && <>, by {by}</>}</>; break;
    case 'abuse': icon = ABUSE_ICON[stunt] ?? 'pow'; text = <>{who} {ABUSE_VERB[stunt]}{by && <>, by {by}</>}</>; break;
    case 'mint': icon = 'sun'; text = <>{who} was minted{by && <>, to {by}</>}</>; break;
    case 'transfer': icon = 'coin'; text = <>{who} changed hands{by && <>, to {by}</>}</>; break;
    case 'burn': icon = 'flame'; text = <><b>{fmt(e.emo ?? 0)} EMO</b> burned from {fmt(e.mon ?? 0, 2)} MON{frok ? ` on the ${PET_ONE[e.col]} contract` : ''}</>; break;
  }
  return (
    <>
      <span className="stats-feed-ico" style={{ ['--pet' as string]: C[e.col] }}><Ico name={icon} size={15} /></span>
      <span className="stats-feed-text">{text}</span>
      <span className="stats-feed-time tnum">{ago(e.ts, now)}</span>
    </>
  );
}

function PetPanel({ s, supply, crown, now, color, tables }: { s: PetStats; supply: number; crown: CrownEntry[]; now: number; color: string; tables: boolean }) {
  const frok = s.key !== 'cat';   // a free pet: no spend lists, a stunt list instead
  const stunts = STUNTS_OF[s.key];
  const one = PET_ONE[s.key]; const path = PET_PATH[s.key];
  const mix = ACTIONS.map((k) => ({ label: k, v: s.actions[k] ?? 0, icon: CARE_ICON[k] }));
  const alive = crown.filter((c) => c.alive);
  const avg = alive.length ? alive.reduce((a, c) => a + c.score, 0) / alive.length : 0;
  const name = (r: Named) => petName(s.key, r);
  const stuntTitle = s.key === 'sahur' ? 'Most tung tung tung' : __THICCUMS__ && s.key === 'thiccums' ? 'Most bounced' : 'Most abused';
  return (
    <section className="stats-card stats-pet" style={{ ['--pet' as string]: color }}>
      <header className="stats-pet-head">
        <img className="stats-pet-img" src={PORTRAIT[s.key]} alt="" />
        <div className="stats-pet-title">
          <h2>{PET_LABEL[s.key]}</h2>
          <p>{s.key === 'sahur' ? 'free mint, free care, tung tung tung, names burn' : __THICCUMS__ && s.key === 'thiccums' ? 'free mint, free care, the butt bounce, names burn' : (__R3TARDS__ && s.key === 'r3tards') || (__EMONAD__ && s.key === 'emonad') ? 'free mint, free care, names burn' : frok ? 'free mint, free care, four abuses, names burn' : 'airdropped and claimed, 1 MON a care, everything burns'}</p>
        </div>
        <a className="stats-more" href={PET_GALLERY[s.key]}>All {PET_MANY[s.key]} →</a>
      </header>
      <div className="stats-kpis stats-kpis-pet">
        <Tile label="Minted" value={supply} sub={`${fmt(s.holders)} holders · ${plural(s.transfers, 'transfer')}`} />
        <Tile label="Care actions" value={s.careTotal} sub={`by ${plural(s.uniqueCarers, 'wallet')}`} />
        <Tile label="Times petted" value={s.pets} sub="free, counted on chain" />
        <Tile label="Named" value={s.namesGiven} sub={`${fmt(s.namesGiven * 10)} MON`} />
        <Tile label="Dead now" value={s.deadNow ?? s.deaths} sub="by the feed clock" />
        <Tile label="Revived" value={s.revives} sub={frok ? 'brought back, free' : `brought back · ${fmt(s.revives * 1000)} MON`} />
        <Tile label="Crowned" value={alive.length} sub={alive.length ? `avg score ${avg.toFixed(1)}` : 'nobody has a week of history yet'} />
        {s.neverDied !== undefined && <Tile label="Never died" value={s.neverDied} sub="alive, never revived: the rare ones" />}
        <Tile label="MON in" value={s.monIn} sub={frok ? 'names only' : 'care, names, revives'} />
        <Tile label="Active" value={s.active24h} sub={`24h · ${fmt(s.active7d)} this week`} />
      </div>
      <div className="stats-pet-body">
        <div className="stats-pet-bars">
          <h3>What the care is</h3>
          <HBars rows={mix} unit="actions" tables={tables} />
          {stunts.length > 0 && (<>
            <h3>{s.key === 'sahur' ? 'The knocking' : __THICCUMS__ && s.key === 'thiccums' ? 'The bouncing' : 'The abuse'}</h3>
            <HBars rows={stunts.map((k) => ({ label: k === 'tung' ? 'tung tung tung' : __THICCUMS__ && k === 'bounce' ? 'butt bounce' : k, v: s.abuses[k] ?? 0, icon: ABUSE_ICON[k] }))} unit="times" tables={tables} />
          </>)}
        </div>
        <div className="stats-pet-lists">
          <List title={`Most cared-for ${one}s`} rows={s.top.caredPets.map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: plural(r.v, 'action') }))} />
          <List title="Top carers" rows={s.top.carers.map((r) => ({ href: `/pets?${PET_Q[s.key]}q=${r.wallet}`, label: shortAddr(r.wallet), v: r.v, text: plural(r.v, 'action') }))} />
          {frok
            ? stunts.length > 0 && <List title={stuntTitle} icon={s.key === 'sahur' ? 'tung' : __THICCUMS__ && s.key === 'thiccums' ? 'sparkle' : 'pow'} rows={s.top.abusedPets.map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: `${fmt(r.v)}×` }))} />
            : <List title="Biggest spenders" icon="coin" rows={s.top.spenders.map((r) => ({ href: `/pets?q=${r.wallet}`, label: shortAddr(r.wallet), v: r.v, text: `${fmt(r.v, 1)} MON` }))} />}
          <List title={`Most petted ${one}s`} icon="heart" rows={s.top.pettedPets.map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: plural(r.v, 'pet') }))} />
          {!frok && <List title="Most spent on" icon="flame" rows={s.top.spentPets.map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: `${fmt(r.v, 1)} MON` }))} />}
          {s.top.revivedPets && <List title="Most revived" icon="sun" rows={s.top.revivedPets.map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: `${fmt(r.v)}×` }))} />}
        </div>
      </div>
      {stunts.length > 1 && s.top.abuseKind && (
        <div className="stats-pet-kinds">
          {stunts.map((k) => <List key={k} title={`Most ${ABUSED[k]}`} icon={ABUSE_ICON[k]} rows={(s.top.abuseKind[k] ?? []).map((r) => ({ href: `${path}/${r.id}`, label: name(r), v: r.v, text: `${fmt(r.v)}×` }))} />)}
        </div>
      )}
      <p className="stats-foot tnum">first event {timeOf(s.firstTs)} · last {ago(s.lastTs, now)}</p>
    </section>
  );
}

function List({ title, rows, icon }: { title: string; rows: { href: string; label: string; v: number; text: string }[]; icon?: PropName }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="stats-list">
      <h4>{icon && <Ico name={icon} size={13} />}{title}</h4>
      {rows.length === 0 ? <p className="stats-empty">nothing yet</p> : (
        <ol>{rows.map((r, i) => (
          <li key={i} className={i < 3 ? `is-top is-${i + 1}` : ''}>
            <span className="stats-rank tnum">{i + 1}</span>
            <a href={r.href}><span className="stats-list-name">{r.label}</span><i className="stats-list-bar" style={{ width: `${(r.v / max) * 100}%` }} /></a>
            <span className="tnum">{r.text}</span>
          </li>
        ))}</ol>
      )}
    </div>
  );
}

// ---- charts (SVG, drawn here). Marks: 2px lines, ≤24px columns with a 2px surface gap, 4px rounded tops, hairline grid.
const H = 220, PAD = { l: 44, r: 16, t: 12, b: 28 };
/** The chart's width in CSS pixels, so text and marks are drawn at their real size on every screen. */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e && e.contentRect.width > 0) setW(Math.round(e.contentRect.width)); });
    ro.observe(el); if (el.clientWidth > 0) setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
/** Which columns/points get an x label: as many as fit at ~64px, the first always, the last if there is room. */
const xTicks = (n: number, plotW: number, at?: (i: number) => number) => { if (n <= 1) return [0]; if (at) { const px = plotW / n, out: number[] = []; const fits = (i: number) => out.every((j) => Math.abs(i - j) * px >= 64); for (const want of [2, 1]) for (let i = 0; i < n; i++) if (at(i) === want && fits(i)) out.push(i); return out.sort((a, b) => a - b); } const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64)))); const out: number[] = []; for (let i = 0; i < n; i += step) out.push(i); const last = out[out.length - 1]!; if ((n - 1 - last) * (plotW / n) >= 64) out.push(n - 1); else if (last !== n - 1) out[out.length - 1] = n - 1; return out; };   // the last label only where it has 64px of room: it once sat on its neighbour ("Sep 25Sep 26")
/** where a tooltip sits over a chart: centred on its point, but opening inward near either edge (it spilled off the card) */
const tipAt = (frac: number): React.CSSProperties => ({ left: `${frac * 100}%`, transform: frac > 0.66 ? 'translateX(calc(-100% - 10px))' : frac < 0.34 ? 'translateX(10px)' : 'translateX(-50%)' });
const ticks = (max: number) => { if (max <= 0) return [0]; const p = 10 ** Math.floor(Math.log10(max)); const step = max / p >= 5 ? p : max / p >= 2 ? p / 2 : p / 5; const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000); return out; };


type DayRow = { day: number; by: (Day | null)[] };
type ColSeries = { key: PetKey; label: string; color: string };

/**
 * EMO burned, every pet contract stacked. "So far": the running total on a TIME axis (a point at the start of every UTC
 * day and one at this moment), so today's stretch has its true slope instead of looking like a whole day that burned
 * nothing (the operator read the old chart's last flat step as "levelling off"); stacked, so the frok and Sahur bands
 * sit on top of the cats' instead of lying flat under it with their labels colliding. "Per day": the daily burn, stacked,
 * today faded as so far.
 */
function BurnChart({ pets, days, now, tables }: { pets: PetStats[]; days: DayRow[]; now: number; tables: boolean }) {
  const [mode, setMode] = useState<'total' | 'day'>('total');
  const [hover, setHover] = useState<number | null>(null);
  const [wrap, W] = useWidth(720);
  const box = useRef<SVGSVGElement>(null);
  const uid = useId();
  const series = pets.map((p) => ({ key: p.key, label: LEGEND_LABEL[p.key], color: C[p.key] }));
  const today = Math.floor(now / 86400) * 86400;
  const ts: number[] = []; for (let d = days[0]?.day ?? today; d <= today; d += 86400) ts.push(d);
  if (now > today) ts.push(now);
  // each pet's running total at time t: every day before t's day, or everything when t is now
  const vals = ts.map((t, i) => pets.map((p) => p.series.reduce((a, d) => a + (i === ts.length - 1 && t === now ? d.emoBurned : d.day < t ? d.emoBurned : 0), 0)));
  const stack = vals.map((v) => { let acc = 0; return v.map((x) => (acc += x)); });
  const totalAt = (i: number) => stack[i]?.[stack[i]!.length - 1] ?? 0;
  const max = Math.max(1, ...ts.map((_, i) => totalAt(i))) * 1.14;   // headroom for the total's label
  const t0 = ts[0] ?? today, t1 = ts[ts.length - 1] ?? now;
  const xs = (t: number) => PAD.l + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const ys = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = (k: number) => ts.map((t, i) => `${i ? 'L' : 'M'}${xs(t).toFixed(1)},${ys(stack[i]![k]!).toFixed(1)}`).join(' ');
  const area = (k: number) => `${line(k)} ${ts.map((t, i) => `L${xs(t).toFixed(1)},${ys(k ? stack[i]![k - 1]! : 0).toFixed(1)}`).reverse().join(' ')} Z`;
  const onMove = (e: React.PointerEvent) => { const r = box.current?.getBoundingClientRect(); if (!r || ts.length === 0) return; const x = ((e.clientX - r.left) / r.width) * W; let best = 0; for (let i = 1; i < ts.length; i++) if (Math.abs(xs(ts[i]!) - x) < Math.abs(xs(ts[best]!) - x)) best = i; setHover(best); };
  const label = (i: number) => (i === ts.length - 1 && ts[i] === now ? 'Now' : `${dateOf(ts[i]!)}, 00:00 UTC`);
  // date labels at day starts, 64px apart, never under the right edge (52px clear of the "now" label)
  const dayTicks: number[] = []; for (let i = 0; i < ts.length; i++) { if (ts[i] === now && i === ts.length - 1) continue; const x = xs(ts[i]!); if (x > W - PAD.r - (ts[ts.length - 1] === now ? 52 : 20)) continue; if (dayTicks.every((j) => Math.abs(xs(ts[j]!) - x) >= 64)) dayTicks.push(i); }
  const T = ticks(max);
  const toggle = (
    <div className="stats-mode" role="group" aria-label="Show">
      <button className={`chip-btn ${mode === 'total' ? 'is-on' : ''}`} onClick={() => setMode('total')} aria-pressed={mode === 'total'}>Running total</button>
      <button className={`chip-btn ${mode === 'day' ? 'is-on' : ''}`} onClick={() => setMode('day')} aria-pressed={mode === 'day'}>Per day</button>
    </div>
  );
  if (mode === 'day') return <div className="stats-burn">{toggle}<Columns series={series} days={days} pick={(d) => d.emoBurned} unit="EMO" tables={tables} partialLast /></div>;
  if (ts.length < 2) return <div className="stats-burn">{toggle}<div className="stats-chart" ref={wrap}><p className="stats-empty">nothing in this range</p></div></div>;
  const last = ts.length - 1;
  return (
    <div className="stats-burn">
      {toggle}
      <div className="stats-chart" ref={wrap}>
        <div className="stats-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} /> {s.label}</span>)}</div>
        <svg ref={box} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="stats-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="EMO burned, running total, every pet stacked">
          <defs>{series.map((s) => <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.5} /><stop offset="1" stopColor={s.color} stopOpacity={0.22} /></linearGradient>)}</defs>
          {T.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={ys(t)} y2={ys(t)} stroke={C.grid} /><text x={PAD.l - 6} y={ys(t) + 4} textAnchor="end" className="stats-tick">{compact(t)}</text></g>)}
          {series.map((s, k) => <path key={s.key} className="stats-area" d={area(k)} fill={`url(#${uid}-${s.key})`} />)}
          {series.map((s, k) => <path key={s.key} className="stats-line" pathLength={1} d={line(k)} fill="none" stroke={s.color} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />)}
          {/* the total, in white over the bands: the top band's own edge (Sahur's orange) read as if it were the total */}
          <path className="stats-line" pathLength={1} d={line(series.length - 1)} fill="none" stroke="#F8F8FF" strokeOpacity={0.9} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <circle className="stats-end" cx={xs(ts[last]!)} cy={ys(totalAt(last))} r={4.5} fill="#F8F8FF" stroke="#1a1024" strokeWidth={2} />
          <text className="stats-endlabel stats-end" x={xs(ts[last]!) - 8} y={ys(totalAt(last)) - 10} textAnchor="end">{compact(totalAt(last))} EMO</text>
          {dayTicks.map((i) => <text key={i} x={xs(ts[i]!)} y={H - 8} textAnchor={i === 0 ? 'start' : 'middle'} className="stats-tick">{dateOf(ts[i]!)}</text>)}
          {ts[last] === now && <text x={W - PAD.r} y={H - 8} textAnchor="end" className="stats-tick">now</text>}
          {hover !== null && <line x1={xs(ts[hover]!)} x2={xs(ts[hover]!)} y1={PAD.t} y2={H - PAD.b} stroke={C.ink3} strokeDasharray="2 3" />}
          {hover !== null && <circle cx={xs(ts[hover]!)} cy={ys(totalAt(hover))} r={4} fill="#F8F8FF" stroke="#1a1024" strokeWidth={2} />}
        </svg>
        {hover !== null && (
          <div className="stats-tip" style={tipAt(xs(ts[hover]!) / W)}>
            <b>{label(hover)}</b>
            {series.map((s, k) => <span key={s.key}><i style={{ background: s.color }} /><strong>{fmt(vals[hover]![k] ?? 0)}</strong> {s.label}</span>)}
            <span><strong>{fmt(totalAt(hover))}</strong> EMO in all</span>
          </div>
        )}
        {tables && <table className="stats-table"><thead><tr><th>When</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}<th>All</th></tr></thead><tbody>{ts.map((t, i) => <tr key={t}><td>{label(i)}</td>{series.map((s, k) => <td key={s.key} className="tnum">{fmt(vals[i]![k] ?? 0)}</td>)}<td className="tnum">{fmt(totalAt(i))}</td></tr>)}</tbody></table>}
      </div>
    </div>
  );
}

function Columns({ series, days, pick, unit, tables, W: fallback = 720, label = dateOf, tip = label, tickAt, col = 'Day', partialLast = false }: { series: ColSeries[]; days: DayRow[]; pick: (d: Day) => number; unit: string; tables: boolean; W?: number; label?: (ts: number) => string; tip?: (ts: number) => string; tickAt?: (ts: number) => number; col?: string; partialLast?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [wrap, W] = useWidth(fallback);
  const n = days.length;
  const rows = days.map((d) => ({ x: d.day, v: series.map((_, i) => (d.by[i] ? pick(d.by[i]!) : 0)) }));
  const total = (r: { v: number[] }) => r.v.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...rows.map(total));
  const band = (W - PAD.l - PAD.r) / Math.max(1, n); const bw = Math.min(24, band * 0.7);
  const x0 = (i: number) => PAD.l + i * band + (band - bw) / 2;
  const ys = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const T = ticks(max);
  if (n === 0) return <div className="stats-chart" ref={wrap}><p className="stats-empty">nothing in this range</p></div>;
  return (
    <div className="stats-chart" ref={wrap}>
      <div className="stats-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} /> {s.label}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="stats-svg" onPointerLeave={() => setHover(null)} role="img" aria-label={`${unit} per day`}>
        {T.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={ys(t)} y2={ys(t)} stroke={C.grid} /><text x={PAD.l - 6} y={ys(t) + 4} textAnchor="end" className="stats-tick">{compact(t)}</text></g>)}
        {hover !== null && <line x1={x0(hover) + bw / 2} x2={x0(hover) + bw / 2} y1={PAD.t} y2={H - PAD.b} stroke={C.ink3} strokeDasharray="2 3" />}
        {rows.map((r, i) => {
          const delay = `${Math.min(600, (i / Math.max(1, n - 1)) * 600)}ms`;
          // the segments stack bottom-up in series order; the topmost drawn one gets the rounded corners
          let base = 0; const topIdx = r.v.reduce((t, v, k) => (v > 0 ? k : t), -1);
          return (
            <g key={r.x} onPointerEnter={() => setHover(i)} className={hover === i ? 'is-hover' : ''} opacity={partialLast && i === n - 1 ? 0.5 : undefined}>
              <rect x={PAD.l + i * band} y={PAD.t} width={band} height={H - PAD.t - PAD.b} fill="transparent" />
              {r.v.map((v, k) => {
                if (v <= 0) return null;
                const gap = base > 0 ? 2 : 0; const h = ys(0) - ys(v); const y = ys(base + v) - gap; base += v;
                return <rect key={series[k]!.key} className="stats-col" style={{ animationDelay: delay }} x={x0(i)} y={y} width={bw} height={Math.max(0, h - gap)} fill={series[k]!.color} rx={k === topIdx ? 4 : 0} />;
              })}
            </g>
          );
        })}
        {xTicks(n, W - PAD.l - PAD.r, tickAt && ((i) => tickAt(rows[i]!.x))).map((i) => <text key={i} x={x0(i) + bw / 2} y={H - 8} textAnchor="middle" className="stats-tick">{label(rows[i]!.x)}</text>)}
      </svg>
      {hover !== null && <div className="stats-tip" style={tipAt((x0(hover) + bw / 2) / W)}><b>{tip(rows[hover]!.x)}{partialLast && hover === n - 1 ? ', so far' : ''}</b>{series.map((s, k) => <span key={s.key}><i style={{ background: s.color }} /><strong>{fmt(rows[hover]!.v[k] ?? 0)}</strong> {s.label}</span>)}</div>}
      {tables && <table className="stats-table"><thead><tr><th>{col}</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.x}><td>{tip(r.x)}</td>{series.map((s, k) => <td key={s.key} className="tnum">{fmt(r.v[k] ?? 0)}</td>)}</tr>)}</tbody></table>}
    </div>
  );
}

function Hourly({ series, hourly, tables }: { series: ColSeries[]; hourly: { hour: number; actions: number }[][]; tables: boolean }) {
  const days: DayRow[] = (hourly[0] ?? []).map((h, i) => ({ day: h.hour, by: hourly.map((list) => ({ actions: list[i]?.actions ?? 0 } as Day)) }));
  return <Columns series={series} days={days} pick={(d) => d.actions} unit="actions" tables={tables} label={hourOf} tip={hourTip} tickAt={sixHourly} col="Hour" />;
}

/** The hero's small chart: EMO burned per day, the last three weeks, no axes. */
function Spark({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.emoBurned));
  if (days.length < 2) return null;
  return (
    <div className="stats-spark" role="img" aria-label="EMO burned per day, recent">
      <div className="stats-spark-bars">
        {days.map((d, i) => { const today = i === days.length - 1 && d.day === Math.floor(Date.now() / 86400000) * 86400; return <span key={d.day} className={today ? 'is-partial' : ''} title={`${dateOf(d.day)}${today ? ', so far' : ''}: ${fmt(d.emoBurned)} EMO`} style={{ height: `${Math.max(3, (d.emoBurned / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />; })}
      </div>
      <span className="stats-spark-cap tnum">{dateOf(days[0]!.day)} – {dateOf(days[days.length - 1]!.day)} · EMO burned per day</span>
    </div>
  );
}

function HBars({ rows, unit, tables }: { rows: { label: string; v: number; icon?: PropName }[]; unit: string; tables: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="stats-hbars">
      {rows.map((r, i) => (
        <div key={r.label} className="stats-hbar" title={`${r.label}: ${fmt(r.v)} ${unit}`}>
          <span className="stats-hbar-label">{r.icon && <Ico name={r.icon} size={14} />}{r.label}</span>
          <span className="stats-hbar-track"><span style={{ width: `${(r.v / max) * 100}%`, animationDelay: `${i * 60}ms` }} /></span>
          <span className="stats-hbar-v tnum">{fmt(r.v)}</span>
        </div>
      ))}
      {tables && <table className="stats-table"><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="tnum">{fmt(r.v)} {unit}</td></tr>)}</tbody></table>}
    </div>
  );
}
