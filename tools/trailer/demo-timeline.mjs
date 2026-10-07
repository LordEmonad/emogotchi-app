// The hackathon demo's cut (Monad Metropolis, Track 03): under three minutes, the product running on Monad mainnet.
// A brand-new player on a phone (tools/trailer/demo-live.mjs: real transactions, real waits) carries the middle; the
// site's pages around it (demo-takes.mjs), the same transactions on MonadScan (demo-scan.mjs), the town square's people
// from the private world (world.mjs). No music (the operator lays his own); the pages' own sounds throughout. Every word on
// screen is a draft for the operator. The phone clips are cut from the session's own presses (demo-live-clips.mjs).
//   TIMELINE=tools/trailer/demo-timeline.mjs RAW=trailer/demo/raw DIST=trailer/demo/dist node tools/trailer/render.mjs stills <dir> mid
//   TIMELINE=tools/trailer/demo-timeline.mjs RAW=trailer/demo/raw DIST=trailer/demo/dist node tools/trailer/render.mjs video "$PWD/trailer/demo/emogotchi-demo-1080p60.mp4"
import { sessionClips, SCAN, mark } from './demo-live-clips.mjs';

export const BEAT = 30;   // half a second: clips are counted in beats only for convenience; nothing is cut to music
const LIMIT = Number(process.env.LIMIT ?? 179);   // seconds: the hackathon's three minutes, with a second to spare (LIMIT= to look over it)

export const FACES = ['social/av/content-crown.webp', 'social/av/inversebrah/content-crown.webp', 'social/av/sahur/content-crown.webp', 'social/av/thiccums/content-crown.webp', 'social/av/r3tards/content-crown.webp', 'social/av/emonad/content-crown.webp'];
const RING = [0.146, 0.02, 0.848, 0.98];   // the fight's window on the Fight Club page

