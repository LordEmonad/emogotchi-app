// A production build served locally the way Cloudflare serves it (tools/pages-deploy.sh's route folders are not needed:
// any path without a file answers index.html), with the site's API passed through to the live one, so a local build
// shows real pets, the gallery index and the stats. For measuring and auditing a build (tools/mobile-audit.mjs) before it
// ships. Bound to 127.0.0.1 (HOST to change it); it serves the build folder and nothing else.
//   cd apps/web && npx vite build --outDir <dir>
//   DIST=<dir> PORT=5281 node tools/serve-dist.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = resolve(process.env.DIST ?? 'apps/web/dist');
const PORT = Number(process.env.PORT ?? 5281);
const LIVE = 'https://emogotchi.emonad.lol';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const PASS = /^\/(api|u|pet|inversebrah\/pet|tung\/pet|thiccums\/pet)\//;
// text goes out gzipped, as Cloudflare sends it compressed (brotli, a little smaller still): timings taken against this
// server would otherwise be for files three or four times their real size
const TEXT = /\.(html|js|css|json|svg|txt)$/;
const zipped = new Map();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (PASS.test(url.pathname) && url.pathname.startsWith('/api/')) {
      // a POST (the starter drip) goes on with its body and its content type, which the Worker checks
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
      const headers = { accept: req.headers.accept ?? '*/*', ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}) };
      const up = await fetch(LIVE + url.pathname + url.search, { method: req.method, headers, body });
      res.writeHead(up.status, { 'content-type': up.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }
    let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!path.startsWith(DIST)) { res.writeHead(403).end(); return; }
    let s = await stat(path).catch(() => null);
    if (s?.isDirectory()) { path = join(path, 'index.html'); s = await stat(path).catch(() => null); }
    if (!s) { path = join(DIST, 'index.html'); }
    let body = await readFile(path);
    const head = { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (TEXT.test(path) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      if (!zipped.has(path)) zipped.set(path, gzipSync(body, { level: 9 }));
      body = zipped.get(path); head['content-encoding'] = 'gzip';
    }
    res.writeHead(200, head);
    res.end(body);
  } catch (e) { res.writeHead(500).end(String(e)); }
// (HOST=0.0.0.0 for a phone on the LAN: a lab demo)
}).listen(PORT, process.env.HOST ?? '127.0.0.1', () => console.log(`serving ${DIST} on http://${process.env.HOST ?? '127.0.0.1'}:${PORT} (API from ${LIVE})`));
