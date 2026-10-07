// The trailer's camera. A page is opened with its clock in our hands: every timer, every frame callback, Date and
// performance.now run on a clock we can slow, and the browser's own animation timeline (CSS animations, transitions,
// Web Animations) is slowed by the same factor through DevTools' Animation.setPlaybackRate. Slowed to a few percent of
// speed, one screenshot is taken at each sixtieth of a second of the PAGE's time, so the frames are a true 60fps of the
// real site, nothing skipped and nothing interpolated (the share clips' trick, tools/record-anims.mjs, made whole-page).
//
// Films a build served by tools/serve-dist.mjs (a development-mode build keeps the labs and the test hooks):
//   cd apps/web && NODE_ENV=development npx vite build --mode development --outDir ../../trailer/dist --emptyOutDir
//   DIST=trailer/dist PORT=5391 node tools/serve-dist.mjs      (then: node tools/trailer/shots.mjs, node tools/trailer/render.mjs)
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const BASE = process.env.BASE ?? 'http://127.0.0.1:5391';
export const FPS = 60;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(5, '0');

export const launch = () => puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'],
});

/** Runs in the page before any of its scripts: the page's clock, which `__tw.setRate` slows. */
const TIMEWARP = () => {
  if (window.__tw) return;
  const realNow = performance.now.bind(performance);
  const RealDate = Date;
  const realSetTimeout = window.setTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  const realRAF = window.requestAnimationFrame.bind(window);

  let rate = 1;
  let baseReal = realNow();
  let baseVirt = baseReal;
  let stopAt = null;          // a run of the clock that ends itself at this moment of page time
  let stopped = null;
  const virt = () => { const v = baseVirt + (realNow() - baseReal) * rate; return stopAt !== null && v > stopAt ? stopAt : v; };
  const wall0 = RealDate.now() - realNow();          // Date follows the same clock
  const dateNow = () => Math.round(wall0 + virt());

  performance.now = () => virt();
  function D(...a) {
    if (!new.target) return new RealDate(dateNow()).toString();
    return a.length ? new RealDate(...a) : new RealDate(dateNow());
  }
  D.prototype = RealDate.prototype;
  D.now = dateNow; D.UTC = RealDate.UTC; D.parse = RealDate.parse;
  window.Date = D;

  // timers: kept by their due time on the page's clock and run by a pump, so a change of rate moves every pending one
  const timers = new Map();
  let nextId = 1 << 28;
  const add = (fn, ms, args, every) => {
    const id = nextId++;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { due: virt() + delay, fn, args, every: every ? Math.max(delay, 1) : 0 });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = (id) => { if (!timers.delete(id)) realClearTimeout(id); };
  window.clearInterval = (id) => { if (!timers.delete(id)) realClearInterval(id); };
  const pumpTo = (now) => {
    let due = null;
    for (const [id, t] of timers) if (t.due <= now) (due ??= []).push([id, t]);
    if (!due) return;
    due.sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
    for (const [id, t] of due) {
      if (!timers.has(id)) continue;                 // cleared by an earlier one
      if (t.every) t.due = Math.max(t.due + t.every, now); else timers.delete(id);
      try { typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(String(t.fn)); } catch (e) { console.error(e); }
    }
  };
  const tick = () => {
    const live = virt();
    if (stopAt !== null && live >= stopAt) {
      pumpTo(stopAt);
      baseVirt = stopAt; baseReal = realNow(); rate = 0;
      const done = stopped; stopAt = null; stopped = null;
      if (done) done();
      return;
    }
    pumpTo(live);
  };
  realSetInterval(tick, 1);

  window.requestAnimationFrame = (cb) => realRAF(() => cb(virt()));

  // no audio engine while filming: the page's sounds are only written down (window.__sfx, by the trailer's build) and
  // mixed into the film afterwards; a live engine would be synthesizing in real time beside a page running at 8%
  try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch { /* fine */ }

  window.__tw = {
    virt, realNow,
    get rate() { return rate; },
    setRate(r) { const v = virt(); baseReal = realNow(); baseVirt = v; rate = r; },
    realSetTimeout,
    /** run the clock at `r` for exactly `ms` of page time, then hold it still; resolves when it has stopped */
    runFor(ms, r) {
      return new Promise((ok) => { const v = virt(); baseReal = realNow(); baseVirt = v; stopAt = v + ms; stopped = ok; rate = r; });
    },
    /** resolves after `ms` of the page's own time */
    wait: (ms) => new Promise((ok) => add(ok, ms, [], false)),
  };
};

