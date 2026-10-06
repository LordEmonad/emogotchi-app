/**
 * /shop — the item shop, read straight from EmogotchiItems. Every card is one item type: its own
 * on-chain picture, price, how many are left, the rule for claiming it. Connect and the card knows
 * which of your cats qualifies (the contract's `canClaim` says so, and why not), claims with that
 * cat, then dresses any of your cats in one transaction.
 */
import { cue } from '../sound/cue';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address, CatView, ClaimCheck, Collection, ItemView } from '@emo-pets/chain';
import { ChainClient, CLAIM_REASON } from '@emo-pets/chain';
import { Header } from './Header';
import { ConnectModal } from './ConnectModal';
import { SiteFooter } from './SiteFooter';
import { BurnBar } from './BurnBar';
import { EmoPackBanner } from './EmoPackBanner';
import { Icon } from './Icon';
import { PETS, PET_ORDER, characterOf, fallbackName, hasPet } from '../pets';

/** the pets anyone can mint free, as this build knows them: "an inversebrah", "a Sahur", "a Thiccums", "a r3tard" */
const freePets = () => PET_ORDER.filter((c) => c !== 'cat' && hasPet(c) && PETS[c].mint);
const withArticle = (one: string) => `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}`;
const freeNames = () => freePets().map((c) => withArticle(PETS[c].one));
/** "Mint an inversebrah, a Sahur or a Thiccums", each a link to its mint page */
function FreeMints() {
  const list = freePets();
  return <>{list.map((c, i) => <span key={c}>{i === 0 ? '' : i === list.length - 1 ? ' or ' : ', '}<a href={PETS[c].mint!}>{i === 0 ? 'Mint ' : ''}{withArticle(PETS[c].one)}</a></span>)}</>;
}
import { chainCfg, chainClient } from '../game/chain';
import { CAT_GATED, PET_GATED, NAMED_PET_GATED, COSTUME_ITEMS, DRAWN_ON, SCENE_ITEMS, OUTFIT_ITEMS, TOY_ITEMS, PET_MOVE_ITEMS, REQUIREMENT, JEWISH_PACK, HABIBI_PACK, HABIBI_ON, EMO_ON, EMO_PACK, EMO_HOLDERS_PACK, EMO_IDS, costumeOf, exclusiveOf, outfitIdsOf, roomIdsOf, sceneOf, priceLabel, packCreated } from '../items';
import { petKey } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';
import { svgSrc } from './svgImg';
import { SendSheet } from './SendSheet';
import { ShopGrid, type ShopFeature, type ShopGroup } from './ShopGrid';
import './shop.css';

/** the shop as a grid of tiles (ShopGrid.tsx; approved by the operator 2026-10-03: "ship it"); `?classic=1` shows the old cards */
const GRID = !new URLSearchParams(location.search).has('classic');

const KIND_LABEL: Record<ItemView['kind'], string> = { cosmetic: 'Costume', scene: 'Room', passive: 'Ticket', consumable: 'One use' };
const fmtIn = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

type Wallet = { cats: CatView[]; held: Record<number, number>; worn: Record<string, number[]> };
const pk = (c: CatView) => petKey(c.col, c.id);

/** what a toy or a Pet item does to a pet that has it, under its card's "Give it to a pet" */
const TOY_NOTE: Record<string, string> = {
  dreidel: 'A pet that has it plays with the dreidel instead of the ball of yarn.',
  darbuka: 'A pet that has it plays the darbuka instead of the ball of yarn.',
  guitar: 'A pet that has it plays the guitar instead of the ball of yarn.',
};
const MOVE_NOTE: Record<string, string> = {
  kapparot: 'A pet that has it gets a Kapparot button in its room: the ritual, sent as its pet on chain, gas only.',
  falcon: 'A pet that has it gets a Call the falcon button in its room, sent as its pet on chain, gas only.',
  selfie: 'A pet that has it gets a Mirror selfie button in its room, sent as its pet on chain, gas only.',
};

