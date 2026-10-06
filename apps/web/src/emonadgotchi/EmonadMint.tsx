/**
 * Emonadgotchi's mint page, /emonadgotchi. A dev build always routes here; a production build only once his switch is on
 * (__EMONAD__: his contract address), so nothing of him reaches the site before he is announced. It mints for real once
 * the build knows his contract (ui/Mint.tsx's own hook, the one every free pet's page and Get a pet use); until then the
 * button says "Coming soon". In a dev build with no contract a dashed strip at the top also shows the page with minting
 * open and after a mint (PREVIEW: nothing is sent anywhere); a production build never has the strip.
 *
 * The look is his trailer's (tools/trailer/compose.js, the emo cut, and eg-timeline.mjs): black and plum night with a
 * hot pink glow, a checkered floor going away, grain and scanlines; heavy caps with a hard pink print offset (the zine);
 * lines in a marker hand (Gloria Hallelujah); prints of his room on white paper with pink tape; stickers; a glitch on the
 * big word; his face in a pink ring on the last card. The stage is the real one playing his showreel (reel.ts), in his
 * emo bedroom at night first. Every word is DRAFT copy for the operator; the terms are the free pets' (free, no cap, one
 * per wallet, every action free, a name 10 MON with 80% of it buying EMO and burning it). He has no stunt.
 *
 * Pictures: tools/eg-mint-art.mjs -> ./mint/*.webp (the moods and looks from his card view, the prints from the trailer's
 * own takes, his face for the ring).
 */
import './register';
import './mint.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Header } from '../ui/Header';
import { SiteFooter } from '../ui/SiteFooter';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import type { SceneName } from '../scene/Scenery';
import type { Costume } from '../pet/Pet';
import { ConnectModal } from '../ui/ConnectModal';
import { useMintPet, useMintWallet } from '../ui/Mint';
import { petHref } from '../pets';
import { NFT_STATE_LABEL, type NftState } from '../ui/NftArt';
import { REEL, act, wait, type Beat } from './reel';

