// The Emonadgotchi trailer's cut (render.mjs with TIMELINE=tools/trailer/eg-timeline.mjs RAW=trailer/emonad/raw
// BOXES=trailer/emonad/boxes.json DIST=trailer/emonad/dist). The emo pack trailers' machinery and look (their beat:
// 350 ms, 21 frames, 171.4 bpm, the riff's own, so his guitar plays in time with the soundtrack), his takes
// (eg-takes.mjs), framed off his measured boxes (eg-boxes.mjs) so he is never cut.
// The story: the face of $EMO, alone in his room; EMONAD IS NOW A PET; the name; feed him, play with him, wash him, put him
// to bed; don't let him die (and bring him back); fit check: every outfit, and in gold; every room; the guitar, the riff,
// the throw in slow motion; every item; the end card. Every word on screen is DRAFT copy the operator has not signed
// off; nothing claims a price, a date or a term (none is decided for him).
import { BEAT, SPB, SF, R, centre, fit, tile, cueAt, cuesOf, riffAt, finaleAt, shutterAt, landing, boxOver } from './emo-timeline.mjs';
import { PIC_AR } from './emo-frame.mjs';

export { boxOver };
export const SAFE = { print: [0.035, 0.045, 0.965, 0.955], caption: [0.44, 0.05, 0.965, 0.95], tile: [0.04, 0.05, 0.96, 0.95] };
const S = (beats, o) => ({ beats, ...o });
const sec = (ms, fb) => (ms === null || ms === undefined ? fb : ms / 1000);

// ---------- moments of his takes, from their own sounds ----------
// feed: the bowl lands in his hands (bowl.drop)
const feedAt = sec(cueAt('eg-feed', 'bowl.drop'), 1.4);
// play: the big kick (the shared play's yarn hit: the second `kick`/`bat` cue, else the third sound after the ball lands)
const kickAt = sec(cueAt('eg-play', 'yarn.kick', 0) ?? cueAt('eg-play', 'kick', 0), 2.6);
// wash: the splash into the tub
const tubAt = sec(cueAt('eg-wash', 'splash') ?? cueAt('eg-wash', 'tub.land'), 1.6);
// sleep: the first snore, else his yawn
const sleepAt = sec(cueAt('eg-sleep', 'voice.yawn'), 0.8);
// the death: the moment he keels (die)
const dieAt = sec(cueAt('eg-die', 'die'), 0.6);
// brought back
const reviveAt = sec(cueAt('eg-revive', 'revive'), 0.3);
// (the shot opens on his ghost; the song's boom lands where he comes back)
const REV0 = Math.max(0, reviveAt - 0.2), REVHIT = Math.round(((reviveAt - REV0) / (SPB / 1000)) * 100) / 100;
// the guitar: it lands, the riff's first stroke, the last chord
const gLand = sec(cueAt('eg-guitar', 'thud'), 1.6);
const gRiff = sec(riffAt('eg-guitar'), 5);
const gEnd = sec(finaleAt('eg-guitar'), 11.6);

// ---------- the end card's face: a circle round his head (his hair and face) at a moment of the hero take ----------
function face(take, s) {
  const b = boxOver(take, s, 0.3, 'head') ?? boxOver(take, s, 0.3) ?? [0.4, 0.2, 0.6, 0.5];
  const hw = Math.max(b[2] - b[0], (b[3] - b[1]) / PIC_AR) / 2;
  return [take, s, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2 + 0.01, hw * 1.08];
}

// ---------- the slow motion: his last chord at speed, then the throw three times slower ----------
const SLOWTAKE = 'eg-slow';
const slowEnd = cuesOf(SLOWTAKE).find((c) => c.name === 'band.end')?.t ?? 500;
const slowFrom = slowEnd / 1000, slowFrom2 = slowFrom + 2 * SPB / 1000;
const slowA = SF(2, 'eg-guitar', gEnd, { print: R(0.8), fill: 0.78, push: 1 });
const slowB = SF(10, 'eg-guitar', gEnd + 0.7, { print: R(0.8), fill: 0.7, push: 1.05, props: true });
const whoosh = cuesOf(SLOWTAKE).find((c) => c.name === 'whoosh' && c.t > slowEnd)?.t ?? 1700;
const releaseBeat = 2 + ((whoosh / 1000 - slowFrom2) * 180) / BEAT;

// ---------- fit check and the rooms: a look (a room) every 1050 ms, three beats, from 1 s into the take ----------
const FIT0 = 1.0 - SPB / 1000;   // the first change lands on the clip's second beat
const LOOKS = ['WITCH', 'PUMPKIN', 'MUMMY', 'ZOMBIE', 'EMO FIT', 'KIPPAH + STAR', 'BISHT + KEFFIYEH', 'IN GOLD'];

