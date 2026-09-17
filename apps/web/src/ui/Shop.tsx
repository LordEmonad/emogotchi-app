/**
 * /shop — the item shop, read straight from EmogotchiItems. Every card is one item type: its own
 * on-chain picture, price, how many are left, the rule for claiming it. Connect and the card knows
 * which of your cats qualifies (the contract's `canClaim` says so, and why not), claims with that
 * cat, then dresses any of your cats in one transaction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address, CatView, ClaimCheck, ItemView } from '@emo-pets/chain';
import { ChainClient, CLAIM_REASON } from '@emo-pets/chain';
import { Header } from './Header';
import { ConnectModal } from './ConnectModal';
import { SiteFooter } from './SiteFooter';
import { BurnBar } from './BurnBar';
import { Icon } from './Icon';
import { chainCfg, chainClient } from '../game/chain';
import { CAT_GATED, COSTUME_ITEMS, SCENE_ITEMS, REQUIREMENT, priceLabel } from '../items';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';

const KIND_LABEL: Record<ItemView['kind'], string> = { cosmetic: 'Costume', scene: 'Room', passive: 'Ticket', consumable: 'One use' };
const fmtIn = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

type Wallet = { cats: CatView[]; held: Record<number, number>; worn: Record<number, number[]> };

export function Shop() {
  const shop = chainCfg?.items ?? null;
  const client = chainClient;
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const [items, setItems] = useState<ItemView[] | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [mine, setMine] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const connecting = useRef(false);

  // ---- wallet (the same dance as the claim page)
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
  const connected = wallet.status === 'connected' && !!wallet.address;
  const wrongChain = connected && chainCfg !== null && wallet.chainId !== null && wallet.chainId !== chainCfg.chain.id;
  const doInjected = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) { try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); w.chainId = chainCfg.chain.id; } catch { /* asked again below */ } }
      setWallet(w); setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doWalletConnect = async () => {
    if (connecting.current || !chainCfg) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try { setWallet(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl)); setModal(false); }
    catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doDisconnect = () => { disconnect(); setWallet(EMPTY_WALLET); void revokeInjected(); setMine(null); };
  useEffect(() => { client?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [client, connected, wallet.address]);
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000); return () => clearInterval(id); }, []);

  // ---- the catalogue, and each item's picture, from the contract
  const loadItems = useCallback(async () => {
    if (!client || !shop) return;
    try {
      const list = await client.items();
      setItems(list); setError(null);
      for (const it of list) {
        if (images[it.id]) continue;
        void client.itemImage(it.id).then((svg) => setImages((m) => (m[it.id] ? m : { ...m, [it.id]: svg }))).catch(() => {});
      }
    } catch (e) { setError((e as Error).message); }
  }, [client, shop, images]);
  useEffect(() => { void loadItems(); const id = setInterval(() => void loadItems(), 30000); return () => clearInterval(id); }, [loadItems]);

  // ---- what the connected wallet has: its cats, its items, what each cat wears
  const loadMine = useCallback(async () => {
    if (!client || !connected || !wallet.address) { setMine(null); return; }
    const who = wallet.address as Address;
    try {
      const cats = await client.catsOf(who);
      const [held, worn] = await Promise.all([client.holdings(who), client.equippedMany(cats.map((c) => c.id))]);
      setMine({ cats, held, worn });
    } catch (e) { setError((e as Error).message); }
  }, [client, connected, wallet.address]);
  useEffect(() => { void loadMine(); }, [loadMine]);

  if (!shop || !client) {
    return (
      <div className="page">
        <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
        <main className="shop"><p className="lb-note">This build has no item shop.</p></main>
        <SiteFooter />
      </div>
    );
  }
  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="shop">
        <div className="lb-head">
          <h1>Items</h1>
          <p>Costumes, room themes and tools for a cat that lives in your wallet. Every item is added forever and never changed; its rules and its picture live on Monad. Paid items feed the same fire as everything else: 80% buys EMO and burns it.</p>
        </div>
        <BurnBar />
        {wrongChain && <p className="lb-note">Switch your wallet to {chainCfg?.chain.name ?? 'Monad'} to claim.</p>}
        {error && <p className="lb-note">{error}</p>}
        {items === null && !error && <p className="lb-note">Reading the shop from the contract…</p>}
        {items && items.length === 0 && <p className="lb-note">Nothing in the shop yet.</p>}
        <div className="shop-grid">
          {items?.map((it) => (
            <ItemCard key={it.id} item={it} svg={images[it.id] ?? null} now={now} connected={connected && !wrongChain} onConnect={() => setModal(true)} mine={mine} refresh={() => { void loadMine(); void loadItems(); }} />
          ))}
        </div>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} />
    </div>
  );
}

