// The r3tards lab (/r3tards, dev only): is he ever in pieces? He is lines joined at points, so a move that shifts one
// part without its neighbour shows as a split (the operator: "when he shakes his body splits off his legs"). This runs
// every action at full speed and, on EVERY frame, measures in the drawing's own units:
//   hip       how far each leg's root is from the spine's foot
//   shoulder  how far each arm's root is from the spine's shoulder
//   neck      whether the spine's top is still behind the lips (in the head's own space)
//   twins     whether each part's pale-edge twin (r3tards.py build) sits exactly where its part does
// (--page=emopack runs it in the emo pack's lab, the whole pack on)
// and fails on anything past a hair. Dev server on 5263 (tools/thiccums-dev.mjs).   node tools/r3-check.mjs [--base=…] [--query=costume=witch&hair=1] [--lite]
// --lite checks the LAYERED drawing (pet/layers.ts: what every iPhone browser gets in Emotown): there a part is a box, so
// each box gets an empty probe group inside it, which every slot the rig wraps round the box's content carries along.
import puppeteer from 'puppeteer-core';
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const BASE = arg('base', 'http://127.0.0.1:5263');
const ACTS = [['feed', 'd.feed()'], ['play', 'd.play()'], ['pet', 'd.pet(1)'], ['wash', 'd.wash()'], ['poop', 'd.poop()'], ['clean', 'd.clean()'],
  ['sleep', 'd.sleep()'], ['wake', 'd.wake()'], ['walk left', 'd.walk(150)'], ['walk right', 'd.walk(450)'], ['rumble', 'd.rumble()'], ['yawn', 'd.yawn()'],
  ['die', 'd.die()'], ['revive', 'd.revive()']];
const LIMIT = { hip: 0.35, shoulder: 0.35, twins: 0.05 };
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const LITE = process.argv.includes('--lite');
// --page=emopack: the emo pack's lab instead (only him, the whole pack on, the guitar on Play and the selfie on Pet)
const PAGE = arg('page', 'r3tards') === 'emopack' ? '/emopack?only=r3tards&moods=0' : '/r3tards?moods=0';
await page.goto(`${BASE}${PAGE}${LITE ? '&lite=1' : ''}${arg('query', '') ? '&' + arg('query', '') : ''}`, { waitUntil: 'networkidle0' });   // --query=costume=witch&head=keffiyeh…
await page.waitForFunction(() => window.__lab && window.__lab.r3tards, { timeout: 20000 });
await page.evaluate(() => {
  const d = window.__lab.r3tards; d.wanderEnabled = false;
  const lite = !!document.querySelector('.hlab-booth .pet .petroot');
  const svg = lite ? document.querySelector('.hlab-booth .pet .petroot') : document.querySelector('.hlab-booth .pet svg');
  // layered: a part that is a box is measured through a probe group put inside it (same viewBox, same box)
  const probes = new Map();
  const probe = (e) => {
    if (!e || !(e instanceof HTMLElement)) return e;
    if (!probes.has(e)) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', `0 0 ${svg.getAttribute('data-vbw')} ${svg.getAttribute('data-vbh')}`); s.setAttribute('class', 'frag');
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); s.appendChild(g);
      let host = e; while (host.children.length === 1 && host.firstElementChild.classList.contains('slot')) host = host.firstElementChild;
      host.appendChild(s); probes.set(e, g);
    }
    return probes.get(e);
  };
  const raw = (id) => svg.querySelector('#' + id);
  const $ = (id) => probe(raw(id));
  const unit = () => (lite ? Math.abs($('cat').getScreenCTM().a) : Math.abs(svg.getScreenCTM().a)) || 1;
  const HIP = [100, 160], SHOULDER = [100, 122.5], TOP = JSON.parse(raw('body').getAttribute('data-top'));
  const at = (el, [x, y]) => { const m = el.getScreenCTM(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // every twin against its part (the stick's and the face's edges, and the edge of every item worn: r3items.py)
  // (not the lip rings: they are twins of their mouths only to show and fade with them; when a mouth scales, each hoop
  // rides its point of the lip and never grows, so its box is meant to differ from the mouth's: rig.ts followLip)
  const TWINS = [...svg.querySelectorAll('[data-twin]:not(.lipring)')].map((t) => [raw(t.getAttribute('data-twin')), t]).filter(([a]) => a);
  const m = window.__m = { now: '', worst: {} };
  const note = (k, v, extra) => { const w = (m.worst[m.now] ??= {}); if (!(k in w) || v > w[k].v) w[k] = { v, t: Math.round(performance.now() - m.t0), ...extra }; };
  const frame = () => {
    if (m.now) {
      const k = unit();                                                     // screen px per drawing unit
      const hb = at($('body'), HIP);
      note('hip', Math.max(dist(hb, at($('footL'), HIP)), dist(hb, at($('footR'), HIP))) / k);
      const sb = at($('body'), SHOULDER);
      note('shoulder', Math.max(dist(sb, at($('legL'), SHOULDER)), dist(sb, at($('legR'), SHOULDER))) / k);
      // the spine's top, in the head's own space: it must be behind the lips (measured off the lips' outline at the middle: y 81.9..110.9)
      const top = at($('body'), TOP); const inv = $('head').getScreenCTM().inverse();
      const lx = inv.a * top[0] + inv.c * top[1] + inv.e, ly = inv.b * top[0] + inv.d * top[1] + inv.f;
      note('neck', Math.max(0, 82 - ly, ly - 109.5, Math.abs(lx - 100) - 9), { at: [Math.round(lx * 10) / 10, Math.round(ly * 10) / 10] });
      let tw = 0, who = '';
      for (const [a, b] of TWINS) { if (getComputedStyle(a).display === 'none' || getComputedStyle(b).display === 'none') continue;   // (a piece not worn: nothing is drawn, and a hidden element's matrix is not kept up)
        const p = probe(a).getScreenCTM(), q = probe(b).getScreenCTM(); const d = Math.max(Math.abs(p.a - q.a) * 100, Math.abs(p.b - q.b) * 100, Math.abs(p.c - q.c) * 100, Math.abs(p.d - q.d) * 100, Math.abs(p.e - q.e), Math.abs(p.f - q.f));
        if (d > tw) { tw = d; who = b.id; } }
      note('twins', tw / k, { who });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
await new Promise((r) => setTimeout(r, 1200));
for (const [name, call] of ACTS) {
  await page.evaluate(async (name, call) => {
    const d = window.__lab.r3tards; const m = window.__m; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    m.t0 = performance.now(); m.now = name;
    await new Function('d', 'return ' + call)(d);
    await wait(700);
    m.now = '';
  }, name, call);
}
const worst = await page.evaluate(() => window.__m.worst);
await browser.close();
let bad = 0;
for (const [name, w] of Object.entries(worst)) {
  const f = (k) => `${k} ${w[k].v.toFixed(2)}${w[k].v > (LIMIT[k] ?? 0) ? ` ✗ (at ${w[k].t} ms${w[k].at ? ', spine top at ' + w[k].at : ''}${w[k].who ? ', ' + w[k].who : ''})` : ''}`;
  for (const k of ['hip', 'shoulder', 'neck', 'twins']) if (w[k].v > (LIMIT[k] ?? 0)) bad += 1;
  console.log(name.padEnd(11), ['hip', 'shoulder', 'neck', 'twins'].map(f).join('   '));
}
if (errors.length) { console.log('errors:'); for (const e of errors) console.log('  ' + e); }
console.log(bad || errors.length ? `\n${bad} splits, ${errors.length} errors` : '\nin one piece through every action');
process.exit(bad || errors.length ? 1 : 0);
