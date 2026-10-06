// His face avatars, from the live card route (the baked art strips the emo hair, so the brand kit cannot draw it):
// the crowned face, the face in the emo hair, and the crowned face in the emo hair (gold hair, the crown hidden: the
// site's rule). Captured at 3x and cropped to the head, the same framing as the brand kit's face icon
// (canvas x 299..725, y 67..493 of the 1024 portrait). Dev server on 5173.
//   node tools/sahur-avatar.cjs
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] });
  const p = await b.newPage(); await p.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 3 });
  const shots = [['sahur-avatar', 'card=content&crown=1'], ['sahur-avatar-emohair', 'card=content&costume=emohair'], ['sahur-avatar-emohair-crown', 'card=content&crown=1&costume=emohair']];
  for (const [name, q] of shots) {
    await p.goto(`http://localhost:5173/nft?${q}&character=sahur`, { waitUntil: 'networkidle0' });
    await p.waitForFunction(() => window.__card_ready, { timeout: 15000 });
    await p.screenshot({ path: `/tmp/${name}-raw.png`, clip: { x: 299, y: 67, width: 426, height: 426 } });
    console.log('captured', name);
  }
  await b.close();
})();
