#!/usr/bin/env bash
# Build the site and copy it into the GitHub Pages checkout.
#   PAGES=<path to the LordEmonad/emogotchi clone> bash tools/pages-deploy.sh "<commit message>"
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="${PAGES:?set PAGES to the emogotchi Pages clone}"
MSG="${1:-Site update}"
cd "$HERE"
pnpm build
cd "$PAGES"
rm -rf assets nft index.html og.png favicon.svg brand claim
cp -R "$HERE/apps/web/dist/." .
cp index.html 404.html                     # SPA fallback for /leaderboard, /cats, /pet/<id>
mkdir -p claim && cp index.html claim/index.html   # /claim is also a real directory (the proof shards),
                                                   # so GitHub Pages redirects /claim → /claim/; without an
                                                   # index there it would answer 404 instead of the page
git add -A
git -c user.name="Lord Emo" -c user.email="195384316+LordEmonad@users.noreply.github.com" commit -q -m "$MSG"
git push -q origin main
echo "pushed: $(git log --oneline | head -1)"
