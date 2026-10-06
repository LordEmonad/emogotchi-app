// Every page of the site on a phone: what sticks out sideways, tap targets too small to hit, text too small to read or
// cut off, tap targets on top of each other, fixed bars that eat the screen, page errors, and a screenshot of each for a
// person to look at. Chrome's phone emulation (touch, device pixel ratio) at 360 (a small Android), 390 (an iPhone) and
// 430 (a big iPhone). A wallet can be injected READ-ONLY (WHO: a public address with pets; it answers who it is and
// refuses anything that would sign or send), so the pet pages show real pets.
//   DIST=<build> node tools/serve-dist.mjs   (or a dev server)
//   BASE=http://127.0.0.1:5281 OUT=<dir> [WIDTHS=390] [ONLY=/,/pets] node tools/mobile-audit.mjs
import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5281';
const OUT = process.env.OUT ?? '.';
const WHO = process.env.WHO ?? '0xE974C0ed0Eace26D85943309e6Ed05bF3f536904';
const WIDTHS = (process.env.WIDTHS ?? '360,390,430').split(',').map(Number);
const HEIGHT = { 360: 740, 390: 844, 430: 932 };
// [path, needs the wallet, what to do before measuring]
const ROUTES = [
  ['/', false], ['/', true, 'pet'], ['/adopt', true], ['/claim', true], ['/mint', true], ['/tung', true], ['/thiccums', true],
  ['/pets', false], ['/pets?pet=frok', false], ['/leaderboard', false], ['/stats', false], ['/shop', true], ['/shop/jewish', true],
  ['/shop/habibi', true], ['/pfps', false], ['/nft', false], ['/faq', false], ['/refer', true], ['/inversebrah/pet/3', false],
  ['/pet/82440', false], ['/tung/pet/9', false], ['/u/lord', false], ['/emotown', false],
];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SHEETS = process.env.SHEETS !== '0';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [path, wallet, mode] of ROUTES) {
  if (only && !only.has(path)) continue;
  for (const w of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: HEIGHT[w] ?? 844, deviceScaleFactor: SHEETS ? 1 : 2, isMobile: true, hasTouch: true });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|wss:/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    if (wallet) await page.evaluateOnNewDocument((addr) => {
      window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
        if (method === 'eth_chainId') return '0x8f';
        if (/^eth_send|sign|wallet_/.test(method)) throw Object.assign(new Error('read-only audit'), { code: 4001 });
        const r = await fetch('https://rpc.monad.xyz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        return (await r.json()).result;
      } };
      try { localStorage.setItem('emogotchi.wallet', 'injected'); } catch { /* */ }
    }, WHO);
    const t0 = Date.now();
    try { await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 }); } catch (e) { errors.push('goto: ' + String(e).slice(0, 120)); }
    if (mode === 'pet') await page.waitForSelector('.petview', { timeout: 30000 }).catch(() => errors.push('no pet view'));
    await sleep(2500);
    const loadMs = Date.now() - t0;
    const m = await page.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const name = (e) => { const c = (typeof e.className === 'string' ? e.className : e.className?.baseVal ?? '').trim().split(/\s+/).slice(0, 2).join('.'); const t = (e.innerText ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30); return `${e.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` "${t}"` : ''}`; };
      // inside something that scrolls sideways on purpose (a tab row, a chip row) is fine
      const inScroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.getBoundingClientRect().right <= W + 1) return true; } return false; };
      const out = { sideways: document.documentElement.scrollWidth - W, wide: [], small: [], tiny: [], clipped: [], overlap: [], fixed: [] };
      const all = [...document.body.querySelectorAll('*')];
      for (const e of all) {
        if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if ((r.right > W + 1 || r.left < -1) && vis(e) && !inScroller(e) && !e.closest('.world, .stage, .town, .prop')) out.wide.push(`${name(e)} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      const taps = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], summary')].filter((e) => vis(e) && !e.disabled);
      for (const e of taps) {
        const r = e.getBoundingClientRect();
        if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
        // a link inside running text is fine small; anything standing on its own must be a finger wide
        const inText = e.tagName === 'A' && e.parentElement && /^(P|LI|SPAN|SMALL|TD|DD)$/.test(e.parentElement.tagName) && (e.parentElement.innerText ?? '').length > (e.innerText ?? '').length + 12;
        if (!inText && (r.height < 36 || r.width < 36)) out.small.push(`${name(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i].getBoundingClientRect(), b = taps[j].getBoundingClientRect();
        if (taps[i].contains(taps[j]) || taps[j].contains(taps[i])) continue;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 4 && iy > 4) out.overlap.push(`${name(taps[i])} x ${name(taps[j])}`);
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const e = n.parentElement; if (!e || seen.has(e) || !n.textContent.trim() || e.closest('svg, .world')) continue;
        seen.add(e);
        if (!vis(e)) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 11.5) out.tiny.push(`${name(e)} ${fs}px`);
        const s = getComputedStyle(e);
        if (e.scrollWidth > e.clientWidth + 1 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && e.clientWidth > 0) out.clipped.push(`${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
      }
      for (const e of all) {
        const s = getComputedStyle(e);
        if ((s.position === 'fixed' || s.position === 'sticky') && vis(e)) { const r = e.getBoundingClientRect(); const area = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)) / (W * H); if (area > 0.02) out.fixed.push(`${name(e)} ${(area * 100).toFixed(0)}%`); }
      }
      const dedupe = (a) => [...new Set(a)].slice(0, 14);
      for (const k of ['wide', 'small', 'tiny', 'clipped', 'overlap', 'fixed']) out[k] = dedupe(out[k]);
      out.height = document.documentElement.scrollHeight;
      return out;
    });
    const tag = `${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}${wallet ? '-w' : ''}-${w}`;
    await page.screenshot({ path: `${OUT}/${tag}.png` });
    // the whole page as a contact sheet: a screen at a time down the page (a full-page capture repeats sticky parts and
    // lies about fixed ones), side by side, for a person to read
    if (SHEETS) {
      const H = HEIGHT[w] ?? 844; const shots = [];
      for (let y = 0, i = 0; i < 12 && y < m.height; y += Math.round(H * 0.85), i++) {
        await page.evaluate((top) => window.scrollTo(0, top), y); await sleep(350);
        shots.push((await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 70 })));
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const sheet = await browser.newPage();
      const cols = Math.min(shots.length, 6);
      await sheet.setViewport({ width: cols * (w + 8), height: Math.ceil(shots.length / cols) * (H + 8), deviceScaleFactor: 1 });
      await sheet.setContent(`<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px">${shots.map((b) => `<img src="data:image/jpeg;base64,${b}" style="width:${w}px;height:${H}px">`).join('')}</body>`);
      await sheet.screenshot({ path: `${OUT}/${tag}-sheet.jpg`, type: 'jpeg', quality: 72, fullPage: true });
      await sheet.close();
    }
    report.push({ path, wallet, w, loadMs, errors, ...m });
    const n = (k) => m[k].length;
    console.log(`${path.padEnd(22)} ${wallet ? 'w' : ' '} ${w}  side ${m.sideways}  wide ${n('wide')}  small ${n('small')}  tiny ${n('tiny')}  clip ${n('clipped')}  overlap ${n('overlap')}  fixed ${n('fixed')}  err ${errors.length}  ${loadMs}ms`);
    await page.close();
  }
}
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
