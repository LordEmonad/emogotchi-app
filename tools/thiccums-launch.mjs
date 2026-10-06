// Switch Thiccums (the fourth pet) on, once his contract is on chain. Until then nothing of him ships: the site's
// code for him sits behind the build's __THICCUMS__ switch (apps/web/vite.config.ts), the API Worker has no line of
// him, and his pictures live in thiccumsgotchi/, outside public/. This script is the one step between the two:
//
//   node tools/thiccums-launch.mjs --game 0x… --art 0x… --block N [--dry] [--root <a copy of the repo>]
//
// It (1) writes his address into apps/web/.env.local and tools/pages-deploy.sh (the deploy then insists they
// match), (2) puts his art contract on the send sheet's refuse list, (3) teaches the API Worker his contract (the
// gallery index, the stats fold, the pet link previews, the social gate, referrals, the /thiccums/pet/* route), and
// (4) copies his pictures into apps/web/public (portraits, the $THICCUMS-look kit and link cards, the social heads,
// the two OpenSea pictures his contractURI names under /thiccums/brand/). Every edit is anchored on the text it
// replaces and refuses if that text is not there exactly once; a second run finds every edit made and changes
// nothing. --dry prints what it would do. --root applies it to a copy (the rehearsal does that); the default is
// this repo. It deploys nothing: the Worker and the site are deployed by hand afterwards (see its last lines).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes('--dry');
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = arg('root') ?? REPO;
const game = arg('game'); const art = arg('art'); const block = Number(arg('block'));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? '');
if (!isAddr(game) || !isAddr(art) || !Number.isSafeInteger(block) || block <= 0) {
  console.error('usage: node tools/thiccums-launch.mjs --game 0x… --art 0x… --block <his deploy block> [--dry] [--root <dir>]');
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

// ---- (1) the switch, and the deploy's check of it
{
  const env = join(ROOT, 'apps/web/.env.local');
  const s = readFileSync(env, 'utf8');
  if (/^VITE_THICCUMS_ADDRESS=/m.test(s)) {
    const got = /^VITE_THICCUMS_ADDRESS=(.*)$/m.exec(s)[1].trim();
    if (got.toLowerCase() !== GAME_LC) throw new Error(`.env.local already has VITE_THICCUMS_ADDRESS=${got}, not ${GAME}`);
    already++;
  } else {
    if (!DRY) writeFileSync(env, s.replace(/\n?$/, '\n') + `VITE_THICCUMS_ADDRESS=${GAME}\n`);
    changed++; console.log(`${DRY ? 'would add' : 'added'} VITE_THICCUMS_ADDRESS to apps/web/.env.local`);
  }
}
edit('tools/pages-deploy.sh', 'THICCUMS_ADDRESS=""', `THICCUMS_ADDRESS="${GAME}"`);

// ---- (2) his art contract is one of ours: never a place to send a pet or an item
edit('apps/web/src/send.ts', `  '0xA6b3b94DD997D6eCea5E64ba6b9Ca8c2B9df3871', '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8',
];`, `  '0xA6b3b94DD997D6eCea5E64ba6b9Ca8c2B9df3871', '0x00036BAaf671aF375f7f22664b4086b9D4bb9EF8',
  ...(__THICCUMS__ ? ['${ART}'] : []),   // Thiccums' art
];`);

// ---- (3) the API Worker
edit('worker/index.js', `const SAHUR_FROM_BLOCK = 107844915;
const petParam = (url) => { const v = url.searchParams.get('pet'); return v === 'frok' || v === 'sahur' ? v : 'cat'; };`,
`const SAHUR_FROM_BLOCK = 107844915;
// Thiccums (Thiccumsgotchi): Sahur's contract with his own stunt (tools/thiccums-launch.mjs)
const THICCUMS = '${GAME_LC}';
const THICCUMS_FROM_BLOCK = ${block};
const petParam = (url) => { const v = url.searchParams.get('pet'); return v === 'frok' || v === 'sahur' || v === 'thiccums' ? v : 'cat'; };`);
edit('worker/index.js', `const petOf = (pet) => pet === 'frok' ? { game: INVERSE, from: INVERSE_FROM_BLOCK } : pet === 'sahur' ?`,
  `const petOf = (pet) => pet === 'frok' ? { game: INVERSE, from: INVERSE_FROM_BLOCK } : pet === 'thiccums' ? { game: THICCUMS, from: THICCUMS_FROM_BLOCK } : pet === 'sahur' ?`);

edit('worker/stats.js', `const SAHURS = { key: 'sahur', address: '0xc7969c5df0353e4e65b54e3587bd0cab5d1af4c7', from: 107844915 };`,
`const SAHURS = { key: 'sahur', address: '0xc7969c5df0353e4e65b54e3587bd0cab5d1af4c7', from: 107844915 };
// Thiccums (Thiccumsgotchi), from tools/thiccums-launch.mjs
const THICCUMS = { key: 'thiccums', address: '${GAME_LC}', from: ${block} };`);
edit('worker/stats.js', `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'] };`, `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'] };`);
edit('worker/stats.js', `const [cats, froks, sahurs, shop, starters] = await Promise.all([petStats(env, CATS, now), petStats(env, FROKS, now), SAHURS.address ? petStats(env, SAHURS, now) : Promise.resolve(null), shopStats(env, now), starterStats(env)]);`,
  `const [cats, froks, sahurs, thiccums, shop, starters] = await Promise.all([petStats(env, CATS, now), petStats(env, FROKS, now), SAHURS.address ? petStats(env, SAHURS, now) : Promise.resolve(null), petStats(env, THICCUMS, now), shopStats(env, now), starterStats(env)]);`);
edit('worker/stats.js', `for (const m of [cats.namers, froks.namers, sahurs?.namers])`, `for (const m of [cats.namers, froks.namers, sahurs?.namers, thiccums?.namers])`);
edit('worker/stats.js', `const pets = [cats, froks, ...(sahurs ? [sahurs] : [])];`, `const pets = [cats, froks, ...(sahurs ? [sahurs] : []), ...(thiccums ? [thiccums] : [])];`);
edit('worker/stats.js', `return { generatedAt: new Date().toISOString(), now, cats, froks, ...(sahurs ? { sahurs } : {}), all,`,
  `return { generatedAt: new Date().toISOString(), now, cats, froks, ...(sahurs ? { sahurs } : {}), ...(thiccums ? { thiccums } : {}), all,`);

edit('worker/preview.js', `const SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';   // Tung Tung Tung Sahuragotchi, deployed 2026-09-25`,
`const SAHUR = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';   // Tung Tung Tung Sahuragotchi, deployed 2026-09-25
const THICCUMS = '${GAME}';   // Thiccumsgotchi (tools/thiccums-launch.mjs)`);
edit('worker/preview.js', `  sahur: { prefix: '/tung', contract: SAHUR,`,
  `  thiccums: { prefix: '/thiccums', contract: THICCUMS, kind: 'Thiccums', collection: 'Thiccumsgotchi', card: 'thiccums', blurb: 'Thiccums the Seal, living in your wallet on Monad. Everything you do to him is free; every butt bounce is counted forever.' },
  sahur: { prefix: '/tung', contract: SAHUR,`, `card: 'thiccums'`);
edit('worker/preview.js', `  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : 'cat', id: Number(m[2]) } : null;`,
`  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/|thiccums\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : 'cat', id: Number(m[2]) } : null;`);
edit('worker/preview.js', "  if (pet === 'sahur') bits.push(`tung tung tung ${num(a.Tungs).toLocaleString('en-US')}×`);",
  "  if (pet === 'sahur') bits.push(`tung tung tung ${num(a.Tungs).toLocaleString('en-US')}×`);\n  if (pet === 'thiccums') bits.push(`bounced ${num(a.Bounces).toLocaleString('en-US')}×`);");

edit('worker/referral.js', `const SAHURS = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';`, `const SAHURS = '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7';
const THICCUMS = '${GAME}';`);
edit('worker/referral.js', `    const [cats, froks, sahurs] = await Promise.all([`, `    const [cats, froks, sahurs, thiccums] = await Promise.all([`);
edit('worker/referral.js', `      pub.readContract({ address: SAHURS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n)`, `      pub.readContract({ address: SAHURS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: THICCUMS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n)`);

edit('worker/social/chain.js', `  sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7',
};
export const COLS = ['cat', 'frok', 'sahur'];`, `  sahur: '0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7',
  thiccums: '${GAME}',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums'];`);
edit('worker/social/chain.js', `  const out = { cat: [], frok: [], sahur: [] };`, `  const out = { cat: [], frok: [], sahur: [], thiccums: [] };`);
edit('worker/social/activity.js', `const STUNTS = { cat: [], frok: ['screenshot', 'slap', 'squeeze', 'burn'], sahur: ['tung'] };`,
  `const STUNTS = { cat: [], frok: ['screenshot', 'slap', 'squeeze', 'burn'], sahur: ['tung'], thiccums: ['bounce'] };`);
edit('worker/social/rooms.js', `  const m = /^(cat|frok|sahur):(\\d{1,7})$/.exec(s ?? '');`, `  const m = /^(cat|frok|sahur|thiccums):(\\d{1,7})$/.exec(s ?? '');`);
edit('worker/social/rules.js', `'inversegotchi', 'sahuragotchi', 'inversebrah', 'sahur',`, `'inversegotchi', 'sahuragotchi', 'inversebrah', 'sahur', 'thiccums', 'thiccumsgotchi',`);
edit('worker/wrangler.toml', `[[routes]]
pattern = "emogotchi.emonad.lol/tung/pet/*"`, `[[routes]]
pattern = "emogotchi.emonad.lol/thiccums/pet/*"
zone_name = "emonad.lol"

[[routes]]
pattern = "emogotchi.emonad.lol/tung/pet/*"`, `emogotchi.emonad.lol/thiccums/pet/*`);

// ---- (4) his pictures, into the site
const SRC = join(ROOT, 'thiccumsgotchi');
const PUB = join(ROOT, 'apps/web/public');
let copied = 0;
function copyTree(from, to, keep = () => true) {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  for (const name of readdirSync(from)) {
    if (name.startsWith('._') || name === '.DS_Store') continue;
    const a = join(from, name); const b = join(to, name);
    if (statSync(a).isDirectory()) { copyTree(a, b, keep); continue; }
    if (!keep(name)) continue;
    if (!DRY) { mkdirSync(dirname(b), { recursive: true }); copyFileSync(a, b); }
    copied++;
  }
}
// site portraits (plain and every dressed set): /nft/thiccums/…
copyTree(join(SRC, 'nft'), join(PUB, 'nft/thiccums'), (n) => n.endsWith('.png'));
// the kit, in the $THICCUMS look the operator chose: /brand/thiccums-*.png
copyTree(join(SRC, 'brand/ocean'), join(PUB, 'brand'), (n) => /^thiccums-.*\.png$/.test(n));
// his pet pages' link cards: /brand/pet/thiccums/<mood>[-crown].png (worker/preview.js)
copyTree(join(SRC, 'brand/ocean/pet'), join(PUB, 'brand/pet/thiccums'), (n) => n.endsWith('.png'));
// the two pictures his contractURI names, under his siteURI: <siteURI>/brand/thiccums-opensea-{banner,featured}.png
for (const n of ['thiccums-opensea-banner.png', 'thiccums-opensea-featured.png']) {
  if (!DRY) { mkdirSync(join(PUB, 'thiccums/brand'), { recursive: true }); copyFileSync(join(SRC, 'brand/ocean', n), join(PUB, 'thiccums/brand', n)); }
  copied++;
}
// the social heads (Emotown profiles, the square): /social/av/thiccums/…
if (existsSync(join(SRC, 'social-av'))) copyTree(join(SRC, 'social-av'), join(PUB, 'social/av/thiccums'), (n) => n.endsWith('.webp'));
else console.warn('no thiccumsgotchi/social-av yet: his social heads are missing (node tools/social-avatars.mjs thiccums)');

console.log(`\n${DRY ? 'dry run: ' : ''}${changed} edits${already ? `, ${already} already made` : ''}, ${copied} files ${DRY ? 'to copy' : 'copied'} into apps/web/public`);
console.log(`
Next, by hand:
  1. cd worker && npx wrangler deploy        (the API: his gallery index, stats, link previews, social gate)
  2. PAGES=<clone> bash tools/pages-deploy.sh "Thiccums"   (the site: tell the other sessions first)
  3. check: /thiccums mints, /thiccums/pet/1 answers 200 with his card, /api/cats?pet=thiccums and /api/stats (thiccums),
     the gallery's tab, the leaderboard, the shop's pickers, /thiccums/brand/thiccums-opensea-banner.png`);
