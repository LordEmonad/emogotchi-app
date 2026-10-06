/**
 * The r3tardgotchi mint page, /r3tardgotchi. It mints for real once the build knows his contract (the launch switch,
 * __R3TARDS__: ui/Mint.tsx's own hook, the same one the other free pets' pages and Get a pet use); until then the button
 * is disabled and says "Coming soon", which is how it went on the site first (the operator, 2026-10-01). In a dev build
 * with no contract a dashed strip at the top also shows the page with minting open and after a mint (PREVIEW; nothing
 * is sent anywhere); a production build never has the strip.
 *
 * The other free pets' mint page (ui/Mint.tsx: the pet live on a stage, the offer, the moods, the items, how it works,
 * the button) in the look of r3tards.club: the purple wall of faces, black cards with a white line round them, a mono
 * pill on each card's corner, handwriting for the words. The LORE, 1st RULE and MOTTO cards are the club's own words,
 * word for word. The terms it states are the other free pets' (free, no cap, one per wallet, every action free, a name
 * 10 MON). He has no stunt (the operator's choice), so there is no stunt section.
 *
 * The stage plays his showreel (reel.ts REEL): every item, room and move, a new look each beat.
 * Pictures: tools/r3-mint-art.mjs (the wall of his faces, the nine moods, eight looks) -> ./mint/*.webp.
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
const LOOKS: [string, string][] = [
  ['witch', 'Witch outfit'], ['pumpkin', 'Pumpkin'], ['mummy', 'Mummy'], ['zombie', 'Zombie'],
  ['emohair', 'Emo hair'], ['kippah', 'Kippah + star'], ['habibi', 'Keffiyeh + bisht'], ['pharaoh', 'Crowned mummy'],
];
type Fake = 'soon' | 'open' | 'sending' | 'done';

/** A black card with a white line round it and a mono pill on its corner, as on r3tards.club. */
function Card({ tag, children, className = '', tilt = 0, id }: { tag?: string; children: ReactNode; className?: string; tilt?: number; id?: string }) {
  return (
    <section id={id} className={`r3m-card ${className}`} style={tilt ? ({ '--tilt': `${tilt}deg` } as CSSProperties) : undefined}>
      {tag && <span className="r3m-pill">{tag}</span>}
      {children}
    </section>
  );
}

