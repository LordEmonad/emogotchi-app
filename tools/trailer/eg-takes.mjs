// The Emonadgotchi trailer's takes (tools/trailer/eg-timeline.mjs cuts them): Emonad as a pet, filmed from his lab
// (/emonadgotchi/lab, DEV only), every look and room set by the lab's own URL or pressed on its own chips mid-take.
//   RAW=trailer/emonad/raw BASE=http://127.0.0.1:5394 JOBS=3 node tools/trailer/shots.mjs eg-…
// (the build: trailer/emonad/dist, made with build-config.mjs and served by tools/serve-dist.mjs; see lib.mjs)
// The lab's stage is never wider than 702 x 538 css px, so a take's sharpness is its dpr: 3 (a 16:9 cut of the room fills
// 1920 wide). He is tall (1.35 the room's pet): a whole pet is shown as a print of the whole room (emo-timeline.mjs SF).

const LAB = (q = '') => `/emonadgotchi/lab?moods=0${q}`;
// (the capture build makes every room audible, so each would show its speaker and mixer in the corner)
const QUIET = '.snd, .sound-pill, [class*="snd-"] { display: none !important; }';
const PRESS = "const press = (label) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label); if (!b) throw new Error('no chip ' + label); b.click(); };";
const room = (q, action, { ms = 6000, rate = 0.08, tail = 500, dpr = 3, css = '', prep = '', ...o } = {}) => ({
  path: LAB(q), w: 900, h: 760, dpr, ms, rate, tail, css: QUIET + css,
  ready: '!!window.__lab?.emonad',
  // (he stays put: nothing wanders off between the takes' moments)
  prep: `const d = window.__lab.emonad; d.wanderEnabled = false; ${PRESS} ${prep}`,
  clip: '.stage',
  idle: 'window.__lab.emonad.isBusy === false',
  action: `const d = window.__lab.emonad; const wait = (ms) => window.__tw.wait(ms); ${PRESS} ${action}`,
  ...o,
});
const NUZZLE = 'await wait(500); await d.pet(1, { quick: true }); await wait(900);';
const EMO = '&costume=emofit&head=beanie&lip=1';
const HAB = '&costume=bisht&head=keffiyeh';
// (a room's scenery is a chunk loaded the first time it is chosen, and the room shows empty for a moment while it comes:
// every room is chosen once before filming)
const WARM = "for (const r of ['Spooky theme', 'Backrooms', 'Western Wall', 'Majlis', 'Emo bedroom']) { press(r); await new Promise((ok) => setTimeout(ok, 900)); }";

export const EG = {
  // the cold open: him alone in the emo bedroom at night, sad, the rain on the window
  'eg-intro': room('&scene=emoroom&night=1&sad=1', 'await wait(8200);', { ms: 8200 }),
  // the hero: in the plain room by day, a nuzzle and a smile (and his face for the end card)
  'eg-hero': room('', NUZZLE + ' await wait(1200);', { ms: 4600 }),
  // the care loop, each its whole action
  'eg-feed': room('', 'await wait(300); await d.feed(); await wait(300);', { ms: 11400 }),
  'eg-play': room('&scene=emoroom', 'await wait(300); await d.play(); await wait(300);', { ms: 8200 }),
  'eg-wash': room('', 'await wait(300); await d.wash(); await wait(300);', { ms: 9200 }),
  'eg-sleep': room('&night=1', 'await wait(300); await d.sleep(); await wait(4200);', { ms: 7600 }),
  // the death: he goes, the grave, the ghost with its halo; then he is brought back
  'eg-die': room('&night=1&scene=halloween', 'await wait(300); await d.die(); await wait(2600);', { ms: 7000 }),
  'eg-revive': room('&night=1&scene=halloween', 'await wait(300); await d.revive(); await wait(800);', { ms: 5200,
    prep: 'await d.die(); await new Promise((ok) => setTimeout(ok, 1500));' }),
  // FIT CHECK: a look every 1050 ms (three beats) from 1 s, pressed on the lab's own chips, the last the golden bisht
  'eg-fit': room('', `await wait(1000);
    press('Witch outfit'); await wait(1050);
    press('Pumpkin'); await wait(1050);
    press('Mummy'); await wait(1050);
    press('Zombie'); await wait(1050);
    press('Emo fit'); press('Beanie'); press('Lip piercings'); await wait(1050);
    press('Emo fit'); press('Lip piercings'); press('Kippah'); press('Star of David'); await wait(1050);
    press('Star of David'); press('Bisht'); press('Keffiyeh'); await wait(1050);
    press('Crown off'); await wait(600); await d.pet(1, { quick: true }); await wait(900);`, { ms: 10600 }),
  // EVERY ROOM: he walks across and back while the room changes every 1050 ms
  'eg-rooms': room('&scene=halloween&night=1', `const walking = (async () => { await wait(200); await d.walk(170); await d.walk(430); })();
    await wait(1050); press('Backrooms'); press('Night');
    await wait(1050); press('Western Wall');
    await wait(1050); press('Majlis'); press('Day');
    await wait(1050); press('Emo bedroom');
    await walking; await wait(600);`, { ms: 7400, prep: WARM + " press('Spooky theme'); await new Promise((ok) => setTimeout(ok, 1200));" }),
  // the guitar, in the full emo look in his bedroom at night: it falls, he picks it up, plays the riff, throws it
  'eg-guitar': room(`&scene=emoroom&night=1${EMO}&toy=guitar`, 'await d.play();', { ms: 16500, tail: 300 }),
  // the other items, each in its pack's room and dress
  'eg-darbuka': room(`&scene=majlis&night=1${HAB}&toy=darbuka`, 'await wait(200); await d.play(); await wait(300);', { ms: 9600 }),
  'eg-dreidel': room('&scene=kotel&head=kippah&star=1&toy=dreidel', 'await wait(200); await d.play(); await wait(300);', { ms: 9800 }),
  'eg-falcon': room(`&scene=majlis${HAB}&pet=falcon`, 'await wait(200); await d.pet(1); await wait(300);', { ms: 9200 }),
  'eg-selfie': room(`&scene=emoroom&night=1${EMO}&pet=selfie`, 'await wait(200); await d.pet(1); await wait(300);', { ms: 8200 }),
};
// IN GOLD: five crowned looks, a nuzzle each (a grid of five prints)
for (const [k, q] of [['witch', '&scene=halloween&night=1&costume=witch'], ['pumpkin', '&scene=backrooms&costume=pumpkin'], ['bisht', `&scene=majlis${HAB}`],
  ['emo', `&scene=emoroom&night=1${EMO}`], ['mummy', '&scene=kotel&costume=mummy']]) {
  EG[`eg-gold-${k}`] = room(`${q}&crown=1`, NUZZLE, { ms: 4200 });
}
// the throw in slow motion: the last chord and the guitar flying, filmed at 180 frames a page second (three times slower
// at 60). `skip` is set from eg-guitar's own last chord (its `guitar.down` with dur >= 2), less half a second.
EG['eg-slow'] = room(`&scene=emoroom&night=1${EMO}&toy=guitar`, 'await d.play();', { ms: 2800, tail: 200, skip: Number(process.env.EG_SLOW_SKIP ?? 11000), fps: 180 });
