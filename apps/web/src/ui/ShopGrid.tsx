/**
 * The item shop as a grid (operator, 2026-10-03: "a lot of scrolling ... small image lots of text ... really think about
 * how to get the perfect shop page"). DEV only until the operator approves it; `?classic=1` shows the old page beside it.
 *
 * Every item is a tile, its on-chain picture first, then its name and its price; a tap opens the item's sheet, and the
 * sheet IS the old ItemCard (claim, the pet picker, put it on, send), so every rule those cards kept still holds and
 * nothing asks the chain about an item until its sheet is open. The emo pack's two editions are one tile, with an
 * edition switch in its sheet. The packs get a row of picture cards to their pages; a sticky row of chips picks a group,
 * or only what this wallet holds, or only what is free. `?item=<id>` opens an item's sheet (the back button closes it).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ItemView } from '@emo-pets/chain';
import { svgSrc } from './svgImg';
import { EMO_PACK, EMO_HOLDERS_PACK, priceLabel } from '../items';

export type ShopGroup = { key: string; title: string; blurb: string; href?: string; pack?: boolean };
export type ShopFeature = { key: string; title: string; line: string; img: string; href: string };

/** the emo pack's paid id -> its holders' edition, and back */
const ALT_OF = new Map(EMO_PACK.items.map((it, i) => [it.id, EMO_HOLDERS_PACK.items[i]!.id]));
const PAID_OF = new Map([...ALT_OF].map(([p, h]) => [h, p]));

type Entry = { it: ItemView; alt: ItemView | null; group: string };
type Props = {
  items: ItemView[] | null;
  images: Record<number, string>;
  held: Record<number, number> | null;
  wornCount: (id: number) => number;
  groups: ShopGroup[];
  features: ShopFeature[];
  groupOf: (it: ItemView) => string;
  renderCard: (it: ItemView) => ReactNode;
  /** whether this wallet can claim (or holds) an emo holders' edition: picks the edition a sheet opens on */
  holderState: (id: number) => Promise<'ok' | 'held' | 'no' | null>;
};

const readItemParam = () => { const v = Number(new URLSearchParams(location.search).get('item')); return Number.isInteger(v) && v > 0 ? v : null; };

