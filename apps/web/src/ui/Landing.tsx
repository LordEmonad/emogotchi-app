import type { ReactNode } from 'react';
import { Icon } from './Icon';

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
            <a className="btn btn-ghost btn-lg" href="#how">How it works</a>
          </div>
          <p className="fine">Works on a PC, or in your mobile wallet's browser on your phone.</p>
        </div>
        <div className="hero-stage">
          <div className="shell">{stage}</div>
          <p className="hero-cap">Tap the cat. It likes that.</p>
        </div>
      </section>

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

      <section className="faq" id="faq" aria-label="Questions">
        <h2>Questions people ask</h2>
        <details><summary>How often do I have to feed it?</summary><p>Every feed fills the bowl and restarts the clock. The bowl empties over 24 hours, then the cat is hungry, and 48 hours after its last meal it dies. Feed it every two days and it lives; every day and it thrives.</p></details>
        <details><summary>What happens when it dies?</summary><p>It becomes a ghost over a little grave, in the app and in your wallet's picture. Reviving costs 1,000 MON and brings every meter back to 60. The death stays on its record forever.</p></details>
        <details><summary>Do washing, playing and sleeping matter?</summary><p>Each one fills its meter and is due again 24 hours later, same rhythm as feeding. They don't keep it alive, they keep it happy. Happy cats score higher, and the top 100 cats each week wear the crown, on the site and on the NFT. Ties at the 100th place extend the list.</p></details>
        <details><summary>Why does my wallet still show it alive (or hungry)?</summary><p>Wallets cache pictures and refresh when you open the NFT or pull to refresh. Marketplaces update within minutes of any action. The app is always live.</p></details>
        <details><summary>Where does the MON go?</summary><p>80% of every interaction buys $EMO and burns it on the spot. The 0.d that selects an action on direct transfers goes to the giveaway treasury.</p></details>
        <details><summary>Can I use it without this site?</summary>
          <p>Yes. Send MON straight to the contract from the wallet that holds your cats. The whole number is how many cats, the decimal is the action:</p>
          <table className="faq-table"><tbody>
            <tr><td><b>N.0</b></td><td>feeds N cats, hungriest first</td></tr>
            <tr><td><b>N.1</b></td><td>plays with N cats, most bored first</td></tr>
            <tr><td><b>N.2</b></td><td>washes N cats, dirtiest first</td></tr>
            <tr><td><b>N.3</b></td><td>puts N cats to sleep, most tired first</td></tr>
            <tr><td><b>N.4</b></td><td>cleans up N poops</td></tr>
            <tr><td><b>1000.0</b></td><td>revives your longest-dead cat</td></tr>
          </tbody></table>
          <p>Anything else reverts and you keep your MON. Every function is also on the verified contract, so a block explorer works as a full interface. The site itself is pinned to IPFS with its hash stored in the contract.</p>
        </details>
        <details><summary>I have ten cats. Do I tap forty times?</summary><p>No. Cats show as tabs, and "Feed all" or "Full care" does the whole household in one transaction. Direct transfers batch the same way: 10.0 feeds all ten.</p></details>
        <details><summary>What moves with the NFT if I sell it?</summary><p>Everything. Meters, name, streak, score, crown and the whole record of feeds, pets and deaths belong to the cat, not the wallet.</p></details>
      </section>

      <footer className="foot">
        <span>An <a href="https://emonad.lol">Emonad</a> thing · $EMO on Monad</span>
        <span className="foot-right"><a href="/leaderboard">Leaderboard</a> · <a href="/nft">NFT preview</a> · Contract: soon</span>
      </footer>
    </main>
  );
}
