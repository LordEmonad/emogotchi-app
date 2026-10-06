// The third emo pack trailer's NEW takes (tools/trailer/emo3-timeline.mjs cuts them, with the second's takes from
// emo-takes.mjs): the transformation, the band's cut-outs and the room they are put into, and a throw in slow motion.
//   RAW=trailer/emo/raw BASE=http://127.0.0.1:5393 JOBS=3 node tools/trailer/shots.mjs emo3-…
// (the build: trailer/emo/dist, made with build-config.mjs and served by tools/serve-dist.mjs; see lib.mjs)

const LAB = (who, q = '') => `/emopack?only=${who}&moods=0${q}`;
// (the capture build makes every room audible, so each would show its speaker and mixer in the corner)
const QUIET = '.snd, .sound-pill, [class*="snd-"] { display: none !important; }';
// the room taken away, so only the pet (with its shadow and whatever it holds or throws) is left in the picture, its
// alpha kept (film's `transparent`): the band is five of these put into one room (the plate)
const CUTOUT = `html, body, body *:not(.stage):not(.stage *) { background: transparent !important; background-image: none !important; box-shadow: none !important; }
body::before, body::after, .stage::before, .stage::after { display: none !important; }
.stage { background: transparent !important; box-shadow: none !important; }
.stage .wall, .stage .dots, .stage .stars, .stage .floor, .stage .rug, .stage .moon, .stage .scenery, .stage .thought { display: none !important; }`;
// the room with nobody in it
const EMPTY = '.stage .cathost { visibility: hidden !important; }';
const room = (who, q, action, { ms = 6000, rate = 0.08, tail = 500, dpr = 3, css = '', ...o } = {}) => ({
  path: LAB(who, q), w: 900, h: 760, dpr, ms, rate, tail, css: QUIET + css,
  ready: `!!window.__lab?.${who}`,
  prep: `const d = window.__lab.${who}; d.wanderEnabled = false;`,
  clip: '.stage',
  idle: `window.__lab.${who}.isBusy === false`,
  action: `const d = window.__lab.${who}; const wait = (ms) => window.__tw.wait(ms);
    const press = (label) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label); if (!b) throw new Error('no chip ' + label); b.click(); };
    ${action}`,
  ...o,
});
const SLOW = { r3tards: 0.05 };   // his own moves stall the page a moment: filmed slower

export const EMO3 = {};
const PETS = [['cat', 'cat'], ['frog', 'frog'], ['sahur', 'sahur'], ['thiccums', 'thicc'], ['r3tards', 'r3']];
for (const [who, short] of PETS) {
  const rate = SLOW[who] ?? 0.08;
  // THE TRANSFORMATION: plain, in the plain room by day; then a piece a beat (350 ms apart, from 1.2 s): the beanie and
  // its black hair, the lip rings, the clothes, the wristbands (the cat wears hers already: her beat is the crown of the
  // look, nothing), and on the fifth the room goes dark and turns into the emo bedroom; then a smug little nuzzle
  const steps = ["press('Beanie + hair');", "press('Lip piercings');", "press('Emo clothes');", who === 'cat' ? '' : "press('Wristbands');", "press('Emo bedroom'); press('Day');"];
  // (the bedroom's scenery is a chunk loaded the first time it is chosen, and the room showed empty and dark for a third of
  // a second while it came: so it is chosen once, and the plain room again, before filming)
  EMO3[`emo3-xform-${short}`] = room(who, '&scene=plain&beanie=0&fit=0&wrist=0&lip=0',
    `await wait(1200); ${steps.map((s) => `${s} await wait(350);`).join(' ')} await wait(500); await d.pet(1, { quick: true }); await wait(1200);`,
    { ms: 6400, rate, prep: `const d = window.__lab.${who}; d.wanderEnabled = false;
      const press = (label) => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label).click();
      press('Emo bedroom'); await new Promise((r) => setTimeout(r, 2500)); press('Plain room'); await new Promise((r) => setTimeout(r, 1500));` });
  // THE BAND: the riff, the last chord and the throw, the room taken away (put together in emo3-timeline.mjs). Skipped
  // through to a second and a half before the riff; Thiccums (his landings every 240 ms) filmed at 89.4 frames a page
  // second, so played at 60 he lands every 357 ms, on the song's beat, and his launch on its last chord.
  if (who === 'thiccums') EMO3[`emo3-band-${short}`] = room(who, '&night=1', 'await d.play();', { ms: 7000, rate, tail: 200, skip: 600, fps: 89.4, transparent: true, css: CUTOUT });
  else EMO3[`emo3-band-${short}`] = room(who, '&night=1', 'await d.play();', { ms: 9600, rate, tail: 300, skip: who === 'sahur' ? 5000 : 4400, transparent: true, css: CUTOUT });
}
// the room they are put into: the emo bedroom at night, nobody in it
EMO3['emo3-plate'] = room('cat', '&night=1', 'await wait(12000);', { ms: 12000, css: EMPTY });
// the cat's last chord and her throw in slow motion: 180 frames a page second, three times slower at 60
EMO3['emo3-slow-cat'] = room('cat', '&night=1', 'await d.play();', { ms: 2600, tail: 200, skip: 11300, fps: 180 });
