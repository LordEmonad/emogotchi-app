/**
 * The GIF picker (compose.tsx opens it; loaded only then). It searches through the Worker (worker/social/gifs.js):
 * the KLIPY key stays there, and one search is shared by everyone, which is what keeps KLIPY's free key (100 calls an
 * hour) enough. A search waits for a pause in typing. When the hour's calls are spent the Worker answers with what it
 * already has and says it is busy. KLIPY's attribution: the box says "Search KLIPY" and the foot "Powered by KLIPY".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { cleanGif, gifUrl, type Gif } from './rules';

type Item = Gif & { title?: string };
type Answer = { items: Item[]; next: string | null; busy?: boolean; off?: boolean };

export default function GifPicker({ onPick }: { onPick: (g: Gif) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'busy' | 'error' | 'off'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  const term = q.trim();

  const fetchPage = (query: string, pos: string | null) =>
    api.get<Answer>(`/gifs?q=${encodeURIComponent(query)}${pos ? `&pos=${encodeURIComponent(pos)}` : ''}`);

  useEffect(() => {
    const mine = ++seq.current;
    // a search waits for a pause in typing: every KLIPY call counts against the free key's hour
    const t = setTimeout(() => {
      setState('loading'); setErr(null);
      void fetchPage(term, null).then((r) => {
        if (seq.current !== mine) return;
        if (r.off) { setState('off'); return; }
        setItems(r.items); setNext(r.next); setState(r.busy && !r.items.length ? 'busy' : 'ok');
      }).catch((e) => { if (seq.current === mine) { setState('error'); setErr((e as Error).message); } });
    }, term ? 500 : 0);
    return () => clearTimeout(t);
  }, [term]);

  const loadMore = () => {
    if (!next || more) return;
    const mine = seq.current;
    setMore(true);
    void fetchPage(term, next).then((r) => {
      if (seq.current !== mine) return;
      const have = new Set(items.map((g) => g.id));
      setItems([...items, ...r.items.filter((g) => !have.has(g.id))]); setNext(r.busy ? null : r.next);
    }).catch(() => {}).finally(() => setMore(false));
  };

  // Two columns, each GIF going under the shorter one, inside one scroller. (CSS columns on the scroller itself laid the
  // GIFs past the first two out in extra columns off to the side, where nothing scrolls: on a phone only two of 24 could
  // be seen, 2026-09-29.) A page of "More GIFs" only adds below; nothing already shown moves.
  const cols = useMemo(() => {
    const out: [Array<{ g: Item; clean: Gif; src: string }>, Array<{ g: Item; clean: Gif; src: string }>] = [[], []];
    const tall: [number, number] = [0, 0];
    for (const g of items) {
      const src = gifUrl(g.url);
      const clean = cleanGif(g);
      if (!src || !clean) continue;
      const c = tall[0] <= tall[1] ? 0 : 1;
      out[c].push({ g, clean, src });
      tall[c] += clean.h / clean.w + 0.05;
    }
    return out;
  }, [items]);

  return (
    <div className="so-gifs">
      <input className="so-pick-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search KLIPY" aria-label="Search GIFs" maxLength={50} autoFocus={matchMedia('(pointer: fine)').matches} />
      <div className="so-gif-grid">
        <div className="so-gif-cols">
          {cols.map((col, i) => (
            <div key={i}>
              {col.map(({ g, clean, src }) => (
                <button key={g.id} type="button" className="so-gif-pick" onClick={() => onPick(clean)} title={g.title || 'GIF'} aria-label={g.title || 'GIF'} style={{ aspectRatio: `${clean.w} / ${clean.h}` }}>
                  <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />
                </button>
              ))}
            </div>
          ))}
        </div>
        {state === 'loading' && <p className="so-pick-note">Finding GIFs…</p>}
        {state === 'ok' && items.length === 0 && <p className="so-pick-note">No GIFs for that. Try another word.</p>}
        {state === 'busy' && <p className="so-pick-note">GIF search is busy for a few minutes. Searches people made before still work.</p>}
        {state === 'error' && <p className="so-pick-note">{err ?? 'GIFs could not be loaded.'}</p>}
        {state === 'off' && <p className="so-pick-note">GIFs are resting right now.</p>}
        {state === 'ok' && next && <button type="button" className="so-older" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'More GIFs'}</button>}
      </div>
      <p className="so-klipy">Powered by KLIPY</p>
    </div>
  );
}
