/**
 * Emotown (/emotown, unlisted, experimental; 2026-09-26): one long street where every pet its owner touched in the
 * last 24 hours lives, drawn live by its real rig, dressed and moody from its on-chain state, and acting out what
 * happens on chain as it happens.
 *
 * The town holds everyone; only the pets on or near the screen are drawn (the rest are points in the sim, TownSim),
 * because a live rig costs a frame budget: measured 2026-09-26, 50 on screen hold 60 fps on an M3 Pro and 20 on a
 * phone-class CPU. A phone's screen shows ten or so, a desktop's thirty or forty.
 */
import { cue } from '../sound/cue';
import { SoundControl } from '../sound/Control';
import { useMusic } from '../sound/useMusic';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Collection } from '@emo-pets/chain';
import { chainClient } from '../game/chain';
import { PETS, fallbackName } from '../pets';
import { Actor } from './Actor';
import { Donors } from './TownPet';
import { setHush } from '../pet/rig';
import { installAnimationRegistry } from './anims';
import { Camera } from './camera';
import { followChain, loadBurned, loadCrowns, loadIndex, loadViews, type LiveEvent, type TownIndex } from './data';
import { LANDMARKS, OBSTACLES, TOWN } from './layout';
import { Ground, TOWN_RASTER } from './Scenery';
import { Hills, Skyline, StreetBack, StreetProps } from './Street';
import { Sky } from './Sky';
import { Weather } from './Weather';
import { SEASON_ICON, SEASON_NAME, season as seasonNow, timeOfDay, type Season, type TimeOfDay } from './time';
import { TownSim, inTown, keyOf } from './sim';
import { onFightResult, registerTownSim } from '../fight/town/FightTown';
import { loadLooks } from '../fight/wear';
import { benchTown, lineupTown } from './bench';
import { myAddress } from './mine';
import { Doors, Finder, Minimap, MyPets, PetCard, Ticker, nameOf, tickFor, tickForFight, type Tick } from './Ui';
import { BubbleLayer, SocialButtons, SocialPanels, useHud, useTownTalk } from './TownSocial';
import { ChatClient } from '../social/chat';
import { api } from '../social/api';
import { social } from '../social/store';
import { OwnerCard } from '../social/OwnerCard';
import { SignInHost } from '../social/SignIn';
import { InboxHost } from '../social/Inbox';
import { ReportHost } from '../social/Report';
import { RoleSheetHost } from '../social/RolesAdmin';
import { LinkGate, useSocial } from '../social/ui';
import './emotown.css';
import '../social/social.css';

const params = new URLSearchParams(location.search);
/**
 * How the hills (0.42 of the street's speed) and the far city (0.16) follow the street:
 * - 'timeline' where CSS can tie them to the scroll (Chrome 115+, Safari 26+): no script at all, on the compositor where
 *   the engine does that (measured smooth in Chrome). Its keyframes are plain percentages (emotown.css): with
 *   calc(var(--span) * -0.42) the hills juddered against the street on an iPhone (operator, 2026-09-27: "the hill that
 *   has emotown text on it is choppy when scrolling").
 * - 'js' otherwise: moved on every scroll event.
 * - '3d' (only when asked): the layers INSIDE the scroller pushed back in depth (`perspective` on it, `translateZ(-d)
 *   scale(1 + d)` on them, d = 1/speed - 1), moving in the very same step as the street. Exact in Chromium; in WebKit
 *   26.6 (Playwright, headless) the layers were placed right but NOT PAINTED, in every variant tried (no clip,
 *   preserve-3d, will-change), so it is not the default anywhere. Kept to try on a real iPhone.
 * `?para=3d|timeline|js` forces one.
 */
const SCROLL_TIMELINE_OK = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()') && !params.has('noscrolltimeline');
const PARA_ASKED = params.get('para');
// On Safari and phones the backdrop holds still (`fixed`): the street scrolls over the hills and the far city the way it
// scrolls over the sky and the moon. A moving backdrop there meant tiles repainted and moved on every frame of a swipe,
// and on an iPhone that showed as black holes in the hills and a "glitchy" background (operator, 2026-09-27).
const PARA: '3d' | 'timeline' | 'js' | 'fixed' = PARA_ASKED === '3d' || PARA_ASKED === 'js' || PARA_ASKED === 'fixed' || (PARA_ASKED === 'timeline' && SCROLL_TIMELINE_OK) ? PARA_ASKED : TOWN_RASTER ? 'fixed' : SCROLL_TIMELINE_OK ? 'timeline' : 'js';
const SCROLL_TIMELINE = PARA === 'timeline';
const FAR = 0.16, MID = 0.42;
/** one care, stunt, pet or name on one pet: what a local action and the chain feed's copy of it have in common */
const actKey = (e: LiveEvent) => `${e.kind}:${'col' in e ? e.col : ''}:${'id' in e ? e.id : ''}:${'what' in e ? e.what : ''}`;
installAnimationRegistry();   // before any pet is drawn: every animation made inside a pet is noted against it (anims.ts)
const BENCH = Number(params.get('bench') ?? 0);
const LINEUP_MODE = import.meta.env.DEV && params.has('lineup');
/** new pets drawn per frame while the camera is still (one while it moves) */
const MAX_MOUNTS_PER_FRAME = 2;
/** keep every pet on the street mounted (paused and hidden off screen), so panning never waits on a mount */
const MOUNT_ALL = params.get('mountall') !== '0';