const CLIPS = [
  // ---- cold open: a print of him alone in his bedroom at night, sad, the rain; the words beside it ----
  { id: 'intro', dim: 0.08, mute: true, fadeIn: true, ...SF(8, 'eg-intro', 0.6, { print: R(-1.4), fill: 0.66, push: 1.1 }),
    scrawl: [{ text: "he's the face", at: 0.8, x: 116, y: 380, size: 62, rot: -4 }, { text: 'of $EMO.', at: 1.8, x: 150, y: 470, size: 62, rot: -4 },
      { text: 'nobody has ever', at: 4, x: 116, y: 640, size: 62, rot: -3 }, { text: 'fed him.', at: 5, x: 150, y: 730, size: 66, rot: -3, color: '#FF9CC8' }] },
  // ---- the news ----
  { id: 'news', layout: 'title', beats: 8, words: [{ text: 'EMONAD', at: 0 }, { text: 'IS', at: 1 }, { text: 'NOW', at: 2 }, { text: 'A', at: 3 }, { text: 'PET.', at: 4, pink: true }], shake: true },
  { id: 'logo', layout: 'title', beats: 4, logo: { name: 'EMONADGOTCHI', top: null }, glitch: true, flash: true, leak: 70, sub: 'the $EMO mascot, in your wallet.' },

  // ---- the care: a word and a print each, slammed onto the page ----
  { id: 'feed', glitch: true, slam: true, name: ['FEED', 'HIM.'], ...SF(4, 'eg-feed', Math.max(0, feedAt - 0.7), { print: R(1.3), fill: 0.74 }) },
  { id: 'play', glitch: true, slam: true, name: ['PLAY', 'WITH HIM.'], ...SF(4, 'eg-play', Math.max(0, kickAt - 0.9), { print: R(-1.3), fill: 0.72, props: true }) },
  { id: 'wash', glitch: true, slam: true, name: ['WASH', 'HIM.'], ...SF(4, 'eg-wash', Math.max(0, tubAt - 0.75), { print: R(1.3), fill: 0.7 }) },
  { id: 'sleep', glitch: true, slam: true, name: ['PUT HIM', 'TO BED.'], ...SF(4, 'eg-sleep', sleepAt + 0.6, { print: R(-1.3), fill: 0.72 }) },

  // ---- don't let him die ----
  { id: 'die-words', layout: 'title', beats: 4, words: [{ text: "DON'T", at: 0 }, { text: 'LET', at: 1 }, { text: 'HIM', at: 2 }, { text: 'DIE.', at: 3, pink: true }], shake: true },
  { id: 'die', group: 'die', hand: ['only hunger', 'kills.'], sfxGain: 1.4, ...SF(10, 'eg-die', Math.max(0, dieAt - 0.1), { print: R(1.2), fill: 0.66, props: true }) },
  { id: 'revive', flash: true, slam: true, name: ['OR BRING', 'HIM BACK.'], ...SF(10, 'eg-revive', REV0, { print: R(-1.2), fill: 0.66, props: true }) },

  // ---- fit check: every outfit on the beat, then in gold ----
  { id: 'fit', layout: 'fit', head: 'FIT CHECK.', wipe: true, leak: 80, splits: LOOKS.map((_, i) => 1 + i * 3),
    looks: LOOKS.map((text, i) => ({ at: 1 + i * 3, text, gold: i === LOOKS.length - 1 })),
    ...SF(24, 'eg-fit', FIT0, { print: R(1.2), fill: 0.7, push: 1.02 }), layout: 'fit' },
  { id: 'gold', layout: 'grid', beats: 8, stagger: 0.25, mute: true, title: 'IT ALL COMES IN GOLD.', sub: 'wear the crown.',
    tiles: ['witch', 'pumpkin', 'bisht', 'emo', 'mummy'].map((k, i) => tile(`eg-gold-${k}`, 0.9, 8, i, 0.8)) },

  // ---- every room, as he walks across ----
  { id: 'rooms', layout: 'fit', head: 'EVERY ROOM.', wipe: true, splits: [3, 6, 9, 12],
    looks: ['SPOOKY', 'BACKROOMS', 'WESTERN WALL', 'MAJLIS', 'EMO BEDROOM'].map((text, i) => ({ at: i * 3, text })),
    ...SF(16, 'eg-rooms', 0.0, { print: R(-1.2), fill: 0.62, push: 1.0 }), layout: 'fit' },

  // ---- the guitar ----
  { id: 'gtr-in', group: 'gtr-in', title: 'THE GUITAR', sub: ['it falls from the sky.', 'he picks it up.'], wipe: true, mute: ['band.'],
    ...SF(12, 'eg-guitar', Math.max(0, gRiff - 12 * SPB / 1000), { print: R(-1.3), fill: 0.7, props: true, push: 1.03 }) },
  { id: 'riff', pulse: true, slam: true, mute: ['guitar.', 'band.'], name: ['HE', 'SHREDS.'], ...SF(16, 'eg-guitar', gRiff, { print: R(1.4), fill: 0.82 }) },
  { id: 'slow-a', ...slowA, take: SLOWTAKE, from: slowFrom, speed: 3, flash: true, slam: true, mute: true },
  { id: 'slow-b', ...slowB, take: SLOWTAKE, from: slowFrom2, speed: 1, mute: true, tag: 'SLOW MO', tagTop: true, leak: 120 },

  // ---- every item ----
  { id: 'items', layout: 'title', beats: 4, words: [{ text: 'EVERY', at: 0 }, { text: 'ITEM.', at: 1 }, { text: 'ON', at: 2 }, { text: 'HIM.', at: 3, pink: true }] },
  { id: 'darbuka', glitch: true, slam: true, name: ['THE', 'DARBUKA'], mute: ['music.'], sfxGain: 0.8, ...SF(4, 'eg-darbuka', sec(cueAt('eg-darbuka', 'drum.dum', 1), 3.47) - 0.2, { print: R(1.3), fill: 0.7, props: true }) },
  { id: 'dreidel', glitch: true, slam: true, name: ['THE', 'DREIDEL'], ...SF(4, 'eg-dreidel', sec(cueAt('eg-dreidel', 'dreidel.spin'), 3) - 0.4, { print: R(-1.3), fill: 0.66, props: true }) },
  { id: 'falcon', glitch: true, slam: true, name: ['THE', 'FALCON'], ...SF(6, 'eg-falcon', sec(cueAt('eg-falcon', 'pat'), 2.18) - 0.95, { print: R(1.3), fill: 0.66, props: true }) },
  // (the phone drops into his hand on the shot's second beat; the first shutter, its flash, a little over two beats later)
  { id: 'selfie', glitch: true, layout: 'viewfinder', shot: 'IMG_0001', sfxGain: 2, name: ['THE', 'SELFIE'],
    flashes: [Math.round((((shutterAt('eg-selfie', 0) ?? 2304) - (cueAt('eg-selfie', 'catch') ?? 1363)) / SPB + 1) * 100) / 100],
    ...SF(6, 'eg-selfie', sec(cueAt('eg-selfie', 'catch'), 1.36) - SPB / 1000, { print: R(-1.2), fill: 0.74 }), layout: 'viewfinder' },

  // ---- the end ----
  { id: 'end', layout: 'egend', beats: 16, mute: true, kicker: 'COMING SOON', name: 'EMONADGOTCHI', sub: 'the $EMO mascot. your pet.', url: 'emogotchi.emonad.lol',
    face: face('eg-hero', 2.6) },
];

