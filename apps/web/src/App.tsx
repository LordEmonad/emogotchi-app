import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Stage } from './scene/Stage';
import type { Director, DirectorState } from './scene/director';
import type { PropName } from './scene/props';
import { initial, isDirty, isSad, need, reduce, STUNTS, type Game, type PaidAction, type Stunt } from './game/state';
import type { Character } from './pet/Pet';
import type { Collection } from '@emo-pets/chain';
import { CHAIN_MODE, chainCfg, chainClient, chainStore, toGame, type ChainSnapshot } from './game/chain';
import type { CatView } from '@emo-pets/chain';
import { EMPTY_WALLET, connectDemo, connectInjected, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, type WalletState, connectWalletConnect, restoreWalletConnect } from './wallet';
import { Header } from './ui/Header';
import { ConnectModal } from './ui/ConnectModal';
import { Landing } from './ui/Landing';
import { Faq } from './ui/Faq';
import { CostumeLab } from './ui/CostumeLab';
import { CharacterLab } from './ui/CharacterLab';
import { InversebrahAssets } from './ui/InversebrahAssets';
import { Mint } from './ui/Mint';
import { Stats } from './ui/Stats';
import { SiteFooter } from './ui/SiteFooter';
import { PetView, type CatTab } from './ui/PetView';
import { NoPet } from './ui/NoPet';
import { NftPreview } from './ui/NftPreview';
import { NftArt, NFT_STATES, type NftState } from './ui/NftArt';
import { DevDrawer, type ViewOverride } from './ui/DevDrawer';
import { Leaderboard } from './ui/Leaderboard';
import { BurnBar } from './ui/BurnBar';
import { renderShareCard } from './ui/shareCard';
import { ShareModal } from './ui/ShareModal';
import { marketplace } from './links';
import { Claim } from './ui/Claim';
import { Autocare } from './autocare/Autocare';
import { AutocareLive } from './autocare/AutocareLive';
import { AutocareClient } from '@emo-pets/chain';
import { Gallery } from './ui/Gallery';
import { Shop } from './ui/Shop';
import { WITCH, SPOOKY, EMO_HAIR, SCENE_ITEMS, costumeOf, costumePortrait, hairOf, sceneOf } from './items';
import { petKey } from './game/chain';
import { Icon } from './ui/Icon';

const NEED_ICON: Record<NonNullable<ReturnType<typeof need>>, PropName> = { food: 'bowl', clean: 'sponge', fun: 'yarn', energy: 'moon', poop: 'poop' };
type Toast = { id: number; text: string; emo: string };
const NAME_KEY = 'emogotchi.name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
/** `?pet=frok` puts inversebrah in the room instead of the cat (the demo; live mode will read it off the collection the pet is in). */
const PET_PARAM: Character = params.get('pet') === 'frok' ? 'frog' : 'cat';
const COSTUME = params.get('costume');   // ?costume=witch dresses the cat, for the costume lab and portraits
const SCENE = params.get('scene');       // ?scene=halloween themes the room the same way
const DEMO = params.has('demo');         // ?demo opens the room on the demo wallet, no connection needed
const EMPTY: DirectorState = { x: 300, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false };
const EMPTY_SNAP: ChainSnapshot = { owner: null, cats: [], activeId: null, activeCol: 'cat', spectator: null, totals: null, inverseTotals: null, hasMinted: null, worn: {}, held: {}, loaded: false, pending: null, pendingLabel: '', error: null, log: [] };

