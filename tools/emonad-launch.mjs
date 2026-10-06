// Switch Emonad (Emonadgotchi, the sixth pet) on, once his contract is on chain. Until then nothing of him is on the
// site: every line of him sits behind the build's __EMONAD__ switch (apps/web/vite.config.ts), his mint page included,
// and his pictures are staged in emonadgotchi/public/ (it mirrors apps/web/public/); the API Worker has no line of him.
// This script is the one step between the two (the r3tard's launch script, tools/r3tards-launch.mjs, done Thiccums' way):
//
//   node tools/emonad-launch.mjs --game 0x… --art 0x… --block N [--dry] [--root <a copy of the repo>]
//
// It (1) writes his address into apps/web/.env.local and tools/pages-deploy.sh (the deploy then insists they match),
// (2) puts his art contract on the send sheet's refuse list, (3) teaches the API Worker his contract (the index, the pet
// link previews, the social gate, referrals, push, the /emonadgotchi/pet/* route, his name reserved), and (4) copies his
// staged pictures into apps/web/public (refusing to overwrite a different file). Every edit is anchored on the text it
// replaces and refuses if that text is not there exactly once; a second run finds every edit made and changes nothing.
// --dry prints what it would do. --root applies it to a copy. It deploys nothing: the Worker FIRST (until it knows him,
// /api/cats?pet=emonad answers with the cats' lists), then the site, both by hand (see its last lines).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes('--dry');
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = arg('root') ?? REPO;
const game = arg('game'); const art = arg('art'); const block = Number(arg('block'));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a ?? '');
if (!isAddr(game) || !isAddr(art) || !Number.isSafeInteger(block) || block <= 0) {
  console.error('usage: node tools/emonad-launch.mjs --game 0x… --art 0x… --block <his deploy block> [--dry] [--root <dir>]');
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

// ---- (0) what must be there before he can be switched on (made by the tools named in emonadgotchi/README.md)
const STAGE = join(ROOT, 'emonadgotchi/public');
for (const f of ['nft/emonad/content-1024.png', 'nft/emonad/witch/content-crown-1024.png', 'brand/pet/emonad/content.png', 'social/av/emonad/content.webp',
  'emonadgotchi/brand/emonadgotchi-opensea-banner.png', 'emonadgotchi/brand/emonadgotchi-opensea-featured.png', 'brand/emonadgotchi-og-live.png']) {
  if (!existsSync(join(STAGE, f)) && !existsSync(join(ROOT, 'apps/web/public', f))) throw new Error(`missing emonadgotchi/public/${f}: his pictures are not all made (see emonadgotchi/README.md)`);
}
if (!existsSync(join(ROOT, 'packages/pet/emonadgotchi-lite.svg'))) throw new Error('missing packages/pet/emonadgotchi-lite.svg (python3 packages/pet/design/town_lite.py emonadgotchi)');
if (!existsSync(join(ROOT, 'contracts/art-emonad/base.bin'))) throw new Error('missing contracts/art-emonad (BASE=<build> node tools/bake-art.mjs emonad)');

// ---- (1) the switch, and the deploy's check of it
{
  const env = join(ROOT, 'apps/web/.env.local');
  const s = readFileSync(env, 'utf8');
  if (/^VITE_EMONAD_ADDRESS=/m.test(s)) {
    const got = /^VITE_EMONAD_ADDRESS=(.*)$/m.exec(s)[1].trim();
    if (got.toLowerCase() !== GAME_LC) throw new Error(`.env.local already has VITE_EMONAD_ADDRESS=${got}, not ${GAME}`);
    already++;
  } else {
    if (!DRY) writeFileSync(env, s.replace(/\n?$/, '\n') + `# Emonadgotchi (block ${block}; art ${ART})\nVITE_EMONAD_ADDRESS=${GAME}\n`);
    changed++; console.log(`${DRY ? 'would add' : 'added'} VITE_EMONAD_ADDRESS to apps/web/.env.local`);
  }
}
edit('tools/pages-deploy.sh', 'EMONAD_ADDRESS=""', `EMONAD_ADDRESS="${GAME}"`);

// ---- (2) his art contract is one of ours: never a place to send a pet or an item
edit('apps/web/src/send.ts', `   // the r3tard's art\n];`, `   // the r3tard's art\n  ...(__EMONAD__ ? ['${ART}'] : []),   // Emonad's art\n];`, `// Emonad's art`);

// ---- (3) the API Worker
edit('worker/indexer.js', `  { key: 'r3tards', out: 'r3tards', address: '0x41841b6f2f1750ab32c86c25ab2816f4996bf41e', from: 109771791 },\n];`,
`  { key: 'r3tards', out: 'r3tards', address: '0x41841b6f2f1750ab32c86c25ab2816f4996bf41e', from: 109771791 },
  // Emonad (Emonadgotchi): the r3tard's contract with his name (tools/emonad-launch.mjs)
  { key: 'emonad', out: 'emonad', address: '${GAME_LC}', from: ${block} },\n];`, `key: 'emonad'`);
edit('worker/fold.js', `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'], r3tards: [] };`, `const STUNTS = { cat: [], frok: ABUSES, sahur: ['tung'], thiccums: ['bounce'], r3tards: [], emonad: [] };`);
edit('worker/index.js', `return v === 'frok' || v === 'sahur' || v === 'thiccums' || v === 'r3tards' ? v : 'cat'; };`, `return v === 'frok' || v === 'sahur' || v === 'thiccums' || v === 'r3tards' || v === 'emonad' ? v : 'cat'; };`);

edit('worker/preview.js', `const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';   // r3tardgotchi (tools/r3tards-launch.mjs)`,
`const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';   // r3tardgotchi (tools/r3tards-launch.mjs)
const EMONAD = '${GAME}';   // Emonadgotchi (tools/emonad-launch.mjs)`);
edit('worker/preview.js', `  sahur: { prefix: '/tung', contract: SAHUR,`,
  `  emonad: { prefix: '/emonadgotchi', contract: EMONAD, kind: 'Emonad', collection: 'Emonadgotchi', card: 'emonad', blurb: 'Emonad, the face of $EMO, living in your wallet on Monad. Everything you do to him is free and counted forever.' },
  sahur: { prefix: '/tung', contract: SAHUR,`, `card: 'emonad'`);
edit('worker/preview.js', `  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/|thiccums\\/|r3tardgotchi\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : m[1] === 'r3tardgotchi/' ? 'r3tards' : 'cat', id: Number(m[2]) } : null;`,
`  const m = pathname.match(/^\\/(inversebrah\\/|tung\\/|thiccums\\/|r3tardgotchi\\/|emonadgotchi\\/)?pet\\/(\\d{1,7})\\/?$/);
  return m ? { pet: m[1] === 'inversebrah/' ? 'frok' : m[1] === 'tung/' ? 'sahur' : m[1] === 'thiccums/' ? 'thiccums' : m[1] === 'r3tardgotchi/' ? 'r3tards' : m[1] === 'emonadgotchi/' ? 'emonad' : 'cat', id: Number(m[2]) } : null;`);

edit('worker/referral.js', `const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';`, `const R3TARDS = '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e';
const EMONAD = '${GAME}';`);
edit('worker/referral.js', `    const [cats, froks, sahurs, thiccums, r3tards] = await Promise.all([`, `    const [cats, froks, sahurs, thiccums, r3tards, emonad] = await Promise.all([`);
edit('worker/referral.js', `      pub.readContract({ address: R3TARDS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n || r3tards > 0n)`, `      pub.readContract({ address: R3TARDS, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
      pub.readContract({ address: EMONAD, abi: ERC721, functionName: 'balanceOf', args: [referee] }),
    ]);
    if (cats > 0n || froks > 0n || sahurs > 0n || thiccums > 0n || r3tards > 0n || emonad > 0n)`);

edit('worker/push.js', `  r3tards: { label: 'r3tard', path: (id) => \`/r3tardgotchi/pet/\${id}\`, revive: 'A revive brings it back, free.' },`,
`  r3tards: { label: 'r3tard', path: (id) => \`/r3tardgotchi/pet/\${id}\`, revive: 'A revive brings it back, free.' },
  emonad: { label: 'Emonad', path: (id) => \`/emonadgotchi/pet/\${id}\`, revive: 'A revive brings him back, free.' },`);
edit('worker/push.js', `/^(cat|frok|sahur|thiccums|r3tards):\\d{1,7}$/.test(x)`, `/^(cat|frok|sahur|thiccums|r3tards|emonad):\\d{1,7}$/.test(x)`);

edit('worker/social/chain.js', `  r3tards: '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums', 'r3tards'];`, `  r3tards: '0x41841b6F2F1750AB32C86C25aB2816F4996bf41e',
  emonad: '${GAME}',
};
export const COLS = ['cat', 'frok', 'sahur', 'thiccums', 'r3tards', 'emonad'];`);
edit('worker/social/chain.js', `  const out = { cat: [], frok: [], sahur: [], thiccums: [], r3tards: [] };`, `  const out = { cat: [], frok: [], sahur: [], thiccums: [], r3tards: [], emonad: [] };`);
edit('worker/social/activity.js', `thiccums: ['bounce'], r3tards: [] };`, `thiccums: ['bounce'], r3tards: [], emonad: [] };`);
edit('worker/social/rooms.js', `  const m = /^(cat|frok|sahur|thiccums|r3tards):(\\d{1,7})$/.exec(s ?? '');`, `  const m = /^(cat|frok|sahur|thiccums|r3tards|emonad):(\\d{1,7})$/.exec(s ?? '');`);
edit('worker/social/rules.js', `'thiccums', 'thiccumsgotchi', 'r3tardgotchi',`, `'thiccums', 'thiccumsgotchi', 'r3tardgotchi', 'emonadgotchi',`);
edit('worker/wrangler.toml', `[[routes]]
pattern = "emogotchi.emonad.lol/r3tardgotchi/pet/*"`, `[[routes]]
pattern = "emogotchi.emonad.lol/emonadgotchi/pet/*"
zone_name = "emonad.lol"

[[routes]]
pattern = "emogotchi.emonad.lol/r3tardgotchi/pet/*"`, `emogotchi.emonad.lol/emonadgotchi/pet/*`);

// the Get a pet link card with six pets (tools/og-adopt.mjs --six, staged under its own name)
edit('tools/og-meta.mjs', `IMG: 'https://emogotchi.emonad.lol/brand/adopt-og.png?v=3',   // ?v=3: the r3tard joined (2026-10-01; v=2 was Thiccums); a new URL makes X, Discord and Telegram fetch it again`,
  `IMG: 'https://emogotchi.emonad.lol/brand/adopt-og-6.png',   // Emonad joined (six pets: tools/og-adopt.mjs --six); a new URL makes X, Discord and Telegram fetch it again (?v=3 was the r3tard, v=2 Thiccums)`, `adopt-og-6.png`);

edit('tools/og-meta.mjs', `    DESC: 'Adopt a pet on Monad. inversebrah, Tung Tung Tung Sahur, Thiccums and the r3tard are free to mint, one each per wallet;`,
  `    DESC: 'Adopt a pet on Monad. Emonad, inversebrah, Tung Tung Tung Sahur, Thiccums and the r3tard are free to mint, one each per wallet;`, `Adopt a pet on Monad. Emonad, inversebrah`);
edit('tools/og-meta.mjs', `    ALT: 'inversebrah crowned at night,`, `    ALT: 'Emonad crowned in his emo bedroom at night, inversebrah crowned at night,`, `ALT: 'Emonad crowned in his emo bedroom`);
edit('tools/og-meta.mjs', `the r3tard crowned and the crowned cat at home: four free, one to claim.',`, `the r3tard crowned and the crowned cat at home: five free, one to claim.',`, `five free, one to claim.',`);

// ---- (4) his pictures: emonadgotchi/public/** into apps/web/public/** (a file already there must be the same bytes)
{
  const PUB = join(ROOT, 'apps/web/public');
  let copied = 0, same = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith('._') || name === '.DS_Store') continue;
      const src = join(dir, name);
      if (statSync(src).isDirectory()) { walk(src); continue; }
      const dst = join(PUB, relative(STAGE, src));
      if (existsSync(dst)) {
        if (Buffer.compare(readFileSync(dst), readFileSync(src)) === 0) { same++; continue; }
        throw new Error(`apps/web/public/${relative(STAGE, src)} exists and differs from the staged file: not overwriting it`);
      }
      if (!DRY) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); }
      copied++;
    }
  };
  walk(STAGE);
  if (copied) { changed++; console.log(`${DRY ? 'would copy' : 'copied'} ${copied} staged pictures into apps/web/public${same ? ` (${same} already there)` : ''}`); }
  else if (same) already++;
}

console.log(`\n${DRY ? 'dry run: ' : ''}${changed} edits${already ? `, ${already} already made` : ''}`);
console.log(`
Next, by hand (tell the other sessions first: START / LIVE):
  1. cd worker && node --test test/fold.test.mjs && npx wrangler deploy     (the API FIRST: his index row, link previews, social gate, push)
     then watch /api/index until it has caught his contract up, and /api/cats?pet=emonad answers with his own lists
  2. PAGES=<clone> SHIP_SOUND=1 bash tools/pages-deploy.sh "Emonadgotchi"     (the site)
  3. check: /emonadgotchi mints, /emonadgotchi/pet/1 answers 200 with his card, /adopt (six cards), /pets?pet=emonad,
     /leaderboard, /stats?pet=emonad, the shop's pickers, Emotown, the link card (og:image …emonadgotchi-og-live.png),
     /emonadgotchi/brand/emonadgotchi-opensea-banner.png`);
