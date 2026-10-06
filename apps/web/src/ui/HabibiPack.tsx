/**
 * The Habibi pack's page, at /shop/habibi (in the Item shop tab, like /shop/jewish; on the site since 2026-09-28): the five items, a live room to try them on, and the story behind each one. The items and
 * their terms come from `HABIBI_PACK` in items.ts (planned shop ids 13-17: free, 1,001 of each, one of each per living,
 * named pet, the Halloween items' gate); until they exist on chain every claim button says "Coming soon". Once they do,
 * a claim is made here with one of the wallet's living, named pets, the same as the shop's own cards.
 *
 * The copy is the operator's to approve: plain and accurate, no em dashes, nothing religious beyond the one fact behind
 * Sahur's name. The seal is not shown: it is not live.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address, CatView, ClaimCheck, ItemView } from '@emo-pets/chain';
import { ChainClient, CLAIM_REASON } from '@emo-pets/chain';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { ConnectModal } from './ConnectModal';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import type { Costume, Drawing } from '../pet/Pet';
import { HABIBI_PACK, packCreated, type PackItem } from '../items';
import { PETS, hasPet, fallbackName, PET_ORDER } from '../pets';
import { chainCfg, chainClient } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';
import './shop.css';

const PACK = HABIBI_PACK;

/** What each item does on a pet, in a line (the story below says what it is). */
const DOES: Record<string, string> = {
  keffiyeh: 'The red-and-white keffiyeh with its black agal, on your pet’s head. Goes with any outfit. Crowned pets wear the gold agal.',
  bisht: 'The black cloak with gold embroidery down its front, worn open. An outfit, one at a time. Crowned pets wear the golden bisht.',
  majlis: 'A room theme: your pet lives in a majlis, lanterns and coffee and all, with Dubai through the window, by day and by night.',
  darbuka: 'Play brings out a darbuka instead of the ball of yarn, and your pet plays the maqsum on it. Sahur plays it with his bat.',
  falcon: 'Pet becomes the falcon: it glides in, lands on your pet, gets a stroke and flies off. A tap on your pet is still a quick pet.',
};

/** The pets the live room can show (the pack is for every pet, now or later). */
const PET_CHOICES = PET_ORDER.filter((c) => hasPet(c)).map((c) => ({ col: c, character: PETS[c].character as Drawing, label: PETS[c].brand }));
const pk = (c: CatView) => `${c.col}:${c.id}`;