/**
 * Runs after TIMEWARP when a take films a real chain (open({ realNet: true })): every fetch's answer reaches the page only
 * once the PAGE's clock has moved on by as long as the answer really took, so a transaction that took 0.9 s on Monad takes
 * 0.9 s on film too (with the clock slowed to a few percent, an answer would otherwise land between two frames and every
 * wait would look instant). It also writes down the page's transactions: when each was sent (`sent`, with its hash) and
 * when the page learned it was in a block (`mined`), on the page's clock, in window.__txlog.
 */
const REALNET = () => {
  if (window.__realnet) return;
  window.__realnet = true;
  const tw = window.__tw;
  const realFetch = window.fetch.bind(window);
  const log = (window.__txlog = []);
  const seen = new Set();
  window.fetch = async (input, init) => {
    const v0 = tw.virt();
    const r0 = tw.realNow();
    let rpc = null;
    try { const b = init?.body; if (typeof b === 'string' && b.includes('"jsonrpc"')) rpc = JSON.parse(b); } catch { /* not JSON-RPC */ }
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const drip = /\/api\/drip$/.test(url.split('?')[0]);
    const res = await realFetch(input, init);
    let text = null;
    if (rpc || drip) text = await res.clone().text().catch(() => null);   // the body's own transfer counts in the wait
    // the starter is sent by the server: its hash comes back in the answer
    if (drip && text) { try { const j = JSON.parse(text); log.push({ kind: 'drip', hash: j.hash ?? null, ok: !!j.ok, amount: j.amount ?? null, t: v0, back: v0 + (tw.realNow() - r0) }); } catch { /* fine */ } }
    const due = v0 + (tw.realNow() - r0);
    if (tw.virt() < due) await new Promise((ok) => setTimeout(ok, due - tw.virt()));   // the page's (warped) timer
    if (rpc && text) {
      try {
        const calls = Array.isArray(rpc) ? rpc : [rpc];
        const outs = [].concat(JSON.parse(text));
        for (const c of calls) {
          const o = outs.find((x) => x && x.id === c.id) ?? outs[0];
          if (!o || !o.result) continue;
          if (c.method === 'eth_sendRawTransaction' || c.method === 'eth_sendTransaction') log.push({ kind: 'sent', hash: o.result, t: v0 });
          // the first time an address the page asks about holds anything (a new account's starter has landed)
          if (c.method === 'eth_getBalance' && /^0x0*[1-9a-f]/i.test(o.result) && !seen.has('bal:' + c.params?.[0])) { seen.add('bal:' + c.params[0]); log.push({ kind: 'funded', address: c.params[0], wei: o.result, t: tw.virt() }); }
          if (c.method === 'eth_getTransactionReceipt' && !seen.has(c.params?.[0])) {
            seen.add(c.params[0]);
            log.push({ kind: 'mined', hash: c.params[0], t: tw.virt(), status: o.result.status, block: o.result.blockNumber, to: o.result.to, gasUsed: o.result.gasUsed });
          }
        }
      } catch { /* not ours to break */ }
    }
    return res;
  };
};

/**
 * A page of the site with its clock in hand.
 *   w, h, dpr   the viewport (css px) and how many device px each is: w*dpr x h*dpr is the picture's size
 *   wallet      'demo' = the site's own demo pet; null = a visitor with no wallet
 *   storage     extra localStorage entries, set before the page's scripts
 */
