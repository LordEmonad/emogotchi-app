// Render the cat wearing a costume, for approval before any animation work.
//   node tools/costume-preview.mjs witchhat,robe  -> packages/pet/renders/costume.png
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wear = (process.argv[2] ?? 'witchhat,robe').split(',').filter(Boolean);
const out = root + 'packages/pet/renders/';
mkdirSync(out, { recursive: true });
// the hat rises above the cat's own viewBox, so the preview widens it
let svg = readFileSync(root + 'packages/pet/cat.svg', 'utf8')
  .replace('viewBox="0 0 200 230"', 'viewBox="-30 -46 260 296"')
  .replace(/width="200" height="230"/, 'width="780" height="888"');
// the robe is one costume in three groups: the cape, and a sleeve inside each leg
const ids = wear.flatMap((w) => (w === 'robe' ? ['robe', 'sleeveL', 'sleeveR'] : [w]));
for (const id of ids) svg = svg.replace(`<g id="${id}" class="robe" display="none">`, `<g id="${id}" class="robe">`).replace(`<g id="${id}" display="none">`, `<g id="${id}">`);
const html = `<!doctype html><html><head><style>
html,body{margin:0;width:900px;height:1000px;overflow:hidden}
body{background:radial-gradient(120% 90% at 50% 20%,#3a1f5c 0%,#24123f 55%,#170b2a 100%);display:flex;align-items:flex-end;justify-content:center}
.floor{position:absolute;left:-5%;right:-5%;top:820px;height:400px;border-radius:50% 50% 0 0/60px 60px 0 0;background:linear-gradient(180deg,#2c1a44,#1d1030 60%,#150a24);box-shadow:inset 0 4px 0 rgba(184,148,216,.16)}
.cat{position:relative;margin-bottom:40px}
</style></head><body><div class="floor"></div><div class="cat">${svg}</div></body></html>`;
writeFileSync(out + 'costume.html', html);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=900,1000', '--force-device-scale-factor=2',
  `--screenshot=${out}costume.png`, 'file://' + out + 'costume.html'], { stdio: 'ignore' });
console.log('wrote', out + 'costume.png', 'wearing', wear.join(' + '));
