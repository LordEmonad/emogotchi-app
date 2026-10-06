/**
 * The emo pack's page, at /shop/emo (in the Item shop tab, like /shop/habibi). Built like the Habibi and Jewish pack pages:
 * a hero, a live room to try the seven items on any pet, the items in both editions (the paid one, and the free soulbound
 * one for $EMO holders, in its foil frame), the story behind them, the numbers, and questions. Every buy and claim button
 * says "Coming soon" until both editions exist on chain under their names (items.ts `packCreated`, read from the shop's
 * catalogue, so the page turns live by itself the moment contracts/script/CreateEmo.s.sol has run). Then: the paid
 * edition is bought here for 30 MON (its gate asks for any pet: the claim names a collection the wallet holds a pet of),
 * the holders' edition claimed free (its gate reads the wallet's $EMO: no hint), each with the shop's own checks first.
 *
 * The copy is a draft the operator has not signed off: plain, no em dashes, nothing that names a price or a rule the
 * operator has not decided (the terms below are the ones decided on 2026-10-03).
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
import { PETS, hasPet, PET_ORDER } from '../pets';
import { chainCfg, chainClient } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';
import { EMO_HOLDERS_PACK, EMO_PACK, packCreated } from '../items';
import { EMO_HERO, EMO_ITEMS, EMO_HOLD, EMO_PRICE, type EmoItem } from './emoPackData';
import './shop.css';
import './emopack.css';

/** The pets the live room can show (the pack is for every pet, now or later). */
const PET_CHOICES = PET_ORDER.filter((c) => hasPet(c)).map((c) => ({ col: c, character: PETS[c].character as Drawing, label: PETS[c].brand }));

