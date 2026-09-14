import { useEffect, useState } from 'react';
import { CHAIN_MODE, chainClient } from '../game/chain';
import type { CatView } from '@emo-pets/chain';
import { shortAddr } from '../wallet';

type Row = { cat: CatView; svg: string | null };

/**
 * /cats: every cat that exists, read straight from the contract, with the portrait exactly as the
 * contract composes it. No indexer, no images hosted anywhere: this is what a wallet sees.
 */
export function Gallery() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = chainClient;
    if (!client) return;
    let dead = false;
    const load = async () => {
      try {
        const t = await client.totals();
        if (dead) return;
        setTotal(t.totalSupply);
        const ids = Array.from({ length: Math.min(t.totalSupply, 200) }, (_, i) => t.totalSupply - i);
        const cats = await client.catsByIds(ids);
        if (dead) return;
        setRows(cats.map((cat) => ({ cat, svg: null })));
        setError(null);
        // a portrait depends only on mood and crown, so there are 18 at most: fetch each distinct one once
        for (const cat of cats) {
          const svg = await client.artImage(cat.alive ? cat.mood : 'dead', cat.crowned).catch((e: Error) => { if (!dead) setError(`portrait: ${e.message.slice(0, 200)}`); return null; });
          if (dead) return;
          setRows((rs) => rs?.map((r) => (r.cat.id === cat.id ? { ...r, svg } : r)) ?? rs);
        }
      } catch (e) { if (!dead) setError((e as Error).message); }
    };
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => { dead = true; clearInterval(id); };
  }, []);
  if (!CHAIN_MODE) return <main className="gallery"><p className="lb-note">The gallery reads the contract. Set a contract address to see it.</p></main>;
  return (
    <main className="gallery">
      <div className="lb-head">
        <h1>Every Emogotchi</h1>
        <p>{total} cats so far. Each picture below is fetched from the contract as you look at it, exactly what a wallet shows: the cat's mood right now, the crown if it wears one. Nothing here is hosted; it lives on Monad.</p>
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
    </main>
  );
}
