/**
 * /cats — every cat that exists, read straight from the contract.
 *
 * There is no indexer behind this, so what it can do is shaped by what the contract can answer:
 *  - browse: the newest cats first, a screenful at a time
 *  - a token id: one lookup
 *  - a wallet address: `catsOf`, one call, every cat that wallet holds
 *  - "my cats": the same, for the connected wallet
 * Searching by *name* would need a scan of all 82k tokens, so it is not offered rather than faked.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAIN_MODE, chainClient, chainCfg } from '../game/chain';
import type { Address, CatView } from '@emo-pets/chain';
import { shortAddr, getProvider, hasInjected } from '../wallet';
import { Icon } from './Icon';
import { BurnBar } from './BurnBar';
import { costumeOf, costumePortrait } from '../items';

type Row = { cat: CatView; svg: string | null; worn: number[] };
type Mode = { kind: 'browse' } | { kind: 'id'; id: number } | { kind: 'owner'; owner: Address; mine: boolean } | { kind: 'crown' } | { kind: 'name'; q: string };
/**
 * Filters. "Crowned" has a real on-chain source (`crownList`), so it is complete. The rest have no
 * index behind them, so they sift the cats already on screen and the count says so. Filtering all
 * 82k would mean reading all 82k.
 */
type Filter = 'all' | 'named' | 'care' | 'dead' | 'asleep';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'named', label: 'Named' },
  { key: 'care', label: 'Needs care' },
  { key: 'asleep', label: 'Still asleep' },
  { key: 'dead', label: 'Dead' },
];
/** "named" and "dead" are answered by the published index, so they cover the whole collection. */
const INDEXED: Filter[] = ['named', 'dead'];
const matches = (c: CatView, f: Filter) =>
  f === 'all' || INDEXED.includes(f) ? true
  : f === 'asleep' ? c.alive && !c.started
  : /* care */ c.alive && c.started && (c.poop || c.food < 35 || c.clean < 35 || c.fun < 35 || c.energy < 35);

type NamedCat = { id: number; name: string };
type CatIndex = { generatedAt: string; block?: number; live?: boolean; named: (number | NamedCat)[]; died: number[] };
/** the index used to carry plain ids; accept either shape */
const namedIds = (ix: CatIndex | null) => (ix?.named ?? []).map((n) => (typeof n === 'number' ? n : n.id));
const namedPairs = (ix: CatIndex | null): NamedCat[] => (ix?.named ?? []).map((n) => (typeof n === 'number' ? { id: n, name: '' } : n));
const PAGE = 60;

const ago = (s: number) => {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - s);
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};
const inFuture = (s: number) => {
  const d = s - Math.floor(Date.now() / 1000);
  if (d <= 0) return null;
  if (d < 3600) return `${Math.ceil(d / 60)}m`;
  if (d < 86400) return `${Math.round(d / 3600)}h`;
  return `${Math.round(d / 86400)}d`;
};

