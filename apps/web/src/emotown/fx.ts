/**
 * The town's own little effects, in a pocket room's front layer (room units, like the director's props): sparkles,
 * hearts and confetti, and a name banner that rises over a pet that was just named. The director's actions bring
 * their own; these are for the moments that have no action in the room (a name, a crown, a new outfit, a revive).
 */
import { ASPECT, PROPS, type PropName } from '../scene/props';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function prop(layer: HTMLElement, name: PropName, w: number, x: number, bottom: number) {
  const h = w / ASPECT[name];
  const el = document.createElement('div');
  el.className = `prop prop-${name}`;
  el.style.cssText = `position:absolute;left:${x - w / 2}px;top:${bottom - h}px;width:${w}px;height:${h}px;pointer-events:none`;
  el.innerHTML = `<div class="prop-inner">${PROPS[name]}</div>`;
  layer.appendChild(el);
  return el;
}
const gone = (el: HTMLElement, a: Animation) => a.finished.then(() => el.remove(), () => el.remove());

export function sparkles(layer: HTMLElement, n: number, cx: number, cy: number, spread = 90) {
  for (let i = 0; i < n; i++) setTimeout(() => {
    if (!layer.isConnected) return;
    const el = prop(layer, 'sparkle', rand(18, 32), cx + rand(-spread, spread), cy + rand(-spread, spread * 0.6));
    gone(el, el.animate([{ transform: 'scale(0) rotate(0)', opacity: 0 }, { transform: 'scale(1.2) rotate(45deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(0) rotate(100deg)', opacity: 0 }], { duration: 760, easing: 'ease-in-out' }));
  }, i * 100);
}
export function hearts(layer: HTMLElement, n: number, cx: number, cy: number) {
  for (let i = 0; i < n; i++) setTimeout(() => {
    if (!layer.isConnected) return;
    const el = prop(layer, 'heart', rand(22, 30), cx + rand(-40, 40), cy - rand(10, 40)); const sway = rand(-22, 22);
    gone(el, el.animate([
      { transform: 'translate(0,0) scale(0.4)', opacity: 0, offset: 0 }, { transform: `translate(${sway * 0.3}px,-18px) scale(1.05)`, opacity: 1, offset: 0.22, easing: 'ease-in-out' },
      { transform: `translate(${sway}px,-58px) scale(1)`, opacity: 1, offset: 0.7, easing: 'ease-in-out' }, { transform: `translate(${sway * 0.6}px,-92px) scale(0.8)`, opacity: 0, offset: 1 },
    ], { duration: 1500, easing: 'ease-out' }));
  }, i * 220);
}
const CONFETTI = ['#E84D7F', '#EAC6EA', '#E8D89B', '#B894D8', '#6BB84A', '#F8F8FF'];
export function confetti(layer: HTMLElement, n: number, cx: number, cy: number) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    const w = rand(7, 12); const h = rand(4, 7);
    el.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;border-radius:2px;background:${CONFETTI[i % CONFETTI.length]};pointer-events:none;box-shadow:0 0 0 1.4px #000`;
    layer.appendChild(el);
    const vx = rand(-170, 170); const up = rand(120, 240); const spin = rand(-720, 720);
    gone(el, el.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: `translate(${vx * 0.6}px, ${-up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5,0,.8,.5)' },
      { transform: `translate(${vx}px, ${-up * 0.2 + 140}px) rotate(${spin}deg)`, opacity: 0, offset: 1 },
    ], { duration: rand(1300, 1900), delay: rand(0, 160), fill: 'backwards' }));
  }
}
/** A name on a ribbon, rising over the pet and hanging there a moment. */
export function banner(layer: HTMLElement, text: string, cx: number, cy: number) {
  const el = document.createElement('div');
  el.className = 'town-banner';
  el.textContent = text;
  el.style.left = `${cx}px`; el.style.top = `${cy}px`;
  layer.appendChild(el);
  gone(el, el.animate([
    { transform: 'translate(-50%, 20px) scale(0.5)', opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
    { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.12 },
    { transform: 'translate(-50%, -10px) scale(1)', opacity: 1, offset: 0.85, easing: 'ease-in' },
    { transform: 'translate(-50%, -30px) scale(0.9)', opacity: 0, offset: 1 },
  ], { duration: 4200 }));
}
/** A soft ring of light on the floor (a revive, an arrival). */
export function glow(layer: HTMLElement, cx: number, floor: number, color = 'rgba(234, 198, 234, 0.8)') {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${cx - 160}px;top:${floor - 60}px;width:320px;height:120px;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side, ${color}, transparent);mix-blend-mode:screen`;
  layer.appendChild(el);
  gone(el, el.animate([{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 1400, easing: 'ease-out' }));
}
