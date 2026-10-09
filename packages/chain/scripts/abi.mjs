// Copies the Emogotchi, EmogotchiDrop, EmogotchiItems, Inversegotchi, Sahuragotchi and Thiccumsgotchi ABIs out of the Foundry build into src/abi.ts.
// (thiccumsgotchiAbi is only ever used behind the site's __THICCUMS__ switch, so a build without him drops it; the same
// for r3tardgotchiAbi and __R3TARDS__, and emonadgotchiAbi and __EMONAD__.)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url)), 'utf8')).abi;
const game = load('Emogotchi'); const drop = load('EmogotchiDrop'); const items = load('EmogotchiItems'); const inverse = load('Inversegotchi');
const sahur = load('Sahuragotchi'); const thiccums = load('Thiccumsgotchi'); const r3tards = load('R3tardgotchi'); const emonad = load('Emonadgotchi');
const out = fileURLToPath(new URL('../src/abi.ts', import.meta.url));
writeFileSync(out, `// Generated from contracts/out by \`pnpm --filter @emo-pets/chain abi\`. Do not edit.\nexport const emogotchiAbi = ${JSON.stringify(game, null, 2)} as const;\nexport const emogotchiDropAbi = ${JSON.stringify(drop, null, 2)} as const;\nexport const emogotchiItemsAbi = ${JSON.stringify(items, null, 2)} as const;\nexport const inversegotchiAbi = ${JSON.stringify(inverse, null, 2)} as const;\nexport const sahuragotchiAbi = ${JSON.stringify(sahur, null, 2)} as const;\nexport const thiccumsgotchiAbi = ${JSON.stringify(thiccums, null, 2)} as const;\nexport const r3tardgotchiAbi = ${JSON.stringify(r3tards, null, 2)} as const;\nexport const emonadgotchiAbi = ${JSON.stringify(emonad, null, 2)} as const;\n`);
console.log('wrote', out, game.length, '+', drop.length, '+', items.length, '+', inverse.length, 'entries');