export function App() {
  // ---- routes ----
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/nft') {   // unlisted since 2026-09-18; the bake and portrait tools still render through ?card=
    const card = params.get('card') as NftState | null;
    if (card && (NFT_STATES as readonly string[]).includes(card)) return <div className="card-only"><NftArt state={card} still crown={params.has('crown')} costume={COSTUME ?? undefined} character={params.get('character') === 'frog' ? 'frog' : 'cat'} onReady={() => { (window as unknown as { __card_ready?: boolean }).__card_ready = true; }} /></div>;
    return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><NftPreview /><SiteFooter /></div>;
  }
  if (path === '/claim') return <Claim />;
  if (path === '/autocare') {   // unlisted, experimental: the machine on chain when configured, the simulation otherwise (or ?demo=1)
    if (chainCfg?.autocare && chainClient && !params.has('demo')) return <AutocareLive client={new AutocareClient(chainClient, chainCfg.autocare)} />;
    return <Autocare />;
  }
  if (path === '/costume') return <CostumeLab />;
  if (path === '/frog') return <CharacterLab />;
  if (path === '/inversebrah') return <InversebrahAssets />;
  if (path === '/mint') return <Mint />;
  if (path === '/shop' || path === '/items') return <Shop />;
  if (path === '/faq') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><main className="landing"><Faq /></main><SiteFooter /></div>;
  if (path === '/stats') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Stats /><SiteFooter /></div>;
  if (path === '/leaderboard') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Leaderboard /><SiteFooter /></div>;
  if (path === '/pets' || path === '/cats' || path === '/collection') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Gallery initial={params.get('pet') === 'frok' ? 'frok' : 'cat'} /><SiteFooter /></div>;
  if (path === '/inversebrah') return <Mint />;   // his link on chain: the collection's external_link is this path
  const frokPet = /^\/inversebrah\/pet\/(\d+)$/.exec(path);
  if (frokPet) return <Home petId={Number(frokPet[1])} petCol="frok" />;
  const pet = /^\/pet\/(\d+)$/.exec(path);
  return <Home petId={pet ? Number(pet[1]) : null} petCol="cat" />;
}

