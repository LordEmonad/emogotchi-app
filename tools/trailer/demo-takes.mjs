// The hackathon demo's desktop takes (tools/trailer/demo-timeline.mjs cuts them): the live site's pages at 1280x720 css
// px, dpr 1.5 (1920x1080), filmed from the mainnet build (trailer/demo/dist, made with build-config.mjs so the pages'
// sounds are written down) served on localhost by tools/serve-dist.mjs, with /api passed to the live API. Nothing here
// signs anything: these are the site as any visitor sees it, real chain state read as it is filmed.
//   DIST=trailer/demo/dist PORT=5397 node tools/serve-dist.mjs
//   RAW=trailer/demo/raw BASE=http://localhost:5397 JOBS=2 node tools/trailer/shots.mjs demo-…
// (the new player's own session, which does sign, is tools/trailer/demo-live.mjs; the town square's people are the
// private world's: tools/trailer/world.mjs, BASE=http://localhost:5392 for `town-chat`)

const TOOLS = `
const wait = (ms) => window.__tw.wait(ms);
const glide = (to, ms, el) => new Promise((ok) => {
  const tgt = el ?? document.scrollingElement; const from = tgt.scrollTop; const t0 = performance.now();
  const f = () => { const p = Math.min(1, (performance.now() - t0) / ms); const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; tgt.scrollTo({ top: from + (to - from) * e, behavior: 'instant' }); if (p < 1) requestAnimationFrame(f); else ok(); };
  f();
});
const glideTo = (el, ms, at = 0.5) => { const r = el.getBoundingClientRect(); return glide(Math.max(0, scrollY + r.top + r.height / 2 - innerHeight * at), ms); };
const byText = (t, sel = 'button, a, [role="button"]') => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && e.textContent.trim().replace(/\\s+/g, ' ').startsWith(t));
`;
// (no audio engine runs while a page is filmed, so the rooms' sound control would show crossed out, as if muted, beside
// the very sounds the film carries: it is hidden)
const QUIET = '.snd, .sound-pill, [class*="snd-"] { display: none !important; }';
const view = (path, action, { ms = 6000, rate = 0.08, settle = 6000, css = '', ...more } = {}) => ({
  path, w: 1280, h: 720, dpr: 1.5, ms, rate, settle, tail: 300, action: TOOLS + action, css: QUIET + css, ...more,
});
const tap = (at, opt) => ({ at, run: async (page) => { const { press } = await import('./lib.mjs'); return press(page, opt); } });
/** a real click on the n-th visible button whose text is exactly `label` (the fight record has a Watch on every row) */
const tapNth = (at, label, nth) => ({ at, run: async (page) => {
  const p = await page.evaluate((label, nth) => { const b = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null && e.textContent.trim() === label)[nth]; if (!b) return null; b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, label, nth);
  if (!p) throw new Error(`no ${label} #${nth}`);
  await page.mouse.click(p.x, p.y);
  return p;
} });

export const DEMO = {
  // the home page: the hero's stage switching between the pets
  'demo-home': view('/', 'await wait(7600);', { ms: 7600, settle: 7000, events: [1, 2, 3, 4, 5].map((i) => tap(400 + i * 1250, { sel: '.hero-switch button', nth: i })) }),
  // Get a pet: all six, each live in its own room
  // (each row of cards is 686 css px tall in a 720 px window: the stops frame one whole row at a time, measured with the
  // page laid out: row one 412-1098, row two 1116-1798)
  'demo-adopt': view('/adopt', 'await wait(1200); await glide(395, 1400); await wait(2900); await glide(1099, 1400); await wait(3000);', { ms: 10200, settle: 8000 }),
  // the gallery's dead: the airdrop's cats that were never fed, ghosts over their graves
  'demo-dead': view('/pets?filter=dead', 'await wait(1200); await glide(620, 3200); await wait(1600);', { ms: 6200, settle: 9000, ready: '!!document.querySelector(".cat-card, .gallery-card, [class*=card]")' }),
  // the on-chain art: every picture read from the art contracts as the page is filmed
  'demo-nft': view('/nft?pet=emonad', 'await wait(900); await glide(420, 2600); await wait(1500);', { ms: 5200, settle: 9000 }),
  // the stats: the burn, the pets, live
  'demo-stats': view('/stats', 'await wait(2600); await glide(620, 2600); await wait(1800);', { ms: 7200, settle: 2500, ready: '!!document.querySelector(".stats-hero-value")' }),
  // Emotown: the day's pets out on one street (production's residents)
  'demo-town': view('/emotown?time=night&at=hall', 'window.__town.cam.flyTo(2640, 7200); await wait(7600);', { ms: 7800, settle: 14000, storage: { 'emotown.chat': '0' }, ready: '!!window.__town?.sim' }),
  // Fight Club: a real fight from the record, replayed in the ring: #122, frok #32 v cat #82504, 50 MON a side
  'demo-fight': view('/fightclub?record=1', 'await wait(27000);', { ms: 27400, settle: 3000, events: [tapNth(900, 'Watch', 4)], ready: `!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Watch')` }),
  // the leaderboard: the best kept pets wear the crown
  'demo-board': view('/leaderboard', 'await wait(1000); await glide(380, 2200); await wait(1200);', { ms: 4600, settle: 8000 }),
};
