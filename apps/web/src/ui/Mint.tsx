import { cue } from '../sound/cue';
import { useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { ConnectModal } from './ConnectModal';
import { Icon } from './Icon';
import type { PropName } from '../scene/props';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import { chainCfg, chainClient } from '../game/chain';
import { EMPTY_WALLET, connectInjected, connectWalletConnect, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState } from '../wallet';
import { NFT_STATE_LABEL, type NftState } from './NftArt';
import type { Address, Collection } from '@emo-pets/chain';
import { PETS, hasPet, petHref } from '../pets';

/**
 * The mint page for a free pet: inversebrah at /mint (and /inversebrah, his link on chain) and Tung Tung Tung Sahur
 * at /tung. The pet on the live rig doing his own stunts on a loop, the offer (free, one per wallet), what is
 * different about him, and the mint button: connect, then one free transaction; a wallet that already has its one
 * is sent to him. Without the pet's address configured the button says "Coming soon".
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MintPet = Exclude<Collection, 'cat'>;
type Stunt = { icon: PropName; title: string; body: string };
type Copy = {
  eyebrow: string; h1: [string, string]; lede: string; cap: string;
  /** the showreel: the pet's own stunts with a walk between them, again and again, until the page goes away */
  reel: (d: Director) => (() => Promise<unknown>)[];
  stuntsAnchor: string; stuntsLink: string; stuntsTitle: string; stuntsSub: string; stunts: Stunt[];
  stuntsStep: string;
  items: { img: string; title: string; body: string }[];
  crownBody: string;
};
const COPY = {
  frok: {
    eyebrow: 'The second pet · Inversegotchi',
    h1: ['Meet inversebrah.', 'Mint him free.'],
    lede: 'A frok who lives in your wallet, on Monad. One per wallet, free, no cap, no allowlist. Feed him, wash him, play with him, put him to bed; screenshot him, slap him, squeeze him, set him on fire. All of it free. Everything about him, his picture included, lives on chain.',
    cap: 'Tap him. He can take it.',
    reel: (d) => [
      () => d.screenshot(),
      () => d.walk(380).then(() => d.slap()),
      () => d.walk(220).then(() => d.squeeze()),
      () => d.walk(300).then(() => d.burn()),
      () => d.walk(300).then(() => d.pet(1)),
    ],
    stuntsAnchor: 'abuse', stuntsLink: 'What you can do to him',
    stuntsTitle: 'Four ways to abuse him, counted on chain',
    stuntsSub: 'The cat gets fed, washed, played with and put to bed. So does he. And then there are the four things you can only do to inversebrah, each one recorded on his record forever and shown as a trait in your wallet.',
    stunts: [
      { icon: 'camera', title: 'Screenshot', body: 'He is known for it. A camera drops out of the sky; he catches it, lines up the shot, and the whole room flashes. Screenshotted, on chain.' },
      { icon: 'pow', title: 'Slap', body: 'A gloved hand slides in and slaps him across the face. He sees stars. The hand-print stays a while.' },
      { icon: 'clawjaw', title: 'Squeeze', body: 'A robot claw grips him by the waist and squeezes until his eyes pop. He springs back.' },
      { icon: 'fire', title: 'Burn', body: 'A match lands on his hem. He runs screaming, wall to wall, until a gush from the ceiling puts him out.' },
    ],
    stuntsStep: 'Abuse him. Screenshot, slap, squeeze, burn. Each one counts on his record.',
    items: [
      { img: '/brand/item-witch.png', title: 'The item shop works on him', body: 'Every item in the shop goes on any pet. The witch outfit and the Spooky room are ready for him on day one.' },
      { img: '/brand/item-emohair.png', title: 'A new item: emo hair', body: 'The cat was born with it; he was not. A black fringe swept over one eye, free for anyone holding a pet, one per wallet, 1,000 in all. Crowned, he wears it gold.' },
    ],
    crownBody: 'His own leaderboard: the 100 best kept inversebrahs, by their meters over the week, wear the crown live, in the wallet picture too.',
  },
  sahur: {
    eyebrow: 'The third pet · Tung Tung Tung Sahuragotchi',
    h1: ['Meet Tung Tung Tung Sahur.', 'Mint him free.'],
    lede: 'The number-one AI-made character, living in your wallet on Monad. One per wallet, free, no cap, no allowlist. Feed him, wash him, play with him, put him to bed, and let him do the one thing he does: tung tung tung. All of it free. Everything about him, his picture included, lives on chain.',
    cap: 'Tap him. Or wait for the knocking.',
    reel: (d) => [
      () => d.tung(),
      () => d.walk(400).then(() => d.pet(1)),
      () => d.walk(220).then(() => d.tung()),
      () => d.walk(300).then(() => d.yawn()),
    ],
    stuntsAnchor: 'tung', stuntsLink: 'The tung tung tung',
    stuntsTitle: 'One stunt, his own, counted on chain',
    stuntsSub: 'The cat gets fed, washed, played with and put to bed. So does he. And then there is the one thing only he does, recorded on his record forever and shown as a trait in your wallet.',
    stunts: [
      { icon: 'tung', title: 'Tung tung tung', body: 'Three knocks of the bat on the floor. The room jolts, the dust rises, and the count goes up by one, on chain, for as long as the token exists.' },
    ],
    stuntsStep: 'Tung tung tung. Three knocks, one transaction, gas only. Every one counts on his record.',
    items: [
      { img: '/brand/item-witch.png', title: 'The item shop works on him', body: 'Every item in the shop goes on any pet. The witch outfit, the pumpkin, the mummy wraps, the zombie, the emo hair and the Spooky room are all drawn on him.' },
      { img: '/brand/item-backrooms.png', title: 'A new room: the Backrooms', body: 'The yellow corridor, the hum, the carpet. A room theme for any pet, free, no limit. Give it to every pet in your wallet with one copy.' },
    ],
    crownBody: 'His own leaderboard: the 100 best kept Sahurs, by their meters over the week, wear the crown live, in the wallet picture too.',
  },
  // the fourth pet's page, only in a build with his switch on (DRAFT COPY: for the operator to approve before launch)
  ...(__THICCUMS__ ? { thiccums: {
    eyebrow: 'The fourth pet · Thiccumsgotchi',
    h1: ['Meet Thiccums.', 'Mint him free.'] as [string, string],
    lede: 'Thiccums the Seal, the $THICCUMS mascot, living in your wallet on Monad. One per wallet, free, no cap, no allowlist. Feed him, wash him, play with him, put him to bed, and bounce that butt. All of it free. Everything about him, his picture included, lives on chain.',
    cap: 'Tap him. Watch it bounce.',
    reel: (d: Director) => {
      const bounce = () => (d.own as { bounce?(): Promise<void> } | null)?.bounce?.() ?? Promise.resolve();
      return [
        bounce,
        () => d.walk(400).then(() => d.pet(1)),
        () => d.walk(220).then(bounce),
        () => d.walk(300).then(() => d.yawn()),
      ];
    },
    stuntsAnchor: 'bounce', stuntsLink: 'The butt bounce',
    stuntsTitle: 'One stunt, his own, counted on chain',
    stuntsSub: 'The cat gets fed, washed, played with and put to bed. So does he. And then there is the one thing only he does, recorded on his record forever and shown as a trait in your wallet.',
    stunts: [
      { icon: 'sparkle' as PropName, title: 'Butt bounce', body: 'Eight big bounces, the cheeks thrown about, the fin keeping time, and a sparkle of approval at the end. The count goes up by one, on chain, for as long as the token exists.' },
    ],
    stuntsStep: 'Bounce that butt. One transaction, gas only. Every bounce counts on his record.',
    items: [
      { img: '/brand/item-witch.png', title: 'The item shop works on him', body: 'Every item in the shop goes on any pet, and every one is drawn on him: the witch outfit, the pumpkin, the mummy wraps, the zombie, the emo hair and every room.' },
      { img: '/brand/item-keffiyeh.png', title: 'The packs too', body: 'The Jewish pack and the Habibi pack are drawn on him as well: the kippah, the keffiyeh, the bisht, the dreidel, the darbuka, the hen and the falcon.' },
    ],
    crownBody: 'His own leaderboard: the 100 best kept Thiccums, by their meters over the week, wear the crown live, in the wallet picture too.',
  } } : {}),
} as Record<MintPet, Copy>;

