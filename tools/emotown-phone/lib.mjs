// Emotown on a phone, in Safari's engine, signed in as the operator ("lord") in THIS browser only.
// Playwright is not a dependency of the repo: install it in a scratch folder and point PW_DIR at it.
//   (cd <scratch> && npm i playwright@1.63.0 && npx playwright install webkit)
//   <build the site into <dir> (vite build --outDir <dir>) and copy index.html to 404.html and emotown/index.html>
//   PW_DIR=<scratch> DIST=<dir> node tools/emotown-phone/sweep.mjs     (every surface, a screenshot and an audit each)
//   PW_DIR=<scratch> DIST=<dir> node tools/emotown-phone/verify.mjs    (menus, reactions, door tags: must all pass)
//   ... desk.mjs (desktop, mouse), care.mjs (care panel, a read-only wallet), gif.mjs / grid.mjs (the GIF picker)
// Built 2026-09-29 for the GIF search box cut off on phones; see CLAUDE.md "Emotown on a phone, gone over".
// Reads come from the real production API and the real square socket; every non-GET /api request is refused here
// before it leaves, and Google Analytics is blocked. With DIST set, the site's own files come from that local build
// (same origin, so the socket's Origin check passes); otherwise from production.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
const require = createRequire(process.env.PW_DIR ? `${process.env.PW_DIR.replace(/\/$/, '')}/` : import.meta.url);
export const { webkit, chromium, devices } = require('playwright');