export function Gallery() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'browse' });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [index, setIndex] = useState<CatIndex | null>(null);

  /**
   * Which cats are named or dead, across the whole collection. `/api/cats` is a Cloudflare Worker that
   * asks HyperSync and is at most 30 seconds behind the chain, so a cat named a minute ago shows up.
   * If it is unreachable the site falls back to the snapshot it shipped with, which is stale but never
   * wrong about the cats it does list.
   */
  useEffect(() => {
    let dead = false;
    const take = (j: CatIndex | null) => { if (!dead && j && Array.isArray(j.named)) setIndex(j); };
    void fetch('/api/cats', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('worker'))))
      .then(take)
      .catch(() => fetch('/index/cats.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then(take).catch(() => {}));
    return () => { dead = true; };
  }, []);

  /** one distinct portrait per mood+crown, fetched once, all at the same time */
  const paint = useCallback(async (cats: CatView[], alive: () => boolean) => {
    const client = chainClient!;
    const distinct = [...new Map(cats.map((c) => [`${c.alive ? c.mood : 'dead'}|${c.crowned}`, c])).values()];
    await Promise.all(distinct.map(async (cat) => {
      const mood = cat.alive ? cat.mood : 'dead';
      const svg = await client.artImage(mood, cat.crowned).catch(() => null);
      if (!alive() || !svg) return;
      setRows((rs) => rs?.map((r) => ((r.cat.alive ? r.cat.mood : 'dead') === mood && r.cat.crowned === cat.crowned ? { ...r, svg } : r)) ?? rs);
    }));
  }, []);

  useEffect(() => {
    const client = chainClient;
    if (!client) return;
    let dead = false;
    const alive = () => !dead;
    const load = async () => {
      setBusy(true);
      try {
        const t = await client.totals();
        if (dead) return;
        setTotal(t.totalSupply);
        let cats: CatView[];
        // every route ends as "these ids, this page of them"
        let ids: number[];
        if (mode.kind === 'name') {
          const q = mode.q.toLowerCase();
          const hits = namedPairs(index).filter((n) => n.name.toLowerCase().includes(q));
          if (!hits.length) { setRows([]); setPages(0); setError(`No cat is called "${mode.q}". Only cats someone has named can be found by name.`); return; }
          ids = hits.map((n) => n.id);
        } else if (INDEXED.includes(filter) && mode.kind === 'browse') {
          ids = filter === 'named' ? namedIds(index) : (index?.died ?? []);
          if (!ids.length) { setRows([]); setPages(0); setError(filter === 'named' ? 'Nobody has named a cat yet.' : 'No cat has died yet.'); return; }
        } else if (mode.kind === 'id') {
          if (mode.id < 1 || mode.id > t.totalSupply) { setRows([]); setPages(0); setError(`No cat #${mode.id}. There are ${t.totalSupply.toLocaleString()}.`); return; }
          ids = [mode.id];
        } else if (mode.kind === 'crown') {
          const crown = await client.crownList();
          if (!crown.length) { setRows([]); setPages(0); setError('No cat wears the crown yet. A cat needs a week of care history before it can rank.'); return; }
          ids = crown.map((e) => e.id);
        } else if (mode.kind === 'owner') {
          const held = await client.catsOf(mode.owner);
          if (!held.length) { setRows([]); setPages(0); setError(mode.mine ? 'This wallet holds no Emogotchi.' : `${shortAddr(mode.owner)} holds no Emogotchi.`); return; }
          ids = held.map((c) => c.id);
        } else {
          ids = Array.from({ length: t.totalSupply }, (_, i) => t.totalSupply - i); // newest first
        }
        if (dead) return;
        setPages(Math.max(1, Math.ceil(ids.length / PAGE)));
        const slice = ids.slice(page * PAGE, page * PAGE + PAGE);
        if (!slice.length) { setPage(0); return; }
        cats = await client.catsByIds(slice);
        if (dead) return;
        setRows(cats.map((cat) => ({ cat, svg: null, worn: [] })));
        setError(null);
        // what each cat wears, one call for the page; a failure here just shows them plain
        void client.equippedMany(cats.map((c) => c.id)).then((worn) => { if (!dead) setRows((rs) => rs?.map((r) => ({ ...r, worn: worn[r.cat.id] ?? [] })) ?? rs); }).catch(() => {});
        await paint(cats, alive);
      } catch (e) { if (!dead) setError((e as Error).message); } finally { if (!dead) setBusy(false); }
    };
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => { dead = true; clearInterval(id); };
  }, [page, mode, filter, index, paint]);

  const search = () => {
    const q = query.trim();
    setPage(0);
    if (!q) return setMode({ kind: 'browse' });
    setFilter('all');
    if (/^#?\d+$/.test(q)) return setMode({ kind: 'id', id: Number(q.replace('#', '')) });
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) return setMode({ kind: 'owner', owner: q as Address, mine: false });
    setMode({ kind: 'name', q });
  };
  const mine = async () => {
    const p = getProvider();
    if (!p) return;
    try {
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) return;
      setWallet(accounts[0] as Address); setQuery(''); setPage(0);
      setMode({ kind: 'owner', owner: accounts[0] as Address, mine: true });
    } catch { /* they declined */ }
  };

  const shownRows = useMemo(() => rows?.filter((r) => matches(r.cat, filter)) ?? null, [rows, filter]);
  const heading = useMemo(() => {
    if (mode.kind === 'crown') return 'The crown';
    if (mode.kind === 'name') return `Cats called "${mode.q}"`;
    if (mode.kind === 'id') return `Cat #${mode.id}`;
    if (mode.kind === 'owner') return mode.mine ? 'Your Emogotchi' : `Held by ${shortAddr(mode.owner)}`;
    return 'Every Emogotchi';
  }, [mode]);

  if (!CHAIN_MODE) return <main className="gallery"><p className="lb-note">The gallery reads the contract. Set a contract address to see it.</p></main>;
  return (
    <main className="gallery">
      <div className="lb-head">
        <h1>{heading}</h1>
        <p>{total.toLocaleString()} cats so far. Every picture and every number below is read from the contract as you look at it. Nothing is hosted; it lives on Monad.</p>
      </div>
      <BurnBar />
      <div className="gal-tools">
        <div className="gal-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="Name, cat number, or wallet address" aria-label="Search by name, cat number or wallet address" />
          <button className="btn btn-sm btn-pink" onClick={search}>Search</button>
        </div>
        <div className="gal-filters">
          {hasInjected() && <button className={`chip-btn ${mode.kind === 'owner' && mode.mine ? 'is-on' : ''}`} onClick={() => void mine()}>My cats</button>}
          <button className={`chip-btn ${mode.kind === 'crown' ? 'is-on' : ''}`} onClick={() => { setQuery(''); setFilter('all'); setMode(mode.kind === 'crown' ? { kind: 'browse' } : { kind: 'crown' }); }}>♛ Crowned</button>
          {(mode.kind !== 'browse' || filter !== 'all') && <button className="chip-btn" onClick={() => { setQuery(''); setPage(0); setFilter('all'); setMode({ kind: 'browse' }); }}>Reset</button>}
        </div>
      </div>
      <div className="gal-chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip-btn ${filter === f.key ? 'is-on' : ''}`} onClick={() => { setFilter(f.key); setPage(0); if (mode.kind !== 'browse') setMode({ kind: 'browse' }); }}>{f.label}{INDEXED.includes(f.key) && index ? ` · ${(f.key === 'named' ? index.named : index.died).length}` : ''}</button>
        ))}
      </div>
      {error && <p className="lb-note">{error}</p>}
      {rows === null && !error && <p className="lb-note">Reading the cats from the contract…</p>}
      {shownRows && rows && filter !== 'all' && !INDEXED.includes(filter) && (
        <p className="gallery-count tnum gal-filter-note">
          {shownRows.length} of the {rows.length} cats loaded{mode.kind === 'browse' ? ` (of ${total.toLocaleString()})` : ''}. This one sifts the cats on the page rather than the whole collection. Load more to widen it.
        </p>
      )}
      {INDEXED.includes(filter) && index && rows?.length ? (
        <p className="gallery-count tnum gal-filter-note">
          Every {filter === 'named' ? 'named' : 'dead'} cat in the collection{index.live ? '' : index.block ? `, as of block ${index.block.toLocaleString()}` : ''}. Their numbers below are read live from the contract.
        </p>
      ) : null}
      <div className="gallery-grid">
        {shownRows?.map(({ cat, svg, worn }) => <Card key={cat.id} cat={cat} svg={svg} worn={worn} />)}
      </div>
      {pages > 1 && <Pager page={page} pages={pages} busy={busy} go={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
      {wallet && mode.kind === 'owner' && mode.mine && rows?.length ? <p className="gallery-count tnum" style={{ textAlign: 'center' }}>{rows.length} cat{rows.length === 1 ? '' : 's'} in {shortAddr(wallet)}</p> : null}
    </main>
  );
}

