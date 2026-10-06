/**
 * Emogotchi on the Rabbit r1: `/r1`, unlisted, experimental.
 *
 * On the r1 (a 240x292 CSS-pixel portrait WebView with a scroll wheel and a side button) this is the whole game: the
 * live room, the four meters, the actions, and every other page of the site formatted for that screen: the item shop,
 * the crown board, browsing any pet, the stats, naming, the wallet. One interaction model throughout: the wheel walks
 * a list of chips, the side button fires the selected one, a tap fires a chip directly, holding the side button goes
 * back (or opens the menu from the room). It plays against the real contracts through a wallet the device makes for
 * itself (wallet.ts), because the r1's WebView has no passkeys. Anywhere else, the route shows the install QR.
 *
 * What the r1 sends the page: `scrollUp` / `scrollDown` / `sideClick` / `longPressStart` / `longPressEnd` as plain
 * events on `window` (measured on the device), plus ordinary touch. Keyboard arrows, Enter and Escape stand in for
 * them on a desktop, which is how the headless checks drive it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChainClient, CLAIM_REASON, FREE, type CatView, type ClaimCheck, type Collection } from '@emo-pets/chain';
import { Stage } from '../scene/Stage';
import { WALK_MAX, WALK_MIN } from '../scene/world';
import type { Director, DirectorState } from '../scene/director';
import type { PropName } from '../scene/props';
import { Icon } from '../ui/Icon';
import { chainClient, chainStore, petKey, toGame, type ChainSnapshot } from '../game/chain';
import { isDirty, isSad, need, STUNTS, MON_TO_NAME, type Game, type PaidAction, type Stunt } from '../game/state';
import type { Character, Costume } from '../pet/Pet';
import { CAT_GATED, COSTUME_ITEMS, DRAWN_ON, NAMED_PET_GATED, OUTFIT_ITEMS, PET_GATED, PET_MOVE_ITEMS, REQUIREMENT, SCENE_ITEMS, TOY_ITEMS, costumesOf, hairOf, outfitIdsOf, petMoveOf, sceneOf, toyOf } from '../items';
import { armGesture, balanceOf, create, load, phrase, r1Provider, type Stored } from './wallet';
import { useBoard, useItems, useStats } from './data';
import { Bar, Card, Chips, Over, Qr, Status, compact, mon, short, type Chip } from './ui';
import './r1.css';

const params = new URLSearchParams(location.search);
/**
 * The r1 itself, or, in a dev build or the test tunnel only, a window pretending to be one (the headless checks open
 * `?play=1` at 240x292). The shipped site made a device wallet for ANY window 320 px wide or less, or `?play` (security
 * review, 2026-09-27): a recovery phrase in a normal browser's storage, for someone who never asked for one.
 */
