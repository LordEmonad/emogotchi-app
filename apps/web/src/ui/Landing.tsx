import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Faq } from './Faq';
import { SiteFooter } from './SiteFooter';
import { BurnBar } from './BurnBar';

import { chainCfg } from '../game/chain';
import { loadDrawing, prefetchDrawings, type Character } from '../pet/Pet';
import { PETS, hasPet } from '../pets';
import { fightClient, mon } from '../fight/chain';

type Props = {
  stage: ReactNode;
  onConnect: () => void;
  connecting: boolean;
  claimHref?: string | null;
  /** which pet the hero is showing, and how to switch it: the page's job is to say "there are two of these" */
  character?: Character;
  onCharacter?: (c: Character) => void;
};

/**
 * The home page. It used to be about a cat, because for the first three days there was only a cat. There are now
 * three pets, an item shop, an on-chain art contract and a way in with no wallet at all, so the page leads with the
 * world rather than with one animal — and the hero itself switches between the pets, which says "there are
 * three" faster than a sentence can.
 */
export function Landing({ stage, onConnect, connecting, claimHref = null, character = 'cat', onCharacter }: Props) {
  const HERO: { c: Character; label: string }[] = [{ c: 'cat', label: 'Emogotchi' }, { c: 'frog', label: 'Inversegotchi' }, { c: 'sahur', label: 'Sahuragotchi' }, ...(__THICCUMS__ && hasPet('thiccums') ? [{ c: 'thiccums' as const, label: 'Thiccumsgotchi' }] : []), ...(__R3TARDS__ && hasPet('r3tards') ? [{ c: 'r3tards' as const, label: 'r3tardgotchi' }] : []), ...(__EMONAD__ && hasPet('emonad') ? [{ c: 'emonad' as const, label: 'Emonadgotchi' }] : [])];
  // the hero's other pets, fetched while the page is idle, so a tap on the switch never shows an empty room
  useEffect(() => { prefetchDrawings(HERO.map((h) => h.c)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><Icon name="heart" size={14} /> Pets that live in your wallet</p>
          <h1>Feed it. Wash it.<br /><span className="grad">Burn EMO.</span></h1>
          <p className="lede">
            {__EMONAD__ && hasPet('emonad') ? 'Six' : __R3TARDS__ && hasPet('r3tards') ? 'Five' : __THICCUMS__ && hasPet('thiccums') ? 'Four' : 'Three'} pets on Monad, kept alive on chain. Everything about them lives in the contract, including the
            picture in your wallet. Care for a cat and 80% of every interaction buys EMO and burns it. Forget
            any of them for long enough and it dies, permanently.
          </p>
          {/* One action (2026-10-02; it was five buttons, with only two of the five pets among them): a newcomer
              gets a pet. Connecting is the header's button; the claim list and every mint page are one step on. */}
          <div className="cta-row">
            <a className="btn btn-pink btn-lg" href="/adopt">Get a pet, free</a>
            <a className="btn btn-ghost btn-lg" href="#how">How it works</a>
          </div>
          <p className="fine">No wallet? Make an account with Face ID and we cover the gas to get you started.{claimHref && <> Been on Monad a while? Your wallet may have a cat waiting: <a href={claimHref}>check the claim list</a>.</>}</p>
        </div>
        <div className="hero-stage">
          <div className="shell">{stage}</div>
          {onCharacter ? (
            <div className="hero-switch" role="group" aria-label="Which pet to show">
              {HERO.map((h) => <button key={h.c} type="button" className={character === h.c ? 'is-on' : ''} onPointerDown={() => void loadDrawing(h.c)} onClick={() => onCharacter(h.c)} aria-pressed={character === h.c}>{h.label}</button>)}
            </div>
          ) : (
            <p className="hero-cap">Tap it. It likes that.</p>
          )}
        </div>
      </section>

      <LiveRow />

      <BurnBar />

      <section className="pets-two pets-three" aria-label="The three pets">
        <article className="pet-card" data-pet="cat">
          <h2>Emogotchi</h2>
          <p className="pet-card-sub">The cat. 82,000 of them, airdropped to Monad.</p>
          <p>Every feed, wash, play and nap costs 1 MON, and 80% of it buys EMO and burns it. Name it for 10 MON
            and the name shows in every wallet and marketplace. Let it starve and it dies; bringing it back costs
            1,000 MON.</p>
          {/* No "buy on OpenSea" here. The contract emits ERC-4906 MetadataUpdate on every action, but OpenSea's
              refresh lags badly, so a listing can show a healthy cat that has actually starved. Sending someone
              to buy on a stale picture is not a trade we want to cause, least of all through the starvation. */}
          <div className="pet-card-cta">
            {claimHref && <a className="btn btn-ghost" href={claimHref}>Check the claim list</a>}
            <a className="btn btn-ghost" href="/pets">Browse every cat</a>
          </div>
        </article>
        <article className="pet-card" data-pet="frok">
          <h2>Inversegotchi</h2>
          <p className="pet-card-sub">The frok. Free to mint, one per wallet, no cap.</p>
          <p>Same four meters, same on-chain record, same way to die. Every care action is free, so all it costs
            is gas. He has four stunts of his own, counted on chain, and his own crown and leaderboard.</p>
          <div className="pet-card-cta">
            <a className="btn btn-pink" href="/mint">Mint one, free</a>
            <a className="btn btn-ghost" href="/inversebrah">See the art</a>
          </div>
        </article>
        <article className="pet-card" data-pet="sahur">
          <h2>{PETS.sahur.fullBrand}</h2>
          <p className="pet-card-sub">The Sahur. Free to mint, one per wallet, no cap.</p>
          <p>The number-one AI-made character, as a pet. Same four meters, same on-chain record, same way to die,
            and every care action is free. One stunt of his own, tung tung tung, counted on chain, and his own
            crown and leaderboard.</p>
          <div className="pet-card-cta">
            <a className="btn btn-pink" href="/tung">Mint one, free</a>
            <a className="btn btn-ghost" href="/pets?pet=sahur">Browse every Sahur</a>
          </div>
        </article>
        {__THICCUMS__ && hasPet('thiccums') ? <article className="pet-card" data-pet="thiccums">
          <h2>Thiccumsgotchi</h2>
          <p className="pet-card-sub">The seal. Free to mint, one per wallet, no cap.</p>
          <p>Thiccums the Seal, the $THICCUMS mascot, as a pet. Same four meters, same on-chain record, same way to
            die, and every care action is free. One stunt of his own, the butt bounce, counted on chain, and his own
            crown and leaderboard.</p>
          <div className="pet-card-cta">
            <a className="btn btn-pink" href="/thiccums">Mint one, free</a>
            <a className="btn btn-ghost" href="/pets?pet=thiccums">Browse every Thiccums</a>
          </div>
        </article> : null}
        {__R3TARDS__ && hasPet('r3tards') ? <article className="pet-card" data-pet="r3tards">
          <h2>r3tardgotchi</h2>
          <p className="pet-card-sub">The r3tard. Free to mint, one per wallet, no cap.</p>
          <p>The r3tards face on a stick figure body, as a pet. Same four meters, same on-chain record, same way to
            die, and every care action is free. No stunt: just him, his own crown and his own leaderboard.</p>
          <div className="pet-card-cta">
            <a className="btn btn-pink" href="/r3tardgotchi">Mint one, free</a>
            <a className="btn btn-ghost" href="/pets?pet=r3tards">Browse every r3tard</a>
          </div>
        </article> : null}
        {__EMONAD__ && hasPet('emonad') ? <article className="pet-card" data-pet="emonad">
          <h2>Emonadgotchi</h2>
          <p className="pet-card-sub">Emonad, the face of $EMO. Free to mint, one per wallet, no cap.</p>
          <p>The $EMO mascot as a pet. Same four meters, same on-chain record, same way to die, and every care action is
            free. Every item in the shop fits him, and crowned it all goes gold. His own crown and his own leaderboard.</p>
          <div className="pet-card-cta">
            <a className="btn btn-pink" href="/emonadgotchi">Mint one, free</a>
            <a className="btn btn-ghost" href="/pets?pet=emonad">Browse every Emonad</a>
          </div>
        </article> : null}
      </section>

      <section className="features" aria-label="What else is here">
        <div className="feature">
          <span className="feature-ico"><Icon name="sparkle" size={40} /></span>
          <h3>The art is on chain</h3>
          <p>No server, no IPFS. The contract composes the picture itself, for the mood your pet is in right now.</p>
        </div>
        <div className="feature">
          {/* the pumpkin, not the emo hair: the hair is a muddy silhouette at 40px, and the haunted room is a
              real shop item too */}
          <span className="feature-ico"><Icon name="pumpkin" size={40} /></span>
          <h3>An item shop</h3>
          <p>On-chain cosmetics any pet can wear, drawn by the art contract. A witch hat, a haunted room, the Backrooms, emo hair.</p>
        </div>
        <div className="feature">
          <span className="feature-ico"><Icon name="flame" size={40} /></span>
          <h3>A leaderboard</h3>
          <p>The contract scores how well you have kept your pet over the week. The best 100 wear the crown.</p>
        </div>
        <div className="feature">
          <span className="feature-ico"><Icon name="coin" size={40} /></span>
          <h3>No wallet needed</h3>
          <p>Face ID makes you a real Monad account, and we cover the gas for your first few actions. Four taps.</p>
        </div>
      </section>

      <section className="how" id="how" aria-label="How it works">
        <h2>How it works</h2>
        <ol className="steps">
          <li><span className="step-n">1</span><div><b>Get a pet.</b> {__EMONAD__ && hasPet('emonad') ? 'A frok, a Sahur, a Thiccums, a r3tard or an Emonad' : __R3TARDS__ && hasPet('r3tards') ? 'A frok, a Sahur, a Thiccums or a r3tard' : __THICCUMS__ && hasPet('thiccums') ? 'A frok, a Sahur or a Thiccums' : 'A frok or a Sahur'} is free to mint. Cats were airdropped, and the rest are on the claim list.</div></li>
          <li><span className="step-n">2</span><div><b>Look after it.</b> Four meters: food, clean, fun, energy. It tells you what it needs, about once a day each.</div></li>
          <li><span className="step-n">3</span><div><b>Name it for 10 MON.</b> The name lives on chain and shows everywhere the NFT does.</div></li>
          <li><span className="step-n">4</span><div><b>Keep it alive.</b> Only hunger kills; the rest just makes it sad. Its picture changes with its mood, and a ghost means you owe 1,000 MON. Streaks are recorded on chain.</div></li>
        </ol>
      </section>

      <Faq />

      <SiteFooter />
    </main>
  );
}

type Live = { town: number | null; fights: number | null; open: { n: number; top: bigint } | null };

/**
 * The two places where things are happening right now, under the hero (2026-10-02): the town and the ring were
 * reachable only from the nav, which a 1440 laptop did not even show. Each card is its link card's picture without the words (`og-emotown.mjs --bare`, `og-fightclub.mjs --bare`) with a
 * live number read once, on the page's first paint; a number the site cannot read is left out, never shown as 0.
 */
function LiveRow() {
  const [live, setLive] = useState<Live>({ town: null, fights: null, open: null });
  useEffect(() => {
    let gone = false;
    // who is in town: the Worker's `town` lists (the same ones Emotown places on the street), summed across pets
    void fetch('/api/stats', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j: Record<string, { town?: unknown[] }> | null) => {
      if (gone || !j) return;
      const n = Object.values(j).reduce((acc, p) => acc + (p && typeof p === 'object' && Array.isArray(p.town) ? p.town.length : 0), 0);
      if (n > 0) setLive((l) => ({ ...l, town: n }));
    }).catch(() => {});
    if (fightClient) {
      void fightClient.count().then((n) => { if (!gone) setLive((l) => ({ ...l, fights: n })); }).catch(() => {});
      void fightClient.open().then((fs) => {
        if (gone) return;
        const anyone = fs.filter((f) => !f.opponent);
        setLive((l) => ({ ...l, open: { n: anyone.length, top: anyone.reduce((m, f) => (f.stake > m ? f.stake : m), 0n) } }));
      }).catch(() => {});
    }
    return () => { gone = true; };
  }, []);
  return (
    <section className="live-two" aria-label="Happening now">
      <a className="live-card" href="/emotown" data-live="town">
        <img src="/brand/emotown-live.webp" alt="" width={1200} height={630} loading="eager" decoding="async" />
        <div className="live-card-text">
          <p className="live-card-kicker"><span className="live-dot" aria-hidden /> Live now <span className="nav-beta">Beta</span></p>
          <h2>Emotown</h2>
          <p>{live.town !== null ? <><b className="tnum">{live.town.toLocaleString('en-US')}</b> pets are in town right now: every pet whose owner looked after it today, doing on the street whatever its owner does to it, live.</> : <>Every pet whose owner looked after it today is in town, doing on the street whatever its owner does to it, live.</>}</p>
          <span className="live-card-go">Walk in <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2.5 7h9M8 3.5 11.5 7 8 10.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </div>
      </a>
      <a className="live-card" href="/fightclub" data-live="fight">
        <img src="/brand/fightclub-live.webp" alt="" width={1200} height={630} loading="eager" decoding="async" />
        <div className="live-card-text">
          <p className="live-card-kicker"><span className="live-dot" aria-hidden /> Live now <span className="nav-beta">Beta</span></p>
          <h2>Fight Club</h2>
          <p>Any pet against any pet for MON, 50/50 by Pyth's random number, winner takes the pot.{live.fights !== null && live.fights > 0 ? <> <b className="tnum">{live.fights.toLocaleString('en-US')}</b> challenges so far{live.open && live.open.n > 0 ? <>, <b className="tnum">{live.open.n}</b> open to anyone right now at up to <b className="tnum">{mon(live.open.top)} MON</b> a side</> : null}.</> : null}</p>
          <span className="live-card-go">Into the ring <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2.5 7h9M8 3.5 11.5 7 8 10.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </div>
      </a>
    </section>
  );
}
