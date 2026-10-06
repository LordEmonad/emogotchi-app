// Evens out the loudness of the sound effects. Every sound is written by ear-less arithmetic (apps/web/src/sound/sfx.ts),
// so how loud each comes out is an accident of its recipe; this renders them all as written (the sound lab's sheet with
// raw=1), measures each one's peak and its loudest 300 ms, and writes the gain that brings it to its kind's target
// into apps/web/src/sound/levels.ts. Run it after adding or changing a sound.
//
//   cd apps/web && npx vite --config ../../tools/thiccums-dev.mjs --port 5271 --strictPort
//   node tools/sound-levels.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'sound-levels-'));
execFileSync('node', [here('./sound-check.mjs'), 'sfx', '--raw=1'], { env: { ...process.env, OUT: out }, stdio: 'ignore' });
const rows = JSON.parse(readFileSync(join(out, 'sfx.json'), 'utf8'));

// kinds: [peak, loudest 300 ms] in dB at the default volumes; a sound is brought up to whichever it reaches first
const KIND = {
  whisper: [-25, -42],   // the interface's own ticks
  ui: [-19, -32],        // the interface speaking up: opened, sent, landed, a message
  small: [-19, -34],     // steps, crumbs, clicks
  medium: [-14, -28],    // most things a pet does
  big: [-9.5, -23],      // hits, landings, endings
  long: [-16, -28],      // what goes on for a while under the rest
  voice: [-13.5, -28],
};
const PICK = [
  [/^ui\.(tap|tick|swipe|copy)$/, 'whisper'],
  [/^(ui|tx|notify)\./, 'ui'],
  [/^voice\./, 'voice'],
  [/^(step|hop|crumbs|bite|sniff|lick|drops|dust|puff|pat|squeak|pop|scoop|phew|strain|flaps|wings|catch|shutter|dreidel\.flick|whoosh|flop|fight\.swing|slap\.wind|squeeze|match|jump|flash|drum\.tek|chatter)$/, 'small'],
  [/^(thud|tub\.land|slap\.hit|tung|drum\.dum|gush|grave|fight\.(hit|ko|bell|win|lose|block)|revive|mint|crown|die|dreidel\.all|falcon\.cry)$/, 'big'],
  [/^(purr|fire|servo|slide|roll|dreidel\.spin|snore|tummy|fight\.crowd|sizzle|bubbles|ghost|stars|burn|scrub|leap)$/, 'long'],
];
const kindOf = (name) => PICK.find(([re]) => re.test(name))?.[1] ?? 'medium';

const table = {};
for (const r of rows) {
  const [name, who] = r.name.split(' · ');
  const [peak, loud] = KIND[kindOf(name)];
  const gain = Math.min(peak - r.peak, loud - r.loud);
  table[who ? `${name}:${who}` : name] = +Math.pow(10, gain / 20).toFixed(3);
}
// the electric guitar's strokes are one instrument: levelled one by one, its palm-muted chugs came out ~7 dB over its open
// hits. They keep the balance they were written with, all at the open down-stroke's level.
for (const k of ['guitar.up', 'guitar.mute']) if (table['guitar.down'] !== undefined && k in table) table[k] = table['guitar.down'];
// the band behind the riff (band.bar, band.end) is a backing, levelled against the guitar it plays with, not by a kind:
// 2 dB under it in the riff (measured: tools/sound-studio.mjs riff --band / --noguitar, sound-spectrum.py)
for (const k of ['band.bar', 'band.end']) if (table['guitar.down'] !== undefined && k in table) table[k] = +(table['guitar.down'] * 0.35).toFixed(3);
const body = Object.entries(table).map(([k, v]) => `  ${JSON.stringify(k)}: ${v},`).join('\n');
writeFileSync(here('../apps/web/src/sound/levels.ts'), `// Written by tools/sound-levels.mjs. Do not edit by hand: change a sound's kind there and run it again.\n// How much louder or quieter each sound is played than its recipe makes it, so that they sit together.\nexport const LEVEL: Record<string, number> = {\n${body}\n};\n`);
console.log(`${rows.length} sounds levelled`);