export async function open(browser, { path, w, h, dpr = 1, wallet = null, account = null, person = null, base = BASE, storage = {}, mobile = false, ua = null, wait = null, before = null, slowLoad = null, realNet = false }) {
  const page = await (person || base !== BASE ? await browser.createBrowserContext() : browser).newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  if (ua) await page.setUserAgent(ua);
  // nothing filmed is reported anywhere: analytics never loads
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (/googletagmanager\.com|google-analytics\.com|\/ga\.js/.test(u)) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.evaluateOnNewDocument(TIMEWARP);
  if (realNet) await page.evaluateOnNewDocument(REALNET);
  await page.evaluateOnNewDocument((wallet, storage) => {
    try {
      if (wallet) localStorage.setItem('emogotchi.wallet', wallet);
      localStorage.setItem('emogotchi.pushNudge', '1');
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    } catch { /* private mode */ }
  }, wallet, storage);
  // a wallet that can look and cannot sign: the site shows this address's real pets, and nothing can be sent
  if (account) await page.evaluateOnNewDocument((addr) => {
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
      throw Object.assign(new Error('This wallet only looks.'), { code: 4001 });
    } };
  }, account);
  // a person of the private world (tools/trailer/world.mjs): a wallet that signs with their fork key, signed in to Emotown
  if (person) {
    const { createWalletClient, defineChain, http } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const acct = privateKeyToAccount(person.key);
    const chain = defineChain({ id: 143, name: 'Monad fork', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [person.rpc] } } });
    const wc = createWalletClient({ account: acct, chain, transport: http(person.rpc) });
    await page.exposeFunction('__sign', (hex) => acct.signMessage({ message: { raw: hex } }));
    await page.exposeFunction('__send', (tx) => wc.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data, gas: tx.gas ? BigInt(tx.gas) : undefined }));
    await page.evaluateOnNewDocument((addr, rpcUrl) => {
      const rpc = async (method, params) => { const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result; };
      window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
        if (method === 'eth_chainId') return '0x8f';
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_revokePermissions') return null;
        if (method === 'personal_sign') return window.__sign(params[0]);
        if (method === 'eth_sendTransaction') return window.__send(params[0]);
        return rpc(method, params ?? []);
      } };
      try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* private mode */ }
    }, acct.address, person.rpc);
  }
  // a page whose first moments are wanted on film loads with its clock already slow
  if (slowLoad) await page.evaluateOnNewDocument((r) => { window.__tw.setRate(r); }, slowLoad);
  if (before) await before(page);
  const cdp = await page.createCDPSession();
  await cdp.send('Animation.enable');
  if (slowLoad) await cdp.send('Animation.setPlaybackRate', { playbackRate: slowLoad });
  if (person?.signIn !== false && person) {
    // sign in to Emotown the way the site does (the Worker writes the message, the wallet signs it), then go where asked
    await page.goto(base + '/faq', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(async (addr) => {
      const me = await (await fetch('/api/social/me')).json();
      if (me?.address) return;
      const { message } = await (await fetch(`/api/social/auth/nonce?address=${addr}`)).json();
      const hex = '0x' + [...new TextEncoder().encode(message)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const signature = await window.__sign(hex);
      const r = await fetch('/api/social/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) });
      if (!r.ok) throw new Error('sign-in refused: ' + (await r.text()));
    }, person.address);
  }
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (wait) await page.waitForFunction(wait, { timeout: 120000, polling: 200 });
  await page.bringToFront();
  return { page, cdp, errors };
}

/** The page's speed: 1 is real time. */
export async function setRate({ page, cdp }, rate) {
  await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
  await page.evaluate((r) => window.__tw.setRate(r), rate);
}

/**
 * Film the page's own time into `dir` at 60fps. The page is held still for every picture: its clock and its animation
 * timeline run for one sixtieth of a second of page time (slowed to `rate`, so the stop lands within a fraction of a
 * millisecond), stop, and the picture is taken. However long a picture takes, the frames are exact.
 *   ms        how long (page time); with `action`, the take ends `tail` ms after the action finishes, or at `ms`
 *   action    page script (a string) started at the first frame, not waited for
 *   events    [{ at: ms, run: async (page) => … }] things done from outside at a moment of the take (a real click)
 *   clip      { x, y, width, height } in page coordinates, else the viewport
 *   fps       frames a second of PAGE time (default 60): at 180 a take played at 60 is three times slower, with every
 *             frame its own (slow motion); at 89.4 a 240 ms bounce lands every 357 ms
 *   skip      ms of page time run through, unfilmed, after the action starts (to film only the end of a long scene);
 *             the cues are counted from the first frame, so the ones before it are negative
 *   transparent  the picture keeps its alpha (the page's own backgrounds must be hidden by the take's css): a pet cut out
 *   wants     the page asks for real presses itself: its script sets window.__want = { text | has | sel, nth, within }
 *             (or { type: 'abc' } / { key: 'Enter' }) when it is ready for one, and waits for window.__wantDone to move;
 *             the press is made between two frames through the browser's input pipeline. For a real chain, where what
 *             the page waits for (a starter, a receipt) takes as long as it takes, so no press can be timed in advance.
 *   touch     those presses are finger taps (a phone): no pointer is left resting where something opens next
 */
export async function film(shot, { dir, ms, rate = 0.08, action = null, tail = 400, events = [], clip = null, fps = FPS, skip = 0, transparent = false, wants = false, touch = false }) {
  const { page, cdp } = shot;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.bringToFront();
  await setRate(shot, 0);
  const mark = await page.evaluate(() => { window.__recDone = false; window.__want = null; return { virt: window.__tw.virt(), n: (window.__sfx ?? []).length, tx: (window.__txlog ?? []).length }; });
  if (action) await page.evaluate(`(async () => { ${action} })().catch((e) => console.error('action', e)).then(() => { window.__recDone = true; }); void 0;`);
  if (skip > 0) {
    // run the page through `skip` ms of its time at half speed, unfilmed (its clock stops itself at the end)
    const js = page.evaluate((m, r) => window.__tw.runFor(m, r), skip, 0.5);
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.5 });
    await sleep(skip / 0.5);
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
    await js;
  }
  const max = Math.round(ms / 1000 * fps);
  const stepMs = 1000 / fps;
  const nominal = stepMs / rate;                     // real ms the page runs for each frame
  const todo = [...events].sort((x, y) => x.at - y.at);
  const marks = [];                                   // where and when the take's own presses landed
  const tlNow = () => page.evaluate(() => document.timeline.currentTime);
  const tl0 = await tlNow();
  let wait = nominal;
  let worst = 0;                                      // how far the animation timeline strayed from the frame's moment, page ms
  const hitches = [];                                 // [frame, ms] wherever it strayed by more than a third of a frame
  let end = max;
  let i = 0;
  for (; i < end; i += 1) {
    const at = i * stepMs;
    if (i > 0) {
      const js = page.evaluate((m, r) => window.__tw.runFor(m, r), stepMs, rate);
      const t = Date.now();
      await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
      await sleep(Math.max(1, wait - (Date.now() - t)));
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
      await js;
      const err = (await tlNow()) - tl0 - at;         // + = the timeline is ahead of the frame
      worst = Math.max(worst, Math.abs(err));
      if (Math.abs(err) > 6) hitches.push([i, Math.round(err)]);
      wait = Math.max(nominal * 0.25, Math.min(nominal * 2, (stepMs - err) / rate));
    }
    while (todo.length && todo[0].at <= at) {
      const where = await todo.shift().run(page);
      if (where && typeof where.x === 'number') marks.push({ at: Math.round(at), x: where.x, y: where.y });
    }
    if (wants) {
      const want = await page.evaluate(() => { const w = window.__want; window.__want = null; return w; });
      if (want) {
        let where = null;
        try {
          if (want.type) await page.keyboard.type(want.type, { delay: 0 });
          else if (want.key) await page.keyboard.press(want.key);
          else where = await press(page, want, { touch });
        } catch (e) { console.log(`  a press the page asked for failed: ${String(e.message ?? e).slice(0, 120)}`); }
        if (where) marks.push({ at: Math.round(at), x: where.x, y: where.y });
        await page.evaluate(() => { window.__wantDone = (window.__wantDone ?? 0) + 1; });
      }
    }
    await page.screenshot({ path: `${dir}/f-${pad(i)}.png`, captureBeyondViewport: false, ...(transparent ? { omitBackground: true } : {}), ...(clip ? { clip } : {}) });
    if (action && end === max && i % 6 === 5 && await page.evaluate(() => window.__recDone === true)) end = Math.min(max, i + Math.round(tail / 1000 * fps));
  }
  // what the page sounded like, by the take's own clock (ms from its first frame)
  const cues = await page.evaluate((m, k) => (window.__sfx ?? []).slice(m.n).map((e) => ({ ...e, t: Math.round((e.t - m.virt - k) * 10) / 10 })), mark, skip);
  // the take's transactions (a real chain's): sent and mined, ms from its first frame
  const txs = await page.evaluate((m, k) => (window.__txlog ?? []).slice(m.tx).map((e) => ({ ...e, t: Math.round((e.t - m.virt - k) * 10) / 10 })), mark, skip);
  await setRate(shot, 1);
  const meta = { frames: i, fps, skip, rate, cues, txs, worstStrayMs: Math.round(worst * 10) / 10, hitches, marks, errors: shot.errors.slice(0, 5) };
  writeFileSync(`${dir}/meta.json`, JSON.stringify(meta));
  return meta;
}

