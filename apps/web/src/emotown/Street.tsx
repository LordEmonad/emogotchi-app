/**
 * Emotown's street, left to right: what stands where, and what is written and lit on it. Positions are town units
 * (layout.ts). A drawing that is not there yet is skipped and a plain block stands in, so the street always works.
 */
import { memo, useState } from 'react';
import { BASE, LANDMARKS } from './layout';
import { Building, Glow, Prop, Sign, art } from './Scenery';
import { PROPS } from '../scene/props';
import { ArenaBuilding, BasementWindow } from '../fight/town/FightTown';

/** A stand-in for a building whose drawing has not landed. */
function Block({ id }: { id: string }) {
  const l = LANDMARKS.find((x) => x.id === id)!;
  return <div className="bld" style={{ left: l.x0 + 20, width: l.x1 - l.x0 - 40, top: BASE - 360, height: 360 }}><span>{l.name}</span></div>;
}
const has = (name: string) => !!art(name);

/** Everything behind the pets: the facades and what hangs on them. */
export const StreetBack = memo(function StreetBack({ emoBurned, flare }: { emoBurned: number; flare: { id: number; emo: number } | null }) {
  return (
    <>
      {has('gate') ? (
        <Building name="gate" x={20}>
          <Glow x={70} y={398} w={68} h={68} className="round flick" />
          <Glow x={-10} y={355} w={50} h={50} className="round flick" />
          <Glow x={173} y={355} w={50} h={50} className="round flick" />
          <Glow x={233} y={374} w={48} h={62} />
          <Sign x={30} y={266} w={148} h={32} text="EMOTOWN" style="plaque" size={19} />
        </Building>
      ) : <Block id="gate" />}
      {has('diner') ? (
        <Building name="diner" x={360}>
          {[40, 110, 180, 250, 320].map((x) => <Glow key={x} x={x - 6} y={214} w={74} h={86} />)}
          <Glow x={425} y={230} w={56} h={56} className="round" />
          <Sign x={20} y={170} w={500} h={48} text="EMO DINER" style="neon-pink" size={34} />
          <Sign x={44} y={24} w={134} h={50} text="EAT" style="neon-gold" size={38} flicker />
        </Building>
      ) : <Block id="diner" />}
      {has('baths') ? (
        <Building name="baths" x={940}>
          <Glow x={40} y={240} w={112} h={112} color="cool" className="round" />
          <Glow x={318} y={240} w={88} h={116} />
          <Glow x={184} y={318} w={108} h={140} />
          <Glow x={146} y={274} w={40} h={40} color="red" className="round sway" />
          <Glow x={290} y={274} w={40} h={40} color="red" className="round sway" />
          <div className="bubbles" style={{ left: 50, top: 250, width: 92, height: 92 }}>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ left: `${18 + i * 15}%`, animationDelay: `${-i * 0.7}s` }} />)}</div>
          <div className="steam" style={{ left: 360, top: 22 }}><i /><i /><i /></div>
          <Sign x={187} y={275} w={102} h={18} text="BATHS" style="painted" size={15} />
        </Building>
      ) : <Block id="baths" />}
      {has('hall') ? (
        <Building name="hall" x={1560}>
          {[[34, 362, 50, 150], [576, 362, 50, 150], [169, 374, 44, 136], [447, 374, 44, 136]].map(([x, y, w, h]) => <Glow key={x} x={x! - 8} y={y! - 6} w={w! + 16} h={h! + 12} />)}
          <Glow x={270} y={340} w={120} h={220} />
          <Glow x={284} y={124} w={92} h={92} className="round" />
          <Clock cx={330} cy={170} r={40} />
          <Sign x={216} y={303} w={228} h={20} text="EMOTOWN HALL" style="neon-gold" size={14} />
          <span className="glint" style={{ left: 330, top: 26 }} />
        </Building>
      ) : <Block id="hall" />}
      {has('hedge') && <Building name="hedge" x={2260} />}
      {has('shop') ? (
        <Building name="shop" x={2920}>
          <Glow x={30} y={258} w={314} h={182} />
          <Glow x={58} y={104} w={88} h={82} />
          <Glow x={206} y={104} w={88} h={82} />
          <Glow x={350} y={230} w={96} h={58} />
          <span className="candle" style={{ left: 190, top: 376 }} />
          <Sign x={348} y={140} w={112} h={32} text="ITEM SHOP" style="neon-gold" size={15} />
        </Building>
      ) : <Block id="shop" />}
      {has('inn') ? (
        <Building name="inn" x={3430}>
          {[[44, 200, 52, 60], [124, 200, 52, 60], [424, 200, 52, 60], [62, 384, 56, 82], [140, 384, 56, 82], [324, 384, 56, 82], [402, 384, 56, 82], [241, 104, 38, 50], [101, 128, 30, 30]].map(([x, y, w, h]) => <Glow key={`${x},${y}`} x={x! - 8} y={y! - 8} w={w! + 16} h={h! + 16} />)}
          {[[77, 346], [170, 346], [443, 346]].map(([x, y]) => <Glow key={x} x={x! - 26} y={y! - 26} w={52} h={52} className="round flick" />)}
          <div className="steam soft" style={{ left: 465, top: 61 }}><i /><i /><i /></div>
          <Sign x={216} y={223} w={116} h={28} text="SLEEPY INN" style="neon-lav" size={16} />
          <Sign x={326} y={339} w={48} h={16} text="VACANCY" style="neon-pink" size={7.6} flicker />
        </Building>
      ) : <Block id="inn" />}
      {has('furnace') ? (
        <Building name="furnace" x={3970} className={flare ? 'furnace-flare' : ''}>
          <div className="fire" style={{ left: 146, top: 420, width: 200, height: 196 }} />
          <div className="fire-pool" style={{ left: 246, top: 616 }} />
          <div className="embers" style={{ left: 246, top: 590 }}>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ left: (i % 3 - 1) * 46 + (i * 7) % 13, animationDelay: `${-i * 0.47}s`, animationDuration: `${2.6 + (i % 4) * 0.5}s` }} />)}</div>
          <Glow x={220} y={179} w={52} h={52} color="fire" className="round flick" />
          <Glow x={16} y={494} w={56} h={64} color="fire" className="flick" />
          <Glow x={414} y={542} w={60} h={58} color="fire" className="pulse" />
          <div className="smoke" style={{ left: 444, top: 20 }}><i /><i /><i /><i /></div>
          <div className="steam" style={{ left: 356, top: 104 }}><i /><i /></div>
          <div className="burn-plate" style={{ left: 116, top: 280, width: 268, height: 76 }}>
            <span className="lbl">EMO BURNED</span>
            <span className="num">{Math.round(emoBurned).toLocaleString()}</span>
          </div>
          {flare && <div key={flare.id} className="burn-float" style={{ left: 246, top: 400 }}>+{Math.round(flare.emo).toLocaleString()} EMO</div>}
        </Building>
      ) : <Block id="furnace" />}
      {has('haunted') ? (
        <Building name="haunted" x={4480}>
          {[[91, 128, 36, 36], [82.6, 236, 59.4, 80], [57.3, 382, 59.9, 104], [375.2, 262, 48, 60], [224.9, 360, 70.6, 35]].map(([x, y, w, h]) => <Glow key={x} x={x! - 10} y={y! - 10} w={w! + 20} h={h! + 20} color="green" className="flick" />)}
          <Glow x={327} y={373} w={40} h={40} color="green" className="round flick" />
          <Glow x={200} y={520} w={130} h={60} color="green" className="round" />
          {[[396.9, 214], [406.9, 214]].map(([x, y]) => <span key={x} className="scn-eye" style={{ left: x, top: y }} />)}
          {[[71.9, 419], [86.8, 413], [101.9, 419]].map(([x, y], i) => <span key={x} className="candle" style={{ left: x, top: y, animationDelay: `${-i * 0.3}s` }} />)}
          <div className="pk" style={{ left: 186 - 31, top: 564 - 52, width: 62, height: 55 }} dangerouslySetInnerHTML={{ __html: PROPS.pumpkin }} />
          <div className="pk" style={{ left: 354 - 25, top: 564 - 44, width: 50, height: 45 }} dangerouslySetInnerHTML={{ __html: PROPS.pumpkin }} />
          <div className="web" style={{ left: 150, top: 358, width: 65, height: 65 }} dangerouslySetInnerHTML={{ __html: PROPS.cobweb }} />
        </Building>
      ) : <Block id="haunted" />}
      {has('backrooms') ? (
        <Building name="backrooms" x={5000}>
          <div className="br-spill" style={{ left: 150, top: 324 }} />
          <Glow x={96} y={112} w={108} h={214} color="yellow" />
          <div className="fluoro" style={{ left: 104, top: 66, width: 92, height: 6 }} />
          <Sign x={122} y={84} w={56} h={24} text="EXIT" style="neon-red" size={15} flicker />
        </Building>
      ) : <Block id="backrooms" />}
      {has('graveyard-back') && (
        <Building name="graveyard-back" x={5310}>
          <Glow x={322} y={40} w={36} h={36} color="green" className="round flick" />
        </Building>
      )}
      {has('arena') && <ArenaBuilding />}
      {/* light spilling out of the lit fronts onto the pavement */}
      <div className="pool" style={{ left: 380, width: 460, top: BASE - 6 }} />
    </>
  );
});

