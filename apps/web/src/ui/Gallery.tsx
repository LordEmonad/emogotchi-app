import { useEffect, useState } from 'react';
import { CHAIN_MODE, chainClient } from '../game/chain';
import type { CatView } from '@emo-pets/chain';
import { shortAddr } from '../wallet';

type Row = { cat: CatView; svg: string | null };

/**
 * /cats: every cat that exists, read straight from the contract, with the portrait exactly as the
 * contract composes it. No indexer, no images hosted anywhere: this is what a wallet sees.
 */
const PAGE = 60; // cats per screenful: one multicall chunk plus change, and ~18 distinct portraits

export function Gallery() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = chainClient;
    if (!client) return;
    let dead = false;
    const load = async () => {
      setBusy(true);
      try {
        const t = await client.totals();
        if (dead) return;
        setTotal(t.totalSupply);
        // newest first, and only as many as the reader has asked to see
        const ids = Array.from({ length: Math.min(t.totalSupply, shown) }, (_, i) => t.totalSupply - i);
        const cats = await client.catsByIds(ids);
        if (dead) return;
        setRows(cats.map((cat) => ({ cat, svg: null })));
        setError(null);
        // A portrait depends only on mood and crown, so there are 18 at most. Fetch each distinct one
        // once, all at the same time: composing one on chain takes a second, and doing them one after
        // another left the grid half empty for over a minute.
        const distinct = [...new Map(cats.map((c) => [`${c.alive ? c.mood : 'dead'}|${c.crowned}`, c])).values()];
        await Promise.all(distinct.map(async (cat) => {
          const mood = cat.alive ? cat.mood : 'dead';
          const svg = await client.artImage(mood, cat.crowned).catch((e: Error) => { if (!dead) setError(`portrait: ${e.message.slice(0, 200)}`); return null; });
          if (dead || !svg) return;
          setRows((rs) => rs?.map((r) => ((r.cat.alive ? r.cat.mood : 'dead') === mood && r.cat.crowned === cat.crowned ? { ...r, svg } : r)) ?? rs);
        }));
      } catch (e) { if (!dead) setError((e as Error).message); } finally { if (!dead) setBusy(false); }
    };
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => { dead = true; clearInterval(id); };
  }, [shown]);
  if (!CHAIN_MODE) return <main className="gallery"><p className="lb-note">The gallery reads the contract. Set a contract address to see it.</p></main>;
  return (
    <main className="gallery">
      <div className="lb-head">
        <h1>Every Emogotchi</h1>
        <p>{total.toLocaleString()} cats so far. Each picture below is fetched from the contract as you look at it, exactly what a wallet shows: the cat's mood right now, the crown if it wears one. Nothing here is hosted; it lives on Monad.</p>
      </div>
      {error && <p className="lb-note">Could not read the contract: {error}</p>}
      {rows === null && !error && <p className="lb-note">Reading the cats from the contract…</p>}
      <div className="gallery-grid">
        {rows?.map(({ cat, svg }) => (
          <a key={cat.id} className={`gallery-card ${cat.alive ? '' : 'is-dead'}`} href={`/pet/${cat.id}`}>
            {svg ? <div className="gallery-img" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="gallery-img gallery-img-loading" />}
            <div className="gallery-meta">
              <span className="gallery-name">{cat.crowned && <span className="lb-crown" title="Wears the crown">♛ </span>}{cat.name || `Emogotchi #${cat.id}`}</span>
              <span className="gallery-sub tnum">#{cat.id} · {cat.alive ? cat.mood : 'dead'} · {shortAddr(cat.owner)}</span>
            </div>
          </a>
        ))}
      </div>
      {rows !== null && total > rows.length && (
        <div className="gallery-more">
          <button className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)} disabled={busy}>{busy ? 'Reading…' : `Show ${Math.min(PAGE, total - rows.length)} more`}</button>
          <span className="gallery-count tnum">{rows.length} of {total.toLocaleString()}</span>
        </div>
      )}
    </main>
  );
}
