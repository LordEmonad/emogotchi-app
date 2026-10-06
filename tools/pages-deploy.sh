#!/usr/bin/env bash
# Build the site and publish it: to Cloudflare (the site Worker, ../site, which is what serves emogotchi.emonad.lol since
# 2026-09-28) and, as the backup the route can fall back to, to the GitHub Pages checkout.
#   PAGES=<path to the LordEmonad/emogotchi clone> bash tools/pages-deploy.sh "<commit message>"
# The site is assembled in the Pages checkout (as it always was), copied to .site-stage without git's files, and deployed
# with `wrangler deploy` in site/. Roll the domain back to GitHub with tools/site-rollback.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="${PAGES:?set PAGES to the emogotchi Pages clone}"
MSG="${1:-Site update}"
cd "$HERE"
node tools/index-named.mjs || echo "(index not refreshed: no HyperSync token; the site keeps the last one)"
# (the /stats share card is a still picture now, drawn once by tools/og-stats.mjs and committed; nothing to redraw here)
# The contract addresses in apps/web/.env.local decide which contracts the passkey wallet treats as "known", and a
# known contract is the only kind whose calls can ever be signed without a confirmation sheet. A wrong address there
# would hand that trust to something else, so the deploy refuses to ship one that is not the deployed mainnet set.
check_addr() {
  local name="$1" want="$2" got
  got=$(grep -E "^$name=" "$HERE/apps/web/.env.local" | cut -d= -f2 | tr -d '[:space:]')
  if [ "$(printf '%s' "$got" | tr 'A-Z' 'a-z')" != "$(printf '%s' "$want" | tr 'A-Z' 'a-z')" ]; then
    echo "REFUSING TO DEPLOY: $name is $got, expected $want (see CLAUDE.md)" >&2; exit 1
  fi
}
check_addr VITE_CHAIN_ID 143
check_addr VITE_CONTRACT_ADDRESS 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5
check_addr VITE_DROP_ADDRESS 0x84C44C53C6c130D25242d9aA1e6f491A812b5F22
check_addr VITE_ITEMS_ADDRESS 0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91
check_addr VITE_INVERSE_ADDRESS 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6
# Sahuragotchi: once deployed, put its mainnet address here AND in .env.local; the deploy then insists they match.
# Until then the variable must be absent or empty (a build with no Sahur), never some other address.
SAHUR_ADDRESS="0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7"
got_sahur=$(grep -E "^VITE_SAHUR_ADDRESS=" "$HERE/apps/web/.env.local" | cut -d= -f2 | tr -d '[:space:]' || true)
if [ -n "$SAHUR_ADDRESS" ] || [ -n "$got_sahur" ]; then check_addr VITE_SAHUR_ADDRESS "$SAHUR_ADDRESS"; fi
# Thiccumsgotchi, the fourth pet: NOT LAUNCHED. Until his contract is deployed this stays empty and so must
# VITE_THICCUMS_ADDRESS, and the build must carry nothing of him (checked after the build). At launch,
# tools/thiccums-launch.mjs writes his address here and in .env.local.
THICCUMS_ADDRESS="0xbB2E3dd43350744F9764329c2C7A2CE87D9889Ec"
got_thiccums=$(grep -E "^VITE_THICCUMS_ADDRESS=" "$HERE/apps/web/.env.local" | cut -d= -f2 | tr -d '[:space:]' || true)
if [ -n "$THICCUMS_ADDRESS" ] || [ -n "$got_thiccums" ]; then check_addr VITE_THICCUMS_ADDRESS "$THICCUMS_ADDRESS"; fi
# r3tardgotchi, the fifth pet: NOT LAUNCHED. His mint page (/r3tardgotchi) is on the site as "Coming soon"; the rest of him is
# behind the build's __R3TARDS__ switch (VITE_R3TARDS_ADDRESS). At launch tools/r3tards-launch.mjs writes his address here
# and in .env.local, and the two must then match.
R3TARDS_ADDRESS="0x41841b6F2F1750AB32C86C25aB2816F4996bf41e"
got_r3tards=$(grep -E "^VITE_R3TARDS_ADDRESS=" "$HERE/apps/web/.env.local" | cut -d= -f2 | tr -d '[:space:]' || true)
if [ -n "$R3TARDS_ADDRESS" ] || [ -n "$got_r3tards" ]; then check_addr VITE_R3TARDS_ADDRESS "$R3TARDS_ADDRESS"; fi
# Emonadgotchi, the sixth pet: NOT LAUNCHED. Thiccums' way: nothing of him ships until launch (his mint page included), every
# line of him is behind the build's __EMONAD__ switch (VITE_EMONAD_ADDRESS) and his pictures are staged in emonadgotchi/public/.
# At launch tools/emonad-launch.mjs writes his address here and in .env.local (they must match) and copies the pictures in.
EMONAD_ADDRESS="0xcD4BF1Ea169703f810dA87680a1B8FdA64adcdF7"
got_emonad=$(grep -E "^VITE_EMONAD_ADDRESS=" "$HERE/apps/web/.env.local" | cut -d= -f2 | tr -d '[:space:]' || true)
if [ -n "$EMONAD_ADDRESS" ] || [ -n "$got_emonad" ]; then check_addr VITE_EMONAD_ADDRESS "$EMONAD_ADDRESS"; fi
# The other settings that decide what this origin trusts (security review, 2026-09-27). An Autocare address makes a
# contract "known" to the passkey wallet (silent calls, and setApprovalForAll to it described as the Autocare machine),
# so until Autocare is deployed and reviewed it must be absent; the RPC and the media host feed the CSP; the passkey
# flag is on for everyone.
only_or_absent() {
  local name="$1" want="$2" got
  got=$(grep -E "^$name=" "$HERE/apps/web/.env.local" | cut -d= -f2- | tr -d '[:space:]' || true)
  if [ -n "$got" ] && [ "$got" != "$want" ]; then echo "REFUSING TO DEPLOY: $name is $got, expected ${want:-nothing}" >&2; exit 1; fi
}
only_or_absent VITE_AUTOCARE_ADDRESS ""
only_or_absent VITE_SOCIAL_API ""
only_or_absent VITE_RPC_URL "https://rpc.monad.xyz"
only_or_absent VITE_MEDIA_ORIGIN "https://emotown-media.emonad.lol"
check_addr VITE_PASSKEY on
# Fight Club (contracts/src/fightclub, deployed 2026-09-30, block 109439943, Sourcify exact_match): the one address the site
# may fight through. A different one here would be a different contract taking people's stakes.
check_addr VITE_FIGHTCLUB_ADDRESS 0x996b7Af41570a6eAd15d2749B718edD4C138cE06
# "Add MON from another chain" (CROSSCHAIN.md): absent or off = the feature does not exist; link = only a browser sent
# ?topup=1; on = everyone. Anything else is a typo that would quietly ship it off (or on). Its local-Worker proxy is dev only.
got_topup=$(grep -E "^VITE_TOPUP=" "$HERE/apps/web/.env.local" | cut -d= -f2- | tr -d '[:space:]' || true)
case "$got_topup" in ''|off|link|on) ;; *) echo "REFUSING TO DEPLOY: VITE_TOPUP is $got_topup, expected off, link or on" >&2; exit 1;; esac
only_or_absent VITE_TOPUP_API ""
# .env.local is the one file this build may read: Vite would let .env, .env.production(.local) and any VITE_ variable
# exported in this shell override it, all unseen by the checks above.
for f in .env .env.production .env.production.local; do
  if [ -e "$HERE/apps/web/$f" ]; then echo "REFUSING TO DEPLOY: apps/web/$f exists; only .env.local may configure the site" >&2; exit 1; fi
