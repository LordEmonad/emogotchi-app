// The link-preview cards for /pet/<id>, /inversebrah/pet/<id> and /tung/pet/<id>: one 1200x630 PNG per character x
// mood x crown (54 files) under apps/web/public/brand/pet/<cat|frok|sahur>/<mood>[-crown].png. The Worker picks the right one for a
// pet from its tokenURI and writes the pet's own name and numbers into the tags; the picture carries the mood.
//   node tools/og-pets.mjs [cat|frok|sahur]   (uses the portraits under apps/web/public/nft; one kind, or all three)
//   node tools/og-pets.mjs r3tards            (his portraits in public/nft/r3tards -> public/brand/pet/r3tards)
//   node tools/og-pets.mjs thiccums           (LAB ONLY: his portraits in thiccumsgotchi/nft -> thiccumsgotchi/brand/pet/thiccums)
//   node tools/og-pets.mjs emonad             (Emonadgotchi, staged until launch: emonadgotchi/public/nft/emonad -> emonadgotchi/public/brand/pet/emonad)
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const heart = readFileSync(root + 'tools/og/card.html', 'utf8').match(/<div class="brand">(<svg[\s\S]*?<\/svg>)/)[1];
const MOODS = ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'];

// what the card says for each mood; the pet's own numbers go in the tags, not the picture
const COPY = {
  cat: {
    content: ['Doing just fine.', 'Fed, washed, played with, rested. For now. Every care is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    happy: ['Happy.', 'Somebody has been looking after this one. Every care is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    hungry: ['Hungry.', 'The bowl is empty. A meal is <b>1 MON</b>, and 80% of it burns <b>EMO</b>. Forty-eight hours without food and it dies.'],
    grubby: ['Needs a bath.', 'It is not going to wash itself. A bath is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    bored: ['Bored out of its mind.', 'A ball of yarn is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    sleepy: ['Sleepy.', 'Put it to bed. Bedtime is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    sleeping: ['Asleep.', 'Energy comes back in eight hours. Let it sleep, or wake it with a meal.'],
    sad: ['Sad.', 'Nobody has come by in a while. Everything it needs is <b>1 MON</b>, and 80% of it burns <b>EMO</b>.'],
    dead: ['Dead.', 'Forty-eight hours with no food. Written on the cat, on chain, forever. Reviving it is <b>1,000 MON</b>.'],
  },
  frok: {
    content: ['Doing just fine.', 'Fed, washed, played with, rested. Everything he needs is <b>free</b>. So is slapping him.'],
    happy: ['Happy.', 'Somebody has been looking after him. Everything he needs is <b>free</b>. So is slapping him.'],
    hungry: ['Hungry.', 'His bowl is empty. Feeding him is <b>free</b>. Then screenshot him, slap him, squeeze him, set him on fire: all free, all counted.'],
    grubby: ['Needs a bath.', 'He is not going to wash himself. A bath is <b>free</b>, like everything else you can do to him.'],
    bored: ['Bored out of his mind.', 'Play with him, it is <b>free</b>. Or abuse him: also free, counted forever.'],
    sleepy: ['Sleepy.', 'Put him to bed. It is <b>free</b>.'],
    sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
    sad: ['Sad.', 'Nobody has come by in a while. Everything he needs is <b>free</b>.'],
    dead: ['Dead.', 'Nobody fed him. Written on the frok, on chain, forever. Reviving him is <b>free</b>, so is everything else.'],
  },
  sahur: {
    content: ['Doing just fine.', 'Fed, washed, played with, rested. Everything he needs is <b>free</b>. So is the tung tung tung.'],
    happy: ['Happy.', 'Somebody has been looking after him. Everything he needs is <b>free</b>. So is the tung tung tung.'],
    hungry: ['Hungry.', 'His bowl is empty. Feeding him is <b>free</b>. Then let him knock: tung tung tung, free, counted forever.'],
    grubby: ['Needs a bath.', 'He is not going to wash himself. A bath is <b>free</b>, like everything else you can do for him.'],
    bored: ['Bored out of his mind.', 'Play with him, it is <b>free</b>. Or let him knock: tung tung tung, counted forever.'],
    sleepy: ['Sleepy.', 'Put him to bed. It is <b>free</b>.'],
    sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
    sad: ['Sad.', 'Nobody has come by in a while. Everything he needs is <b>free</b>.'],
    dead: ['Dead.', 'Nobody fed him. Written on the log, on chain, forever. Reviving him is <b>free</b>, so is everything else.'],
  },
};
COPY.thiccums = {
  content: ['Doing just fine.', 'Fed, washed, played with, rested. And that butt is <b>bouncing</b>.'],
  happy: ['Happy.', 'Somebody has been looking after him. Give it a <b>bounce</b>.'],
  hungry: ['Hungry.', 'His bowl is empty. A seal needs his fish.'],
  grubby: ['Needs a bath.', 'He is not going to wash himself.'],
  bored: ['Bored out of his mind.', 'Throw him the ball. He will head it right back.'],
  sleepy: ['Sleepy.', 'Put him to bed.'],
  sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
  sad: ['Sad.', 'Nobody has come by in a while.'],
  dead: ['Dead.', 'Nobody fed him. Written on the seal, on chain, forever.'],
};
COPY.r3tards = {
  content: ['Doing just fine.', 'Fed, washed, played with, rested. Everything he needs is <b>free</b>.'],
  happy: ['Happy.', 'Somebody has been looking after him. Everything he needs is <b>free</b>.'],
  hungry: ['Hungry.', 'His bowl is empty. Feeding him is <b>free</b>. Never let your r3tardgotchi starve.'],
  grubby: ['Needs a bath.', 'He is not going to wash himself. A bath is <b>free</b>, like everything else you can do for him.'],
  bored: ['Bored out of his mind.', 'Throw him the ball, it is <b>free</b>. He kicks it himself.'],
  sleepy: ['Sleepy.', 'Put him to bed. It is <b>free</b>.'],
  sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
  sad: ['Sad.', 'Nobody has come by in a while. Everything he needs is <b>free</b>.'],
  dead: ['Dead.', 'Nobody fed him. r3st in p3ac3. Written on chain, forever. Reviving him is <b>free</b>.'],
};
// Emonadgotchi (DRAFT COPY for the operator: the free pets' terms, nothing else claimed)
COPY.emonad = {
  content: ['Doing just fine.', 'Fed, washed, played with, rested. Everything he needs is <b>free</b>.'],
  happy: ['Happy.', 'Somebody has been looking after him. He will never admit it.'],
  hungry: ['Hungry.', 'His bowl is empty. Feeding him is <b>free</b>. Two days without food and he dies.'],
  grubby: ['Needs a bath.', 'He is not going to wash himself. A bath is <b>free</b>, like everything else you can do for him.'],
  bored: ['Bored out of his mind.', 'Throw him the ball, it is <b>free</b>.'],
  sleepy: ['Sleepy.', 'Put him to bed. It is <b>free</b>.'],
  sleeping: ['Asleep.', 'Energy comes back in eight hours. Let him sleep, or wake him with a meal.'],
  sad: ['Sad.', 'Nobody has come by in a while. Everything he needs is <b>free</b>.'],
  dead: ['Dead.', 'Nobody fed him. Written on chain, forever. Reviving him is <b>free</b>.'],
};
const EYEBROW = { cat: 'A cat that lives in your wallet', frok: 'A frok that lives in your wallet', sahur: 'Tung Tung Tung Sahur, in your wallet', thiccums: 'A seal that lives in your wallet', r3tards: 'A r3tard that lives in your wallet', emonad: 'The face of $EMO, in your wallet' };
const BRAND = { cat: 'Emogotchi', frok: 'Inversegotchi', sahur: 'Sahuragotchi', thiccums: 'Thiccumsgotchi', r3tards: 'r3tardgotchi', emonad: 'Emonadgotchi' };
const PORTRAIT = { emonad: (m, c) => `${root}emonadgotchi/public/nft/emonad/${m}${c ? '-crown' : ''}-1024.png`, r3tards: (m, c) => `${root}apps/web/public/nft/r3tards/${m}${c ? '-crown' : ''}-1024.png`, cat: (m, c) => `${root}apps/web/public/nft/${m}${c ? '-crown' : ''}-1024.png`, frok: (m, c) => `${root}apps/web/public/nft/inversebrah/${m}${c ? '-crown' : ''}-1024.png`, sahur: (m, c) => `${root}apps/web/public/nft/sahur/${m}${c ? '-crown' : ''}-1024.png`, thiccums: (m, c) => `${root}thiccumsgotchi/nft/${m}${c ? '-crown' : ''}-1024.png` };
const RING = { cat: '#E84D7F', frok: '#5da03a', sahur: '#d2822e', thiccums: '#6fb7e8', r3tards: '#e6cf5a', emonad: '#c4a0f2' };
const CARDS = (kind) => kind === 'thiccums' ? `${root}thiccumsgotchi/brand/pet/${kind}` : kind === 'emonad' ? `${root}emonadgotchi/public/brand/pet/emonad` : `${root}apps/web/public/brand/pet/${kind}`;

const page = (kind, mood, crown) => {
  const [h1, sub] = COPY[kind][mood];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'SG'; src: url('file://${font}') format('woff2'); font-weight: 300 700; }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; background:#000; font-family:'SG',sans-serif; color:#F8F8FF; -webkit-font-smoothing:antialiased; }
.card { position:relative; width:1200px; height:630px; overflow:hidden; background: radial-gradient(120% 90% at 50% 20%, #3a1f5c 0%, #24123f 55%, #170b2a 100%); }
.dots { position:absolute; inset:0; background-image: radial-gradient(rgba(234,198,234,0.13) 2.6px, transparent 2.8px); background-size:44px 44px; -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.25) 70%, transparent); }
.glow { position:absolute; right:-80px; top:-80px; width:700px; height:700px; border-radius:50%; background: radial-gradient(closest-side, ${RING[kind]}44, transparent 70%); }
.copy { position:absolute; left:72px; top:0; height:630px; width:600px; display:flex; flex-direction:column; justify-content:center; gap:22px; padding-bottom:16px; }
.brand { display:flex; align-items:center; gap:14px; font-weight:700; font-size:44px; letter-spacing:-.02em; }
.brand svg { width:40px; height:40px; }
.eyebrow { display:inline-flex; align-self:flex-start; padding:8px 16px; border-radius:999px; font-size:16px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#EAC6EA; background:rgba(80,40,88,.45); border:1px solid rgba(184,148,216,.3); }
h1 { margin:0; font-size:${h1.length > 15 ? 66 : 84}px; line-height:1.02; letter-spacing:-.03em; font-weight:700; background: linear-gradient(90deg,#ff7aa6,#E84D7F 45%,#B894D8); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sub { margin:0; font-size:23px; line-height:1.4; color:rgba(248,248,255,.8); max-width:560px; } .sub b { color:#F8F8FF; font-weight:600; }
.foot { position:absolute; left:72px; bottom:36px; font-size:18px; color:rgba(234,198,234,.75); } .foot b { color:#EAC6EA; font-weight:600; }
.pic { position:absolute; right:60px; top:65px; width:500px; height:500px; border-radius:56px; background:#1a1024; border:5px solid ${RING[kind]}; box-shadow: 0 0 0 10px ${RING[kind]}33, 0 40px 80px -30px rgba(0,0,0,.9); overflow:hidden; }
.pic img { display:block; width:100%; height:100%; }
.crown { position:absolute; right:60px; top:36px; display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:999px; font-size:16px; font-weight:700; color:#1a0620; background:#E8D89B; box-shadow:0 8px 24px -8px rgba(0,0,0,.8); z-index:2; }
${mood === 'dead' ? '.pic { filter: saturate(.7); border-color: rgba(248,248,255,.35); box-shadow: 0 0 0 10px rgba(248,248,255,.08), 0 40px 80px -30px rgba(0,0,0,.9); } .glow { background: radial-gradient(closest-side, rgba(184,148,216,.25), transparent 70%); }' : ''}
</style></head><body><div class="card">
<div class="dots"></div><div class="glow"></div>
<div class="copy">
  <div class="brand">${heart} ${BRAND[kind]}</div>
  <div class="eyebrow">${EYEBROW[kind]}</div>
  <h1>${h1}</h1>
  <p class="sub">${sub}</p>
</div>
${crown ? '<div class="crown">♛ Wears the crown</div>' : ''}
<div class="pic"><img src="file://${PORTRAIT[kind](mood, crown)}"></div>
<div class="foot"><b>$EMO</b> on Monad · emogotchi.emonad.lol</div>
</div></body></html>`;
};

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await browser.newPage();
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
let n = 0; const tmp = root + 'tools/og/.pet.rendered.html';
const KINDS = process.argv[2] ? [process.argv[2]] : ['cat', 'frok', 'sahur'];
for (const kind of KINDS) {
  mkdirSync(CARDS(kind), { recursive: true });
  for (const mood of MOODS) for (const crown of [false, true]) {
    writeFileSync(tmp, page(kind, mood, crown));   // a file:// page may load file:// portraits; about:blank may not
    await p.goto('file://' + tmp, { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${CARDS(kind)}/${mood}${crown ? '-crown' : ''}.png` });
    n++;
  }
}
await browser.close(); unlinkSync(tmp);
console.log(`wrote ${n} cards under ${KINDS.map(CARDS).join(", ")}`);
