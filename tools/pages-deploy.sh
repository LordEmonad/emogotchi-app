#!/usr/bin/env bash
# Build the site and copy it into the GitHub Pages checkout.
#   PAGES=<path to the LordEmonad/emogotchi clone> bash tools/pages-deploy.sh "<commit message>"
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="${PAGES:?set PAGES to the emogotchi Pages clone}"
MSG="${1:-Site update}"
cd "$HERE"
node tools/index-named.mjs || echo "(index not refreshed: no HyperSync token; the site keeps the last one)"
pnpm build
cd "$PAGES"
rm -rf assets nft index.html og.png favicon.svg brand claim anim faq costume
cp -R "$HERE/apps/web/dist/." .
cp index.html 404.html                     # SPA fallback for /pet/<id>, which cannot be pre-generated
# Every route people share gets a real page. Without this GitHub Pages answers 404 for them: the page
# still renders through the fallback, but a 404 status breaks link previews and looks broken to crawlers.
for route in claim cats collection leaderboard nft faq costume; do
  mkdir -p "$route" && cp index.html "$route/index.html"
done
git add -A
git -c user.name="Lord Emo" -c user.email="195384316+LordEmonad@users.noreply.github.com" commit -q -m "$MSG"
git push -q origin main
echo "pushed: $(git log --oneline | head -1)"