function Pager({ page, pages, busy, go }: { page: number; pages: number; busy: boolean; go: (n: number) => void }) {
  // a window of numbers around where you are, with the ends always reachable
  const span = 2;
  const nums: (number | 'gap')[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= span) nums.push(i);
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap');
  }
  return (
    <nav className="pager" aria-label="Pages">
      <button className="pager-btn" onClick={() => go(page - 1)} disabled={busy || page === 0} aria-label="Previous page">←</button>
      {nums.map((n, i) => (n === 'gap'
        ? <span key={`g${i}`} className="pager-gap">…</span>
        : <button key={n} className={`pager-btn ${n === page ? 'is-on' : ''}`} onClick={() => go(n)} disabled={busy} aria-current={n === page ? 'page' : undefined}>{n + 1}</button>))}
      <button className="pager-btn" onClick={() => go(page + 1)} disabled={busy || page >= pages - 1} aria-label="Next page">→</button>
      <span className="pager-of tnum">page {page + 1} of {pages.toLocaleString()}</span>
    </nav>
  );
}

function Meter({ label, v }: { label: string; v: number }) {
  return (
    <span className={`gal-meter ${v < 35 ? 'is-low' : ''}`} title={`${label} ${Math.round(v)}%`}>
      <span className="gal-meter-label">{label}</span>
      <span className="gal-meter-bar"><span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
    </span>
  );
}

