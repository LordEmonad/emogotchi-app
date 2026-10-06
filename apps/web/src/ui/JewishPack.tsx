/**
 * The Jewish pack's page, at /shop/jewish (in the Item shop tab): the five items, a live room to try them on, and the
 * lore, plainly. The items and their terms come from `JEWISH_PACK` in items.ts (planned shop ids 8-12, 36 MON, 613 of
 * each); until it says `created`, nothing here is a transaction and every claim button says "Coming soon". Once they
 * exist, the claims happen in the shop's own cards (/shop#shop-jewish), which already know the claim and wear rules.
 *
 * The copy is the operator's to approve: plain and accurate, no em dashes, nothing that says more than 80% burns.
 */
import { useEffect, useRef, useState } from 'react';
import type { Address, ItemView } from '@emo-pets/chain';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { ConnectModal } from './ConnectModal';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import type { Costume, Drawing } from '../pet/Pet';
import { JEWISH_PACK, packCreated, priceLabel, type PackItem } from '../items';
import { PETS, hasPet, PET_ORDER } from '../pets';
import { chainCfg, chainClient } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';
import './shop.css';

const PACK = JEWISH_PACK;
const priceOf = (it: PackItem) => (it.priceMon === null ? 'Price to be announced' : `${it.priceMon} MON`);

/** What each item does on a pet, in a line (the lore below says what it is). */
const DOES: Record<string, string> = {
  kippah: 'A kippah on your pet’s head, with payot, the side curls. Goes with any outfit.',
  starofdavid: 'A Star of David on a chain round your pet’s neck. Goes with any outfit.',
  kotel: 'A room theme: your pet lives on the plaza at the Western Wall, prayer notes in the stones and doves overhead.',
  dreidel: 'Play spins a dreidel instead of the ball of yarn. It lands on a letter, and your pet reacts to it.',
  kapparot: 'Pet becomes kapparot: your pet circles the hen over its head three times, then she flies off.',
};

/** The pets the live room can show (the pack is for every pet, now or later). */
const PET_CHOICES = PET_ORDER.filter((c) => hasPet(c)).map((c) => ({ col: c, character: PETS[c].character as Drawing, label: PETS[c].brand }));

