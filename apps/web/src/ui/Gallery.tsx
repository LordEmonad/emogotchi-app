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

type Row = { cat: CatView; svg: string | null };
type Mode = { kind: 'browse' } | { kind: 'id'; id: number } | { kind: 'owner'; owner: Address; mine: boolean } | { kind: 'crown' };
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
const matches = (c: CatView, f: Filter) =>
  f === 'all' ? true
  : f === 'named' ? c.names > 0
  : f === 'dead' ? !c.alive
  : f === 'asleep' ? c.alive && !c.started
  : /* care */ c.alive && c.started && (c.poop || c.food < 35 || c.clean < 35 || c.fun < 35 || c.energy < 35);
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
  const [shown, setShown] = useState(PAGE);
  const [mode, setMode] = useState<Mode>({ kind: 'browse' });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);

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
        if (mode.kind === 'id') {
          if (mode.id < 1 || mode.id > t.totalSupply) { setRows([]); setError(`No cat #${mode.id}. There are ${t.totalSupply.toLocaleString()}.`); return; }
          cats = [await client.cat(mode.id)];
        } else if (mode.kind === 'crown') {
          const crown = await client.crownList();
          if (!crown.length) { setRows([]); setError('No cat wears the crown yet. A cat needs a week of care history before it can rank.'); return; }
          cats = await client.catsByIds(crown.map((e) => e.id));
        } else if (mode.kind === 'owner') {
          cats = await client.catsOf(mode.owner);
          if (!cats.length) { setRows([]); setError(mode.mine ? 'This wallet holds no Emogotchi.' : `${shortAddr(mode.owner)} holds no Emogotchi.`); return; }
          cats = cats.slice(0, shown);
        } else {
          cats = await client.catsByIds(Array.from({ length: Math.min(t.totalSupply, shown) }, (_, i) => t.totalSupply - i));
        }
        if (dead) return;
        setRows(cats.map((cat) => ({ cat, svg: null })));
        setError(null);
        await paint(cats, alive);
      } catch (e) { if (!dead) setError((e as Error).message); } finally { if (!dead) setBusy(false); }
    };
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => { dead = true; clearInterval(id); };
  }, [shown, mode, paint]);

  const search = () => {
    const q = query.trim();
    setShown(PAGE);
    if (!q) return setMode({ kind: 'browse' });
    if (/^#?\d+$/.test(q)) return setMode({ kind: 'id', id: Number(q.replace('#', '')) });
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) return setMode({ kind: 'owner', owner: q as Address, mine: false });
    setRows([]); setError('Search takes a cat number like 4021, or a wallet address. Names would need an indexer.');
  };
  const mine = async () => {
    const p = getProvider();
    if (!p) return;
    try {
      const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) return;
      setWallet(accounts[0] as Address); setQuery(''); setShown(PAGE);
      setMode({ kind: 'owner', owner: accounts[0] as Address, mine: true });
    } catch { /* they declined */ }
  };

  const shownRows = useMemo(() => rows?.filter((r) => matches(r.cat, filter)) ?? null, [rows, filter]);
  const heading = useMemo(() => {
    if (mode.kind === 'crown') return 'The crown';
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="Cat number or wallet address" aria-label="Search by cat number or wallet address" />
          <button className="btn btn-sm btn-pink" onClick={search}>Search</button>
        </div>
        <div className="gal-filters">
          {hasInjected() && <button className={`chip-btn ${mode.kind === 'owner' && mode.mine ? 'is-on' : ''}`} onClick={() => void mine()}>My cats</button>}
          <button className={`chip-btn ${mode.kind === 'crown' ? 'is-on' : ''}`} onClick={() => { setQuery(''); setFilter('all'); setMode(mode.kind === 'crown' ? { kind: 'browse' } : { kind: 'crown' }); }}>♛ Crowned</button>
          {(mode.kind !== 'browse' || filter !== 'all') && <button className="chip-btn" onClick={() => { setQuery(''); setShown(PAGE); setFilter('all'); setMode({ kind: 'browse' }); }}>Reset</button>}
        </div>
      </div>
      <div className="gal-chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip-btn ${filter === f.key ? 'is-on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {error && <p className="lb-note">{error}</p>}
      {rows === null && !error && <p className="lb-note">Reading the cats from the contract…</p>}
      {shownRows && rows && filter !== 'all' && (
        <p className="gallery-count tnum gal-filter-note">
          {shownRows.length} of the {rows.length} cats on this page{mode.kind === 'browse' ? ` (of ${total.toLocaleString()})` : ''}. There is no index behind the collection, so a filter sifts what is loaded. Load more to widen it.
        </p>
      )}
      <div className="gallery-grid">
        {shownRows?.map(({ cat, svg }) => <Card key={cat.id} cat={cat} svg={svg} />)}
      </div>
      {mode.kind === 'browse' && rows !== null && total > rows.length && (
        <div className="gallery-more">
          <button className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)} disabled={busy}>{busy ? 'Reading…' : `Show ${Math.min(PAGE, total - rows.length)} more`}</button>
          <span className="gallery-count tnum">{rows.length} of {total.toLocaleString()}</span>
        </div>
      )}
      {wallet && mode.kind === 'owner' && mode.mine && rows?.length ? <p className="gallery-count tnum" style={{ textAlign: 'center' }}>{rows.length} cat{rows.length === 1 ? '' : 's'} in {shortAddr(wallet)}</p> : null}
    </main>
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

function Card({ cat, svg }: { cat: CatView; svg: string | null }) {
  const dies = cat.alive && cat.started ? inFuture(cat.diesAt) : null;
  const wakes = cat.alive && !cat.started ? inFuture(cat.startsAt) : null;
  return (
    <a className={`gallery-card ${cat.alive ? '' : 'is-dead'}`} href={`/pet/${cat.id}`}>
      {svg ? <div className="gallery-img" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="gallery-img gallery-img-loading" />}
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
