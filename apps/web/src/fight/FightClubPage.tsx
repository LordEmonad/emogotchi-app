/**
 * Fight Club, the page (/fightclub; the SANDBOX's, DEV ONLY until the operator approves it): the open challenges, putting
 * one up, taking one, your fights, and the fight itself in the ring with its proof. Every number and every result is
 * the contract's (fight/chain.ts); the page only shows it and asks the wallet to sign.
 */
import { SoundControl } from '../sound/Control';
import { useMusic } from '../sound/useMusic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import type { CatView } from '@emo-pets/chain';
import { Header } from '../ui/Header';
import { SiteFooter } from '../ui/SiteFooter';
import { ConnectModal } from '../ui/ConnectModal';
import { useMintWallet } from '../ui/Mint';
import { getProvider } from '../wallet';
import { chainCfg, chainClient } from '../game/chain';
import { PETS, fallbackName, petHref } from '../pets';
import { costumesOf } from '../items';
import { fightCardName, renderFightCard } from './fightCard';
import { avatarSrc } from '../social/ui';
import { cardFor, useCards } from '../social/cards';
import { Arena } from './Arena';
import { planFight, type FightDirector, type Fighter } from './fightDirector';
import { FEE_PCT, MAX_STAKE, MIN_STAKE, canFight, fightCharOf, fightClient, mon, winnerSide, type Fight, type PetRef } from './chain';
import './arena.css';
import './page.css';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** An error for people: one line, no request dumps (a timed-out RPC call once printed its whole hex body across the page). */
const plain = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/took too long|timed? ?out|fetch failed|HTTP request failed|429|rate/i.test(m)) return 'Monad is slow to answer right now. Try again in a moment.';
  return m.split('\n')[0]!.slice(0, 180);
};
/** the sandbox's local world (tools/fightclub/local.mjs): its faucet, for test MON and free pets on the fork */
const FAUCET = (import.meta.env.VITE_FIGHT_FAUCET as string | undefined) || null;

function Faucet({ me, onDone }: { me: string; onDone: () => void }) {
  const [state, setState] = useState<string | null>(null);
  return (
    <div className="fcp-owed fcp-faucet">
      <span><b>Local fork.</b> Test MON and pets cost nothing here and nothing leaves your machine.</span>
      <button className="btn btn-pink" disabled={state === '…'} onClick={async () => {
        setState('…');
        try { const r = await (await fetch(`${FAUCET}/fund?address=${me}`)).json() as { pets?: string[]; error?: string }; setState(r.error ?? `10,000 MON${r.pets?.length ? ` and ${r.pets.join(', ')}` : ''}`); onDone(); }
        catch (e) { setState((e as Error).message); }
      }}>Get test MON and pets</button>
      {state && state !== '…' && <small>{state}</small>}
    </div>
  );
}
const who = (a: string | null | undefined, me: string | null) => (!a ? 'anyone' : me && a.toLowerCase() === me ? 'you' : cardFor(a)?.name ?? short(a));
const key = (p: PetRef) => `${p.col}:${p.id}`;
const ago = (s: number) => { const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? 'just now' : d < 3600 ? `${Math.floor(d / 60)}m ago` : d < 86400 ? `${Math.floor(d / 3600)}h ago` : `${Math.floor(d / 86400)}d ago`; };
const left = (s: number) => { const d = Math.max(0, s - Date.now() / 1000); return d > 3600 ? `${Math.floor(d / 3600)}h left` : `${Math.max(1, Math.floor(d / 60))}m left`; };

