#!/usr/bin/env bash
# Hand emogotchi.emonad.lol back to GitHub Pages in one step (the DNS record still points there).
#   bash tools/site-rollback.sh
# `wrangler deploy` REPLACES a Worker's routes whenever it is given at least one, and leaves them alone when given none,
# so an empty list cannot remove the site's route: this deploys the site Worker with only a parked route nobody uses,
# which takes emogotchi.emonad.lol/* off it. The API Worker's own routes (/api/*, /pet/*, /u/*...) are untouched.
# Tested 2026-09-28 (a route taken off this way was back on GitHub within seconds). To return: `npx wrangler deploy`
# in site/, whose config carries the real route.
set -euo pipefail
cd "$(dirname "$0")/../site"
npx wrangler deploy --route "emogotchi.emonad.lol/__parked/*"
echo "emogotchi.emonad.lol is served by GitHub Pages again"