/**
 * The shop in sections (presentation only: every card below is the same ItemCard as before). An item lives in exactly one
 * section: its pack's, once the pack exists on chain, else its kind's. New items fall into place by what they are.
 */
type SectionKey = 'emo' | 'habibi' | 'jewish' | 'costumes' | 'hair' | 'rooms' | 'tools';
const SECTIONS: { key: SectionKey; title: string; blurb: string }[] = [
  { key: 'costumes', title: 'Costumes', blurb: 'Outfits drawn into your pet. One outfit at a time.' },
  { key: 'hair', title: 'Hair', blurb: 'Worn with any outfit.' },
  { key: 'rooms', title: 'Room themes', blurb: 'The room your pet lives in. One room at a time.' },
  { key: 'tools', title: 'Tools', blurb: 'Tickets and one-use items.' },
];
const PACK_IDS = new Set(JEWISH_PACK.items.map((i) => i.id));
const HABIBI_IDS = new Set(HABIBI_PACK.items.map((i) => i.id));
const sectionOf = (it: ItemView, packLive: boolean, habibiLive = false, emoLive = false): SectionKey => {
  if (emoLive && EMO_IDS.has(it.id)) return 'emo';
  if (habibiLive && HABIBI_IDS.has(it.id)) return 'habibi';
  if (packLive && PACK_IDS.has(it.id)) return 'jewish';
  if (it.id in SCENE_ITEMS || it.kind === 'scene') return 'rooms';
  if (OUTFIT_ITEMS.includes(it.id)) return 'costumes';
  if (it.kind === 'cosmetic') return 'hair';   // the emo hair, and any wearable that is not an outfit
  return 'tools';
};

/** The Habibi pack's banner (HABIBI_ON): its picture, its numbers, a way in to its page. The Jewish pack's, in red and gold. */
function HabibiBanner({ live }: { live: boolean }) {
  return (
    <a className="pack-banner habibi" href="/shop/habibi">
      <div className="pack-banner-copy">
        <span className="pack-eyebrow">New pack <b>{live ? 'Live' : 'Coming soon'}</b></span>
        <h3>The Habibi pack</h3>
        <p>The keffiyeh, the bisht, the majlis, a darbuka and a falcon. Five items for every pet, and the story behind each one. All free.</p>
        <div className="pack-facts">
          <div className="pack-fact"><strong>Free</strong><span>one of each per named pet</span></div>
          <div className="pack-fact"><strong>1,001</strong><span>of each · the Nights</span></div>
        </div>
        <div className="pack-banner-thumbs" aria-hidden>{HABIBI_PACK.items.map((i) => <img key={i.key} src={i.card} alt="" loading="lazy" />)}</div>
        <span className="btn btn-pink">See the pack</span>
      </div>
      <figure className="pack-banner-art"><img src="/brand/habibi-pack.png" alt="The pets in a majlis in the pack's items" loading="lazy" /></figure>
    </a>
  );
}

/** The Jewish pack's banner at the top of the shop: its picture, its numbers, a way in to its page. */
function PackBanner({ live }: { live: boolean }) {
  return (
    <a className="pack-banner" href="/shop/jewish">
      <div className="pack-banner-copy">
        <span className="pack-eyebrow">New pack <b>{live ? 'Live' : 'Coming soon'}</b></span>
        <h3>The Jewish pack</h3>
        <p>A kippah with payot, a Star of David, the Western Wall, a dreidel and the kapparot hen. Five items for every pet, and the story behind each one.</p>
        <div className="pack-facts">
          <div className="pack-fact"><strong>36 MON</strong><span>each · double chai</span></div>
          <div className="pack-fact"><strong>613</strong><span>of each · the commandments</span></div>
        </div>
        <div className="pack-banner-thumbs" aria-hidden>{JEWISH_PACK.items.map((i) => <img key={i.key} src={i.card} alt="" loading="lazy" />)}</div>
        <span className="btn btn-pink">See the pack</span>
      </div>
      <figure className="pack-banner-art"><img src="/brand/jewish-pack.png" alt="The pets at the Western Wall in the pack's items" loading="lazy" /></figure>
    </a>
  );
}

