// The trailer's takes: what is filmed, from which page, doing what. Each take is a folder of frames under RAW.
//   node tools/trailer/shots.mjs [take ...]        (none = every take not filmed yet; --force films again; --list)
//   RAW=<dir, default trailer/raw> BASE=http://127.0.0.1:5391 JOBS=3   (run from the repo root; the site build must be
//   being served: see lib.mjs. Nothing may be writing to the takes' folder meanwhile.)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch, open, film, boxOf, press, sleep } from './lib.mjs';
import { EMO } from './emo-takes.mjs';
import { EMO3 } from './emo3-takes.mjs';
import { EG } from './eg-takes.mjs';
import { DEMO } from './demo-takes.mjs';

export const RAW = process.env.RAW ?? 'trailer/raw';
const JOBS = Number(process.env.JOBS ?? 3);

// what a development build shows that the site does not
const HIDE = '.dev-toggle, .dev-panel { display: none !important; }';

/** One pet alone in its room, from a lab page: only the room is filmed. `who` is the lab's handle for its director. */
const room = (path, who, action, { ms = 12000, rate = 0.08, tail = 500, prep = '' } = {}) => ({
  path, w: 760, h: 640, dpr: 2.5, ms, rate, tail,
  ready: `!!window.__lab?.${who}`,
  prep: `const d = window.__lab.${who}; ${prep}`,
  clip: '.stage',
  idle: `window.__lab.${who}.isBusy === false`,
  action: `const d = window.__lab.${who}; ${action}`,
});
const lab3 = (who, q = '') => `/habibi?only=${who}&moods=0${q.includes('keffiyeh') ? '' : '&keffiyeh=0'}${q.includes('bisht') || q.includes('costume') ? '' : '&bisht=0'}${q.includes('toy') ? '' : '&toy=yarn'}${q.includes('pet=') ? '' : '&pet=pet'}${q.includes('scene') ? '' : '&scene=plain'}${q}`;
const thicc = (q = '') => `/thiccums/lab?moods=0${q}`;
const r3 = (q = '') => `/r3tards?moods=0${q}`;

/** The pet page on a phone, the demo pet: real presses on the real buttons. */
const phone = (button, { ms = 12000, rate = 0.08, path = '/', before = '', fixed = false } = {}) => ({
  path, w: 430, h: 932, dpr: 2.4, mobile: true, wallet: 'demo', ms, rate,
  ready: '!!window.__pet?.director',
  prep: before,
  idle: 'window.__pet.director.isBusy === false',
  events: [{ at: 350, run: (page) => press(page, { text: button }) }],
  until: fixed ? null : 'window.__pet.director.isBusy === false',
});

/** Page script every take can use: wait (page time), glide (an eased scroll), tap (a scripted click by text). */
const TOOLS = `
const wait = (ms) => window.__tw.wait(ms);
const glide = (to, ms, el) => new Promise((ok) => {
  const tgt = el ?? document.scrollingElement; const from = tgt.scrollTop; const t0 = performance.now();
  const f = () => { const p = Math.min(1, (performance.now() - t0) / ms); const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; tgt.scrollTo({ top: from + (to - from) * e, behavior: 'instant' }); if (p < 1) requestAnimationFrame(f); else ok(); };
  f();
});
const byText = (t, sel = 'button, a, [role="button"]') => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && e.textContent.trim().replace(/\\s+/g, ' ').startsWith(t));
`;

/** A page of the site filling the frame. */
const view = (path, action, { ms = 6000, rate = 0.08, settle = 4500, w = 1280, h = 720, dpr = 1.5, ...more } = {}) => ({
  path, w, h, dpr, ms, rate, settle, tail: 300, action: TOOLS + action, ...more,
});
const WHO = '0xE974C0ed0Eace26D85943309e6Ed05bF3f536904';   // the operator's everyday wallet, public on their profile
const town = (q, action, o = {}) => view(`/emotown?${q}`, action, { storage: { 'emotown.chat': '0' }, ready: '!!window.__town?.sim', settle: 12000, ...o });

/** a real press at a moment of the take (the page hears it as a press: its own tap sound, its own hover) */
const tap = (at, opt) => ({ at, run: (page) => press(page, opt) });