const PICS = import.meta.glob('./mint/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const pic = (name: string) => PICS[`./mint/${name}.webp`] ?? '';
/** the dashed strip and the open / after-a-mint states: a dev build only */
const PREVIEW = import.meta.env.DEV;

const MOODS: NftState[] = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
const LOOKS: { k: string; label: string; gold?: boolean }[] = [
  { k: 'witch', label: 'Witch' }, { k: 'pumpkin', label: 'Pumpkin' }, { k: 'mummy', label: 'Mummy' }, { k: 'zombie', label: 'Zombie' },
  { k: 'emofit', label: 'Emo fit' }, { k: 'kippah', label: 'Kippah + star' }, { k: 'habibi', label: 'Bisht + keffiyeh' }, { k: 'gold', label: 'In gold', gold: true },
];
const CARE: { k: string; title: string; hand: string }[] = [
  { k: 'feed', title: 'Feed him.', hand: 'food, back to full.' },
  { k: 'play', title: 'Play with him.', hand: 'fun, back to full.' },
  { k: 'wash', title: 'Wash him.', hand: 'clean, back to full.' },
  { k: 'sleep', title: 'Put him to bed.', hand: 'energy, refilled in his sleep.' },
];
const ITEMS: { k: string; title: string; hand: string }[] = [
  { k: 'guitar', title: 'The guitar', hand: 'it falls from the sky. he picks it up.' },
  { k: 'darbuka', title: 'The darbuka', hand: 'he plays it.' },
  { k: 'falcon', title: 'The falcon', hand: 'it lands on his fist.' },
  { k: 'selfie', title: 'The selfie', hand: "say cheese. don't smile." },
];
/** his showreel, with a first beat in his own emo bedroom at night */
const EMOROOM = 'emoroom' as SceneName;
const SHOW: Beat[] = [{ scene: EMOROOM, night: true, acts: ['Pet', 'Walk left', 'Walk right'] }, ...REEL];
const BAND1 = ['Feed him', 'Play with him', 'Wash him', 'Put him to bed', "Don't let him die", 'Free mint', 'One per wallet'];
const BAND2 = ['The face of $EMO', 'On chain', 'Fit check', 'Name him, burn EMO', 'Never let him starve', 'Emonadgotchi'];
type Fake = 'soon' | 'open' | 'sending' | 'done';

/** a print of his room on white paper, pink tape across the top, a little turned */
function Print({ src, alt, tilt = 0, className = '', children }: { src?: string; alt?: string; tilt?: number; className?: string; children?: ReactNode }) {
  return (
    <figure className={`egm-print ${className}`} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <span className="egm-tape" aria-hidden="true" />
      {src ? <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" /> : children}
    </figure>
  );
}
/** heavy caps with the hard pink print offset; `slam`: it lands as it comes into view */
function Zine({ as: Tag = 'h2', children, className = '' }: { as?: 'h1' | 'h2' | 'h3' | 'p'; children: ReactNode; className?: string }) {
  return <Tag className={`egm-zine ${className}`} data-slam="">{children}</Tag>;
}
/** a heart broken down the middle (the trailer's) */
function BrokenHeart({ className = '' }: { className?: string }) {
  const heart = 'M12 21.2l-1.3-1.2C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.5 2.8c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1C19.6 2.8 22 5.2 22 8.3c0 3.8-3.4 6.9-8.7 11.7L12 21.2z';
  const crack = '12,4.9 10.4,8.6 13.2,11.4 10.8,14.8 12.6,17.6 12,21.2';
  return (
    <svg className={`egm-heart ${className}`} viewBox="-2 -1 28 25" aria-hidden="true">
      <defs>
        <linearGradient id="egmhg" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#FF78B4" /><stop offset="1" stopColor="#FF2E88" /></linearGradient>
        <clipPath id="egmhl"><polygon points={`-1,-1 12,-1 ${crack} 12,25 -1,25`} /></clipPath>
        <clipPath id="egmhr"><polygon points={`25,-1 12,-1 ${crack} 12,25 25,25`} /></clipPath>
      </defs>
      <g className="egm-heart-l" clipPath="url(#egmhl)"><path d={heart} fill="url(#egmhg)" stroke="#0B0610" strokeWidth="1.3" /></g>
      <g className="egm-heart-r" clipPath="url(#egmhr)"><path d={heart} fill="url(#egmhg)" stroke="#0B0610" strokeWidth="1.3" /></g>
    </svg>
  );
}

export function EmonadMint() {
  const [d, setD] = useState<Director | null>(null);
  const [scene, setScene] = useState<SceneName | null>(EMOROOM);
  const [night, setNight] = useState(true);
  const [fake, setFake] = useState<Fake | null>(null);   // the dev preview's pretend state (never set in a production build)
  const dRef = useRef<Director | null>(null); dRef.current = d;
  const root = useRef<HTMLDivElement>(null);
  const w = useMintWallet();
  const m = useMintPet('emonad', w, d);
  const preview = PREVIEW && !m.live;
  /** what the button shows: the chain's word, or (dev, no contract) the preview strip's */
  const state = preview && fake ? ({ soon: 'soon', open: 'ready', sending: 'sending', done: 'done' } as const)[fake] : m.status;

  // the page's own night, on the body (behind the header too)
  useEffect(() => {
    document.body.classList.add('egm-body');
    // the scrollbar's width, so the full-width strips of tape are the screen's width exactly (mint.css .egm-bands)
    const sb = () => root.current?.style.setProperty('--egm-sbw', `${Math.max(0, window.innerWidth - document.documentElement.clientWidth)}px`);
    sb(); window.addEventListener('resize', sb);
    return () => { document.body.classList.remove('egm-body'); window.removeEventListener('resize', sb); };
  }, []);

  // the zine headings land as they come into view (none of it with reduced motion: they are simply there)
  useEffect(() => {
    const el = root.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('egm-js');
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -12% 0px' });
    for (const t of el.querySelectorAll('[data-slam]')) io.observe(t);
    return () => io.disconnect();
  }, []);

  // the stage: his showreel, round and round
  useEffect(() => {
    if (!d) return;
    let on = true;
    d.wanderEnabled = false;
    const dress = (b: Beat) => {
      const worn: Costume[] = [...(b.outfit ? [b.outfit] : []), ...(b.head ? [b.head as Costume] : []), ...(b.star ? ['starofdavid' as Costume] : []), ...(b.lip ? ['piercings' as Costume] : [])];
      d.setCostumes(worn); d.setCrown(!!b.crown); d.setToy(b.toy ?? 'yarn'); d.setPetMove(b.pet ?? 'pet');
      setScene(b.scene ?? null); setNight(!!b.night);
    };
    void (async () => {
      for (let i = 0; on; i = (i + 1) % SHOW.length) {
        const b = SHOW[i]!;
        dress(b);
        await wait(900);
        for (const name of b.acts) {
          if (!on) break;
          try { await act(d, name); } catch { /* the stage may be torn down mid-action */ }
          await wait(450);
        }
      }
    })();
    return () => { on = false; };
  }, [d]);

  const pretend = async () => { setFake('sending'); await wait(1300); setFake('done'); void dRef.current?.pet(1); };
  const button = (big = false) => {
    const cls = `egm-btn egm-mint${big ? ' is-big' : ''}`;
    switch (state) {
      case 'soon': return <button className={`${cls} is-soon`} disabled aria-disabled="true">Coming soon</button>;
      case 'connect': return <button className={cls} onClick={() => w.setModal(true)} disabled={w.wallet.status === 'connecting'}>{w.wallet.status === 'connecting' ? 'Connecting…' : 'Connect and mint'}</button>;
      case 'checking': return <button className={cls} disabled>Looking in your wallet…</button>;
      case 'ready': return <button className={cls} onClick={() => void (preview && fake ? pretend() : m.mint())}>Mint Emonad · free</button>;
      case 'sending': return <button className={cls} disabled>{w.wallet.kind === 'passkey' ? 'Minting…' : 'Minting · confirm in your wallet…'}</button>;
      case 'done': return <a className={cls} href={m.mintedId ? petHref('emonad', m.mintedId) : '/'}>He's yours{m.mintedId ? ` · #${m.mintedId}` : ''} → feed him</a>;
      case 'minted': return <a className={cls} href="/">You have yours already → go see him</a>;
    }
  };
  const note = state === 'done' || state === 'minted' ? 'One per wallet, forever. Do not let him starve.'
    : 'Free to mint · no cap · one per wallet · every action free · naming him is 10 MON and 80% of it buys EMO and burns it.';
  const open = state !== 'soon';

  return (
    <div className="page egm" ref={root}>
      <div className="egm-night" aria-hidden="true"><div className="egm-floor"><i /></div></div>
      <Header wallet={w.wallet} onConnect={() => w.setModal(true)} onDisconnect={w.doDisconnect} compact />
      <main className="egm-main">
        {preview && <div className="egm-preview" role="note">
          <b>Preview</b> · nothing on this page is live or on chain · show it
          {(['soon', 'open', 'done'] as Fake[]).map((s) => (
            <button key={s} className={(fake ?? 'soon') === s || (s === 'open' && fake === 'sending') ? 'is-on' : ''} onClick={() => setFake(s)}>
              {s === 'soon' ? 'before launch' : s === 'open' ? 'minting open' : 'after a mint'}
            </button>
          ))}
        </div>}

        {/* ---- the cold open: the word, the stage, the offer ---- */}
        <section className="egm-hero">
          <p className="egm-kicker">The sixth pet · free mint</p>
          <BrokenHeart className="egm-heart-top" />
          <h1 className="egm-word" data-text="EMONADGOTCHI">EMONADGOTCHI</h1>
          <p className="egm-hand egm-sub">the $EMO mascot, in your wallet.</p>

          <div className="egm-herogrid">
            <div className="egm-stagewrap">
            <Print tilt={1.1} className="egm-stageprint">
              <div className="shell"><Stage quiet onDirector={setD} night={night} thought={null} scene={scene} character="emonad" /></div>
            </Print>
            <p className="egm-hand egm-cap">tap him. he lives here now.</p>
            </div>
            <div className="egm-offer">
              <p className="egm-hand egm-intro">he's the face of $EMO.</p>
              <p className="egm-hand egm-intro is-pink">nobody has ever fed him.</p>
              <p className="egm-lede">Emonad lives in your wallet now. Free to mint, no cap, no allowlist, one per wallet. Feed him, wash him, play with him, put him to bed. All of it free. Everything about him, his picture included, lives on chain on Monad.</p>
              <ul className="egm-facts">
                <li style={{ '--r': '-2deg' } as CSSProperties}><span>Price</span><b>Free</b></li>
                <li style={{ '--r': '1.5deg' } as CSSProperties}><span>Supply</span><b>No cap</b></li>
                <li style={{ '--r': '-1deg' } as CSSProperties}><span>Per wallet</span><b>One</b></li>
                <li style={{ '--r': '2deg' } as CSSProperties}><span>Chain</span><b>Monad</b></li>
              </ul>
              <div className="egm-cta">
                {button()}
                <a className="egm-btn egm-ghost" href="#how">How it works</a>
              </div>
              <p className="egm-fine">{note}</p>
              {m.live && m.minted !== null && <p className="egm-fine egm-ok">{Math.max(m.minted, m.mintedId ?? 0).toLocaleString()} minted so far.</p>}
              {m.error && <p className="egm-fine egm-err" role="alert">{m.error}</p>}
              {preview && fake === 'done' && <p className="egm-fine egm-ok">Preview only: nothing was sent.</p>}
            </div>
          </div>
        </section>

        {/* ---- two strips of tape across the page, running ---- */}
        <div className="egm-bands" aria-hidden="true">
          <div className="egm-band is-alt"><div className="egm-band-track">{[0, 1].map((k) => <span key={k}>{BAND2.map((t) => <i key={t}>{t}</i>)}</span>)}</div></div>
          <div className="egm-band"><div className="egm-band-track">{[0, 1].map((k) => <span key={k}>{BAND1.map((t) => <i key={t}>{t}</i>)}</span>)}</div></div>
        </div>

        {/* ---- the news ---- */}
        <section className="egm-slam" aria-label="Emonad is now a pet.">
          <p className="egm-zine egm-words" data-slam="" aria-hidden="true">
            {['Emonad', 'is', 'now', 'a', 'pet.'].map((x, i) => <span key={x} className={i === 4 ? 'is-pink' : ''} style={{ '--i': i } as CSSProperties}>{x}</span>)}
          </p>
        </section>

        {/* ---- the care ---- */}
        <section className="egm-sec">
          <div className="egm-head">
            <Zine>Four meters.<br />All of it free.</Zine>
            <div className="egm-headside"><p className="egm-body-text">Food, clean, fun and energy. Each care fills its meter, and it drains over a day. He tells you what he needs. Gas is all you ever pay.</p></div>
          </div>
          <div className="egm-care">
            {CARE.map((c, i) => (
              <div className="egm-careitem" key={c.k}>
                <Print src={pic(`shot-${c.k}`)} alt={c.title} tilt={[-1.6, 1.2, -0.8, 1.7][i]} />
                <Zine as="h3" className="egm-capzine">{c.title}</Zine>
                <p className="egm-hand egm-caphand">{c.hand}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- don't let him die ---- */}
        <section className="egm-sec egm-die">
          <div className="egm-row">
            <div className="egm-rowtext">
              <Zine>Don't let him <span className="is-pink">die.</span></Zine>
              <p className="egm-hand egm-big">only hunger kills.</p>
              <p className="egm-body-text">Two days without food and he is gone: a ghost over his own grave, in your wallet's picture too.</p>
            </div>
            <Print src={pic('shot-die')} alt="Emonad as a ghost over his grave" tilt={1.4} />
          </div>
          <div className="egm-row is-flip">
            <Print src={pic('shot-revive')} alt="Emonad back from the dead" tilt={-1.2} />
            <div className="egm-rowtext">
              <Zine>Or bring<br />him back.</Zine>
              <p className="egm-body-text">The revive is free. The death stays on his record, forever.</p>
            </div>
          </div>
        </section>

        {/* ---- the wardrobe ---- */}
        <section className="egm-sec">
          <div className="egm-head">
            <Zine>Fit check.</Zine>
            <div className="egm-headside">
              <p className="egm-hand egm-big is-pink">every item in the shop fits him.</p>
              <p className="egm-body-text">The outfits, the beanie, the emo fit, both packs and every room theme. Keep him well and he wears the crown: crowned, what he wears goes gold.</p>
            </div>
          </div>
          <div className="egm-looks">
            {LOOKS.map((l, i) => (
              <figure className="egm-look" key={l.k} style={{ '--tilt': `${[-1.4, 1, -0.6, 1.5, -1.1, 0.8, -1.5, 1.2][i]}deg` } as CSSProperties}>
                <img src={pic(`look-${l.k}`)} alt={l.label} loading="lazy" decoding="async" />
                <figcaption className={`egm-sticker${l.gold ? ' is-gold' : ''}`}>{l.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ---- the items that do something ---- */}
        <section className="egm-sec">
          <div className="egm-head">
            <Zine>Every item.<br /><span className="is-pink">On him.</span></Zine>
            <div className="egm-headside"><p className="egm-body-text">Put a toy or a companion on him and his Play and his Pet turn into it.</p></div>
          </div>
          <div className="egm-items">
            {ITEMS.map((c, i) => (
              <div className="egm-careitem" key={c.k}>
                <Print src={pic(`shot-${c.k}`)} alt={c.title} tilt={[1.3, -1.1, 0.9, -1.6][i]} />
                <Zine as="h3" className="egm-capzine">{c.title}</Zine>
                <p className="egm-hand egm-caphand">{c.hand}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- on chain ---- */}
        <section className="egm-sec">
          <div className="egm-head">
            <Zine>Nine moods.<br />On chain.</Zine>
            <div className="egm-headside"><p className="egm-body-text">The contract picks his wallet picture from how he is right now and draws it on chain. No server, no IPFS. Keep him well and he wears the crown in it.</p></div>
          </div>
          <div className="egm-moods">
            {MOODS.map((s) => <figure key={s}><img src={pic(`mood-${s}`)} alt={NFT_STATE_LABEL[s]} loading="lazy" decoding="async" /><figcaption>{NFT_STATE_LABEL[s]}</figcaption></figure>)}
          </div>
        </section>

        {/* ---- the burn ---- */}
        <section className="egm-sec egm-burn">
          <p className="egm-zine egm-80" data-slam="">80%</p>
          <div>
            <Zine>Name him.<br />Burn EMO.</Zine>
            <p className="egm-body-text">The one thing that costs anything: a name is 10 MON, and 80% of it buys EMO and burns it on the spot. His name lives on chain and shows in every wallet and marketplace.</p>
          </div>
        </section>

        {/* ---- how it works ---- */}
        <section className="egm-sec" id="how">
          <div className="egm-head"><Zine>How it works.</Zine></div>
          <ol className="egm-steps">
            <li><span>1</span><div><b>Connect and mint.</b> One tap, one transaction, gas only. He arrives fresh, with a week before his clock starts.</div></li>
            <li><span>2</span><div><b>Take care of him.</b> Food, clean, fun, energy. It never costs a thing.</div></li>
            <li><span>3</span><div><b>Name him for 10 MON.</b> The only paid act, and 80% of it burns EMO.</div></li>
            <li><span>4</span><div><b>Keep him alive.</b> Only hunger kills. The revive is free; the death stays on his record.</div></li>
            <li><span>5</span><div><b>Dress him up.</b> Every item in the shop fits him, both packs too.</div></li>
            <li><span>6</span><div><b>Wear the crown.</b> The best kept wear it, live, in the wallet picture too.</div></li>
          </ol>
        </section>

        {/* ---- the last card ---- */}
        <section className="egm-end">
          <div className="egm-ring"><img src={pic('face')} alt="Emonad" /></div>
          <p className="egm-kicker">{open ? 'Minting is open' : 'Coming soon'}</p>
          <p className="egm-word egm-endword" data-text="EMONADGOTCHI">EMONADGOTCHI</p>
          <p className="egm-hand egm-sub">the $EMO mascot. your pet.</p>
          {button(true)}
          <p className="egm-fine">Free, one per wallet, no cap, no allowlist. Gas is all you pay.</p>
        </section>

        <p className="egm-credit">Emonad is the $EMO mascot · <a href="https://emonad.lol" target="_blank" rel="noopener noreferrer">emonad.lol</a> · Emonadgotchi is an Emogotchi pet.</p>
      </main>
      <SiteFooter />
      <ConnectModal open={w.modal} onClose={() => w.setModal(false)} onInjected={() => void w.doInjected()} onWalletConnect={() => void w.doWalletConnect()} onDemo={() => { location.href = '/'; }} error={w.wallet.error} busy={w.wallet.status === 'connecting'} onConnected={(x) => { w.setWallet(x); w.setModal(false); }} />
    </div>
  );
}
