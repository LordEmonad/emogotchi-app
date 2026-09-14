// Copies the Emogotchi ABI out of the Foundry build into src/abi.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const artifact = fileURLToPath(new URL('../../../contracts/out/Emogotchi.sol/Emogotchi.json', import.meta.url));
const { abi } = JSON.parse(readFileSync(artifact, 'utf8'));
const out = fileURLToPath(new URL('../src/abi.ts', import.meta.url));
writeFileSync(out, `// Generated from contracts/out by \`pnpm --filter @emo-pets/chain abi\`. Do not edit.\nexport const emogotchiAbi = ${JSON.stringify(abi, null, 2)} as const;\n`);
console.log('wrote', out, abi.length, 'entries');