done
for v in $(compgen -e | grep '^VITE_' || true); do unset "$v"; done

# build exactly what the lockfile pins: this bundle derives private keys, so it is not "whatever is
# in node_modules today"
pnpm install --frozen-lockfile
pnpm build
# and check the bundle itself: every contract address made it in, and the CSP names only the production hosts
for a in 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5 0x84C44C53C6c130D25242d9aA1e6f491A812b5F22 0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6 "$SAHUR_ADDRESS" $THICCUMS_ADDRESS $R3TARDS_ADDRESS $EMONAD_ADDRESS; do
  grep -rqi "$a" "$HERE/apps/web/dist/assets" || { echo "REFUSING TO DEPLOY: $a is not in the built bundle" >&2; exit 1; }
done
# the fourth pet before his launch: not one mention of him may ship (the operator's rule; every line of the site that
# names him sits behind the build's __THICCUMS__ switch, and his files live outside public/ until launch)
if [ -z "$THICCUMS_ADDRESS" ] && grep -rqil 'thicc' "$HERE/apps/web/dist"; then
  echo "REFUSING TO DEPLOY: the build mentions Thiccums, who is not launched: $(grep -rlil 'thicc' "$HERE/apps/web/dist" | head -5 | tr '\n' ' ')" >&2; exit 1