type CardProps = { item: ItemView; svg: string | null; now: number; connected: boolean; onConnect: () => void; mine: Wallet | null; refresh: () => void };

function ItemCard({ item, svg, now, connected, onConnect, mine, refresh }: CardProps) {
  const client = chainClient!;
  const gated = item.gate !== '0x0000000000000000000000000000000000000000';
  const catKeyed = gated && CAT_GATED.has(item.id); // the witch's gate keys on the cat: the claim names a cat
  const wearable = item.kind === 'cosmetic' || item.kind === 'scene' || item.kind === 'passive';
  const drawn = item.id in COSTUME_ITEMS || item.id in SCENE_ITEMS; // the site knows how to show it on the cat or in the room
  const isRoom = item.id in SCENE_ITEMS;
  const soon = item.opens > now ? item.opens - now : 0;
  const closing = item.closes && item.closes > now ? item.closes - now : 0;
  const closed = item.closes !== 0 && item.closes <= now;
  const open = !item.sealed && !soon && !closed && item.remaining !== 0;
  const held = mine?.held[item.id] ?? 0;
  const [cat, setCat] = useState<number | null>(null);
  const [check, setCheck] = useState<ClaimCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // the cats that could claim: living and named for the witch's gate; any of ours otherwise
  const candidates = useMemo(() => (mine?.cats ?? []).filter((c) => (catKeyed ? c.alive && c.name.length > 0 : true)), [mine, catKeyed]);
  const named = useMemo(() => (mine?.cats ?? []).some((c) => c.name.length > 0), [mine]);
  useEffect(() => { if (cat === null && candidates[0]) setCat(candidates[0].id); }, [cat, candidates]);
  // ask the contract whether this cat's claim would go through, and if not, why
  useEffect(() => {
    if (!connected || !mine || !open) { setCheck(null); return; }
    const who = client.address; if (!who) return;
    let alive = true;
    const hint = catKeyed && cat !== null ? ChainClient.catHint(cat) : ('0x' as const);
    void client.canClaim(item.id, who, 1, hint).then((c) => { if (alive) setCheck(c); }).catch(() => {});
    return () => { alive = false; };
  }, [client, connected, mine, open, cat, catKeyed, item.id, item.minted, held]);
  // a cat that already claimed is not a useful default: step to the next one that has not
  useEffect(() => {
    if (!check || check.ok || check.reason !== 7 || !catKeyed) return;
    const i = candidates.findIndex((c) => c.id === cat);
    const next = candidates.slice(i + 1).find((c) => !(mine?.worn[c.id] ?? []).includes(item.id));
    if (next && next.id !== cat) setCat(next.id);
  }, [check, candidates, cat, catKeyed, mine, item.id]);

  const claim = async () => {
    if (!check?.ok || busy) return;
    setBusy('claim'); setNote(null);
    try {
      await client.claimItem(item.id, 1, catKeyed && cat !== null ? ChainClient.catHint(cat) : '0x', check.due);
      setNote(`Claimed. ${wearable && drawn ? (isRoom ? 'Now pick the cats whose room it is.' : 'Now put it on.') : ''}`);
      if (cat !== null) setPicked(new Set([cat]));
      refresh();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };
  const wear = async () => {
    const ids = [...picked].filter((id) => !(mine?.worn[id] ?? []).includes(item.id));
    if (!ids.length || busy) return;
    setBusy('wear'); setNote(null);
    try { await client.equipMany(ids, item.id); setNote(`On${ids.length > 1 ? ` ${ids.length} cats` : ''}.`); setPicked(new Set()); refresh(); }
    catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };
  const takeOff = async (id: number) => {
    if (busy) return;
    setBusy('off'); setNote(null);
    try { await client.unequip(id, item.id); refresh(); } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };

  const status = item.sealed ? 'sealed' : soon ? 'soon' : closed ? 'closed' : item.remaining === 0 ? 'gone' : 'open';
  const supply = item.sealed ? `Sealed · ${item.minted.toLocaleString()} exist` : item.remaining === null ? `${item.minted.toLocaleString()} claimed · unlimited` : `${item.remaining.toLocaleString()} of ${item.maxSupply.toLocaleString()} left`;
  const why = check && !check.ok ? (check.reason === 6 ? (catKeyed ? 'Needs a living, named cat of yours' : 'This wallet is not eligible') : check.reason === 7 ? (catKeyed ? 'This cat already claimed one' : 'This wallet already claimed') : CLAIM_REASON[check.reason] ?? 'Cannot claim') : null;
  const wearing = mine ? mine.cats.filter((c) => (mine.worn[c.id] ?? []).includes(item.id)) : [];

  return (
    <article className="item-card" data-status={status}>
      <div className="item-img">{svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="gallery-img-loading" />}</div>
      <div className="item-body">
        <div className="item-head">
          <h2>{item.name}</h2>
          <span className="chip chip-faint">{KIND_LABEL[item.kind]}</span>
        </div>
        <p className="item-desc">{item.description}</p>
        <dl className="item-facts">
          <div><dt>Price</dt><dd className="tnum">{priceLabel(item.price)}</dd></div>
          <div><dt>Supply</dt><dd className="tnum">{supply}</dd></div>
          <div><dt>To claim</dt><dd>{REQUIREMENT[item.id] ?? (gated ? 'Gated' : 'Anyone')}{item.perKey && !catKeyed ? ` · ${item.perKey} per wallet` : ''}</dd></div>
          {soon ? <div><dt>Opens</dt><dd className="tnum">in {fmtIn(soon)}</dd></div> : null}
          {closing ? <div><dt>Closes</dt><dd className="tnum">in {fmtIn(closing)}</dd></div> : null}
          {closed && !item.sealed ? <div><dt>Window</dt><dd>closed</dd></div> : null}
          {item.soulbound && <div><dt>Transfer</dt><dd>no · soulbound</dd></div>}
        </dl>

        <div className="item-claim">
          {!connected ? (
            <button className="btn btn-pink" onClick={onConnect}>Connect to claim</button>
          ) : !mine ? (
            <p className="item-note">Looking in your wallet…</p>
          ) : (<>
            {held > 0 && <p className="item-have"><Icon name="heart" size={14} /> You have {held}</p>}
            {open && (catKeyed && candidates.length === 0 ? (
              <p className="item-note">{named ? 'None of your named cats is alive right now.' : <>You need a named cat. <a href="/">Name one</a> for 10 MON, then come back.</>}</p>
            ) : (<>
              {catKeyed && candidates.length > 0 && (
                <label className="item-pick">Claim with
                  <select value={cat ?? ''} onChange={(e) => setCat(Number(e.target.value))}>
                    {candidates.map((c) => <option key={c.id} value={c.id}>#{c.id} {c.name}</option>)}
                  </select>
                </label>
              )}
              <button className="btn btn-pink" disabled={!check?.ok || !!busy} onClick={() => void claim()}>
                {busy === 'claim' ? 'Claiming…' : check?.ok ? `Claim · ${priceLabel(item.price)}${item.price === 0n ? ', gas only' : ''}` : why ?? 'Checking…'}
              </button>
            </>))}
            {!open && <p className="item-note">{item.sealed ? 'No more will ever be made.' : soon ? 'Not open yet.' : closed ? 'The window has closed.' : 'All claimed.'}</p>}

            {wearable && drawn && held > 0 && mine.cats.length > 0 && (
              <div className="item-wear">
                <span className="item-wear-title">{isRoom ? 'Use this room' : 'Put it on'}</span>
                <div className="item-cats">
                  {mine.cats.filter((c) => c.alive).map((c) => {
                    const on = (mine.worn[c.id] ?? []).includes(item.id);
                    return (
                      <label key={c.id} className={`item-cat ${on ? 'is-on' : ''}`}>
                        {on ? <button type="button" className="item-cat-off" disabled={!!busy} onClick={() => void takeOff(c.id)} title="Take it off">✕</button>
                          : <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />}
                        <span className="tnum">#{c.id}</span>{c.name && <span className="item-cat-name">{c.name}</span>}{on && <span className="item-cat-wearing">{isRoom ? 'on' : 'wearing'}</span>}
                      </label>
                    );
                  })}
                </div>
                <button className="btn btn-sm btn-ghost" disabled={!!busy || [...picked].every((id) => (mine.worn[id] ?? []).includes(item.id))} onClick={() => void wear()}>
                  {busy === 'wear' ? (isRoom ? 'Decorating…' : 'Dressing…') : isRoom ? `Give ${picked.size || ''}${picked.size === 1 ? ' cat' : ' cats'} this room · gas only` : `Dress ${picked.size || ''}${picked.size === 1 ? ' cat' : ' cats'} · gas only`}
                </button>
                {wearing.length > 0 && <p className="item-note">{isRoom ? 'One copy is a room for every cat in your wallet. Sell it and the rooms go plain by themselves.' : 'One copy dresses every cat in your wallet. Sell it and they undress by themselves.'}</p>}
              </div>
            )}
            {note && <p className="item-note" aria-live="polite">{note}</p>}
          </>)}
        </div>
      </div>
    </article>
  );
}