export function JewishPack() {
  // ---- the wallet, only so the header shows it (nothing here asks it to sign until the pack exists)
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const connecting = useRef(false);
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
  const connected = wallet.status === 'connected' && !!wallet.address;
  // live once the shop holds all five at their ids under their names: read from the contract, so the page turns from
  // "Coming soon" to "Get it in the shop" by itself the moment the create script has run
  const [catalogue, setCatalogue] = useState<ItemView[] | null>(null);
  const loadCatalogue = () => { void chainClient?.items().then(setCatalogue).catch(() => {}); };
  useEffect(() => {
    if (!chainClient || !chainCfg?.items) return;
    loadCatalogue();
    const id = setInterval(loadCatalogue, 30_000);   // how many are left moves as people buy
    return () => clearInterval(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = packCreated(new Map((catalogue ?? []).map((it) => [it.id, it.name])));
  const onChain = (id: number) => catalogue?.find((it) => it.id === id) ?? null;
  useEffect(() => { chainClient?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [connected, wallet.address]);
  // buying here: the shop's own claim (no gate, no limit), one copy a press; then how many you hold
  const [held, setHeld] = useState<Record<number, number>>({});
  const loadHeld = () => { if (chainClient && connected && wallet.address) void chainClient.holdings(wallet.address as Address).then(setHeld).catch(() => {}); else setHeld({}); };
  useEffect(loadHeld, [connected, wallet.address]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [buying, setBuying] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const buy = async (it: PackItem) => {
    const item = onChain(it.id);
    if (!chainClient || !item || buying !== null) return;
    if (!connected) { setModal(true); return; }
    setBuying(it.id); setNotes((n) => ({ ...n, [it.id]: '' }));
    try {
      if (chainCfg && wallet.chainId !== chainCfg.chain.id) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      await chainClient.claimItem(it.id, 1, '0x', item.price);
      setNotes((n) => ({ ...n, [it.id]: 'Yours. Put it on from your pet’s page, or give it to any of your pets in the shop.' }));
      loadHeld(); loadCatalogue();
      // and again a moment later: right after a receipt, a read can reach an RPC node a block behind
      setTimeout(() => { loadHeld(); loadCatalogue(); }, 3000);
    } catch (e) { setNotes((n) => ({ ...n, [it.id]: (e as Error).message })); }
    finally { setBuying(null); }
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
  const [kippah, setKippah] = useState(true);
  const [star, setStar] = useState(true);
  const [wall, setWall] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { d?.setCostumes([...(kippah ? ['kippah' as Costume] : []), ...(star ? ['starofdavid' as Costume] : [])]); }, [d, kippah, star]);
  useEffect(() => { if (!d) return; d.setToy('dreidel'); d.setPetMove('kapparot'); }, [d]);
  const run = async (label: string, fn: (d: Director) => Promise<unknown>) => {
    if (!d || busy) return;
    setBusy(label);
    try { await fn(d); } catch { /* a preview: nothing to report */ } finally { setBusy(null); }
  };
  const spin = () => void run('dreidel', (dd) => dd.play());
  const swing = () => void run('kapparot', (dd) => dd.pet(1));
  /** "Try it" on an item card: put it on in the room above and bring the room into view. */
  const tryItem = (it: PackItem) => {
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const e = it.effect;
    if (e.kind === 'wear') { if (e.costume === 'kippah') setKippah(true); else setStar(true); }
    else if (e.kind === 'room') setWall(true);
    else if (e.kind === 'toy') setTimeout(spin, 450);
    else setTimeout(swing, 450);
  };

  const status = live ? 'Live' : 'Coming soon';

  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="pack">
        <nav className="pack-crumbs" aria-label="Breadcrumb"><a href="/shop">Item shop</a><span aria-hidden>/</span><span>The Jewish pack</span></nav>

        {/* ---- hero ---- */}
        <section className="pack-hero">
          <div className="pack-hero-copy">
            <span className="pack-eyebrow">New pack <b>{status}</b></span>
            <h1>The Jewish pack</h1>
            <p className="pack-lead">Five items for every pet: a kippah with payot, a Star of David, the Western Wall, a dreidel and the kapparot hen. Each one is drawn into your pet and plays out in its room.</p>
            <div className="pack-facts">
              <div className="pack-fact"><strong>36 MON</strong><span>each · double chai</span></div>
              <div className="pack-fact"><strong>613</strong><span>of each · the commandments</span></div>
              <div className="pack-fact"><strong>Every pet</strong><span>now or later</span></div>
            </div>
            <div className="pack-ctas">
              <a className="btn btn-pink" href="#pack-items">See the items</a>
              <a className="btn btn-ghost" href="#pack-lore">What it all means</a>
            </div>
          </div>
          <figure className="pack-hero-art">
            <img src="/brand/jewish-pack.png" alt="The cat, the frok, Sahur and a seal at the Western Wall, in kippahs with payot and Stars of David, a dreidel spinning and a hen flapping overhead" />
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
              <div className="shell"><Stage key={pet} onDirector={setD} night={false} thought={null} scene={wall ? 'kotel' : null} character={pet} /></div>
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
                  <button className={`chip-btn ${kippah ? 'is-on' : ''}`} onClick={() => setKippah((v) => !v)}>Kippah</button>
                  <button className={`chip-btn ${star ? 'is-on' : ''}`} onClick={() => setStar((v) => !v)}>Star of David</button>
                  <button className={`chip-btn ${wall ? 'is-on' : ''}`} onClick={() => setWall((v) => !v)}>Western Wall</button>
                </div>
              </div>
              <div className="pack-control-group">
                <span className="pack-control-label">Play</span>
                <div className="pack-chips">
                  <button className={`btn btn-sm ${busy === 'dreidel' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={spin}>{busy === 'dreidel' ? 'Spinning…' : 'Spin the dreidel'}</button>
                  <button className={`btn btn-sm ${busy === 'kapparot' ? 'btn-pink' : 'btn-ghost'}`} disabled={!d || !!busy} onClick={swing}>{busy === 'kapparot' ? 'Kapparot…' : 'Kapparot'}</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- the items ---- */}
        <section id="pack-items" className="pack-items" aria-labelledby="pack-items-h">
          <div className="pack-section-head">
            <h2 id="pack-items-h">The items</h2>
            <p>Each item is its own token. One copy dresses every pet in your wallet, and every item goes on any pet, now or later.</p>
          </div>
          <div className="pack-grid">
            {PACK.items.map((it) => (
              <article key={it.key} className="pack-card">
                <div className="pack-card-art"><img src={it.card} alt="" loading="lazy" /></div>
                <div className="pack-card-body">
                  <h3>{it.label}</h3>
                  <p>{DOES[it.key] ?? ''}</p>
                  {(() => {
                    const item = live ? onChain(it.id) : null;
                    const left = item ? Math.max(0, item.maxSupply - item.minted) : null;
                    const soldOut = left === 0;
                    const mine = held[it.id] ?? 0;
                    return (<>
                      <dl className="pack-card-facts">
                        <div><dt>Price</dt><dd className="tnum">{item ? priceLabel(item.price) : priceOf(it)}</dd></div>
                        <div><dt>{item ? 'Left' : 'Supply'}</dt><dd className="tnum">{item ? `${left!.toLocaleString()} of ${item.maxSupply.toLocaleString()}` : it.supply.toLocaleString()}</dd></div>
                      </dl>
                      <div className="pack-card-actions">
                        {!item ? <button className="btn btn-sm btn-pink" disabled>Coming soon</button>
                          : soldOut ? <button className="btn btn-sm btn-pink" disabled>Sold out</button>
                          : <button className="btn btn-sm btn-pink" disabled={buying !== null} onClick={() => void buy(it)}>
                              {buying === it.id ? 'Confirm in your wallet…' : connected ? `Buy · ${priceLabel(item.price)}` : 'Connect to buy'}
                            </button>}
                        <button className="btn btn-sm btn-ghost" onClick={() => tryItem(it)}>Try it</button>
                      </div>
                      {mine > 0 && <p className="pack-card-note">You have {mine}.</p>}
                      {notes[it.id] && <p className="pack-card-note" aria-live="polite">{notes[it.id]}</p>}
                    </>);
                  })()}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---- the lore ---- */}
        <section id="pack-lore" className="pack-lore" aria-labelledby="pack-lore-h">
          <div className="pack-section-head">
            <h2 id="pack-lore-h">What it all means</h2>
            <p>The traditions behind each item, and the numbers behind the price and the supply.</p>
          </div>

          <div className="lore-grid">
            <article className="lore-card">
              <img className="lore-art" src="/brand/item-kippah.png" alt="" loading="lazy" />
              <h3>Kippah <span lang="he" dir="rtl">כִּפָּה</span></h3>
              <p>A small cap, also called a yarmulke, worn by many Jewish men and some women as a sign of respect for God above. Some wear one all day, others to pray and to study.</p>
              <h4>Payot <span lang="he" dir="rtl">פֵּאוֹת</span></h4>
              <p>Side curls. The custom comes from Leviticus 19:27: “You shall not round the corners of your heads.” Hasidic and Yemenite Jews often grow them long and curled.</p>
              <p className="lore-game"><b>In Emogotchi</b> Your pet wears the kippah with payot, with any outfit. A witch hat or a pumpkin goes over the kippah.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-starofdavid.png" alt="" loading="lazy" />
              <h3>Star of David <span lang="he" dir="rtl">מָגֵן דָּוִד</span></h3>
              <p>The Magen David, “shield of David”: two triangles woven into one six-pointed star. It has marked Jewish communities for centuries, and since the 1800s it has been the best known symbol of the Jewish people. It sits at the centre of Israel’s flag, between two blue stripes that recall the stripes of the tallit, the prayer shawl.</p>
              <p className="lore-game"><b>In Emogotchi</b> Worn on a chain, with any outfit. Crowned pets wear it in gold.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-kotel.png" alt="" loading="lazy" />
              <h3>The Western Wall <span lang="he" dir="rtl">הַכֹּתֶל</span></h3>
              <p>The Kotel, in Jerusalem, is a stretch of the retaining wall Herod the Great built around the Temple Mount about 2,000 years ago, and the holiest place where Jews can pray today. The lowest rows are Herod’s: huge stones with smooth borders round their faces.</p>
              <p>People write prayers on slips of paper, <i>kvitlach</i>, and tuck them into the cracks. Twice a year they are gathered and buried on the Mount of Olives. Caper bushes grow out of the stones, and doves nest in them.</p>
              <p className="lore-game"><b>In Emogotchi</b> A room theme. Your pet’s room becomes the plaza at the Wall, notes, capers, doves and all. One room at a time.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-dreidel.png" alt="" loading="lazy" />
              <h3>Dreidel <span lang="he" dir="rtl">סְבִיבוֹן</span></h3>
              <p>The spinning top of Hanukkah. Its four letters stand for <i>Nes Gadol Haya Sham</i>, “a great miracle happened there”. In Israel the last letter is pe (<bdi lang="he">פ</bdi>), for <i>Po</i>: “happened here”.</p>
              <p>The game: everyone puts a coin in the pot, then takes turns to spin. Where it lands says what you do. The coins are <i>gelt</i>, often chocolate in gold foil.</p>
              <table className="dreidel-rules">
                <tbody>
                  <tr><td className="he" lang="he">נ</td><th>Nun</th><td><i>nisht</i></td><td>Nothing happens</td></tr>
                  <tr><td className="he" lang="he">ג</td><th>Gimel</th><td><i>gantz</i></td><td>Take the whole pot</td></tr>
                  <tr><td className="he" lang="he">ה</td><th>Hei</th><td><i>halb</i></td><td>Take half</td></tr>
                  <tr><td className="he" lang="he">ש</td><th>Shin</th><td><i>shtel</i></td><td>Put one in</td></tr>
                </tbody>
              </table>
              <p className="lore-game"><b>In Emogotchi</b> Play spins the dreidel instead of the ball of yarn. Your pet reacts to the letter: a shower of gelt for gimel, a sigh for shin.</p>
            </article>

            <article className="lore-card">
              <img className="lore-art" src="/brand/item-kapparot.png" alt="" loading="lazy" />
              <h3>Kapparot <span lang="he" dir="rtl">כַּפָּרוֹת</span></h3>
              <p>A custom before Yom Kippur, the Day of Atonement. A chicken, or a bundle of coins, is circled over the head three times with a short prayer, then given to the poor. It is a way of asking for atonement before the holiday. Many people today use money instead, and give it to charity.</p>
              <p className="lore-game"><b>In Emogotchi</b> Pet becomes kapparot: your pet circles the hen over its head three times, and she flies away. A tap on your pet is still a quick pet.</p>
            </article>
          </div>

          {/* the numbers */}
          <div className="lore-numbers">
            <div className="lore-number">
              <strong>18</strong>
              <div>
                <h3>Chai <span lang="he" dir="rtl">חַי</span></h3>
                <p>In Hebrew every letter is also a number. <i>Chai</i>, “life”, is spelled with two letters: chet (<bdi lang="he">ח</bdi>) is 8 and yud (<bdi lang="he">י</bdi>) is 10, which make 18. So gifts are often given in multiples of 18.</p>
              </div>
            </div>
            <div className="lore-number">
              <strong>36</strong>
              <div>
                <h3>Double chai</h3>
                <p>Two times life: the price of each item, in MON. Tradition also tells of 36 hidden righteous people in every generation.</p>
              </div>
            </div>
            <div className="lore-number">
              <strong>613</strong>
              <div>
                <h3>The commandments</h3>
                <p>The mitzvot of the Torah, as tradition counts them: 248 things to do and 365 not to do. There are 613 of each item, and never more.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- questions ---- */}
        <section className="pack-faq" aria-labelledby="pack-faq-h">
          <div className="pack-section-head"><h2 id="pack-faq-h">Questions</h2></div>
          <details><summary>Which pets can wear them?</summary><p>Every pet: Emogotchi cats, inversebrahs and Tung Tung Tung Sahurs, and any pet that comes later. One copy dresses every pet in your wallet.</p></details>
          <details><summary>Do they go with my other items?</summary><p>The kippah and the Star of David go with any outfit. The Western Wall is a room, so it replaces your pet’s other room while it is on. The dreidel and the hen change what Play and Pet do.</p></details>
          <details><summary>Where does the MON go?</summary><p>Paid items feed the same fire as everything else: 80% buys EMO and burns it.</p></details>
          <details><summary>When can I get them?</summary><p>{live ? 'Now, in the shop.' : 'Soon. They will appear here and in the shop the moment they exist on chain.'}</p></details>
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}