/** Pet views by key, read once each (names, moods, crowns, outfits for the ring). */
function usePetViews(pets: PetRef[]) {
  const [views, setViews] = useState<Record<string, CatView & { worn?: number[] }>>({});
  const want = useMemo(() => [...new Set(pets.map(key))].sort().join(','), [pets]);
  useEffect(() => {
    if (!chainClient || !want) return;
    let live = true;
    const missing = want.split(',').filter((k) => !views[k]);
    void Promise.all(missing.map(async (k) => {
      const [col, id] = k.split(':') as [PetRef['col'], string];
      const v = await chainClient!.cat(Number(id), col).catch(() => null);
      const worn = await chainClient!.equippedMany([Number(id)], col).then((m) => m[Number(id)] ?? []).catch(() => []);
      return v ? ([k, { ...v, worn }] as const) : null;
    })).then((rows) => { if (live) setViews((old) => { const n = { ...old }; for (const r of rows) if (r) n[r[0]] = r[1]; return n; }); });
    return () => { live = false; };
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  return views;
}

export function FightClubPage() {
  const w = useMintWallet();
  useMusic({ place: 'tavern', fight: false });   // the Tavern's own tune; a fight in the ring brings the drums (FightWatch)
  // the local world's test wallet (only when the local faucet is set): one click, no passkey, no browser wallet
  const [testWallet, setTestWallet] = useState<{ address: string; provider: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } } | null>(null);
  const me = testWallet ? testWallet.address.toLowerCase() : w.connected && w.wallet.address ? w.wallet.address.toLowerCase() : null;
  useEffect(() => {
    const provider = testWallet ? testWallet.provider : (getProvider() as never);
    const signer = me ? { provider: provider as never, address: me as Address } : null;
    fightClient?.setSigner(signer); chainClient?.setSigner(signer);
  }, [me, testWallet]);
  const startTestWallet = async () => {
    const rpc = chainCfg?.rpcUrl; if (!rpc) return;
    const { localTestWallet } = await import('./burner');
    setTestWallet(localTestWallet(rpc));
  };
  const [open, setOpen] = useState<Fight[] | null>(null);
  const [mine, setMine] = useState<Fight[] | null>(null);
  const [owed, setOwed] = useState(0n);
  const [fee, setFee] = useState<bigint | null>(null);
  const [myPets, setMyPets] = useState<CatView[] | null>(null);
  const [watch, setWatch] = useState<number | null>(null);
  const [share, setShare] = useState<Fight | null>(null);   // the fight card sheet (copy or download, nothing posted)
  // the record of every fight (FightRecord); `?record=1` opens the page on it
  const [record, setRecord] = useState(() => new URLSearchParams(location.search).has('record'));
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fightClient) return;
    try {
      const [o, q, n] = await Promise.all([fightClient.open(), fightClient.quote(), fightClient.count()]);
      setOpen(o); setFee(q); setCount(n);
      if (me) { const [m, ow] = await Promise.all([fightClient.fightsOf(me as Address), fightClient.owed(me as Address)]); setMine(m); setOwed(ow); }
      else { setMine(null); setOwed(0n); }
    } catch (e) { setErr(plain(e)); }
  }, [me]);
  useEffect(() => { void load(); const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!me || !chainClient) { setMyPets(null); return; } void chainClient.petsOf(me as Address).then((v) => setMyPets(v.filter((p) => canFight(p.col)))).catch(() => setMyPets([])); }, [me]);   // only the three collections the contract takes
  // a fight of yours that has just been decided opens in the ring by itself, once; any fight opened is marked seen
  const [seen, setSeen] = useState<Record<number, true>>({});
  const openWatch = (id: number) => { setSeen((s) => ({ ...s, [id]: true })); setWatch(id); };
  useEffect(() => {
    const fresh = mine?.find((f) => f.status === 'fought' && f.foughtAt > Date.now() / 1000 - 120 && !seen[f.id]);
    if (fresh && watch === null) openWatch(fresh.id);
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps

  useCards([...(open ?? []), ...(mine ?? [])].flatMap((f) => [f.challenger, f.acceptor, f.opponent].filter(Boolean) as string[]));
  const busyPets = new Set((mine ?? []).filter((f) => f.status === 'open' || f.status === 'pending').flatMap((f) => [f.challengerPet, f.acceptorPet].filter(Boolean).map((p) => key(p!))));
  const views = usePetViews([...(open ?? []).map((f) => f.challengerPet), ...(mine ?? []).flatMap((f) => [f.challengerPet, f.acceptorPet].filter(Boolean) as PetRef[])]);

  const run = async (label: string, f: () => Promise<unknown>) => {
    setErr(null); setBusy(label);
    try { await f(); await load(); } catch (e) { setErr(plain(e)); } finally { setBusy(null); }
  };

  if (!fightClient) {
    return <div className="page fcp"><Header wallet={w.wallet} onConnect={() => w.setModal(true)} onDisconnect={w.doDisconnect} /><main className="fcp-main"><h1>Fight Club</h1><p className="fcp-note">This build has no Fight Club contract (VITE_FIGHTCLUB_ADDRESS). In the sandbox, start it with <code>node tools/fightclub/local.mjs</code>.</p></main><SiteFooter /></div>;
  }
  const forMe = (open ?? []).filter((f) => f.challenger.toLowerCase() !== me && (!f.opponent || f.opponent.toLowerCase() === me));
  const others = (open ?? []).filter((f) => f.opponent && f.opponent.toLowerCase() !== me && f.challenger.toLowerCase() !== me);

  return (
    <div className="page fcp">
      <Header wallet={w.wallet} onConnect={() => w.setModal(true)} onDisconnect={w.doDisconnect} />
      <main className="fcp-main">
        <section className="fcp-hero">
          <div className="fcp-hero-text">
            <h1>Emogotchi Fight Club</h1>
            <p>Any pet against any pet. Both owners put up the same MON, the chain picks the winner at random, 50/50, and the winner takes the pot.</p>
            <ul className="fcp-facts">
              <li><b>{MIN_STAKE} to {MAX_STAKE.toLocaleString('en-US')} MON</b> a side</li>
              <li><b>Winner takes the pot</b>, less a {FEE_PCT}% fee</li>
              <li><b>Provably random</b>: Pyth Entropy on Monad</li>
              <li><b>A belt for a day</b> for the winner, a black eye for the loser</li>
            </ul>
            <button className="btn btn-ghost fcp-record-btn" onClick={() => setRecord(true)}>Fight record{count ? <small>{count.toLocaleString('en-US')}</small> : null}</button>
            <SoundControl className="fcp-sound" />
          </div>
          <DemoRing />
        </section>
        {owed > 0n && <div className="fcp-owed">You have <b>{mon(owed)} MON</b> waiting (a payout your wallet could not take at the time). <button className="btn btn-pink" disabled={!!busy} onClick={() => void run('withdraw', () => fightClient!.withdraw())}>Withdraw it</button></div>}
        {err && <p className="fcp-err" role="alert">{err}</p>}
        {!me && <div className="fcp-connect"><p>Connect a wallet to put up a fight or take one.</p><span className="fcp-connect-btns">{FAUCET && <button className="btn btn-pink" onClick={() => void startTestWallet()}>Use a local test wallet</button>}<button className={`btn ${FAUCET ? 'btn-ghost' : 'btn-pink'}`} onClick={() => w.setModal(true)}>Connect</button></span></div>}
        {testWallet && <p className="fcp-note">Local test wallet {testWallet.address.slice(0, 8)}…: a key kept in this browser, signing to the local fork only.</p>}
        {me && FAUCET && <Faucet me={me} onDone={() => { void chainClient?.petsOf(me as Address).then(setMyPets); void load(); }} />}

        <section className="fcp-sec">
          <h2>Open fights {open ? <small>{forMe.length}</small> : null}</h2>
          {!open && <p className="fcp-note">Reading the ring…</p>}
          {open && forMe.length === 0 && <p className="fcp-note">Nobody is waiting for a fight right now. Put one up.</p>}
          <div className="fcp-cards">
            {forMe.map((f) => <OpenCard key={f.id} f={f} me={me} view={views[key(f.challengerPet)]} myPets={myPets} busyPets={busyPets} fee={fee} busy={busy} onAccept={(p) => void run(`accept-${f.id}`, async () => { await fightClient!.accept(f, p); openWatch(f.id); })} />)}
          </div>
          {others.length > 0 && <p className="fcp-note">{others.length} more {others.length === 1 ? 'is a challenge' : 'are challenges'} for someone in particular.</p>}
        </section>

        {me && <ChallengeForm myPets={myPets} busyPets={busyPets} busy={busy} onChallenge={(p, stake, opp) => run('challenge', () => fightClient!.challenge(p, stake, opp))} />}

        {me && (
          <section className="fcp-sec">
            <h2>Your fights</h2>
            {mine?.length === 0 && <p className="fcp-note">No fights yet.</p>}
            <ul className="fcp-mine">
              {mine?.map((f) => <MineRow key={f.id} f={f} me={me} views={views} busy={busy} onWatch={() => openWatch(f.id)} onShare={() => setShare(f)} onCancel={() => void run(`cancel-${f.id}`, () => fightClient!.cancel(f.id))} onAbort={() => void run(`abort-${f.id}`, () => fightClient!.abort(f.id))} />)}
            </ul>
          </section>
        )}

        <section className="fcp-sec fcp-rules">
          <h2>The rules</h2>
          <ul>
            <li>Put up a challenge with one of your pets and a stake from {MIN_STAKE} to {MAX_STAKE.toLocaleString('en-US')} MON, for anyone or for one person. It stays up a day; you can take it down any time before someone takes it.</li>
            <li>To take a fight, put up the same stake with one of your pets. You also pay the random number's fee (about {fee ? mon(fee) : '1.4'} MON, Pyth's).</li>
            <li>The winner is decided by Pyth Entropy's random number: even, the challenger wins; odd, the one who took it. Nobody, us included, can see it or change it first.</li>
            <li>The winner is paid the whole pot less {FEE_PCT}% at once. If the random number never comes (a day), anyone can call it off and both stakes come back; the random number's fee (about 1.4 MON) stays with Pyth, who were paid to roll it.</li>
            <li>Your pet is never at stake. The loser wears a black eye for a day, the winner a championship belt.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
      {record && <FightRecord me={me} covered={watch !== null || share !== null} onWatch={openWatch} onShare={(f) => setShare(f)} onClose={() => setRecord(false)} />}
      {watch !== null && <FightWatch id={watch} me={me} onClose={() => setWatch(null)} onShare={(f) => setShare(f)} />}
      {share && <FightShare f={share} onClose={() => setShare(null)} />}
      <ConnectModal open={w.modal} onClose={() => w.setModal(false)} onInjected={() => void w.doInjected()} onWalletConnect={() => void w.doWalletConnect()} onDemo={() => { location.href = '/'; }} error={w.wallet.error} busy={w.wallet.status === 'connecting'} onConnected={(nw) => { w.setWallet(nw); w.setModal(false); }} />
    </div>
  );
}