fi
# the sixth pet before his launch, the same rule: his name, his shoulders' ids or his drawing's character in any built file
if [ -z "$EMONAD_ADDRESS" ] && grep -rqilE 'emonadgotchi|egshoulder|data-character=.emonad' "$HERE/apps/web/dist"; then
  echo "REFUSING TO DEPLOY: the build mentions Emonadgotchi, who is not launched: $(grep -rlilE 'emonadgotchi|egshoulder|data-character=.emonad' "$HERE/apps/web/dist" | head -5 | tr '\n' ' ')" >&2; exit 1
fi
# sound (apps/web/src/sound): built 2026-10-02 and NOT approved by the operator yet, who tests it locally first. A
# production build has it only with VITE_SOUND=on in .env.local; the deploy refuses such a build unless SHIP_SOUND=1 says
# it is meant (and refuses the other way round too: SHIP_SOUND=1 with no sound in the build is a mistake).
if grep -rqlE 'createConvolver|createOscillator' "$HERE/apps/web/dist/assets"; then
  [ "${SHIP_SOUND:-}" = 1 ] || { echo "REFUSING TO DEPLOY: the build has the sound engine in it (VITE_SOUND=on) and SHIP_SOUND=1 was not given" >&2; exit 1; }
elif [ "${SHIP_SOUND:-}" = 1 ]; then
  echo "REFUSING TO DEPLOY: SHIP_SOUND=1, but the build has no sound in it (set VITE_SOUND=on in apps/web/.env.local)" >&2; exit 1
fi
if grep -Eo 'Content-Security-Policy" content="[^"]*' "$HERE/apps/web/dist/index.html" | grep -Eqi 'localhost|127\.0\.0\.1|trycloudflare|http://'; then
  echo "REFUSING TO DEPLOY: the built CSP names a non-production host" >&2; exit 1
fi
# which source made this build, for the Pages commit: the source repo's commit, how many files differ from it, and a
# hash over every file that goes into the bundle (commit the source repo so the hash can be matched later)
SRC_REV=$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo none)
SRC_DIRTY=$(git -C "$HERE" status --porcelain -- apps/web packages worker 2>/dev/null | wc -l | tr -d ' ')
SRC_HASH=$(cd "$HERE" && { git ls-files -z -co --exclude-standard -- apps/web/src apps/web/index.html apps/web/vite.config.ts apps/web/package.json apps/web/public/ga.js packages/chain/src packages/pet/cat.svg packages/pet/frog.svg packages/pet/sahur.svg pnpm-lock.yaml; printf 'apps/web/.env.local\0'; } | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -c1-16)
cd "$PAGES"
# (pfp: a regenerated picture set must replace the old one whole; without this the 253 thumbnails of the first set
# stayed on the site after the 2026-10-01 revamp renamed them)
rm -rf assets nft index.html og.png favicon.svg brand claim anim faq costume pfp
cp -R "$HERE/apps/web/dist/." .
cp index.html 404.html                     # SPA fallback for /pet/<id>, which cannot be pre-generated
# Every route people share gets a real page. Without this GitHub Pages answers 404 for them: the page
# still renders through the fallback, but a 404 status breaks link previews and looks broken to crawlers.
for route in claim cats pets collection leaderboard nft faq costume shop items shop/jewish shop/habibi shop/emo mint inversebrah tung stats pfps autocare refer r1 emotown town adopt fightclub r3tardgotchi ${THICCUMS_ADDRESS:+thiccums} ${EMONAD_ADDRESS:+emonadgotchi}; do
  mkdir -p "$route" && cp index.html "$route/index.html"