export function ShopGrid({ items, images, held, wornCount, groups, features, groupOf, renderCard, holderState }: Props) {
  // ---- the tiles: one per item, the emo pack's holders' edition folded into its paid twin
  const entries = useMemo<Entry[]>(() => {
    const byId = new Map((items ?? []).map((it) => [it.id, it]));
    return (items ?? []).filter((it) => !(PAID_OF.has(it.id) && byId.has(PAID_OF.get(it.id)!)))
      .map((it) => ({ it, alt: ALT_OF.has(it.id) ? byId.get(ALT_OF.get(it.id)!) ?? null : null, group: groupOf(it) }));
  }, [items, groupOf]);
  const owned = (e: Entry) => (held?.[e.it.id] ?? 0) + (e.alt ? held?.[e.alt.id] ?? 0 : 0);
  const isFree = (e: Entry) => e.it.price === 0n || !!e.alt;

  // ---- the filter
  const [group, setGroup] = useState<string>('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const shown = (e: Entry) => (group === 'all' || e.group === group) && (!mineOnly || owned(e) > 0) && (!freeOnly || isFree(e));
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const e of entries) m[e.group] = (m[e.group] ?? 0) + 1; return m; }, [entries]);
  const visibleGroups = groups.filter((g) => counts[g.key]);
  // what is drawn: each pack its own section; in All, the kinds (costumes, hair, rooms: a few items each) share one, so
  // three half-empty rows become one or two full ones; a chip picks any one group on its own
  const sections = useMemo(() => {
    const one = (g: ShopGroup) => ({ ...g, keys: [g.key] });
    if (group !== 'all') return visibleGroups.filter((g) => g.key === group).map(one);
    const packs = visibleGroups.filter((g) => g.pack).map(one);
    const kinds = visibleGroups.filter((g) => !g.pack);
    if (kinds.length < 2) return [...packs, ...kinds.map(one)];
    const names = kinds.map((g) => g.title.toLowerCase().replace(/ themes?$/, 's'));
    return [...packs, { key: 'more', title: `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`.replace(/^./, (c) => c.toUpperCase()), blurb: 'For every pet. One outfit and one room at a time; hair goes with anything.', keys: kinds.map((g) => g.key) }];
  }, [group, visibleGroups]);
  // an old link to a section (/shop#shop-emo) still lands on it, once the tiles are there
  useEffect(() => {
    if (!items || !location.hash.startsWith('#shop-')) return;
    requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
  }, [items]);

  // ---- the open sheet: in the address (?item=), so the back button closes it and a link opens it
  const [open, setOpen] = useState<number | null>(readItemParam);
  useEffect(() => { const on = () => setOpen(readItemParam()); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  const openItem = (id: number) => { history.pushState({ shopItem: id }, '', `${location.pathname}?item=${id}`); setOpen(id); };
  const close = () => {
    if ((history.state as { shopItem?: number } | null)?.shopItem) history.back();
    else { history.replaceState(null, '', location.pathname); setOpen(null); }
  };
  const openEntry = open === null ? null : entries.find((e) => e.it.id === open || e.alt?.id === open) ?? null;

  return (
    <div className="st">
      {features.length > 0 && (
        <div className="st-feature" aria-label="Packs">
          {features.map((f) => (
            <a key={f.key} className={`st-pack ${f.key}`} href={f.href}>
              <span className="st-pack-art"><img src={f.img} alt="" loading="lazy" decoding="async" /></span>
              <span className="st-pack-copy"><b>{f.title}</b><span>{f.line}</span></span>
            </a>
          ))}
        </div>
      )}

      <div className="st-bar" role="toolbar" aria-label="Filter the shop">
        <div className="st-chips">
          <button className={`st-chip ${group === 'all' ? 'is-on' : ''}`} onClick={() => setGroup('all')}>All<span className="n">{entries.length || ''}</span></button>
          {visibleGroups.map((g) => (
            <button key={g.key} className={`st-chip ${g.pack ? 'is-pack' : ''} ${group === g.key ? 'is-on' : ''}`} onClick={() => setGroup(group === g.key ? 'all' : g.key)}>{g.title}<span className="n">{counts[g.key]}</span></button>
          ))}
        </div>
        <div className="st-toggles">
          <button className={`st-chip st-toggle ${freeOnly ? 'is-on' : ''}`} aria-pressed={freeOnly} onClick={() => setFreeOnly((v) => !v)}>Free</button>
          {held && <button className={`st-chip st-toggle ${mineOnly ? 'is-on' : ''}`} aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)}>Yours</button>}
        </div>
      </div>

      {items === null ? (
        <div className="st-grid" aria-hidden>{Array.from({ length: 10 }, (_, i) => <div key={i} className="st-tile is-skel"><span className="st-art" /><span className="st-name">&nbsp;</span></div>)}</div>
      ) : (
        <div className="st-groups">
          {sections.map((g) => {
            const list = entries.filter((e) => g.keys.includes(e.group) && shown(e));
            if (!list.length && group === 'all') return null;
            return (
              <section key={g.key} id={`shop-${g.key}`} className={`st-group ${g.key}`}>
                <div className="st-group-head">
                  <div><h2>{g.title}<span className="n">{g.keys.reduce((n, k) => n + (counts[k] ?? 0), 0)}</span></h2><p>{g.blurb}</p></div>
                  {g.href && <a href={g.href}>About the pack</a>}
                </div>
                {list.length ? (
                  <div className="st-grid">{list.map((e) => <Tile key={e.it.id} e={e} images={images} owned={owned(e)} worn={wornCount(e.it.id) + (e.alt ? wornCount(e.alt.id) : 0)} onOpen={() => openItem(e.it.id)} />)}</div>
                ) : <p className="st-empty">{mineOnly ? 'None of these in your wallet.' : 'Nothing here right now.'}</p>}
              </section>
            );
          })}
          {mineOnly && !entries.some(shown) && group === 'all' && <p className="st-empty">Your wallet holds no items yet. Tap one to claim it.</p>}
        </div>
      )}

      {openEntry && <Sheet key={openEntry.it.id} e={openEntry} start={open === openEntry.alt?.id ? 'holder' : null} group={groups.find((g) => g.key === openEntry.group)} renderCard={renderCard} holderState={holderState} onClose={close} />}
    </div>
  );
}

