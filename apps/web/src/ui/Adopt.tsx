/**
 * /adopt ("Get a pet" in the nav, 2026-09-28): the three pets side by side, the free ones first (operator: "so the
 * first thing people see is the free pets"), each live in its own room with its own button. It replaced three nav tabs
 * (Cat, inversebrah, Tung Tung Tung); their pages stay at /claim, /mint and /tung, each with its own link card, and
 * every card here links to its pet's page.
 *
 * The buttons are the pets' own pages' logic, not a copy of it: `useMintPet`/`MintButton` from Mint.tsx and `useClaim`
 * from Claim.tsx, with one wallet connection for the whole page. No marketplace link for the cat (the operator's call:
 * a listing's picture can lag a starved cat's real state).
 */
import { useEffect, useRef, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { ConnectModal } from './ConnectModal';
import { Icon } from './Icon';
import { Stage } from '../scene/Stage';
import type { Director } from '../scene/director';
import { chainCfg } from '../game/chain';
import { PETS, hasPet } from '../pets';
import type { Collection } from '@emo-pets/chain';
import { MintButton, noteFor, useMintPet, useMintWallet, type MintPet, type MintWallet } from './Mint';
import { SHOW_COUNTDOWN_UNDER, fmtLeft, useClaim, type ClaimState } from './Claim';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The pet on its stage, doing its own things now and then, only while the card is on screen (three live rooms would
 * otherwise all be busy on a phone where one shows at a time). `start` staggers the three.
 */
function useReel(d: Director | null, host: React.RefObject<HTMLElement | null>, acts: (d: Director) => (() => Promise<unknown>)[], start: number) {
  useEffect(() => {
    if (!d || !host.current) return;
    let alive = true;
    let seen = false;
    const io = new IntersectionObserver(([e]) => { seen = !!e?.isIntersecting; }, { threshold: 0.35 });
    io.observe(host.current);
    d.wanderEnabled = true;
    void (async () => {
      await wait(start);
      let i = 0;
      const list = acts(d);
      while (alive) {
        if (seen) {
          d.wanderEnabled = false;
          try { await list[i % list.length]!(); } catch { /* the stage may be torn down mid-action */ }
          d.wanderEnabled = true;
          i++;
        }
        await wait(seen ? 5200 : 1000);
      }
    })();
    return () => { alive = false; io.disconnect(); };
  }, [d, host, acts, start]);
}

const REELS = {
  frok: (d: Director) => [() => d.slap(), () => d.screenshot(), () => d.squeeze(), () => d.pet(1)],
  sahur: (d: Director) => [() => d.tung(), () => d.pet(1), () => d.tung()],
  cat: (d: Director) => [() => d.pet(1), () => d.play(), () => d.pet(-1)],
  // the fourth pet (only in a build with his switch on): his own butt bounce (thiccums/ways.ts), a pet, the bounce again
  ...(__THICCUMS__ ? { thiccums: (d: Director) => { const bounce = () => (d.own as { bounce?(): Promise<void> } | null)?.bounce?.() ?? Promise.resolve(); return [bounce, () => d.pet(1), bounce]; } } : {}),
  // the fifth pet (only with his switch on): he has no stunt, so a pet, a kick of the ball and a yawn
  ...(__R3TARDS__ ? { r3tards: (d: Director) => [() => d.pet(1), () => d.play(), () => d.yawn()] } : {}),
  // the sixth (only with his switch on): no stunt either, so a pet, a kick of the ball and a yawn, in his emo bedroom
  ...(__EMONAD__ ? { emonad: (d: Director) => [() => d.pet(1), () => d.play(), () => d.yawn()] } : {}),
} as Record<Collection, (d: Director) => (() => Promise<unknown>)[]>;

type Fact = { icon: Parameters<typeof Icon>[0]['name']; text: string };

function Card({ pet, title, sub, body, facts, room, night, action, note, more, reel, start }: {
  pet: Collection; title: string; sub: string; body: string; facts: Fact[]; room?: 'backrooms' | 'emoroom'; night: boolean;
  action: React.ReactNode; note: React.ReactNode; more: { href: string; label: string }; reel: (d: Director) => void; start: number;
}) {
  const host = useRef<HTMLElement>(null);
  const [d, setD] = useState<Director | null>(null);
  useEffect(() => { if (d) reel(d); }, [d, reel]);
  useReel(d, host, REELS[pet], start);
  return (
    <article className="adopt-card" data-pet={pet} ref={host}>
      <div className="adopt-stage"><div className="shell"><Stage quiet onDirector={setD} night={night} thought={null} character={PETS[pet].character} scene={room} /></div></div>
      <div className="adopt-body">
        <p className="adopt-sub">{sub}</p>
        <h2>{title}</h2>
        <p className="adopt-text">{body}</p>
        <ul className="adopt-facts">{facts.map((f) => <li key={f.text}><Icon name={f.icon} size={16} />{f.text}</li>)}</ul>
        <div className="adopt-cta">{action}</div>
        <p className="fine adopt-note">{note}</p>
        <a className="adopt-more" href={more.href}>{more.label} →</a>
      </div>
    </article>
  );
}

/** The cat's claim, as a card's button and its note. */
function CatAction({ c, w }: { c: ClaimState; w: MintWallet }) {
  const { status, error } = c;
  const btn = (label: string, onClick?: () => void, disabled = false) => <button className="btn btn-pink btn-lg mint-btn" onClick={onClick} disabled={disabled}>{label}</button>;
  switch (status) {
    case 'connect': return <>{btn(w.wallet.status === 'connecting' ? 'Connecting…' : 'Check my wallet', () => w.setModal(true), w.wallet.status === 'connecting')}</>;
    case 'loading': case 'checking': return <>{btn('Checking…', undefined, true)}</>;
    case 'open': case 'sending': return <>
      {w.wrongChain && <p className="claim-warn">Switch your wallet to {chainCfg?.chain.name ?? 'Monad'} first.</p>}
      {btn(status === 'sending' ? (w.wallet.kind === 'passkey' ? 'Claiming…' : 'Claiming… confirm in your wallet') : 'Claim my cat', () => void c.claim(), status === 'sending')}
      {error && <p className="fine mint-error">{error}</p>}
    </>;
    case 'done': return <a className="btn btn-pink btn-lg mint-btn" href="/">Emogotchi #{c.catId} is yours → take care of it</a>;
    case 'claimed': return <a className="btn btn-pink btn-lg mint-btn" href="/">You claimed yours → go see it</a>;
    case 'not-listed': return <p className="adopt-verdict">This wallet is not on the list.</p>;
    case 'gone': return <p className="adopt-verdict">Every cat on the list has been claimed.</p>;
    case 'closed': return <p className="adopt-verdict">The claim is closed.</p>;
    case 'sealed': return <p className="adopt-verdict">The claim is over: supply is final.</p>;
    case 'soon': return <p className="adopt-verdict">The claim opens soon.</p>;
    default: return <p className="adopt-verdict">The claim is not open.</p>;
  }
}
const catNote = (c: ClaimState) => {
  const left = c.view ? Math.max(0, c.view.end - c.now) : 0;
  if (c.status === 'open' || c.status === 'connect') return `${c.view?.left.toLocaleString() ?? '…'} left to claim · one per wallet${c.view && left < SHOW_COUNTDOWN_UNDER ? ` · closes in ${fmtLeft(left)}` : ''}`;
  if (c.status === 'not-listed') return 'Cats were airdropped; the claim is only for wallets on the list.';
  return 'One per wallet on the list.';
};

export function Adopt() {
  const w = useMintWallet();
  const [dFrok, setDFrok] = useState<Director | null>(null);
  const [dSahur, setDSahur] = useState<Director | null>(null);
  const frok = useMintPet('frok', w, dFrok);
  const sahur = useMintPet('sahur', w, dSahur);
  const [dThicc, setDThicc] = useState<Director | null>(null);
  const thicc = __THICCUMS__ ? useMintPet('thiccums', w, dThicc) : null;   // eslint-disable-line react-hooks/rules-of-hooks -- a build-time constant: the same hooks run on every render
  const [dR3, setDR3] = useState<Director | null>(null);
  const r3 = __R3TARDS__ ? useMintPet('r3tards', w, dR3) : null;   // eslint-disable-line react-hooks/rules-of-hooks -- a build-time constant, as above
  const [dEg, setDEg] = useState<Director | null>(null);
  const eg = __EMONAD__ ? useMintPet('emonad', w, dEg) : null;   // eslint-disable-line react-hooks/rules-of-hooks -- a build-time constant, as above
  const cat = useClaim(w.wallet, w.connected, w.wrongChain);
  const { wallet, modal, setModal, doInjected, doWalletConnect, doDisconnect, setWallet } = w;
  const mintState = (pet: MintPet) => pet === 'frok' ? frok : pet === 'r3tards' && r3 ? r3 : pet === 'emonad' && eg ? eg : pet === 'sahur' || !thicc ? sahur : thicc;
  const mintCard = (pet: MintPet) => ({ action: <MintButton pet={pet} m={mintState(pet)} w={w} />, note: noteFor(mintState(pet)) });
  const four = __THICCUMS__ && hasPet('thiccums');
  const five = __R3TARDS__ && hasPet('r3tards');
  const six = __EMONAD__ && hasPet('emonad');
  const free: Fact[] = [{ icon: 'heart', text: 'Free to mint, one per wallet' }, { icon: 'coin', text: 'Every care free: gas only' }, { icon: 'flame', text: 'Naming is 10 MON; 80% burns EMO' }];
  return (
    <div className="page view-adopt">
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} compact />
      <main className="adopt">
        <section className="adopt-head">
          <p className="eyebrow"><Icon name="heart" size={14} /> Adopt</p>
          <h1>Get a pet.<br /><span className="grad">{__EMONAD__ && six ? 'Five of them are free.' : __R3TARDS__ && five ? 'Four of them are free.' : __THICCUMS__ && four ? 'Three of them are free.' : 'Two of them are free.'}</span></h1>
          {__EMONAD__ && six
            ? <p className="lede">Six pets live on Monad, everything about them on chain, their pictures included. Emonad, inversebrah, Tung Tung Tung Sahur, Thiccums and the r3tard are free to mint, one of each per wallet. The cat came by airdrop, and the claim is open to the list.</p>
            : __R3TARDS__ && five
            ? <p className="lede">Five pets live on Monad, everything about them on chain, their pictures included. inversebrah, Tung Tung Tung Sahur, Thiccums and the r3tard are free to mint, one of each per wallet. The cat came by airdrop, and the claim is open to the list.</p>
            : __THICCUMS__ && four
            ? <p className="lede">Four pets live on Monad, everything about them on chain, their pictures included. inversebrah, Tung Tung Tung Sahur and Thiccums are free to mint, one of each per wallet. The cat came by airdrop, and the claim is open to the list.</p>
            : <p className="lede">Three pets live on Monad, everything about them on chain, their pictures included. inversebrah and Tung Tung Tung Sahur are free to mint, one of each per wallet. The cat came by airdrop, and the claim is open to the list.</p>}
        </section>
        <section className="adopt-grid" aria-label="The pets">
          {/* Emonad first (the operator's order, 2026-10-05) */}
          {__EMONAD__ && six ? <Card pet="emonad" title="Emonadgotchi" sub="The $EMO mascot · free" start={200} night room="emoroom" reel={setDEg}
            body="Emonad, the face of $EMO, as a pet. No stunt: he just needs looking after. Every item in the shop fits him, and crowned it all goes gold."
            facts={free} {...mintCard('emonad')} more={{ href: '/emonadgotchi', label: 'Everything about Emonad' }} /> : null}
          <Card pet="frok" title="inversebrah" sub="The frok · free" start={600} night reel={setDFrok}
            body="A frok with four stunts of his own: screenshot, slap, squeeze, set on fire. Each one counts on his record, for ever."
            facts={free} {...mintCard('frok')} more={{ href: '/mint', label: 'Everything about inversebrah' }} />
          <Card pet="sahur" title={PETS.sahur.fullBrand} sub="The Sahur · free" start={2400} night={false} room="backrooms" reel={setDSahur}
            body="The number-one AI-made character, as a pet. His one stunt, tung tung tung, knocks the room and counts on chain."
            facts={free} {...mintCard('sahur')} more={{ href: '/tung', label: 'Everything about Tung Tung Tung' }} />
          {__THICCUMS__ && four ? <Card pet="thiccums" title="Thiccums" sub="The seal · free" start={3300} night={false} reel={setDThicc}
            body="Thiccums the Seal, the $THICCUMS mascot, as a pet. His one stunt, the butt bounce, counts on chain."
            facts={free} {...mintCard('thiccums')} more={{ href: '/thiccums', label: 'Everything about Thiccums' }} /> : null}
          {__R3TARDS__ && five ? <Card pet="r3tards" title="r3tardgotchi" sub="The r3tard · free" start={3800} night={false} reel={setDR3}
            body="The r3tards face on a stick figure body, as a pet. No stunt: he just needs feeding. His own crown and leaderboard."
            facts={free} {...mintCard('r3tards')} more={{ href: '/r3tardgotchi', label: 'Everything about the r3tard' }} /> : null}
          <Card pet="cat" title="Emogotchi" sub="The cat · claim" start={4200} night={false} reel={() => {}}
            body="The first pet: 82,000 cats, airdropped to Monad. Every feed, wash, play and nap costs 1 MON, and 80% of it buys EMO and burns it."
            facts={[{ icon: 'heart', text: 'Claim if your wallet is on the list' }, { icon: 'flame', text: 'Every care is 1 MON; 80% burns EMO' }, { icon: 'coin', text: 'Its own crown and leaderboard' }]}
            action={<CatAction c={cat} w={w} />} note={catNote(cat)} more={{ href: '/claim', label: 'The claim, and check any wallet' }} />
        </section>
        <section className="claim-rules adopt-rules" aria-label="All three">
          <span><Icon name="heart" size={20} /> Four meters, a poop every meal, naps and a crown for the best kept</span>
          <span><Icon name="grave" size={20} /> Only hunger kills: two days without food</span>
          <span><Icon name="coin" size={20} /> Every item in the shop fits every pet</span>
        </section>
      </main>
      <SiteFooter />
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={() => { location.href = '/'; }} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(nw) => { setWallet(nw); setModal(false); }} />
    </div>
  );
}