done
# The r1 keeps its recovery phrase in this origin's localStorage (the device has no WebAuthn), so ITS page runs no
# third-party script at all: no Google tag, and a CSP that allows none (security review, 2026-09-27). Refuses to go on
# if any trace is left.
node -e '
const fs = require("fs"); const p = "r1/index.html"; let h = fs.readFileSync(p, "utf8");
h = h.replace(/<!-- Google Analytics[\s\S]*?<script src="\/ga\.js"><\/script>\s*/, "");
h = h.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)/, (m, a, c) => a + c.split(";").map((d) => d.trim().split(/\s+/).filter((t) => !/googletagmanager|google-analytics|analytics\.google/.test(t)).join(" ")).filter(Boolean).join("; "));
if (/googletagmanager|google-analytics|ga\.js|G-4QWLXTDH20/.test(h)) { console.error("the r1 page still has Google Analytics in it"); process.exit(1); }
fs.writeFileSync(p, h);
' || exit 1
# The stats card used to redraw itself daily through a GitHub Action in the Pages repo. The site is on Cloudflare now,
# where a commit changes nothing, and a daily deploy would need a Cloudflare key in GitHub; since 2026-09-28 the card has
# no numbers at all, so the Action is simply gone.
rm -rf .github/stats-card .github/workflows/stats-card.yml
mkdir -p .github/workflows
# the second Autocare poker (GitHub's cron, independent of Cloudflare): the keeper and its runner travel with the site;
# the workflow is a no-op until the repo variable AUTOCARE_ADDRESS and the secret AUTOCARE_KEEPER_KEY are set
mkdir -p .github/autocare
cp "$HERE/worker/keeper.js" .github/autocare/keeper.js
sed 's#../worker/keeper.js#./keeper.js#' "$HERE/tools/autocare-poke.mjs" > .github/autocare/autocare-poke.mjs
printf '{ "type": "module" }\n' > .github/autocare/package.json
cp "$HERE/tools/autocare-poke.yml" .github/workflows/autocare-poke.yml
# his pages and the stats page get their own link preview: same page, their title, their card (brand/*-og.png)
node "$HERE/tools/og-meta.mjs" mint inversebrah tung stats nft pfps emotown town shop/jewish shop/habibi shop/emo adopt pets cats fightclub r3tardgotchi ${THICCUMS_ADDRESS:+thiccums} ${EMONAD_ADDRESS:+emonadgotchi}
mkdir -p inversebrah/pet && cp inversebrah/index.html inversebrah/pet/index.html   # /inversebrah/pet/<id> falls through 404.html, but the folder keeps the path real
mkdir -p tung/pet && cp tung/index.html tung/pet/index.html
if [ -n "$THICCUMS_ADDRESS" ]; then mkdir -p thiccums/pet && cp thiccums/index.html thiccums/pet/index.html; fi
if [ -n "$R3TARDS_ADDRESS" ]; then mkdir -p r3tardgotchi/pet && cp r3tardgotchi/index.html r3tardgotchi/pet/index.html; fi
if [ -n "$EMONAD_ADDRESS" ]; then mkdir -p emonadgotchi/pet && cp emonadgotchi/index.html emonadgotchi/pet/index.html; fi
# macOS writes "._name" AppleDouble files (4 KB of extended attributes) beside files on this external drive, and the
# copy above carried them onto the site: 5,557 of them were being served (found 2026-09-27). None is ever a real file.
find . -name '._*' -not -path './.git/*' -delete
find . -name '.DS_Store' -not -path './.git/*' -delete
# no Jekyll: it would silently drop any file whose name starts with "_" (a Rollup chunk can), breaking the site
touch .nojekyll
# Cloudflare first: the same files, less what is git's or GitHub's, plus the headers GitHub could never send
STAGE="$HERE/.site-stage"
rsync -a --delete --exclude .git --exclude .github --exclude CNAME --exclude .nojekyll --exclude '._*' --exclude .DS_Store ./ "$STAGE/"
cp "$HERE/site/_headers" "$STAGE/_headers"
(cd "$HERE/site" && npx wrangler deploy)
# then the GitHub copy, kept current so a rollback serves this same build
git add -A
git -c user.name="Lord Emo" -c user.email="195384316+LordEmonad@users.noreply.github.com" commit -q -m "$MSG" -m "source: $SRC_REV (+$SRC_DIRTY changed files), inputs sha256 $SRC_HASH"
git push -q origin main
echo "pushed: $(git log --oneline | head -1)"