function PetChip({ p, view, size = 44 }: { p: PetRef; view?: CatView; size?: number }) {
  const src = avatarSrc(p, view ?? null);
  return (
    <a className="fcp-pet" href={petHref(p.col, p.id)} target="_blank" rel="noreferrer">
      <span className="fcp-av" style={{ width: size, height: size }}>{src && <img src={src} alt="" width={size} height={size} />}</span>
      <span className="fcp-pet-name"><b>{view?.name || fallbackName(p.col, p.id)}</b><small>{PETS[p.col].one} #{p.id}{view && !view.alive ? ' · a ghost' : ''}</small></span>
    </a>
  );
}

function OpenCard({ f, me, view, myPets, busyPets, fee, busy, onAccept }: { f: Fight; me: string | null; view?: CatView; myPets: CatView[] | null; busyPets: Set<string>; fee: bigint | null; busy: string | null; onAccept: (p: PetRef) => void }) {
  const [picking, setPicking] = useState(false);
  const pets = (myPets ?? []).filter((v) => !busyPets.has(key({ col: v.col, id: v.id })));
  // dead pets do not fight: theirs voids the challenge, yours stay in the list but cannot be picked
  const theirsDead = !!view && !view.alive;
  return (
    <article className={`fcp-card${f.opponent ? ' direct' : ''}`}>
      <PetChip p={f.challengerPet} view={view} />
      <div className="fcp-card-mid">
        <span className="fcp-stake">{mon(f.stake)} MON</span>
        <small>by {who(f.challenger, me)} · {f.opponent ? <b className="fcp-for">for you</b> : 'open to anyone'} · {left(f.expiresAt)}</small>
      </div>
      {theirsDead && <small className="fcp-note">Their pet has died, so this challenge is off.</small>}
      {/* a challenge made straight at the contract can be under the site's floor; then the fee is most of what the taker risks */}
      {!theirsDead && f.stake < parseEther(String(MIN_STAKE)) && <small className="fcp-note">Under the site's {MIN_STAKE} MON floor: the random number's fee ({fee ? mon(fee) : 'about 1.4'} MON) is more than the stake.</small>}
      {me && !picking && !theirsDead && <button className="btn btn-pink" disabled={!!busy} onClick={() => setPicking(true)}>Fight them</button>}
      {picking && (
        <div className="fcp-pick">
          <p>Pick your fighter. You put up <b>{mon(f.stake)} MON</b> plus the random number's fee ({fee ? mon(fee) : '…'} MON); the winner takes <b>{mon((f.stake * 2n * 95n) / 100n)} MON</b>.</p>
          {pets.length === 0 && <p className="fcp-note">No free pet in this wallet. <a href="/adopt">Get one free</a>.</p>}
          <div className="fcp-pick-row">{pets.map((v) => <button key={key(v)} className="fcp-pick-pet" disabled={!!busy || !v.alive} title={v.alive ? undefined : DEAD_NOTE} onClick={() => onAccept({ col: v.col, id: v.id })}><PetChipInner v={v} /></button>)}</div>
          <button className="btn btn-ghost" onClick={() => setPicking(false)}>Not now</button>
        </div>
      )}
    </article>
  );
}
const DEAD_NOTE = 'Dead pets cannot fight. Revive it first.';
function PetChipInner({ v }: { v: CatView }) {
  const src = avatarSrc({ col: v.col, id: v.id }, v);
  return <><span className="fcp-av" style={{ width: 40, height: 40 }}>{src && <img src={src} alt="" width={40} height={40} />}</span><span>{v.name || fallbackName(v.col, v.id)}{!v.alive && <small className="fcp-dead"> · dead</small>}</span></>;
}