/** Everything that stands among the pets and is sorted with them by depth. */
export const StreetProps = memo(function StreetProps({ crowns, deadCats, neverDied, season }: { crowns: { name: string; score: number; mark: string }[]; deadCats: number; neverDied: number; season: string }) {
  return (
    <>
      <BasementWindow />
      {[350, 925, 1535, 2245, 2905, 3425, 3960, 4475, 4995, 5305, 6010, 6680].map((x) => (
        <Prop key={x} name="lamp" x={x} feet={722} className="lamp">
          <span className="lamp-pool" style={{ left: 35, top: 332 }} />
          <span className="lamp-glow" style={{ left: 35, top: 73 }} />
        </Prop>
      ))}
      <Prop name="fountain" x={1470} feet={790}>
        <div className="spray" style={{ left: 0, top: 0, width: 230, height: 220 }}>{[[115, 70], [83, 73], [147, 73], [55, 110], [175, 110]].map(([x, y], i) => <i key={i} style={{ left: x, top: y, animationDelay: `${-i * 0.37}s` }} />)}</div>
      </Prop>
      <Prop name="crownboard" x={2185} feet={778}><CrownBoard rows={crowns} /></Prop>
      <Prop name={`tree-a-${season}`} x={2330} feet={764}>
        {[[17, 160], [51, 202], [94, 226], [170, 229], [219, 201], [256, 164]].map(([x, y], i) => <span key={x} className="fairy" style={{ left: x, top: y, animationDelay: `${-i * 0.55}s` }} />)}
        <Glow x={122} y={272} w={20} h={20} className="round" />
      </Prop>
      <Prop name={`tree-b-${season}`} x={2840} feet={770}>
        {[[18, 212], [53, 222], [92, 147], [127, 174], [173, 180], [212, 140]].map(([x, y], i) => <span key={x} className="fairy" style={{ left: x, top: y, animationDelay: `${-i * 0.7}s` }} />)}
        {[[79.5, 222], [88.5, 222]].map(([x, y]) => <span key={x} className="scn-eye owl" style={{ left: x, top: y }} />)}
      </Prop>
      <Prop name="yarnball" x={2590} feet={782}>
        <Glow x={26} y={8} w={100} h={100} color="pink" className="round" />
        <Sign x={50} y={114} w={54} h={20} text="THE BIG YARN" style="plaque" size={6.6} />
      </Prop>
      <Prop name="slide" x={2440} feet={806} />
      <Prop name="swings" x={2720} feet={800} />
      <Prop name="flowerbed" x={2520} feet={930} />
      <Prop name="bench" x={3560} feet={780} />
      <Prop name="bench" x={3820} feet={784} />
      <Prop name="obelisk" x={5650} feet={786}>
        <div className="plaque-text" style={{ left: 33, top: 213, width: 84, height: 68 }}>
          <b>THE GREAT STARVATION</b><span>Sep 24, 2026</span><em>{deadCats ? `${deadCats.toLocaleString()} cats lost` : ''}</em><em>{neverDied ? `${neverDied.toLocaleString()} never died` : ''}</em>
        </div>
        {[[17, 292], [30, 299], [100, 302]].map(([x, y], i) => <span key={x} className="candle" style={{ left: x, top: y, animationDelay: `${-i * 0.4}s` }} />)}
        <Glow x={60} y={68} w={28} h={28} color="pink" className="round" />
      </Prop>
      <Prop name="deadtree" x={5372} feet={730} className="deadtree" />
      <Prop name="tomb-a" x={5410} feet={800} />
      <Prop name="tomb-b" x={5520} feet={870} />
      <Prop name="tomb-c" x={5790} feet={818} />
      <Prop name="tomb-a" x={5900} feet={892} flip />
      <Prop name="mailbox" x={895} feet={736} />
      <Prop name="hydrant" x={1520} feet={742} />
      <Prop name="planter" x={3395} feet={734} />
      <Prop name="bin" x={4455} feet={738} />
    </>
  );
});