function Home({ petId, petCol }: { petId: number | null; petCol: Collection }) {
  const [simG, dispatch] = useReducer(reduce, undefined, initial);
  const [director, setDirector] = useState<Director | null>(null);
  const dRef = useRef<Director | null>(null); dRef.current = director;
  const dState = useSyncExternalStore(useCallback((fn) => director?.subscribe(fn) ?? (() => {}), [director]), () => director?.getState() ?? EMPTY, () => EMPTY);
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [modal, setModal] = useState(false);
  const [hasPet, setHasPet] = useState(params.get('view') !== 'nopet');
  const [view, setView] = useState<ViewOverride>(((params.get('view') as ViewOverride | null) ?? 'auto'));
  const [crownOverride, setCrownOverride] = useState<boolean | null>(CHAIN_MODE ? null : true); // demo: crown on for review; live: from the contract
  const [demoCharacter, setCharacter] = useState<Character>(PET_PARAM); // the demo's pet; live mode reads it off the active pet's collection
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [allMode, setAllMode] = useState(false); // live: the "All" tab, every button acts on every cat in the wallet
  const [simName, setSimName] = useState(readName);
  useEffect(() => { if (CHAIN_MODE) return; try { if (simName) localStorage.setItem(NAME_KEY, simName); else localStorage.removeItem(NAME_KEY); } catch { /* private mode */ } }, [simName]);

  // ---- live mode: the contract's view of our cats ----
  const snap = useSyncExternalStore(useCallback((fn) => chainStore?.subscribe(fn) ?? (() => {}), []), () => chainStore?.get() ?? EMPTY_SNAP, () => EMPTY_SNAP);
  const connected = wallet.status === 'connected';
  // A /pet/<id> link asks for one particular cat on chain, so it always shows the real thing, even if
  // this browser still remembers a demo session. Otherwise the demo cat (crown on, meters simulated)
  // would stand in for every cat anyone shared.
  const live = CHAIN_MODE && (petId !== null || (!wallet.demo && connected));
  const wrongChain = live && connected && chainCfg !== null && wallet.chainId !== null && wallet.chainId !== chainCfg.chain.id;
  useEffect(() => { chainStore?.watch(petId, petCol); }, [petId, petCol]);
  useEffect(() => {
    if (!chainStore) return;
    if (connected && !wallet.demo && wallet.address) chainStore.setSigner(getProvider(), wallet.address as `0x${string}`);
    else chainStore.setSigner(null, null);
  }, [connected, wallet.demo, wallet.address]);
  useEffect(() => {
    if (!wrongChain || !chainCfg) return;
    void ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer).catch(() => {});
  }, [wrongChain]);
  const activeCat = live ? (chainStore?.active() ?? null) : null;
  const character: Character = live ? (activeCat?.col === 'frok' ? 'frog' : 'cat') : demoCharacter;
  const frok = character === 'frog';
  const owns = live ? (chainStore?.ownsActive() ?? false) : true;
  const g: Game = live && activeCat ? toGame(activeCat, snap.totals, snap.log) : simG;
  const name = live ? (activeCat?.name ?? '') : simName;
  const crown = crownOverride ?? (live ? (activeCat?.crowned ?? false) : true);
  // the outfit: what the shop says this cat is wearing (its owner still holds the item), or the lab's ?costume=
  const worn = live && activeCat ? snap.worn[petKey(activeCat.col, activeCat.id)] ?? [] : [];
  const costume = (COSTUME as 'witch' | null) ?? costumeOf(worn);
  const hair = COSTUME === 'emohair' || hairOf(worn, character);
  const scene = (SCENE === 'halloween' ? 'halloween' : null) ?? sceneOf(worn);

  // ---- wallet ----
  useEffect(() => { if (DEMO) { setWallet(connectDemo()); return; } void restore().then((w) => { if (w) setWallet(w); }); }, []);
  useEffect(() => onAccountsChanged((accs) => { if (!accs.length) { disconnect(); setWallet(EMPTY_WALLET); } else setWallet((w) => ({ ...w, address: accs[0]! })); }), []);
  useEffect(() => onChainChanged((chainId) => setWallet((w) => (w.demo ? w : { ...w, chainId }))), []);
  const connecting = useRef(false); // one wallet request at a time, whatever the buttons do meanwhile
  const doInjected = async () => {
    if (connecting.current) return;
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      const w = await connectInjected();
      if (chainCfg && w.chainId !== chainCfg.chain.id) {
        try { await ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer); w.chainId = chainCfg.chain.id; } catch { /* the banner asks again */ }
      }
      setWallet(w); setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  // WalletConnect: for a desktop with no extension, or a phone browser that is not a wallet's own.
  const doWalletConnect = async () => {
    if (connecting.current) return;
    if (!chainCfg) { setWallet((w) => ({ ...w, error: 'This build is not pointed at a network.' })); return; }
    connecting.current = true;
    setWallet((w) => ({ ...w, status: 'connecting', error: null }));
    try {
      setWallet(await connectWalletConnect(chainCfg.chain.id, chainCfg.rpcUrl));
      setModal(false);
    } catch (e) { setWallet((w) => ({ ...w, status: 'idle', error: (e as Error).message || 'Connection was cancelled.' })); } finally { connecting.current = false; }
  };
  const doDemo = () => { setWallet(connectDemo()); setModal(false); };
  const doDisconnect = () => { const wasInjected = !wallet.demo; disconnect(); setWallet(EMPTY_WALLET); if (wasInjected) void revokeInjected(); };

  useEffect(() => { (window as unknown as { __pet?: unknown }).__pet = director ? { director, dispatch, chain: chainStore } : undefined; }, [director]);

  // ---- game clock (demo only) ----
  useEffect(() => {
    if (live) return;
    let last = performance.now();
    const id = setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', dt: (now - last) / 1000 }); last = now; }, 250);
    return () => clearInterval(id);
  }, [live]);

  // ---- moods and looks from the stats ----
  const sad = isSad(g); const dirty = isDirty(g);
  useEffect(() => { director?.setSad(sad); }, [director, sad]);
  useEffect(() => { director?.setDirty(dirty); }, [director, dirty]);
  useEffect(() => { director?.setCrown(crown); }, [director, crown]);
  useEffect(() => { director?.setCostume(costume === 'witch'); }, [director, costume]);
  useEffect(() => { director?.setHair(hair); }, [director, hair]);

  // ---- events the world raises on its own (demo: from the clock; live: from the contract) ----
  const poopFired = useRef(false);
  useEffect(() => {
    if (!director || !g.alive || g.poop || g.sleeping || dState.busy || poopFired.current) return;
    if (live) return;
    if (g.poopDue === null || g.t < g.poopDue) return;
    poopFired.current = true;
    director.poop().then(() => { dispatch({ type: 'pooped' }); poopFired.current = false; });
  }, [director, live, g.alive, g.poopDue, g.t, g.poop, g.sleeping, dState.busy]);
  useEffect(() => {
    // live: the contract says there is a poop and the scene has none yet
    if (!live || !director || !g.alive || !g.poop || dState.poop || dState.busy || poopFired.current) return;
    poopFired.current = true;
    director.poop().then(() => { poopFired.current = false; });
  }, [live, director, g.alive, g.poop, dState.poop, dState.busy]);
  useEffect(() => { if (director) director.onCleaned = () => { if (!live) dispatch({ type: 'cleaned' }); }; }, [director, live]);
  useEffect(() => {
    if (live || !director || !g.alive || g.sleeping || g.stats.energy > 0 || dState.busy) return;
    dispatch({ type: 'slept', on: true }); void director.sleep();          // it fell asleep on its own: no charge
  }, [live, director, g.alive, g.sleeping, g.stats.energy, dState.busy]);
  useEffect(() => {
    // live: keep the scene's sleep state in step with the contract
    if (!live || !director || !g.alive || dState.busy || dState.dead) return;
    if (g.sleeping && !dState.sleeping) void director.sleep();
    if (!g.sleeping && dState.sleeping) void director.wake();
  }, [live, director, g.alive, g.sleeping, dState.sleeping, dState.busy, dState.dead]);
  useEffect(() => {
    if (!director || !g.alive || g.sleeping || g.stats.energy > 30) return;
    const id = setInterval(() => { void director.yawn(); }, 14000); return () => clearInterval(id);
  }, [director, g.alive, g.sleeping, g.stats.energy]);
  useEffect(() => {
    if (!director || !g.alive || g.sleeping || g.stats.food > 28) return;
    const id = setInterval(() => { void director.rumble(); }, 11000); return () => clearInterval(id);
  }, [director, g.alive, g.sleeping, g.stats.food]);
  useEffect(() => {
    if (live || !director || !g.sleeping || g.stats.energy < 100) return;
    dispatch({ type: 'slept', on: false }); void director.wake();
  }, [live, director, g.sleeping, g.stats.energy]);
  // death, and a live revive we did not trigger ourselves
  useEffect(() => { if (director && !g.alive && !dState.dead && !dState.busy) void director.die(); }, [director, g.alive, dState.dead, dState.busy]);
  useEffect(() => { if (live && director && g.alive && dState.dead && !dState.busy) void director.revive(); }, [live, director, g.alive, dState.dead, dState.busy]);

  // ---- toasts ----
  const lastLog = g.log[0];
  useEffect(() => {
    if (!lastLog) return;
    const m = /· (\d+) MON → bought & burned ([\d,]+) EMO/.exec(lastLog);
    const q = /· (\d+) MON → (.+)$/.exec(lastLog);
    const pet = /^Pet(?: ×\d+)? · gas only(?: → (\+\d+ fun))?/.exec(lastLog);
    const t: Toast = pet
      ? { id: Date.now(), text: pet[1] ?? lastLog.replace(' · gas only', ''), emo: 'gas only' }
      : m ? { id: Date.now(), text: `−${Number(m[1]).toLocaleString()} MON`, emo: `${m[2]} EMO burned` }
        : q ? { id: Date.now(), text: `−${Number(q[1]).toLocaleString()} MON`, emo: q[2]! }
          : { id: Date.now(), text: lastLog, emo: '' };
    setToasts((ts) => [...ts, t]);
    const id = setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 2600);
    return () => clearTimeout(id);
  }, [lastLog]);
  const chainError = live ? snap.error : null;
  useEffect(() => {
    if (!chainError) return;
    const t: Toast = { id: Date.now(), text: chainError, emo: '' };
    setToasts((ts) => [...ts, t]);
    const id = setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4000);
    return () => clearTimeout(id);
  }, [chainError]);

  // ---- actions ----
  const isStunt = (x: string): x is Stunt => (STUNTS as string[]).includes(x);
  const act = async (a0: PaidAction | 'wake' | Stunt) => {
    const d = dRef.current; if (!d || d.isBusy) return;
    if (isStunt(a0)) {
      // inversebrah's stunts: gas only, counted on his record, no meter touched. Live: the Inversegotchi contract's
      // screenshot/slap/squeeze/ignite (wired when it is deployed); until then the demo counts them.
      if (live) {
        if (!chainStore || !owns) return;
        try { await chainStore.abuse(a0); } catch { return; }
        if (a0 === 'screenshot') await d.screenshot();
        if (a0 === 'slap') await d.slap();
        if (a0 === 'squeeze') await d.squeeze();
        if (a0 === 'burn') await d.burn();
        await chainStore.refresh();
        return;
      }
      dispatch({ type: 'stunt', kind: a0 });
      if (a0 === 'screenshot') await d.screenshot();
      if (a0 === 'slap') await d.slap();
      if (a0 === 'squeeze') await d.squeeze();
      if (a0 === 'burn') await d.burn();
      return;
    }
    const a: PaidAction | 'wake' = a0;
    if (live) {
      if (!chainStore || !owns) return;
      if (allMode && a !== 'wake' && a !== 'revive' && a !== 'name') {
        const touched = chainStore.allTargets(a).includes(activeCat?.id ?? -1);
        try { await chainStore.actAll(a); } catch { return; }
        // the room shows one cat: play the action on it if it was in the batch (a sleeping cat wakes first)
        if (touched) {
          if (g.sleeping && a !== 'sleep' && a !== 'clean') await d.wake();
          if (a === 'feed') await d.feed();
          if (a === 'wash') await d.wash();
          if (a === 'play') await d.play();
          if (a === 'sleep') await d.sleep();
          if (a === 'clean') await d.clean();
        }
        await chainStore.refresh();
        return;
      }
      try { await chainStore.act(a); } catch { return; }
      if (a === 'wake') await d.wake();
      if (a === 'feed') await d.feed();
      if (a === 'wash') await d.wash();
      if (a === 'play') await d.play();
      if (a === 'sleep') await d.sleep();
      if (a === 'clean') await d.clean();
      if (a === 'revive') await d.revive();
      await chainStore.refresh(); // the meters catch up once the scene has played the action
      return;
    }
    if (a === 'wake') { dispatch({ type: 'slept', on: false }); await d.wake(); return; }
    if (!frok || a === 'name') dispatch({ type: 'pay', action: a });   // his care and revive are free; only a name costs
    if (a === 'feed') { await d.feed(); dispatch({ type: 'fed' }); }
    if (a === 'wash') { await d.wash(); dispatch({ type: 'washed' }); }
    if (a === 'play') { await d.play(); dispatch({ type: 'played' }); }
    if (a === 'sleep') { dispatch({ type: 'slept', on: true }); await d.sleep(); }
    if (a === 'clean') { await d.clean(); }
    if (a === 'revive') { dispatch({ type: 'revived' }); await d.revive(); }
  };
  const onName = async (next: string) => {
    if (live) {
      if (!chainStore || !owns) return;
      try { await chainStore.setName(next); } catch { return; }
      void dRef.current?.pet(1);
      await chainStore.refresh();
      return;
    }
    dispatch({ type: 'pay', action: 'name' }); dispatch({ type: 'named' }); setSimName(next); void dRef.current?.pet(1);
  };
  const onPet = () => { if (live) chainStore?.pet(); else dispatch({ type: 'petted' }); };

  // ---- share card: drawn in the browser from the cat's own on-chain picture and numbers ----
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareCard, setShareCard] = useState<{ cat: CatView; blob: Blob } | null>(null);
  const onShare = async () => {
    if (!activeCat || !chainClient) return;
    setShareNote('Drawing…');
    try {
      const mood = activeCat.alive ? activeCat.mood : 'dead';
      // a costumed cat shares its costumed portrait, drawn ahead of time; the plain cat comes from chain
      const picture = costume ? { url: costumePortrait(costume, mood, activeCat.crowned, character) } : hair ? { url: costumePortrait('emohair', mood, activeCat.crowned, character) } : await chainClient.artImage(mood, activeCat.crowned, activeCat.col);
      setShareCard({ cat: activeCat, blob: await renderShareCard(activeCat, picture) });
      setShareNote(null);
    } catch (e) {
      setShareNote((e as Error).message.slice(0, 60));
      setTimeout(() => setShareNote(null), 5000);
    }
  };

  // ---- thought bubble ----
  const lastNeed = useRef<ReturnType<typeof need>>(null);
  const n0 = need(g);
  const stats = g.stats as Record<string, number>;
  const stick = lastNeed.current && lastNeed.current !== 'poop' && n0 && n0 !== 'poop' && lastNeed.current !== n0 && stats[lastNeed.current]! < 35 && stats[n0]! > stats[lastNeed.current]! - 8;
  const n = stick ? lastNeed.current : n0;
  lastNeed.current = n;
  const thought = dState.busy || !n ? null : NEED_ICON[n];

  // ---- which view ----
  const liveHasCat = live && (snap.cats.length > 0 || (petId !== null && snap.spectator !== null));
  // loading until the store has read the cats of the wallet that is connected now (not a previous one)
  // wait for the store to catch up with the connected wallet; a demo wallet never becomes the signer,
  // so on a shared /pet/<id> link we only wait for the first read to land
  const liveLoading = live && (!snap.loaded || (connected && !wallet.demo && (snap.owner ?? '').toLowerCase() !== (wallet.address ?? '').toLowerCase()));
  const which: Exclude<ViewOverride, 'auto'> | 'loading' = view !== 'auto' ? view
    : live ? (petId === null && !connected ? 'landing' : liveLoading ? 'loading' : !liveHasCat ? 'nopet' : !g.alive ? 'dead' : 'pet')
      : !connected ? 'landing' : !hasPet ? 'nopet' : !g.alive ? 'dead' : 'pet';
  useEffect(() => { if (live) return; if (view === 'dead' && g.alive) dispatch({ type: 'kill' }); if (view === 'pet' && !g.alive) dispatch({ type: 'revived' }); }, [live, view, g.alive]);
  const tabs: CatTab[] = live ? snap.cats.map((c) => ({ id: c.id, col: c.col, name: c.name, alive: c.alive, crowned: c.crowned })) : [];
  const allCounts = live && chainStore && owns && tabs.length > 1 ? chainStore.allCounts() : null;
  const allOn = allMode && allCounts !== null;
  // the outfit toggle on our own cat: shown when the wallet holds a costume the rig can draw
  const toggler = (item: number, label: string) => async () => {
    if (!chainStore || !activeCat) return;
    try { if (worn.includes(item)) await chainStore.undress(activeCat.id, item, label, activeCat.col); else await chainStore.wear([activeCat.id], item, label, activeCat.col); } catch { return; }
    await chainStore.refresh();
  };
  const has = (id: number) => (snap.held[id] ?? 0) > 0 || worn.includes(id);
  const outfit = live && owns && activeCat && has(WITCH) ? { on: worn.includes(WITCH), label: 'Witch outfit', toggle: toggler(WITCH, 'Witch outfit') } : null;
  // the emo hair is only drawn on pets without hair of their own: the cat can hold it, not wear it
  const hairItem = live && owns && activeCat && frok && has(EMO_HAIR) ? { on: worn.includes(EMO_HAIR), label: 'Emo hair', toggle: toggler(EMO_HAIR, 'Emo hair') } : null;
  const roomItem = live && owns && activeCat ? Object.keys(SCENE_ITEMS).map(Number).find((id) => (snap.held[id] ?? 0) > 0 || worn.includes(id)) ?? null : null;
  const room = roomItem !== null && activeCat ? { on: worn.includes(roomItem), label: roomItem === SPOOKY ? 'Spooky theme' : 'Room theme', toggle: toggler(roomItem, 'Spooky theme') } : null;
  const PETS = frok ? 'inversebrahs' : 'cats';
  const pending = live ? (snap.pending ? snap.pendingLabel : !owns && activeCat ? `Someone else's ${frok ? 'inversebrah' : 'cat'} · look but don't touch` : wrongChain ? `Switch your wallet to ${chainCfg?.chain.name ?? 'Monad'}` : allOn && allCounts ? `Every button acts on all ${allCounts.total} ${PETS}${allCounts.asleep ? ` · ${allCounts.asleep} asleep wake up when fed, washed or played with` : ''} · the room shows ${name || `#${activeCat?.id ?? ''}`}` : null) : null;
  const stage = (
    <Stage onDirector={setDirector} night={g.sleeping} thought={thought} thoughtSide={dState.x > 330 ? -1 : 1} onPet={onPet} scene={scene} character={character}>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast"><span className="toast-mon">{t.text}</span>{t.emo && <span className="toast-emo"><Icon name="flame" size={14} /> {t.emo}</span>}</div>)}
      </div>
    </Stage>
  );
  const explorer = chainCfg?.explorer && chainCfg.contract ? `${chainCfg.explorer}/address/${chainCfg.contract}` : null;
  // the cat on a block explorer, so anyone can see the token itself, not just our picture of it
  const catOnChain = chainCfg?.explorer && chainCfg.contract && activeCat ? `${chainCfg.explorer}/nft/${chainCfg.contract}/${activeCat.id}` : null;

  return (
    <div className={`page view-${which}`}>
      <Header wallet={wallet} onConnect={() => setModal(true)} onDisconnect={doDisconnect} spentMon={connected ? g.spentMon : undefined} burnedEmo={connected ? g.burnedEmo : undefined} />
      {which === 'landing' && <Landing stage={stage} onConnect={() => setModal(true)} connecting={wallet.status === 'connecting'} claimHref={chainCfg?.drop ? '/claim' : null} />}
      {which === 'loading' && <main className="nopet"><div className="shell"><div className="empty-room"><div className="empty-dots" /><div className="empty-floor" /><div className="empty-card"><h2>Looking in your wallet…</h2>{snap.error && <p className="tnum">{snap.error}</p>}</div></div></div></main>}
      {which === 'nopet' && <NoPet address={wallet.address ?? '0x0000…0000'} onDemo={() => { if (live) doDemo(); else setHasPet(true); }} />}
      {(which === 'pet' || which === 'dead') && <PetView stage={stage} g={g} d={dState} name={name} onName={(nm) => void onName(nm)} act={(a) => void act(a)} tabs={tabs} activeId={activeCat?.id ?? null} onShare={live && activeCat ? () => void onShare() : undefined} shareNote={shareNote} onTab={(id, col) => { setAllMode(false); chainStore?.setActive(id, col); }} all={allCounts ? { on: allOn, counts: allCounts } : undefined} onAll={() => setAllMode(true)} pending={pending} locked={live && (!owns || !!snap.pending || wrongChain)} live={live} outfit={outfit ?? undefined} room={room ?? undefined} shopHref={live && chainCfg?.items ? '/shop' : undefined} character={character} hair={hairItem ?? undefined} />}
      {which !== 'landing' && which !== 'nopet' && which !== 'loading' && (
        <><BurnBar /><SiteFooter extra={catOnChain ? <a href={catOnChain} target="_blank" rel="noreferrer">This cat on chain</a> : undefined} /></>
      )}
      {shareCard && <ShareModal cat={shareCard.cat} blob={shareCard.blob} onClose={() => setShareCard(null)} />}
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={doDemo} error={wallet.error} busy={wallet.status === 'connecting'} />
      {DEV && <DevDrawer director={director} dispatch={dispatch} view={view} setView={setView} crown={crown} setCrown={setCrownOverride} speed={g.speed} onConnectDemo={doDemo} onDisconnect={doDisconnect} live={live} onCrank={() => void chainStore?.crank()} character={demoCharacter} setCharacter={setCharacter} />}
    </div>
  );
}
