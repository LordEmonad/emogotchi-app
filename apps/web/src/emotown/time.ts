/**
 * Emotown keeps the visitor's own time: dawn, day, dusk and night from their clock, the season from their date
 * (northern hemisphere, by the equinoxes and solstices). `?time=` and `?season=` override both, for a look.
 */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

const params = new URLSearchParams(location.search);
const TIMES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function timeOfDay(d = new Date()): TimeOfDay {
  const q = params.get('time'); if (q && (TIMES as string[]).includes(q)) return q as TimeOfDay;
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17.5) return 'day';
  if (h >= 17.5 && h < 20.5) return 'dusk';
  return 'night';
}
export function season(d = new Date()): Season {
  const q = params.get('season'); if (q && (SEASONS as string[]).includes(q)) return q as Season;
  const m = d.getMonth(); const day = d.getDate();   // 0 = January
  const md = m * 100 + day;
  if (md >= 220 && md < 521) return 'spring';        // Mar 20 .. Jun 20
  if (md >= 521 && md < 822) return 'summer';        // Jun 21 .. Sep 21
  if (md >= 822 && md < 1121) return 'autumn';       // Sep 22 .. Dec 20
  return 'winter';
}
export const SEASON_ICON: Record<Season, string> = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };
export const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