/** The town hall's clock keeps the visitor's own time: both hands are one CSS rotation each, started where the time is now. */
function Clock({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const [t] = useState(() => new Date());
  const s = t.getHours() % 12 * 3600 + t.getMinutes() * 60 + t.getSeconds();
  return (
    <div className="clock" style={{ left: cx, top: cy }}>
      <i className="h" style={{ height: r * 0.56, animationDelay: `${-s}s` }} />
      <i className="m" style={{ height: r * 0.8, animationDelay: `${-(s % 3600)}s` }} />
      <b />
    </div>
  );
}

/** The crown board: the best-cared pets wearing a crown right now, by care score. */
export function CrownBoard({ rows }: { rows: { name: string; score: number; mark: string }[] }) {
  return (
    <>
      <Sign x={90} y={66} w={60} h={16} text="CROWNS" style="neon-gold" size={11} />
      <ol className="crown-list" style={{ left: 40, top: 106, width: 160, height: 92 }}>
        {rows.slice(0, 5).map((r, i) => <li key={i}><span className="n">{i + 1}</span><span className="t">{r.mark}{r.name}</span><span className="s">{r.score.toFixed(1)}</span></li>)}
        {rows.length === 0 && <li className="wait">Counting crowns…</li>}
      </ol>
    </>
  );
}

/** where the backdrops' bottoms sit: low enough that the sky keeps its stars and moon, the hills hiding the city's foot */
const HILL_FOOT = 648; const SKY_FOOT = 610;
const BG = (name: string) => { const u = art(name); return u ? `url("${u}")` : undefined; };
/** The far city (parallax 0.16): tiles, so it is a repeating background; its bottom 40 above the hills'. */
export const Skyline = memo(function Skyline() {
  const u = BG('skyline'); if (!u) return null;
  return (
    <div className="strip" style={{ left: 0, top: SKY_FOOT - 340, width: 3200 * 3, height: 340, backgroundImage: u }}>
      {[0, 1, 2].map((i) => <span key={i} className="beacon" style={{ left: 1520 + i * 3200, top: 6.5 }} />)}
    </div>
  );
});
/** The hills (parallax 0.42) with the EMOTOWN sign, placed so the sign stands over the park; solid ground below them. */
export const Hills = memo(function Hills({ left }: { left: number }) {
  const u = BG('hills'); if (!u) return null;
  const floods = [1680, 1712, 1770.5, 1815.5, 1878, 1918, 1977, 2015, 2074, 2114, 2180, 2232, 2297.5, 2336.5];
  return (
    <>
      <div className="strip" style={{ left: left - 4200, top: HILL_FOOT - 440, width: 4200 * 3, height: 440, backgroundImage: u }}>
        <span className="beacon red" style={{ left: 4200 + 3540, top: 13 }} />
        {floods.map((x) => <span key={x} className="flood" style={{ left: 4200 + x, top: 262 - (x - 1680) * 0.052 }} />)}
      </div>
      {/* 4 units up into the hills: their drawing leaves its bottom 2 empty (town_street.py: WebKit bled that row into the top) */}
      <div className="hills-foot" style={{ left: left - 4200, top: HILL_FOOT - 4, width: 4200 * 3, height: 242 }} />
    </>
  );
});