export function EmoPack() {
  // ---- the wallet (the header shows it)
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const connecting = useRef(false);
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
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
  const connected = wallet.status === 'connected' && !!wallet.address;
  useEffect(() => { chainClient?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [connected, wallet.address]);

  // ---- live once the shop holds both editions at 18-31 under their names
  const [catalogue, setCatalogue] = useState<ItemView[] | null>(null);
  const loadCatalogue = () => { void chainClient?.items().then(setCatalogue).catch(() => {}); };
  useEffect(() => {
    if (!chainClient || !chainCfg?.items) return;
    loadCatalogue();
    const id = setInterval(loadCatalogue, 30_000);
    return () => clearInterval(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = useMemo(() => { const names = new Map((catalogue ?? []).map((it) => [it.id, it.name])); return packCreated(names, EMO_PACK) && packCreated(names, EMO_HOLDERS_PACK); }, [catalogue]);

  // ---- what the wallet has: its pets (the paid edition's gate asks for one) and its items; whether it can get each one
  const [pets, setPets] = useState<CatView[] | null>(null);
  const [held, setHeld] = useState<Record<number, number>>({});
  const loadMine = () => {
    if (!chainClient || !connected || !wallet.address) { setPets(null); setHeld({}); return; }
    const who = wallet.address as Address;
    void chainClient.petsOf(who).then(setPets).catch(() => {});
    void chainClient.holdings(who).then(setHeld).catch(() => {});
  };
  useEffect(loadMine, [connected, wallet.address, live]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the paid edition's hint: a collection the wallet holds a pet of (the shop's own choice: not the cat's when it can)
  const petHint = useMemo((): `0x${string}` => {
    const c = pets?.find((x) => x.col !== 'cat') ?? pets?.[0];
    return c && chainClient ? ChainClient.collectionHint(chainClient.addr(c.col)) : '0x';
  }, [pets]);
  const [checks, setChecks] = useState<Record<number, ClaimCheck>>({});
  const [bump, setBump] = useState(0);
  const checkedFor = useRef('');
  useEffect(() => {
    if (!live || !chainClient || !connected || !wallet.address || pets === null) { setChecks({}); checkedFor.current = ''; return; }
    let alive = true;
    // a re-read after a buy keeps the last answers on the buttons until the new ones land; another wallet starts afresh
    const who = `${wallet.address}|${pets.length > 0}`;
    if (checkedFor.current !== who) { setChecks({}); checkedFor.current = who; }
    for (const it of EMO_ITEMS) {
      if (pets.length) void chainClient.canClaim(it.id, wallet.address as Address, 1, petHint).then((c) => { if (alive) setChecks((m) => ({ ...m, [it.id]: c })); }).catch(() => {});
      void chainClient.canClaim(it.holderId, wallet.address as Address, 1, '0x').then((c) => { if (alive) setChecks((m) => ({ ...m, [it.holderId]: c })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [live, connected, wallet.address, pets, petHint, bump]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [sending, setSending] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const after = () => { loadMine(); loadCatalogue(); setBump((b) => b + 1); setTimeout(() => { loadMine(); loadCatalogue(); setBump((b) => b + 1); }, 3000); };
  /** Buy the paid edition (30 MON) or claim the holders' (free), after the shop's own check. */
  const get = async (it: EmoItem, holders: boolean) => {
    if (!chainClient || sending !== null) return;
    if (!connected) { setModal(true); return; }
    const id = holders ? it.holderId : it.id, c = checks[id];
    if (!c?.ok) return;
    setSending(id); setNotes((n) => ({ ...n, [it.key]: '' }));
    try {
      if (chainCfg && wallet.chainId !== chainCfg.chain.id) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      await chainClient.claimItem(id, 1, holders ? '0x' : petHint, c.due);
      setNotes((n) => ({ ...n, [it.key]: 'Yours. Put it on from your pet’s page, or give it to any of your pets in the shop.' }));
      after();
    } catch (e) { setNotes((n) => ({ ...n, [it.key]: (e as Error).message })); }
    finally { setSending(null); }
  };
  /** Claim every holders' item this wallet can still claim, one after another (a transaction each). */
  const [claimingAll, setClaimingAll] = useState(false);
  const claimAll = async () => {
    if (!chainClient || claimingAll || sending !== null) return;
    if (!connected) { setModal(true); return; }
    setClaimingAll(true);
    try {
      for (const it of EMO_ITEMS) {
        if (!checks[it.holderId]?.ok) continue;
        setSending(it.holderId);
        try { await chainClient.claimItem(it.holderId, 1, '0x', 0n); setNotes((n) => ({ ...n, [it.key]: 'Yours.' })); }
        catch (e) { setNotes((n) => ({ ...n, [it.key]: (e as Error).message })); break; }
      }
    } finally { setSending(null); setClaimingAll(false); after(); }
  };
  const paidLabel = (it: EmoItem) => {
    if (!live) return { text: 'Coming soon', can: false };
    if (!connected) return { text: `Buy · ${EMO_PRICE} MON`, can: true };
    if (pets === null) return { text: 'Looking in your wallet…', can: false };
    if (!pets.length) return { text: 'Needs a pet', can: false };
    const c = checks[it.id];
    if (!c) return { text: 'Checking…', can: false };
    return c.ok ? { text: `Buy · ${EMO_PRICE} MON`, can: true } : { text: CLAIM_REASON[c.reason] || 'Not now', can: false };
  };
  const holderLabel = (it: EmoItem) => {
    if (!live) return { text: 'Coming soon', can: false };
    if (!connected) return { text: 'Claim free', can: true };
    const c = checks[it.holderId];
    if (!c) return { text: 'Checking…', can: false };
    if (c.ok) return { text: 'Claim free', can: true };
    if (c.reason === 7) return { text: 'Claimed', can: false };
    if (c.reason === 6) return { text: `Needs ${EMO_HOLD.toLocaleString()} $EMO`, can: false };
    return { text: CLAIM_REASON[c.reason] || 'Not now', can: false };
  };
  const holderReady = EMO_ITEMS.filter((it) => checks[it.holderId]?.ok).length;
  const holderNeedsEmo = live && connected && EMO_ITEMS.some((it) => checks[it.holderId]?.reason === 6);

  // ---- the live room: the whole pack on, in the bedroom
  const [pet, setPet] = useState<Drawing>(PET_CHOICES[0]?.character ?? 'cat');
  const [d, setD] = useState<Director | null>(null);
  const [beanie, setBeanie] = useState(true);
  const [fit, setFit] = useState(true);
  const [wrist, setWrist] = useState(true);
  const [lip, setLip] = useState(true);
  const [room, setRoom] = useState(true);
  const [night, setNight] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    d?.setCostumes([...(fit ? ['emofit' as Costume] : []), ...(beanie ? ['beanie' as Costume] : []), ...(wrist ? ['wristbands' as Costume] : []), ...(lip ? ['piercings' as Costume] : [])]);
  }, [d, beanie, fit, wrist, lip]);
  useEffect(() => { if (!d) return; d.setToy('guitar'); d.setPetMove('selfie'); }, [d]);
  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* a preview: nothing to report */ } finally { setBusy(null); }
  };
  const shred = () => void run('guitar', (dd) => dd.play());
  const selfie = () => void run('selfie', (dd) => dd.pet(1));
  /** "Try it" on an item: put it on in the room above and bring the room into view. */
  const tryItem = (it: EmoItem) => {
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = it.tryIt;
    if (t.kind === 'wear') ({ beanie: setBeanie, emofit: setFit, wristbands: setWrist, piercings: setLip })[t.costume](true);
    else if (t.kind === 'room') setRoom(true);
    else if (t.kind === 'toy') setTimeout(shred, 450);
    else setTimeout(selfie, 450);
  };
  // which edition each item card shows large (the holders' foil plays as a live picture)
  const [shown, setShown] = useState<Record<string, 'paid' | 'holder'>>({});

  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="pack emo">
        <nav className="pack-crumbs" aria-label="Breadcrumb"><a href="/shop">Item shop</a><span aria-hidden>/</span><span>The emo pack</span></nav>

        {/* ---- hero ---- */}
        <section className="pack-hero">
          <div className="pack-hero-copy">
            <span className="pack-eyebrow">New pack <b>{live ? 'Live' : 'Coming soon'}</b></span>
            <h1>The emo pack</h1>
            <p className="pack-lead">Seven items for every pet: a beanie, the fit, wristbands, lip piercings, an emo bedroom, a guitar and a flip phone. Each one is drawn into your pet and plays out in its room. If you hold $EMO, the whole pack is free.</p>
            <div className="pack-facts">
              <div className="pack-fact"><strong>Free</strong><span>holding {EMO_HOLD.toLocaleString()} $EMO</span></div>
              <div className="pack-fact"><strong>{EMO_PRICE} MON</strong><span>each, for anyone with a pet</span></div>
              <div className="pack-fact"><strong>Every pet</strong><span>now or later</span></div>
            </div>
            <div className="pack-ctas">
              <a className="btn btn-pink" href="#pack-items">See the items</a>
              <a className="btn btn-ghost" href="#pack-editions">Free for holders</a>
            </div>
          </div>
          <figure className="pack-hero-art">
            <img src={EMO_HERO} alt="The cat, the frok, Sahur, Thiccums and the r3tard in beanies and the emo fit, playing guitars in the emo bedroom at night" />
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
              <div className="shell"><Stage key={pet} onDirector={setD} night={night} thought={null} scene={room ? 'emoroom' : null} character={pet} /></div>
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
                  <button className={`chip-btn ${beanie ? 'is-on' : ''}`} onClick={() => setBeanie((v) => !v)}>Beanie</button>
                  <button className={`chip-btn ${fit ? 'is-on' : ''}`} onClick={() => setFit((v) => !v)}>The fit</button>
                  <button className={`chip-btn ${wrist ? 'is-on' : ''}`} onClick={() => setWrist((v) => !v)}>Wristbands</button>
                  <button className={`chip-btn ${lip ? 'is-on' : ''}`} onClick={() => setLip((v) => !v)}>Lip piercings</button>
                  <button className={`chip-btn ${room ? 'is-on' : ''}`} onClick={() => setRoom((v) => !v)}>Emo bedroom</button>
                  <button className={`chip-btn ${night ? 'is-on' : ''}`} onClick={() => setNight((v) => !v)}>{night ? 'Night' : 'Day'}</button>
                </div>
              </div>
              <div className="pack-control-group">
                <span className="pack-control-label">Play</span>
                <div className="pack-chips">
                  <button className={`btn btn-sm ${busy === 'guitar' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={shred}>{busy === 'guitar' ? 'Shredding…' : 'Play the guitar'}</button>
                  <button className={`btn btn-sm ${busy === 'selfie' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={selfie}>{busy === 'selfie' ? 'Say cheese…' : 'Take a selfie'}</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- the two editions ---- */}
        <section id="pack-editions" className="emo-editions" aria-labelledby="pack-ed-h">
          <div className="pack-section-head">
            <h2 id="pack-ed-h">Two ways to get it</h2>
            <p>The same seven items, drawn the same on your pet. Hold $EMO and they are free, in a holographic frame of their own that moves.</p>
          </div>
          <div className="emo-ed-grid">
            <article className="emo-ed">
              <img src={EMO_ITEMS[0]!.card} alt="The beanie's card, paid edition" loading="lazy" />
              <div>
                <h3>Paid edition</h3>
                <ul>
                  <li><b>{EMO_PRICE} MON</b> an item. 80% of it buys EMO and burns it.</li>
                  <li>For anyone holding a pet.</li>
                  <li>As many as you like. Send them, trade them.</li>
                </ul>
                {live ? <a className="btn btn-sm btn-ghost" href="#pack-items">Buy below</a> : <span className="btn btn-sm btn-ghost is-off">Coming soon</span>}
              </div>
            </article>
            <article className="emo-ed holder">
              <img src={EMO_ITEMS[0]!.holder} alt="The beanie's card, holders' edition, in its holographic frame" loading="lazy" />
              <div>
                <h3>Holders’ edition</h3>
                <ul>
                  <li><b>Free</b> for a wallet holding <b>{EMO_HOLD.toLocaleString()} $EMO</b>. You pay only the network fee.</li>
                  <li>One of each, the whole set.</li>
                  <li><b>Soulbound</b>: it stays in your wallet for good.</li>
                </ul>
                {!live ? <span className="btn btn-sm btn-pink is-off">Coming soon</span>
                  : !connected ? <button className="btn btn-sm btn-pink" onClick={() => setModal(true)}>Connect to claim</button>
                    : holderReady > 0 ? <button className="btn btn-sm btn-pink" disabled={claimingAll || sending !== null} onClick={() => void claimAll()}>{claimingAll ? 'Confirm each in your wallet…' : `Claim ${holderReady === EMO_ITEMS.length ? 'all seven' : `the ${holderReady} left`} free`}</button>
                      : holderNeedsEmo ? <span className="btn btn-sm btn-ghost is-off">Hold {EMO_HOLD.toLocaleString()} $EMO to claim</span>
                        : <span className="btn btn-sm btn-ghost is-off">{EMO_ITEMS.every((it) => checks[it.holderId]?.reason === 7) ? 'You have the set' : 'Checking…'}</span>}
              </div>
            </article>
          </div>
        </section>

        {/* ---- the items ---- */}
        <section id="pack-items" className="pack-items" aria-labelledby="pack-items-h">
          <div className="pack-section-head">
            <h2 id="pack-items-h">The items</h2>
            <p>Each item is its own token. One copy dresses every pet in your wallet, and every item goes on any pet, now or later. Tap a card to see the other edition.</p>
          </div>
          {live && connected && pets !== null && pets.length === 0 && (
            <p className="pack-card-note">The paid edition needs a pet in your wallet. <a href="/adopt">Get one</a>: the inversebrah, Sahur, Thiccums and the r3tard are free.</p>
          )}
          <div className="pack-grid">
            {EMO_ITEMS.map((it) => {
              const ed = shown[it.key] ?? 'paid';
              return (
                <article key={it.key} className="pack-card">
                  <button type="button" className={`pack-card-art emo-flip ${ed}`} aria-label={`Show the ${ed === 'paid' ? 'holders’' : 'paid'} edition`}
                    onClick={() => setShown((s) => ({ ...s, [it.key]: ed === 'paid' ? 'holder' : 'paid' }))}>
                    <img src={ed === 'paid' ? it.card : it.holder} alt="" loading="lazy" />
                    <span className="emo-flip-tag">{ed === 'paid' ? 'Paid edition' : 'Holders’ edition'}</span>
                  </button>
                  <div className="pack-card-body">
                    <h3>{it.label}</h3>
                    <p>{it.does}</p>
                    <dl className="pack-card-facts">
                      <div><dt>Price</dt><dd>{EMO_PRICE} MON, or free</dd></div>
                      <div><dt>Supply</dt><dd>Unlimited</dd></div>
                    </dl>
                    <div className="pack-card-actions">
                      {(() => { const b = paidLabel(it); return <button className="btn btn-sm btn-pink" disabled={!b.can || sending !== null} onClick={() => void get(it, false)}>{sending === it.id ? 'Confirm in your wallet…' : b.text}</button>; })()}
                      {(() => { const b = holderLabel(it); return <button className="btn btn-sm btn-holo" disabled={!b.can || sending !== null} onClick={() => void get(it, true)}>{sending === it.holderId ? 'Confirm in your wallet…' : b.text}</button>; })()}
                      <button className="btn btn-sm btn-ghost" onClick={() => tryItem(it)}>Try it</button>
                    </div>
                    {((held[it.id] ?? 0) > 0 || (held[it.holderId] ?? 0) > 0) && <p className="pack-card-note">You have {[(held[it.id] ?? 0) > 0 ? `${held[it.id]} paid` : '', (held[it.holderId] ?? 0) > 0 ? 'the holders’ edition' : ''].filter(Boolean).join(' and ')}.</p>}
                    {notes[it.key] && <p className="pack-card-note" aria-live="polite">{notes[it.key]}</p>}
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
            <p>Where it all comes from, and what each piece does on your pet.</p>
          </div>
          <article className="lore-card lore-intro">
            <h3>Emo</h3>
            <p>Short for <i>emotional hardcore</i>. It began in the mid-1980s in the punk scene of Washington, D.C., with bands that took hardcore’s speed and noise and sang about their feelings instead of politics. Twenty years later it was everywhere: side-swept fringes, black band tees over striped sleeves, skinny jeans, studded belts, checkered slip-ons, and a profile page that said exactly how you felt. Everyone said it was a phase. It was not a phase.</p>
          </article>
          <div className="lore-grid">
            <article className="lore-card">
              <h3>The beanie and the fringe</h3>
              <p>A black knit beanie pulled down to the brows, a fringe swept across one eye under it.</p>
              <p className="lore-game"><b>In Emogotchi</b> The beanie comes with the black emo hair. It is a head piece: one at a time with the kippah and the keffiyeh. A witch hat or a pumpkin goes over it. Crowned pets wear the crown on top.</p>
            </article>
            <article className="lore-card">
              <h3>The fit</h3>
              <p>Stripes under a band tee, a zip hoodie, skinny jeans, a studded belt, checkered slip-ons.</p>
              <p className="lore-game"><b>In Emogotchi</b> Cut for each pet: the cat’s stripes and slip-ons, the frok’s hoodie, Sahur’s tee, belt and jeans, Thiccums’ tee, the r3tard’s checkered slip-ons. An outfit, one at a time. Crowned, its trim turns gold.</p>
            </article>
            <article className="lore-card">
              <h3>Snakebites</h3>
              <p>The name for two piercings in the lower lip, one at each corner of the mouth: they look like the bite of a snake.</p>
              <p className="lore-game"><b>In Emogotchi</b> Every mouth your pet makes has its pair, measured to its own lip, and they follow the lip through a chew, a yawn or a scream. Gold when crowned.</p>
            </article>
            <article className="lore-card">
              <h3>The bedroom</h3>
              <p>Fairy lights, rain on the window, posters of a broken heart and a cassette, a lava lamp, a candle in a skull, and an old monitor with a profile page and its top eight friends.</p>
              <p className="lore-game"><b>In Emogotchi</b> A room theme, by day and by night, with its own tune. One room at a time.</p>
            </article>
            <article className="lore-card">
              <h3>The guitar</h3>
              <p>A black offset electric with a lavender pickguard. Four bars, four chords, and then you throw it.</p>
              <p className="lore-game"><b>In Emogotchi</b> Play brings it down from the sky. Your pet picks it up, plays the riff with a band behind it, and throws it off the stage. Sahur drops his bat to play; Thiccums plays it with his butt.</p>
            </article>
            <article className="lore-card">
              <h3>The mirror selfie</h3>
              <p>A pink flip phone, held up to the mirror: the angle, the pout, the flash.</p>
              <p className="lore-game"><b>In Emogotchi</b> Pet becomes the selfie: the phone falls in, three poses, a flash each, and the phone snaps shut and goes flying.</p>
            </article>
          </div>
          <div className="lore-numbers">
            <div className="lore-number">
              <strong>{EMO_HOLD.toLocaleString()}</strong>
              <div><h3>$EMO, and it is all yours</h3><p>Hold {EMO_HOLD.toLocaleString()} $EMO and claim all seven, free, one of each. Soulbound: they never leave your wallet.</p></div>
            </div>
            <div className="lore-number">
              <strong>{EMO_PRICE}</strong>
              <div><h3>MON an item, for everyone else</h3><p>Any wallet holding a pet can buy as many as it likes. 80% of every sale buys EMO and burns it.</p></div>
            </div>
            <div className="lore-number">
              <strong>8</strong>
              <div><h3>Friends on the monitor</h3><p>Look closely at the old monitor in the bedroom: a profile page, and the top eight.</p></div>
            </div>
          </div>
        </section>

        {/* ---- questions ---- */}
        <section className="pack-faq" aria-labelledby="pack-faq-h">
          <div className="pack-section-head"><h2 id="pack-faq-h">Questions</h2></div>
          <details><summary>How do I get the pack free?</summary><p>Hold at least {EMO_HOLD.toLocaleString()} $EMO in the wallet you play with, and claim each item once. You pay only the network fee.</p></details>
          <details><summary>What does soulbound mean?</summary><p>The holders’ edition cannot be sent or sold: it stays in the wallet that claimed it, for good.</p></details>
          <details><summary>What if I sell my $EMO later?</summary><p>Nothing changes. What you claimed is yours: it stays in your wallet and your pets keep wearing it.</p></details>
          <details><summary>Can I just buy it?</summary><p>Yes. {EMO_PRICE} MON an item, for any wallet holding a pet, as many as you like. The paid edition can be sent and traded, and 80% of what you pay buys EMO and burns it.</p></details>
          <details><summary>Which pets can wear it?</summary><p>Every pet: Emogotchi cats, inversebrahs, Tung Tung Tung Sahurs, Thiccums and r3tards, and any pet that comes later. One copy dresses every pet in your wallet.</p></details>
          <details><summary>Does it go with my other items?</summary><p>The beanie is a head piece, so it replaces a kippah or a keffiyeh. The fit is an outfit, so it replaces your pet’s other outfit while it is on. The wristbands and the lip piercings go with anything. The bedroom is a room. The guitar and the selfie change what Play and Pet do.</p></details>
          <details><summary>When can I get it?</summary><p>{live ? 'Now, here and in the shop.' : 'Soon. It will appear here and in the shop the moment it exists on chain.'}</p></details>
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}