const onDevice = () => typeof navigator !== 'undefined' && (/ r1 Build\//.test(navigator.userAgent) || ((import.meta.env.DEV || /trycloudflare\.com$/.test(location.hostname)) && params.has('play')));
/** the rig's lite profile (GPU layers) is on unless `?lite=0`, which the pixel comparison uses */
const LITE = params.get('lite') !== '0';
/** the frame-rate lab in the menu: dev builds, the test tunnel, or `?lab=1`; never in the shipped menu */
const LAB = import.meta.env.DEV || params.has('lab') || /trycloudflare\.com$/.test(location.hostname);
/** dev and the lab only: which character the empty room shows (`?demo=frog|sahur`), so every drawing can be checked on the layered rig */
const DEMO: Character | null = LAB && (params.get('demo') === 'frog' || params.get('demo') === 'sahur') ? (params.get('demo') as Character) : null;
const EMPTY_D: DirectorState = { x: 300, dir: 1, busy: null, poop: false, sleeping: false, inTub: false, dead: false, queued: 0 };
/** the store's own first snapshot, so this page never has to know every field the store grows */
const EMPTY_SNAP: ChainSnapshot = chainStore ? chainStore.get() : ({ owner: null, cats: [], activeId: null, activeCol: 'cat', spectator: null, loaded: false, pending: null, pendingLabel: '', stuck: false, error: null, log: [], worn: {}, held: {}, hasMinted: {} } as unknown as ChainSnapshot);
const NEED_ICON: Record<NonNullable<ReturnType<typeof need>>, PropName> = { food: 'bowl', clean: 'sponge', fun: 'yarn', energy: 'moon', poop: 'scoop' };
const BUSY_MOOD: Record<string, string> = { feed: 'eating', wash: 'bathing', play: 'playing', poop: 'busy', clean: 'relieved', pet: 'purring', wake: 'waking up', walk: 'wandering', wander: 'wandering', rumble: 'hungry', sleep: 'dozing off', tour: 'showing off', die: 'fading', revive: 'coming back', screenshot: 'posing', slap: 'slapped', squeeze: 'squeezed', burn: 'on fire', tung: 'tung tung tung' };
const NEED_MOOD: Record<NonNullable<ReturnType<typeof need>>, string> = { food: 'hungry', clean: 'grubby', fun: 'bored', energy: 'sleepy', poop: 'grossed out' };
const HINT = 'wheel: choose · side button: do it · tap the pet';
const KIND = { cat: 'cat', frok: 'frok', sahur: 'Sahur' } as Record<Collection, string>;   // (the r1 leaves the fourth pet out: COLS below)
/** what an unnamed pet of each kind is called in the name row */
const UNNAMED = { cat: 'unnamed', frok: 'inversebrah', sahur: 'Tung Tung Tung' } as Record<Collection, string>;
/** the collections this build has, in the order the board and browse cycle through them */
const COLS: Collection[] = (chainClient?.collections ?? ['cat']).filter((c) => c === 'cat' || c === 'frok' || c === 'sahur');   // not the fourth pet: his bouncy butt is not built for the r1's layered rig
const nextCol = (c: Collection): Collection => COLS[(COLS.indexOf(c) + 1) % COLS.length] ?? 'cat';
const PLURAL = { cat: 'Cats', frok: 'Froks', sahur: 'Sahurs' } as Record<Collection, string>;
const characterOf = (col: Collection): Character => (col === 'frok' ? 'frog' : col === 'sahur' ? 'sahur' : 'cat');
const ITEM_ICON: Record<number, PropName> = { 1: 'moon', 2: 'moon', 3: 'emohair', 4: 'bowl', 5: 'sponge', 6: 'yarn' };

/** What the r1 shows in its creations list. The whole world in three lines, not the cat. */
export const DESCRIPTION = 'Pets that live on Monad, in your pocket. A cat and a frok you feed, wash, play with, put to bed and name; an item shop of costumes and room themes; a crown board of the best-kept pets; every pet in the world to browse. All of it on chain, forever. The r1 makes its own wallet, so there is nothing to connect: mint a frok for free and start.';

/** the creations list shows about two lines: the same world, in one breath */
export const DESCRIPTION_SHORT = 'Pets that live on Monad, in your pocket: a cat and a frok to feed, wash, play with, dress and name. The item shop, the crown board, every pet to browse. All on chain. The r1 makes its own wallet: mint a frok for free and start.';

export default function R1() {
  const [device] = useState(onDevice);
  return device ? <Game /> : <Install />;
}

// ---------------------------------------------------------------- the QR that installs it (any other screen)
function Install() {
  const url = `${location.origin}/r1`;
  // the QR carries the short version: a long payload makes a dense code the r1's camera struggles with
  const json = JSON.stringify({ title: 'Emogotchi', url, description: DESCRIPTION_SHORT, iconUrl: `${location.origin}/brand/logo.png`, themeColor: '#E84D7F' });
  return (
    <main className="r1-install">
      <h1>Emogotchi on your rabbit r1</h1>
      <p className="r1-install-lead">{DESCRIPTION}</p>
      <p>On the r1, open <b>creations</b>, tap <b>add via QR code</b>, and scan this.</p>
      <Qr text={json} size={640} />
      <ol>
        <li><b>A wallet of its own.</b> The first time, the r1 makes a real Monad wallet on the device: 12 words, the same kind MetaMask makes. Write them down when it shows them; nobody else has them.</li>
        <li><b>A pet in a minute.</b> Mint a frok for free (the site covers the first gas), or send a cat you own to the r1’s address from the wallet screen.</li>
        <li><b>The wheel and the button.</b> The wheel chooses, the side button does it, tapping the pet pets it. Hold the side button for the menu: your pets, the shop, the board, browse, stats, name, wallet.</li>
        <li><b>The same game.</b> Every feed, wash, name and costume is the same transaction the website makes, on the same contracts. What you do on the r1 shows up on the site and in your wallet, and the other way round.</li>
      </ol>
      <p className="r1-install-fine">Keep pocket money in the r1 wallet, not a stash: the device has no lock, so whoever holds it holds the coins. A cat’s 1,000 MON revive stays on the website. Experimental.</p>
    </main>
  );
}

// ---------------------------------------------------------------- the game
type Screen = 'pet' | 'menu' | 'pets' | 'shop' | 'item' | 'board' | 'browse' | 'stats' | 'name' | 'wallet' | 'phrase' | 'created' | 'lab';
/** where "back" goes from each screen */
const BACK: Partial<Record<Screen, Screen>> = { menu: 'pet', pets: 'menu', shop: 'menu', item: 'shop', board: 'menu', browse: 'menu', stats: 'menu', name: 'menu', wallet: 'menu', phrase: 'wallet', created: 'pet', lab: 'menu' };

function Game() {
  const [wallet, setWallet] = useState<Stored | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>('pet');
  const [sel, setSel] = useState(0);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [director, setDirector] = useState<Director | null>(null);
  const dRef = useRef<Director | null>(null); dRef.current = director;
  const dState = useSyncExternalStore(useCallback((fn) => director?.subscribe(fn) ?? (() => {}), [director]), () => director?.getState() ?? EMPTY_D, () => EMPTY_D);
  const snap = useSyncExternalStore(useCallback((fn) => chainStore?.subscribe(fn) ?? (() => {}), []), () => chainStore?.get() ?? EMPTY_SNAP, () => EMPTY_SNAP);
  // the pet we own that the room goes back to after browsing someone else's
  const home = useRef<{ id: number; col: Collection } | null>(null);
  const [boardCol, setBoardCol] = useState<Collection>('cat');
  const [itemId, setItemId] = useState<number | null>(null);
  const [browseAt, setBrowseAt] = useState<{ id: number; col: Collection } | null>(null);
  const [draft, setDraft] = useState('');
  const [lab, setLab] = useState<string[] | null>(null);
  const [fps, setFps] = useState<number | null>(null);

  // dev builds only: a handle for the headless checks (the pixel comparison of lite against the plain rig)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __r1?: unknown }).__r1 = { director }; }, [director]);

  // ---- the wallet on this device ----
  useEffect(() => { void load().then((w) => setWallet(w)); }, []);
  useEffect(() => { if (wallet) chainStore?.setSigner(r1Provider, wallet.address); }, [wallet]);
  useEffect(() => {
    if (!wallet) return;
    let on = true;
    const tick = () => balanceOf(wallet.address).then((b) => { if (on) setBalance(b); }).catch(() => {});
    tick(); const id = setInterval(tick, 20_000);
    return () => { on = false; clearInterval(id); };
  }, [wallet, snap.log.length]);

  // ---- the pet in the room ----
  // the r1 knows the pets in COLS only: a pet of any other collection is not shown here, and the room moves to one it knows
  const r1Cats = snap.cats.filter((c) => COLS.includes(c.col));
  const active0 = chainStore?.active() ?? null;
  const activeCat = active0 && COLS.includes(active0.col) ? active0 : null;
  useEffect(() => { if (active0 && !activeCat && r1Cats[0]) chainStore?.setActive(r1Cats[0].id, r1Cats[0].col); }, [active0?.col, active0?.id, r1Cats.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const owns = !!activeCat && (chainStore?.ownsActive() ?? false);
  const col: Collection = activeCat?.col ?? 'cat';
  const character = activeCat ? characterOf(col) : (DEMO ?? 'cat');
  const frok = col === 'frok';
  const free = FREE.has(col);
  const g: Game | null = activeCat ? toGame(activeCat, snap.totals, snap.log) : null;
  const worn = activeCat ? snap.worn[petKey(activeCat.col, activeCat.id)] ?? [] : [];
  const dressKey = costumesOf(worn, character).join(','); const hair = hairOf(worn, character); const scene = sceneOf(worn);
  const toy = toyOf(worn); const petMove = petMoveOf(worn);
  const crown = activeCat?.crowned ?? false;
  useEffect(() => { if (activeCat && owns) home.current = { id: activeCat.id, col: activeCat.col }; }, [activeCat?.id, activeCat?.col, owns]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the director follows the contract ----
  const sad = g ? isSad(g) : false; const dirty = g ? isDirty(g) : false;
  useEffect(() => { director?.setSad(sad); }, [director, sad]);
  useEffect(() => { director?.setDirty(dirty); }, [director, dirty]);
  useEffect(() => { director?.setCrown(crown); }, [director, crown]);
  useEffect(() => { director?.setCostumes(dressKey ? (dressKey.split(',') as Costume[]) : []); }, [director, dressKey]);   // its outfit and the pack's accessories
  useEffect(() => { director?.setToy(toy); director?.setPetMove(petMove); }, [director, toy, petMove]);
  useEffect(() => { director?.setHair(hair); }, [director, hair]);
  const poopFired = useRef(false);
  useEffect(() => {
    if (!director || !g || !g.alive || !g.poop || dState.poop || dState.busy || poopFired.current) return;
    poopFired.current = true;
    director.poop().then(() => { poopFired.current = false; });
  }, [director, g?.alive, g?.poop, dState.poop, dState.busy]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!director || !g || !g.alive || dState.busy || dState.dead) return;
    if (g.sleeping && !dState.sleeping) void director.sleep();
    if (!g.sleeping && dState.sleeping) void director.wake();
  }, [director, g?.alive, g?.sleeping, dState.sleeping, dState.busy, dState.dead]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!director || !g || !g.alive || g.sleeping || g.stats.energy > 30) return;
    const id = setInterval(() => { void director.yawn(); }, 14000); return () => clearInterval(id);
  }, [director, g?.alive, g?.sleeping, g?.stats.energy]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!director || !g || !g.alive || g.sleeping || g.stats.food > 28) return;
    const id = setInterval(() => { void director.rumble(); }, 11000); return () => clearInterval(id);
  }, [director, g?.alive, g?.sleeping, g?.stats.food]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (director && g && !g.alive && !dState.dead && !dState.busy) void director.die(); }, [director, g?.alive, dState.dead, dState.busy]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (director && g && g.alive && dState.dead && !dState.busy) void director.revive(); }, [director, g?.alive, dState.dead, dState.busy]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ----
  const isStunt = (x: string): x is Stunt => (STUNTS as string[]).includes(x);
  /** the room's buttons wait for the animation in progress; the shop's and the name box only for a transaction */
  const busy = dState.busy !== null || !!snap.pending || !owns;
  const txBusy = !!snap.pending || !owns;
  const act = async (a0: PaidAction | 'wake' | Stunt) => {
    const d = dRef.current; if (!d || d.isBusy || !chainStore || !owns) return;
    setNote(null);
    const fail = (e: unknown) => setNote(e instanceof Error ? e.message : String(e));
    if (isStunt(a0)) {
      try { await chainStore.abuse(a0); } catch (e) { fail(e); return; }
      if (a0 === 'screenshot') await d.screenshot();
      if (a0 === 'slap') await d.slap();
      if (a0 === 'squeeze') await d.squeeze();
      if (a0 === 'burn') await d.burn();
      if (a0 === 'tung') await d.tung();
      await chainStore.refresh();
      return;
    }
    try { await chainStore.act(a0); } catch (e) { fail(e); return; }
    if (a0 === 'wake') await d.wake();
    if (a0 === 'feed') await d.feed();
    if (a0 === 'wash') await d.wash();
    if (a0 === 'play') await d.play();
    if (a0 === 'sleep') await d.sleep();
    if (a0 === 'clean') await d.clean();
    if (a0 === 'revive') await d.revive();
    await chainStore.refresh();
  };
  const onPet = () => { if (owns) chainStore?.pet(); };
  const mint = async (c: Collection) => { if (!chainStore) return; setNote(null); try { await chainStore.mint(c); } catch (e) { setNote(e instanceof Error ? e.message : String(e)); } };
  /** the free pets this wallet has not minted yet: one chip each */
  const mintChips = (icon?: PropName): Chip[] => COLS.filter((c) => c !== 'cat' && !snap.hasMinted[c]).map((c) => ({ key: `mint-${c}`, label: `Mint a ${KIND[c]}`, icon, sub: 'free', disabled: !!snap.pending, run: () => void mint(c) }));
  const go = useCallback((s: Screen) => { setScreen(s); setSel(0); setNote(null); }, []);
  const makeWallet = async () => { try { const w = await create(); setWallet(w); go('created'); } catch (e) { setNote((e as Error).message); } };
  const back = useCallback(() => {
    setScreen((s) => {
      if (s === 'browse') { const h = home.current; chainStore?.watch(null); if (h) chainStore?.setActive(h.id, h.col); setBrowseAt(null); }
      if (s === 'name') setDraft('');
      return BACK[s] ?? 'pet';
    });
    setSel(0); setNote(null);
  }, []);

  // ---- data for the other screens (loaded when first opened, then kept) ----
  const items = useItems(screen === 'shop' || screen === 'item');
  const board = useBoard(boardCol, screen === 'board');
  const stats = useStats(screen === 'stats');
  const item = itemId === null ? null : items.data?.find((it) => it.id === itemId) ?? null;
  // what the shop can do with the pet in the room: the contract's own answer, and why not
  const [check, setCheck] = useState<(ClaimCheck & { item: number }) | null>(null);
  const heldCollection = r1Cats.find((c) => c.col === 'frok') ?? r1Cats[0] ?? null;
  const claimHint = useCallback((it: { id: number; gate: string }, pet: CatView | null): `0x${string}` => {
    const gated = it.gate !== '0x0000000000000000000000000000000000000000';
    if (!gated || !chainClient) return '0x';
    if (CAT_GATED.has(it.id)) return pet && pet.col === 'cat' ? ChainClient.catHint(pet.id) : '0x';
    if (NAMED_PET_GATED.has(it.id)) return pet ? ChainClient.petHint(chainClient.addr(pet.col), pet.id) : '0x';
    if (PET_GATED.has(it.id)) return heldCollection ? ChainClient.collectionHint(chainClient.addr(heldCollection.col)) : '0x';
    return '0x';
  }, [heldCollection]);
  useEffect(() => {
    if (screen !== 'item' || !item || !chainClient || !wallet) { setCheck(null); return; }
    let on = true; setCheck(null);
    chainClient.canClaim(item.id, wallet.address, 1, claimHint(item, owns ? activeCat : null)).then((c) => { if (on) setCheck({ ...c, item: item.id }); }).catch(() => {});
    return () => { on = false; };
  }, [screen, item, wallet, owns, activeCat?.id, activeCat?.col, claimHint, snap.held, worn.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** claim through the client with the exact hint the gate wants (the store's own helper knows cats and collections only) */
  const claimExact = async () => {
    if (!item || !check?.ok || !chainClient || !chainStore) return;
    setNote(null);
    const pet = owns ? activeCat : null;
    const hint = claimHint(item, pet);
    try {
      if (CAT_GATED.has(item.id) && pet) await chainStore.claimItem(item.id, item.name, { catId: pet.id }, check.due);
      else if (PET_GATED.has(item.id) && heldCollection) await chainStore.claimItem(item.id, item.name, { collection: heldCollection.col }, check.due);
      else if (hint === '0x') await chainStore.claimItem(item.id, item.name, null, check.due);
      else { chainStore.setSigner(r1Provider, wallet!.address); await chainClient.claimItem(item.id, 1, hint, check.due); }
    } catch (e) { setNote((e as Error).message); }
    await chainStore.refresh();
  };
  const wearing = (id: number) => worn.includes(id);
  const drawnOnThis = (id: number) => { const c = COSTUME_ITEMS[id]; return id in SCENE_ITEMS || id in TOY_ITEMS || id in PET_MOVE_ITEMS || (c !== undefined && DRAWN_ON[c].includes(character)); };
  const toggleWear = async (id: number) => {
    if (!activeCat || !owns || !chainStore || !item) return;
    setNote(null);
    try {
      if (wearing(id)) await chainStore.undress(activeCat.id, id, item.name, activeCat.col);
      else {
        // one outfit at a time: the one shown comes off first (a transaction each), then the new one goes on
        if (OUTFIT_ITEMS.includes(id)) { for (const o of outfitIdsOf(worn)) if (o !== id) await chainStore.undress(activeCat.id, o, items.data?.find((x) => x.id === o)?.name ?? 'outfit', activeCat.col); }
        await chainStore.wear([activeCat.id], id, item.name, activeCat.col);
      }
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    await chainStore.refresh();
  };
  const browse = useCallback((id: number, c: Collection) => { if (!chainStore) return; setBrowseAt({ id, col: c }); chainStore.watch(id, c); chainStore.setActive(id, c); setScreen('browse'); setNote(null); }, []);
  const nameIt = async () => { const nm = draft.trim(); if (!nm || !chainStore) return; setNote(null); try { await chainStore.setName(nm); setDraft(''); back(); } catch (e) { setNote(e instanceof Error ? e.message : String(e)); } };

  // ---- the frame-rate lab (menu → Frame rate): the real idle and the real walk, counted ----
  const [labPending, setLabPending] = useState(false);
  const measure = () => { go('pet'); setLabPending(true); };
  useEffect(() => { if (labPending && director && screen === 'pet') { setLabPending(false); void runLab(); } }, [labPending, director, screen]);   // eslint-disable-line react-hooks/exhaustive-deps
  const runLab = async () => {
    const d = dRef.current; const pet = document.querySelector<HTMLElement>('.r1 .pet'); if (!d || !pet) return;
    const out: Record<string, { fps: number; med: number; p90: number }> = {};
    const count = (ms: number) => new Promise<{ fps: number; med: number; p90: number }>((done) => {
      const t0 = performance.now(); let last = t0; const gaps: number[] = []; let frames = 0;
      const tick = (t: number) => { frames++; gaps.push(t - last); last = t; if (t - t0 < ms) { setFps(Math.round(frames / ((t - t0) / 1000 || 1))); requestAnimationFrame(tick); } else { gaps.sort((a, b) => a - b); done({ fps: Math.round(frames / (ms / 1000)), med: Math.round(gaps[gaps.length >> 1] ?? 0), p90: Math.round(gaps[Math.floor(gaps.length * 0.9)] ?? 0) }); } };
      requestAnimationFrame(tick);
    });
    const pauseRig = () => { const as = pet.getAnimations({ subtree: true }); as.forEach((a) => a.pause()); return () => as.forEach((a) => a.play()); };
    const waitIdle = async () => { for (let i = 0; i < 40 && d.isBusy; i++) await new Promise((r) => setTimeout(r, 250)); };
    await waitIdle();
    setNote('lab: static…'); { const u = pauseRig(); out['static'] = await count(2000); u(); }
    setNote('lab: idle…'); out['idle'] = await count(2500);
    for (const label of ['walk', 'walk back']) { await waitIdle(); if (!d.isBusy && !d.getState().dead) { setNote(`lab: ${label}…`); const w = d.walk(d.getState().x > 300 ? WALK_MIN : WALK_MAX); await new Promise((r) => setTimeout(r, 500)); out[label] = await count(3000); await w; } }
    setFps(null); setNote(null);
    setLab(Object.entries(out).map(([k, v]) => `${k}: ${v.fps} fps · ${v.med}/${v.p90} ms`)); setScreen('lab'); setSel(0);
    if (/trycloudflare\.com$/.test(location.hostname)) void fetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 'r1lab', ua: navigator.userAgent, out }) }).catch(() => {});
  };

  // ---- what the wheel moves through, per screen ----
  const chips: Chip[] = useMemo(() => {
    if (wallet === undefined) return [];
    if (wallet === null) return [{ key: 'create', label: 'Make a wallet', icon: 'heart', sub: 'on this r1', run: () => void makeWallet() }];
    const backChip = (label = 'Back'): Chip => ({ key: 'back', label, run: back });
    const inert = (key: string, label: string, sub?: string): Chip => ({ key, label, sub, inert: true, run: () => {} });
    switch (screen) {
      case 'created': return [{ key: 'ok', label: 'Continue', run: () => go('pet') }, { key: 'phrase', label: 'Show the 12 words', run: () => go('phrase') }];
      case 'menu': return [
        { key: 'pets', label: 'My pets', icon: 'heart', sub: r1Cats.length ? `${r1Cats.length}` : 'none', run: () => go('pets') },
        { key: 'shop', label: 'Shop', icon: 'emohair', sub: 'items', run: () => go('shop') },
        { key: 'board', label: 'Board', icon: 'flame', sub: 'crowns', run: () => go('board') },
        { key: 'browse', label: 'Browse', icon: 'camera', sub: 'any pet', run: () => browse(activeCat?.id ?? 1, activeCat?.col ?? 'cat') },
        { key: 'stats', label: 'Stats', icon: 'yarn', sub: 'the world', run: () => go('stats') },
        { key: 'name', label: 'Name', icon: 'sun', sub: `${MON_TO_NAME} MON`, disabled: !activeCat || !owns || !g?.alive, run: () => { setDraft(activeCat?.name ?? ''); go('name'); } },
        { key: 'wallet', label: 'Wallet', icon: 'bowl', sub: balance === null ? '…' : `${mon(balance)} MON`, run: () => go('wallet') },
        { key: 'refresh', label: 'Refresh', icon: 'sponge', sub: 'read again', run: () => { void chainStore?.refresh(); go('pet'); } },
        ...(LAB ? [{ key: 'fps', label: 'Frame rate', icon: 'moon', sub: 'ten seconds', run: measure } as Chip] : []),
        { key: 'back', label: 'Back', icon: 'scoop', sub: 'the room', run: back },
      ];
      case 'pets': return [
        ...r1Cats.map((c): Chip => ({ key: petKey(c.col, c.id), label: `${KIND[c.col]} #${c.id}${c.name ? ` · ${c.name}` : ''}`, sub: c.alive ? (c.crowned ? 'crowned' : 'alive') : 'dead', run: () => { chainStore?.watch(null); chainStore?.setActive(c.id, c.col); go('pet'); } })),
        ...mintChips().map((c) => ({ ...c, run: () => { c.run(); go('pet'); } })),
        backChip(),
      ];
      case 'shop': return [
        ...(items.data ?? []).map((it): Chip => {
          const held = snap.held[it.id] ?? 0; const on = wearing(it.id);
          return { key: `item${it.id}`, label: it.name, img: items.images[it.id], icon: items.images[it.id] ? undefined : ITEM_ICON[it.id] ?? 'heart', sub: on ? 'on' : held ? `held ×${held}` : it.price === 0n ? 'free' : `${mon(it.price)} MON`, run: () => { setItemId(it.id); go('item'); } };
        }),
        ...(items.data ? [] : [inert('loading', items.error ?? 'reading the shop…')]),
        backChip(),
      ];
      case 'item': {
        if (!item) return [backChip()];
        const held = snap.held[item.id] ?? 0; const on = wearing(item.id); const canWear = held > 0 || on; const drawn = drawnOnThis(item.id);
        const why = check && !check.ok ? CLAIM_REASON[check.reason] ?? 'Not now.' : null;
        const list: Chip[] = [];
        if (owns && activeCat && canWear && drawn) list.push({ key: 'wear', label: on ? 'Take it off' : 'Put it on', sub: `${KIND[activeCat.col]} #${activeCat.id} · gas`, disabled: txBusy, run: () => void toggleWear(item.id) });
        list.push({ key: 'claim', label: 'Claim', sub: check === null ? 'checking…' : check.ok ? (check.due === 0n ? 'free · gas' : `${mon(check.due)} MON`) : why ?? '', disabled: !check?.ok || txBusy, run: () => void claimExact() });
        list.push(backChip('Back to the shop'));
        return list;
      }
      case 'board': return [
        ...(COLS.length > 1 ? [{ key: 'col', label: `${PLURAL[boardCol]} · switch to ${PLURAL[nextCol(boardCol)].toLowerCase()}`, run: () => setBoardCol(nextCol(boardCol)) } as Chip] : []),
        ...(board.data ?? []).map((r): Chip => ({ key: `${r.col}${r.id}`, label: `${r.rank}. ${r.name || `#${r.id}`}`, sub: `${r.score.toFixed(1)} · ${r.streak}d`, run: () => browse(r.id, r.col) })),
        ...(board.data ? (board.data.length ? [] : [inert('none', 'No crowns yet: a pet needs a week of care first')]) : [inert('loading', board.error ?? 'reading the crown list…')]),
        backChip(),
      ];
      case 'browse': {
        const at = browseAt ?? { id: activeCat?.id ?? 1, col: activeCat?.col ?? 'cat' };
        return [
          { key: 'prev', label: 'Previous', sub: `#${Math.max(1, at.id - 1)}`, disabled: at.id <= 1, run: () => browse(at.id - 1, at.col) },
          { key: 'next', label: 'Next', sub: `#${at.id + 1}`, run: () => browse(at.id + 1, at.col) },
          { key: 'jump', label: 'Jump ahead', sub: `#${at.id + 100}`, run: () => browse(at.id + 100, at.col) },
          ...(COLS.length > 1 ? [{ key: 'kind', label: `${PLURAL[at.col]} · look at ${PLURAL[nextCol(at.col)].toLowerCase()}`, run: () => browse(1, nextCol(at.col)) } as Chip] : []),
          backChip('Back to my pet'),
        ];
      }
      case 'stats': {
        const s = stats.data; if (!s) return [inert('loading', stats.error ?? 'reading the numbers…'), backChip()];
        const burn = (b: { emo?: number; emoBurned?: number } | undefined) => b?.emoBurned ?? b?.emo ?? 0;
        return [
          inert('cats', 'Cats', `${compact(s.cats.mints)} · ${compact(s.cats.deadNow)} dead`),
          inert('never', 'Never died', `${s.cats.neverDied} cats`),
          inert('froks', 'Froks', `${compact(s.froks.mints)} · ${compact(s.froks.deadNow)} dead`),
          inert('abuse', 'Frok abuse', `${compact(s.froks.abuseTotal)} counted`),
          ...(s.sahurs ? [inert('sahurs', 'Sahurs', `${compact(s.sahurs.mints)} · ${compact(s.sahurs.deadNow)} dead`), inert('tungs', 'Tung tung tung', `${compact(s.sahurs.abuseTotal)} counted`)] : []),
          inert('emo', 'EMO burned', compact(burn(s.cats.burn) + burn(s.froks.burn) + burn(s.shop?.burn))),
          inert('care', 'Care paid for', `${compact(s.cats.careTotal + s.froks.careTotal)} actions`),
          inert('names', 'Names given', `${s.cats.namesGiven + s.froks.namesGiven}`),
          inert('active', 'Active today', `${s.cats.active24h + s.froks.active24h} wallets`),
          backChip(),
        ];
      }
      case 'name': return [
        { key: 'save', label: activeCat?.name ? 'Rename' : 'Name it', sub: `${MON_TO_NAME} MON`, disabled: !draft.trim() || draft.trim() === activeCat?.name || new TextEncoder().encode(draft.trim()).length > 32 || txBusy, run: () => void nameIt() },
        backChip('Cancel'),
      ];
      case 'wallet': return [{ key: 'phrase', label: 'Show the 12 words', run: () => go('phrase') }, backChip()];
      case 'phrase': case 'lab': return [backChip()];
      default: {   // the room
        if (!snap.loaded) return [{ key: 'menu', label: 'Menu', icon: 'heart', run: () => go('menu') }];
        if (!activeCat) return [
          ...mintChips('heart'),
          { key: 'wallet', label: 'Wallet', icon: 'bowl', sub: 'send a cat here', run: () => go('wallet') },
          { key: 'menu', label: 'Menu', icon: 'moon', run: () => go('menu') },
        ];
        if (!owns) return [{ key: 'browse', label: 'Looking at', icon: 'camera', sub: `${KIND[col]} #${activeCat.id}`, run: () => browse(activeCat.id, activeCat.col) }, { key: 'menu', label: 'Menu', icon: 'heart', run: () => go('menu') }];
        if (g && !g.alive) return [
          // a cat's revive is 1,000 MON, far past what this pocket wallet will ever send in one go: that one is for the site
          { key: 'revive', label: 'Revive', icon: 'flame', sub: free ? 'free' : '1000 MON · on the site', disabled: busy || !free, run: () => void act('revive') },
          { key: 'menu', label: 'Menu', icon: 'heart', run: () => go('menu') },
        ];
        const cost = free ? 'free' : '1 MON';
        const asleep = !!g?.sleeping;
        const list: Chip[] = [
          { key: 'feed', label: 'Feed', icon: 'bowl', sub: cost, disabled: busy || asleep, run: () => void act('feed') },
          { key: 'wash', label: 'Wash', icon: 'sponge', sub: cost, disabled: busy || asleep, run: () => void act('wash') },
          { key: 'play', label: 'Play', icon: 'yarn', sub: cost, disabled: busy || asleep, run: () => void act('play') },
          asleep ? { key: 'wake', label: 'Wake', icon: 'sun', sub: 'gas', disabled: busy, run: () => void act('wake') }
            : { key: 'sleep', label: 'Sleep', icon: 'moon', sub: cost, disabled: busy || (g?.stats.energy ?? 0) >= 100, run: () => void act('sleep') },
        ];
        if (dState.poop || g?.poop) list.push({ key: 'clean', label: 'Clean', icon: 'scoop', sub: cost, disabled: busy, run: () => void act('clean') });
        if (frok) list.push(
          { key: 'screenshot', label: 'Snap', icon: 'camera', sub: 'free', disabled: busy || asleep, run: () => void act('screenshot') },
          { key: 'slap', label: 'Slap', icon: 'pow', sub: 'free', disabled: busy || asleep, run: () => void act('slap') },
          { key: 'squeeze', label: 'Squeeze', icon: 'clawjaw', sub: 'free', disabled: busy || asleep, run: () => void act('squeeze') },
          { key: 'burn', label: 'Burn', icon: 'fire', sub: 'free', disabled: busy || asleep, run: () => void act('burn') },
        );
        if (col === 'sahur') list.push({ key: 'tung', label: 'Tung', icon: 'pow', sub: 'free', disabled: busy || asleep, run: () => void act('tung') });
        list.push({ key: 'menu', label: 'Menu', icon: 'heart', run: () => go('menu') });
        return list;
      }
    }
  }, [wallet, screen, balance, snap.cats, snap.loaded, snap.pending, snap.hasMinted, snap.held, activeCat?.id, activeCat?.col, activeCat?.name, owns, g?.alive, g?.sleeping, g?.stats.energy, g?.poop, dState.poop, busy, txBusy, frok, free, col, items.data, items.images, items.error, item, check, board.data, board.error, boardCol, browseAt, stats.data, stats.error, draft, worn]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, chips.length - 1))); }, [chips.length]);

  // ---- the r1's controls (and a keyboard, for a desktop) ----
  const chipsRef = useRef(chips); chipsRef.current = chips;
  const selRef = useRef(sel); selRef.current = sel;
  const screenRef = useRef(screen); screenRef.current = screen;
  const lastClick = useRef(0);
  useEffect(() => {
    const move = (dlt: 1 | -1) => { armGesture(); const cnt = chipsRef.current.length; if (!cnt) return; setSel((s) => (s + dlt + cnt) % cnt); };
    const fire = () => {
      armGesture();
      const now = Date.now(); if (now - lastClick.current < 250) return; lastClick.current = now;   // the r1 sends a double click as two clicks 50 ms apart
      const c = chipsRef.current[selRef.current]; if (c && !c.disabled && !c.inert) c.run();
    };
    const hold = () => { armGesture(); if (screenRef.current === 'pet') go('menu'); else back(); };
    const up = () => move(-1); const down = () => move(1);
    const press = (e: Event) => { if (e.isTrusted) armGesture(); };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA' && e.key !== 'Escape') return;   // typing a name
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); up(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); down(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
      else if (e.key === 'Escape') { e.preventDefault(); hold(); }
    };
    window.addEventListener('scrollUp', up); window.addEventListener('scrollDown', down);
    window.addEventListener('sideClick', fire); window.addEventListener('longPressStart', hold);
    window.addEventListener('pointerdown', press, true); window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scrollUp', up); window.removeEventListener('scrollDown', down);
      window.removeEventListener('sideClick', fire); window.removeEventListener('longPressStart', hold);
      window.removeEventListener('pointerdown', press, true); window.removeEventListener('keydown', key);
    };
  }, [go, back]);
  // the phrase never stays on screen: a minute, or any other screen, and it is gone
  useEffect(() => { if (screen !== 'phrase') return; const id = setTimeout(back, 60_000); return () => clearTimeout(id); }, [screen, back]);

  // ---- words ----
  const n = g ? need(g) : null;
  const avg = g ? (g.stats.food + g.stats.clean + g.stats.fun + g.stats.energy) / 4 : 0;
  const mood = !g ? '' : !g.alive ? 'gone' : g.sleeping ? 'sleeping' : dState.busy ? (BUSY_MOOD[dState.busy] ?? 'busy') : n ? NEED_MOOD[n] : avg > 78 ? 'happy' : avg > 55 ? 'content' : 'meh';
  const thought = g && !dState.busy && n ? NEED_ICON[n] : null;
  const pendingText = snap.pending ? `${snap.pendingLabel.split(' · ')[0]} · ${snap.pending === 'wallet' ? 'signing on the r1' : 'waiting for Monad'}` : null;
  const status = fps !== null ? `${note ?? 'lab'} ${fps} fps` : note ?? pendingText ?? snap.error ?? snap.log[0] ?? (wallet && !activeCat && snap.loaded ? 'no pet here yet' : HINT);
  const statusKind = fps !== null ? 'is-busy' : note ? 'is-bad' : snap.pending ? 'is-busy' : snap.error ? 'is-bad' : '';
  const bal = balance === null ? '…' : `${mon(balance)} MON`;
  /** a list screen: title bar, optional body, the chips, a hint (or the transaction in flight) */
  const list = (title: string, right?: string, body?: React.ReactNode, hint = 'hold the side button: back') => <Over><Bar title={title} right={right} />{body}<Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text={note ?? pendingText ?? hint} kind={note ? 'is-bad' : snap.pending ? 'is-busy' : ''} /></Over>;

  // ---- screens ----
  // The room is always mounted and every other screen is an overlay on top of it: the 360 KB drawing costs the r1
  // about two seconds to parse, and unmounting it for a trip to the menu would charge that on every way back.
  const overlay = (() => {
    if (wallet === undefined) return <Over><Card title="Emogotchi" lines={['starting up…']} /></Over>;
    if (wallet === null) return <Over><Card title="Emogotchi" lines={['A pet that lives in your r1.', 'It makes a wallet on this device. Keep only pocket money in it: the r1 has no lock.']} /><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text={note ?? 'side button: make it'} kind={note ? 'is-bad' : ''} /></Over>;
    switch (screen) {
      case 'created': return <Over><Card title="Your r1 wallet" lines={[short(wallet.address), 'Made and saved on this r1. A frok is free; a cat needs MON sent here.']}><Qr text={wallet.address} size={96} /></Card><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text="write the 12 words down once" kind="" /></Over>;
      case 'menu': return <Over><Bar title="Emogotchi" right={bal} /><Chips chips={chips} sel={sel} onPick={setSel} mode="tiles" /><Status text={note ?? pendingText ?? 'hold the side button: back to the room'} kind={snap.pending ? 'is-busy' : ''} /></Over>;
      case 'pets': return list('My pets', `${r1Cats.length}`, !r1Cats.length ? <p className="r1-note">No pet in this wallet yet. Mint a free one below, or send a cat to the wallet address.</p> : undefined);
      case 'shop': return list('Item shop', items.data ? `${items.data.length}` : undefined, undefined, 'every item goes on any pet');
      case 'item': return item ? <Over><Bar title={item.name} right={item.remaining === null ? 'unlimited' : `${item.remaining} left`} /><div className="r1-item">{items.images[item.id] ? <img src={items.images[item.id]} alt="" /> : <span className="r1-item-blank" />}<div className="r1-item-text"><p>{item.description}</p><p className="r1-item-req">{REQUIREMENT[item.id] ?? 'Anyone'}</p></div></div><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text={note ?? pendingText ?? (owns && activeCat ? `with ${KIND[activeCat.col]} #${activeCat.id}` : 'no pet of yours in the room')} kind={note ? 'is-bad' : snap.pending ? 'is-busy' : ''} /></Over> : list('Item shop');
      case 'board': return list('Crown board', board.data ? `${board.data.length} crowned` : undefined, undefined, 'side button: look at that pet');
      case 'stats': return list('The world', stats.data ? `${new Date(stats.data.generatedAt).toUTCString().slice(17, 22)} UTC` : undefined, undefined, 'the stats page, five minutes behind');
      case 'name': return <Over><Bar title={activeCat?.name ? 'Rename' : 'Name your pet'} right={activeCat ? `${KIND[activeCat.col]} #${activeCat.id}` : undefined} /><textarea className="r1-input" value={draft} maxLength={32} rows={1} autoFocus placeholder="type a name" onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void nameIt(); } }} /><p className="r1-note">{MON_TO_NAME} MON, 80% of it buys EMO and burns it. Up to 32 bytes. Names are forever on chain.</p><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text={note ?? pendingText ?? 'tap the box to type · side button: save'} kind={note ? 'is-bad' : snap.pending ? 'is-busy' : ''} /></Over>;
      case 'wallet': return <Over><Card title="Wallet" lines={[wallet.address, bal, free || !activeCat ? 'send MON here for a cat, or a cat itself' : 'send MON here: every care is 1 MON']}><Qr text={wallet.address} size={96} /></Card><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text="scan with a phone wallet to send" kind="" /></Over>;
      case 'phrase': return <Over><Card title="Recovery phrase" lines={['These 12 words ARE the wallet. Anyone who has them has your pets and MON. Nobody will ever ask for them.']}><ol className="r1-words" translate="no">{phrase().map((w, i) => <li key={i}><span>{i + 1}</span>{w}</li>)}</ol></Card><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text="hides itself in a minute" kind="" /></Over>;
      case 'lab': return <Over><Card title="Frame rate" lines={lab ?? ['nothing measured yet']} /><Chips chips={chips} sel={sel} onPick={setSel} mode="list" /><Status text="frames per second · median/p90 frame ms" kind="" /></Over>;
      default: return null;   // the room, and browse (which is the room with other chips)
    }
  })();

  return (
    <div className={`r1 ${g && !g.alive ? 'is-dead' : ''}`}>
      <div className="r1-room">
        <Stage quiet onDirector={setDirector} night={!!g?.sleeping} thought={thought} thoughtSide={dState.x > 330 ? -1 : 1} onPet={onPet} scene={scene} character={character} lite={LITE} />
        {!activeCat && <div className="r1-veil">{snap.loaded ? (COLS.some((c) => snap.hasMinted[c]) ? 'looking for your pets…' : 'no pet yet') : (snap.error ? 'Monad is not answering' : 'looking in your wallet…')}</div>}
      </div>
      <div className="r1-name">
        {activeCat ? <><b>#{activeCat.id}</b><span className="r1-nm">{activeCat.name || UNNAMED[activeCat.col]}</span><i>{mood}</i>{activeCat.crowned && <span className="r1-crown" aria-label="crowned">♛</span>}{!owns && <span className="r1-tag">not yours</span>}</> : <b>Emogotchi</b>}
        <span className="r1-bal">{balance === null ? '' : `${mon(balance)} MON`}</span>
      </div>
      {g && (
        <div className="r1-meters" aria-label="Meters">
          <Meter icon="bowl" v={g.stats.food} /><Meter icon="sponge" v={g.stats.clean} /><Meter icon="yarn" v={g.stats.fun} /><Meter icon="moon" v={g.stats.energy} />
        </div>
      )}
      {!overlay && <Chips chips={chips} sel={sel} onPick={setSel} mode={screen === 'browse' ? 'list' : 'grid'} />}
      <Status text={screen === 'browse' ? (note ?? `looking at ${KIND[col]} #${activeCat?.id ?? '…'}`) : status} kind={statusKind} />
      {overlay}
    </div>
  );
}

function Meter({ icon, v }: { icon: PropName; v: number }) {
  return (
    <div className={`r1-meter ${v < 35 ? 'is-low' : ''}`} role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <Icon name={icon} size={12} /><span className="r1-bar"><span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
    </div>
  );
}
