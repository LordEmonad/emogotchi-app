// Switch the r3tard (r3tardgotchi, the fifth pet) on, once his contract is on chain. Until then his mint page says
// "Coming soon" and the rest of the site's code for him sits behind the build's __R3TARDS__ switch
// (apps/web/vite.config.ts); the API Worker has no line of him. This script is the one step between the two:
//
//   node tools/r3tards-launch.mjs --game 0x… --art 0x… --block N [--dry] [--root <a copy of the repo>]
//
// It (1) writes his address into apps/web/.env.local and tools/pages-deploy.sh (the deploy then insists they match),
// (2) puts his art contract on the send sheet's refuse list, (3) teaches the API Worker his contract (the index, the pet
// link previews, the social gate, referrals, push, the /r3tardgotchi/pet/* route), and (4) switches his mint page's link
// card from "coming soon" to the launch card. His pictures are in apps/web/public already (nothing names them until his
// switch is on). Every edit is anchored on the text it replaces and refuses if that text is not there exactly once; a
// second run finds every edit made and changes nothing. --dry prints what it would do. --root applies it to a copy.
// It deploys nothing: the Worker FIRST (until it knows him, /api/cats?pet=r3tards answers with the cats' lists), then
// the site, both by hand (see its last lines).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes('--dry');
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = arg('root') ?? REPO;
const game = arg('game'); const art = arg('art'); const block = Number(arg('block'));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? '');
if (!isAddr(game) || !isAddr(art) || !Number.isSafeInteger(block) || block <= 0) {
  console.error('usage: node tools/r3tards-launch.mjs --game 0x… --art 0x… --block <his deploy block> [--dry] [--root <dir>]');
  process.exit(1);
}
const GAME = game; const GAME_LC = game.toLowerCase(); const ART = art;

let changed = 0; let already = 0;
/** Replace `anchor` (exactly once) with `repl` in `file`; skip if `done` (a piece of the replacement) is already there. */
function edit(file, anchor, repl, done = repl) {
  const p = join(ROOT, file);
  const s = readFileSync(p, 'utf8');
  if (s.includes(done)) { already++; return; }
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${file}: expected the anchor once, found it ${n} times:\n  ${anchor.slice(0, 120)}`);
  if (!DRY) writeFileSync(p, s.replace(anchor, () => repl));
  changed++; console.log(`${DRY ? 'would edit' : 'edited'} ${file}`);
}

// ---- (0) what must be there before he can be switched on
for (const f of ['apps/web/public/nft/r3tards/content-1024.png', 'apps/web/public/nft/r3tards/habibi/content-crown-1024.png', 'apps/web/public/brand/pet/r3tards/content.png',
  'apps/web/public/social/av/r3tards/content.webp', 'apps/web/public/r3tardgotchi/brand/r3tardgotchi-opensea-banner.png', 'apps/web/public/r3tardgotchi/brand/r3tardgotchi-opensea-featured.png',
  'apps/web/public/brand/r3tardgotchi-og-live.png', 'packages/pet/r3tards-lite.svg']) {
  if (!existsSync(join(ROOT, f))) throw new Error(`missing ${f}: his pictures are not all made (portrait.mjs r3tards, og-pets.mjs r3tards, social-avatars.mjs, brand.mjs r3tards, r3-brand.mjs, town_lite.py)`);
}

// ---- (1) the switch, and the deploy's check of it
{
  const env = join(ROOT, 'apps/web/.env.local');
  const s = readFileSync(env, 'utf8');
  if (/^VITE_R3TARDS_ADDRESS=/m.test(s)) {
    const got = /^VITE_R3TARDS_ADDRESS=(.*)$/m.exec(s)[1].trim();
    if (got.toLowerCase() !== GAME_LC) throw new Error(`.env.local already has VITE_R3TARDS_ADDRESS=${got}, not ${GAME}`);
    already++;
  } else {
    if (!DRY) writeFileSync(env, s.replace(/\n?$/, '\n') + `# r3tardgotchi (block ${block}; art ${ART})\nVITE_R3TARDS_ADDRESS=${GAME}\n`);
    changed++; console.log(`${DRY ? 'would add' : 'added'} VITE_R3TARDS_ADDRESS to apps/web/.env.local`);
  }
}
edit('tools/pages-deploy.sh', 'R3TARDS_ADDRESS=""', `R3TARDS_ADDRESS="${GAME}"`);

// ---- (2) his art contract is one of ours: never a place to send a pet or an item
edit('apps/web/src/send.ts', `   // Thiccums' art\n];`, `   // Thiccums' art\n  ...(__R3TARDS__ ? ['${ART}'] : []),   // the r3tard's art\n];`, `// the r3tard's art`);

// ---- (3) the API Worker
edit('worker/indexer.js', `  { key: 'thiccums', out: 'thiccums', address: '0xbb2e3dd43350744f9764329c2c7a2ce87d9889ec', from: 108973505 },\n];`,
`  { key: 'thiccums', out: 'thiccums', address: '0xbb2e3dd43350744f9764329c2c7a2ce87d9889ec', from: 108973505 },
  // the r3tard (r3tardgotchi): the same contract with no stunt (tools/r3tards-launch.mjs)
  { key: 'r3tards', out: 'r3tards', address: '${GAME_LC}', from: ${block} },\n];`, `key: 'r3tards'`);
edit('worker/fold.js', `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'] };`, `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'], r3tards: [] };`);
edit('worker/index.js', `return v === 'frok' || v === 'sahur' || v === 'thiccums' ? v : 'cat'; };`, `return v === 'frok' || v === 'sahur' || v === 'thiccums' || v === 'r3tards' ? v : 'cat'; };`);