function showreel(d: Director, acts: (() => Promise<unknown>)[], alive: () => boolean) {
  d.wanderEnabled = false;
  const reel = async () => {
    let i = 0;
    while (alive()) {
      try { await acts[i % acts.length]!(); } catch { /* the stage may be torn down mid-action */ }
      i++;
      await wait(1400);
    }
  };
  void reel();
}

const PORTRAITS: NftState[] = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];

type Status = 'soon' | 'connect' | 'checking' | 'ready' | 'minted' | 'sending' | 'done';

/** The page's own wallet connection, like the claim page's: one for the page however many pets it mints. */
export function useMintWallet() {
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const connecting = useRef(false);
  useEffect(() => { void restore().then((w) => { if (w && !w.demo) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => ({ ...w, chainId }))), []);
  const connected = wallet.status === 'connected' && !!wallet.address;
  const wrongChain = connected && chainCfg !== null && wallet.chainId !== null && wallet.chainId !== chainCfg.chain.id;
  const doWalletConnect = async () => {
    if (connecting.current || !chainCfg) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try { setWallet(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl)); setModal(false); }
    catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doInjected = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) { try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); w.chainId = chainCfg.chain.id; } catch { /* asked again at mint */ } }
      setWallet(w); setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doDisconnect = () => { disconnect(); setWallet(EMPTY_WALLET); void revokeInjected(); };
  useEffect(() => { chainClient?.setSigner(connected && wallet.address ? { provider: getProvider() as never, address: wallet.address as Address } : null); }, [connected, wallet.address]);
  return { wallet, setWallet, modal, setModal, connected, wrongChain, doWalletConnect, doInjected, doDisconnect };
}
export type MintWallet = ReturnType<typeof useMintWallet>;

