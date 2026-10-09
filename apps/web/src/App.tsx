import { cue } from './sound/cue';
import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Stage } from './scene/Stage';
import type { Director, DirectorState } from './scene/director';
import type { PropName } from './scene/props';
import { initial, isDirty, isSad, need, reduce, STUNTS, type Game, type PaidAction, type Stunt } from './game/state';
import { COSTUMES, prefetchDrawings, type Character, type Costume } from './pet/Pet';
import { PETS, PET_ORDER, characterOf, characterParam, collectionOf, petParam, fallbackName } from './pets';
import type { Collection } from '@emo-pets/chain';
import { CHAIN_MODE, chainCfg, chainClient, chainStore, toGame, type ChainSnapshot } from './game/chain';
import type { CatView } from '@emo-pets/chain';
import { EMPTY_WALLET, connectDemo, connectInjected, disconnect, ensureChain, getProvider, onAccountsChanged, onChainChanged, restore, revokeInjected, walletKind, type WalletState, connectWalletConnect, openWalletAgain } from './wallet';
import { setPushWallet } from './push/client';
import { NotifNudge } from './push/NotifSheet';
import { onTopupAway, topupAway } from './topup/flag';
import { captureRef } from './refer';
import { Header } from './ui/Header';
import { ConnectModal } from './ui/ConnectModal';
import { Landing } from './ui/Landing';
import { Faq } from './ui/Faq';
import { SiteFooter } from './ui/SiteFooter';
import { PetView, type CatTab, type ItemRow } from './ui/PetView';
import { NoPet } from './ui/NoPet';
import { NftArt, NFT_STATES, type NftState } from './ui/NftArt';
import { BurnBar } from './ui/BurnBar';
import { renderShareCard } from './ui/shareCard';
import { marketplace } from './links';
import { EMO_HAIR, EMO_ON, SCENE_ITEMS, ITEM_LABEL, costumeOf, outfitIdsOf, roomIdsOf, costumePortrait, hairOf, sceneOf, accessoriesOf, toyOf, petMoveOf, portraitSetOf, exclusiveOf, itemKind, itemFits, type PortraitSet } from './items';
import { petKey } from './game/chain';
import { Icon } from './ui/Icon';
import { cardFor, useCards } from './social/cards';
const NO_ADDRESSES: string[] = [];
import type { ViewOverride } from './ui/DevDrawer';
import { loadLooks, lookOf, wear } from './fight/wear';
// Every page but the home page is its own chunk (the mobile pass, 2026-09-29): the main bundle had carried all of them, so a
// phone opening the FAQ first downloaded and parsed the stats page, the shop and the labs.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })));   // eslint-disable-line @typescript-eslint/no-explicit-any
const Refer = named(() => import('./ui/Refer'), 'Refer');
const CostumeLab = named(() => import('./ui/CostumeLab'), 'CostumeLab');
const CharacterLab = named(() => import('./ui/CharacterLab'), 'CharacterLab');
const HalloweenLab = named(() => import('./ui/HalloweenLab'), 'HalloweenLab');
const SahurLab = named(() => import('./ui/SahurLab'), 'SahurLab');
const JewishPack = named(() => import('./ui/JewishPack'), 'JewishPack');
const Pfps = named(() => import('./ui/Pfps'), 'Pfps');
const PfpLab = named(() => import('./ui/PfpLab'), 'PfpLab');
const InversebrahAssets = named(() => import('./ui/InversebrahAssets'), 'InversebrahAssets');
const Mint = named(() => import('./ui/Mint'), 'Mint');
const Stats = named(() => import('./ui/Stats'), 'Stats');
const NftPreview = named(() => import('./ui/NftPreview'), 'NftPreview');
const DevDrawer = named(() => import('./ui/DevDrawer'), 'DevDrawer');
const Leaderboard = named(() => import('./ui/Leaderboard'), 'Leaderboard');
const ShareModal = named(() => import('./ui/ShareModal'), 'ShareModal');
const SendSheet = named(() => import('./ui/SendSheet'), 'SendSheet');
const SendItemPicker = named(() => import('./ui/SendSheet'), 'SendItemPicker');
const Claim = named(() => import('./ui/Claim'), 'Claim');
const Adopt = named(() => import('./ui/Adopt'), 'Adopt');
const Gallery = named(() => import('./ui/Gallery'), 'Gallery');
const Shop = named(() => import('./ui/Shop'), 'Shop');
const R1 = lazy(() => import('./r1/R1'));   // the r1 page pulls viem's mnemonic code; nobody else pays for it
// the town rigs Thiccums itself (TownPet, not the Pet box that waits for his drawing), so his moves come first
const Emotown = lazy(() => Promise.all([import('./emotown/Emotown'), __THICCUMS__ ? import('./thiccums/register') : null, __R3TARDS__ ? import('./r3tards/register') : null, __EMONAD__ ? import('./emonadgotchi/register') : null]).then(([m]) => ({ default: m.Emotown })));   // unlisted, experimental: the town where the pets active in the last day live
const ProfilePage = lazy(() => import('./social/ProfilePage').then((m) => ({ default: m.ProfilePage })));   // unlisted, experimental: a person's page in Emotown
const HabibiLab = import.meta.env.DEV ? lazy(() => import('./ui/HabibiLab').then((m) => ({ default: m.HabibiLab }))) : () => null;
const EmoLab = import.meta.env.DEV ? lazy(() => import('./ui/EmoLab').then((m) => ({ default: m.EmoLab }))) : () => null;   // the emo pack's lab (DEV ONLY)
const EmoPack = lazy(() => import('./ui/EmoPack').then((m) => ({ default: m.EmoPack })));   // the emo pack's page, /shop/emo, in the Item shop tab ("Coming soon" until its items exist on chain)
const ThiccumsLab = import.meta.env.DEV ? lazy(() => import('./thiccums/ThiccumsLab').then((m) => ({ default: m.ThiccumsLab }))) : () => null;   // a character's lab, DEV ONLY (a production build leaves the chunk, his drawing and his moves out): /thiccums
const HabibiPromo = import.meta.env.DEV ? lazy(() => import('./ui/HabibiPromo').then((m) => ({ default: m.HabibiPromo }))) : () => null;   // the pack's promo picture, composed live for tools/habibi-promo.mjs (DEV ONLY)
const R3Lab = import.meta.env.DEV ? lazy(() => import('./r3tards/R3Lab').then((m) => ({ default: m.R3Lab }))) : () => null;   // the r3tards character's lab, DEV ONLY (no contract, no collection)
const EmonadLab = import.meta.env.DEV ? lazy(() => import('./emonad/Lab').then((m) => ({ default: m.EmonadLab }))) : () => null;   // the $EMO mascot's rig lab, DEV ONLY
const EgLab = import.meta.env.DEV ? lazy(() => import('./emonadgotchi/Lab').then((m) => ({ default: m.EgLab }))) : () => null;   // Emonad as a pet (Emonadgotchi): his lab, DEV ONLY
// Emonadgotchi's mint page, /emonadgotchi: in a dev build always ("Coming soon" until a contract), in a production build only
// once his switch is on (__EMONAD__), so nothing of him reaches the site before he is announced (Thiccums' way)
const EmonadMint = import.meta.env.DEV || __EMONAD__ ? lazy(() => import('./emonadgotchi/EmonadMint').then((m) => ({ default: m.EmonadMint }))) : () => null;
const R3Mint = named(() => import('./r3tards/R3Mint'), 'R3Mint');   // r3tardgotchi's mint page: on the site as "Coming soon" since 2026-10-01 (unlisted; its own chunk, his drawing with it)
const SoundLab = import.meta.env.DEV ? lazy(() => import('./sound/SoundLab').then((m) => ({ default: m.SoundLab }))) : () => null;   // the sound lab: every sound and tune on a button, DEV ONLY
const FightLab = import.meta.env.DEV ? lazy(() => import('./fight/FightLab').then((m) => ({ default: m.FightLab }))) : () => null;   // Fight Club's lab: two pets in the ring, DEV ONLY
const FightClubPage = lazy(() => import('./fight/FightClubPage').then((m) => ({ default: m.FightClubPage })));   // Fight Club (2026-09-30, unlisted: nothing links to it until the operator has fought from the live site)
const HabibiPack = lazy(() => import('./ui/HabibiPack').then((m) => ({ default: m.HabibiPack })));   // the Habibi pack's page, in the Item shop tab ("Coming soon" until its items exist on chain)   // the Habibi pack's lab (2026-09-28), DEV ONLY until the pack is announced (it also shows the unannounced seal)

