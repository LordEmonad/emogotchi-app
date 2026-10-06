/**
 * Fight Club in Emotown: the arena at the far end of the street (town_arena.py's drawing, its signs and lights laid over
 * it here) and the outdoor ring in front of it, where fights play out for everyone on the street to watch. The ring
 * stands among the pets (sorted by its feet like any prop); a fight mounts the ring's two fighters (Arena, bare, at the
 * street's scale for that depth) and plays the chain's result from its random number, then the ring empties again.
 *
 * `startTownFight` is how a fight comes to town: the chain feed (a Fought log) or, in dev, `window.__fightTown(...)`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Character } from '../../pet/Pet';
import { Building, Glow, Sign } from '../../emotown/Scenery';
import { LANE_BACK } from '../../emotown/layout';
import type { TownSim } from '../../emotown/sim';
import { Arena } from '../Arena';
import { planFight, type FightChar, type FightDirector } from '../fightDirector';
import { chainClient } from '../../game/chain';
import { fallbackName, PETS } from '../../pets';
import { FIGHT_ADDRESS, fightCharOf, mon } from '../chain';
import { parseAbiItem } from 'viem';
import type { Collection } from '@emo-pets/chain';
import './fighttown.css';

/** Where the bar stands (its left edge). */
export const ARENA_X = 6030;

export type TownFight = { id: string; left: FightChar; right: FightChar; leftName: string; rightName: string; stake: string; seed: string; winner: 0 | 1 };
let current: TownFight | null = null;
const queue: TownFight[] = [];
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };
/** Queue a fight for the ring (one at a time; the next starts when the ring is empty). */
export function startTownFight(f: TownFight) { if (current) queue.push(f); else { current = f; emit(); } }
function done() { current = queue.shift() ?? null; emit(); }
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __fightTown?: unknown }).__fightTown = (o: Partial<TownFight> = {}) => startTownFight({
    id: String(Date.now()), left: 'cat', right: 'sahur', leftName: 'Kitler', rightName: 'Tungy', stake: '100 MON',
    seed: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''), winner: Math.random() < 0.5 ? 0 : 1, ...o,
  });
}

/**
 * Every fight decided on chain comes to town: the Fought log (read every few seconds, a hundred blocks at most, the
 * public RPC's limit) says which pet won and the random number says which side was the challenger (even: the
 * challenger won), so the ring puts each in its corner and plays the chain's result. Started once, by the ring.
 */
const FOUGHT = parseAbiItem('event Fought(uint256 indexed id, address indexed winner, address indexed loser, address winnerCollection, uint256 winnerPet, address loserCollection, uint256 loserPet, uint256 stake, uint256 payout, uint256 teamCut, uint64 sequence, bytes32 random)');
/** A fight decided on chain, as the town's ticker tells it (Emotown.tsx), with everything else that just happened. */
export type FightResult = { id: number; winner: { col: Collection; id: number; name: string }; loser: { col: Collection; id: number; name: string }; stake: string; payout: string };
const results = new Set<(r: FightResult) => void>();
export function onFightResult(f: (r: FightResult) => void) { results.add(f); return () => { results.delete(f); }; }
let feeding = false;
function feedFromChain() {
  if (feeding || !FIGHT_ADDRESS || !chainClient) return;
  feeding = true;
  const pub = chainClient.pub;
  const cols = new Map<string, Collection>();
  const cfg = (chainClient as unknown as { cfg: { contract?: string; inverse?: string; sahur?: string } }).cfg;
  if (cfg.contract) cols.set(cfg.contract.toLowerCase(), 'cat');
  if (cfg.inverse) cols.set(cfg.inverse.toLowerCase(), 'frok');
  if (cfg.sahur) cols.set(cfg.sahur.toLowerCase(), 'sahur');
  let from: bigint | null = null;
  const tick = async () => {
    try {
      const head = await pub.getBlockNumber();
      if (from === null) from = head;
      if (head >= from) {
        const lo = head - from > 99n ? head - 99n : from;
        const logs = await pub.getLogs({ address: FIGHT_ADDRESS!, event: FOUGHT, fromBlock: lo, toBlock: head });
        from = head + 1n;
        for (const l of logs) {
          const a = l.args as { id: bigint; winnerCollection: string; winnerPet: bigint; loserCollection: string; loserPet: bigint; stake: bigint; payout: bigint; random: `0x${string}` };
          const wCol = cols.get(a.winnerCollection.toLowerCase()) ?? 'cat'; const lCol = cols.get(a.loserCollection.toLowerCase()) ?? 'cat';
          const [wv, lv] = await Promise.all([chainClient!.cat(Number(a.winnerPet), wCol).catch(() => null), chainClient!.cat(Number(a.loserPet), lCol).catch(() => null)]);
          const wName = wv?.name || fallbackName(wCol, Number(a.winnerPet)); const lName = lv?.name || fallbackName(lCol, Number(a.loserPet));
          const challengerWon = BigInt(a.random) % 2n === 0n;
          const [left, right] = challengerWon ? [[wCol, wName], [lCol, lName]] as const : [[lCol, lName], [wCol, wName]] as const;
          for (const f of results) f({ id: Number(a.id), winner: { col: wCol, id: Number(a.winnerPet), name: wName }, loser: { col: lCol, id: Number(a.loserPet), name: lName }, stake: mon(a.stake), payout: mon(a.payout) });
          startTownFight({ id: `chain-${a.id}`, left: fightCharOf(left[0]), right: fightCharOf(right[0]), leftName: left[1], rightName: right[1], stake: `${mon(a.stake)} MON`, seed: a.random.slice(2), winner: challengerWon ? 0 : 1 });
        }
      }
    } catch { /* the RPC pushed back: the next tick tries again */ }
    setTimeout(() => void tick(), 3000);
  };
  void tick();
}