/** One pet's mint: has this wallet minted, how many exist (every 15 s), and the transaction. */
export function useMintPet(pet: MintPet, w: MintWallet, d: Director | null) {
  const live = hasPet(pet) && !!chainClient;
  const [hasMinted, setHasMinted] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>(live ? 'connect' : 'soon');
  const [error, setError] = useState<string | null>(null);
  const [mintedId, setMintedId] = useState<number | null>(null);
  const [minted, setMinted] = useState<number | null>(null);   // how many exist
  const { connected, wallet, wrongChain } = w;
  useEffect(() => { if (!connected) setHasMinted(null); }, [connected]);
  useEffect(() => {
    if (!live || !chainClient) return;
    const client = chainClient;
    let alive = true;
    const tick = async () => {
      try {
        const [t, m] = await Promise.all([client.totals(pet), connected && wallet.address ? client.hasMinted(wallet.address as Address, pet) : Promise.resolve(null)]);
        if (!alive) return;
        setMinted(t.totalSupply); setHasMinted(m);
      } catch { /* the next tick */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 15000);
    return () => { alive = false; clearInterval(id); };
  }, [live, connected, wallet.address, pet]);
  useEffect(() => {
    if (!live) return setStatus('soon');
    if (status === 'sending' || status === 'done') return;
    if (!connected) return setStatus('connect');
    if (hasMinted === null) return setStatus('checking');
    setStatus(hasMinted ? 'minted' : 'ready');
  }, [live, connected, hasMinted, status]);
  const mint = async () => {
    if (!chainClient || !wallet.address) return;
    setStatus('sending'); setError(null);
    cue('tx.ask');
    try {
      if (wrongChain && chainCfg) await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer);
      await chainClient.mint(pet);
      const mine = await chainClient.catsOf(wallet.address as Address, pet);
      setMintedId(mine.length ? Math.max(...mine.map((c) => c.id)) : null);
      setHasMinted(true);
      setStatus('done');
      cue('mint');
      void d?.pet(1);
    } catch (e) {
      cue('tx.fail');
      setError((e as Error).message);
      setStatus('ready');
    }
  };
  return { live, status, error, mintedId, minted, mint };
}
export type MintPetState = ReturnType<typeof useMintPet>;