const NEED_ICON: Record<NonNullable<ReturnType<typeof need>>, PropName> = { food: 'bowl', clean: 'sponge', fun: 'yarn', energy: 'moon', poop: 'poop' };
type Toast = { id: number; text: string; emo: string };
const NAME_KEY = 'emogotchi.name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
/** `?pet=frok` / `?pet=sahur` puts that pet in the room instead of the cat (the demo; live mode reads it off the collection the pet is in). */
const PET_PARAM: Character = characterParam(params.get('pet'));
// ?costume=witch dresses the cat, for the costume lab and the baked portraits. Honoured only on those routes:
// on a real pet's page it would show someone else's cat — and its share card — wearing an item it does not own.
const COSTUME_ROUTE = /^\/(costume|nft|frog|halloween|sahur)\/?$/.test(location.pathname.replace(/\/+$/, '') || '/') || params.has('card');
const COSTUME = COSTUME_ROUTE ? params.get('costume') : null;
const SCENE = params.get('scene');       // ?scene=halloween / ?scene=backrooms / ?scene=kotel themes the room the same way
/** The demo account holds every item and every kind of pet: in dev builds only (the public demo is the plain room). */
const DEMO_ALL = import.meta.env.DEV;
const DEMO = params.has('demo');         // ?demo opens the room on the demo wallet, no connection needed
/** The Items menu's icon per item (the pet page). */
const ITEM_ICON: Record<number, PropName> = { 1: 'bat', 2: 'moon', 3: 'emohair', 4: 'pumpkin', 5: 'tombstone', 6: 'grave', 7: 'moon', 8: 'heart', 9: 'sparkle', 10: 'moon', 11: 'dreidel', 12: 'hen', 13: 'heart', 14: 'heart', 15: 'moon', 16: 'darbuka', 17: 'falcon',
  18: 'emohair', 19: 'heart', 20: 'heart', 21: 'sparkle', 22: 'moon', 23: 'sparkle', 24: 'heart', 25: 'emohair', 26: 'heart', 27: 'heart', 28: 'sparkle', 29: 'moon', 30: 'sparkle', 31: 'heart' };   // 18-31: the emo pack
const EMPTY: DirectorState = { x: 300, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false, queued: 0 };
const EMPTY_SNAP: ChainSnapshot = { owner: null, cats: [], activeId: null, activeCol: 'cat', spectator: null, totals: null, inverseTotals: null, sahurTotals: null, hasMinted: {}, worn: {}, held: {}, loaded: false, pending: null, pendingLabel: '', stuck: false, error: null, log: [] };

// A referral link is `/mint?ref=…`, and App returns <Mint /> long before any component effect runs — so this is
// read at module scope, once, before the first route decision. Posting it happens on connect, in wallet.ts.
captureRef();

export function App() {
  // one boundary for every lazy page (each has its own chunk); a blank page for the moment it takes
  return <Suspense fallback={<div className="page" />}><Route /></Suspense>;
}

