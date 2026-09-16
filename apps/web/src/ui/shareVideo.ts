/**
 * The animated share card: a looping MP4 of one cat, recorded in the browser.
 *
 * The site's walking-and-eating animation is SVG driven by the browser's animation engine, and there
 * is no way to rasterise that frame by frame without redrawing the whole rig. What *is* on chain is
 * the cat in nine moods, so the loops here are built from those: the contract's own pictures,
 * cross-faded on a canvas with a little motion, recorded straight to MP4 because that is what X
 * accepts for upload.
 */
import type { CatView, Mood } from '@emo-pets/chain';

export type Loop = { key: string; label: string; blurb: string; moods: Mood[]; crown?: boolean };

export const LOOPS: Loop[] = [
  { key: 'day', label: 'A day in the life', blurb: 'fed, filthy, bored, then asleep', moods: ['happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'content'] },
  { key: 'neglect', label: 'Neglected', blurb: 'what happens if you forget it', moods: ['happy', 'content', 'hungry', 'sad', 'dead'] },
  { key: 'crown', label: 'Crowned', blurb: 'the cat wearing it, every mood', moods: ['content', 'happy', 'sleepy', 'sleeping'], crown: true },
  { key: 'moods', label: 'Every mood', blurb: 'all nine, in order', moods: ['content', 'happy', 'hungry', 'grubby', 'bored', 'sleepy', 'sleeping', 'sad', 'dead'] },
];

const W = 1200, H = 630, FPS = 30, HOLD = 0.9, FADE = 0.45;
const FONT = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';

const rounded = (x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) => {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
};
const loadSvg = (svg: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image();
  i.onload = () => ok(i); i.onerror = () => no(new Error('could not draw the cat'));
  i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
});

/**
 * Record the loop. `art(mood, crowned)` fetches a picture (the client caches, so each of the 18 is
 * fetched once). `onProgress` is 0..1 while recording, which takes about as long as the clip.
 */
export async function recordShareVideo(
  cat: CatView,
  loop: Loop,
  art: (mood: Mood, crowned: boolean) => Promise<string>,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; type: 'mp4' | 'webm' }> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  const crowned = loop.crown ?? cat.crowned;
  const frames = await Promise.all(loop.moods.map(async (m) => loadSvg(await art(m, crowned))));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;

  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot record video. Use the still card instead.');

  const stream = cv.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const per = HOLD + FADE;
  const total = per * frames.length;
  const totalFrames = Math.round(total * FPS);

  const paint = (t: number) => {
    // room
    const bg = x.createRadialGradient(W * 0.5, H * 0.2, 0, W * 0.5, H * 0.2, W * 0.75);
    bg.addColorStop(0, '#3a1f5c'); bg.addColorStop(0.55, '#24123f'); bg.addColorStop(1, '#170b2a');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(234,198,234,0.10)';
    for (let gy = 22; gy < H * 0.8; gy += 44) for (let gx = 22; gx < W; gx += 44) { x.beginPath(); x.arc(gx, gy, 2.4, 0, 7); x.fill(); }
    const floor = x.createLinearGradient(0, H * 0.82, 0, H);
    floor.addColorStop(0, '#2c1a44'); floor.addColorStop(1, '#150a24');
    x.fillStyle = floor; x.fillRect(0, H * 0.92, W, H);

    // which two pictures, and how far between them
    const idx = Math.floor(t / per) % frames.length;
    const into = (t % per) - HOLD;
    const mix = into <= 0 ? 0 : Math.min(1, into / FADE);
    const a = frames[idx]!, b = frames[(idx + 1) % frames.length]!;

    const size = 500, px = 50, py = (H - size) / 2;
    const bob = Math.sin(t * 1.6) * 5; // a slow breath, so a still picture still feels alive
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 40; x.shadowOffsetY = 10;
    x.fillStyle = '#24123f'; rounded(x, px, py, size, size, 28); x.fill();
    x.restore();
    x.save(); rounded(x, px, py, size, size, 28); x.clip();
    x.globalAlpha = 1 - mix; x.drawImage(a, px, py + bob, size, size);
    if (mix > 0) { x.globalAlpha = mix; x.drawImage(b, px, py + bob, size, size); }
    x.globalAlpha = 1; x.restore();
    x.strokeStyle = 'rgba(184,148,216,0.35)'; x.lineWidth = 2;
    rounded(x, px + 1, py + 1, size - 2, size - 2, 27); x.stroke();

    // copy
    const L = 580;
    x.textBaseline = 'alphabetic';
    x.font = `600 20px ${FONT}`; x.fillStyle = '#EAC6EA';
    x.fillText(loop.label.toUpperCase(), L, 150);
    const title = cat.name || `Emogotchi #${cat.id}`;
    x.font = `700 ${title.length > 16 ? 54 : 70}px ${FONT}`; x.fillStyle = '#F8F8FF';
    x.fillText(title.length > 24 ? title.slice(0, 23) + '…' : title, L, 224);
    x.font = `400 23px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.62)';
    x.fillText(`#${cat.id} · a cat that lives in a wallet`, L, 264);

    // the mood, changing with the picture
    const showing = mix > 0.5 ? loop.moods[(idx + 1) % frames.length]! : loop.moods[idx]!;
    x.font = `700 34px ${FONT}`; x.fillStyle = showing === 'dead' ? '#ff7a8a' : '#B894D8';
    x.fillText(showing, L, 344);

    // a progress rail, so the loop reads as a cycle
    const rw = 480, ry = 392;
    x.fillStyle = 'rgba(255,255,255,0.12)'; rounded(x, L, ry, rw, 8, 4); x.fill();
    const g = x.createLinearGradient(L, 0, L + rw, 0);
    g.addColorStop(0, '#B894D8'); g.addColorStop(1, '#E84D7F');
    x.fillStyle = g; rounded(x, L, ry, Math.max(10, (rw * (t % total)) / total), 8, 4); x.fill();

    x.font = `600 18px ${FONT}`; x.fillStyle = 'rgba(234,198,234,0.75)';
    x.fillText('emogotchi.emonad.lol', L, H - 90);
    x.font = `400 16px ${FONT}`; x.fillStyle = 'rgba(248,248,255,0.4)';
    x.fillText('every picture stored on Monad', L, H - 62);
  };

  paint(0);
  rec.start();
  await new Promise<void>((done) => {
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { paint(total - 0.001); done(); return; }
      paint(t);
      onProgress?.(Math.min(1, t / total));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 120));
  const blob = await new Promise<Blob>((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: mime })); rec.stop(); });
  onProgress?.(1);
  return { blob, type: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

export const videoFrames = (loop: Loop) => loop.moods.length;