/** Which residents are drawn: its own little store, so a pet walking on screen redraws the crowd and not the page. */
class CrowdStore {
  private keys: string[] = [];
  private subs = new Set<() => void>();
  get = () => this.keys;
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  set(want: Set<string>) {
    if (this.keys.length === want.size && this.keys.every((k) => want.has(k))) return;
    this.keys = [...want]; for (const f of this.subs) f();
  }
}
const Crowd = memo(function Crowd({ crowd, sim, selected, me }: { crowd: CrowdStore; sim: TownSim; selected: string | null; me: string | null }) {
  const keys = useSyncExternalStore(crowd.subscribe, crowd.get);
  return <>{keys.map((key) => { const r = sim.residents.get(key); return r ? <Actor key={key} r={r} sim={sim} selected={selected === key} mine={!!me && r.view?.owner.toLowerCase() === me} /> : null; })}</>;
});

export function Emotown() {
  const sim = useMemo(() => new TownSim(), []);
  const cam = useMemo(() => new Camera(), []);
  const root = useRef<HTMLDivElement>(null);
  const street = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [vh, setVh] = useState(800);
  const crowd = useMemo(() => new CrowdStore(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [index, setIndex] = useState<TownIndex | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const version = useSyncExternalStore(useCallback((f: () => void) => sim.subscribe(f), [sim]), () => sim.version);
  const count = sim.residents.size;
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [following, setFollowing] = useState(false);
  // the visitor's own time and season, looked at again every minute
  const [tod, setTod] = useState<TimeOfDay>(() => timeOfDay());
  const [season, setSeason] = useState<Season>(() => seasonNow());
  useEffect(() => { const i = setInterval(() => { setTod(timeOfDay()); setSeason(seasonNow()); }, 60_000); return () => clearInterval(i); }, []);
  useMusic({ place: 'town', phase: tod, season });   // the town's tune, by the time of day
  const [quietMe, setMe] = useState<string | null>(null);
  const [crowns, setCrowns] = useState<{ name: string; score: number; mark: string }[]>([]);
  // EMO burned, read off the contracts (every game and the shop): at the start, every minute, and after each burn.
  // It never goes down (a public node a block behind must not take a burn back off the counter).
  const [burnedChain, setBurnedChain] = useState<number | null>(null);
  const readBurned = useCallback(() => { void loadBurned().then((n) => { if (n != null) setBurnedChain((was) => Math.max(was ?? 0, n)); }).catch(() => { /* the counter keeps its number */ }); }, []);
  useEffect(() => {
    if (BENCH) return;
    readBurned();
    const i = setInterval(() => { if (document.visibilityState === 'visible') readBurned(); }, 60_000);
    return () => clearInterval(i);
  }, [readBurned]);
  const [flare, setFlare] = useState<{ id: number; emo: number } | null>(null);
  const emoBurned = burnedChain ?? index?.emoBurned ?? 0;
  const tickId = useRef(0);
  const localActs = useRef(new Map<string, number>());
  const events = useRef<(evs: LiveEvent[], local?: boolean) => void>(() => {});

  useEffect(() => { sim.start(); return () => sim.stop(); }, [sim]);
  // Fight Club: a fight at the bar calls the nearest pets over to watch
  useEffect(() => { registerTownSim(sim); return () => registerTownSim(null); }, [sim]);
  // and its result goes on the ticker with everything else that just happened (the square is only for people)
  useEffect(() => onFightResult((f) => setTicks((prev) => [tickForFight(f, ++tickId.current), ...prev].slice(0, 12))), []);
  // Fight Club (sandbox): a fight at the bar calls the nearest pets over to watch
  useEffect(() => { registerTownSim(sim); return () => registerTownSim(null); }, [sim]);

  // ---- the social layer: the town square's socket, bubbles over the speakers' pets, visitors (TownSocial.tsx) ----
  const chat = useMemo(() => new ChatClient('square'), []);
  const soc = useSocial();
  // you, in the town: whoever is signed in to Emotown, else the wallet this browser already trusts (read quietly)
  const me = soc.me?.address ?? quietMe;
  useEffect(() => { social.start(); chat.start(); return () => chat.stop(); }, [chat]);
  // signing in or out changes who the room thinks is here: reconnect so the presence carries the right name and pet
  const who = soc.me?.address ?? null;
  const firstWho = useRef(true);
  useEffect(() => { if (firstWho.current) { firstWho.current = false; return; } chat.reconnect(); }, [chat, who]);
  const bubbles = useTownTalk(sim, chat);
  const [chatOpen, setChatOpenState] = useState(() => { try { const v = localStorage.getItem('emotown.chat'); return v === null ? innerWidth >= 1280 : v === '1'; } catch { return innerWidth >= 1280; } });
  const setChatOpen = useCallback((b: boolean) => { setChatOpenState(b); try { localStorage.setItem('emotown.chat', b ? '1' : '0'); } catch { /* private mode */ } }, []);
  const [owner, setOwner] = useState<string | null>(null);
  const hud = useHud();
  const [ownerName, setOwnerName] = useState<string | null>(null);

  // ---- the viewport ----
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    cam.attach(scroller.current);
    const fit = () => { cam.resize(el.clientWidth, el.clientHeight); setK(cam.k); setVh(el.clientHeight); requestAnimationFrame(() => cam.settle()); };
    // start where the link says (?at=diner, ?at=2400), else at the town hall, the middle of things
    const at = params.get('at'); const lm = LANDMARKS.find((l) => l.id === (at ?? 'hall'));
    fit();
    cam.start((lm ? (lm.x0 + lm.x1) / 2 : Number(at) || LANDMARKS.find((l) => l.id === 'hall')!.x0 + 380) - cam.viewW / 2);
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [cam]);
  // once the scroller has its width for this scale: be where the camera means to be (the start; a resize keeps the centre)
  useLayoutEffect(() => { cam.settle(); }, [cam, k, vh]);

  // ---- the camera moves the layers, and decides who is drawn ----
  useEffect(() => {
    let raf = 0;
    const want = new Set<string>();
    // the layers move the instant the camera does (a frame's delay here is what makes a drag feel like it trails the
    // finger); who is drawn and awake is worked out in the frame
    // the hills and the far city follow the street at 0.42 and 0.16 of its speed: where the browser supports
    // scroll-driven animations that is pure CSS on the compositor (`.para-*`), locked to the native scroll; elsewhere
    // they are moved here on every scroll event
    const place = () => {
      if (PARA !== 'js') return;
      const x = cam.x * cam.k;
      if (mid.current) mid.current.style.transform = `translate3d(${-x * MID}px, 0, 0)`;
      if (far.current) far.current.style.transform = `translate3d(${-x * FAR}px, 0, 0)`;
    };
    const apply = () => { raf = 0; sim.view = { lo: cam.x, hi: cam.x + cam.viewW }; cull(); reconcile(); };
    let last = { x: cam.x, t: performance.now() };
    // the scenery's lights, flames and smoke: paused and unpainted when off screen, like the pets (a phone sees a
    // fifteenth of the street; without this every flame on it repaints every frame)
    let scenery: { el: HTMLElement; x0: number; x1: number; off: boolean }[] | null = null;
    const cull = () => {
      if (!street.current) return;
      if (!scenery || scenery.length === 0) scenery = [...street.current.querySelectorAll<HTMLElement>('.tb, .tp')].map((el) => { const x0 = parseFloat(el.style.left) || 0; return { el, x0, x1: x0 + (parseFloat(el.style.width) || 0), off: false }; });
      // the lights come on a little before a building is on screen (a fling covers a lot of street between frames)
      const m = 260 + cam.viewW * 0.6; const lo = cam.x - m; const hi = cam.x + cam.viewW + m;
      for (const s of scenery) { const off = s.x1 < lo || s.x0 > hi; if (off !== s.off) { s.off = off; if (off) s.el.setAttribute('data-off', ''); else s.el.removeAttribute('data-off'); } }
    };
    const reconcile = () => {
      // how far ahead to mount: a screen's width either side, more in the direction the camera is moving
      const now = performance.now(); const vel = (cam.x - last.x) / Math.max(1, now - last.t); last = { x: cam.x, t: now };
      const vw = cam.viewW; const ahead = Math.min(420, vw * 0.35); const lead = Math.max(-vw, Math.min(vw, vel * 600));
      let lo = cam.x - ahead + Math.min(0, lead); let hi = cam.x + vw + ahead + Math.max(0, lead);
      if (MOUNT_ALL && Math.abs(vel) < 0.02) { lo = -Infinity; hi = Infinity; }   // everyone outdoors, drawn once while the camera rests
      const out = Math.min(900, vw * 0.7) + 200; let lo2 = cam.x - out; let hi2 = cam.x + vw + out;
      if (MOUNT_ALL) { lo2 = -Infinity; hi2 = Infinity; }
      // awake on screen (a little more on the side the camera is heading); paused but drawn within about half a screen
      // either side, so the browser has them rendered before they scroll in; hidden beyond, with some slack so a pet at
      // the boundary does not flicker between states. Going from hidden to drawn is the dear step: nearest first, a few a frame.
      const aw = 50 + Math.abs(lead) * 0.25; const pm = vw * 0.22 + 120; const hm = pm + 240;
      const alo = cam.x - aw + Math.min(0, lead * 0.5); const ahi = cam.x + vw + aw + Math.max(0, lead * 0.5);
      const plo = cam.x - pm + Math.min(0, lead); const phi = cam.x + vw + pm + Math.max(0, lead);
      const hlo = cam.x - hm + Math.min(0, lead); const hhi = cam.x + vw + hm + Math.max(0, lead);
      // drawing a pet is main-thread work, and on a phone the main thread is also what paints the street a swipe
      // uncovers: in a fast fling (over 1.2 units a ms) nobody is drawn and the street gets the frame; while it moves
      // at all, one a frame on Safari and phones, three elsewhere; standing still, ten
      const fast = Math.abs(vel) > 1.2;
      const drawBudget = fast ? 0 : Math.abs(vel) > 0.05 ? (TOWN_RASTER ? 1 : 3) : 10;
      setHush(now - lastMove < 170);   // while the street moves, no pet starts a new idle flourish (see rig.ts HUSH)
      const t = Date.now(); const c = cam.centre + lead * 0.5;
      const cands: { key: string; d: number }[] = [];
      type R = typeof sim.residents extends Map<string, infer T> ? T : never;
      const toDraw: { r: R; d: number; m: 'awake' | 'paused' }[] = [];
      const switches: { r: R; m: 'awake' | 'paused' | 'hidden' }[] = [];
      for (const k of want) if (!sim.residents.has(k)) want.delete(k);   // a visitor that walked out of town
      for (const r of sim.residents.values()) {
        if (r.inside) { want.delete(r.key); continue; }
        const x = sim.pos(r, t).x;
        if (want.has(r.key)) { if (x < lo2 || x > hi2) want.delete(r.key); }
        else if (x >= lo && x <= hi) cands.push({ key: r.key, d: Math.abs(x - c) });
        if (r.actor) {
          const now2 = r.actor.mode();
          const onScreen = x >= alo && x <= ahi;
          const want2 = onScreen ? 'awake' : x >= plo && x <= phi ? 'paused' : (x < hlo || x > hhi) ? 'hidden' : now2 === 'hidden' ? 'hidden' : 'paused';
          if (want2 === now2) { /* as it is */ }
          else if (now2 === 'hidden') toDraw.push({ r, d: Math.abs(x - c), m: want2 as 'awake' | 'paused' });
          else switches.push({ r, m: want2 });
        }
      }
      toDraw.sort((a, b) => a.d - b.d);
      for (const w of toDraw.slice(0, drawBudget)) switches.push({ r: w.r, m: w.m });
      if (toDraw.length > drawBudget) schedule();   // more to draw: carry on next frame
      // every switching pet's animations first (one style flush for the lot), then the switches
      const lists = switches.map((w) => w.r.actor?.animations() ?? []);
      switches.forEach((w, i) => w.r.actor?.setMode(w.m, lists[i]));
      cands.sort((a, b) => a.d - b.d);
      // one new pet a frame while the camera moves (a mount is a whole drawing to parse); a few when it is still
      const budget = Math.abs(vel) > 0.02 ? 1 : MAX_MOUNTS_PER_FRAME;
      let added = 0;
      for (const { key } of cands) { if (added >= budget) { schedule(); break; } want.add(key); added++; }
      crowd.set(want);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    // while the street is moving, pets that are only standing about hold still (a blink or a tail's sway missed mid-swipe
    // is invisible, and it is most of what the page repaints); a moment after it stops, they carry on
    let lastMove = -1e9; let settle: ReturnType<typeof setTimeout> | null = null;
    const off = cam.subscribe(() => {
      lastMove = performance.now(); place(); schedule();
      if (settle) clearTimeout(settle); settle = setTimeout(() => { settle = null; schedule(); }, 190);
    });
    place();
    const offSim = sim.subscribe(schedule);
    const every = setInterval(schedule, 700);   // pets walk into (and out of) view on their own
    schedule();
    return () => { off(); offSim(); clearInterval(every); if (raf) cancelAnimationFrame(raf); if (settle) clearTimeout(settle); };
  }, [cam, sim, crowd]);

  // ---- the drawings off screen load lazily for a fast first paint, then quietly in the background ----
  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(() => { for (const img of root.current?.querySelectorAll<HTMLImageElement>('img[loading="lazy"]') ?? []) img.loading = 'eager'; }, 2500);
    return () => clearTimeout(t);
  }, [status]);

  // ---- your pets: all of them in town while you are here (signed in, or a wallet this browser trusts), out on the
  // street, never sent indoors, whether or not they were cared for today ----
  useEffect(() => {
    if (!me || status !== 'ready' || !chainClient) return;
    let off = false;
    void (async () => {
      const mine = (await chainClient!.petsOf(me as `0x${string}`).catch(() => [])).filter((v) => inTown(v.col)).slice(0, 40);
      const worn = new Map<string, number[]>();
      await Promise.all(chainClient!.collections.map(async (col) => {
        const ids = mine.filter((v) => v.col === col).map((v) => v.id); if (!ids.length) return;
        const w = await chainClient!.equippedMany(ids, col).catch(() => ({} as Record<number, number[]>));
        for (const id of ids) worn.set(keyOf(col, id), w[id] ?? []);
      }));
      if (off) return;
      for (const v of mine) {
        const key = keyOf(v.col, v.id);
        if (sim.residents.has(key)) sim.update(key, v, worn.get(key) ?? []);
        else sim.add(v.col, v.id, { view: v, worn: worn.get(key) ?? [], last: null }, true);
        sim.keepOut(key);
      }
    })();
    return () => { off = true; };
  }, [me, status, sim]);

  // ---- the governor: a device that cannot keep up gets a quieter street (more pets indoors) until it can ----
  // It listens only once the town has settled (the first seconds are all parsing and drawing, and it used to read them
  // as a slow device and empty half the street), and after a return to the tab; it lowers only after two slow readings
  // in a row, and raises after three good ones. Pets it sends in go from off screen (sim.view).
  useEffect(() => {
    if (status !== 'ready') return;
    let raf = 0; let last = 0; let acc = 0; let n = 0; let since = performance.now() + 8000; let good = 0; let bad = 0;
    const back = () => { if (document.visibilityState === 'visible') { last = 0; acc = 0; n = 0; since = performance.now() + 3000; } };
    document.addEventListener('visibilitychange', back);
    const tick = (t: number) => {
      if (t < since) { last = t; raf = requestAnimationFrame(tick); return; }
      if (last && document.visibilityState === 'visible') { acc += Math.min(100, t - last); n++; }
      last = t;
      if (t - since > 4000 && n > 30) {
        const avg = acc / n;
        if (avg > 23) { good = 0; if (++bad >= 2 && sim.crowdScale > 0.45) { sim.crowdScale = Math.max(0.45, sim.crowdScale * 0.85); bad = 0; } }
        else if (avg < 17.6) { bad = 0; if (sim.crowdScale < 1 && ++good >= 3) { sim.crowdScale = Math.min(1, sim.crowdScale * 1.1); good = 0; } }
        else { bad = 0; good = 0; }
        acc = 0; n = 0; since = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', back); };
  }, [sim, status]);

  // ---- who lives here ----
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        // ?empty=1 (dev builds): the street with nobody on it, for tools/social-banners.mjs
        if (import.meta.env.DEV && params.has('empty')) { setStatus('ready'); return; }
        if (BENCH > 0 || LINEUP_MODE) {
          const { rows, views } = LINEUP_MODE ? lineupTown() : benchTown(BENCH);
          for (const row of rows) { const v = views.get(keyOf(row.col, row.id)); sim.add(row.col, row.id, { view: v?.view ?? null, worn: v?.worn ?? [], last: { ts: row.ts, what: row.what } }); }
          if (LINEUP_MODE) {   // a row along the front lane from x 200, nobody moves or goes indoors
            sim.pause = () => 1e9; sim.crowdScale = 99; let i = 0;
            const step = Math.min(118, (TOWN.w - 400) / Math.max(1, sim.residents.size - 1));   // (five pets' looks at 118 apart ran off the street's end)
            for (const r of sim.residents.values()) { if (r.inside) sim.exit(r); r.x = 200 + i * step; r.y = 900; r.trip = null; r.nextAt = Date.now() + 1e9; i++; }
          }
          setStatus('ready'); return;
        }
        const idx = await loadIndex(); if (cancelled) return;
        setIndex(idx);
        const views = await loadViews(idx.rows); if (cancelled) return;
        for (const row of idx.rows) {
          const v = views.get(keyOf(row.col, row.id));
          sim.add(row.col, row.id, { view: v?.view ?? null, worn: v?.worn ?? [], last: { ts: row.ts, what: row.what } });
        }
        setStatus('ready');
        // the crown board: the five best-cared crowned pets of any kind, named
        void loadCrowns().then(async (list) => {
          const top = list.slice(0, 5); if (cancelled) return;
          const unknown = top.filter((c) => !sim.residents.get(keyOf(c.col, c.id))?.view);
          const named = unknown.length ? await loadViews(unknown).catch(() => new Map()) : new Map();
          setCrowns(top.map((c) => {
            const v = sim.residents.get(keyOf(c.col, c.id))?.view ?? named.get(keyOf(c.col, c.id))?.view;
            return { name: v?.name || fallbackName(c.col, c.id), score: c.score, mark: PETS[c.col].mark ? PETS[c.col].mark + ' ' : '' };
          }));
        });
        // the wallet this browser already trusts, read quietly (the signed-in address, when there is one, comes first)
        void myAddress().then((a) => { if (a && !cancelled) setMe(a); });
        const unfollow = followChain((evs) => events.current(evs));
        // meters drain, moods drift: everyone's state again every few minutes; and anyone new in the index moves in
        const refresh = setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          void loadViews([...sim.residents.values()]).then((m) => { for (const [key, v] of m) sim.update(key, v.view, v.worn); }).catch(() => {});
          // Fight Club's looks (a belt, a black eye) for everyone in town: one batched read, then each pet dresses again
          void loadLooks([...sim.residents.values()], true).then((m) => { if (m.size) for (const r of sim.residents.values()) r.actor?.dress(); }).catch(() => {});
        }, 180_000);
        const relist = setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          void loadIndex().then(async (idx) => {
            setIndex(idx);
            const fresh = idx.rows.filter((row) => !sim.residents.has(keyOf(row.col, row.id)));
            if (!fresh.length) return;
            const vs = await loadViews(fresh);
            for (const row of fresh) { const v = vs.get(keyOf(row.col, row.id)); sim.add(row.col, row.id, { view: v?.view ?? null, worn: v?.worn ?? [], last: { ts: row.ts, what: row.what } }, true); }
          }).catch(() => {});
        }, 600_000);
        stop = () => { unfollow(); clearInterval(refresh); clearInterval(relist); };
      } catch (e) {
        console.error('[emotown]', e);
        if (!cancelled) setStatus('error');
      }
    })();
    const onEvents = (evs: LiveEvent[], local = false) => {
      // what you just did from a card plays at once (local); when the chain feed brings the same event back a few
      // seconds later it is not played again
      if (local) for (const e of evs) localActs.current.set(actKey(e), Date.now());
      else evs = evs.filter((e) => { const at = localActs.current.get(actKey(e)); return !(at && Date.now() - at < 120_000); });
      if (!evs.length) return;
      const touched = new Map<string, { col: Collection; id: number }>();
      const fresh: Tick[] = [];
      const name = (col: string, id: number) => { const r = sim.residents.get(`${col}:${id}`); return r ? nameOf(r) : `#${id}`; };
      for (const e of evs) { const t = tickFor(e, name, ++tickId.current); if (t) fresh.push(t); }
      if (fresh.length) setTicks((prev) => [...fresh.reverse(), ...prev].slice(0, 12));
      // a burn: the furnace roars and its counter climbs
      const burned = evs.reduce((a, e) => a + (e.kind === 'burn' ? e.emo : 0), 0);
      if (burned > 0) { cue('burn', { v: 0.7 }); setFlare({ id: Date.now(), emo: burned }); setTimeout(() => setFlare(null), 4200); setTimeout(readBurned, 1500); setTimeout(readBurned, 8000); }
      for (const e of evs) {
        if (!('id' in e) || !('col' in e)) continue;
        const key = keyOf(e.col, e.id);
        let r = sim.residents.get(key);
        if (!r) r = sim.add(e.col, e.id, { view: null, worn: [], last: null }, true);
        r.last = { ts: Math.floor(Date.now() / 1000), what: e.kind === 'care' || e.kind === 'stunt' ? e.what : e.kind };
        sim.deliver(r, e);
        touched.set(key, { col: e.col, id: e.id });
      }
      // what the chain says about them now (mood, meters, outfit)
      if (touched.size && chainClient && !BENCH) void loadViews([...touched.values()]).then((m) => { for (const [key, v] of m) sim.update(key, v.view, v.worn); });
    };
    events.current = onEvents;
    return () => { cancelled = true; stop(); };
  }, [sim]);

  // ---- picking a pet: fly to it, open its card ----
  const pick = useCallback((key: string | null) => {
    setSelected(key); setFollowing(false); cam.follow(null); setOwner(null);
    const r = key ? sim.residents.get(key) : null;
    sim.pinned.clear(); if (r) { sim.pinned.add(r.key); if (r.inside) sim.exit(r); if (r.goingIn) { r.goingIn = null; sim.halt(r); } }
    if (r) { const x = sim.pos(r).x; if (x < cam.x + 80 || x > cam.x + cam.viewW - 80) cam.flyTo(x, 900); }
  }, [cam, sim]);
  const toggleFollow = useCallback(() => {
    const r = selected ? sim.residents.get(selected) : null; if (!r) return;
    if (following) { cam.follow(null); setFollowing(false); return; }
    cam.follow(() => (sim.residents.has(r.key) ? sim.pos(r).x : null)); setFollowing(true);
  }, [cam, sim, selected, following]);
  useEffect(() => { const off = cam.subscribe(() => { if (following && !cam.following) setFollowing(false); }); return off; }, [cam, following]);
  if (import.meta.env.DEV) (window as unknown as { __town?: unknown }).__town = { sim, cam, pick, obstacles: OBSTACLES, fire: (evs: LiveEvent[]) => events.current(evs), mounted: () => crowd.get(), crowdScale: () => sim.crowdScale, say: (m: Parameters<ChatClient['inject']>[0]) => chat.inject(m) };

  // ---- input: touch and trackpad scroll natively; a mouse drags; a tap or click on a pet opens its card ----
  useEffect(() => {
    const el = root.current; if (!el) return;
    let down: { x: number; y: number; key: string | null; id: number; moved: boolean; mouse: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      // only the street itself: a press on anything laid over it (the HUD, a sheet, a drawer) is that thing's own; the
      // pointer capture below would otherwise steal the click from a sheet's buttons (the sign-in sheet, 2026-09-26)
      const t = e.target as HTMLElement;
      if (t.closest('.town-ui') || !t.closest('.town-scroll')) return;
      const body = (e.target as HTMLElement).closest('.catbody') as HTMLElement | null;
      const mouse = e.pointerType === 'mouse';
      if (mouse && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, key: body?.dataset.key ?? null, id: e.pointerId, moved: false, mouse };
      cam.stop();
      if (mouse) { cam.dragStart(e.clientX); el.setPointerCapture(e.pointerId); }
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
      if (down.moved && down.mouse) cam.dragMove(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null;
      if (d.mouse && d.moved) cam.dragEnd();
      else if (!d.moved && e.type === 'pointerup') pick(d.key);
    };
    // a sideways trackpad swipe is left to the browser (native, with its momentum); a mouse wheel's notches and a
    // vertical swipe glide sideways. The axis is decided by a gesture's first event and held until it pauses, so a
    // swipe never flips between the two halfway.
    let lock: { native: boolean; until: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      // over the street only: the square, a card, a list, a drawer scroll themselves (operator, 2026-09-27: "scrolling
      // inside of boxes like the chat box ... its just scrolling the emotown map")
      const t = e.target as HTMLElement;
      if (!t.closest('.town-scroll') || t.closest('.town-ui:not(.door-tag), [role="dialog"], .modal-back')) return;
      const now = performance.now();
      if (!lock || now > lock.until) lock = { native: e.deltaMode === 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY), until: 0 };
      lock.until = now + 160;
      if (lock.native) { cam.stop(); return; }
      e.preventDefault();
      const px = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? cam.vw : 1);
      // a mouse wheel turns in big whole notches with no sideways part; a trackpad sends small, often fractional deltas
      const notched = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      cam.wheel((px * (notched ? 1.6 : 1)) / cam.k, notched);
    };
    const onKey = (e: KeyboardEvent) => {
      // typing (the square's composer, a DM, a name) keeps its arrow keys for the caret
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cam.wheel((e.key === 'ArrowLeft' ? -1 : 1) * (e.repeat ? 0.22 : 0.45) * cam.viewW, true); }
      else if (e.key === 'Escape' && !document.querySelector('.modal-back, .so-drawer-back')) pick(null);
    };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false }); window.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onKey); };
  }, [cam, pick]);

  const top = vh - TOWN.h * k;
  // the hills' sign (EMOTOWN, at x 2000 in the hills) sits over the park whatever the screen's width
  // the hills' EMOTOWN sign stands over the park as the backdrop slides; held still (phones), it stands mid-screen
  const hillsLeft = PARA === 'fixed' ? (cam.viewW || 1600) / 2 - 2000 : 1083 + 0.29 * (cam.viewW || 1600) - 2000;
  const span = Math.max(0, TOWN.w * k - cam.vw);   // how far the street scrolls, in px   // the street's bottom sits on the screen's bottom; the sky takes whatever is above
  const sel = selected ? sim.residents.get(selected) ?? null : null;
  const selOwner = sel?.view?.owner.toLowerCase() ?? null;
  useEffect(() => {
    setOwnerName(null); if (!selOwner) return;
    let off = false;
    void api.get<{ items: { name: string | null }[] }>(`/cards?a=${selOwner}`).then((r) => { if (!off) setOwnerName(r.items[0]?.name ?? null); }).catch(() => {});
    return () => { off = true; };
  }, [selOwner]);
  // The title and the buttons share the top line while they fit; when they do not (a phone, signed in: six buttons), the
  // title keeps the top line and the buttons go on a second one under it (operator, 2026-09-27: "the buttons up top are
  // covering the emotown beta title"). Measured, not a breakpoint, because the row's width depends on who is signed in.
  const hudRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [hudStack, setHudStack] = useState(false);
  useLayoutEffect(() => {
    const a = hudRef.current; const b = rowRef.current; if (!a || !b) return;
    // only the sideways overlap counts: stacking moves the row down, never sideways, so this cannot flip back and forth
    const fit = () => { const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect(); setHudStack(rb.width > 0 && ra.width > 0 && ra.right + 10 > rb.left); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(a); ro.observe(b);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  return (
    <div ref={root} className={`town${SCROLL_TIMELINE ? ' has-timeline' : ''}${chatOpen ? ' chat-open' : ''}${sel || owner ? ' card-open' : ''}${hudStack ? ' hud-stack' : ''}`} data-tod={tod} data-season={season} style={{ ['--k' as string]: k, ['--span' as string]: `${span}px` }}>
      <Donors />
      <Sky />
      {PARA !== '3d' && <>
        <div className="town-layer" style={{ top }}>
          <div ref={far} className="town-cam para-far"><div className="town-world town-far" style={{ transform: `scale(${k})` }}><Skyline /></div></div>
        </div>
        <div className="town-layer" style={{ top }}>
          <div ref={mid} className="town-cam para-mid"><div className="town-world town-mid" style={{ transform: `scale(${k})` }}><Hills left={hillsLeft} /></div></div>
        </div>
      </>}
      <div ref={scroller} className={`town-scroll${PARA === '3d' ? ' para3d-on' : ''}`}>
      {PARA === '3d' && <>
        {/* each layer is exactly as wide as the street it can ever show (speed x the scroll + a screen), so its box never
            reaches past the street's end and cannot lengthen the scroll */}
        <div className="para3d" style={{ width: FAR * span + cam.vw + 2, transform: `translateZ(${-(1 / FAR - 1)}px) scale(${1 / FAR})` }}>
          <div className="town-layer" style={{ top }}><div className="town-cam"><div className="town-world town-far" style={{ transform: `scale(${k})` }}><Skyline /></div></div></div>
        </div>
        <div className="para3d" style={{ width: MID * span + cam.vw + 2, transform: `translateZ(${-(1 / MID - 1)}px) scale(${1 / MID})` }}>
          <div className="town-layer" style={{ top }}><div className="town-cam"><div className="town-world town-mid" style={{ transform: `scale(${k})` }}><Hills left={hillsLeft} /></div></div></div>
        </div>
      </>}
      <div className="town-sizer" style={{ width: TOWN.w * k }}>
      <div className="town-layer" style={{ top }}>
        <div ref={street} className="town-street">
          <div className="town-world" style={{ width: TOWN.w, height: TOWN.h, transform: `scale(${k})` }}>
            {/* the still street on a layer of its own: a pet animating in front of a building then repaints only itself,
                not the building's drawing behind it */}
            <div className="town-static">
              <Ground />
              <StreetBack emoBurned={emoBurned} flare={flare} />
              <div className="time-tint" />
              <Doors sim={sim} version={version} onPick={(key) => pick(key)} />
            </div>
            <div className="town-plane">
              <StreetProps crowns={crowns} deadCats={index?.deadCats ?? 0} neverDied={index?.neverDied ?? 0} season={season} />
              <Crowd crowd={crowd} sim={sim} selected={selected} me={me} />
            </div>
          </div>
        </div>
      </div>
      <BubbleLayer sim={sim} bubbles={bubbles} k={k} top={top} />
      </div>
      </div>
      <Weather season={season} />
      <div ref={hudRef} className="town-ui town-hud">
        <a className="town-brand" href="/">Emotown<span className="nav-beta town-beta">Beta</span></a>
        <span className="town-count"><i className="live" />{status === 'loading' ? 'Waking the town…' : status === 'error' ? 'The town is quiet (could not load)' : `${count} pets in town`}</span>
        <span className="town-count town-when" title="Emotown keeps your clock and your season">{SEASON_ICON[season]} {SEASON_NAME[season]} · {tod}</span>
        {index?.partial && <span className="town-note">partial list</span>}
      </div>
      <SocialPanels chat={chat} chatOpen={chatOpen} setChatOpen={setChatOpen} hud={hud} onPerson={(a) => setOwner(a.toLowerCase())} onFindPet={(key) => { if (sim.residents.has(key)) pick(key); }} />
      <div ref={rowRef} className="town-ui town-top-right">
        <SocialButtons chat={chat} chatOpen={chatOpen} setChatOpen={setChatOpen} hud={hud} />
        {me && <MyPets sim={sim} me={me} version={version} onPick={(key) => pick(key)} />}
        <Finder sim={sim} version={version} onPick={(r) => pick(r.key)} />
        <SoundControl side="right" />
        <a className="town-home" href="/">Emogotchi ↗</a>
      </div>
      <Ticker items={ticks} onPick={(t) => { if (t.key && sim.residents.has(t.key)) pick(t.key); }} />
      <Minimap sim={sim} cam={cam} me={me} onJump={(x) => cam.flyTo(x, 420)} />
      {sel && !owner && <PetCard key={sel.key} r={sel} version={version} following={following} onFollow={toggleFollow} onClose={() => pick(null)} onOwner={(a) => setOwner(a)} ownerName={ownerName} mine={!!me && sel.view?.owner.toLowerCase() === me} onCared={(e) => events.current([e], true)} onSent={(to) => { if (sel.view) sim.update(sel.key, { ...sel.view, owner: to as `0x${string}` }, []); sim.mine.delete(sel.key); }} />}
      {owner && <OwnerCard key={owner} address={owner} onClose={() => { setOwner(null); pick(null); }} onBack={sel ? () => setOwner(null) : undefined} onFindPet={(key) => { const keep = owner; pick(key); setOwner(keep); }} isInTown={(key) => sim.residents.has(key)} />}
      <SignInHost /><InboxHost /><ReportHost /><RoleSheetHost /><LinkGate />
    </div>
  );
}
