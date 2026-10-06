// Plays a rendered film back in Chrome and looks at it: its length and size as the player reports them, and frames
// pulled out of the FILE (not the compositor) at even steps, as a contact sheet.
//   node tools/trailer/check.mjs <film.mp4> <sheet.png> [every seconds=2] [cols=5] [thumb width=380] [from s] [to s]
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHROME } from './lib.mjs';
const [file, out, every = 2, cols = 5, tw = 380, from = 0, to = 1e9] = process.argv.slice(2);
const path = resolve(file);
const size = statSync(path).size;
const server = createServer((req, res) => {
  if (req.url.startsWith('/film')) {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    const a = m ? Number(m[1]) : 0, b = m && m[2] ? Number(m[2]) : size - 1;
    res.writeHead(m ? 206 : 200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': b - a + 1, ...(m ? { 'content-range': `bytes ${a}-${b}/${size}` } : {}) });
    createReadStream(path, { start: a, end: b }).pipe(res);
  } else res.writeHead(200, { 'content-type': 'text/html' }).end('<body style="margin:0;background:#222"><video id="v" src="/film" muted preload="auto"></video>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 0 });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const info = await page.evaluate(() => new Promise((ok, no) => { const v = document.getElementById('v'); const done = () => ok({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }); if (v.readyState >= 1) done(); else { v.onloadedmetadata = done; v.onerror = () => no(new Error('the player cannot read the file')); } }));
console.log(`${file}: ${(size / 1048576).toFixed(1)} MB, ${info.duration.toFixed(2)}s, ${info.w}x${info.h}, ${(size * 8 / info.duration / 1e6).toFixed(1)} Mbps`);
const b64 = await page.evaluate(async (every, cols, tw, from, to) => {
  const v = document.getElementById('v');
  const times = []; for (let t = from; t < Math.min(to, v.duration); t += every) times.push(t);
  const th = Math.round(tw * v.videoHeight / v.videoWidth);
  const cv = document.createElement('canvas'); cv.width = cols * (tw + 6) + 6; cv.height = Math.ceil(times.length / cols) * (th + 22) + 6;
  const x = cv.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, cv.width, cv.height); x.font = '12px monospace'; x.imageSmoothingQuality = 'high';
  for (let i = 0; i < times.length; i += 1) {
    await new Promise((ok) => { v.onseeked = ok; v.currentTime = times[i] + 0.001; });
    await new Promise((ok) => setTimeout(ok, 40));
    const px = 6 + (i % cols) * (tw + 6), py = 6 + Math.floor(i / cols) * (th + 22);
    x.drawImage(v, px, py, tw, th); x.fillStyle = '#ccc'; x.fillText(times[i].toFixed(2) + 's', px, py + th + 14);
  }
  return cv.toDataURL('image/png').slice(22);
}, Number(every), Number(cols), Number(tw), Number(from), Number(to));
writeFileSync(out, Buffer.from(b64, 'base64'));
await browser.close(); server.close();
