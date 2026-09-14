// Renders the share card (apps/web/public/og.png, 1200x630 at 2x) from tools/og/card.html with the site's
// font and the crowned happy cat from contracts/art. node tools/og-card.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const font = root + 'node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2';
const html = readFileSync(root + 'tools/og/card.html', 'utf8').replace('FONT_URL', 'file://' + font);
const tmp = root + 'tools/og/.card.rendered.html';
writeFileSync(tmp, html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630', '--force-device-scale-factor=2', `--screenshot=${root}apps/web/public/og.png`, 'file://' + tmp], { stdio: 'ignore' });
console.log('wrote apps/web/public/og.png');