function ChallengeForm({ myPets, busyPets, busy, onChallenge }: { myPets: CatView[] | null; busyPets: Set<string>; busy: string | null; onChallenge: (p: PetRef, stake: bigint, opponent: Address | null) => Promise<void> }) {
  const [pet, setPet] = useState<string | null>(null);
  const [stake, setStake] = useState('10');
  const [anyone, setAnyone] = useState(true);
  const [opp, setOpp] = useState('');
  const n = Number(stake);
  const okStake = Number.isFinite(n) && n >= MIN_STAKE && n <= MAX_STAKE;
  const oppAddr = /^0x[0-9a-fA-F]{40}$/.test(opp.trim()) ? (opp.trim() as Address) : null;
  const p = pet ? { col: pet.split(':')[0] as PetRef['col'], id: Number(pet.split(':')[1]) } : null;
  return (
    <section className="fcp-sec fcp-form">
      <h2>Put up a fight</h2>
      <div className="fcp-field"><span>Your fighter</span>
        <div className="fcp-pick-row">
          {myPets === null && <span className="fcp-note">Reading your pets…</span>}
          {myPets?.length === 0 && <span className="fcp-note">No cat, inversebrah or Sahur in this wallet (those are the ones that fight). <a href="/adopt">Get one free</a>.</span>}
          {myPets?.map((v) => { const k = key({ col: v.col, id: v.id }); const b = busyPets.has(k); return <button key={k} className={`fcp-pick-pet${pet === k ? ' on' : ''}`} disabled={b || !v.alive} title={!v.alive ? DEAD_NOTE : b ? 'Already in a fight or a challenge' : undefined} onClick={() => setPet(k)}><PetChipInner v={v} /></button>; })}
        </div>
      </div>
      <div className="fcp-field"><span>Stake (MON, a side)</span>
        <div className="fcp-stakes">{[5, 10, 50, 100, 500, 1000].map((s) => <button key={s} className={`chip-btn${Number(stake) === s ? ' is-on' : ''}`} onClick={() => setStake(String(s))}>{s}</button>)}
          <input className="fcp-input" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" aria-label="Stake in MON" />
        </div>
        {!okStake && <small className="fcp-err">{MIN_STAKE} to {MAX_STAKE.toLocaleString('en-US')} MON.</small>}
        {okStake && <small className="fcp-note">The winner takes {(n * 2 * 0.95).toLocaleString('en-US', { maximumFractionDigits: 2 })} MON.</small>}
      </div>
      <div className="fcp-field"><span>Against</span>
        <div className="fcp-stakes">
          <button className={`chip-btn${anyone ? ' is-on' : ''}`} onClick={() => setAnyone(true)}>Anyone</button>
          <button className={`chip-btn${!anyone ? ' is-on' : ''}`} onClick={() => setAnyone(false)}>One person</button>
          {!anyone && <input className="fcp-input wide" value={opp} onChange={(e) => setOpp(e.target.value)} placeholder="Their 0x address" aria-label="Their address" />}
        </div>
      </div>
      <button className="btn btn-pink fcp-go" disabled={!p || !okStake || (!anyone && !oppAddr) || !!busy} onClick={() => { if (p) void onChallenge(p, parseEther(String(n)), anyone ? null : oppAddr).then(() => setPet(null)); }}>
        {busy === 'challenge' ? 'Confirm in your wallet…' : `Put up ${okStake ? n : '…'} MON`}
      </button>
    </section>
  );
}