function Card({ cat, svg, worn }: { cat: CatView; svg: string | null; worn: number[] }) {
  const dies = cat.alive && cat.started ? inFuture(cat.diesAt) : null;
  const wakes = cat.alive && !cat.started ? inFuture(cat.startsAt) : null;
  const costume = costumeOf(worn);
  return (
    <a className={`gallery-card ${cat.alive ? '' : 'is-dead'}`} href={`/pet/${cat.id}`}>
      {costume ? <div className="gallery-img"><img src={costumePortrait(costume, cat.alive ? cat.mood : 'dead', cat.crowned)} alt="" loading="lazy" /></div>
        : svg ? <div className="gallery-img" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="gallery-img gallery-img-loading" />}
      <div className="gallery-meta">
        <span className="gallery-name">{cat.crowned && <span className="lb-crown" title="Wears the crown">♛ </span>}{cat.name || `Emogotchi #${cat.id}`}</span>
        <span className="gallery-sub tnum">#{cat.id} · {cat.alive ? cat.mood : 'dead'} · {shortAddr(cat.owner)}</span>

        {cat.alive && cat.started && (
          <div className="gal-meters">
            <Meter label="food" v={cat.food} /><Meter label="clean" v={cat.clean} />
            <Meter label="fun" v={cat.fun} /><Meter label="energy" v={cat.energy} />
          </div>
        )}

        <div className="gal-traits">
          {!cat.started && cat.alive && <span className="gal-trait is-soon">asleep{wakes ? ` · wakes in ${wakes}` : ''}</span>}
          {cat.alive && cat.started && <span className="gal-trait">day {cat.day}</span>}
          {cat.alive && cat.started && cat.streak > 0 && <span className="gal-trait">{cat.streak}d streak</span>}
          {cat.alive && cat.started && <span className="gal-trait">score {cat.score.toFixed(0)}</span>}
          {dies && <span className={`gal-trait ${cat.food < 35 ? 'is-warn' : ''}`}>dies in {dies}</span>}
          {cat.asleep && <span className="gal-trait">sleeping</span>}
          {cat.poop && <span className="gal-trait is-warn">needs cleaning</span>}
          {!cat.alive && <span className="gal-trait is-warn">died {ago(cat.deadAt)} ago</span>}
          {cat.names > 0 && <span className="gal-trait">named</span>}
          {costume && <span className="gal-trait is-outfit">{costume} outfit</span>}
        </div>

        <div className="gal-stats tnum">
          <span title="feeds"><Icon name="bowl" size={13} /> {cat.feeds}</span>
          <span title="washes"><Icon name="sponge" size={13} /> {cat.washes}</span>
          <span title="plays"><Icon name="yarn" size={13} /> {cat.plays}</span>
          <span title="naps"><Icon name="moon" size={13} /> {cat.naps}</span>
          <span title="pets"><Icon name="heart" size={13} /> {cat.pets}</span>
          {cat.deaths > 0 && <span title="deaths"><Icon name="grave" size={13} /> {cat.deaths}</span>}
          <span title="MON spent on this cat" className="gal-stat-mon">{(Number(cat.monPaid) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} MON</span>
        </div>
      </div>
    </a>
  );
}
