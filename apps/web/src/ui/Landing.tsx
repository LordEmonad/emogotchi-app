import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Faq } from './Faq';
import { SiteFooter } from './SiteFooter';
import { BurnBar } from './BurnBar';
import { marketplace } from '../links';
import { chainCfg } from '../game/chain';

type Props = { stage: ReactNode; onConnect: () => void; connecting: boolean; claimHref?: string | null };

export function Landing({ stage, onConnect, connecting, claimHref = null }: Props) {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><Icon name="heart" size={14} /> A pet that lives in your wallet</p>
          <h1>Feed it. Wash it.<br /><span className="grad">Burn EMO.</span></h1>
          <p className="lede">Emogotchi is a cat you keep alive on Monad. Every bowl of food, every bath, every ball of yarn costs 1 MON, and 80% of every interaction buys EMO and burns it on the spot. Forget it long enough and it dies.</p>
          <div className="cta-row">
            <button className="btn btn-pink btn-lg" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting…' : 'Connect wallet'}</button>
            {claimHref && <a className="btn btn-ghost btn-lg" href={claimHref}>Am I on the claim list?</a>}
            {marketplace() && <a className="btn btn-ghost btn-lg" href={marketplace()!} target="_blank" rel="noreferrer">Buy one on OpenSea</a>}
            <a className="btn btn-ghost btn-lg" href="#how">How it works</a>
          </div>
          <p className="fine">Works on a PC, or in your mobile wallet's browser on your phone.</p>
        </div>
        <div className="hero-stage">
          <div className="shell">{stage}</div>
          <p className="hero-cap">Tap the cat. It likes that.</p>
        </div>
      </section>

      <BurnBar />

      <section className="features" aria-label="What it is">
        <div className="feature">
          <span className="feature-ico"><Icon name="bowl" size={40} /></span>
          <h3>Care costs 1 MON</h3>
          <p>Feed, wash, play, sleep, clean up after it. Each one is a single tap and a single transaction, and every one is counted on the cat's record forever. Petting is just gas.</p>
        </div>
        <div className="feature">
          <span className="feature-ico"><Icon name="flame" size={40} /></span>
          <h3>80% of every interaction burns EMO</h3>
          <p>The contract buys EMO with your MON and burns it immediately, every single action, forever.</p>
        </div>
        <div className="feature">
          <span className="feature-ico"><Icon name="grave" size={40} /></span>
          <h3>Neglect it and it dies</h3>
          <p>Your wallet shows a ghost. Bringing it back costs 1,000 MON, and yes, that burns too.</p>
        </div>
      </section>

      <section className="how" id="how" aria-label="How it works">
        <h2>How it works</h2>
        <ol className="steps">
          <li><span className="step-n">1</span><div><b>Connect.</b> Your Emogotchi is an NFT. If it's in your wallet, it's on your screen.</div></li>
          <li><span className="step-n">2</span><div><b>Take care of it.</b> Four meters: food, clean, fun, energy. It tells you what it needs.</div></li>
          <li><span className="step-n">3</span><div><b>Name it for 10 MON.</b> The name lives on chain and shows in every wallet and marketplace.</div></li>
          <li><span className="step-n">4</span><div><b>Keep it alive.</b> Feed, wash, play and a nap, about once a day each. Only hunger kills; the rest just makes it sad. Its picture in your wallet changes with its mood, and a ghost means you owe it 1,000 MON. Streaks are recorded on chain.</div></li>
          <li><span className="step-n">5</span><div><b>Climb the leaderboard.</b> The best kept cats rank by their meters over the week, and the top 100 wear the crown. Named cats show their name; the rest show their owner.</div></li>
        </ol>
      </section>

      <Faq />

      <SiteFooter />
    </main>
  );
}