export const TAKES = {
  // ---- the five pets, each doing its own thing ----
  'pet-cat': room(lab3('cat', '&crown=1'), 'cat', 'await d.play();'),
  'pet-frok': room(lab3('frog'), 'frog', 'await d.slap();'),
  'pet-frok-burn': room(lab3('frog'), 'frog', 'await d.burn();', { ms: 14000 }),
  'pet-frok-shot': room(lab3('frog', '&night=1'), 'frog', 'await d.screenshot();'),
  'pet-sahur': room(lab3('sahur', '&scene=backrooms'), 'sahur', 'await d.tung();'),
  'pet-thicc': room(thicc(), 'thiccums', 'await d.own.bounce();'),
  'pet-r3': room(r3(), 'r3tards', 'await d.play();', { rate: 0.035 }),   // slower: his kick's props stall the page for a moment, and at 8% that was a three-frame hiccup

  // ---- dressed: outfits, hair, crowns, rooms ----
  'fit-cat-witch': room(lab3('cat', '&costume=witch&crown=1&scene=halloween&night=1'), 'cat', 'await d.pet(1);', { ms: 5000 }),
  'fit-frok-pumpkin': room(lab3('frog', '&costume=pumpkin&scene=halloween'), 'frog', 'await d.pet(1);', { ms: 5000 }),
  'fit-sahur-mummy': room(lab3('sahur', '&costume=mummy&scene=backrooms'), 'sahur', 'await d.pet(1);', { ms: 5000 }),
  'fit-thicc-zombie': room(thicc('&costume=zombie&scene=halloween&night=1'), 'thiccums', 'await d.pet(1);', { ms: 5000 }),
  'fit-r3-hair': room(r3('&hair=1&crown=1'), 'r3tards', 'await d.pet(1);', { ms: 5000 }),
  'fit-cat-habibi': room(lab3('cat', '&keffiyeh=1&bisht=1&scene=majlis'), 'cat', 'await d.pet(1);', { ms: 5000 }),
  'fit-frok-kippah': room(lab3('frog', '&kippah=1&star=1&scene=kotel'), 'frog', 'await d.pet(1);', { ms: 5000 }),
  'fit-sahur-witch': room(lab3('sahur', '&costume=witch&scene=halloween&night=1'), 'sahur', 'await d.pet(1);', { ms: 5000 }),
  'fit-thicc-pumpkin': room(thicc('&costume=pumpkin&crown=1'), 'thiccums', 'await d.pet(1);', { ms: 5000 }),
  'fit-r3-habibi': room(r3('&head=keffiyeh&costume=bisht&scene=majlis&night=1'), 'r3tards', 'await d.pet(1);', { ms: 5000 }),
  'fit-thicc-mummy': room(thicc('&costume=mummy&scene=backrooms'), 'thiccums', 'await d.pet(1);', { ms: 5000 }),
  'fit-r3-zombie': room(r3('&costume=zombie&scene=halloween'), 'r3tards', 'await d.pet(1);', { ms: 5000 }),

  // ---- the packs' toys and moves ----
  'toy-dreidel': room(lab3('cat', '&kippah=1&star=1&scene=kotel&toy=dreidel'), 'cat', 'await d.play();', { ms: 16000 }),
  'toy-darbuka': room(lab3('frog', '&keffiyeh=1&bisht=1&scene=majlis&toy=darbuka'), 'frog', 'await d.play();', { ms: 16000 }),
  'toy-falcon': room(lab3('sahur', '&keffiyeh=1&scene=majlis&pet=falcon'), 'sahur', 'await d.pet();', { ms: 16000 }),
  'toy-kapparot': room(thicc('&head=kippah&scene=kotel&pet=kapparot'), 'thiccums', 'await d.pet();', { ms: 14000 }),

  // ---- life and death ----
  'life-die': room(lab3('cat'), 'cat', 'await d.die();', { ms: 9000, tail: 1500 }),
  'life-revive': room(lab3('cat'), 'cat', 'await d.revive();', { ms: 9000, tail: 800, prep: 'await d.die();' }),
  'life-sleep': room(lab3('frog', '&night=1'), 'frog', 'await d.sleep();', { ms: 8000, tail: 2500 }),

  // ---- the pet page on a phone ----
  'phone-feed': phone('Feed'),
  'phone-wash': phone('Wash', { ms: 14000 }),
  'phone-play': phone('Play'),
  'phone-sleep': phone('Sleep', { ms: 5200, fixed: true }),

  // ---- pages of the site ----
  'home': view('/', `await wait(6400);`, { ms: 6400, events: [1, 2, 3, 4].map((i) => tap(i * 1000, { sel: '.hero-switch button', nth: i })) }),
  'adopt': view('/adopt', `await wait(700); await glide(470, 1800); await wait(2600); await glide(1180, 1800); await wait(2400);`, { ms: 10000 }),
  'nft': view('/nft', `await wait(500); await glide(330, 2600); await wait(900);`, { ms: 4500 }),
  'stats': view('/stats', `await wait(2200); await glide(620, 2400); await wait(1600);`, { ms: 7600, ready: '!!document.querySelector(".stats-hero-value")' }),
  'shop': view('/shop', `await wait(500); await glide(1500, 4200); await wait(600);`, { ms: 5600 }),
  'pack-jewish': view('/shop/jewish', `await wait(900); await glide(560, 2000); await wait(1400);`, { ms: 4600 }),
  'pack-habibi': view('/shop/habibi', `await wait(900); await glide(560, 2000); await wait(1400);`, { ms: 4600 }),
  'gallery': view('/pets', `await wait(700); await glide(900, 3600); await wait(600);`, { ms: 5200 }),
  'board': view('/leaderboard', `await wait(1000); await glide(420, 2200); await wait(1000);`, { ms: 4500 }),
  'pfps': view('/pfps', `await wait(500); await glide(2400, 4200); await wait(400);`, { ms: 5400 }),
  'profile': view('/u/lord', `await wait(1600); await glide(360, 1800); await wait(1200);`, { ms: 5000, settle: 6000 }),
  'r3mint': view('/r3tardgotchi', `await wait(4500);`, { ms: 4500, settle: 6000 }),
  'fight-long': view('/fightclub?record=1', `await wait(27700);`, { ms: 28000, events: [tap(700, { text: 'Watch' })], ready: `!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Watch')`, settle: 1500 }),
  'connect': view('/', `await wait(600); byText('Connect wallet').click(); await wait(2600); const pk = byText('Passkey', 'button, a, [role="button"], .connect-opt, li'); if (pk) pk.click(); await wait(4200);`, { ms: 7800, w: 800, h: 450, dpr: 2.4 }),

  'notif': view('/', `await wait(6000);`, { ms: 6000, account: WHO, wallet: 'injected', settle: 9000, w: 430, h: 932, dpr: 2.4, mobile: true,
    events: [
      { at: 700, run: (page) => press(page, { text: '0xE974' }) },
      { at: 2500, run: (page) => press(page, { text: 'Notifications' }) },
    ] }),

  // ---- Emotown ----
  'town-night': town('time=night&at=hall', `window.__town.cam.flyTo(2640, 6500); await wait(6800);`, { ms: 7000 }),
  'town-day': town('time=day&season=summer&at=diner', `window.__town.cam.flyTo(1240, 5200); await wait(5400);`, { ms: 5600 }),
  'town-winter': town('time=dusk&season=winter&at=shop', `window.__town.cam.flyTo(3700, 5200); await wait(5400);`, { ms: 5600 }),
  'town-spring': town('time=dawn&season=spring&at=park', `window.__town.cam.flyTo(2300, 4200); await wait(4400);`, { ms: 4600 }),
  'town-furnace': town('time=night&at=furnace', `window.__town.cam.flyTo(4760, 5200); await wait(5400);`, { ms: 5600 }),
  'town-tavern': town('time=night&at=arena', `window.__town.cam.flyTo(6300, 4200); await wait(4400);`, { ms: 4600 }),

  // ---- a wallet's own pets (the operator's, read from the chain; this wallet cannot sign) ----
  'mine': view('/', `await wait(8200);`, { ms: 8200, account: WHO, wallet: 'injected', settle: 9000, w: 430, h: 932, dpr: 2.4, mobile: true,
    events: [
      { at: 1000, run: (page) => press(page, { sel: '.cat-tab', nth: 2 }) },
      { at: 2500, run: (page) => press(page, { sel: '.cat-tab', nth: 3 }) },
      { at: 4000, run: (page) => press(page, { sel: '.cat-tab', nth: 4 }) },
      { at: 5500, run: (page) => press(page, { sel: '.cat-tab', nth: 5 }) },
      { at: 6800, run: (page) => press(page, { text: 'Items' }) },
    ] }),
};