/**
 * The bar the basement is under (town_arena.py, "the dive bar"), with its lights laid over it in the drawing's own units
 * (the art reports them: `python3 packages/pet/design/town_arena.py --anchors`). Nothing on the front says Fight Club;
 * the bar's name is on the roof board, the neon is lit in its windows, and the only sign of what goes on below is the
 * caged bulb over the stairs down, brighter while a fight is on, with light round the basement door's edge.
 */
export function ArenaBuilding() {
  const fighting = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  return (
    <Building name="arena" x={ARENA_X} className={`fc-bar${fighting ? ' fc-live' : ''}`}>
      <Sign x={144} y={14} w={258} h={48} text="EMO'S TAVERN" style="neon-red" size={27} flicker />
      <Glow x={158} y={312} w={136} h={92} />
      <Glow x={424} y={312} w={48} h={92} />
      <Glow x={391} y={156} w={66} h={96} className="fc-dim" />
      <span className="fc-neon fc-neon-beer" style={{ left: 165, top: 318, width: 58, height: 71 }} />
      <Sign x={226} y={340} w={52} h={26} text="OPEN" style="neon-red" size={14} flicker />
      <span className="fc-neon fc-neon-cocktail" style={{ left: 423, top: 316, width: 49, height: 70 }} />
      <div className="fc-chalk" style={{ left: 372, top: 322, width: 46, height: 60 }}>
        {fighting ? <><b>FIGHT</b><b>NOW</b><i>↘</i></> : <><s>NO</s><b>PETS</b><small>allowed</small></>}
      </div>
      <span className="fc-bulbpool" style={{ left: 506, top: 300, width: 116, height: 164 }} />
      <span className="fc-bulb" style={{ left: 528, top: 292, width: 60, height: 60 }} />
      <span className="fc-doorcrack" style={{ left: 527, top: 375, width: 23, height: 99 }} />
      {/* the whole front is the way in (operator, 2026-09-30: "click the tavern and go to the fight club"); .town-ui so the
          street's drag leaves the press to the link */}
      <a className="town-ui fc-enter" href="/fightclub" title="Fight Club: pets fight for MON in the basement"><span>Fight Club <i>BETA</i></span></a>
    </Building>
  );
}

/**
 * Where the basement's stairs come up to the street (the bar's drawing, town_arena.py, reports it), and the middle of the
 * bar, which the live window hangs over.
 */
export const STAIRS_X = ARENA_X + 587;
const WINDOW = { x: ARENA_X + 310, bottom: 500, w: 390 };

/** The street's sim, so a fight can call pets over to watch (Emotown registers it while it runs). */
let townSim: TownSim | null = null;
export function registerTownSim(s: TownSim | null) { townSim = s; }

/**
 * The fights happen in the basement under the bar: while one is on, a window over the bar shows it live (the fight
 * room itself, the lamp, the crowd, at the street's size: a few onlookers rather than the whole room, since the street is
 * full of pets already), the bill under it, and the pets nearest the bar walk over to the cellar steps to watch.
 */
export function BasementWindow() {
  useEffect(feedFromChain, []);
  const fight = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  const [result, setResult] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!fight) { started.current = null; setResult(null); return; }
    townSim?.gather({ x: STAIRS_X, y: LANE_BACK + 16 }, 10, Date.now() + 45_000);
  }, [fight]);
  const onDirector = (d: FightDirector | null) => {
    if (!d || !fight || started.current === fight.id) return;
    started.current = fight.id;
    d.muted = true;   // seen through the Tavern's window from the street: not heard
    const f = fight;
    void d.play(planFight(f.seed, f.winner)).then(() => {
      setResult(`${f.winner === 0 ? f.leftName : f.rightName} wins ${f.stake}`);
      setTimeout(() => { setResult(null); done(); }, 4500);
    });
  };
  if (!fight) return null;
  const H = (WINDOW.w * 460) / 600;
  return (
    <div className="fc-town-window" style={{ left: WINDOW.x - WINDOW.w / 2, top: WINDOW.bottom - H, width: WINDOW.w, ['--tail' as string]: `${STAIRS_X - (WINDOW.x - WINDOW.w / 2)}px` }}>
      <div className="fc-town-live"><i />LIVE<span>from the basement</span></div>
      <div className="fc-town-screen"><Arena key={fight.id} left={fight.left} right={fight.right} crowd="small" onDirector={onDirector} /></div>
      <div className="fc-town-bill">
        <b>{fight.leftName}</b><i>vs</i><b>{fight.rightName}</b><em>{result ?? fight.stake}</em>
      </div>
    </div>
  );
}