function Route() {
  // ---- routes ----
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/nft') {   // unlisted since 2026-09-18; the bake and portrait tools still render through ?card=
    const card = params.get('card') as NftState | null;
    // &bare=1: no wall, no floor, no background (tools/pfps.mjs screenshots the pet alone on transparency)
    if (card && (NFT_STATES as readonly string[]).includes(card)) return <div className={`card-only ${params.has('bare') ? 'is-bare' : ''}`}><NftArt state={card} still crown={params.has('crown')} costume={COSTUME ?? undefined} character={params.get('character') === 'frog' ? 'frog' : params.get('character') === 'sahur' ? 'sahur' : 'cat'} onReady={() => { (window as unknown as { __card_ready?: boolean }).__card_ready = true; }} /></div>;
    return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><NftPreview /><SiteFooter /></div>;
  }
  if (path === '/claim') return <Claim />;
  if (path === '/adopt') return <Adopt />;   // "Get a pet": the three pets, the free ones first (2026-09-28)
  if (path === '/costume') return <CostumeLab />;
  if (path === '/frog') return <CharacterLab />;
  if (path === '/halloween') return <HalloweenLab />;
  if (path === '/sahur') return <SahurLab />;   // unlisted: the third character's lab
  if (import.meta.env.DEV && path === '/habibi/promo') return <Suspense fallback={null}><HabibiPromo /></Suspense>;
  if (path === '/shop/habibi' || path === '/shop/habibi-pack') return <Suspense fallback={<div className="page" />}><HabibiPack /></Suspense>;
  if (import.meta.env.DEV && path === '/fightclub') return <Suspense fallback={<div className="page" />}><FightClubPage /></Suspense>;   // Fight Club (sandbox)
  if (path === '/r3tardgotchi') return <Suspense fallback={<div className="page" />}><R3Mint /></Suspense>;   // r3tardgotchi's mint page and his contractURI link ("Coming soon" until his switch is on)
  if (import.meta.env.DEV && path === '/r3tards') return <Suspense fallback={<div className="page" />}><R3Lab /></Suspense>;   // the r3tards character's lab (dev only)
  if (import.meta.env.DEV && path === '/emonad') return <Suspense fallback={<div className="page" />}><EmonadLab /></Suspense>;   // Emonad's rig lab (dev only)
  // Emonadgotchi's lab, dev only: /emonadgotchi/lab, and /emonadgotchi?card= (the art tools' card view)
  if (import.meta.env.DEV && (path === '/emonadgotchi/lab' || (path === '/emonadgotchi' && params.has('card')))) return <Suspense fallback={<div className="page" />}><EgLab /></Suspense>;
  if ((import.meta.env.DEV || __EMONAD__) && path === '/emonadgotchi') return <Suspense fallback={<div className="page" />}><EmonadMint /></Suspense>;   // his mint page and his contractURI link
  if (import.meta.env.DEV && path === '/soundlab') return <Suspense fallback={<div className="page" />}><SoundLab /></Suspense>;   // the sound lab (dev only)
  if (import.meta.env.DEV && path === '/fightlab') return <Suspense fallback={<div className="page" />}><FightLab /></Suspense>;   // Fight Club's lab (sandbox)
  if (path === '/fightclub') return <Suspense fallback={<div className="page" />}><FightClubPage /></Suspense>;   // Fight Club (unlisted)
  if (import.meta.env.DEV && path === '/fightlab') return <Suspense fallback={<div className="page" />}><FightLab /></Suspense>;   // Fight Club's lab
  if (import.meta.env.DEV && path === '/habibi') return <Suspense fallback={<div className="page" />}><HabibiLab /></Suspense>;
  if (EMO_ON && (path === '/shop/emo' || path === '/shop/emo-pack')) return <Suspense fallback={<div className="page" />}><EmoPack /></Suspense>;   // the emo pack's page
  if (import.meta.env.DEV && path === '/emopack') return <Suspense fallback={<div className="page" />}><EmoLab /></Suspense>;   // the emo pack's lab: all five pets, every item, every animation   // the Habibi pack's lab: all four pets, every item, every animation
  // the fourth pet's lab, local only: /thiccums/lab (and /thiccums itself, and its ?card= view the art tools use, while his switch is off)
  if (import.meta.env.DEV && (path === '/thiccums/lab' || (path === '/thiccums' && (!__THICCUMS__ || params.has('card'))))) return <Suspense fallback={<div className="page" />}><ThiccumsLab /></Suspense>;
  if (path === '/judaica' || path === '/jewish') { location.replace('/shop/jewish'); return null; }   // the pack's lab closed (operator, 2026-09-28): its page is in the Item shop now (JudaicaLab.tsx kept)
  if (path === '/shop/jewish' || path === '/shop/jewish-pack') return <JewishPack />;   // the Jewish pack's page, in the Item shop tab
  if (path === '/pfps') return <Pfps />;        // profile pictures of the three pets, not on chain, just for fun (unlisted until reviewed)
  if (path === '/pfplab') return <PfpLab />;    // one pet in one mood on a real stage, for tools/pfps.mjs (the room backgrounds)
  if (path === '/emotown' || path === '/town') return <Suspense fallback={<div className="town-boot" />}><Emotown /></Suspense>;   // unlisted, experimental (2026-09-26): Emotown
  const profile = /^\/u\/([A-Za-z0-9_]{3,20}|0x[0-9a-fA-F]{40})$/.exec(path);   // Emotown profiles (2026-09-26): /u/<address> or /u/<name>
  if (profile) return <Suspense fallback={<div className="page" />}><ProfilePage key={profile[1]} keyParam={profile[1]!} /></Suspense>;
  if (path === '/r1') return <Suspense fallback={null}><R1 /></Suspense>;   // unlisted, experimental: Emogotchi on the rabbit r1 (the install QR anywhere else)
  if (path === '/inversebrah') return <InversebrahAssets />;
  if (path === '/mint') return <Mint pet="frok" />;    // inversebrah's mint page (nav "inversebrah"); /inversebrah is his assets page and contractURI link
  if (path === '/tung') return <Mint pet="sahur" />;   // Tung Tung Tung Sahur's mint page (nav "Tung Tung Tung"), and his contractURI link
  if (__THICCUMS__ && path === '/thiccums') return <Mint pet="thiccums" />;   // Thiccums' mint page and his contractURI link (only with his switch on)
  if (path === '/refer') return <Refer />;   // unlisted for now: the link is the entry point, not a nav tab
  if (path === '/shop' || path === '/items') return <Shop />;
  if (path === '/faq') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><main className="landing"><Faq /></main><SiteFooter /></div>;
  if (path === '/stats') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Stats /><SiteFooter /></div>;
  if (path === '/leaderboard') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Leaderboard /><SiteFooter /></div>;
  if (path === '/pets' || path === '/cats' || path === '/collection') return <div className="page"><Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact /><Gallery initial={petParam(params.get('pet'))} /><SiteFooter /></div>;
  const frokPet = /^\/inversebrah\/pet\/(\d+)$/.exec(path);
  if (frokPet) return <Home petId={Number(frokPet[1])} petCol="frok" />;
  const sahurPet = /^\/tung\/pet\/(\d+)$/.exec(path);
  if (sahurPet) return <Home petId={Number(sahurPet[1])} petCol="sahur" />;
  const thiccPet = __THICCUMS__ ? /^\/thiccums\/pet\/(\d+)$/.exec(path) : null;
  if (thiccPet) return <Home petId={Number(thiccPet[1])} petCol="thiccums" />;
  const r3Pet = __R3TARDS__ ? /^\/r3tardgotchi\/pet\/(\d+)$/.exec(path) : null;   // a r3tard's own page (only with his switch on)
  if (r3Pet) return <Home petId={Number(r3Pet[1])} petCol="r3tards" />;
  const egPet = __EMONAD__ ? /^\/emonadgotchi\/pet\/(\d+)$/.exec(path) : null;   // an Emonad's own page (only with his switch on)
  if (egPet) return <Home petId={Number(egPet[1])} petCol="emonad" />;
  const pet = /^\/pet\/(\d+)$/.exec(path);
  return <Home petId={pet ? Number(pet[1]) : null} petCol="cat" />;
}