/** The soundtrack (emo-song.js), in film beats. */
const SONG = [
  { at: 0, beats: 8, kind: 'intro' },               // the bedroom: rain and the clean guitar
  { at: 8, beats: 8, kind: 'phase', words: 5 },     // EMONAD IS NOW A PET.: a hit on each word, a roll, a riser
  { at: 16, beats: 20, kind: 'drop' },              // the name and the care: the riff, the hook
  { at: 36, beats: 14, kind: 'dirge', words: 4 },   // don't let him die: low hits, the band gone, a heartbeat
  { at: 50, beats: 10, kind: 'revive', hit: REVHIT },     // brought back: a boom on his return, a riser
  { at: 60, beats: 24, kind: 'drop2' },             // fit check: the riff again, the hook's answer
  { at: 84, beats: 8, kind: 'band' },               // in gold: the chorus's end
  { at: 92, beats: 16, kind: 'verse' },             // every room: palm-muted, the clean guitar over it
  { at: 108, beats: 12, kind: 'pickup' },            // the guitar falls and is picked up: half time, a build
  { at: 120, beats: 16, kind: 'riff' },             // he shreds
  { at: 136, beats: 12, kind: 'slow', hit: 0, release: Math.round(releaseBeat * 100) / 100 },   // the last chord; slow motion; the throw
  { at: 148, beats: 4, kind: 'build' },             // EVERY ITEM. ON HIM.: a fill
  { at: 152, beats: 20, kind: 'verse2', duck: -2 }, // the items
  { at: 172, beats: 16, kind: 'outro' },            // the end card
];

export function build() {
  const flat = CLIPS.map((c) => ({ ...c, first: true }));
  let at = 0;
  const groups = {};
  const clips = flat.map((c) => {
    const start = Math.round(at * BEAT);
    at += c.beats;
    const len = Math.round(at * BEAT) - start;
    if (c.group && groups[c.group] === undefined) groups[c.group] = start;
    return { ...c, start, len, lenMs: len * 1000 / 60, gstart: c.group ? groups[c.group] : start };
  });
  for (const c of clips) if (c.group) c.glen = clips.filter((k) => k.group === c.group).reduce((s, k) => s + k.len, 0);
  return { fps: 60, frames: Math.round(at * BEAT), clips, style: 'emo', beat: BEAT, song: SONG, songLevel: -15, sfxPeak: 0.62 };
}
void S; void fit;
