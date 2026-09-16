/**
 * The animated share card: a looping video of the cat doing one of its real actions.
 *
 * The cat is an SVG rig driven by the browser's animation engine, and nothing can rasterise that
 * frame by frame at video speed inside a visitor's browser. The rig looks the same for every cat
 * though, so the animations were recorded once at 60fps (tools/record-anims.mjs), crowned and not.
 * Playback draws those clips into the very same card the still picture uses, so the two are identical
 * apart from the cat moving.
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

/** What `tools/record-anims.mjs` writes next to the clips. */
type Clip = { key: string; label: string; crown: boolean; file: string; duration: number; frames: number };

const FPS = 60;
const MIN_MS = 6000;      // a very short action loops until the clip is worth posting
const ALL_RATE = 2;       // "Everything" back to back is a minute at life speed; twice as fast reads better
const base = `${import.meta.env.BASE_URL || '/'}anim`.replace('//anim', '/anim');

let index: Promise<Clip[]> | null = null;
const manifest = () => (index ??= fetch(`${base}/anim.json`).then((r) => {
  if (!r.ok) throw new Error('the animations are not on this server');
  return r.json() as Promise<Clip[]>;
}));

/**
 * Off-screen videos. A detached <video> will not reliably play, so they live in a corner of the page
 * that nothing can see. They are never shown: every frame is drawn onto the card's own canvas.
 */
const stage = () => {
  let el = document.getElementById('emo-anim-stage');
  if (!el) {
    el = document.createElement('div');
    el.id = 'emo-anim-stage';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none';
    document.body.appendChild(el);
  }
  return el;
};

const loadVideo = (file: string) => new Promise<HTMLVideoElement>((ok, no) => {
  const v = document.createElement('video');
  v.src = `${base}/${file}`;
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  // canplaythrough means the whole clip is buffered, so recording never stalls half way
  v.oncanplaythrough = () => ok(v);
  v.onerror = () => no(new Error('could not load the animation'));
  stage().appendChild(v);
  v.load();
});

/** Which recorded clips a chosen loop plays, in order. */
const plan = (loop: Loop, crowned: boolean) =>
  (loop.key === 'all' ? LOOPS.filter((l) => l.key !== 'all').map((l) => l.key) : [loop.key])
    .map((k) => (crowned ? `${k}-crown` : k));

const pick = (all: Clip[], key: string) => {
  const c = all.find((x) => x.key === key) ?? all.find((x) => x.key === key.replace('-crown', ''));
  if (!c) throw new Error('that animation is missing');
  return c;
};

type Sequence = { draw: (x: CanvasRenderingContext2D) => void; total: number; restart: () => void; stop: () => void };

/** Load the clips a loop needs and start them playing, one after another. */
async function startSequence(cat: CatView, loop: Loop): Promise<Sequence> {
  const all = await manifest();
  const clips = plan(loop, cat.crowned).map((k) => pick(all, k));
  const videos = await Promise.all(clips.map((c) => loadVideo(c.file)));
  const rate = loop.key === 'all' ? ALL_RATE : 1;
  const single = videos.length === 1;

  let at = 0;
  const play = (v: HTMLVideoElement) => { v.play().catch(() => { /* a pause() during start-up rejects; harmless */ }); };
  const step = () => { videos[at]!.pause(); at = (at + 1) % videos.length; const v = videos[at]!; v.currentTime = 0; play(v); };
  for (const v of videos) {
    v.playbackRate = rate;
    v.loop = single;                       // one clip repeats itself; a sequence hands over on ended
    if (!single) v.addEventListener('ended', step);
  }

  const one = clips.reduce((a, c) => a + c.duration / rate, 0);
  // a two-second action is not worth posting on its own, so a single clip repeats up to a decent length
  const total = single ? one * Math.max(1, Math.ceil(MIN_MS / one)) : one;

  const restart = () => {
    for (const v of videos) { v.pause(); v.currentTime = 0; }
    at = 0;
    play(videos[0]!);
  };

  return {
    draw: (x) => paintCard(x, cat, (c) => c.drawImage(videos[at]!, PORTRAIT.x, PORTRAIT.y, PORTRAIT.size, PORTRAIT.size)),
    total,
    restart,
    stop: () => { for (const v of videos) { v.pause(); v.removeEventListener('ended', step); v.remove(); } },
  };
}

/**
 * Play the loop into a canvas on the page, so choosing an animation shows it at once. Recording a
 * clip has to run in real time; looking at one does not. Returns a function that stops it.
 */
export async function playShareLoop(canvas: HTMLCanvasElement, cat: CatView, loop: Loop): Promise<() => void> {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d')!;
  const seq = await startSequence(cat, loop);
  seq.restart();
  let raf = 0;
  const tick = () => { seq.draw(x); raf = requestAnimationFrame(tick); };
  tick();
  return () => { cancelAnimationFrame(raf); seq.stop(); };
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

  const mime = ['video/mp4;codecs=avc1.4D401F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot record video. Use the still card instead.');

  const seq = await startSequence(cat, loop);
  try {
    seq.restart();
    seq.draw(x);
    const rec = new MediaRecorder(cv.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start();

    await new Promise<void>((done) => {
      const t0 = performance.now();
      const tick = () => {
        const ms = performance.now() - t0;
        seq.draw(x);
        if (ms >= seq.total) { done(); return; }
        onProgress?.(Math.min(1, ms / seq.total));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((r) => setTimeout(r, 150));
    const blob = await new Promise<Blob>((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: mime })); rec.stop(); });
    onProgress?.(1);
    return { blob, type: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  } finally {
    seq.stop();
  }
}

/** Roughly how long a chosen loop will take to record, for the waiting message. */
export async function loopSeconds(loop: Loop, crowned: boolean): Promise<number> {
  const all = await manifest();
  const rate = loop.key === 'all' ? ALL_RATE : 1;
  const clips = plan(loop, crowned).map((k) => pick(all, k));
  const one = clips.reduce((a, c) => a + c.duration / rate, 0);
  const ms = clips.length === 1 ? one * Math.max(1, Math.ceil(MIN_MS / one)) : one;
  return Math.round(ms / 1000);
}
