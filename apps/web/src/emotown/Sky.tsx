/**
 * The sky over Emotown, following the visitor's clock (time.ts): a gradient for each of dawn, day, dusk and night
 * (crossfaded), the stars and the moon by night, the sun by day (low and warm at dawn and dusk), now and then a
 * shooting star. It does not move with the camera; everything here is CSS, compositor-only.
 */
import { memo, useMemo } from 'react';

let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function starField(): string {
  const W = 1600, H = 900; let c = '';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W; const y = Math.pow(rnd(), 1.5) * H * 0.8; const r = rnd() < 0.08 ? 1.5 : rnd() < 0.4 ? 1 : 0.6;
    const o = (0.25 + rnd() * 0.65) * (1 - y / H * 0.7);
    c += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${rnd() < 0.2 ? '#FFE9B8' : '#EAC6EA'}" opacity="${o.toFixed(2)}"/>`;
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${c}</svg>`)}")`;
}

export const Sky = memo(function Sky() {
  const field = useMemo(starField, []);
  const twinkles = useMemo(() => Array.from({ length: 16 }, () => ({ x: rnd() * 100, y: Math.pow(rnd(), 1.4) * 55, s: 2 + rnd() * 2.5, d: rnd() * 5, t: 2.4 + rnd() * 3 })), []);
  return (
    <div className="town-sky" aria-hidden>
      <div className="sky-grad sky-night" /><div className="sky-grad sky-dusk" /><div className="sky-grad sky-dawn" /><div className="sky-grad sky-day" />
      <div className="sky-stars" style={{ backgroundImage: field }} />
      {twinkles.map((t, i) => <span key={i} className="sky-twinkle" style={{ left: `${t.x}%`, top: `${t.y}%`, width: t.s, height: t.s, animationDelay: `${-t.d}s`, animationDuration: `${t.t}s` }} />)}
      <div className="sky-sun" />
      <div className="sky-moon"><div className="sky-moon-disc" /></div>
      <span className="sky-shoot" />
      <span className="sky-shoot sky-shoot-2" />
      <div className="sky-horizon" />
    </div>
  );
});