/** The mint button in every state it has, for one pet (this page and the Adopt page's cards). */
export function MintButton({ pet, m, w }: { pet: MintPet; m: MintPetState; w: MintWallet }) {
  const P = PETS[pet];
  switch (m.status) {
    case 'soon': return <button className="btn btn-pink btn-lg mint-btn" disabled aria-disabled="true">Coming soon</button>;
    case 'connect': return <button className="btn btn-pink btn-lg mint-btn" onClick={() => w.setModal(true)} disabled={w.wallet.status === 'connecting'}>{w.wallet.status === 'connecting' ? 'Connecting…' : 'Connect and mint'}</button>;
    case 'checking': return <button className="btn btn-pink btn-lg mint-btn" disabled>Looking in your wallet…</button>;
    case 'ready': return <button className="btn btn-pink btn-lg mint-btn" onClick={() => void m.mint()}>Mint {P.one} · free</button>;
    case 'sending': return <button className="btn btn-pink btn-lg mint-btn" disabled>{w.wallet.kind === 'passkey' ? 'Minting…' : 'Minting · confirm in your wallet…'}</button>;
    case 'done': return <a className="btn btn-pink btn-lg mint-btn" href={m.mintedId ? petHref(pet, m.mintedId) : '/'}>He's yours{m.mintedId ? ` · #${m.mintedId}` : ''} → take care of him</a>;
    case 'minted': return <a className="btn btn-pink btn-lg mint-btn" href="/">You have yours already → go see him</a>;
  }
}
export const noteFor = (m: MintPetState) => m.status === 'soon' ? 'Free to mint · one per wallet · every action free · naming him is 10 MON and 80% of it buys EMO and burns it.'
  : m.status === 'minted' ? 'One per wallet, forever. Yours is waiting on the home page.'
  : `Free to mint · one per wallet · every action free${m.minted !== null ? ` · ${m.minted.toLocaleString()} minted so far` : ''}.`;