// ---- takes filmed in the private world (tools/trailer/world.mjs): people, chat, DMs, sending, a new account ----
const W = existsSync('trailer/world.json') ? JSON.parse(readFileSync('trailer/world.json', 'utf8')) : null;
const who = (n) => ({ ...W.people[n], rpc: W.rpc });
const api = (n, path, body) => fetch(`${W.site}/api/social${path}`, { method: body ? 'POST' : 'GET', headers: { origin: W.site, 'content-type': 'application/json', cookie: W.people[n].cookie }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => null));
const says = (at, n, text) => ({ at, run: () => api(n, '/chat', { room: 'square', text }) });
const dms = (at, n, text) => ({ at, run: () => api(n, '/dm/send', { to: W.people.main.address, text }) });
// the pointer leaves the button it pressed: resting there, the button's hover light comes back every time the button is
// enabled again during the action, and it reads as the button being pressed over and over
const away = (at) => ({ at, run: (page) => page.mouse.move(430, 250).then(() => null) });
const types = (at, text, per = 60) => [...text].map((ch, i) => ({ at: at + i * per, run: (page) => page.keyboard.type(ch) }));
const does = (at, fn, ...args) => ({ at, run: (page) => page.evaluate(fn, ...args).then(() => null) });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
// a browser wallet is installed (so the connect sheet offers it) and is never used
const METAMASK = (page) => page.evaluateOnNewDocument(() => { window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method }) { if (method === 'eth_chainId') return '0x8f'; if (method === 'eth_accounts') return []; throw Object.assign(new Error('not connected'), { code: 4001 }); } }; });
const townUp = async (page) => { let up = false; for (let i = 0; i < 40 && !up; i += 1) { await sleep(3000); up = await page.evaluate(() => (window.__town?.sim?.residents?.size ?? 0) > 30); } if (!up) throw new Error('the town did not fill (its resident list never arrived)'); await sleep(6000); };
/** stand pets where the camera is: [key, x, y], then look at `centre` */
const stage = (page, spots, centre) => page.evaluate((spots, centre) => {
  const s = window.__town.sim;
  for (const [i, [key, x, y]] of spots.entries()) { const r = s.residents.get(key); if (!r) { if (i === 0) throw new Error(`${key} is not in town`); continue; } s.halt(r); r.inside = null; r.goingIn = null; r.route = []; r.x = x; r.y = y; r.nextAt = Date.now() + 900000; s.keepOut(key); }
  s.poke(); window.__town.cam.flyTo(centre, 10);
}, spots, centre);
/** the quietest stretch of street in front of a landmark: where a scene about one pet can be seen */
const quiet = (page) => page.evaluate(() => {
  const s = window.__town.sim; const now = Date.now();
  const xs = [...s.residents.values()].filter((r) => !r.inside).map((r) => s.pos(r, now).x);
  let best = null;
  for (const c of [640, 1200, 3160, 3690, 4220, 4740]) { const n = xs.filter((x) => Math.abs(x - (c - 111)) < 420).length; if (!best || n < best.n) best = { c, n }; }
  return best.c;
});
/** stand one pet at the camera once it has finished whatever the chain feed had it doing on arrival (a page that
 * loads just after the pet was fed replays the meal, and the pet walks off to eat it), and check it stayed */
