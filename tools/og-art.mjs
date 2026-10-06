// The /nft link preview (apps/web/public/brand/art-og.png, 1200x630 at 2x): three states of each of the four pets,
// read from their art contracts on mainnet, beside the card copy. The art is immutable, so this runs once per pet
// added; re-run only if the copy or the pets change.   node tools/og-art.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { monad } from 'viem/chains';

const root = fileURLToPath(new URL('..', import.meta.url));
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];
// a column a pet, top to bottom: [mood, crowned]
const PETS = [
  ['0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5', [['content', true], ['hungry', false], ['sleeping', false]]],    // the cat
  ['0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6', [['happy', true], ['bored', false], ['dead', false]]],          // inversebrah
  ['0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7', [['content', true], ['grubby', false], ['sad', false]]],        // Tung Tung Tung Sahur
  ['0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec', [['happy', true], ['sleepy', false], ['content', false]]],      // Thiccums
];
const pub = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
const imageAbi = [{ type: 'function', name: 'image', stateMutability: 'view', inputs: [{ name: 'mood', type: 'uint8' }, { name: 'crowned', type: 'bool' }], outputs: [{ type: 'string' }] }];
const tiles = [];   // row by row for the grid: tiles[row * 4 + pet]
for (const [p, [game, states]] of PETS.entries()) {
  const art = await pub.readContract({ address: game, abi: [{ type: 'function', name: 'ART', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }], functionName: 'ART' });
  for (const [row, [mood, crowned]] of states.entries()) tiles[row * 4 + p] = { svg: await pub.readContract({ address: art, abi: imageAbi, functionName: 'image', args: [MOODS.indexOf(mood), crowned] }), label: mood === 'dead' ? 'ghost' : mood };
  console.log('read', states.length, 'images from', art);
}

const card = readFileSync(root + 'tools/og/card.html', 'utf8');
const brand = card.slice(card.indexOf('<div class="brand">'), card.indexOf('</svg>', card.indexOf('<div class="brand">')) + 6) + '<span>Emogotchi</span></div>';
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const tile = ({ svg, label }) => `<figure><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="1024" height="1024"><figcaption>${label}</figcaption></figure>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'SG'; src: url('file://${font}') format('woff2'); font-weight: 300 700; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; background:#000; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:1200px; height:630px; overflow:hidden; background: radial-gradient(120% 90% at 50% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%); }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) 2.6px, transparent 2.8px); background-size:44px 44px; -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 70%, transparent); }
.copy { position:absolute; left:64px; top:0; height:630px; width:470px; display:flex; flex-direction:column; justify-content:center; gap:20px; }
.brand { display:flex; align-items:center; gap:14px; font-weight:700; font-size:40px; letter-spacing:-.02em; } .brand svg { width:36px; height:36px; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:8px 16px; border-radius:999px; font-size:15px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; font-size:62px; line-height:1.02; letter-spacing:-.03em; font-weight:700; }
h1 .grad { background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:20px; line-height:1.4; color:rgba(248,248,255,.78); max-width:470px; } .sub b { color:#F8F8FF; font-weight:600; }
.grid { position:absolute; right:48px; top:50%; transform:translateY(-50%); display:grid; grid-template-columns:repeat(4, 142px); gap:12px; }
figure { margin:0; position:relative; width:142px; height:142px; border-radius:20px; overflow:hidden; background:#24123f; box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(184,148,216,.22); }
figure img { display:block; width:100%; height:100%; }
figcaption { position:absolute; left:0; right:0; bottom:0; padding:20px 0 7px; text-align:center; font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:rgba(248,248,255,.85); background: linear-gradient(180deg, transparent, rgba(23,11,42,.85)); }
</style></head><body><div class="card"><div class="dots"></div>
<div class="copy">${brand}<div class="eyebrow">Every state, on chain</div>
<h1>The art, from<br><span class="grad">the contract.</span></h1>
<p class="sub">Nine moods and a crown for every pet, composed by the contract from its live state. <b>No IPFS, no server.</b> Save one, wear it.</p></div>
<div class="grid">${tiles.map(tile).join('')}</div></div></body></html>`;
const tmp = root + 'tools/og/.art.rendered.html';
writeFileSync(tmp, html);
const out = root + 'apps/web/public/brand/art-og.png';
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630', '--force-device-scale-factor=2', `--screenshot=${out}`, 'file://' + tmp], { stdio: 'ignore' });
unlinkSync(tmp);
console.log('wrote', out);