function MineRow({ f, me, views, busy, onWatch, onShare, onCancel, onAbort }: { f: Fight; me: string; views: Record<string, CatView>; busy: string | null; onWatch: () => void; onShare: () => void; onCancel: () => void; onAbort: () => void }) {
  const mineIsA = f.challenger.toLowerCase() === me;
  const minePet = mineIsA ? f.challengerPet : f.acceptorPet;
  const theirPet = mineIsA ? f.acceptorPet : f.challengerPet;
  const won = f.winner?.toLowerCase() === me;
  const now = Date.now() / 1000;
  return (
    <li className={`fcp-row s-${f.status}${f.status === 'fought' ? (won ? ' won' : ' lost') : ''}`}>
      {minePet && <PetChip p={minePet} view={views[key(minePet)]} size={36} />}
      <span className="fcp-vs">vs</span>
      {theirPet ? <PetChip p={theirPet} view={views[key(theirPet)]} size={36} /> : <span className="fcp-note">{f.opponent ? `waiting for ${who(f.opponent, me)}` : 'waiting for anyone'}</span>}
      <span className="fcp-row-end">
        <span className="fcp-stake small">{mon(f.stake)} MON</span>
        {f.status === 'open' && <><small>{left(f.expiresAt)}</small><button className="chip-btn" disabled={!!busy} onClick={onCancel}>Take it down</button></>}
        {f.status === 'pending' && <><small className="fcp-rolling">the dice are rolling…</small>{now >= f.abortableAt && <button className="chip-btn" disabled={!!busy} onClick={onAbort}>Call it off</button>}</>}
        {f.status === 'fought' && <><b className="fcp-result">{won ? `Won ${mon(f.payout)} MON` : 'Lost'}</b><small>{ago(f.foughtAt)}</small><button className="chip-btn" onClick={onWatch}>Watch</button><button className="chip-btn" onClick={onShare} title="A picture of this fight to share">Card</button></>}
        {f.status === 'cancelled' && <small>taken down</small>}
        {f.status === 'aborted' && <small>called off, stakes back</small>}
      </span>
    </li>
  );
}

