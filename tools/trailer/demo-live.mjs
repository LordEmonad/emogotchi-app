// The hackathon demo's real session: a brand-new player on the site, on a phone, filmed frame by frame with every network
// answer taking as long as it really took (lib.mjs REALNET), so the waits on film are Monad's own. One tab for the whole
// session, because the passkey account lives in that tab's virtual authenticator:
//   live-signup   the Emonad mint page: connect, a passkey account, the starter, the mint, the account's balance
//   live-shop     the shop: the free Backrooms theme claimed, then given to him (the claim asks for the passkey: the
//                 page was loaded fresh)
//   live-care     his page, now the Backrooms: feed, wash, play, bed, wake (the first asks for the passkey again)
// Every press is asked for by the page's own script when the page is ready for it (film's `wants`), never on a timer.
// The holds between presses are long on purpose: every sheet stays up long enough to be read in the video.
// NEVER attach a second DevTools client to the browser while this runs: when it detaches, Chrome switches the virtual
// authenticator off and the account's passkey is gone for good (it cost a whole session on 2026-10-06).
//
// Rehearse on the private world first (nothing real is spent): node tools/trailer/world.mjs, then
//   BASE=http://localhost:5392 RAW=trailer/demo/rehearse FPS=20 node tools/trailer/demo-live.mjs
// The real thing (real MON: the starter from the drip wallet, then gas), against the mainnet build on localhost:
//   DIST=trailer/demo/dist PORT=5397 node tools/serve-dist.mjs
//   BASE=http://localhost:5397 RAW=trailer/demo/raw node tools/trailer/demo-live.mjs
// It writes RAW/live.json (the account, the pet, every transaction) beside the takes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, open, film, sleep, press } from './lib.mjs';

const BASE = process.env.BASE;
if (!BASE || !/^http:\/\/localhost:\d+$/.test(BASE)) throw new Error('BASE=http://localhost:<port> (a passkey needs a host name, not an IP)');
const RAW = process.env.RAW ?? 'trailer/demo/raw';
const FPS = Number(process.env.FPS ?? 60);
const RATE = Number(process.env.RATE ?? 0.08);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
mkdirSync(RAW, { recursive: true });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const PHONE = { w: 430, h: 800, dpr: 2.4, mobile: true, ua: IPHONE };
// (the dev drawer; and the rooms' sound control, crossed out while filmed since no audio engine runs then)
const HIDE = '.dev-toggle, .dev-panel, .snd, .sound-pill, [class*="snd-"] { display: none !important; }';
// (no browser wallet: an iPhone's Safari has none, and with one the passkey sheet warns that this is a wallet app's browser)

// page script for every take: page-time waits, finding things, and asking for a real press
const TOOLS = `
const wait = (ms) => window.__tw.wait(ms);
const shown = (e) => !!e && e.offsetParent !== null;
const norm = (e) => e.textContent.replace(/\\s+/g, ' ').trim();
const byText = (t, sel = 'button, a, [role="button"]') => [...document.querySelectorAll(sel)].find((e) => shown(e) && norm(e).startsWith(t));
const byHas = (t, sel = 'button, a, [role="button"]') => [...document.querySelectorAll(sel)].find((e) => shown(e) && norm(e).includes(t));
const until = async (fn, what, max = 120000) => { const t0 = performance.now(); for (;;) { let v = null; try { v = fn(); } catch (e) { v = null; } if (v) return v; if (performance.now() - t0 > max) throw new Error('waited too long for ' + what); await wait(50); } };
const want = async (w) => { const n = window.__wantDone ?? 0; window.__want = w; while ((window.__wantDone ?? 0) === n) await wait(16); };
const live = (b) => !!b && !b.disabled;
// a locked account asks first (the page was loaded fresh): confirm with the passkey when the sheet is up
const confirmIfAsked = async (ms, hold = 2400) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const b = byText('Confirm with passkey') ?? byText('Confirm', '.pk-actions button'); if (live(b)) { await wait(hold); await want({ text: norm(b) }); return true; } await wait(60); } return false; };
const glideTo = (el, ms = 900, at = 0.55) => new Promise((ok) => {
  const tgt = document.scrollingElement; const from = tgt.scrollTop; const r = el.getBoundingClientRect();
  const to = Math.max(0, Math.min(tgt.scrollHeight - innerHeight, from + r.top + r.height / 2 - innerHeight * at)); const t0 = performance.now();
  const f = () => { const p = Math.min(1, (performance.now() - t0) / ms); const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; tgt.scrollTo({ top: from + (to - from) * e, behavior: 'instant' }); if (p < 1) requestAnimationFrame(f); else ok(); };
  f();
});
const settled = () => !document.querySelector('.pending-line') && window.__pet?.director?.isBusy === false;
`;