edit('worker/preview.js', `const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';   // Thiccumsgotchi (tools/thiccums-launch.mjs)`,
`const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';   // Thiccumsgotchi (tools/thiccums-launch.mjs)
const R3TARDS = '${GAME}';   // r3tardgotchi (tools/r3tards-launch.mjs)`);
edit('worker/preview.js', `  sahur: { prefix: '/tung', contract: SAHUR,`,
  `  r3tards: { prefix: '/r3tardgotchi', contract: R3TARDS, kind: 'r3tard', collection: 'r3tardgotchi', card: 'r3tards', blurb: 'A r3tard that lives in your wallet, on Monad. Everything you do to him is free and counted forever.' },
  sahur: { prefix: '/tung', contract: SAHUR,`, `card: 'r3tards'`);
edit('worker/preview.js', `  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/|thiccums\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : 'cat', id: Number(m[2]) } : null;`,
`  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/|thiccums\\/|r3tardgotchi\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : m[1] === 'r3tardgotchi/' ? 'r3tards' : 'cat', id: Number(m[2]) } : null;`);

edit('worker/referral.js', `const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';`, `const THICCUMS = '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec';
const R3TARDS = '${GAME}';`);
edit('worker/referral.js', `    const [cats, froks, sahurs, thiccums] = await Promise.all([`, `    const [cats, froks, sahurs, thiccums, r3tards] = await Promise.all([`);
edit('worker/referral.js', `      pub.readContract({ address: THICCUMS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n)`, `      pub.readContract({ address: THICCUMS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: R3TARDS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n || r3tards > 0n)`);

edit('worker/push.js', `  thiccums: { label: 'Thiccums', path: (id) => \`/thiccums/pet/\${id}\`, revive: 'A revive brings it back, free.' },`,
`  thiccums: { label: 'Thiccums', path: (id) => \`/thiccums/pet/\${id}\`, revive: 'A revive brings it back, free.' },
  r3tards: { label: 'r3tard', path: (id) => \`/r3tardgotchi/pet/\${id}\`, revive: 'A revive brings it back, free.' },`);
edit('worker/push.js', `/^(cat|frok|sahur|thiccums):\\d{1,7}$/.test(x)`, `/^(cat|frok|sahur|thiccums|r3tards):\\d{1,7}$/.test(x)`);

edit('worker/social/chain.js', `  thiccums: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums'];`, `  thiccums: '0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec',
  r3tards: '${GAME}',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums', 'r3tards'];`);
edit('worker/social/chain.js', `  const out = { cat: [], frok: [], sahur: [], thiccums: [] };`, `  const out = { cat: [], frok: [], sahur: [], thiccums: [], r3tards: [] };`);
edit('worker/social/activity.js', `sahur: ['tung'], thiccums: ['bounce'] };`, `sahur: ['tung'], thiccums: ['bounce'], r3tards: [] };`);
edit('worker/social/rooms.js', `  const m = /^(cat|frok|sahur|thiccums):(\\d{1,7})$/.exec(s ?? '');`, `  const m = /^(cat|frok|sahur|thiccums|r3tards):(\\d{1,7})$/.exec(s ?? '');`);
edit('worker/social/rules.js', `'sahur', 'thiccums', 'thiccumsgotchi',`, `'sahur', 'thiccums', 'thiccumsgotchi', 'r3tardgotchi',`);
edit('worker/wrangler.toml', `[[routes]]
pattern = "emogotchi.emonad.lol/thiccums/pet/*"`, `[[routes]]
pattern = "emogotchi.emonad.lol/r3tardgotchi/pet/*"
zone_name = "emonad.lol"

[[routes]]
pattern = "emogotchi.emonad.lol/thiccums/pet/*"`, `emogotchi.emonad.lol/r3tardgotchi/pet/*`);

// ---- (4) his mint page's link card: minting is open
edit('tools/og-meta.mjs', `    TITLE: 'r3tardgotchi · free mint, coming soon',`, `    TITLE: 'r3tardgotchi · free mint, live on Monad',`);
edit('tools/og-meta.mjs', `Free to mint, no cap, one per wallet. Coming soon to Emogotchi.',`, `Free to mint, no cap, one per wallet.',`, `Free to mint, no cap, one per wallet.',`);
edit('tools/og-meta.mjs', `    IMG: 'https://emogotchi.emonad.lol/brand/r3tardgotchi-og.png', W: 1200, H: 630,`, `    IMG: 'https://emogotchi.emonad.lol/brand/r3tardgotchi-og-live.png?v=2', W: 1200, H: 630,`);

console.log(`\n${DRY ? 'dry run: ' : ''}${changed} edits${already ? `, ${already} already made` : ''}`);
console.log(`
Next, by hand (tell the other sessions first: START / LIVE):
  1. cd worker && node --test test/fold.test.mjs && npx wrangler deploy     (the API FIRST: his index row, link previews, social gate, push)
     then watch /api/index until it has caught his contract up, and /api/cats?pet=r3tards answers with his own lists
  2. PAGES=<clone> bash tools/pages-deploy.sh "r3tardgotchi"                  (the site)
  3. check: /r3tardgotchi mints (no "coming soon" anywhere), /r3tardgotchi/pet/1 answers 200 with his card, /adopt (five cards),
     /pets?pet=r3tards, /leaderboard, /stats?pet=r3tards, the shop's pickers, Emotown, the link card (og:image …-og-live.png),
     /r3tardgotchi/brand/r3tardgotchi-opensea-banner.png`);