function Home({ petId, petCol }: { petId: number | null; petCol: Collection }) {
  const [simG, dispatch] = useReducer(reduce, undefined, initial);
  const [director, setDirector] = useState<Director | null>(null);
  const dRef = useRef<Director | null>(null); dRef.current = director;
  const dState = useSyncExternalStore(useCallback((fn) => director?.subscribe(fn) ?? (() => {}), [director]), () => director?.getState() ?? EMPTY, () => EMPTY);
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  // the notifications' subscription follows the site's wallet (push/client.ts): its pets are the ones watched
  useEffect(() => { setPushWallet(wallet.address && !wallet.demo ? wallet.address : null); }, [wallet.address, wallet.demo]);
  const [modal, setModal] = useState(false);
  const [hasPet, setHasPet] = useState(params.get('view') !== 'nopet');
  const [view, setView] = useState<ViewOverride>(((params.get('view') as ViewOverride | null) ?? 'auto'));
  const [crownOverride, setCrownOverride] = useState<boolean | null>(CHAIN_MODE ? null : true); // demo: crown on for review; live: from the contract
  const [demoCharacter, setCharacter] = useState<Character>(PET_PARAM); // the demo's pet; live mode reads it off the active pet's collection
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [allMode, setAllMode] = useState(false); // live: the "All" tab, every button acts on every pet in the wallet, whatever its kind
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
  // "Add MON from another chain" takes the wallet to Base (or wherever) and back: not while it is away
  const topupIsAway = useSyncExternalStore(onTopupAway, topupAway, () => false);
  useEffect(() => {
    if (!wrongChain || !chainCfg || topupIsAway) return;
    void ensureChain(chainCfg.chain.id, chainCfg.chain.name, chainCfg.rpcUrl, chainCfg.explorer).catch(() => {});
  }, [wrongChain, topupIsAway]);
  const activeCat = live ? (chainStore?.active() ?? null) : null;
  const character: Character = live ? characterOf(activeCat?.col ?? 'cat') : demoCharacter;
  const col: Collection = live ? (activeCat?.col ?? 'cat') : collectionOf(demoCharacter);
  const free = PETS[col].free;   // inversebrah's and Sahur's care is gas only; only a name costs
  const owns = live ? (chainStore?.ownsActive() ?? false) : true;
  // the owner's profile (Emotown social): their name once they have claimed one, else the short address
  const ownerAddr = activeCat ? activeCat.owner.toLowerCase() : null;
  useCards(ownerAddr ? [ownerAddr] : NO_ADDRESSES);
  const ownerLink = ownerAddr ? { href: `/u/${cardFor(ownerAddr)?.name ?? ownerAddr}`, label: owns ? 'yours' : `by ${cardFor(ownerAddr)?.name ?? `${ownerAddr.slice(0, 6)}…${ownerAddr.slice(-4)}`}` } : undefined;
  const g: Game = live && activeCat ? toGame(activeCat, snap.totals, snap.log) : simG;
  const name = live ? (activeCat?.name ?? '') : simName;
  const crown = crownOverride ?? (live ? (activeCat?.crowned ?? false) : true);
  // the outfit: what the shop says this cat is wearing (its owner still holds the item), or the lab's ?costume=
  // The demo account's wardrobe (DEV builds only, for trying things with no chain): every item in the shop is "held",
  // and what is on is kept here. Its pets are every kind there is (the tabs), all in the one simulated room.
  const [demoWorn, setDemoWorn] = useState<number[]>([]);
  const worn = live && activeCat ? snap.worn[petKey(activeCat.col, activeCat.id)] ?? [] : DEMO_ALL ? demoWorn : [];
  // one outfit at a time: what the shop says it is wearing, or the lab's ?costume=
  const costume: Costume | null = COSTUME ? ((COSTUMES as readonly string[]).includes(COSTUME) ? (COSTUME as Costume) : null) : costumeOf(worn);
  const hair = COSTUME === 'emohair' || hairOf(worn, character);
  // the Jewish pack: the kippah and the star are worn with any outfit; the dreidel and the hen change Play and Pet
  const accessories = COSTUME ? [] : accessoriesOf(worn, character);
  const dressKey = [...(costume ? [costume] : []), ...accessories].join(',');
  const toy = toyOf(worn);
  const petMove = petMoveOf(worn);
  const scene = (SCENE === 'halloween' || SCENE === 'backrooms' || SCENE === 'kotel' ? SCENE : null) ?? sceneOf(worn);

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
  // The demo has two pets to show, so the sheet lets the visitor pick one. Defaults to ?pet= (or the cat) for the
  // callers that do not care, such as the "no pet yet" view.
  const doDemo = (c: Character = PET_PARAM) => { setCharacter(c); setWallet(connectDemo()); setModal(false); };
  const doDisconnect = () => { const wasInjected = !wallet.demo; disconnect(); setWallet(EMPTY_WALLET); if (wasInjected) void revokeInjected(); };

  // dev builds only, like the sibling handles in game/chain.ts. `chain` reaches the live signer
  // (chainStore.client.signerInfo.provider), so in a production build this was a named handle to the wallet for
  // anything running on the page — a pasted "support script", an extension. The tools that use it all drive a dev
  // server, so gating on the build mode costs nothing.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __pet?: unknown }).__pet = director ? { director, dispatch, chain: chainStore } : undefined;
  }, [director]);

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
  useEffect(() => { director?.setCostumes(dressKey ? (dressKey.split(',') as Costume[]) : []); }, [director, dressKey]);
  useEffect(() => { director?.setToy(toy); }, [director, toy]);
  useEffect(() => { director?.setPetMove(petMove); }, [director, petMove]);
  useEffect(() => { director?.setHair(hair); }, [director, hair]);
  // Fight Club's belt or black eye, for the day after a fight (fight/wear.ts); a ghost wears none
  const lookCol = activeCat?.col ?? null, lookId = activeCat?.id ?? null, lookAlive = !!activeCat?.alive;
  useEffect(() => {
    if (!director || !live || lookCol === null || lookId === null) return;
    let on = true;
    const pet = { col: lookCol, id: lookId };
    const apply = () => { if (on) wear(director.rig, character, lookOf(pet), lookAlive); };
    void loadLooks([pet]).then(apply);
    const id = setInterval(() => { if (document.visibilityState === 'visible') void loadLooks([pet], true).then(apply); }, 60_000);
    return () => { on = false; clearInterval(id); };
  }, [director, live, lookCol, lookId, lookAlive, character]);

  // ---- the pet on screen ----
  // Every pet has its own room: the Stage is keyed by the pet, so switching pets opens a fresh room on the new pet as it
  // already is (director.arrive: asleep, a ghost, its poop down), and nothing the last pet was doing carries over to it.
  // An action's animation plays in the room of the pet it was for, and only if that pet is still on screen when the chain
  // says yes: before, one room served every pet, and a feed sent for one played on whichever pet was showing by the time
  // it landed, locking that pet's buttons until it ended (operator, 2026-09-29).
  const shownKey = live && activeCat ? petKey(activeCat.col, activeCat.id) : 'demo';
  const shownRef = useRef(shownKey); shownRef.current = shownKey;
  // While one of our own actions is in flight (its transaction, its animation, and the chain read after it) the room is
  // not put back in step with the chain: until that read lands, the chain's numbers are older than what the room has just
  // played, and syncing to them brought the poop straight back after a clean, woke a pet that had just gone to bed, and
  // played a revived pet's death again.
  const [holding, setHolding] = useState(0);

  // ---- events the world raises on its own (demo: from the clock; live: from the contract) ----
  const poopFired = useRef(false);
  useEffect(() => { poopFired.current = false; }, [director]);   // a new room: whatever the last one was doing is gone
  useEffect(() => {
    if (!director || !g.alive || g.poop || g.sleeping || dState.busy || poopFired.current) return;
    if (live) return;
    if (g.poopDue === null || g.t < g.poopDue) return;
    poopFired.current = true;
    director.poop().then(() => { dispatch({ type: 'pooped' }); poopFired.current = false; });
  }, [director, live, g.alive, g.poopDue, g.t, g.poop, g.sleeping, dState.busy]);
  useEffect(() => {
    // live: the contract says there is a poop and the scene has none yet
    if (!live || !director || holding || snap.pending || !g.alive || !g.poop || dState.poop || dState.busy || poopFired.current) return;
    poopFired.current = true;
    director.poop().then(() => { poopFired.current = false; });
  }, [live, director, holding, snap.pending, g.alive, g.poop, dState.poop, dState.busy]);
  // live: the contract says there is no poop and the scene still shows one (cleaned from another tab, from Emotown, by the
  // "All" row while another pet was on screen): it goes quietly. A tap on it would ask the chain to clean up nothing.
  useEffect(() => {
    if (!live || !director || holding || snap.pending || g.poop || !dState.poop || dState.busy || dState.queued) return;
    director.clearPoop();
  }, [live, director, holding, snap.pending, g.poop, dState.poop, dState.busy, dState.queued]);
  useEffect(() => { if (director) director.onCleaned = () => { if (!live) dispatch({ type: 'cleaned' }); }; }, [director, live]);
  // live: a tap on the poop is the Clean button (the transaction first, then the scene); before this the scene scooped it
  // up locally and the contract still had a poop, so it came straight back (operator, 2026-09-25)
  useEffect(() => { if (director) director.onPoopTap = live ? () => { void actRef.current('clean'); return true; } : null; }, [director, live]);
  useEffect(() => {
    if (live || !director || !g.alive || g.sleeping || g.stats.energy > 0 || dState.busy) return;
    dispatch({ type: 'slept', on: true }); void director.sleep();          // it fell asleep on its own: no charge
  }, [live, director, g.alive, g.sleeping, g.stats.energy, dState.busy]);
  useEffect(() => {
    // live: keep the scene's sleep state in step with the contract
    if (!live || !director || holding || !g.alive || dState.busy || dState.dead) return;
    if (g.sleeping && !dState.sleeping) void director.sleep();
    if (!g.sleeping && dState.sleeping) void director.wake();
  }, [live, director, holding, g.alive, g.sleeping, dState.sleeping, dState.busy, dState.dead]);
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
  useEffect(() => { if (director && !(live && holding) && !g.alive && !dState.dead && !dState.busy) void director.die(); }, [live, holding, director, g.alive, dState.dead, dState.busy]);
  useEffect(() => { if (live && director && !holding && g.alive && dState.dead && !dState.busy) void director.revive(); }, [live, holding, director, g.alive, dState.dead, dState.busy]);

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
    // MON spent, EMO into the fire
    if (m) { cue('coin', { delay: 0.35 }); cue('burn', { v: 0.5, delay: 0.5 }); } else if (q) cue('coin', { delay: 0.35 });
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
  const actRef = useRef<(a: PaidAction | 'wake' | Stunt) => Promise<void>>(async () => {});
  const act = async (a0: PaidAction | 'wake' | Stunt) => {
    const d0 = dRef.current; if (!d0 || d0.isActing) return;
    // the room to play it in once the chain says yes: this pet's, if it is still the one on screen (see shownKey)
    const key = shownRef.current;
    const room = () => (shownRef.current === key ? dRef.current : null);
    if (!live) return actIn(a0, () => d0);
    setHolding((n) => n + 1);
    try { await actIn(a0, room); } finally { setHolding((n) => n - 1); }
  };
  const actIn = async (a0: PaidAction | 'wake' | Stunt, room: () => Director | null) => {
    if (isStunt(a0)) {
      // inversebrah's stunts and Sahur's tung: gas only, counted on his record, no meter touched. Live: the pet's own
      // contract (screenshot/slap/squeeze/ignite, or tung); the demo just counts them.
      const play = async (d: Director | null) => {
        if (!d) return;
        if (a0 === 'screenshot') await d.screenshot();
        if (a0 === 'slap') await d.slap();
        if (a0 === 'squeeze') await d.squeeze();
        if (a0 === 'burn') await d.burn();
        if (a0 === 'tung') await d.tung();
        if (__THICCUMS__ && a0 === 'bounce') await (d.own as { bounce?(): Promise<void> } | null)?.bounce?.();   // his own way (thiccums/ways.ts)
      };
      if (live) {
        if (!chainStore || !owns) return;
        try { await chainStore.abuse(a0); } catch { return; }
        await play(room());
        await chainStore.refresh();
        return;
      }
      dispatch({ type: 'stunt', kind: a0 });
      await play(room());
      return;
    }
    const a: PaidAction | 'wake' = a0;
    if (live) {
      if (!chainStore || !owns) return;
      if (allMode && a !== 'wake' && a !== 'revive' && a !== 'name') {
        const touched = chainStore.allTargets(a).some((t) => t.id === activeCat?.id && t.col === activeCat?.col);
        try { await chainStore.actAll(a, (c) => PETS[c].many); } catch { return; }
        // the room shows one cat: play the action on it if it was in the batch (a sleeping cat wakes first), and if it is
        // still the one on screen
        const d = room();
        if (touched && d) {
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
      const d = room();
      if (d) {
        if (a === 'wake') await d.wake();
        if (a === 'feed') await d.feed();
        if (a === 'wash') await d.wash();
        if (a === 'play') await d.play();
        if (a === 'sleep') await d.sleep();
        if (a === 'clean') await d.clean();
        if (a === 'revive') await d.revive();
      }
      await chainStore.refresh(); // the meters catch up once the scene has played the action
      return;
    }
    const d = room(); if (!d) return;
    if (a === 'wake') { dispatch({ type: 'slept', on: false }); await d.wake(); return; }
    if (!free || a === 'name') dispatch({ type: 'pay', action: a });   // his care and revive are free; only a name costs
    if (a === 'feed') { await d.feed(); dispatch({ type: 'fed' }); }
    if (a === 'wash') { await d.wash(); dispatch({ type: 'washed' }); }
    if (a === 'play') { await d.play(); dispatch({ type: 'played' }); }
    if (a === 'sleep') { dispatch({ type: 'slept', on: true }); await d.sleep(); }
    if (a === 'clean') { await d.clean(); }
    if (a === 'revive') { dispatch({ type: 'revived' }); await d.revive(); }
  };
  actRef.current = act;
  const onName = async (next: string) => {
    if (live) {
      if (!chainStore || !owns) return;
      const key = shownRef.current;
      try { await chainStore.setName(next); } catch { return; }
      if (shownRef.current === key) void dRef.current?.pet(1);   // the happy nuzzle, on the pet that was named
      await chainStore.refresh();
      return;
    }
    dispatch({ type: 'pay', action: 'name' }); dispatch({ type: 'named' }); setSimName(next); void dRef.current?.pet(1);
  };
  const onPet = () => { if (live) chainStore?.pet(); else dispatch({ type: 'petted' }); };
  // the Kapparot button (the hen is on this pet): the ritual in the room, and on chain the ordinary pet (gas only)
  const onKapparot = () => { if (!dRef.current || dRef.current.isActing) return; onPet(); void dRef.current.pet(1); };

  // ---- share card: drawn in the browser from the cat's own on-chain picture and numbers ----
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareCard, setShareCard] = useState<{ cat: CatView; blob: Blob } | null>(null);
  const onShare = async () => {
    if (!activeCat || !chainClient) return;
    setShareNote('Drawing…');
    try {
      const mood = activeCat.alive ? activeCat.mood : 'dead';
      // a costumed cat shares its costumed portrait, drawn ahead of time; the plain cat comes from chain
      const set: PortraitSet | null = costume ?? portraitSetOf(worn, character) ?? (hair ? 'emohair' : null);
      const picture = set ? { url: costumePortrait(set, mood, activeCat.crowned, character) } : await chainClient.artImage(mood, activeCat.crowned, activeCat.col);
      setShareCard({ cat: activeCat, blob: await renderShareCard(activeCat, picture) });
      setShareNote(null);
    } catch (e) {
      setShareNote((e as Error).message.slice(0, 60));
      setTimeout(() => setShareNote(null), 5000);
    }
  };

  // ---- send this pet to someone (ui/SendSheet.tsx): only your own, only on the right chain, never mid-transaction ----
  const [sending, setSending] = useState<CatView | null>(null);
  const [sendingItem, setSendingItem] = useState(false);
  const holdsItems = Object.values(snap.held).some((n) => n > 0);
  const canSend = live && !!activeCat && owns && !wrongChain && !snap.pending && !!snap.owner;

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
  const tabs: CatTab[] = live ? snap.cats.map((c) => ({ id: c.id, col: c.col, name: c.name, alive: c.alive, crowned: c.crowned }))
    : DEMO_ALL ? PET_ORDER.map((c) => ({ id: 1, col: c, name: PETS[c].one, alive: true, crowned: crown })) : [];
  // each kind of pet in the wallet has its drawing fetched while the page is idle, so a switch never opens on an empty room
  const kinds = [...new Set(snap.cats.map((c) => characterOf(c.col)))].sort().join(',');
  useEffect(() => { if (kinds) prefetchDrawings(kinds.split(',') as Character[]); }, [kinds]);
  const allCounts = live && chainStore && owns && tabs.length > 1 ? chainStore.allCounts() : null;
  const allOn = allMode && allCounts !== null;
  // the outfit toggle on our own cat: shown when the wallet holds a costume the rig can draw
  const toggler = (item: number, label: string) => async () => {
    if (!chainStore || !activeCat) return;
    try { if (worn.includes(item)) await chainStore.undress(activeCat.id, item, label, activeCat.col); else await chainStore.wear([activeCat.id], item, label, activeCat.col); } catch { return; }
    await chainStore.refresh();
  };
  // the outfits: one at a time, putting one on takes the other off first (a transaction each), so what the chain says it
  // wears is what is drawn
  const outfitShown = (item: number) => costume !== null && worn.includes(item) && costumeOf([item]) === costume;
  const outfitToggler = (item: number) => async () => {
    if (!chainStore || !activeCat) return;
    const label = ITEM_LABEL[item] ?? 'Outfit';
    try {
      // decided by what is SHOWN, not by what is on the list: a pet's list can hold an outfit that is not drawn (one
      // put on before its copy left the wallet and came back), and pressing its button must put it on, not off
      if (outfitShown(item)) {
        for (const id of outfitIdsOf(worn)) await chainStore.undress(activeCat.id, id, ITEM_LABEL[id] ?? 'Outfit', activeCat.col);
      } else {
        for (const other of outfitIdsOf(worn)) if (other !== item) await chainStore.undress(activeCat.id, other, ITEM_LABEL[other] ?? 'Outfit', activeCat.col);
        if (!worn.includes(item)) await chainStore.wear([activeCat.id], item, label, activeCat.col);
      }
    } catch { /* a swap stopped half way: show what the chain now says straight away */ }
    await chainStore.refresh();
  };
  // one button per room theme held (Spooky, Backrooms), one room at a time: the same rule and the same shape as the outfits
  const roomShown = (item: number) => scene !== null && worn.includes(item) && SCENE_ITEMS[item] === scene;
  const roomToggler = (item: number) => async () => {
    if (!chainStore || !activeCat) return;
    const label = ITEM_LABEL[item] ?? 'Room theme';
    try {
      if (roomShown(item)) {
        for (const id of roomIdsOf(worn)) await chainStore.undress(activeCat.id, id, ITEM_LABEL[id] ?? 'Room theme', activeCat.col);
      } else {
        for (const other of roomIdsOf(worn)) if (other !== item) await chainStore.undress(activeCat.id, other, ITEM_LABEL[other] ?? 'Room theme', activeCat.col);
        if (!worn.includes(item)) await chainStore.wear([activeCat.id], item, label, activeCat.col);
      }
    } catch { /* a swap stopped half way: show what the chain now says straight away */ }
    await chainStore.refresh();
  };
  // one head piece, one toy, one Pet move at a time (items.ts EXCLUSIVE_GROUPS): putting one on takes the others of its
  // group off first, a transaction each, like the outfits
  const extraToggler = (item: number) => async () => {
    if (!chainStore || !activeCat) return;
    const label = ITEM_LABEL[item] ?? 'Item';
    try {
      if (worn.includes(item)) await chainStore.undress(activeCat.id, item, label, activeCat.col);
      else {
        for (const other of exclusiveOf(item, worn)) await chainStore.undress(activeCat.id, other, ITEM_LABEL[other] ?? 'Item', activeCat.col);
        await chainStore.wear([activeCat.id], item, label, activeCat.col);
      }
    } catch { /* a swap stopped half way: show what the chain now says straight away */ }
    await chainStore.refresh();
  };
  // The Items menu: EVERY item the wallet holds (or this pet wears), by kind (items.ts itemKind), each a tap to put on or take
  // off (a transaction, gas only; a one-at-a-time kind takes the other off first). One this pet cannot use (the emo hair
  // on a cat) is listed too, greyed, so the menu is the whole inventory (operator, 2026-09-29).
  // the demo account's: the same rules as the chain's (one outfit, one room, one head piece, one toy, one Pet move)
  const demoToggle = (id: number) => () => setDemoWorn((w) => {
    const kind = itemKind(id);
    if (kind === 'outfit') { const rest = w.filter((x) => !outfitIdsOf(w).includes(x)); return w.includes(id) && costumeOf(w) === costumeOf([id]) ? rest : [...rest, id]; }
    if (kind === 'room') { const rest = w.filter((x) => !roomIdsOf(w).includes(x)); return w.includes(id) && sceneOf(w) === SCENE_ITEMS[id] ? rest : [...rest, id]; }
    if (w.includes(id)) return w.filter((x) => x !== id);
    const out = exclusiveOf(id, w);
    return [...w.filter((x) => !out.includes(x)), id];
  });
  const demoRows: ItemRow[] = !live && DEMO_ALL
    ? Object.keys(ITEM_LABEL).map(Number).sort((a, b) => a - b).map((id) => {
      const kind = itemKind(id);
      const on = kind === 'outfit' ? outfitShown(id) : kind === 'room' ? roomShown(id) : worn.includes(id);
      return { id, kind, label: ITEM_LABEL[id] ?? `Item #${id}`, icon: ITEM_ICON[id] ?? 'heart', on, held: 1, fits: itemFits(id, character), toggle: demoToggle(id) };
    })
    : [];
  const itemRows: ItemRow[] = live && owns && activeCat
    ? [...new Set([...Object.keys(snap.held).map(Number).filter((id) => (snap.held[id] ?? 0) > 0), ...worn])].sort((a, b) => a - b).map((id) => {
      const kind = itemKind(id);
      const on = kind === 'outfit' ? outfitShown(id) : kind === 'room' ? roomShown(id) : worn.includes(id);
      const toggle = kind === 'outfit' ? outfitToggler(id) : kind === 'room' ? roomToggler(id) : id === EMO_HAIR ? toggler(EMO_HAIR, 'Emo hair') : extraToggler(id);
      return { id, kind, label: ITEM_LABEL[id] ?? `Item #${id}`, icon: ITEM_ICON[id] ?? 'heart', on, held: snap.held[id] ?? 0, fits: itemFits(id, character), toggle };
    })
    : [];
  const MANY = PETS[col].many;
  // a transaction in flight for another of your pets (you switched while it was out) says which one: it is why this pet's
  // buttons wait
  const pendingPet = snap.pending && snap.pendingFor && snap.pendingFor !== shownKey ? snap.cats.find((c) => petKey(c.col, c.id) === snap.pendingFor) ?? null : null;
  const pendingLine = pendingPet ? `${pendingPet.name || fallbackName(pendingPet.col, pendingPet.id)} · ${snap.pendingLabel}` : snap.pendingLabel;
  // the All tab spans every collection the wallet holds: "all 7 pets (3 cats, 2 inversebrahs, 2 Sahurs)"
  const allKinds = allCounts ? (Object.entries(allCounts.byCol) as [Collection, number][]) : [];
  const only = allKinds.length === 1 ? allKinds[0] : null;
  const allWhat = allKinds.length > 1 ? `pets (${allKinds.map(([c, k]) => `${k} ${k === 1 ? PETS[c].one : PETS[c].many}`).join(', ')})` : only ? (only[1] === 1 ? PETS[only[0]].one : PETS[only[0]].many) : MANY;
  const pending = live ? (snap.pending ? pendingLine : !owns && activeCat ? `Someone else's ${PETS[col].one} · look but don't touch` : wrongChain ? `Switch your wallet to ${chainCfg?.chain.name ?? 'Monad'}` : allOn && allCounts ? `Every button acts on all ${allCounts.total} ${allWhat}${allCounts.asleep ? ` · ${allCounts.asleep} asleep wake up when fed, washed or played with` : ''} · the room shows ${name || `#${activeCat?.id ?? ''}`}` : null) : null;
  // a live pet's room opens on the pet as it is (see shownKey): dressed, asleep, a ghost, its poop down, before the first
  // frame; the effects above then follow the chain from there
  const onDirector = (d: Director | null) => {
    if (d && live && activeCat) d.arrive({ sleeping: g.sleeping, dead: !g.alive, poop: g.poop, sad, dirty, crown, costumes: dressKey ? (dressKey.split(',') as Costume[]) : [], hair });
    setDirector(d);
  };
  const stage = (
    <Stage key={shownKey} onDirector={onDirector} night={g.sleeping} thought={thought} thoughtSide={dState.x > 330 ? -1 : 1} onPet={onPet} scene={scene} character={character}>
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
      {which === 'landing' && <Landing stage={stage} onConnect={() => setModal(true)} connecting={wallet.status === 'connecting'} claimHref={chainCfg?.drop ? '/claim' : null} character={demoCharacter} onCharacter={setCharacter} />}
      {which === 'loading' && <main className="nopet"><div className="shell"><div className="empty-room"><div className="empty-dots" /><div className="empty-floor" /><div className="empty-card"><h2>Looking in your wallet…</h2>{snap.error && <p className="tnum">{snap.error}</p>}</div></div></div></main>}
      {which === 'nopet' && <NoPet address={wallet.address ?? '0x0000…0000'} onDemo={() => { if (live) doDemo(); else setHasPet(true); }} />}
      {(which === 'pet' || which === 'dead') && <PetView stage={stage} g={g} d={dState} name={name} onName={(nm) => void onName(nm)} act={(a) => void act(a)} tabs={tabs} activeId={live ? activeCat?.id ?? null : DEMO_ALL ? 1 : null} onShare={live && activeCat ? () => void onShare() : undefined} shareNote={shareNote} onSend={canSend ? () => setSending(activeCat) : undefined} onSendItem={canSend && holdsItems ? () => setSendingItem(true) : undefined} onTab={(id, col) => { if (!live) { setCharacter(characterOf(col)); return; } setAllMode(false); chainStore?.setActive(id, col); }} all={allCounts ? { on: allOn, counts: allCounts } : undefined} onAll={() => setAllMode(true)} pending={pending} stuck={snap.stuck ? { onOpenWallet: walletKind() === 'walletconnect' ? openWalletAgain : undefined, onGiveUp: () => chainStore?.abandon() } : null} locked={live && (!owns || !!snap.pending || wrongChain)} live={live} owner={ownerLink} items={live ? itemRows : demoRows} kapparot={petMove === 'kapparot' && (!live || owns) ? onKapparot : undefined} falcon={petMove === 'falcon' && (!live || owns) ? onKapparot : undefined} selfie={petMove === 'selfie' && (!live || owns) ? onKapparot : undefined} shopHref={live && chainCfg?.items ? '/shop' : undefined} character={character} />}
      {(which === 'pet' || which === 'dead') && live && owns && <NotifNudge />}
      {which !== 'landing' && which !== 'nopet' && which !== 'loading' && (
        <><BurnBar /><SiteFooter extra={catOnChain ? <a href={catOnChain} target="_blank" rel="noreferrer">This cat on chain</a> : undefined} /></>
      )}
      {shareCard && <Suspense fallback={null}><ShareModal cat={shareCard.cat} blob={shareCard.blob} onClose={() => setShareCard(null)} /></Suspense>}
      {sendingItem && snap.owner && <Suspense fallback={null}><SendItemPicker held={snap.held} me={snap.owner} myPets={snap.cats} worn={snap.worn} onClose={() => setSendingItem(false)} onSent={() => { void chainStore?.refresh(); }} /></Suspense>}
      {sending && snap.owner && <Suspense fallback={null}><SendSheet what={{ kind: 'pet', col: sending.col, id: sending.id, name: sending.name || fallbackName(sending.col, sending.id), view: sending, worn: snap.worn[petKey(sending.col, sending.id)] ?? [] }} me={snap.owner} myPets={snap.cats} onClose={() => setSending(null)} onSent={() => { void chainStore?.refresh(); }} /></Suspense>}
      <ConnectModal open={modal} onClose={() => setModal(false)} onInjected={() => void doInjected()} onWalletConnect={() => void doWalletConnect()} onDemo={doDemo} error={wallet.error} busy={wallet.status === 'connecting'} onConnected={(w) => { setWallet(w); setModal(false); }} />
      {DEV && <Suspense fallback={null}><DevDrawer director={director} dispatch={dispatch} view={view} setView={setView} crown={crown} setCrown={setCrownOverride} speed={g.speed} onConnectDemo={doDemo} onDisconnect={doDisconnect} live={live} onCrank={() => void chainStore?.crank()} character={demoCharacter} setCharacter={setCharacter} /></Suspense>}
    </div>
  );
}
