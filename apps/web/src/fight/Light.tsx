/**
 * The basement's light: the one bulb over the ring. Its cone and the pool it throws on the concrete (added light, laid
 * over the room and the crowd, under the fighters), dust hanging in the beam, and now and then the bulb stutters. The
 * lamp itself swings a little on its flex and the cone swings with it (both pivot on the flex's top). Film grain over
 * the whole picture. Everything is CSS or a small inline SVG: nothing here is ever re-rasterised while it moves.
 */
import { useMemo } from 'react';
import { Lamp } from './Basement';

/** where the bulb is and where the flex hangs from (world units): fightlamp.svg is drawn to these (its box is
 *  250..350 x -30..100, the shade's rim centred at (300, 80), 64 wide, the bulb under it to y 99.5) */
export const BULB = { x: 300, y: 92 };
export const RIM = { y: 82, half: 27 };
export const FLEX_TOP = { x: 300, y: -30 };

function rnd(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The beam and the pool, in the room's coordinates (the camera moves them with everything else). */
export function Beam() {
  const motes = useMemo(() => {
    const r = rnd(29);
    return Array.from({ length: 18 }, () => {
      const y = 120 + r() * 270; const spread = 16 + ((y - 92) / 338) * 200;
      return { x: 300 + (r() * 2 - 1) * spread * 0.8, y, s: 1.4 + r() * 1.8, d: 5 + r() * 7, delay: -r() * 12, dx: (r() * 2 - 1) * 14, dy: -8 - r() * 22 };
    });
  }, []);
  return (
    <div className="fc-light" aria-hidden>
      <div className="fc-swing">
        <svg className="fc-beam" viewBox="-60 -30 720 520" width="720" height="520">
          <defs>
            <linearGradient id="fcBeamX" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFD58A" stopOpacity="0" />
              <stop offset="0.3" stopColor="#FFD58A" stopOpacity="0.8" />
              <stop offset="0.5" stopColor="#FFE2A6" stopOpacity="1" />
              <stop offset="0.7" stopColor="#FFD58A" stopOpacity="0.8" />
              <stop offset="1" stopColor="#FFD58A" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fcBeamY" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0.22" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
            </linearGradient>
            <mask id="fcBeamMask" maskUnits="userSpaceOnUse" x="-60" y="-30" width="720" height="520">
              <rect x="-60" y={RIM.y} width="720" height="360" fill="url(#fcBeamY)" />
            </mask>
          </defs>
          <polygon points={`${BULB.x - RIM.half},${RIM.y} ${BULB.x + RIM.half},${RIM.y} ${BULB.x + 238},430 ${BULB.x - 238},430`} fill="url(#fcBeamX)" mask="url(#fcBeamMask)" opacity="0.42" />
        </svg>
        <div className="fc-bulbglow" />
      </div>
      <div className="fc-pool" />
      {motes.map((m, i) => (
        <span key={i} className="fc-mote" style={{ left: m.x, top: m.y, width: m.s, height: m.s, animationDuration: `${m.d}s`, animationDelay: `${m.delay}s`, ['--dx' as string]: `${m.dx}px`, ['--dy' as string]: `${m.dy}px` }} />
      ))}
    </div>
  );
}

/** The lamp itself, swinging in step with its light (the same animation, so the two never part). Not in the flicker. */
export function LampSwing() {
  return <div className="fc-swing fc-lampswing" aria-hidden><Lamp /></div>;
}

/** Grain over the whole picture, like the film. A tile of noise shifted a few times a second. */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.9 0"/></filter><rect width="160" height="160" filter="url(#n)"/></svg>')}")`;
export function Grain() {
  return <div className="fc-grain" style={{ backgroundImage: NOISE }} aria-hidden />;
}
