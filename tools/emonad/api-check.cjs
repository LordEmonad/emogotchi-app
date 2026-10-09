// node tools/emonad/api-check.cjs : the rig as a library, headless: walks retargeted ahead and behind, a turn mid-walk,
// a walk from the front, moves overlapping a walk (no foot pops), turns and waits stepped by hand, chained moves landing on
// the exact frame, two seeded rigs identical, destroy/setFacing/reset settling everything, bad input refused, the idle
// loop closing exactly, footfall events, stops graceful and hard, the cost of making a rig, spins. Prints each check, then
// "N/N passed". Run it after any change to apps/web/src/emonad/rig.ts or moves.ts. BASE: a page with the lab (default
// 127.0.0.1:5334: a frozen development build on tools/serve-dist.mjs; a dev server works when nothing is being saved).
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:5334';
const SUITE = String.raw`
const lab = window.__emonad; lab.stop();
const Rig = lab.constructor;
const svg = lab.el.ownerSVGElement;
const res = {};
const make = (o = {}) => { const r = new Rig({ autoplay: false, seed: 1, ...o }); svg.append(r.el); r.x = 600; r.y = 700; r.scale = 1; r.step(0); return r; };
const tick = () => new Promise((r) => setTimeout(r, 0));
// step for sec seconds at 60 fps, a microtask yield (and a macrotask every 10 frames) between frames; track the feet
async function run(r, sec, track) {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    r.step(1 / 60);
    await null;
    if (track) {
      const b = r.bonesNow(); const fl = b.find((q) => q.bone === 'footL'), fr = b.find((q) => q.bone === 'footR');
      if (track.prev && !r.turning && !track.prevTurning) for (const [k, q] of [['L', fl], ['R', fr]]) { const pq = track.prev[k]; const d = Math.hypot(q.x - pq.x, q.y - pq.y); if (d > track.max) { track.max = d; track.at = r.now.toFixed(3); } }
      track.prev = { L: fl, R: fr }; track.prevTurning = r.turning;
      if (!Number.isFinite(r.x)) track.nan = true;
    }
    if (i % 10 === 0) await tick();
  }
}
const settle = (p) => { const o = { v: undefined, done: false }; p.then((v) => { o.v = v; o.done = true; }); return o; };

// 1 retarget ahead
{ const r = make(); const tr = { max: 0 }; const a = settle(r.walkTo(900)); await run(r, 1.2, tr); const b = settle(r.walkTo(1050)); await run(r, 9, tr);
  res.retargetAhead = { a: a.v, aDone: a.done, b: b.v, x: +r.x.toFixed(2), facing: r.facing, walking: r.isPlaying('walk'), footMax: +tr.max.toFixed(2), at: tr.at, nan: !!tr.nan }; r.destroy(); }
// 2 retarget behind
{ const r = make(); const tr = { max: 0 }; const a = settle(r.walkTo(900)); await run(r, 1.2, tr); const b = settle(r.walkTo(400)); await run(r, 12, tr);
  res.retargetBehind = { a: a.v, b: b.v, bDone: b.done, x: +r.x.toFixed(2), facing: r.facing, walking: r.isPlaying('walk'), footMax: +tr.max.toFixed(2), at: tr.at }; r.destroy(); }
// 3 a turn mid-walk
{ const r = make(); const tr = { max: 0 }; const a = settle(r.walkTo(1000, { face: null })); await run(r, 1.0, tr); const t = settle(r.turnTo('front')); await run(r, 5, tr);
  res.turnMidWalk = { walk: a.v, walkDone: a.done, turn: t.v, x: +r.x.toFixed(2), facing: r.facing, walking: r.isPlaying('walk'), footMax: +tr.max.toFixed(2) }; r.destroy(); }
// 4 play('walk') from the front
{ const r = make(); const a = settle(r.play('walk', { to: 800 })); await run(r, 6);
  res.walkFromFront = { v: a.v, done: a.done, x: +r.x.toFixed(2), facing: r.facing }; r.destroy(); }
// 5 sigh during a walk
{ const r = make(); const tr = { max: 0 }; r.walkTo(1000, { face: null }); await run(r, 1.1, tr); r.play('sigh'); await run(r, 4, tr);
  res.sighWalk = { footMax: +tr.max.toFixed(2), at: tr.at, x: +r.x.toFixed(2) }; r.destroy(); }
// 6 march then headbang; dance then stopAll
{ const r = make(); const tr = { max: 0 }; r.play('march'); await run(r, 1.3, tr); r.play('headbang'); await run(r, 2, tr); res.marchHeadbang = { footMax: +tr.max.toFixed(2), at: tr.at }; r.destroy(); }
{ const r = make(); const tr = { max: 0 }; r.play('dance'); await run(r, 2.1, tr); r.stopAll(); await run(r, 1, tr); res.danceStop = { footMax: +tr.max.toFixed(2), at: tr.at, playing: r.isPlaying() }; r.destroy(); }
// 7 turnTo starts synchronously
{ const r = make(); r.turnTo('back'); for (let i = 0; i < 60; i++) r.step(1 / 60); res.syncTurn = r.facing; r.destroy(); }
// 8 wait by hand
{ const r = make(); let done = false; r.wait(1).then(() => { done = true; }); for (let i = 0; i < 61; i++) { r.step(1 / 60); await null; } res.waitByHand = done; r.destroy(); }
// 9 chains are frame-exact
{ const r = make(); let tEnd = 0; (async () => { await r.play('nod'); await r.play('nod'); tEnd = r.now; })(); for (let i = 0; i < 200; i++) { r.step(1 / 60); await null; await null; } res.chainEnd = +tEnd.toFixed(4); r.destroy(); }
// 10 determinism
{ const a = make({ seed: 7 }), b = make({ seed: 7 });
  for (let i = 0; i < 700; i++) { a.step(1 / 60); b.step(1 / 60); }
  const norm = (r) => r.el.innerHTML.replace(/emo[a-z0-9]+-/g, 'X-');
  res.deterministic = norm(a) === norm(b); a.destroy(); b.destroy(); }
// 11 destroy settles
{ const r = make(); const t = settle(r.turnTo('back')); r.step(1 / 60); r.destroy(); await null; await null; const p = settle(r.play('wave')); await null; await null; res.destroy = { turn: t.v, turnDone: t.done, play: p.v, playDone: p.done }; }
// 12 setFacing drops queued turns
{ const r = make(); r.turnTo('back'); r.turnTo('front'); r.step(1 / 60); r.setFacing('sideL'); await run(r, 3); res.setFacingDrops = r.facing; r.destroy(); }
// 13 bad facing throws
{ const r = make(); try { r.turnTo('left'); res.badFacing = 'no throw'; } catch (e) { res.badFacing = 'throws'; } r.destroy(); }
// 14 a step(0) does not flick the hair
{ const a = make({ seed: 3 }), b = make({ seed: 3 });
  a.walkTo(1000, { face: null }); b.walkTo(1000, { face: null });
  let worst = 0;
  for (let i = 0; i < 200; i++) { a.step(1 / 60); b.step(1 / 60); if (i === 90) b.step(0); await null; worst = Math.max(worst, Math.abs(a.hair.k - b.hair.k)); }
  res.step0Hair = +worst.toFixed(4); a.destroy(); b.destroy(); }
// 15 reused opts object
{ const r = make(); const o = { to: 800 }; const p1 = settle(r.play('walk', o)); await run(r, 6); const x1 = r.x; o.to = 600; const p2 = settle(r.play('walk', o)); await run(r, 6);
  res.reusedOpts = { x1: +x1.toFixed(1), x2: +r.x.toFixed(1), p1: p1.v, p2: p2.v }; r.destroy(); }
// 16 numeric guards
{ const r = make(); r.scale = 0; r.walkTo(800); await run(r, 3); r.scale = 1; r.step(-0.5); r.step(NaN); await run(r, 1); res.guards = { x: r.x, finite: Number.isFinite(r.x), facing: r.facing }; r.destroy(); }
// 17 construction cost
{ const ts = []; for (let i = 0; i < 4; i++) { const t0 = performance.now(); const r = new Rig({ autoplay: false }); ts.push(+(performance.now() - t0).toFixed(1)); r.destroy(); } res.makeMs = ts; }
// 18 events
{ const r = make(); const ev = []; r.onEvent = (e) => ev.push(e.type + (e.foot ? ':' + e.foot : '') + (e.name ? ':' + e.name : '')); r.walkTo(800); await run(r, 6); res.events = ev.slice(0, 12).concat(['…', ev.length]); r.destroy(); }
// 19 a graceful stop mid-walk, and a hard one
{ const r = make(); const tr = { max: 0 }; const a = settle(r.walkTo(1100, { face: null })); await run(r, 1.3, tr); const x0 = r.x; r.stopAll(); await run(r, 3, tr);
  res.stopGraceful = { walk: a.v, x0: +x0.toFixed(1), x: +r.x.toFixed(1), went: +(r.x - x0).toFixed(1), footMax: +tr.max.toFixed(2), walking: r.isPlaying('walk') }; r.destroy(); }
{ const r = make(); const tr = { max: 0 }; r.walkTo(1100, { face: null }); await run(r, 1.3, tr); const x0 = r.x; r.stopAll({ now: true }); await run(r, 2, tr);
  res.stopNow = { went: +(r.x - x0).toFixed(1), footMax: +tr.max.toFixed(2), walking: r.isPlaying('walk') }; r.destroy(); }
// 20 walk then march (march waits for the walk's last step); march then walk
{ const r = make(); const tr = { max: 0 }; r.walkTo(1100, { face: null }); await run(r, 1.3, tr); const m = settle(r.play('march')); await run(r, 0.2, tr); const marchingEarly = r.isPlaying('march'); await run(r, 3, tr);
  res.walkThenMarch = { marchingEarly, marching: r.isPlaying('march'), walking: r.isPlaying('walk'), footMax: +tr.max.toFixed(2) }; r.destroy(); }
{ const r = make(); const tr = { max: 0 }; r.setFacing('quarterR'); r.play('march'); await run(r, 1.5, tr); const w = settle(r.walkTo(900)); await run(r, 8, tr);
  res.marchThenWalk = { w: w.v, x: +r.x.toFixed(1), facing: r.facing, footMax: +tr.max.toFixed(2), playing: r.isPlaying() }; r.destroy(); }
// 21 the idle loop closes exactly
{ const r = make(); r.idlePeriod = 3.8; r.reset(); const snap = () => r.el.innerHTML.replace(/emo[a-z0-9]+-/g, 'X-');
  for (let i = 0; i < 228; i++) r.step(3.8 / 114); const A = snap(); for (let i = 0; i < 114; i++) r.step(3.8 / 114); const B = snap();
  // (compare every number written: transforms and d's)
  const nums = (s) => (s.match(/-?\d+\.?\d*/g) || []).map(Number); const na = nums(A), nb = nums(B); let worst = 0; for (let i = 0; i < Math.min(na.length, nb.length); i++) worst = Math.max(worst, Math.abs(na[i] - nb[i]));
  res.idleLoop = { sameLength: na.length === nb.length, worst: +worst.toFixed(4) }; r.destroy(); }
// 22 march footfalls
{ const r = make(); r.setFacing('front'); const ev = []; r.onEvent = (e) => { if (e.type === 'footDown') ev.push(e.foot + '@' + r.now.toFixed(2)); }; r.play('march'); await run(r, 3.05); r.stopAll(); await run(r, 0.5); res.marchSteps = ev; r.destroy(); }
// 23 retarget during the walk's own turn at the start, to the other side
{ const r = make(); const a = settle(r.walkTo(900)); await run(r, 0.15); const b = settle(r.walkTo(300)); await run(r, 10);
  res.retargetWhileTurning = { a: a.v, b: b.v, x: +r.x.toFixed(1), facing: r.facing }; r.destroy(); }
// 24 spins: once round each way, ending where he started; twice round; to a facing; a spin asked for mid-walk; the
// angle never going back the wrong way or jumping; the events
{ const r = make(); const ev = []; r.onEvent = (e) => { if (e.type.startsWith('turn')) ev.push(e.type); };
  const seen = []; let back = 0, jump = 0, prev = null;
  const a = settle(r.spin());
  for (let i = 0; i < 200; i++) { r.step(1 / 60); await null; if (r.turn) { const th = r.turn.body.th; if (prev !== null) { if (th < prev - 0.01 && i < 100) back++; if (Math.abs(th - prev) > 12) jump++; } prev = th; } if (!seen.includes(r.facing)) seen.push(r.facing); }
  res.spinL = { v: a.v, done: a.done, facing: r.facing, seen, back, jump, ev, turning: r.turning }; r.destroy(); }
{ const r = make(); const seen = []; const a = settle(r.spin({ dir: -1 })); for (let i = 0; i < 200; i++) { r.step(1 / 60); await null; if (!seen.includes(r.facing)) seen.push(r.facing); }
  res.spinR = { v: a.v, facing: r.facing, seen }; r.destroy(); }
{ const r = make(); let laps = 0, last = r.facing; const a = settle(r.spin({ turns: 2 }));
  for (let i = 0; i < 320; i++) { r.step(1 / 60); await null; if (r.facing === 'back' && last !== 'back') laps++; last = r.facing; }
  res.spin2 = { v: a.v, facing: r.facing, laps, t: +r.now.toFixed(2) }; r.destroy(); }
{ const r = make(); const a = settle(r.spin({ to: 'sideL' })); await run(r, 5); res.spinTo = { v: a.v, facing: r.facing }; r.destroy(); }
{ const r = make(); const tr = { max: 0 }; r.walkTo(1000, { face: null }); await run(r, 1.0, tr); const a = settle(r.spin()); await run(r, 6, tr);
  res.spinMidWalk = { v: a.v, walking: r.isPlaying('walk'), facing: r.facing, footMax: +tr.max.toFixed(2) }; r.destroy(); }
return res;`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewport({ width: 1200, height: 800 });
  await p.goto(BASE + '/emonad?eyes=0', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__emonad, { timeout: 60000 });
  const r = await p.evaluate(`(async () => { ${SUITE} })()`);
  await b.close();
  // a clean walk's worst foot move per frame is ~7.3 px at scale 1: more is a pop
  const FOOT = 7.6;
  const checks = [
    ['walkTo retargeted ahead: the newer call arrives, the older resolves false', r.retargetAhead.a === false && r.retargetAhead.b === true && r.retargetAhead.x === 1050 && r.retargetAhead.facing === 'front' && !r.retargetAhead.walking],
    ['  ...no foot pops, no NaN', r.retargetAhead.footMax < FOOT && !r.retargetAhead.nan],
    ['walkTo retargeted behind: turns round and arrives', r.retargetBehind.b === true && r.retargetBehind.x === 400 && r.retargetBehind.facing === 'front' && r.retargetBehind.footMax < FOOT],
    ['turnTo mid-walk: the walk takes its last step, then he turns', r.turnMidWalk.turn === true && r.turnMidWalk.walkDone && r.turnMidWalk.facing === 'front' && !r.turnMidWalk.walking && r.turnMidWalk.footMax < FOOT],
    ["play('walk') from the front turns and arrives", r.walkFromFront.done && r.walkFromFront.x === 800],
    ['a sigh during a walk: no foot pop', r.sighWalk.footMax < FOOT],
    ['march then headbang: no foot pop', r.marchHeadbang.footMax < FOOT],
    ['dance then stopAll: no foot drop, stops', r.danceStop.footMax < FOOT && !r.danceStop.playing],
    ['turnTo starts synchronously when stepped by hand', r.syncTurn === 'back'],
    ['wait() resolves on the rig clock when stepped by hand', r.waitByHand === true],
    ['two chained nods end at exactly 2.4 s', r.chainEnd === 2.4],
    ['two rigs with one seed draw identical frames', r.deterministic === true],
    ['destroy settles a pending turn and later plays (false)', r.destroy.turnDone && r.destroy.turn === false && r.destroy.playDone && r.destroy.play === false],
    ['setFacing drops queued turns', r.setFacingDrops === 'sideL'],
    ['a bad facing throws', r.badFacing === 'throws'],
    ['a step(0) does not kick the hair', r.step0Hair < 0.01],
    ['a reused opts object walks again', r.reusedOpts.x1 === 800 && r.reusedOpts.x2 === 600],
    ['scale 0 and broken dt leave him finite', r.guards.finite],
    ['making a rig after the first is quick (< 15 ms)', r.makeMs.every((t) => t < 15)],
    ['events: turns, footfalls, moveEnd', r.events.includes('footDown:r') && r.events.includes('moveEnd:walk') && r.events.includes('turnEnd')],
    ['stopAll mid-walk: last step, feet together, cut short', r.stopGraceful.walk === false && !r.stopGraceful.walking && r.stopGraceful.went > 0 && r.stopGraceful.went < 200 && r.stopGraceful.footMax < FOOT],
    ['stopAll({ now }) mid-walk: holds where he is', r.stopNow.went === 0 && !r.stopNow.walking],
    ['a march asked for mid-walk waits for the last step', r.walkThenMarch.marchingEarly === false && r.walkThenMarch.marching && !r.walkThenMarch.walking && r.walkThenMarch.footMax < FOOT],
    ['march then walkTo', r.marchThenWalk.w === true && r.marchThenWalk.x === 900 && r.marchThenWalk.footMax < FOOT],
    ['idlePeriod: the idle loop closes exactly', r.idleLoop.sameLength && r.idleLoop.worst < 0.011],
    ['march footfalls, one a second each foot', r.marchSteps.length === 6],
    ['walkTo retargeted while still turning at the start', r.retargetWhileTurning.b === true && r.retargetWhileTurning.x === 300],
    ['spin: once round to his left, every drawing, ending where he began', r.spinL.v === true && r.spinL.facing === 'front' && ['front', 'quarterR', 'sideR', 'back', 'sideL', 'quarterL'].every((f) => r.spinL.seen.includes(f)) && r.spinL.seen[1] === 'quarterR' && !r.spinL.turning],
    ['  ...never back and never a jump on the way, turnArrive then turnEnd', r.spinL.back === 0 && r.spinL.jump === 0 && r.spinL.ev.join() === 'turnArrive,turnEnd'],
    ['spin the other way: to his right first', r.spinR.v === true && r.spinR.facing === 'front' && r.spinR.seen[1] === 'quarterL'],
    ['spin twice round', r.spin2.v === true && r.spin2.facing === 'front' && r.spin2.laps === 2],
    ['spin to a facing', r.spinTo.v === true && r.spinTo.facing === 'sideL'],
    ['spin asked for mid-walk: the walk takes its last step first', r.spinMidWalk.v === true && !r.spinMidWalk.walking && r.spinMidWalk.facing === 'sideR' && r.spinMidWalk.footMax < FOOT],
    ['no page errors', errs.length === 0],
  ];
  let ok = 0;
  for (const [name, pass] of checks) { console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`); if (pass) ok++; }
  if (ok < checks.length) console.log(JSON.stringify(r, null, 1), errs.slice(0, 5));
  console.log(`${ok}/${checks.length} passed`);
  process.exit(ok === checks.length ? 0 : 1);
})();
