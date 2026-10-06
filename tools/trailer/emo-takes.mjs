// The emo pack trailer's takes (tools/trailer/emo-timeline.mjs cuts them): every pet in the pack, filmed from the emo
// pack's lab (/emopack, DEV only), whose booth has every piece of the pack on by default (the beanie, the clothes, the
// wristbands, the lip rings), the emo bedroom as its room, the guitar as its toy and the mirror selfie as its Pet move.
//   RAW=trailer/emo/raw BASE=http://127.0.0.1:5393 JOBS=3 node tools/trailer/shots.mjs emo-…
// (the build: trailer/emo/dist, made with build-config.mjs and served by tools/serve-dist.mjs; see lib.mjs)
// The lab's stage is never wider than 702 x 538 css px, so a take's sharpness is its dpr: 3 for a pet in its room
// (a 16:9 cut of it fills 1920 wide), 5 for the close-ups.

const LAB = (who, q = '') => `/emopack?only=${who}&moods=0${q}`;
/** One pet in its room, the stage only. `who` is the lab's handle for its director. */
const room = (who, q, action, { ms = 6000, rate = 0.08, tail = 500, dpr = 3, prep = '' } = {}) => ({
  path: LAB(who, q), w: 900, h: 760, dpr, ms, rate, tail,
  // (the capture build makes every room audible, so each would show its speaker and mixer in the corner)
  css: '.snd, .sound-pill, [class*="snd-"] { display: none !important; }',
  ready: `!!window.__lab?.${who}`,
  // (it stays put: nothing wanders off between the takes' moments)
  prep: `const d = window.__lab.${who}; d.wanderEnabled = false; ${prep}`,
  clip: '.stage',
  idle: `window.__lab.${who}.isBusy === false`,
  action: `const d = window.__lab.${who}; const wait = (ms) => window.__tw.wait(ms); ${action}`,
});
const PETS = [['cat', 'cat'], ['frog', 'frog'], ['sahur', 'sahur'], ['thiccums', 'thicc'], ['r3tards', 'r3']];
const SLOW = { r3tards: 0.05 };   // his own moves stall the page a moment (see shots.mjs pet-r3): filmed slower

export const EMO = {
  // the cold open: the cat alone in the bedroom at night, sad, the rain on the window
  'emo-intro': room('cat', '&night=1&sad=1', 'await wait(7600);', { ms: 7600 }),
};
for (const [who, short] of PETS) {
  const rate = SLOW[who] ?? 0.08;
  // in the whole pack, in the bedroom at night (Sahur crowned: the gold version), a quick nuzzle and a smile
  EMO[`emo-hero-${short}`] = room(who, `&night=1${who === 'sahur' ? '&crown=1' : ''}`, 'await wait(500); await d.pet(1, { quick: true }); await wait(900);', { ms: 4200, rate });
  // the guitar: it falls in, the pet picks it up, plays the riff, throws it off (Thiccums: in his butt)
  EMO[`emo-guitar-${short}`] = room(who, '&night=1', 'await d.play();', { ms: 16500, rate, tail: 300 });
  // the mirror selfie
  EMO[`emo-selfie-${short}`] = room(who, '&night=1', 'await d.pet(1);', { ms: 8200, rate, tail: 300 });
}
// the lip rings up close, through a yawn (they follow the lip as the mouth opens and never grow)
for (const [who, short] of [['frog', 'frog'], ['sahur', 'sahur'], ['r3tards', 'r3'], ['cat', 'cat']]) {
  EMO[`emo-lip-${short}`] = room(who, '&night=1', 'await wait(300); await d.yawn(); await wait(400);', { ms: 3400, rate: SLOW[who] ?? 0.06, dpr: 5 });
}
// the bedroom by day, wide, a pet wandering through it
EMO['emo-room-day'] = room('r3tards', '', 'await wait(400); await d.walk(170); await wait(300); await d.walk(430); await wait(400);', { ms: 7500, rate: 0.05 });
