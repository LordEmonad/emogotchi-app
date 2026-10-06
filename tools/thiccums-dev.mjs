// A strictly local dev server for Thiccums (and Emonadgotchi, the same way): the site's own Vite config, bound to this machine only (127.0.0.1), with
// Google Analytics taken out of the page, so testing him sends nothing anywhere. Nothing here is deployed.
//   cd apps/web && npx vite --config ../../tools/thiccums-dev.mjs --port 5231 --strictPort
//   then open http://127.0.0.1:5231/thiccums (his lab while his switch is off; /thiccums/lab always)
// With his switch on (VITE_THICCUMS_ADDRESS=<his contract on a fork> in the shell, plus VITE_RPC_URL=<the fork>) it is
// the site as it will be once he is launched, and his pictures, which live in thiccumsgotchi/ and not in public/ until
// launch (tools/thiccums-launch.mjs copies them), are served at the paths the site asks for them by.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';
import base from '../apps/web/vite.config.ts';

const noAnalytics = {
  name: 'local-no-analytics',
  transformIndexHtml(html) {
    return html
      .replace(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js[^"]*"><\/script>/, '')
      .replace(/<script src="\/ga\.js"><\/script>/, '');
  },
};

// the public path → where the file is in thiccumsgotchi/ (the same map tools/thiccums-launch.mjs copies by)
const ART = fileURLToPath(new URL('../thiccumsgotchi/', import.meta.url));
const MAP = [
  [/^\/nft\/thiccums\/(.+\.png)$/, (m) => join(ART, 'nft', m[1])],
  [/^\/brand\/pet\/thiccums\/(.+\.png)$/, (m) => join(ART, 'brand/ocean/pet', m[1])],
  [/^\/brand\/(thiccums-[\w-]+\.png)$/, (m) => join(ART, 'brand/ocean', m[1])],
  [/^\/thiccums\/brand\/(thiccums-[\w-]+\.png)$/, (m) => join(ART, 'brand/ocean', m[1])],
  [/^\/social\/av\/thiccums\/(.+\.webp)$/, (m) => join(ART, 'social-av', m[1])],
];
// Emonadgotchi's pictures, the same way (Thiccums' pattern: nothing of him in public/ before launch): emonadgotchi/public/
// mirrors apps/web/public/, so a request is served from there when the file exists (tools/emonad-launch.mjs copies it in)
const EG = fileURLToPath(new URL('../emonadgotchi/public/', import.meta.url));
const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json', mp4: 'video/mp4' };
const hisPictures = {
  name: 'local-thiccums-pictures',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      {
        const file = normalize(join(EG, path));
        const type = TYPES[file.split('.').pop()];
        if (type && file.startsWith(EG) && existsSync(file) && statSync(file).isFile()) {
          res.setHeader('content-type', type); res.setHeader('cache-control', 'no-cache');
          createReadStream(file).pipe(res);
          return;
        }
      }
      for (const [re, to] of MAP) {
        const m = re.exec(path); if (!m) continue;
        const file = normalize(to(m));
        if (!file.startsWith(ART) || !existsSync(file) || !statSync(file).isFile()) break;
        res.setHeader('content-type', file.endsWith('.webp') ? 'image/webp' : 'image/png');
        res.setHeader('cache-control', 'no-cache');
        createReadStream(file).pipe(res);
        return;
      }
      next();
    });
  },
};

export default (env) => {
  const c = typeof base === 'function' ? base(env) : base;
  return { ...c, plugins: [...(c.plugins ?? []), noAnalytics, hisPictures], server: { ...(c.server ?? {}), host: '127.0.0.1' } };
};