export function Shop() {
  const shop = chainCfg?.items ?? null;
  const client = chainClient;
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const [items, setItems] = useState<ItemView[] | null>(null);
  // the pack is live once the shop holds all five at their ids under their names (items.ts `packCreated`)
  const packLive = useMemo(() => packCreated(new Map((items ?? []).map((it) => [it.id, it.name]))), [items]);
  const habibiLive = useMemo(() => HABIBI_ON && packCreated(new Map((items ?? []).map((it) => [it.id, it.name])), HABIBI_PACK), [items]);
  // the emo pack: both editions (18-24 paid, 25-31 the holders')
  const emoLive = useMemo(() => { const names = new Map((items ?? []).map((it) => [it.id, it.name])); return EMO_ON && packCreated(names, EMO_PACK) && packCreated(names, EMO_HOLDERS_PACK); }, [items]);
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
      const cats = await client.petsOf(who);
      const byCol = (col: Collection) => cats.filter((c) => c.col === col).map((c) => c.id);
      const cols = client.collections;
      const [held, ...wornBy] = await Promise.all([client.holdings(who), ...cols.map((col) => client.equippedMany(byCol(col), col))]);
      const worn: Record<string, number[]> = {};
      cols.forEach((col, i) => { for (const [id, w] of Object.entries(wornBy[i]!)) worn[petKey(col, Number(id))] = w; });
      setMine({ cats, held, worn });
    } catch (e) { setError((e as Error).message); }
  }, [client, connected, wallet.address]);
  useEffect(() => { void loadMine(); }, [loadMine]);

  const card = (it: ItemView, sheet = false) => (
    <ItemCard key={it.id} item={it} svg={images[it.id] ?? null} now={now} connected={connected && !wrongChain} onConnect={() => setModal(true)} mine={mine} refresh={() => { void loadMine(); void loadItems(); }} sheet={sheet} />
  );
  // ---- the grid's groups: the packs (newest first), then the kinds
  const groupOf = useCallback((it: ItemView) => sectionOf(it, packLive, habibiLive, emoLive), [packLive, habibiLive, emoLive]);
  const groups = useMemo<ShopGroup[]>(() => [
    ...(EMO_ON ? [{ key: 'emo', title: 'The emo pack', blurb: 'Free with 7,000 $EMO, or 30 MON each for anyone with a pet.', href: '/shop/emo', pack: true }] : []),
    ...(HABIBI_ON ? [{ key: 'habibi', title: 'The Habibi pack', blurb: 'Free, one of each per living, named pet.', href: '/shop/habibi', pack: true }] : []),
    { key: 'jewish', title: 'The Jewish pack', blurb: '36 MON each, 613 of each.', href: '/shop/jewish', pack: true },
    ...SECTIONS,
  ], []);
  const features = useMemo<ShopFeature[]>(() => [
    ...(EMO_ON ? [{ key: 'emo', title: 'The emo pack', line: 'Free with 7,000 $EMO · 30 MON each', img: '/brand/emo-pack.png', href: '/shop/emo' }] : []),
    ...(HABIBI_ON ? [{ key: 'habibi', title: 'The Habibi pack', line: 'Free · one of each per named pet', img: '/brand/habibi-pack.png', href: '/shop/habibi' }] : []),
    { key: 'jewish', title: 'The Jewish pack', line: '36 MON each · 613 of each', img: '/brand/jewish-pack.png', href: '/shop/jewish' },
  ], []);
  const wornCount = useCallback((id: number) => Object.values(mine?.worn ?? {}).filter((w) => w.includes(id)).length, [mine]);
  // an emo holders' edition: can this wallet claim it (or does it hold it already)? Picks the edition its sheet opens on
  const holderState = useCallback(async (id: number): Promise<'ok' | 'held' | 'no' | null> => {
    const who = client?.address; if (!client || !connected || !who) return null;
    try { const c = await client.canClaim(id, who, 1, '0x'); return c.ok ? 'ok' : c.reason === 7 ? 'held' : c.reason === 6 ? 'no' : null; } catch { return null; }
  }, [client, connected]);
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
          <h1>Item shop</h1>
          {GRID
            ? <p>Outfits, rooms and toys for every pet in your wallet. Every item lives on Monad, and 80% of every sale buys EMO and burns it. Tap an item to get it.</p>
            : <p>Costumes, room themes and tools for the pets that live in your wallet. Every item goes on any pet, now or later, unless it says otherwise. Every item is added forever and never changed; its rules and its picture live on Monad. Paid items feed the same fire as everything else: 80% buys EMO and burns it.</p>}
        </div>
        <BurnBar />
        {wrongChain && <p className="lb-note">Switch your wallet to {chainCfg?.chain.name ?? 'Monad'} to claim.</p>}
        {error && <p className="lb-note">{error}</p>}
        {items === null && !error && !GRID && <p className="lb-note">Reading the shop from the contract…</p>}
        {items && items.length === 0 && <p className="lb-note">Nothing in the shop yet.</p>}
        {GRID && <ShopGrid items={items} images={images} held={mine?.held ?? null} wornCount={wornCount} groups={groups} features={features} groupOf={groupOf} renderCard={(it) => card(it, true)} holderState={holderState} />}
        {!GRID && <>
        <nav className="shop-nav" aria-label="Sections">
          {EMO_ON && <a className="is-pack emo" href="#shop-emo"><span className="tag">New</span>The emo pack</a>}
          {HABIBI_ON && <a className="is-pack habibi" href="#shop-habibi"><span className="tag">New</span>The Habibi pack</a>}
          <a className="is-pack" href="#shop-jewish"><span className="tag">New</span>The Jewish pack</a>
          {SECTIONS.filter((sec) => items?.some((it) => sectionOf(it, packLive, habibiLive, emoLive) === sec.key)).map((sec) => (
            <a key={sec.key} href={`#shop-${sec.key}`}>{sec.title}<span className="n">{items?.filter((it) => sectionOf(it, packLive, habibiLive, emoLive) === sec.key).length}</span></a>
          ))}
        </nav>
        <div className="shop-sections">
          {EMO_ON && (
            <section id="shop-emo" className="shop-section">
              <EmoPackBanner live={emoLive} />
              {items && items.some((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'emo') && (
                <div className="shop-grid">
                  {items.filter((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'emo').map((it) => card(it))}
                </div>
              )}
            </section>
          )}
          {HABIBI_ON && (
            <section id="shop-habibi" className="shop-section">
              <HabibiBanner live={habibiLive} />
              {items && items.some((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'habibi') && (
                <div className="shop-grid">
                  {items.filter((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'habibi').map((it) => card(it))}
                </div>
              )}
            </section>
          )}
          <section id="shop-jewish" className="shop-section">
            <PackBanner live={packLive} />
            {items && items.some((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'jewish') && (
              <div className="shop-grid">
                {items.filter((it) => sectionOf(it, packLive, habibiLive, emoLive) === 'jewish').map((it) => card(it))}
              </div>
            )}
          </section>
          {SECTIONS.map((sec) => {
            const list = (items ?? []).filter((it) => sectionOf(it, packLive, habibiLive, emoLive) === sec.key);
            if (!list.length) return null;
            return (
              <section key={sec.key} id={`shop-${sec.key}`} className="shop-section">
                <div className="shop-section-head"><h2>{sec.title}<span className="n">{list.length}</span></h2><p>{sec.blurb}</p></div>
                <div className="shop-grid">{list.map((it) => card(it))}</div>
              </section>
            );
          })}
        </div>
        </>}
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}

type CardProps = { item: ItemView; svg: string | null; now: number; connected: boolean; onConnect: () => void; mine: Wallet | null; refresh: () => void; sheet?: boolean };

function ItemCard({ item, svg, now, connected, onConnect, mine, refresh, sheet = false }: CardProps) {
  const client = chainClient!;
  const gated = item.gate !== '0x0000000000000000000000000000000000000000';
  const catKeyed = gated && CAT_GATED.has(item.id); // the witch's gate keys on the cat: the claim names a cat
  const petGated = gated && PET_GATED.has(item.id); // the hair's gate wants the collection you hold a pet of
  const petKeyed = gated && NAMED_PET_GATED.has(item.id); // the Halloween items' gate keys on a living, named pet of any kind: the claim names the pet
  const picks = catKeyed || petKeyed; // the claim is made with one pet, picked here
  const wearable = item.kind === 'cosmetic' || item.kind === 'scene' || item.kind === 'passive';
  const isAction = item.id in TOY_ITEMS || item.id in PET_MOVE_ITEMS; // the dreidel and the hen: they change what Play and Pet do
  const drawn = item.id in COSTUME_ITEMS || item.id in SCENE_ITEMS || isAction; // the site knows how to show it on a pet, in the room, or in an action
  const isRoom = item.id in SCENE_ITEMS;
  // which pets the site draws this on: a room is for every pet; a costume for the pets the rig has pieces for
  const costume = COSTUME_ITEMS[item.id];
  const drawnOn = (c: CatView) => isRoom || isAction || (costume !== undefined && DRAWN_ON[costume].includes(characterOf(c.col)));
  const soon = item.opens > now ? item.opens - now : 0;
  const closing = item.closes && item.closes > now ? item.closes - now : 0;
  const closed = item.closes !== 0 && item.closes <= now;
  const open = !item.sealed && !soon && !closed && item.remaining !== 0;
  const held = mine?.held[item.id] ?? 0;
  const [sel, setSel] = useState<string | null>(null); // the pet the claim is made with (a pet key: ids repeat across collections)
  const [check, setCheck] = useState<(ClaimCheck & { for: string | null }) | null>(null);   // `for`: the pet it was asked about
  const manual = useRef(false);   // the owner picked the pet themselves: never step away from their choice
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // the pets that could claim: living, named cats for the witch's gate; living, named pets of any kind for the
  // Halloween items'; any of ours otherwise
  const candidates = useMemo(() => (mine?.cats ?? []).filter((c) => (catKeyed ? c.col === 'cat' && c.alive && c.name.length > 0 : petKeyed ? c.alive && c.name.length > 0 : true)), [mine, catKeyed, petKeyed]);
  const named = useMemo(() => (mine?.cats ?? []).some((c) => (catKeyed ? c.col === 'cat' : true) && c.name.length > 0), [mine, catKeyed]);
  const chosen = picks ? candidates.find((c) => pk(c) === sel) ?? null : null;
  const hintFor = (c: CatView | null): `0x${string}` => catKeyed ? (c ? ChainClient.catHint(c.id) : '0x') : petKeyed ? (c ? ChainClient.petHint(client.addr(c.col), c.id) : '0x') : petGated ? petHint : '0x';
  // the hair's hint: a collection the wallet holds a pet of (a free pet first, so a fresh mint qualifies at once)
  const petHint = useMemo(() => { const c = mine?.cats.find((x) => x.col !== 'cat') ?? mine?.cats[0]; return c ? ChainClient.collectionHint(client.addr(c.col)) : ('0x' as const); }, [mine, client]);
  useEffect(() => { if ((sel === null || !candidates.some((c) => pk(c) === sel)) && candidates[0]) setSel(pk(candidates[0])); }, [sel, candidates]);
  // ask the contract whether this cat's claim would go through, and if not, why
  useEffect(() => {
    if (!connected || !mine || !open) { setCheck(null); return; }
    const who = client.address; if (!who) return;
    let alive = true;
    const hint = hintFor(chosen);
    const forPet = picks ? sel : null;
    setCheck(null);   // no stale answer while the new pet's is on its way: the button says Checking…
    void client.canClaim(item.id, who, 1, hint).then((c) => { if (alive) setCheck({ ...c, for: forPet }); }).catch(() => {});
    return () => { alive = false; };
  }, [client, connected, mine, open, sel, catKeyed, petKeyed, petGated, petHint, item.id, item.minted, held]);
  // a pet that already claimed is not a useful default: step to the next one that has not
  useEffect(() => {
    if (!check || check.ok || check.reason !== 7 || !picks || manual.current || check.for !== sel) return;
    const i = candidates.findIndex((c) => pk(c) === sel);
    const next = candidates.slice(i + 1).find((c) => !(mine?.worn[pk(c)] ?? []).includes(item.id));
    if (next && pk(next) !== sel) setSel(pk(next));
  }, [check, candidates, sel, picks, mine, item.id]);

  const claim = async () => {
    if (!check?.ok || busy) return;
    setBusy('claim'); setNote(null);
    cue('tx.ask');
    try {
      await client.claimItem(item.id, 1, hintFor(chosen), check.due);
      cue('tx.ok'); if (check.due > 0n) cue('coin', { n: 3, delay: 0.3 });
      setNote(`Claimed. ${wearable && drawn ? (isRoom ? 'Now pick the pets whose room it is.' : 'Now put it on.') : ''}`);
      if (picks && chosen) setPicked(new Set([pk(chosen)]));
      refresh();
    } catch (e) { cue('tx.fail'); setNote((e as Error).message); } finally { setBusy(null); }
  };
  // picks are pet keys; one equipMany per collection (they are different contracts)
  // an outfit is worn when it is the one shown (one at a time); anything else, when it is on the pet's list
  const isOutfit = OUTFIT_ITEMS.includes(item.id);
  const wears = (c: CatView) => { const w = mine?.worn[pk(c)] ?? []; return isOutfit ? w.includes(item.id) && costumeOf(w) === costumeOf([item.id]) : isRoom ? w.includes(item.id) && sceneOf(w) === SCENE_ITEMS[item.id] : w.includes(item.id); };
  const wear = async () => {
    const pets = (mine?.cats ?? []).filter((c) => picked.has(pk(c)) && !wears(c));
    if (!pets.length || busy) return;
    setBusy('wear'); setNote(null);
    try {
      // one outfit at a time, and one room at a time: a pet in another takes it off first
      if (isOutfit || isRoom) {
        for (const c of pets) for (const other of (isOutfit ? outfitIdsOf : roomIdsOf)(mine?.worn[pk(c)])) if (other !== item.id) await client.unequip(c.id, other, c.col);
      }
      // and one head piece, one toy, one Pet move at a time (items.ts EXCLUSIVE_GROUPS)
      for (const c of pets) for (const other of exclusiveOf(item.id, mine?.worn[pk(c)])) await client.unequip(c.id, other, c.col);
      // only the pets that do not have it on their list at all need it put on (a hidden one shows once the others are off)
      for (const col of client.collections) { const ids = pets.filter((c) => c.col === col && !(mine?.worn[pk(c)] ?? []).includes(item.id)).map((c) => c.id); if (ids.length) await client.equipMany(ids, item.id, col); }
      setNote(`On${pets.length > 1 ? ` ${pets.length} pets` : ''}.`); setPicked(new Set()); refresh();
    } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };
  const takeOff = async (c: CatView) => {
    if (busy) return;
    setBusy('off'); setNote(null);
    try { await client.unequip(c.id, item.id, c.col); refresh(); } catch (e) { setNote((e as Error).message); } finally { setBusy(null); }
  };

  const status = item.sealed ? 'sealed' : soon ? 'soon' : closed ? 'closed' : item.remaining === 0 ? 'gone' : 'open';
  const supply = item.sealed ? `Sealed · ${item.minted.toLocaleString()} exist` : item.remaining === null ? `${item.minted.toLocaleString()} claimed · unlimited` : `${item.remaining.toLocaleString()} of ${item.maxSupply.toLocaleString()} left`;
  const why = check && !check.ok ? (check.reason === 6 ? (catKeyed ? 'Needs a living, named cat of yours' : petKeyed ? 'Needs a living, named pet of yours' : petGated ? 'Needs a pet in this wallet' : 'This wallet is not eligible') : check.reason === 7 ? (catKeyed ? 'This cat already claimed one' : petKeyed ? 'This pet already claimed one' : 'This wallet already claimed') : CLAIM_REASON[check.reason] ?? 'Cannot claim') : null;
  const wearing = mine ? mine.cats.filter(wears) : [];
  const wearers = mine ? mine.cats.filter((c) => c.alive && drawnOn(c)) : [];

  return (
    <article className={`item-card${sheet ? ' in-sheet' : ''}`} data-status={status}>
      <div className="item-img">{svg ? <img src={svgSrc(svg)} alt="" /> : <div className="gallery-img-loading" />}</div>
      <div className="item-body">
        <div className="item-head">
          <h2>{item.name}</h2>
          <span className="chip chip-faint">{item.id in TOY_ITEMS ? 'Toy' : item.id in PET_MOVE_ITEMS ? 'Ritual' : KIND_LABEL[item.kind]}</span>
        </div>
        <p className="item-desc">{item.description}</p>
        <dl className="item-facts">
          <div><dt>Price</dt><dd className="tnum">{priceLabel(item.price)}</dd></div>
          <div><dt>Supply</dt><dd className="tnum">{supply}</dd></div>
          <div><dt>To claim</dt><dd>{REQUIREMENT[item.id] ?? (gated ? 'Gated' : 'Anyone')}{item.perKey && !picks && !(item.id in REQUIREMENT) ? ` · ${item.perKey} per wallet` : ''}</dd></div>
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
            {held > 0 && <p className="item-have"><Icon name="heart" size={14} /> You have {held}{!item.soulbound && client.address && <button type="button" className="item-send" disabled={!!busy} onClick={() => setSending(true)}>Send</button>}</p>}
            {sending && client.address && mine && (
              <SendSheet what={{ kind: 'item', id: item.id, name: item.name, svg, held, wornBy: mine.cats.filter((c) => (mine.worn[pk(c)] ?? []).includes(item.id)).map((c) => c.name || fallbackName(c.col, c.id)) }} me={client.address} myPets={mine.cats} onClose={() => setSending(false)} onSent={() => refresh()} />
            )}
            {open && (catKeyed && candidates.length === 0 ? (
              <p className="item-note">{named ? 'None of your named cats is alive right now.' : <>You need a named cat. <a href="/">Name one</a> for 10 MON, then come back.</>}</p>
            ) : petKeyed && candidates.length === 0 ? (
              <p className="item-note">{named ? 'None of your named pets is alive right now.' : mine.cats.length ? <>You need a named pet. <a href="/">Name one</a> for 10 MON, then come back.</> : <>You need a named pet. <FreeMints />, free, name it for 10 MON, then come back.</>}</p>
            ) : petGated && mine.cats.length === 0 ? (
              <p className="item-note">You need a pet. <FreeMints />, free, then come back.</p>
            ) : (<>
              {picks && candidates.length > 0 && (
                <label className="item-pick">Claim with
                  <select value={sel ?? ''} onChange={(e) => { manual.current = true; setSel(e.target.value); }}>
                    {candidates.map((c) => <option key={pk(c)} value={pk(c)}>{c.col !== 'cat' ? `${PETS[c.col].one} ` : catKeyed ? '' : 'cat '}#{c.id} {c.name}</option>)}
                  </select>
                </label>
              )}
              <button className="btn btn-pink" disabled={!check?.ok || !!busy} onClick={() => void claim()}>
                {busy === 'claim' ? 'Claiming…' : check?.ok ? `Claim · ${priceLabel(item.price)}${item.price === 0n ? ', gas only' : ''}` : why ?? 'Checking…'}
              </button>
            </>))}
            {!open && <p className="item-note">{item.sealed ? 'No more will ever be made.' : soon ? 'Not open yet.' : closed ? 'The window has closed.' : 'All claimed.'}</p>}

            {wearable && drawn && held > 0 && wearers.length > 0 && (
              <div className="item-wear">
                <span className="item-wear-title">{isRoom ? 'Use this room' : isAction ? 'Give it to a pet' : 'Put it on'}</span>
                <div className="item-cats">
                  {wearers.map((c) => {
                    const k = pk(c); const on = wears(c);
                    return (
                      <label key={k} className={`item-cat ${on ? 'is-on' : ''}`}>
                        {on ? <button type="button" className="item-cat-off" disabled={!!busy} onClick={() => void takeOff(c)} title="Take it off">✕</button>
                          : <input type="checkbox" checked={picked.has(k)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />}
                        {PETS[c.col].mark && <span className="item-cat-kind" title={PETS[c.col].one}>{PETS[c.col].mark}</span>}<span className="tnum">#{c.id}</span>{c.name && <span className="item-cat-name">{c.name}</span>}{on && <span className="item-cat-wearing">{isRoom ? 'on' : isAction ? 'has it' : 'wearing'}</span>}
                      </label>
                    );
                  })}
                </div>
                <button className="btn btn-sm btn-ghost" disabled={!!busy || (mine?.cats ?? []).filter((c) => picked.has(pk(c))).every(wears)} onClick={() => void wear()}>
                  {busy === 'wear' ? (isRoom ? 'Decorating…' : isAction ? 'Giving…' : 'Dressing…') : !picked.size ? (isRoom ? 'Tick the pets for this room' : isAction ? 'Tick the pets to give it to' : 'Tick the pets to dress') : isRoom ? `Give ${picked.size}${picked.size === 1 ? ' pet' : ' pets'} this room · gas only` : isAction ? `Give it to ${picked.size}${picked.size === 1 ? ' pet' : ' pets'} · gas only` : `Dress ${picked.size}${picked.size === 1 ? ' pet' : ' pets'} · gas only`}
                </button>
                {wearing.length > 0 && <p className="item-note">{isRoom ? 'One copy is a room for every pet in your wallet. Sell it and the rooms go plain by themselves.' : isAction ? 'One copy is enough for every pet in your wallet. Sell it and they go back to the usual.' : 'One copy dresses every pet in your wallet. Sell it and they undress by themselves.'}</p>}
                {item.id in TOY_ITEMS && <p className="item-note">{TOY_NOTE[TOY_ITEMS[item.id]!]}</p>}
                {item.id in PET_MOVE_ITEMS && <p className="item-note">{MOVE_NOTE[PET_MOVE_ITEMS[item.id]!]}</p>}
                {isOutfit && <p className="item-note">One outfit at a time: putting this on takes off any other.</p>}
                {isRoom && <p className="item-note">One room at a time: giving a pet this room takes its other room off.</p>}
              </div>
            )}
            {wearable && drawn && held > 0 && wearers.length === 0 && mine.cats.length > 0 && !isRoom && (
              <p className="item-note">{costume === 'emohair' ? `The cat was born with this hair; it goes on ${freeNames().join(', ').replace(/, ([^,]*)$/, ' or $1')}.` : 'None of your pets can wear this yet.'}</p>
            )}
            {note && <p className="item-note" aria-live="polite">{note}</p>}
          </>)}
        </div>
      </div>
    </article>
  );
}