function clips() {
  const { signup, shop, care } = sessionClips();
  // the pets, each doing its own thing, a beat and a half each: the hit lands on the second beat of the three
  // (the top 7% of a room is the lab's sound button; no pet reaches it in these clips)
  const ROOM = [0, 0.07, 1, 1];
  const room = (take, from, chip) => ({ id: `open-${chip.replace(/\W+/g, '').toLowerCase()}`, layout: 'room', beats: 3, take, from, chip, crop: ROOM });
  return [
    // ---- cold open: the pets ----
    room('pet-cat', 7.0, 'the cat'),
    room('pet-frok', 0.9, 'inversebrah'),
    room('pet-sahur', 2.0, 'Tung Tung Tung Sahur'),
    room('pet-thicc', 0.0, 'Thiccums'),
    room('pet-r3', 5.0, 'r3tard'),
    room('eg-feed', 2.4, 'Emonad'),
    { id: 'open', layout: 'card', beats: 5, logo: true, sub: ['A tamagotchi that lives on Monad.', 'All of it on chain, even the picture.'] },

    // ---- what it is ----
    { id: 'home', layout: 'full', beats: 9, take: 'demo-home', from: 0.3, title: 'Keep a pet alive.', sub: 'Feed it, wash it, play with it, put it to bed. Each one is a Monad transaction.' },
    { id: 'why', layout: 'card', beats: 6, kicker: 'THE IDEA', title: ['Communities have mascots.', '*Now they have pets.'], sub: ['Something to look after every day,', 'with everyone else doing the same.'] },
    // (the page's two rows of cards, each held whole: demo-takes.mjs)
    { id: 'adopt', layout: 'full', beats: 15, take: 'demo-adopt', from: 1.4, title: 'Six pets, five of them free.', sub: 'Each one its own contract. Mint one, name it, keep it alive.' },

    // ---- a brand-new player, no wallet ----
    { id: 'join', layout: 'card', beats: 5, title: ['A new player.', '*No wallet.'], sub: 'Everything that follows is real, on Monad mainnet.' },
    ...signup,
    { id: 'scan-mint', layout: 'scan', beats: 9, take: 'scan-mint', title: 'The same mint,', sub: 'on MonadScan. Token #47, in a block in 0.2 s.', marks: [mark(SCAN.action, 500), mark(SCAN.status, 1100), mark(SCAN.token, 1700)], focus: [0.2, 0], zoom: [1, 1.04] },

    // ---- his room, then looking after him in it: each a transaction ----
    ...shop,
    ...care,
    { id: 'scan-feed', layout: 'scan', beats: 8, take: 'scan-feed', title: 'Feed, on MonadScan.', sub: 'The whole fee: under a tenth of a cent.', marks: [mark(SCAN.call, 500), mark(SCAN.fee, 1300)], focus: [0.2, 0], zoom: [1, 1.04] },

    // ---- what makes it a game ----
    { id: 'die', layout: 'room', beats: 8, take: 'life-die', from: 0.0, crop: ROOM, side: 'right', kicker: 'ONLY HUNGER KILLS', title: ['Forget it,', '*and it dies.'], sub: ['48 hours after', 'its last meal.'] },
    { id: 'dead', layout: 'full', beats: 9, take: 'demo-dead', from: 0.1, title: '82,000 cats starved in five minutes.', sub: 'Reviving one costs 1,000 MON.' },
    { id: 'nft', layout: 'full', beats: 9, take: 'demo-nft', from: 0.1, title: 'Its picture is on chain too.', sub: 'tokenURI draws it from SVG in the contract, mood by mood.' },
    { id: 'stats', layout: 'full', beats: 9, take: 'demo-stats', from: 0.6, title: 'Care burns $EMO.', sub: '80% of every paid action buys $EMO and burns it. Over 600,000 so far.' },

    // ---- together ----
    { id: 'town', layout: 'full', beats: 12, take: 'demo-town', from: 0.4, title: 'Emotown.', sub: 'Every pet looked after today, out on one street.' },
    { id: 'chat', layout: 'full', beats: 13, take: 'town-chat', from: 2.0, title: 'The town square.', sub: 'Sign in with Ethereum. What you say floats over your pet.' },
    { id: 'fight', layout: 'room', beats: 12, take: 'demo-fight', from: 5.4, crop: RING, h: 900, side: 'left', textOut: true, kicker: 'FIGHT CLUB', title: ['Pet against', '*pet.'], sub: ['50 MON a side: a real fight', 'from the record.'] },
    { id: 'fight-ko', layout: 'room', beats: 11, take: 'demo-fight', from: 15.6, crop: RING, h: 900, side: 'left', kicker: 'FIGHT CLUB', title: ['Pyth Entropy', '*picks the winner.'], sub: ['The winner takes the pot,', 'less 5%.'] },

    // ---- for the technical judges ----
    { id: 'tech', layout: 'list', beats: 16, kicker: 'UNDER THE HOOD', title: 'Under the hood.', itemSize: 46, items: [
      { head: 'Six games, six contracts.', tail: 'ERC-721, ownerless and immutable, verified on Sourcify.' },
      { head: 'Art from the contract.', tail: 'tokenURI draws each mood as SVG. No server, no IPFS.' },
      { head: 'Passkey accounts.', tail: 'mera by Category Labs, plus a 0.5 MON starter for gas.' },
      { head: 'Provably fair fights.', tail: 'Pyth Entropy on Monad. Items are ERC-1155 behind on-chain gates.' },
      { head: 'Built for Monad\'s pace.', tail: '82,423 cats airdropped in eight minutes. One Multicall3 read per page.' },
    ] },

    // ---- the end ----
    { id: 'end', layout: 'end', beats: 12, faces: FACES, sub: ['Live on Monad mainnet.', 'github.com/LordEmonad/emogotchi-app'], url: 'emogotchi.emonad.lol' },
  ];
}

/** clips laid end to end; refuses a cut longer than `limit` seconds */
export function lay(list, limit = Infinity) {
  let at = 0;
  const out = list.map((c) => {
    const start = Math.round(at * BEAT);
    at += c.beats;
    const len = Math.round(at * BEAT) - start;
    return { ...c, start, len, lenMs: len * 1000 / 60 };
  });
  const frames = Math.round(at * BEAT);
  if (frames / 60 > limit) throw new Error(`the cut is ${(frames / 60).toFixed(1)} s, over its ${limit} s`);
  return { fps: 60, frames, clips: out };
}
export const build = () => lay(clips(), LIMIT);
