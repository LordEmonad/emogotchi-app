/**
 * The animated share card: a looping video of the cat doing one of its real actions.
 *
 * The cat is an SVG rig driven by the browser's animation engine, and nothing can rasterise that
 * frame by frame at video speed inside a visitor's browser. The rig looks the same for every cat
 * though, so the animations were recorded once (tools/record-anims.mjs) into one sprite sheet per
 * action, crowned and not. Playback draws those frames into the very same card the still picture
 * uses, so the two are identical apart from the cat moving.
 *
 * Recorded straight to MP4 where the browser can, because that is what X accepts for upload.
 */
import type { CatView } from '@emo-pets/chain';
import { H, PORTRAIT, W, paintCard } from './shareCard';

export type Loop = { key: string; label: string; blurb: string };

/** Every action the cat actually performs in the room, in the order the game teaches them. */
export const LOOPS: Loop[] = [
  { key: 'feed', label: 'Eating', blurb: 'walks over and empties the bowl' },
  { key: 'wash', label: 'Bath time', blurb: 'into the tub, scrubbed, shaken dry' },
  { key: 'play', label: 'Playing', blurb: 'chases the toy around the room' },
  { key: 'pet', label: 'Being petted', blurb: 'the free one' },
  { key: 'poop', label: 'Cleaning up', blurb: 'the part nobody posts' },
  { key: 'sleep', label: 'Sleeping', blurb: 'curls up, wakes up' },
  { key: 'walk', label: 'Wandering', blurb: 'pacing its room, waiting for you' },
  { key: 'die', label: 'Dying', blurb: 'what forgetting looks like' },
  { key: 'all', label: 'Everything', blurb: 'every animation, back to back' },
];

/** What `tools/pack-anims.py` writes next to the sheets. */
type Sheet = { key: string; label: string; cell: number; cols: number; rows: number; count: number; times: number[]; duration: number };

const FPS = 30;
const MIN_MS = 6000;      // a very short action loops until the clip is worth posting
const ALL_RATE = 2;       // "Everything" back to back is a minute at life speed; twice as fast reads better
const base = `${import.meta.env.BASE_URL ?? '/'}anim`.replace(/\/+anim$/, '/anim');

let index: Promise<Sheet[]> | null = null;
const sheets = new Map<string, Promise<HTMLImageElement>>();

const manifest = () => (index ??= fetch(`${base}/anim.json`).then((r) => {
  if (!r.ok) throw new Error('the animations are not on this server');
  return r.json() as Promise<Sheet[]>;
}));

const sheetImage = (key: string) => {
  let p = sheets.get(key);
  if (!p) {
    p = new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error('could not load the animation'));
      i.src = `${base}/${key}.png`;
    });
    sheets.set(key, p);
  }
  return p;
};

/** Which recorded clips a chosen loop plays, in order. */
const plan = (loop: Loop, crowned: boolean) => {
  const keys = loop.key === 'all' ? LOOPS.filter((l) => l.key !== 'all').map((l) => l.key) : [loop.key];
  return keys.map((k) => (crowned ? `${k}-crown` : k));
};

/** The frame showing at `ms` into a clip: the recorder's timestamps are uneven, so this walks them. */
const frameAt = (sheet: Sheet, ms: number) => {
  const t = sheet.times;
  let lo = 0, hi = t.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t[mid]! <= ms) lo = mid; else hi = mid - 1; }
  return lo;
};

/** Everything needed to draw the loop at any moment: one paint call and how long a cycle runs. */
type Player = { paint: (ms: number) => void; total: number };

async function buildPlayer(cat: CatView, loop: Loop, x: CanvasRenderingContext2D): Promise<Player> {
  const all = await manifest();
  const clips = plan(loop, cat.crowned).map((k) => {
    const s = all.find((c) => c.key === k) ?? all.find((c) => c.key === k.replace('-crown', ''));
    if (!s) throw new Error('that animation is missing');
    return s;
  });
  const images = await Promise.all(clips.map((c) => sheetImage(c.key)));

  // how long each clip plays for, and the whole thing
  const rate = loop.key === 'all' ? ALL_RATE : 1;
  const spans = clips.map((c) => {
    const one = c.duration / rate;
    const reps = clips.length === 1 ? Math.max(1, Math.ceil(MIN_MS / one)) : 1;
    return { play: one * reps, one };
  });
  const total = spans.reduce((a, s) => a + s.play, 0);

  const paint = (ms: number) => {
    // find which clip is on screen, and where inside it
    let i = 0, into = Math.min(Math.max(0, ms), total - 1);
    while (i < spans.length - 1 && into >= spans[i]!.play) { into -= spans[i]!.play; i += 1; }
    const clip = clips[i]!, img = images[i]!;
    const f = frameAt(clip, (into % spans[i]!.one) * rate);
    const sx = (f % clip.cols) * clip.cell;
    const sy = Math.floor(f / clip.cols) * clip.cell;
    paintCard(x, cat, (c) => c.drawImage(img, sx, sy, clip.cell, clip.cell, PORTRAIT.x, PORTRAIT.y, PORTRAIT.size, PORTRAIT.size));
  };
  return { paint, total };
}

/**
 * Play the loop into a canvas on the page, so choosing an animation shows it at once. Recording a
 * clip has to run in real time; looking at one does not. Returns a function that stops it.
 */
export async function playShareLoop(canvas: HTMLCanvasElement, cat: CatView, loop: Loop): Promise<() => void> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d')!;
  const player = await buildPlayer(cat, loop, x);
  let raf = 0;
  const t0 = performance.now();
  const tick = () => { player.paint((performance.now() - t0) % player.total); raf = requestAnimationFrame(tick); };
  tick();
  return () => cancelAnimationFrame(raf);
}

/**
 * Record one cycle to a file. This runs in real time, because that is the only way a browser will
 * encode a canvas, so `onProgress` is 0..1 and the wait is as long as the clip.
 */
export async function recordShareVideo(
  cat: CatView,
  loop: Loop,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; type: 'mp4' | 'webm' }> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  const { paint, total } = await buildPlayer(cat, loop, x);

  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot record video. Use the still card instead.');

  paint(0);
  const stream = cv.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();

  await new Promise<void>((done) => {
    const t0 = performance.now();
    const tick = () => {
      const ms = performance.now() - t0;
      if (ms >= total) { paint(total - 1); done(); return; }
      paint(ms);
      onProgress?.(Math.min(1, ms / total));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 120));
  const blob = await new Promise<Blob>((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: mime })); rec.stop(); });
  onProgress?.(1);
  return { blob, type: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/** Roughly how long a chosen loop will take to record, for the waiting message. */
export async function loopSeconds(loop: Loop, crowned: boolean): Promise<number> {
  const all = await manifest();
  const rate = loop.key === 'all' ? ALL_RATE : 1;
  const clips = plan(loop, crowned)
    .map((k) => all.find((c) => c.key === k) ?? all.find((c) => c.key === k.replace('-crown', '')))
    .filter(Boolean) as Sheet[];
  const ms = clips.reduce((a, c) => {
    const one = c.duration / rate;
    return a + (clips.length === 1 ? one * Math.max(1, Math.ceil(MIN_MS / one)) : one);
  }, 0);
  return Math.round(ms / 1000);
}