/** The page-coordinate box of the first element matching `sel`, scrolled to the middle of the viewport first. */
export const boxOf = (page, sel, nth = 0) => page.evaluate((sel, nth) => {
  const el = document.querySelectorAll(sel)[nth];
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const b = el.getBoundingClientRect();
  return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height };
}, sel, nth);

/** A real click (through the browser's input pipeline) on the middle of an element found by selector or by its text. */
export async function press(page, { sel = null, nth = 0, text = null, has = null, within = 'button, a, [role="button"]' }, { touch = false } = {}) {
  const at = await page.evaluate((sel, text, within, nth, has) => {
    const shown = [...document.querySelectorAll(sel ?? within)].filter((e) => sel || e.offsetParent !== null);
    const el = sel ? shown[nth] : has ? shown.find((e) => e.textContent.includes(has)) : shown.find((e) => e.textContent.trim().replace(/\s+/g, ' ').startsWith(text));
    if (!el) return null;
    let b = el.getBoundingClientRect();
    if (b.top < 0 || b.bottom > innerHeight) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); b = el.getBoundingClientRect(); }
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, sel, text, within, nth, has);
  if (!at) throw new Error(`nothing to press: ${sel ?? text ?? has}`);
  // a phone is pressed with a finger: a mouse click leaves the pointer resting there, and whatever opens under it next
  // (a sheet's option, a list's row) lights up with its hover style, which a phone never shows
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  return at;
}

/** One still. */
export const still = (shot, path, clip = null) => shot.page.screenshot({ path, captureBeyondViewport: false, ...(clip ? { clip } : {}) });
