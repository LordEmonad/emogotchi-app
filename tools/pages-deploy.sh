#!/usr/bin/env bash
# Build the site and copy it into the GitHub Pages checkout.
#   PAGES=<path to the LordEmonad/emogotchi clone> bash tools/pages-deploy.sh "<commit message>"
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="${PAGES:?set PAGES to the emogotchi Pages clone}"
MSG="${1:-Site update}"
cd "$HERE"
node tools/index-named.mjs || echo "(index not refreshed: no HyperSync token; the site keeps the last one)"
node tools/og-stats.mjs || echo "(stats card not refreshed; the site keeps the last one)"
pnpm build
cd "$PAGES"
rm -rf assets nft index.html og.png favicon.svg brand claim anim faq costume
cp -R "$HERE/apps/web/dist/." .
cp index.html 404.html                     # SPA fallback for /pet/<id>, which cannot be pre-generated
# Every route people share gets a real page. Without this GitHub Pages answers 404 for them: the page
# still renders through the fallback, but a 404 status breaks link previews and looks broken to crawlers.
for route in claim cats pets collection leaderboard nft faq costume shop items mint inversebrah stats autocare; do
  mkdir -p "$route" && cp index.html "$route/index.html"
done
# the stats card redraws itself daily in the Pages repo: the script, its font and the workflow travel with the site
mkdir -p .github/stats-card .github/workflows
cp "$HERE/tools/og-stats.mjs" .github/stats-card/og-stats.mjs
cp "$HERE/node_modules/.pnpm/@fontsource-variable+space-grotesk@5.3.0/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2" .github/stats-card/space-grotesk.woff2
cp "$HERE/tools/stats-card.yml" .github/workflows/stats-card.yml
# the second Autocare poker (GitHub's cron, independent of Cloudflare): the keeper and its runner travel with the site;
# the workflow is a no-op until the repo variable AUTOCARE_ADDRESS and the secret AUTOCARE_KEEPER_KEY are set
mkdir -p .github/autocare
cp "$HERE/worker/keeper.js" .github/autocare/keeper.js
sed 's#../worker/keeper.js#./keeper.js#' "$HERE/tools/autocare-poke.mjs" > .github/autocare/autocare-poke.mjs
printf '{ "type": "module" }\n' > .github/autocare/package.json
cp "$HERE/tools/autocare-poke.yml" .github/workflows/autocare-poke.yml
# his pages and the stats page get their own link preview: same page, their title, their card (brand/*-og.png)
node "$HERE/tools/og-meta.mjs" mint inversebrah stats nft
mkdir -p inversebrah/pet && cp inversebrah/index.html inversebrah/pet/index.html   # /inversebrah/pet/<id> falls through 404.html, but the folder keeps the path real
git add -A
git -c user.name="Lord Emo" -c user.email="195384316+LordEmonad@users.noreply.github.com" commit -q -m "$MSG"
git push -q origin main
echo "pushed: $(git log --oneline | head -1)"
