// Copies the Emogotchi, EmogotchiDrop and EmogotchiItems ABIs out of the Foundry build into src/abi.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url)), 'utf8')).abi;
const game = load('Emogotchi'); const drop = load('EmogotchiDrop'); const items = load('EmogotchiItems');
const out = fileURLToPath(new URL('../src/abi.ts', import.meta.url));
writeFileSync(out, `// Generated from contracts/out by \`pnpm --filter @emo-pets/chain abi\`. Do not edit.\nexport const emogotchiAbi = ${JSON.stringify(game, null, 2)} as const;\nexport const emogotchiDropAbi = ${JSON.stringify(drop, null, 2)} as const;\nexport const emogotchiItemsAbi = ${JSON.stringify(items, null, 2)} as const;\n`);
console.log('wrote', out, game.length, '+', drop.length, '+', items.length, 'entries');