export function R3Mint() {
  const [d, setD] = useState<Director | null>(null);
  const [scene, setScene] = useState<SceneName | null>(null);
  const [night, setNight] = useState(false);
  const [fake, setFake] = useState<Fake | null>(null);   // the dev preview's pretend state (never set in a production build)
  const dRef = useRef<Director | null>(null); dRef.current = d;
  const w = useMintWallet();
  const m = useMintPet('r3tards', w, d);
  const preview = PREVIEW && !m.live;
  /** what the button shows: the chain's word, or (dev, no contract) the preview strip's */
  const state = preview && fake ? ({ soon: 'soon', open: 'ready', sending: 'sending', done: 'done' } as const)[fake] : m.status;

  // the page's own background, on the body (the wall runs edge to edge, behind the header too)
  useEffect(() => {
    document.body.classList.add('r3m-body');
    document.body.style.setProperty('--r3wall', `url("${pic('wall')}")`);
    return () => { document.body.classList.remove('r3m-body'); document.body.style.removeProperty('--r3wall'); };
  }, []);

  // the stage: the lab's showreel, round and round
  useEffect(() => {
    if (!d) return;
    let on = true;
    d.wanderEnabled = false;
    const dress = (b: Beat) => {
      const worn: Costume[] = [...(b.outfit ? [b.outfit] : []), ...(b.head ? [b.head as Costume] : []), ...(b.star ? ['starofdavid' as Costume] : [])];
      d.setCostumes(worn); d.setHair(!!b.hair); d.setCrown(!!b.crown); d.setToy(b.toy ?? 'yarn'); d.setPetMove(b.pet ?? 'pet');
      setScene(b.scene ?? null); setNight(!!b.night);
    };
    void (async () => {
      for (let i = 0; on; i = (i + 1) % REEL.length) {
        const b = REEL[i]!;
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
    const cls = `r3m-btn r3m-mint${big ? ' is-big' : ''}`;
    switch (state) {
      case 'soon': return <button className={cls} disabled aria-disabled="true">Coming soon</button>;
      case 'connect': return <button className={cls} onClick={() => w.setModal(true)} disabled={w.wallet.status === 'connecting'}>{w.wallet.status === 'connecting' ? 'Connecting…' : 'Connect and mint'}</button>;
      case 'checking': return <button className={cls} disabled>Looking in your wallet…</button>;
      case 'ready': return <button className={cls} onClick={() => void (preview && fake ? pretend() : m.mint())}>Mint a r3tard · free</button>;
      case 'sending': return <button className={cls} disabled>{w.wallet.kind === 'passkey' ? 'Minting…' : 'Minting · confirm in your wallet…'}</button>;
      case 'done': return <a className={cls} href={m.mintedId ? petHref('r3tards', m.mintedId) : '/'}>He's yours{m.mintedId ? ` · #${m.mintedId}` : ''} → take care of him</a>;
      case 'minted': return <a className={cls} href="/">You have yours already → go see him</a>;
    }
  };
  const note = state === 'done' || state === 'minted' ? 'One per wallet, forever. Do not let him starve.'
    : 'Free to mint · no cap · one per wallet · every action free · naming him is 10 MON and 80% of it buys EMO and burns it.';
  const open = state !== 'soon';

  return (
    <div className="page r3m">
      <Header wallet={w.wallet} onConnect={() => w.setModal(true)} onDisconnect={w.doDisconnect} compact />
      <main className="r3m-main">
        {preview && <div className="r3m-preview" role="note">
          <b>Preview</b> · nothing on this page is live or on chain · show it
          {(['soon', 'open', 'done'] as Fake[]).map((s) => (
            <button key={s} className={(fake ?? 'soon') === s || (s === 'open' && fake === 'sending') ? 'is-on' : ''} onClick={() => setFake(s)}>
              {s === 'soon' ? 'before launch' : s === 'open' ? 'minting open' : 'after a mint'}
            </button>
          ))}
        </div>}

        <header className="r3m-top">
          <h1 className="r3m-word">r3tardgotchi</h1>
        </header>

        <div className="r3m-hero">
          <Card tag="Live · every item, every room" className="r3m-stagecard" tilt={-0.5}>
            <div className="shell"><Stage quiet onDirector={setD} night={night} thought={null} scene={scene} character="r3tards" /></div>
            <p className="r3m-cap">Tap him. He is not a r3al p3t. He is on chain though.</p>
          </Card>
          <Card tag="The fifth pet · free mint" className="r3m-offer" tilt={0.4}>
            <h2>Meet the r3tard.<br /><em>Mint him free.</em></h2>
            <p>A r3tard that lives in your wallet, on Monad. Free to mint, no cap, no allowlist, one per wallet. Feed him, wash him, play with him, put him to bed. All of it free. Everything about him, his picture included, lives on chain.</p>
            <ul className="r3m-facts">
              <li><span>Price</span><b>Free</b></li>
              <li><span>Supply</span><b>No cap</b></li>
              <li><span>Per wallet</span><b>One</b></li>
              <li><span>Chain</span><b>Monad</b></li>
            </ul>
            <div className="r3m-cta-row">
              {button()}
              <a className="r3m-btn" href="#how">How it works</a>
            </div>
            <p className="r3m-fine">{note}</p>
            {m.live && m.minted !== null && <p className="r3m-fine r3m-ok">{Math.max(m.minted, m.mintedId ?? 0).toLocaleString()} minted so far.</p>}
            {m.error && <p className="r3m-fine r3m-err" role="alert">{m.error}</p>}
            {preview && fake === 'done' && <p className="r3m-fine r3m-ok">Preview only: nothing was sent.</p>}
          </Card>
        </div>

        <div className="r3m-club">
          <Card tag="Lore" className="r3m-lore" tilt={-0.4}>
            <p>Was bored during NFt week, drew a little guy for fun. Showed a friend, he laughed. Cooked some eyes, mouths and backgrounds. Somehow managed to generate the collection. Read a tutorial to launch it (understood nothing). It worked. 333 r3tards were born. Nowadays 1033.</p>
            <p className="r3m-then">Then somebody gave him a stick figure body, four meters and a bowl. Nobody asked him.</p>
          </Card>
          <Card tag="1st rule" className="r3m-rule" tilt={0.7}>
            <p>First rule of the r3tards club<br />Never sell your r3tards NFT</p>
          </Card>
          <Card tag="2nd rule" className="r3m-rule2" tilt={-0.8}>
            <p>Second rule of the r3tards club<br />Never let your r3tardgotchi starve</p>
          </Card>
          <Card tag="Motto" className="r3m-motto" tilt={0.5}>
            <p>Just a bunch of r3tards on the Monad Blockchain<br />He sold? r3st in p3ac3<br />r3tards is not a r3al proj3ct</p>
            <p className="r3m-then">He starved? r3st in p3ac3 too. The revive is free.</p>
          </Card>
        </div>

        <div className="r3m-three">
          <Card tag="Free" tilt={-0.3}>
            <h3>Free. All of it.</h3>
            <p>The mint is free and so is every bit of care, even bringing him back from the dead. Gas is all you ever pay. One r3tard per wallet, forever.</p>
          </Card>
          <Card tag="Burn" tilt={0.4}>
            <h3>Naming him burns EMO</h3>
            <p>The one thing that costs anything: a name is 10 MON, and 80% of it buys EMO and burns it on the spot. The name lives on chain and shows in every wallet and marketplace.</p>
          </Card>
          <Card tag="Rules" tilt={-0.4}>
            <h3>Same rules as the cat</h3>
            <p>Four meters, a poop every meal, naps, a crown for the best kept, and death after two days without food. His picture in your wallet changes with his mood. Streaks are recorded on chain.</p>
          </Card>
        </div>

        <Card tag="Nine moods" className="r3m-strip" tilt={0.2}>
          <h3>Nine moods, one picture each, on chain</h3>
          <p>The contract picks his wallet picture from his live state. Keep him well and he wears the crown.</p>
          <div className="r3m-moods">
            {MOODS.map((m) => <figure key={m}><img src={pic(`mood-${m}`)} alt={NFT_STATE_LABEL[m]} /><figcaption>{NFT_STATE_LABEL[m]}</figcaption></figure>)}
          </div>
        </Card>

        <Card tag="The wardrobe" className="r3m-strip" tilt={-0.2}>
          <h3>Every item in the shop fits him</h3>
          <p>The outfits, the emo hair, both packs, every room, the dreidel, the darbuka, the hen and the falcon. Crowned, what he wears goes gold.</p>
          <div className="r3m-looks">
            {LOOKS.map(([k, label]) => <figure key={k}><img src={pic(`look-${k}`)} alt={label} /><figcaption>{label}</figcaption></figure>)}
          </div>
        </Card>

        <Card tag="How it works" id="how" tilt={0.3}>
          <ol className="r3m-steps">
            <li><span>1</span><div><b>Connect and mint.</b> One tap, one transaction, gas only. He arrives fresh with a week before his clock starts.</div></li>
            <li><span>2</span><div><b>Take care of him.</b> Food, clean, fun, energy. He tells you what he needs, and it never costs a thing.</div></li>
            <li><span>3</span><div><b>Name him for 10 MON.</b> The only paid act, and 80% of it burns EMO.</div></li>
            <li><span>4</span><div><b>Keep him alive.</b> Only hunger kills. If he dies, the revive is free, but the death stays on his record.</div></li>
            <li><span>5</span><div><b>Dress him up.</b> Every item in the shop fits him, the packs too.</div></li>
            <li><span>6</span><div><b>Never sell.</b> See the first rule.</div></li>
          </ol>
        </Card>

        <Card tag={open ? 'Open' : 'Soon'} className="r3m-final" tilt={-0.3}>
          <h2>{open ? 'Minting is open.' : 'Minting opens soon.'}</h2>
          <p>Free, one per wallet, no cap, no allowlist: everyone gets one. Gas is all you pay.</p>
          {button(true)}
          <p className="r3m-fine">Just a bunch of r3tards on the Monad Blockchain. Now with legs.</p>
        </Card>

        <p className="r3m-credit">The 1,033 r3tards live at <a href="https://www.r3tards.club/" target="_blank" rel="noopener noreferrer">r3tards.club</a>. r3tardgotchi is an Emogotchi pet.</p>
      </main>
      <SiteFooter />
      <ConnectModal open={w.modal} onClose={() => w.setModal(false)} onInjected={() => void w.doInjected()} onWalletConnect={() => void w.doWalletConnect()} onDemo={() => { location.href = '/'; }} error={w.wallet.error} busy={w.wallet.status === 'connecting'} onConnected={(x) => { w.setWallet(x); w.setModal(false); }} />
    </div>
  );
}