const standAt = async (page, key, spots, centre) => {
  for (let i = 0; i < 30; i += 1) { if (!(await page.evaluate((k) => window.__town.sim.residents.get(k)?.actor?.busy() ?? false, key))) break; await sleep(2000); }
  await sleep(6000);
  for (let i = 0; i < 30; i += 1) { if (!(await page.evaluate((k) => window.__town.sim.residents.get(k)?.actor?.busy() ?? false, key))) break; await sleep(2000); }
  await stage(page, spots, centre);
  await sleep(5000);
  const x = await page.evaluate((k) => { const s = window.__town.sim; return s.pos(s.residents.get(k), Date.now()).x; }, key);
  if (Math.abs(x - spots[0][1]) > 40) throw new Error(`the pet wandered off (${Math.round(x)} for ${spots[0][1]})`);
};
const glideTo = (text) => does(300, (text) => {
  const el = [...document.querySelectorAll('button, a')].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(text));
  const tgt = document.scrollingElement; const from = tgt.scrollTop; const to = Math.max(0, from + el.getBoundingClientRect().bottom - innerHeight + 150); const t0 = performance.now();
  const f = () => { const p = Math.min(1, (performance.now() - t0) / 900); const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; tgt.scrollTo({ top: from + (to - from) * e, behavior: 'instant' }); if (p < 1) requestAnimationFrame(f); };
  f();
}, text);
const pet = (n, i) => { const p = W.people[n].pets[i]; return `${p.col}:${p.id}`; };
const SMALL = { w: 430, h: 772, dpr: 2.4, mobile: true };   // a phone's screen as the trailer shows it, whole