export function HabibiPack() {
  // ---- the wallet (the header shows it; claims need it once the pack exists)
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const connecting = useRef(false);
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
  const connected = wallet.status === 'connected' && !!wallet.address;
  useEffect(() => { chainClient?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [connected, wallet.address]);

  // live once the shop holds all five at their ids under their names: read from the contract, so the page turns from
  // "Coming soon" to claims by itself the moment the create script has run
  const [catalogue, setCatalogue] = useState<ItemView[] | null>(null);
  const loadCatalogue = () => { void chainClient?.items().then(setCatalogue).catch(() => {}); };
  useEffect(() => {
    if (!chainClient || !chainCfg?.items) return;
    loadCatalogue();
    const id = setInterval(loadCatalogue, 30_000);   // how many are left moves as people claim
    return () => clearInterval(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = packCreated(new Map((catalogue ?? []).map((it) => [it.id, it.name])), PACK);
  const onChain = (id: number) => catalogue?.find((it) => it.id === id) ?? null;

  // ---- claiming: one of each per living, named pet (the gate names the pet), so a claim is made with one pet, picked here
  const [pets, setPets] = useState<CatView[] | null>(null);
  const [held, setHeld] = useState<Record<number, number>>({});
  const loadMine = () => {
    if (!chainClient || !connected || !wallet.address) { setPets(null); setHeld({}); return; }
    const who = wallet.address as Address;
    void chainClient.petsOf(who).then(setPets).catch(() => {});
    void chainClient.holdings(who).then(setHeld).catch(() => {});
  };
  useEffect(loadMine, [connected, wallet.address, live]);   // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => (pets ?? []).filter((c) => c.alive && c.name.length > 0), [pets]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if ((sel === null || !candidates.some((c) => pk(c) === sel)) && candidates[0]) setSel(pk(candidates[0])); }, [sel, candidates]);
  const chosen = candidates.find((c) => pk(c) === sel) ?? null;
  const hint = (c: CatView | null): `0x${string}` => (c && chainClient ? ChainClient.petHint(chainClient.addr(c.col), c.id) : '0x');
  // whether the chosen pet can claim each item, and if not, why
  const [checks, setChecks] = useState<Record<number, ClaimCheck>>({});
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!live || !chainClient || !connected || !wallet.address || !chosen) { setChecks({}); return; }
    let alive = true;
    setChecks({});
    for (const it of PACK.items) void chainClient.canClaim(it.id, wallet.address as Address, 1, hint(chosen)).then((c) => { if (alive) setChecks((m) => ({ ...m, [it.id]: c })); }).catch(() => {});
    return () => { alive = false; };
  }, [live, connected, wallet.address, sel, bump]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [claiming, setClaiming] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const claim = async (it: PackItem) => {
    if (!chainClient || claiming !== null) return;
    if (!connected) { setModal(true); return; }
    if (!chosen || !checks[it.id]?.ok) return;
    setClaiming(it.id); setNotes((n) => ({ ...n, [it.id]: '' }));
    try {
      if (chainCfg && wallet.chainId !== chainCfg.chain.id) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      await chainClient.claimItem(it.id, 1, hint(chosen), 0n);
      setNotes((n) => ({ ...n, [it.id]: 'Yours. Put it on from your pet’s page, or give it to any of your pets in the shop.' }));
      loadMine(); loadCatalogue(); setBump((b) => b + 1);
      // and again a moment later: right after a receipt, a read can reach an RPC node a block behind
      setTimeout(() => { loadMine(); loadCatalogue(); setBump((b) => b + 1); }, 3000);
    } catch (e) { setNotes((n) => ({ ...n, [it.id]: (e as Error).message })); }
    finally { setClaiming(null); }
  };
  const doInjected = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) { try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); w.chainId = chainCfg.chain.id; } catch { /* asked again later */ } }
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
  const doDisconnect = () => { disconnect(); setWallet(EMPTY_WALLET); void revokeInjected(); };

  // ---- the live room
  const [pet, setPet] = useState<Drawing>(PET_CHOICES[0]?.character ?? 'cat');
  const [d, setD] = useState<Director | null>(null);
  const [keffiyeh, setKeffiyeh] = useState(true);
  const [bisht, setBisht] = useState(true);
  const [majlis, setMajlis] = useState(true);
  const [night, setNight] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { d?.setCostumes([...(bisht ? ['bisht' as Costume] : []), ...(keffiyeh ? ['keffiyeh' as Costume] : [])]); }, [d, keffiyeh, bisht]);
  useEffect(() => { if (!d) return; d.setToy('darbuka'); d.setPetMove('falcon'); }, [d]);
  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* a preview: nothing to report */ } finally { setBusy(null); }
  };
  const drum = () => void run('darbuka', (dd) => dd.play());
  const falcon = () => void run('falcon', (dd) => dd.pet(1));
  /** "Try it" on an item card: put it on in the room above and bring the room into view. */
  const tryItem = (it: PackItem) => {
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const e = it.effect;
    if (e.kind === 'wear') { if (e.costume === 'keffiyeh') setKeffiyeh(true); else setBisht(true); }
    else if (e.kind === 'room') setMajlis(true);
    else if (e.kind === 'toy') setTimeout(drum, 450);
    else setTimeout(falcon, 450);
  };

  const status = live ? 'Live' : 'Coming soon';
  const claimLabel = (it: PackItem) => {
    const item = onChain(it.id);
    if (!item) return { text: 'Coming soon', can: false };
    if (item.maxSupply && item.minted >= item.maxSupply) return { text: 'All claimed', can: false };
    if (!connected) return { text: 'Connect to claim', can: true };
    if (!pets) return { text: 'Looking in your wallet…', can: false };
    if (!chosen) return { text: 'Needs a named pet', can: false };
    const c = checks[it.id];
    if (!c) return { text: 'Checking…', can: false };
    if (c.ok) return { text: 'Claim · free', can: true };
    return { text: c.reason === 7 ? `${chosen.name || fallbackName(chosen.col, chosen.id)} has one` : CLAIM_REASON[c.reason] ?? 'Not now', can: false };
  };

  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="pack habibi">
        <nav className="pack-crumbs" aria-label="Breadcrumb"><a href="/shop">Item shop</a><span aria-hidden>/</span><span>The Habibi pack</span></nav>

        {/* ---- hero ---- */}
        <section className="pack-hero">
          <div className="pack-hero-copy">
            <span className="pack-eyebrow">New pack <b>{status}</b></span>
            <h1>The Habibi pack</h1>
            <p className="pack-lead">Five items for every pet: the keffiyeh, the bisht, the majlis, a darbuka and a falcon. Each one is drawn into your pet and plays out in its room. All five are free.</p>
            <div className="pack-facts">
              <div className="pack-fact"><strong>Free</strong><span>one of each per named pet</span></div>
              <div className="pack-fact"><strong>1,001</strong><span>of each · the Nights</span></div>
              <div className="pack-fact"><strong>Every pet</strong><span>now or later</span></div>
            </div>
            <div className="pack-ctas">
              <a className="btn btn-pink" href="#pack-items">See the items</a>
              <a className="btn btn-ghost" href="#pack-lore">The story behind them</a>
            </div>
          </div>
          <figure className="pack-hero-art">
            <img src="/brand/habibi-pack.png" alt="The cat, the frok and Sahur in a majlis with Dubai through the window, in keffiyehs and bishts, a darbuka and a falcon" />
          </figure>
        </section>

        {/* ---- the live room ---- */}
        <section className="pack-try" aria-labelledby="pack-try-h">
          <div className="pack-section-head">
            <h2 id="pack-try-h">Try it on</h2>
            <p>A live preview on the real pets. Nothing here is a transaction.</p>
          </div>
          <div className="pack-try-body">
            <div className="pack-stage" ref={stageRef}>
              <div className="shell"><Stage key={pet} onDirector={setD} night={night} thought={null} scene={majlis ? 'majlis' : null} character={pet} /></div>
            </div>
            <div className="pack-controls">
              <div className="pack-control-group">
                <span className="pack-control-label">Pet</span>
                <div className="pack-chips">
                  {PET_CHOICES.map((p) => <button key={p.col} className={`chip-btn ${pet === p.character ? 'is-on' : ''}`} disabled={!!busy} onClick={() => { setD(null); setPet(p.character); }}>{p.label}</button>)}
                </div>
              </div>
              <div className="pack-control-group">
                <span className="pack-control-label">Wear</span>
                <div className="pack-chips">
                  <button className={`chip-btn ${keffiyeh ? 'is-on' : ''}`} onClick={() => setKeffiyeh((v) => !v)}>Keffiyeh</button>
                  <button className={`chip-btn ${bisht ? 'is-on' : ''}`} onClick={() => setBisht((v) => !v)}>Bisht</button>
                  <button className={`chip-btn ${majlis ? 'is-on' : ''}`} onClick={() => setMajlis((v) => !v)}>Majlis</button>
                  <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
                </div>
              </div>
              <div className="pack-control-group">
                <span className="pack-control-label">Play</span>
                <div className="pack-chips">
                  <button className={`btn btn-sm ${busy === 'darbuka' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={drum}>{busy === 'darbuka' ? 'Drumming…' : 'Play the darbuka'}</button>
                  <button className={`btn btn-sm ${busy === 'falcon' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={falcon}>{busy === 'falcon' ? 'Here it comes…' : 'Call the falcon'}</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- the items ---- */}
        <section id="pack-items" className="pack-items" aria-labelledby="pack-items-h">
          <div className="pack-section-head">
            <h2 id="pack-items-h">The items</h2>
            <p>Each item is its own token, and free: any living, named pet can claim one of each. One copy dresses every pet in your wallet, and every item goes on any pet, now or later.</p>
          </div>
          {live && connected && pets && (candidates.length > 0 ? (
            <label className="item-pick pack-pick">Claim with
              <select value={sel ?? ''} onChange={(e) => setSel(e.target.value)}>
                {candidates.map((c) => <option key={pk(c)} value={pk(c)}>{PETS[c.col].one} #{c.id} {c.name}</option>)}
              </select>
            </label>
          ) : (
            <p className="pack-card-note">You need a living, named pet to claim. {pets.length ? <>Name one of yours for 10 MON on its page.</> : <><a href="/adopt">Get a pet</a> (the inversebrah and Sahur are free), name it for 10 MON, then come back.</>}</p>
          ))}
          <div className="pack-grid">
            {PACK.items.map((it) => {
              const item = live ? onChain(it.id) : null;
              const left = item ? Math.max(0, item.maxSupply - item.minted) : null;
              const mine = held[it.id] ?? 0;
              const b = claimLabel(it);
              return (
                <article key={it.key} className="pack-card">
                  <div className="pack-card-art"><img src={it.card} alt="" loading="lazy" /></div>
                  <div className="pack-card-body">
                    <h3>{it.label}</h3>
                    <p>{DOES[it.key] ?? ''}</p>
                    <dl className="pack-card-facts">
                      <div><dt>Price</dt><dd>Free</dd></div>
                      <div><dt>{item ? 'Left' : 'Supply'}</dt><dd className="tnum">{item ? `${left!.toLocaleString()} of ${item.maxSupply.toLocaleString()}` : it.supply.toLocaleString()}</dd></div>
                    </dl>
                    <div className="pack-card-actions">
                      <button className="btn btn-sm btn-pink" disabled={!b.can || claiming !== null} onClick={() => void claim(it)}>{claiming === it.id ? 'Confirm in your wallet…' : b.text}</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => tryItem(it)}>Try it</button>
                    </div>
                    {mine > 0 && <p className="pack-card-note">You have {mine}.</p>}
                    {notes[it.id] && <p className="pack-card-note" aria-live="polite">{notes[it.id]}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---- the story ---- */}
        <section id="pack-lore" className="pack-lore" aria-labelledby="pack-lore-h">
          <div className="pack-section-head">
            <h2 id="pack-lore-h">The story behind them</h2>
            <p>Where each item comes from, and the numbers behind the pack.</p>
          </div>

          <article className="lore-card lore-intro">
            <h3>Habibi <span lang="ar" dir="rtl">حبيبي</span></h3>
            <p>“My love”, “my dear”. It comes from <i>ḥubb</i>, love, and across the Arab world it is what you call a friend, a brother, a cousin, or a stranger you have just decided you like. To a woman it is <i>habibti</i>. The internet made it famous with four words: <i>Habibi, come to Dubai</i>.</p>
          </article>

          <div className="lore-grid">
            <article className="lore-card">
              <img className="lore-art" src="/brand/item-keffiyeh.png" alt="" loading="lazy" />
              <h3>Keffiyeh <span lang="ar" dir="rtl">كوفية</span></h3>
              <p>A square of cotton, folded into a triangle and worn over the head against the sun, the sand and the cold. Its name is usually traced to Kufa, a city in Iraq. The red-and-white check, the <i>shemagh</i>, is worn across Jordan and the Arabian Gulf.</p>
              <h4>Agal <span lang="ar" dir="rtl">عقال</span></h4>
              <p>The doubled black cord that holds it on. Kings wore theirs wrapped in gold thread: in 1943 an American reporter noted that King Abdulaziz, the founder of Saudi Arabia, wore a golden agal instead of a crown.</p>
              <p className="lore-game"><b>In Emogotchi</b> Your pet wears the keffiyeh with any outfit. Crowned pets wear the golden agal in place of the crown. A witch hat or a pumpkin goes over it.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-bisht.png" alt="" loading="lazy" />
              <h3>Bisht <span lang="ar" dir="rtl">بشت</span></h3>
              <p>The cloak worn open over the thobe for weddings, Eid, graduations and great occasions: fine wool or camel hair, in black, brown or cream, edged with <i>zari</i>, thread of gold or silver. The finest are said to come from Al-Ahsa, in eastern Saudi Arabia, where craftsmen still finish their gold edges by hand.</p>
              <p>In December 2022 the Emir of Qatar placed a black bisht on Lionel Messi’s shoulders moments before he lifted the World Cup.</p>
              <p className="lore-game"><b>In Emogotchi</b> An outfit, one at a time. Crowned pets wear the golden bisht.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-majlis.png" alt="" loading="lazy" />
              <h3>Majlis <span lang="ar" dir="rtl">مجلس</span></h3>
              <p>“A place of sitting”: the room where a household welcomes its guests, with cushions along the walls and rugs on the floor. People meet there to talk, share news, settle disputes and recite poetry.</p>
              <p>Coffee comes first. The host pours <i>gahwa</i> from the <i>dallah</i> into a small cup, the <i>finjan</i>, and fills it again until the guest gives the cup a little shake to say they have had enough. In 2015 UNESCO listed both the majlis and Arabic coffee, “a symbol of generosity”, as heritage of humanity.</p>
              <p>Through the window is Dubai, and the Burj Khalifa: 828 metres, the tallest building in the world since 2010.</p>
              <p className="lore-game"><b>In Emogotchi</b> A room theme, by day and by night. One room at a time.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-darbuka.png" alt="" loading="lazy" />
              <h3>Darbuka <span lang="ar" dir="rtl">دربكة</span></h3>
              <p>A goblet-shaped hand drum, called <i>tabla</i> in Egypt, heard at weddings and parties from Morocco to Iraq. It has two voices: the <i>doum</i>, deep, struck in the middle of the head, and the <i>tek</i>, bright, struck at the rim. Its most common rhythm, the <i>maqsum</i>, goes:</p>
              <p className="lore-rhythm" aria-label="doum, tek, rest, tek, doum, rest, tek, rest"><b>doum</b> tek · tek <b>doum</b> · tek ·</p>
              <p className="lore-game"><b>In Emogotchi</b> Play brings out the darbuka instead of the ball of yarn, and your pet plays the maqsum. Tung Tung Tung Sahur plays it with his bat: his name is the sound of the drum that wakes people for sahur, the meal before dawn in Ramadan.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-falcon.png" alt="" loading="lazy" />
              <h3>Falcon <span lang="ar" dir="rtl">صقر</span></h3>
              <p>For thousands of years falcons were trained in Arabia to hunt, and falconry is still loved there as a sport of patience and skill. UNESCO listed it as heritage of humanity in 2010, in a nomination led by the UAE, whose national bird is the saker falcon; a golden falcon sits on its coat of arms.</p>
              <p>Since 2002 the UAE has issued falcons their own passports, and they often fly in the cabin with their owners. The peregrine, in a dive, is the fastest animal on Earth: more than 320 km/h.</p>
              <p className="lore-game"><b>In Emogotchi</b> Pet becomes the falcon: it glides in, lands on your pet, gets a stroke and flies off. A tap on your pet is still a quick pet.</p>
            </article>
          </div>

          {/* the numbers */}
          <div className="lore-numbers">
            <div className="lore-number">
              <strong>1,001</strong>
              <div>
                <h3>The Nights <span lang="ar" dir="rtl">ألف ليلة وليلة</span></h3>
                <p>The Thousand and One Nights: Scheherazade tells the king a story every night and stops at dawn, so he spares her for one more. There are 1,001 of each item, and never more.</p>
              </div>
            </div>
            <div className="lore-number">
              <strong>Free</strong>
              <div>
                <h3>The guest</h3>
                <p>In a majlis the coffee is never sold. Every item in this pack is free: one of each for every living, named pet.</p>
              </div>
            </div>
            <div className="lore-number">
              <strong>32</strong>
              <div>
                <h3>Habibi, in numbers</h3>
                <p>In the old <i>abjad</i> system every Arabic letter is also a number. <span lang="ar" dir="rtl">حبيبي</span> is ha 8, ba 2, ya 10, ba 2, ya 10: 32.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- questions ---- */}
        <section className="pack-faq" aria-labelledby="pack-faq-h">
          <div className="pack-section-head"><h2 id="pack-faq-h">Questions</h2></div>
          <details><summary>Are they really free?</summary><p>Yes. You pay only the network fee. Any living, named pet can claim one of each; a wallet with three named pets can claim three of each.</p></details>
          <details><summary>Why does my pet need a name?</summary><p>So that one person cannot take all 1,001 in a single transaction. Naming a pet costs 10 MON, and 80% of it buys EMO and burns it. The inversebrah and Tung Tung Tung Sahur are free to mint.</p></details>
          <details><summary>Which pets can wear them?</summary><p>Every pet: Emogotchi cats, inversebrahs and Tung Tung Tung Sahurs, and any pet that comes later. One copy dresses every pet in your wallet.</p></details>
          <details><summary>Do they go with my other items?</summary><p>The keffiyeh goes with any outfit. The bisht is an outfit, so it replaces your pet’s other outfit while it is on. The majlis is a room, so it replaces your pet’s other room. The darbuka and the falcon change what Play and Pet do.</p></details>
          <details><summary>When can I get them?</summary><p>{live ? 'Now, here and in the shop.' : 'Soon. They will appear here and in the shop the moment they exist on chain.'}</p></details>
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}
