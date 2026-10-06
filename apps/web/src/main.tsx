import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PasskeyRoot } from './passkey/PasskeyRoot';
import { TopUpRoot } from './topup/TopUpRoot';
import { NotifRoot } from './push/NotifSheet';
import { startPush } from './push/client';
import { audible } from './sound/cue';
import { keepFresh } from './fresh';
import './index.css';

// Phones never zoom (operator, 2026-09-27: "no zooming on mobile"). The viewport tag says so (Android, and iOS's zoom
// into a focused field), html's touch-action allows panning only (index.css), and iOS Safari, which ignores
// user-scalable=no for pinches, is held at 1x by cancelling its own gesture events.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');
// Never inside another site's frame. This origin holds passkey keys, and a framed page's buttons can be click-jacked
// (an invisible frame over a decoy, "press here" landing on Confirm). GitHub Pages cannot send a frame-ancestors header
// and a meta tag cannot carry one, so the page refuses to start instead (security review, 2026-09-27).
let framed = true;
try { framed = window.top !== window.self; } catch { /* a cross-origin top that cannot even be compared: framed */ }
if (framed) {
  const p = document.createElement('p');
  p.style.cssText = 'font: 600 16px system-ui, sans-serif; color: #F8F8FF; text-align: center; padding: 40px 20px;';
  p.textContent = 'Emogotchi only runs in its own tab. ';
  const a = document.createElement('a');
  a.href = location.origin + location.pathname; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open it here';
  a.style.color = '#F2A7C4';
  p.appendChild(a);
  root.replaceChildren(p);
} else {
  // The fourth pet's page styles (the four-pet layouts), a small stylesheet of their own; his drawing, moves and ways come
  // in their own chunk when a page shows him (Pet.tsx's loader). Only in a build with his switch on (without it these are
  // dead code and never built). The mobile pass, 2026-09-29: his whole chunk, 150 KB gzipped, used to hold up every page's
  // first paint.
  if (__THICCUMS__) void import('./thiccums/site.css');
  // the fifth pet's (the five-pet layouts), the same way
  if (__R3TARDS__) void import('./r3tards/site.css');
  // the sixth pet's (the six-pet layouts), the same way
  if (__EMONAD__) void import('./emonadgotchi/site.css');
  // sound: the engine is a chunk of its own, and only a build with sound switched on has it at all (sound/cue.ts)
  // (not on the r1: its little processor has the room's animation to do, and its page was never checked with sound)
  if (__SOUND__ && audible() && !location.pathname.startsWith('/r1')) void import('./sound/boot').then((m) => m.boot());
  keepFresh();   // a copy of the site left open across a deploy loads itself again when it needs to (fresh.ts)
  createRoot(root).render(<StrictMode><App /><PasskeyRoot /><TopUpRoot /><NotifRoot /></StrictMode>);
  startPush();   // the service worker (push notifications for the home-screen app; push/client.ts)
}