if (W) Object.assign(TAKES, {
  // the connect sheet, with a browser wallet installed
  'connect': { path: '/', base: W.site, w: 800, h: 450, dpr: 2.4, ms: 5000, rate: 0.08, settle: 5000, before: METAMASK, events: [tap(600, { text: 'Connect wallet' })] },
  // a brand new player: a passkey account, the starter, a first pet
  'signup': { path: '/mint', base: W.site, ...SMALL, h: 800, ua: IPHONE, ms: 19000, rate: 0.08, settle: 6000, before: METAMASK,
    setup: async (page, shot) => {
      await shot.cdp.send('WebAuthn.enable');
      await shot.cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
    },
    events: [
      tap(700, { text: 'Connect and mint' }),
      tap(3600, { has: 'Passkey account' }),
      tap(5600, { has: 'Create an account' }),
      tap(7800, { sel: 'input[type="checkbox"]' }),
      tap(8800, { has: 'Create with passkey' }),
      tap(12600, { text: 'Done' }),
      tap(14000, { text: 'Mint inversebrah' }),
    ] },
  // the town square: other people talk, we answer, the words go up over the pets
  'town-chat': { path: '/emotown?time=night&at=1989', base: W.site, w: 1280, h: 720, dpr: 1.5, person: 'main', storage: { 'emotown.chat': '1' }, ms: 11500, rate: 0.08, ready: '!!window.__town?.sim', settle: 1000,
    setup: async (page) => {
      await townUp(page);
      await api('tung', '/chat', { room: 'square', text: 'tung tung tung' }); await sleep(1500);
      await api('frog', '/chat', { room: 'square', text: 'gm town' }); await sleep(7000);
      await stage(page, [[pet('main', 0), 1760, 832], [pet('tung', 0), 1985, 826], [pet('frog', 0), 2210, 834]], 1989);
      await sleep(9000);
    },
    // (the pointer is kept off the message list: left over a row, each row the new messages pushed under it lit up with
    // its hover highlight, a flicker down the list; so it rests over the sky, and the box is clicked where it is seen)
    events: [
      { at: 100, run: (page) => page.mouse.move(1000, 170).then(() => null) },
      says(500, 'tung', 'gm emotown'),
      says(2300, 'frog', 'who fed their pet today?'),
      { at: 3700, run: async (page) => {
        const p = await page.evaluate(() => { const el = [...document.querySelectorAll('[placeholder^="Say something"]')].find((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + Math.min(b.width / 2, 140), y: b.y + b.height / 2 }; });
        if (!p) throw new Error('no message box');
        await page.mouse.click(p.x, p.y);
        await page.mouse.move(1000, 170);
        return p;
      } },
      ...types(4000, 'just fed Pickle. he says gm'),
      { at: 6000, run: (page) => page.keyboard.press('Enter').then(() => null) },
      { at: 7600, run: async () => { const h = await api('tung', '/chat/history?room=square'); const list = h?.items ?? []; const mine = [...list].reverse().find((m) => (m.a ?? '').toLowerCase() === W.people.main.address.toLowerCase()); if (mine) { await api('tung', '/chat/react', { id: mine.id, emoji: '\u{1F525}' }); await api('frog', '/chat/react', { id: mine.id, emoji: '❤️' }); } return null; } },
      says(8600, 'frog', 'Ribbit wants dinner too'),
    ] },
  // looking after your own pet from the street
  'town-feed': { path: '/emotown?time=night&at=2114', base: W.site, w: 1280, h: 720, dpr: 1.5, person: 'main', storage: { 'emotown.chat': '0' }, ms: 14000, rate: 0.08, ready: '!!window.__town?.sim', settle: 1000,
    setup: async (page) => { await townUp(page); const c = await quiet(page); await standAt(page, pet('main', 0), [[pet('main', 0), c - 111, 918], [pet('main', 2), c + 1500, 800]], c); },
    events: [does(500, (k) => { window.__town.pick(k); }, W.people.main.pets[0].col + ':' + W.people.main.pets[0].id), tap(2400, { text: 'Feed', within: '.town-card button' }), away(2560)],
    until: `!window.__town.sim.residents.get('${W.people.main.pets[0].col}:${W.people.main.pets[0].id}').actor.busy()`, untilAfter: 5000, tail: 900 },
  'town-slap': { path: '/emotown?time=night&at=2114', base: W.site, w: 1280, h: 720, dpr: 1.5, person: 'main', storage: { 'emotown.chat': '0' }, ms: 11000, rate: 0.08, ready: '!!window.__town?.sim', settle: 1000,
    setup: async (page) => { await townUp(page); const c = await quiet(page); await standAt(page, pet('main', 0), [[pet('main', 0), c - 111, 918], [pet('main', 2), c + 1500, 800]], c); await page.evaluate((k) => { window.__town.pick(k); }, pet('main', 0)); await sleep(2500); },
    events: [tap(700, { text: 'Slap', within: '.town-card button' }), away(860)],
    until: `!window.__town.sim.residents.get('${W.people.main.pets[0].col}:${W.people.main.pets[0].id}').actor.busy()`, untilAfter: 3500, tail: 700 },
  // a private conversation
  'dm': { path: '/emotown?time=night&at=1989', base: W.site, w: 1280, h: 720, dpr: 1.5, person: 'main', storage: { 'emotown.chat': '0' }, ms: 10000, rate: 0.08, ready: '!!window.__town?.sim', settle: 1000,
    setup: async (page) => { await api('tung', '/dm/send', { to: W.people.main.address, text: 'gm! Bonk needs a friend' }); await townUp(page); await sleep(3000); },
    events: [
      tap(600, { sel: 'button[aria-label^="Messages"]' }),
      tap(2100, { has: 'tungtung', within: '[class*="so-"] button, [class*="so-"] li, [class*="so-"] a' }),
      dms(3700, 'tung', 'can you send Plank over?'),
      tap(4900, { sel: '[placeholder^="Message "]' }),
      ...types(5200, 'sending him now'),
      { at: 6500, run: (page) => page.keyboard.press('Enter').then(() => null) },
      dms(7900, 'tung', 'legend'),
    ] },
  // a pet, sent to an Emotown name
  'send-name': { path: `/tung/pet/${W.people.main.pets[1].id}`, base: W.site, ...SMALL, person: 'main', ms: 13000, rate: 0.08, settle: 9000,
    events: [
      glideTo('Send this'),
      tap(1700, { text: 'Send this' }),
      tap(3000, { sel: '.send-input, .send input' }),
      ...types(3300, 'tungtung', 75),
      tap(5400, { text: 'Continue' }),
      tap(7400, { sel: '.send input[type="checkbox"]' }),
      tap(8500, { has: 'Send Plank to', within: '.send button' }),
    ] },
  // an item, sent to a pasted address
  'send-addr': { path: `/inversebrah/pet/${W.people.main.pets[0].id}`, base: W.site, ...SMALL, person: 'main', ms: 13500, rate: 0.08, settle: 9000,
    events: [
      glideTo('Send an item'),
      tap(1700, { text: 'Send an item' }),
      tap(3200, { has: 'Backrooms', within: '.send-back button' }),
      tap(4500, { sel: '.send-input, .send input' }),
      { at: 4900, run: (page) => page.keyboard.sendCharacter(W.stranger).then(() => null) },
      tap(6600, { text: 'Continue' }),
      tap(8400, { sel: '.send input[type="checkbox"]' }),
      tap(9500, { has: 'Send Backrooms', within: '.send button' }),
    ] },
});

// the emo pack trailer's takes (emo-takes.mjs; film them with RAW=trailer/emo/raw and the emo build's BASE)
Object.assign(TAKES, EMO);
Object.assign(TAKES, EMO3);
Object.assign(TAKES, EG);
Object.assign(TAKES, DEMO);

async function shoot(name, raw = RAW) {
  const t = TAKES[name];
  if (!t) throw new Error(`no take called ${name}`);
  const browser = await launch();
  try {
    const shot = await open(browser, { path: t.path, w: t.w, h: t.h, dpr: t.dpr, wallet: t.wallet ?? null, account: t.account ?? null, mobile: !!t.mobile, storage: t.storage ?? {}, wait: t.ready ?? null, slowLoad: t.slowLoad ?? null,
      ...(t.base ? { base: t.base } : {}), person: t.person ? who(t.person) : null, ua: t.ua ?? null, before: t.before ?? null });
    const { page } = shot;
    await page.addStyleTag({ content: HIDE + (t.css ?? '') });
    if (t.setup) await t.setup(page, shot);
    await sleep(t.settle ?? 2500);
    if (t.prep) await page.evaluate(`(async () => { ${t.prep} })()`);
    const clip = t.clip ? await boxOf(page, t.clip, t.nth ?? 0) : null;
    if (t.clip && !clip) throw new Error(`${name}: no ${t.clip}`);
    if (t.idle) await page.waitForFunction(t.idle, { timeout: 60000, polling: 100 });
    let action = t.action ?? null;
    // a take driven by presses ends when the page is at rest again
    if (!action && t.until) action = `await window.__tw.wait(${t.untilAfter ?? 1200}); while (!(${t.until})) await window.__tw.wait(100);`;
    const meta = await film(shot, { dir: `${raw}/${name}`, ms: t.ms, rate: t.rate, action, tail: t.tail ?? 400, events: t.events ?? [], clip, fps: t.fps, skip: t.skip ?? 0, transparent: !!t.transparent });
    return meta;
  } finally { await browser.close().catch(() => {}); }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { console.log(Object.keys(TAKES).join('\n')); process.exit(0); }
  const force = args.includes('--force');
  const asked = args.filter((a) => !a.startsWith('--'));
  const names = (asked.length ? asked : Object.keys(TAKES)).filter((n) => force || asked.length || !existsSync(`${RAW}/${n}/meta.json`));
  mkdirSync(RAW, { recursive: true });
  const queue = [...names];
  const failed = [];
  await Promise.all([...Array(Math.min(JOBS, queue.length))].map(async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const t0 = Date.now();
      let meta = null;
      for (let attempt = 1; attempt <= 2 && !meta; attempt += 1) {
        try { meta = await shoot(name); } catch (e) { console.log(`${name}: attempt ${attempt} failed: ${String(e.message ?? e).slice(0, 160)}`); }
      }
      if (!meta) { failed.push(name); continue; }
      console.log(`${name.padEnd(20)} ${String(meta.frames).padStart(4)} frames (${(meta.frames / 60).toFixed(1)}s) stray ${meta.worstStrayMs}ms  in ${((Date.now() - t0) / 1000).toFixed(0)}s${meta.errors.length ? '  ERRORS ' + JSON.stringify(meta.errors) : ''}`);
    }
  }));
  if (failed.length) { console.log('FAILED:', failed.join(' ')); process.exit(1); }
}