const ORIGIN = 'https://emogotchi.emonad.lol';
const DIST = process.env.DIST || null;
const LORD = '0xe974c0ed0eace26d85943309e6ed05bf3f536904';
export const PEOPLE = [
  { address: '0xfde42bc6569046a27a779cb5fb80606828874b9f', name: 'Sadcat', pet: { col: 'cat', id: 82504 } },
  { address: '0x395e84161cc607da617b29ac8290d54a7a34bc71', name: 'Xim', pet: { col: 'cat', id: 17105 } },
  { address: '0x729e15a1660bbc5389133d037f6ea0d36a1d0dde', name: 'shirin', pet: { col: 'cat', id: 34014 } },
  { address: '0x56466a6ea6d50781590d361457364edb1a303a5a', name: 'casemidio', pet: { col: 'cat', id: 25587 } },
  { address: '0xc35b0b63fbbabbe889fd9f22aa6ec0fba6961dd0', name: 'dobby_xyz', pet: { col: 'cat', id: 82442 } },
  { address: '0x102046d600d64b6cb6f5487d3d779054469d9ee4', name: 'kozzakii', pet: { col: 'frok', id: 428 } },
  { address: '0x2176c69c934280b58058915bcead2ac0d14c985c', name: 'MattTravelling', pet: { col: 'thiccums', id: 9 } },
];
const PFP = '/Volumes/BJ/code/emonad projects/emo pets/apps/web/public/pfp';
const PICS = ['cat', 'frog', 'sahur'].flatMap((c) => readdirSync(join(PFP, c)).filter((f) => f.endsWith('-t.png')).slice(0, 8).map((f) => join(PFP, c, f)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain' };

let profile = null;
async function lordProfile() {
  if (!profile) profile = await (await fetch(`${ORIGIN}/api/social/profile/lord`)).json();
  return profile;
}
const now = Date.now();
const gifs = (q, pos) => {
  const base = pos ? 24 : 0;
  const sizes = [[220, 124], [220, 220], [220, 300], [220, 165], [220, 140], [220, 260]];
  return {
    items: Array.from({ length: 24 }, (_, i) => {
      const [w, h] = sizes[(i + base) % sizes.length];
      const n = i + base;
      return { id: `g${n}`, url: `https://static.klipy.com/ii/f${n}ab/${String(n % 100).padStart(2, '0')}/cd/pet-${n}.gif`, still: `https://static.klipy.com/ii/f${n}ab/${String(n % 100).padStart(2, '0')}/cd/pet-${n}.jpg`, w, h, title: `${q || 'featured'} ${n}` };
    }),
    next: pos ? null : 'Mg==',
  };
};
const notes = () => ({ items: PEOPLE.slice(0, 6).map((p, i) => ({ id: 100 + i, kind: ['follow', 'dm', 'mention', 'reply', 'react:🔥', 'like'][i], actor: p.address, ref: i === 2 ? '123' : null, count: i === 0 ? 3 : 1, at: now - i * 3_600_000, read: i > 2, name: p.name, pet: p.pet })) });
const threads = () => ({ items: PEOPLE.slice(0, 5).map((p, i) => ({ id: `t${i}`, with: p, lastAt: now - i * 5_400_000, last: { text: ['gm lord, the town looks sick on my phone', 'did you see the thiccums butt bounce lmao', 'how do i get the keffiyeh', 'ty for the airdrop', 'yo'][i], from: i % 2 ? LORD : p.address, gif: i === 3 }, unread: i === 0 ? 2 : 0, blocked: false })) });
const thread = (other) => {
  const p = PEOPLE.find((x) => x.address === other) || PEOPLE[0];
  const lines = ['gm lord', 'gm! how is the town treating you', 'the square is cooking today 🔥', 'this is a much longer message to see how a DM wraps on a small phone screen when somebody writes a whole paragraph about their pets and the burn', 'lol', 'check this'];
  return { items: lines.map((t, i) => ({ id: 900 + i, conv: 'c', from: i % 2 ? LORD : p.address, to: i % 2 ? p.address : LORD, text: t, at: now - (lines.length - i) * 600_000, g: i === 5 ? gifs('', null).items[2] : null, rx: i === 2 ? { [LORD]: '🔥' } : undefined })), more: false, canSend: true, why: null };
};

export async function context(browser, device, { state = 'in', wallet = false, ...extra } = {}) {
  const ctx = await browser.newContext({ ...device, ...extra });
  // a READ-ONLY wallet (tools/mobile-audit.mjs's): it says who it is and refuses anything that would sign or send
  if (wallet) await ctx.addInitScript((addr) => {
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (/^eth_send|sign|wallet_/.test(method)) throw Object.assign(new Error('read-only test wallet'), { code: 4001 });
      const r = await fetch('https://rpc.monad.xyz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      return (await r.json()).result;
    } };
    try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* */ }
  }, LORD);
  const prof = await lordProfile();
  const me = { signedIn: true, address: LORD, admin: true, muteUntil: 0, profile: { ...prof, updatedAt: now }, gate: { ok: true, pet: { col: 'sahur', id: 9, name: 'lord' }, checkedAt: now }, unread: { dms: 2, notifications: 3 }, blocked: [], following: PEOPLE.slice(0, 3).map((p) => p.address), picsWaiting: 0, gifs: true };
  await ctx.route(/google-analytics|googletagmanager|doubleclick/, (r) => r.abort());
  await ctx.route('https://static.klipy.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(PICS[Math.abs([...r.request().url()].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % PICS.length]) }));
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      if (req.method() !== 'GET') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'blocked by the test browser' }) });
      const s = p.replace('/api/social', '');
      const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (s === '/me') return json(state === 'out' ? { signedIn: false } : state === 'gated' ? { ...me, admin: false, gate: { ok: false, pet: null, checkedAt: now } } : me);
      if (s === '/unread') return json(me.unread);
      if (s === '/gifs') return json(gifs(url.searchParams.get('q'), url.searchParams.get('pos')));
      if (s === '/notifications') return json(notes());
      if (s === '/dm/threads') return json(threads());
      if (s.startsWith('/dm/thread/')) return json(thread(s.split('/')[3]));
      if (s.startsWith('/chat/mine')) return json({ mine: {} });
      if (s.startsWith('/admin/reports')) return json({ items: [] });
      if (s === '/admin/people') return json({ muted: [PEOPLE[4]].map((p) => ({ a: p.address, n: p.name, p: p.pet })), banned: [] });
      if (s === '/admin/filter') return json({ items: [{ word: 'someword', by: LORD, at: now }] });
      if (s === '/admin/log') return json({ items: [{ id: 1, admin: LORD, action: 'role_give', target: PEOPLE[1].address, detail: { role: 'OG' }, created_at: now }, { id: 2, admin: LORD, action: 'mute', target: PEOPLE[4].address, detail: { minutes: 60 }, created_at: now - 1e6 }] });
      if (s.startsWith('/admin/pics')) return json({ mode: 'screen', held: 0, items: [] });
      if (s === '/admin/roles') { const r = await (await fetch(`${ORIGIN}/api/social/roles`)).json(); return json({ roles: r.roles.map((x) => ({ ...x, members: [] })) }); }
      return route.continue();
    }
    if (!DIST) return route.continue();
    let f = join(DIST, decodeURIComponent(p));
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    let status = 200;
    if (!existsSync(f)) { f = join(DIST, '404.html'); status = 404; }
    return route.fulfill({ status, contentType: TYPES[extname(f)] || 'application/octet-stream', body: readFileSync(f) });
  });
  return ctx;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open /emotown and wait for the town and the signed-in HUD. */