/** MON for the record's totals: thousands separated, two decimals at most. */
const monBig = (v: bigint) => Number(formatEther(v)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const when = (s: number) => new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** A fight that can no longer change. Each is read once a visit and kept; open and pending ones are read again. */
const settled = (f: Fight) => f.status === 'fought' || f.status === 'cancelled' || f.status === 'aborted';
const kept = new Map<number, Fight>();
const PAGE = 40;

/**
 * Every fight there has ever been, newest first, read off the contract by id (1..fightCount) a page at a time, so the
 * newest show at once and the totals once the last page is in.
 */
function useRecord() {
  const [rec, setRec] = useState<{ total: number; fights: Fight[]; complete: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; let running = false;
    const publish = (total: number) => {
      const fights: Fight[] = [];
      for (let i = total; i >= 1; i--) { const f = kept.get(i); if (f) fights.push(f); }
      if (live) setRec({ total, fights, complete: fights.length === total });
    };
    const pass = async () => {
      if (running) return;
      running = true;
      try {
        const total = await fightClient!.count();
        for (let hi = total; hi >= 1 && live; hi -= PAGE) {
          const ids: number[] = [];
          for (let i = hi; i > Math.max(0, hi - PAGE); i--) { const f = kept.get(i); if (!f || !settled(f)) ids.push(i); }
          if (ids.length) for (const f of await fightClient!.many(ids)) kept.set(f.id, f);
          publish(total);
        }
        if (total === 0) publish(0);
        if (live) setErr(null);
      } catch (e) { if (live) setErr(plain(e)); } finally { running = false; }
    };
    void pass();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void pass(); }, 10_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return { rec, err };
}

type RecordFilter = 'all' | 'decided' | 'mine';
/** by date (newest or oldest first) or by pot (biggest or smallest first); a second press on the same one turns it round */
type RecordSort = 'new' | 'old' | 'big' | 'small';

/**
 * The record: every fight ever and how it ended, with the totals; newest first unless sorted otherwise. A decided
 * fight can be watched again (the ring replays it from its own random number).
 */
function FightRecord({ me, covered, onWatch, onShare, onClose }: { me: string | null; covered: boolean; onWatch: (id: number) => void; onShare: (f: Fight) => void; onClose: () => void }) {
  const { rec, err } = useRecord();
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [shown, setShown] = useState(25);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !covered) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [covered, onClose]);
  const [sort, setSort] = useState<RecordSort>('new');
  const listRef = useRef<HTMLUListElement>(null);
  const all = useMemo(() => rec?.fights ?? [], [rec]);
  const decided = useMemo(() => all.filter((f) => f.status === 'fought'), [all]);
  const mine = useMemo(() => all.filter((f) => !!me && (f.challenger.toLowerCase() === me || f.acceptor?.toLowerCase() === me)), [all, me]);
  const list = filter === 'decided' ? decided : filter === 'mine' ? mine : all;
  // `list` is newest first. By pot is by the stake a side (the pot is twice it), the newer fight first among equals.
  const sorted = useMemo(() => {
    if (sort === 'new') return list;
    if (sort === 'old') return [...list].reverse();
    const dir = sort === 'big' ? 1 : -1;
    return [...list].sort((a, b) => (a.stake === b.stake ? b.id - a.id : a.stake < b.stake ? dir : -dir));
  }, [list, sort]);
  const done = !!rec?.complete;
  // any order but newest first needs the whole record: until the last page is in, the first rows would be the wrong ones
  const ordered = sort === 'new' || done;
  const rows = ordered ? sorted.slice(0, shown) : [];
  const totals = useMemo(() => {
    let wagered = 0n, paid = 0n, top = 0n;
    for (const f of decided) { wagered += f.stake * 2n; paid += f.payout; if (f.stake * 2n > top) top = f.stake * 2n; }
    return { wagered, paid, top };
  }, [decided]);
  const views = usePetViews(rows.flatMap((f) => [f.challengerPet, f.acceptorPet].filter(Boolean) as PetRef[]));
  useCards(rows.flatMap((f) => [f.challenger, f.acceptor].filter(Boolean) as string[]));
  const top = () => { setShown(25); listRef.current?.scrollTo(0, 0); };
  const pick = (f: RecordFilter) => { setFilter(f); top(); };
  const byDate = sort === 'new' || sort === 'old';
  const order = (s: RecordSort) => { setSort(s); top(); };
  return (
    <div className="modal-back fcr" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fcr-box" role="dialog" aria-modal="true" aria-label="Fight record">
        <header className="fcr-head">
          <div><h2>Fight record</h2><p>Every fight since the club opened, read from the contract.</p></div>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="fcr-tiles">
          <div className="fcr-tile"><b>{done ? decided.length.toLocaleString('en-US') : '…'}</b><small>Fights fought</small></div>
          <div className="fcr-tile"><b>{done ? monBig(totals.wagered) : '…'}</b><small>MON wagered</small></div>
          <div className="fcr-tile"><b>{done ? monBig(totals.paid) : '…'}</b><small>MON paid to winners</small></div>
          <div className="fcr-tile"><b>{done ? monBig(totals.top) : '…'}</b><small>Biggest pot, MON</small></div>
        </div>
        <div className="fcr-filters">
          <button className={`chip-btn${filter === 'all' ? ' is-on' : ''}`} onClick={() => pick('all')}>All{rec ? ` · ${rec.total.toLocaleString('en-US')}` : ''}</button>
          <button className={`chip-btn${filter === 'decided' ? ' is-on' : ''}`} onClick={() => pick('decided')}>Decided{done ? ` · ${decided.length.toLocaleString('en-US')}` : ''}</button>
          {me && <button className={`chip-btn${filter === 'mine' ? ' is-on' : ''}`} onClick={() => pick('mine')}>Yours{done ? ` · ${mine.length.toLocaleString('en-US')}` : ''}</button>}
          <div className="fcr-sort" role="group" aria-label="Sort the fights">
            <span>Sort</span>
            <button className={`chip-btn${byDate ? ' is-on' : ''}`} title={byDate ? 'Press again to turn the order round' : undefined} onClick={() => order(byDate ? (sort === 'new' ? 'old' : 'new') : 'new')}>
              {sort === 'old' ? 'Oldest first' : 'Newest first'}{byDate && <i className="fcr-flip" aria-hidden="true">↑↓</i>}
            </button>
            <button className={`chip-btn${!byDate ? ' is-on' : ''}`} title={!byDate ? 'Press again to turn the order round' : undefined} onClick={() => order(!byDate ? (sort === 'big' ? 'small' : 'big') : 'big')}>
              {sort === 'small' ? 'Smallest pot' : 'Biggest pot'}{!byDate && <i className="fcr-flip" aria-hidden="true">↑↓</i>}
            </button>
          </div>
        </div>
        {err && !rec && <p className="fcp-err" role="alert">{err}</p>}
        {!rec && !err && <p className="fcp-note">Reading the record…</p>}
        {rec && list.length === 0 && done && <p className="fcp-note">{filter === 'mine' ? 'No fights of yours yet.' : 'No fights yet.'}</p>}
        <ul className="fcr-list" ref={listRef}>
          {rows.map((f) => <RecordRow key={f.id} f={f} me={me} views={views} onWatch={() => onWatch(f.id)} onShare={() => onShare(f)} />)}
          {((ordered && list.length > shown) || (rec && !done)) && (
            <li className="fcr-more">{ordered && list.length > shown
              ? <button className="chip-btn" onClick={() => setShown((n) => n + 25)}>{sort === 'new' ? 'Show older fights' : 'Show more fights'}</button>
              : <span className="fcp-note">{ordered ? 'Reading older fights…' : 'Reading the whole record…'}</span>}</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function RecordRow({ f, me, views, onWatch, onShare }: { f: Fight; me: string | null; views: Record<string, CatView>; onWatch: () => void; onShare: () => void }) {
  const A = f.challengerPet; const B = f.acceptorPet;
  const side = f.status === 'fought' && f.random ? winnerSide(f.random) : null;
  const winner = side === null ? null : side === 0 ? A : B;
  const at = f.status === 'fought' ? f.foughtAt : f.createdAt;
  const expired = f.status === 'open' && f.expiresAt <= Date.now() / 1000;
  return (
    <li className={`fcr-row s-${f.status}`}>
      <div className="fcr-pair">
        <RecordSide p={A} owner={f.challenger} view={views[key(A)]} me={me} mark={side === null ? null : side === 0 ? 'won' : 'lost'} />
        <span className="fcp-vs">vs</span>
        {B && f.acceptor
          ? <RecordSide p={B} owner={f.acceptor} view={views[key(B)]} me={me} mark={side === null ? null : side === 1 ? 'won' : 'lost'} />
          : <span className="fcp-note">{f.status === 'open' && !expired ? (f.opponent ? `waiting for ${who(f.opponent, me)}` : 'waiting for anyone') : 'nobody took it'}</span>}
      </div>
      <div className="fcr-end">
        {f.status === 'fought' && winner && <b className="fcp-result">{views[key(winner)]?.name || fallbackName(winner.col, winner.id)} won {mon(f.payout)} MON</b>}
        {f.status === 'open' && <b className="fcr-live">{expired ? 'Expired' : `Open · ${left(f.expiresAt)}`}</b>}
        {f.status === 'pending' && <b className="fcp-rolling">The dice are rolling…</b>}
        {f.status === 'cancelled' && <b className="fcr-off">Taken down, stake back</b>}
        {f.status === 'aborted' && <b className="fcr-off">Called off, stakes back</b>}
        <small title={when(at)}>Fight #{f.id} · {mon(f.stake)} MON a side · {ago(at)}</small>
      </div>
      {f.status === 'fought' && <span className="fcr-acts"><button className="chip-btn fcr-watch" onClick={onWatch}>Watch</button><button className="chip-btn fcr-watch" onClick={onShare} title="A picture of this fight to share">Card</button></span>}
    </li>
  );
}

function RecordSide({ p, owner, view, me, mark }: { p: PetRef; owner: string; view?: CatView; me: string | null; mark: 'won' | 'lost' | null }) {
  return (
    <div className={`fcr-side${mark ? ` ${mark}` : ''}`}>
      <PetChip p={p} view={view} size={36} />
      <a className="fcr-by" href={`/u/${owner}`} target="_blank" rel="noreferrer">{who(owner, me)}{mark === 'won' && <i>won</i>}</a>
    </div>
  );
}

/** The ring on the page's hero: two random pets squaring up and going at it now and then (no chain, just the show). */
function DemoRing() {
  const [pair, setPair] = useState<[PetRef['col'], PetRef['col']]>(['cat', 'sahur']);
  const [n, setN] = useState(0);
  const onDirector = (d: FightDirector | null) => {
    if (!d) return;
    d.muted = true;   // a loop for show: it makes no sound
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    void d.play(planFight(seed, winnerSide(`0x${seed}`))).then(() => setTimeout(() => {
      const all = ['cat', 'frok', 'sahur'] as const;
      setPair([all[Math.floor(Math.random() * 3)]!, all[Math.floor(Math.random() * 3)]!]); setN((x) => x + 1);
    }, 3500));
  };
  return <div className="fcp-demo"><Arena key={n} left={fightCharOf(pair[0])} right={fightCharOf(pair[1])} onDirector={onDirector} /></div>;
}

/**
 * One fight, in the ring: waits for Pyth's number if it is still coming (a countdown meanwhile), dresses both pets as
 * they are, plays the fight to the chain's result, then says who won and shows the proof.
 */
function FightWatch({ id, me, onClose, onShare }: { id: number; me: string | null; onClose: () => void; onShare: (f: Fight) => void }) {
  const [f, setF] = useState<Fight | null>(null);
  const [phase, setPhase] = useState<'wait' | 'count' | 'fight' | 'done'>('wait');
  useMusic(phase === 'fight' || phase === 'count' ? { place: 'tavern', fight: true } : null);
  const [count, setCount] = useState(3);
  const [d, setD] = useState<FightDirector | null>(null);
  const [fighters, setFighters] = useState<[Fighter, Fighter] | null>(null);
  const views = usePetViews(f ? ([f.challengerPet, f.acceptorPet].filter(Boolean) as PetRef[]) : []);
  useEffect(() => {
    let live = true;
    const tick = async () => { const x = await fightClient!.fight(id).catch(() => null); if (!live || !x) return; setF(x); if (x.status === 'pending' || x.status === 'open') setTimeout(() => void tick(), 1500); };
    void tick();
    return () => { live = false; };
  }, [id]);
  // dress the fighters as they are: outfits, crowns
  useEffect(() => {
    if (!fighters || !f) return;
    const pets = [f.challengerPet, f.acceptorPet];
    fighters.forEach((ft, i) => { const v = pets[i] && views[key(pets[i]!)]; if (!v) return; ft.rig.setCrown(!!v.crowned); ft.rig.setCostumes(costumesOf((v as CatView & { worn?: number[] }).worn ?? [], PETS[v.col].character)); });
  }, [fighters, views, f]);
  // the countdown once both are in, then the fight once the number is in. (Two effects: an effect that sets the phase
  // and runs the timer would clear its own timer on the re-render its phase change causes; the count stuck at 3.)
  useEffect(() => { if (f && d && phase === 'wait') { setCount(3); setPhase('count'); } }, [f, d, phase]);
  useEffect(() => {
    if (phase !== 'count') return;
    const t = setInterval(() => setCount((c) => { if (c <= 1) clearInterval(t); return Math.max(0, c - 1); }), 900);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'count' || count > 0 || !f || !d || f.status !== 'fought' || !f.random) return;
    setPhase('fight');
    void d.play(planFight(f.random.slice(2), winnerSide(f.random))).then(() => setPhase('done'));
  }, [phase, count, f, d]);
  const A = f?.challengerPet; const B = f?.acceptorPet;
  const nameOf = (p?: PetRef | null) => (p ? views[key(p)]?.name || fallbackName(p.col, p.id) : '…');
  const wonSide = f?.random ? winnerSide(f.random) : null;
  return (
    <div className="modal-back fcp-watch" onPointerDown={(e) => { if (e.target === e.currentTarget && phase === 'done') onClose(); }}>
      <div className="fcp-watch-box" role="dialog" aria-modal="true" aria-label="The fight">
        <header><b>{nameOf(A)}</b><i>vs</i><b>{nameOf(B)}</b><span>{f ? `${mon(f.stake)} MON a side` : ''}</span><button className="modal-x" onClick={onClose} aria-label="Close">✕</button></header>
        {A && B ? <Arena key={`${key(A)}-${key(B)}`} left={fightCharOf(A.col)} right={fightCharOf(B.col)} onDirector={(dd, ff) => { setD(dd); setFighters(ff); }}>
          {phase === 'count' && (count > 0 || f?.status !== 'fought') && <div className="fcp-count">{count > 0 ? count : 'Rolling…'}</div>}
        </Arena> : <p className="fcp-note">Waiting for the other side…</p>}
        {phase === 'done' && f && wonSide !== null && (
          <div className="fcp-verdict">
            <h3>{nameOf(wonSide === 0 ? A : B)} wins {mon(f.payout)} MON{me && f.winner?.toLowerCase() === me ? ' (that is you!)' : ''}</h3>
            <details><summary>How the winner was picked</summary>
              <p>Pyth Entropy request #{String(f.sequence)} gave the random number <code>{f.random}</code>. It ends in an {wonSide === 0 ? 'even' : 'odd'} bit, so the {wonSide === 0 ? 'challenger' : 'one who took the fight'} won. Nobody could see or change it before it landed.</p>
              {chainCfg?.explorer && <p><a href={`${chainCfg.explorer}/address/${fightClient!.address}`} target="_blank" rel="noreferrer">The contract on chain ↗</a></p>}
            </details>
            <div className="fcp-verdict-acts">
              <button className="btn btn-ghost" onClick={() => onShare(f)}>Share the card</button>
              <button className="btn btn-pink" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The fight card sheet: the picture of one decided fight (fightCard.ts), to copy or download. Nothing here posts
 * anywhere (operator, 2026-10-02: "no posting on our end"). The pets' names, crowns and outfits are read for the card,
 * which is drawn again when they arrive, so the first picture is never the last.
 */
function FightShare({ f, onClose }: { f: Fight; onClose: () => void }) {
  const views = usePetViews([f.challengerPet, f.acceptorPet].filter(Boolean) as PetRef[]);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ready = [f.challengerPet, f.acceptorPet].every((p) => !p || views[key(p)]);
  useEffect(() => {
    let live = true;
    renderFightCard(f, views).then((b) => { if (live) setBlob(b); }).catch((e) => { if (live) setNote((e as Error).message); });
    return () => { live = false; };
  }, [f, views]);
  useEffect(() => { if (!blob) return; const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  const say = (m: string) => { setNote(m); setTimeout(() => setNote(null), 5000); };
  const copy = async () => {
    if (!blob) return;
    try {
      if (!navigator.clipboard || !('ClipboardItem' in window)) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('Copied. Paste it wherever you like.');
    } catch { say('This browser will not copy images. Use Download instead.'); }
  };
  const download = () => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = fightCardName(f, views);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
    say('Saved to your downloads.');
  };
  return (
    <div className="modal-back fcp-share" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="fight-share-title">
        <div className="modal-head">
          <h2 id="fight-share-title">Fight #{f.id}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {url ? <img className="share-preview" src={url} alt={`Fight #${f.id}, the card`} /> : <div className="share-preview fcp-share-wait" aria-busy="true" />}
        <div className="share-actions">
          <button className="btn btn-pink" onClick={() => void copy()} disabled={!blob || !ready}>Copy image</button>
          <button className="btn btn-ghost" onClick={download} disabled={!blob || !ready}>Download</button>
        </div>
        <p className="modal-fine">{note ?? (ready ? 'Yours to post wherever you like.' : 'Reading both pets…')}</p>
      </div>
    </div>
  );
}
