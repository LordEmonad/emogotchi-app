// The short, to share anywhere (operator, 2026-10-06: "just the mera wallet sign up, minting, claiming the backrooms and
// equiping and using the pet with the pop ups"): the same real session as the hackathon demo (demo-live.mjs, cut by
// demo-live-clips.mjs), nothing else. Under X's 2:20. The pages' own sounds, no music. Every word is a draft.
//   TIMELINE=tools/trailer/demo-short.mjs RAW=trailer/demo/raw DIST=trailer/demo/dist node tools/trailer/render.mjs video "$PWD/trailer/demo/emogotchi-short-1080p60.mp4"
import { sessionClips, SCAN, mark } from './demo-live-clips.mjs';
import { lay, FACES } from './demo-timeline.mjs';

export const BEAT = 30;

function clips() {
  const { signup, shop, care } = sessionClips();
  return [
    { id: 'open', layout: 'card', beats: 6, logo: true, sub: ['A pet that lives on Monad.', 'No wallet needed.'] },
    ...signup,
    { id: 'scan-mint', layout: 'scan', beats: 9, take: 'scan-mint', title: 'The same mint,', sub: 'on MonadScan.', marks: [mark(SCAN.action, 500), mark(SCAN.status, 1100), mark(SCAN.token, 1700)], focus: [0.2, 0], zoom: [1, 1.04] },
    ...shop,
    ...care,
    { id: 'end', layout: 'end', beats: 12, faces: FACES, sub: ['Get a pet, free. Live on Monad mainnet.'], url: 'emogotchi.emonad.lol' },
  ];
}
export const build = () => lay(clips(), 139);