export async function town(page, q = '', state = 'in') {
  await page.goto(`${ORIGIN}/emotown${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(state === 'out' ? '.so-hud-signin' : '.so-hud-me', { timeout: 60000 });
  await sleep(2500);
}

/** Everything wrong in `rootSel` (the open panel) as a phone shows it: cut off by a parent or the screen, covered by
 *  something else, too small to tap or read, text cut short, tap targets on top of each other, sideways scroll. */
export async function audit(page, rootSel = 'body') {
  return page.evaluate((rootSel) => {
    const out = [];
    const W = innerWidth, H = innerHeight;
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - W}px`);
    const vis = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return true; };
    const name = (e) => { const c = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/)[0]; const t = (e.getAttribute('aria-label') || e.placeholder || e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28); return `${e.tagName.toLowerCase()}${c ? '.' + c : ''} "${t}"`; };
    const roots = [...document.querySelectorAll(rootSel)].filter(vis);
    if (!roots.length) return [`nothing matches ${rootSel}`];
    const els = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((e) => !e.closest('svg') || e.tagName === 'svg');
    const taps = [];
    // a thing lying under an open picker, menu, sheet or card is meant to be under it: not a problem of its own
    const OVER = '.so-pick, .so-menu, .so-reactbar, .so-hits, .so-drawer-back, .modal-back, .so-pop, .town-card, .town-mine, .town-find, .door-list, .so-chat';
    const beneath = (e, r) => { const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); const o = top?.closest(OVER); return !!(o && !o.contains(e)); };
    for (const e of els) {
      if (!vis(e)) continue;
      const r0 = e.getBoundingClientRect();
      if (r0.width < 1 || r0.height < 1) continue;
      if (beneath(e, r0)) continue;
      const tap = e.matches('a[href], button, input, select, textarea, [role=button], [role=tab], [role=menuitem]') && !e.disabled;
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tap && !hasText && !e.matches('img, h1, h2, h3')) continue;
      // what of it can be seen: cut by each clipping parent in turn (a scroller only hides what is scrolled away)
      let r = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom }, cut = null, scrolledAway = false;
      for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (!/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) continue;
        const pr = p.getBoundingClientRect();
        const scrolls = /(auto|scroll)/.test(s.overflowY + s.overflowX);
        const nr = { l: Math.max(r.l, pr.left), t: Math.max(r.t, pr.top), r: Math.min(r.r, pr.right), b: Math.min(r.b, pr.bottom) };
        if (scrolls) { if (nr.r - nr.l < 1 || nr.b - nr.t < 1) { scrolledAway = true; break; } r = nr; continue; }
        if (nr.l > r.l + 1 || nr.t > r.t + 1 || nr.r < r.r - 1 || nr.b < r.b - 1) { cut = `.${String(p.className).split(' ')[0] || p.tagName}`; break; }
      }
      if (scrolledAway) continue;
      if (cut) { out.push(`CUT by ${cut}: ${name(e)}`); continue; }
      if (r.l < -1 || r.r > W + 1 || r.t < -1 || r.b > H + 1) { out.push(`OFF SCREEN: ${name(e)} [${Math.round(r0.left)},${Math.round(r0.top)} → ${Math.round(r0.right)},${Math.round(r0.bottom)}]`); continue; }
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (hasText && fs < 11.5) out.push(`TINY TEXT ${fs}px: ${name(e)}`);
      const st = getComputedStyle(e);
      if (hasText && e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(st.overflowX) && st.textOverflow !== 'ellipsis' && e.clientWidth > 0) out.push(`TEXT CUT: ${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
      if (tap) {
        taps.push(e);
        const inText = e.tagName === 'A' && /^(P|LI|SPAN|SMALL)$/.test(e.parentElement?.tagName) && (e.parentElement.innerText || '').length > (e.innerText || '').length + 12;
        if (!inText && (r0.width < 32 || r0.height < 32)) out.push(`SMALL TAP ${Math.round(r0.width)}x${Math.round(r0.height)}: ${name(e)}`);
        // can a finger reach it: what is really on top at its middle
        const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== e && !e.contains(top) && !top.contains(e)) out.push(`COVERED: ${name(e)} under ${name(top)}`);
      }
    }
    for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
      if (taps[i].contains(taps[j]) || taps[j].contains(taps[i])) continue;
      const a = taps[i].getBoundingClientRect(), b = taps[j].getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 4 && iy > 4) out.push(`OVERLAP: ${name(taps[i])} x ${name(taps[j])}`);
    }
    return [...new Set(out)];
  }, rootSel);
}