function Tile({ e, images, owned, worn, onOpen }: { e: Entry; images: Record<number, string>; owned: number; worn: number; onOpen: () => void }) {
  const { it, alt } = e;
  // the holders' foil when the wallet holds that edition, the paid card otherwise
  const pic = alt && (owned > 0) && images[alt.id] ? images[alt.id] : images[it.id];
  const price = priceLabel(it.price);
  const supply = it.sealed ? 'Sealed' : it.remaining === 0 ? 'Sold out' : it.remaining !== null ? `${it.remaining.toLocaleString()} left` : null;
  return (
    <button type="button" className={`st-tile ${it.remaining === 0 || it.sealed ? 'is-gone' : ''} ${owned > 0 ? 'is-yours' : ''}`} onClick={onOpen} aria-label={`${it.name}, ${price}${alt ? ', free for $EMO holders' : ''}${owned > 0 ? ', yours' : ''}`}>
      {/* the picture is the item's card as it is on chain, untouched: every label goes under it */}
      <span className="st-art">{pic ? <img src={svgSrc(pic)} alt="" decoding="async" /> : <span className="st-skel" />}</span>
      <span className="st-name">{it.name}</span>
      <span className="st-line">
        <b className={`st-price ${it.price === 0n ? 'free' : ''}`}>{price}</b>
        {owned > 0 ? <span className="st-yours">Yours{worn > 0 ? ` · on ${worn}` : owned > 1 ? ` ×${owned}` : ''}</span> : supply && <span className="st-sub">{supply}</span>}
      </span>
      {alt && <span className="st-holo">or free with $EMO</span>}
    </button>
  );
}

function Sheet({ e, start, group, renderCard, holderState, onClose }: { e: Entry; start: 'holder' | null; group?: ShopGroup; renderCard: (it: ItemView) => ReactNode; holderState: Props['holderState']; onClose: () => void }) {
  const [ed, setEd] = useState<'holder' | 'paid'>(e.alt ? 'holder' : 'paid');
  const [manual, setManual] = useState(start !== null);
  // the emo pack: open on the holders' edition unless this wallet cannot claim it (then the paid one)
  useEffect(() => {
    if (!e.alt || manual) return;
    let alive = true;
    void holderState(e.alt.id).then((s) => { if (alive && s === 'no') setEd('paid'); });
    return () => { alive = false; };
  }, [e.alt, manual, holderState]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !document.querySelector('.send-back, .pk-back, .modal')) onClose(); };
    addEventListener('keydown', key);
    document.documentElement.classList.add('st-locked');
    return () => { removeEventListener('keydown', key); document.documentElement.classList.remove('st-locked'); };
  }, [onClose]);
  const shownItem = e.alt && ed === 'holder' ? e.alt : e.it;
  return (
    <div className="st-back" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="st-sheet" role="dialog" aria-modal="true" aria-label={shownItem.name}>
        <div className="st-sheet-top">
          {e.alt ? (
            <div className="st-ed" role="tablist" aria-label="Edition">
              <button role="tab" aria-selected={ed === 'holder'} className={`holo ${ed === 'holder' ? 'is-on' : ''}`} onClick={() => { setManual(true); setEd('holder'); }}>Holders’ edition · Free</button>
              <button role="tab" aria-selected={ed === 'paid'} className={ed === 'paid' ? 'is-on' : ''} onClick={() => { setManual(true); setEd('paid'); }}>Paid · {priceLabel(e.it.price)}</button>
            </div>
          ) : <span />}
          <button type="button" className="st-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {renderCard(shownItem)}
        {group?.href && <a className="st-sheet-foot" href={group.href}>More about {group.title.replace(/^The /, 'the ')}</a>}
      </div>
    </div>
  );
}