const record = { base: BASE, takes: {} };
const save = () => writeFileSync(`${RAW}/live.json`, JSON.stringify(record, null, 1));
const doTake = (name) => !ONLY || ONLY.includes(name);

const browser = await launch();
try {
  const shot = await open(browser, { path: '/emonadgotchi', base: BASE, ...PHONE, realNet: true, wait: `!!document.querySelector('.egm-btn')` });
  const { page, cdp } = shot;
  page.on('console', (m) => { if (m.type() === 'error') console.log('  page:', m.text().slice(0, 160)); });
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  await page.addStyleTag({ content: HIDE });
  await sleep(7000);

  // what each take's transactions are, in the order they are sent: their names for the explorer stills and the video
  const NAMES = { 'live-signup': ['mint'], 'live-shop': ['claim', 'room'], 'live-care': ['feed', 'wash', 'play', 'sleep', 'wake'] };
  record.names = {};
  const take = async (name, script, ms, tail = 2500) => {
    const t0 = Date.now();
    const meta = await film(shot, { dir: `${RAW}/${name}`, ms, rate: RATE, fps: FPS, action: TOOLS + script, tail, wants: true, touch: true });
    const err = await page.evaluate(() => window.__takeError ?? null);
    record.takes[name] = { frames: meta.frames, seconds: +(meta.frames / FPS).toFixed(2), txs: meta.txs, error: err, minutes: +((Date.now() - t0) / 60000).toFixed(1) };
    meta.txs.filter((e) => e.kind === 'sent').forEach((e, i) => { record.names[e.hash] = NAMES[name]?.[i] ?? `${name}-${i}`; });
    save();
    console.log(`${name}: ${meta.frames} frames (${(meta.frames / FPS).toFixed(1)}s), ${meta.txs.length} tx events, ${record.takes[name].minutes} min${err ? '  ERROR ' + err : ''}${meta.errors.length ? '  PAGE ' + JSON.stringify(meta.errors) : ''}`);
    if (err) {
      // what the page showed when it gave up, for working out why
      await page.screenshot({ path: `${RAW}/${name}-fail.png`, fullPage: true }).catch(() => {});
      writeFileSync(`${RAW}/${name}-fail.txt`, await page.evaluate(() => document.body.innerText).catch(() => ''));
      throw new Error(`${name}: ${err}`);
    }
    return meta;
  };
  // a take's script reports its own failure (the film then ends on its tail)
  const guard = (body) => `try { ${body} } catch (e) { window.__takeError = String(e.message ?? e); }`;
  // after the signup the account lives only in this browser: a take that fails is filmed again here, never given up on
  const again = async (name, go) => {
    for (let attempt = 1; ; attempt += 1) {
      try { await go(); return; } catch (e) {
        console.log(`${name}: attempt ${attempt} failed: ${String(e.message ?? e).slice(0, 200)}`);
        if (attempt >= 3) throw e;
        await page.evaluate(() => { window.__takeError = null; }).catch(() => {});
        await sleep(5000);
      }
    }
  };

  // ---- 1. a passkey account, the starter, the first pet ----
  await take('live-signup', guard(`
    window.__takeError = null;
    await wait(2200);
    await want({ text: 'Connect and mint' });
    await until(() => byHas('Passkey account'), 'the connect sheet');
    await wait(3800);
    await want({ has: 'Passkey account' });
    await until(() => byHas('Create an account'), 'the passkey sheet');
    await wait(3400);
    await want({ has: 'Create an account' });
    await until(() => document.querySelector('.pk-check input[type="checkbox"]'), 'the tick');
    await wait(4600);
    await want({ sel: '.pk-check input[type="checkbox"]' });
    await wait(1200);
    await want({ has: 'Create with passkey' });
    await until(() => byText('Done'), 'the new account');
    await wait(4200);
    await want({ text: 'Done' });
    const mint = await until(() => { const b = byHas('Mint Emonad'); return live(b) ? b : null; }, 'the mint button');
    await wait(1600);
    await glideTo(mint, 1300);
    await wait(1400);
    await want({ has: 'Mint Emonad' });
    await until(() => byHas("He's yours", 'a'), 'the mint', 180000);
    await wait(3800);
    // the account: what the starter left after the mint's gas
    await want({ sel: '.wallet-menu > button' });
    await until(() => byHas('Account: fund'), 'the wallet menu');
    await wait(1800);
    await want({ has: 'Account: fund' });
    await until(() => { const b = document.querySelector('.pk-balance .tnum'); return b && /[0-9]/.test(b.textContent); }, 'the balance', 60000);
    await wait(5000);
    await want({ sel: '.pk-sheet .modal-head button' });
    await wait(1800);
  `), 300000, 300);
  const id = await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find((e) => e.textContent.includes("He's yours")); const m = a && /#(\d+)/.exec(a.textContent); return m ? Number(m[1]) : null; });
  if (!id) throw new Error('no pet id after the mint');
  record.pet = { col: 'emonad', id };
  record.address = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)) ?? ''; const m = /0x[0-9a-fA-F]{40}/.exec(v); if (/passkey/i.test(localStorage.key(i)) && m) return m[0]; } return null; });
  save();
  console.log(`account ${record.address}, Emonad #${id}`);

  // ---- 2. the shop: a free room, claimed and given to him ----
  if (doTake('live-shop')) await again('live-shop', async () => {
    await page.goto(`${BASE}/shop`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.st-tile:not(.is-skel)').length > 5, { timeout: 120000 });
    await page.addStyleTag({ content: HIDE });
    await sleep(6000);
    await take('live-shop', guard(`
      window.__takeError = null;
      await wait(1800);
      await want({ text: 'Free', within: '.st-chip' });
      await wait(1800);
      const tile = await until(() => [...document.querySelectorAll('.st-tile')].find((e) => shown(e) && norm(e).includes('Backrooms')), 'the Backrooms tile');
      await glideTo(tile, 1400, 0.5);
      await wait(1200);
      await want({ has: 'Backrooms', within: '.st-tile' });
      const claim = await until(() => { const b = byText('Claim', '.in-sheet button, .st-sheet button, button'); return live(b) && /free|gas only/.test(norm(b)) ? b : null; }, 'the claim button', 60000);
      await wait(2800);
      await want({ text: norm(claim) });
      await confirmIfAsked(8000);
      await until(() => document.querySelector('.item-cat input[type="checkbox"]'), 'the room to be ours', 150000);
      await wait(2400);
      await want({ sel: '.item-cat input[type="checkbox"]' });
      await wait(1300);
      await want({ has: 'this room · gas only' });
      await until(() => document.querySelector('.item-cat.is-on'), 'the room to be on', 150000);
      await wait(3400);
    `), 300000, 300);
  });

  // ---- 3. looking after him, in his new room ----
  if (doTake('live-care')) await again('live-care', async () => {
    await page.goto(`${BASE}/emonadgotchi/pet/${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__pet?.director, { timeout: 120000 });
    await page.addStyleTag({ content: HIDE });
    await sleep(8000);
    await take('live-care', guard(`
      window.__takeError = null;
      // (after Sleep the button says Wake, and after Wake it says Sleep: \`next\` is what it says when the action is done)
      const act = async (label, first, next = label) => {
        const b = await until(() => { const x = byText(label, '.action, button'); return live(x) ? x : null; }, label, 90000);
        await wait(first ? 2000 : 1300);
        await want({ text: label });
        if (first) await confirmIfAsked(8000);
        await wait(500);
        await until(() => settled() && byText(next, '.action, button'), label + ' to finish', 150000);   // (Sleep stays greyed after a wake while his energy is full)
        await wait(1100);
      };
      await wait(2200);
      await act('Feed', true);
      await act('Wash');
      await act('Play');
      if (live(byText('Sleep', '.action, button'))) { await act('Sleep', false, 'Wake'); await wait(3000); await act('Wake', false, 'Sleep'); }
      await wait(1800);
    `), 300000, 300);
  });

  // every transaction of the session, for the explorer stills and the video's labels
  record.all = Object.values(record.takes).flatMap((t) => t.txs);
  save();
  console.log(`done: ${record.all.filter((e) => e.kind === 'mined').length} transactions mined`);
} finally { await browser.close().catch(() => {}); }
