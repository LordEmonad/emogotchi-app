/**
 * The season in the air, over the whole screen: autumn leaves drifting down, winter snow, spring petals, summer
 * fireflies. A few dozen small elements, each one CSS transform animation (compositor only), no repaints.
 */
import { memo, useMemo } from 'react';
import type { Season } from './time';

let seed = 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const COUNT: Record<Season, number> = { autumn: 22, winter: 46, spring: 24, summer: 18 };
const LEAF = ['#E8742C', '#D24B2A', '#F2B14A', '#B8431F', '#E89A3A'];
const PETAL = ['#F7B6D2', '#F9CFE0', '#FFFFFF', '#EFA0C4'];

export const Weather = memo(function Weather({ season }: { season: Season }) {
  const bits = useMemo(() => Array.from({ length: COUNT[season] }, (_, i) => ({
    x: rnd() * 100, d: 7 + rnd() * 9, delay: -rnd() * 16, s: 0.6 + rnd() * 0.8, sway: 20 + rnd() * 60, i,
    c: season === 'autumn' ? LEAF[i % LEAF.length] : season === 'spring' ? PETAL[i % PETAL.length] : '',
    y: 45 + rnd() * 45,
  })), [season]);
  return (
    <div className={`weather weather-${season}`} aria-hidden>
      {bits.map((b) => season === 'summer'
        ? <span key={b.i} className="fly" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDuration: `${b.d * 0.9}s, ${1.6 + b.s * 2}s`, animationDelay: `${b.delay}s, ${b.delay * 0.3}s` }} />
        : <span key={b.i} className="flake" style={{ left: `${b.x}%`, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s`, ['--sway' as string]: `${b.sway}px`, ['--s' as string]: b.s, ['--c' as string]: b.c }}><i /></span>)}
    </div>
  );
});
