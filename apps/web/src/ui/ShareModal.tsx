/**
 * The share card, shown rather than silently downloaded: look at it, copy it, save it, post it.
 *
 * X has no way to accept an image from a link, so a post cannot carry the picture by itself. The
 * next best thing is one keystroke: the image goes to the clipboard, the composer opens with the
 * words already written, and the poster presses paste.
 *
 * The animated card plays straight away on a canvas. Encoding it to a file can only happen in real
 * time, so that waits until someone actually asks to save or post it.
 */
import { fallbackName } from '../pets';
import { useEffect, useRef, useState } from 'react';
import type { CatView } from '@emo-pets/chain';
import { shareText } from './shareCard';
import { hasClips, loopSeconds, loopsOf, playShareLoop, recordShareVideo, type Loop } from './shareVideo';

type Props = { cat: CatView; blob: Blob; onClose: () => void };

export function ShareModal({ cat, blob, onClose }: Props) {
  const [moving, setMoving] = useState(false);
  const loops = loopsOf(cat.col);
  const [loop, setLoop] = useState<Loop>(loops[0]!);
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [loadingClip, setLoadingClip] = useState(false);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { const u = URL.createObjectURL(blob); setStillUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);

  // the preview: drawn on the page, so switching animations is instant
  useEffect(() => {
    if (!moving || !canvas.current) return;
    let stop: (() => void) | null = null;
    let gone = false;
    setLoadingClip(true);
    playShareLoop(canvas.current, cat, loop)
      .then((s) => { if (gone) s(); else stop = s; })
      .catch((e) => { setNote((e as Error).message.slice(0, 90)); setMoving(false); })
      .finally(() => { if (!gone) setLoadingClip(false); });
    void loopSeconds(loop, cat.crowned, cat.col).then(setSecs).catch(() => setSecs(0));
    return () => { gone = true; stop?.(); };
  }, [moving, loop, cat]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(null), 5000); };

  /** Encode the clip, then hand it over. Recording is the slow part, so it only happens on demand. */
  const withVideo = async (use: (v: { blob: Blob; type: 'mp4' | 'webm' }) => void) => {
    setRecording(true); setProgress(0); setNote(null);
    try { use(await recordShareVideo(cat, loop, setProgress)); }
    catch (e) { say((e as Error).message.slice(0, 90)); }
    finally { setRecording(false); }
  };

  const download = (b: Blob, ext: string) => {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emogotchi-${cat.name ? cat.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : cat.id}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const copy = async () => {
    if (moving) { say('A video cannot be copied. Download it, then attach it to your post.'); return; }
    try {
      if (!navigator.clipboard || !('ClipboardItem' in window)) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say('Copied. Paste it into your post.');
    } catch {
      say('This browser will not copy images. Use Download, then attach it.');
    }
  };

  const save = async () => {
    if (!moving) { download(blob, 'png'); say('Saved to your downloads.'); return; }
    await withVideo((v) => { download(v.blob, v.type); say('Saved to your downloads.'); });
  };

  const post = async () => {
    const composer = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(cat))}`, '_blank', 'noopener');
    if (moving) { await withVideo((v) => { download(v.blob, v.type); composer(); }); }
    else { await copy(); composer(); }
  };

  const title = cat.name || fallbackName(cat.col, cat.id);
  const about = secs ? ` — about ${secs}s` : '';
  const hint = loadingClip && !recording
    ? `Loading ${loop.label.toLowerCase()}…`
    : recording
      ? `Recording ${loop.label.toLowerCase()}… a video can only be made at the speed it plays${about}.`
      : moving
        ? `${loop.blurb}. Post on X records the clip, saves it, and opens the composer${about}. Attach the file from your downloads.`
        : 'Post on X copies the picture and opens the composer with the words ready. Press paste to attach it.';
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">{title}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {hasClips(cat.col) && (   /* only the pets whose clips are recorded (shareVideo.ts CLIP_DIR); the others' cards are stills */
          <div className="share-toggle">
            <button className={`chip-btn ${!moving ? 'is-on' : ''}`} onClick={() => setMoving(false)} disabled={recording}>Still</button>
            <button className={`chip-btn ${moving ? 'is-on' : ''}`} onClick={() => setMoving(true)} disabled={recording}>Animated</button>
          </div>
        )}
        {moving && (
          <div className="share-loops">
            {loops.map((l) => (
              <button key={l.key} className={`chip-btn ${loop.key === l.key ? 'is-on' : ''}`} onClick={() => setLoop(l)} disabled={recording} title={l.blurb}>{l.label}</button>
            ))}
          </div>
        )}
        {(recording || loadingClip) && <div className={`share-rec ${loadingClip && !recording ? 'is-waiting' : ''}`}><span style={{ width: `${loadingClip && !recording ? 100 : Math.round(progress * 100)}%` }} /></div>}
        <canvas ref={canvas} className="share-preview" hidden={!moving} aria-label={`${title} animated card`} />
        {!moving && stillUrl && <img className="share-preview" src={stillUrl} alt={`${title} share card`} />}
        <div className="share-actions">
          <button className="btn btn-pink" onClick={() => void post()} disabled={recording || loadingClip}>Post on X</button>
          <button className="btn btn-ghost" onClick={() => void copy()} disabled={recording}>Copy image</button>
          <button className="btn btn-ghost" onClick={() => void save()} disabled={recording || loadingClip}>Download</button>
        </div>
        <p className="modal-fine">{note ?? hint}</p>
      </div>
    </div>
  );
}