/** One pet's mint page: /mint for inversebrah, /tung for Sahur (his contractURI link too). Two pages, not one, so each has its own link card. */
export function Mint({ pet = 'frok' }: { pet?: MintPet }) {
  const P = PETS[pet]; const C = COPY[pet];
  const [d, setD] = useState<Director | null>(null);
  const w = useMintWallet();
  const m = useMintPet(pet, w, d);
  const { wallet, modal, setModal, doInjected, doWalletConnect, doDisconnect, setWallet } = w;
  const { status, error } = m;
  useEffect(() => {
    if (!d) return;
    let on = true;
    showreel(d, C.reel(d), () => on);
    return () => { on = false; };
  }, [d, C]);
  const button = <MintButton pet={pet} m={m} w={w} />;
  const note = noteFor(m);
  return (
    <div className="page">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="landing mint" data-pet={pet}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><Icon name="heart" size={14} /> {C.eyebrow}</p>
            <h1>{C.h1[0]}<br /><span className="grad">{C.h1[1]}</span></h1>
            <p className="lede">{C.lede}</p>
            <div className="cta-row">
              {button}
              <a className="btn btn-ghost btn-lg" href={`#${C.stuntsAnchor}`}>{C.stuntsLink}</a>
            </div>
            <p className="fine">{note}</p>
            {error && <p className="fine mint-error">{error}</p>}
          </div>
          <div className="hero-stage">
            <div className="shell"><Stage quiet onDirector={setD} night={false} thought={null} character={P.character} scene={pet === 'sahur' ? 'backrooms' : undefined} /></div>
            <p className="hero-cap">{C.cap}</p>
          </div>
        </section>

        <section className="features" aria-label="The offer">
          <div className="feature">
            <span className="feature-ico"><Icon name="heart" size={40} /></span>
            <h3>Free. All of it.</h3>
            <p>The mint is free and so is every bit of care, every stunt, and even bringing him back from the dead. Gas is all you ever pay. One {P.one} per wallet, forever.</p>
          </div>
          <div className="feature">
            <span className="feature-ico"><Icon name="flame" size={40} /></span>
            <h3>Naming him burns EMO</h3>
            <p>The one thing that costs anything: a name is 10 MON, and 80% of it buys EMO and burns it on the spot. The name lives on chain and shows in every wallet and marketplace.</p>
          </div>
          <div className="feature">
            <span className="feature-ico"><Icon name="grave" size={40} /></span>
            <h3>Same rules as the cat</h3>
            <p>Four meters, a poop every meal, naps, a crown for the best kept, and death after two days without food. His picture in your wallet changes with his mood. Streaks are recorded on chain.</p>
          </div>
        </section>

        <section className="how" id={C.stuntsAnchor} aria-label="His stunts">
          <h2>{C.stuntsTitle}</h2>
          <p className="mint-sub">{C.stuntsSub}</p>
          <div className={`stunts ${C.stunts.length === 1 ? 'stunts-one' : ''}`}>
            {C.stunts.map((s) => (
              <div className="stunt" key={s.title}>
                <span className="feature-ico"><Icon name={s.icon} size={34} className={s.icon === 'clawjaw' || s.icon === 'tung' ? 'is-wide' : ''} /></span>
                <div><h3>{s.title}</h3><p>{s.body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="mint-moods" aria-label="His moods">
          <h2>Nine moods, one picture each, on chain</h2>
          <p className="mint-sub">The contract picks his wallet picture from his live state. Keep him well and he wears the crown.</p>
          <div className="mood-strip">
            {PORTRAITS.map((m) => (
              <figure key={m}><img src={`/nft/${P.portraits}${m}${m === 'happy' ? '-crown' : ''}-1024.png`} alt={NFT_STATE_LABEL[m]} loading="lazy" /><figcaption>{NFT_STATE_LABEL[m]}</figcaption></figure>
            ))}
          </div>
        </section>

        <section className="features" aria-label="Items">
          {C.items.map((it) => (
            <div className="feature" key={it.title}>
              <span className="feature-ico"><img src={it.img} alt="" /></span>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </div>
          ))}
          <div className="feature">
            <span className="feature-ico"><Icon name="coin" size={40} /></span>
            <h3>His own crown</h3>
            <p>{C.crownBody}</p>
          </div>
        </section>

        <section className="how" aria-label="How it works">
          <h2>How it works</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><div><b>Connect and mint.</b> One tap, one transaction, gas only. He arrives fresh with a week before his clock starts.</div></li>
            <li><span className="step-n">2</span><div><b>Take care of him.</b> Food, clean, fun, energy. He tells you what he needs, and it never costs a thing.</div></li>
            <li><span className="step-n">3</span><div><b>{C.stuntsStep.split('. ')[0]}.</b> {C.stuntsStep.split('. ').slice(1).join('. ')}</div></li>
            <li><span className="step-n">4</span><div><b>Name him for 10 MON.</b> The only paid act, and 80% of it burns EMO.</div></li>
            <li><span className="step-n">5</span><div><b>Keep him alive.</b> Only hunger kills. If he dies, the revive is free, but the death stays on his record.</div></li>
            <li><span className="step-n">6</span><div><b>Dress him up.</b> Every item in the shop fits him{pet === 'frok' ? '. The emo hair is his first.' : pet === 'sahur' ? ', and the Backrooms is his room.' : __THICCUMS__ ? ', the packs too: every one is drawn on him.' : ''}</div></li>
          </ol>
        </section>

        <section className="mint-cta">
          <h2>{status === 'soon' ? 'Minting opens soon.' : 'Minting is open.'}</h2>
          <p className="mint-sub">{status === 'soon' ? 'Follow Emonad for the moment it goes live. Free, one per wallet, no allowlist: everyone gets one.' : 'Free, one per wallet, no allowlist: everyone gets one. Gas is all you pay.'}</p>
          {button}
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
    </div>
  );
}
