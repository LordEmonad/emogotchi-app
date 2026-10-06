/**
 * The town's drawings, placed. Buildings and strips stand with their ground line (local y = H - 16) on BASE; props
 * stand among the pets with their foot (local y = H - 8) on a depth line and are sorted with them by it. The
 * drawings are still images (packages/pet/design/town*.py); everything that glows, moves or says something is HTML
 * laid over them here: neon names, window light, lamp pools, the clock's hands, the boards' live numbers.
 */
import type { ReactNode } from 'react';
import { BASE, TOWN, depthZ } from './layout';
import { TOWN_LITE } from './TownPet';

const URLS = import.meta.glob('../../../../packages/pet/town/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const SIZE = (Object.values(import.meta.glob('../../../../packages/pet/town/manifest.json', { eager: true, import: 'default' }))[0] ?? {}) as Record<string, [number, number]>;
const PROP_URLS = import.meta.glob('../../../../packages/pet/props/{deadtree,cobweb,pumpkin}.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const PROP_SIZE: Record<string, [number, number]> = { deadtree: [212, 336 + 8] };
/**
 * Safari and every phone draw the town from pictures (tools/town-raster.mjs: each drawing at 2x, the backdrop strips at
 * 1.5x), because WebKit re-renders a vector image from its paths every time a swipe uncovers it and a phone could not
 * keep up with a fling: whole frames of the street went missing, buildings popped in, the hills showed black holes
 * (operator, 2026-09-27; measured in WebKit at iPhone size). The pictures are also less than half the download (1.5 MB
 * against 3.5). A desktop Chrome keeps the vectors. `?raster=1` / `?raster=0` forces it.
 */
const RASTER = import.meta.glob('../../../../packages/pet/town-2x/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const RASTER_ASKED = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('raster') : null;
export const TOWN_RASTER = RASTER_ASKED === '1' || (RASTER_ASKED !== '0' && (TOWN_LITE || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)));
export const art = (name: string): string | null => (TOWN_RASTER ? RASTER[`../../../../packages/pet/town-2x/${name}.webp`] : null) ?? URLS[`../../../../packages/pet/town/${name}.svg`] ?? PROP_URLS[`../../../../packages/pet/props/${name}.svg`] ?? null;
export const sizeOf = (name: string): [number, number] | null => SIZE[name] ?? PROP_SIZE[name] ?? null;

/** A building or a strip, by its left edge. */
export function Building({ name, x, className = '', children }: { name: string; x: number; className?: string; children?: ReactNode }) {
  const src = art(name); const s = sizeOf(name);
  if (!src || !s) return null;
  const [w, h] = s; const top = BASE - (h - 16);
  return (
    <div className={`tb tb-${name} ${className}`} style={{ left: x, top, width: w, height: h }}>
      <img src={src} alt="" draggable={false} width={w} height={h} loading="lazy" decoding="async" />
      {children}
    </div>
  );
}

/** A prop standing on the pavement at (x, feet), sorted among the pets by its feet. */
export function Prop({ name, x, feet, flip = false, className = '', children }: { name: string; x: number; feet: number; flip?: boolean; className?: string; children?: ReactNode }) {
  const src = art(name); const s = sizeOf(name);
  if (!src || !s) return null;
  const [w, h] = s;
  return (
    <div className={`tp tp-${name} ${className}`} style={{ left: x - w / 2, top: feet - (h - 8), width: w, height: h, zIndex: depthZ(feet) }}>
      <img src={src} alt="" draggable={false} width={w} height={h} loading="lazy" decoding="async" style={flip ? { transform: 'scaleX(-1)' } : undefined} />
      {children}
    </div>
  );
}

/** Text on a building, in its own units: a neon tube, painted letters, a brass plaque. */
export function Sign({ x, y, w, h, text, style = 'neon-pink', size, flicker = false }: { x: number; y: number; w: number; h: number; text: ReactNode; style?: string; size?: number; flicker?: boolean }) {
  return <div className={`sign ${style}${flicker ? ' flicker' : ''}`} style={{ left: x, top: y, width: w, height: h, fontSize: size ?? h * 0.62 }}><span>{text}</span></div>;
}
/** Warm light in a window (screen-blended over the glass), or any glow. */
export function Glow({ x, y, w, h, color = 'warm', className = '' }: { x: number; y: number; w: number; h: number; color?: string; className?: string }) {
  return <div className={`glow glow-${color} ${className}`} style={{ left: x, top: y, width: w, height: h }} />;
}

/** The pavement and the kerb, the length of the street. */
export function Ground() {
  const pv = art('pavement'); const kb = art('kerb');
  return (
    <>
      {/* a little past both ends: a drag can stretch the street there before it springs back */}
      <div className="town-pavement" style={{ left: -480, top: BASE, width: TOWN.w + 960, height: 246, backgroundImage: pv ? `url("${pv}")` : undefined }} />
      <div className="town-kerb" style={{ left: -480, top: BASE + 246, width: TOWN.w + 960, height: 60, backgroundImage: kb ? `url("${kb}")` : undefined }} />
    </>
  );
}
