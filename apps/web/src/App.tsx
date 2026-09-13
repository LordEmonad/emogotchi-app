import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Stage } from './scene/Stage';
import type { Director, DirectorState } from './scene/director';
import type { PropName } from './scene/props';
import { initial, isDirty, isSad, need, reduce, type PaidAction } from './game/state';
import { EMPTY_WALLET, connectDemo, connectInjected, disconnect, onAccountsChanged, restore, type WalletState } from './wallet';
import { Header } from './ui/Header';
import { ConnectModal } from './ui/ConnectModal';
import { Landing } from './ui/Landing';
import { PetView } from './ui/PetView';
import { NoPet } from './ui/NoPet';
import { NftPreview } from './ui/NftPreview';
import { NftArt, NFT_STATES, type NftState } from './ui/NftArt';
import { DevDrawer, type ViewOverride } from './ui/DevDrawer';
import { Leaderboard } from './ui/Leaderboard';
import { Icon } from './ui/Icon';

const NEED_ICON: Record<NonNullable<ReturnType<typeof need>>, PropName> = { food: 'bowl', clean: 'sponge', fun: 'yarn', energy: 'moon', poop: 'poop' };
type Toast = { id: number; text: string; emo: string };
const NAME_KEY = 'emogotchi.name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const EMPTY: DirectorState = { x: 300, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false };

export function App() {
  // ---- routes ----
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/nft') {
    const card = params.get('card') as NftState | null;
    if (card && (NFT_STATES as readonly string[]).includes(card)) return <div className="card-only"><NftArt state={card} still crown={params.has('crown')} onReady={() => { (window as unknown as { __card_ready?: boolean }).__card_ready = true; }} /></div>;
    return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><NftPreview /></div>;
  }
  if (path === '/leaderboard') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Leaderboard /><footer className="foot"><a href="/">← Back to Emogotchi</a><span className="foot-right"><a href="/nft">NFT preview</a></span></footer></div>;
  return <Home />;
}

function Home() {
  const [g, dispatch] = useReducer(reduce, undefined, initial);
  const [director, setDirector] = useState<Director | null>(null);
  const dRef = useRef<Director | null>(null); dRef.current = director;
  const dState = useSyncExternalStore(useCallback((fn) => director?.subscribe(fn) ?? (() => {}), [director]), () => director?.getState() ?? EMPTY, () => EMPTY);
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const [hasPet, setHasPet] = useState(params.get('view') !== 'nopet');
  const [view, setView] = useState<ViewOverride>(((params.get('view') as ViewOverride | null) ?? 'auto'));
  const [crown, setCrown] = useState(true); // crown on for the operator's review; the dev drawer toggles it
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [name, setName] = useState(readName);
  useEffect(() => { try { if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY); } catch { /* private mode */ } }, [name]);

  // ---- wallet ----
  useEffect(() => { void restore().then((w) => { if (w) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  const doInjected = async () => {
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try { setWallet(await connectInjected()); setModal(false); } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); }
  };
  const doDemo = () => { setWallet(connectDemo()); setModal(false); };
  const doDisconnect = () => { disconnect(); setWallet(EMPTY_WALLET); };

  useEffect(() => { (window as unknown as { __pet?: unknown }).__pet = director ? { director, dispatch } : undefined; }, [director]);

  // ---- game clock ----
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', dt: (now - last) / 1000 }); last = now; }, 250);
    return () => clearInterval(id);
  }, []);

  // ---- moods and looks from the stats ----
  const sad = isSad(g); const dirty = isDirty(g);
  useEffect(() => { director?.setSad(sad); }, [director, sad]);
  useEffect(() => { director?.setDirty(dirty); }, [director, dirty]);
  useEffect(() => { director?.setCrown(crown); }, [director, crown]);

  // ---- events the world raises on its own ----
  const poopFired = useRef(false);
  useEffect(() => {
    if (!director || !g.alive || g.poopDue === null || g.t < g.poopDue || g.poop || g.sleeping || dState.busy || poopFired.current) return;
    poopFired.current = true;
    director.poop().then(() => { dispatch({ type: 'pooped' }); poopFired.current = false; });
  }, [director, g.alive, g.poopDue, g.t, g.poop, g.sleeping, dState.busy]);
  useEffect(() => { if (director) director.onCleaned = () => dispatch({ type: 'cleaned' }); }, [director]);
  useEffect(() => {
    if (!director || !g.alive || g.sleeping || g.stats.energy > 0 || dState.busy) return;
    dispatch({ type: 'slept', on: true }); void director.sleep();          // it fell asleep on its own: no charge
  }, [director, g.alive, g.sleeping, g.stats.energy, dState.busy]);
  useEffect(() => {
    if (!director || !g.alive || g.sleeping || g.stats.energy > 30) return;
    const id = setInterval(() => { void director.yawn(); }, 14000); return () => clearInterval(id);
  }, [director, g.alive, g.sleeping, g.stats.energy]);
  useEffect(() => {
    if (!director || !g.alive || g.sleeping || g.stats.food > 28) return;
    const id = setInterval(() => { void director.rumble(); }, 11000); return () => clearInterval(id);
  }, [director, g.alive, g.sleeping, g.stats.food]);
  useEffect(() => {
    if (!director || !g.sleeping || g.stats.energy < 100) return;
    dispatch({ type: 'slept', on: false }); void director.wake();
  }, [director, g.sleeping, g.stats.energy]);
  // death
  useEffect(() => { if (director && !g.alive && !dState.dead && !dState.busy) void director.die(); }, [director, g.alive, dState.dead, dState.busy]);

  // ---- toasts ----
  const lastLog = g.log[0];
  useEffect(() => {
    if (!lastLog) return;
    const m = /· (\d+) MON → bought & burned ([\d,]+) EMO/.exec(lastLog);
    const pet = /^Pet · gas only → (\+\d+ fun)/.exec(lastLog);
    const t: Toast = pet ? { id: Date.now(), text: pet[1]!, emo: 'gas only' } : { id: Date.now(), text: `−${m ? Number(m[1]).toLocaleString() : '1'} MON`, emo: m ? `${m[2]} EMO burned` : '' };
    setToasts((ts) => [...ts, t]);
    const id = setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 2600);
    return () => clearTimeout(id);
  }, [lastLog]);

  // ---- actions ----
  const act = async (a: PaidAction | 'wake') => {
    const d = dRef.current; if (!d || d.isBusy) return;
    if (a === 'wake') { dispatch({ type: 'slept', on: false }); await d.wake(); return; }
    dispatch({ type: 'pay', action: a });
    if (a === 'feed') { await d.feed(); dispatch({ type: 'fed' }); }
    if (a === 'wash') { await d.wash(); dispatch({ type: 'washed' }); }
    if (a === 'play') { await d.play(); dispatch({ type: 'played' }); }
    if (a === 'sleep') { dispatch({ type: 'slept', on: true }); await d.sleep(); }
    if (a === 'clean') { await d.clean(); }
    if (a === 'revive') { dispatch({ type: 'revived' }); await d.revive(); }
  };
  const onName = (next: string) => { dispatch({ type: 'pay', action: 'name' }); dispatch({ type: 'named' }); setName(next); void dRef.current?.pet(1); };

  // ---- thought bubble ----
  const lastNeed = useRef<ReturnType<typeof need>>(null);
  const n0 = need(g);
  const stats = g.stats as Record<string, number>;
  const stick = lastNeed.current && lastNeed.current !== 'poop' && n0 && n0 !== 'poop' && lastNeed.current !== n0 && stats[lastNeed.current]! < 35 && stats[n0]! > stats[lastNeed.current]! - 8;
  const n = stick ? lastNeed.current : n0;
  lastNeed.current = n;
  const thought = dState.busy || !n ? null : NEED_ICON[n];

  // ---- which view ----
  const connected = wallet.status === 'connected';
  const which: Exclude<ViewOverride, 'auto'> = view !== 'auto' ? view : !connected ? 'landing' : !hasPet ? 'nopet' : !g.alive ? 'dead' : 'pet';
  useEffect(() => { if (view === 'dead' && g.alive) dispatch({ type: 'kill' }); if (view === 'pet' && !g.alive) dispatch({ type: 'revived' }); }, [view, g.alive]);
  const stage = (
    <Stage onDirector={setDirector} night={g.sleeping} thought={thought} thoughtSide={dState.x > 330 ? -1 : 1} onPet={() => dispatch({ type: 'petted' })}>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast"><span className="toast-mon">{t.text}</span><span className="toast-emo"><Icon name="flame" size={14} /> {t.emo}</span></div>)}
      </div>
    </Stage>
  );

  return (
    <div className={`page view-${which}`}>
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} spentMon={connected ? g.spentMon : undefined} burnedEmo={connected ? g.burnedEmo : undefined} />
      {which === 'landing' && <Landing stage={stage} onConnect={() => setModal(true)} connecting={wallet.status === 'connecting'} />}
      {which === 'nopet' && <NoPet address={wallet.address ?? '0x0000…0000'} onDemo={() => setHasPet(true)} />}
      {(which === 'pet' || which === 'dead') && <PetView stage={stage} g={g} d={dState} name={name} onName={onName} act={(a) => void act(a)} />}
      {which !== 'landing' && which !== 'nopet' && (
        <footer className="foot"><span>An <a href="https://emonad.lol">Emonad</a> thing · $EMO on Monad</span><span className="foot-right"><a href="/leaderboard">Leaderboard</a> · <a href="/nft">NFT preview</a> · Contract: soon</span></footer>
      )}
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onDemo={doDemo} error={wallet.error} busy={wallet.status === 'connecting'} />
      {DEV && <DevDrawer director={director} dispatch={dispatch} view={view} setView={setView} crown={crown} setCrown={setCrown} speed={g.speed} onConnectDemo={doDemo} onDisconnect={doDisconnect} />}
    </div>
  );
}
