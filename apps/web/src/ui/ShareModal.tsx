/**
 * The share card, shown rather than silently downloaded: look at it, copy it, save it, post it.
 *
 * X has no way to accept an image from a link, so a post cannot carry the picture by itself. The
 * next best thing is one keystroke: the image goes to the clipboard, the composer opens with the
 * words already written, and the poster presses paste.
 */
import { useEffect, useState } from 'react';
import type { CatView, Mood } from '@emo-pets/chain';
import { shareText } from './shareCard';
import { LOOPS, recordShareVideo, type Loop } from './shareVideo';

type Props = { cat: CatView; blob: Blob; art: (mood: Mood, crowned: boolean) => Promise<string>; onClose: () => void };

export function ShareModal({ cat, blob, art, onClose }: Props) {
  const [moving, setMoving] = useState(false);
  const [loop, setLoop] = useState<Loop>(LOOPS[0]!);
  const [video, setVideo] = useState<{ blob: Blob; type: 'mp4' | 'webm' } | null>(null);
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const current = moving && video ? video.blob : blob;
  useEffect(() => { const u = URL.createObjectURL(current); setUrl(u); return () => URL.revokeObjectURL(u); }, [current]);

  // recording takes about as long as the clip, so it only happens when asked for
  const make = async (l: Loop) => {
    setRecording(true); setProgress(0); setNote(null);
    try {
      setVideo(await recordShareVideo(cat, l, art, setProgress));
    } catch (e) {
      setNote((e as Error).message.slice(0, 90)); setMoving(false);
    } finally { setRecording(false); }
  };
  const pick = (l: Loop) => { setLoop(l); setVideo(null); void make(l); };
  const toggle = (on: boolean) => { setMoving(on); if (on && !video && !recording) void make(loop); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const copy = async () => {
    try {
      if (!navigator.clipboard || !('ClipboardItem' in window)) throw new Error('no clipboard');
      if (moving) throw new Error('video');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNote('Copied. Paste it into your post.');
    } catch {
      setNote(moving ? 'A video cannot be copied. Download it, then attach it to your post.' : 'This browser will not copy images. Use Download, then attach it.');
    }
    setTimeout(() => setNote(null), 4000);
  };
  const save = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `emogotchi-${cat.name ? cat.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : cat.id}.${moving && video ? video.type : 'png'}`;
    document.body.appendChild(a); a.click(); a.remove();
    setNote('Saved to your downloads.');
    setTimeout(() => setNote(null), 4000);
  };
  const post = async () => {
    if (moving) { save(); } else { await copy(); }
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(cat))}`, '_blank', 'noopener');
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">{cat.name || `Emogotchi #${cat.id}`}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="share-toggle">
          <button className={`chip-btn ${!moving ? 'is-on' : ''}`} onClick={() => setMoving(false)}>Still</button>
          <button className={`chip-btn ${moving ? 'is-on' : ''}`} onClick={() => toggle(true)} disabled={recording}>Animated</button>
        </div>
        {moving && (
          <div className="share-loops">
            {LOOPS.map((l) => (
              <button key={l.key} className={`chip-btn ${loop.key === l.key ? 'is-on' : ''}`} onClick={() => pick(l)} disabled={recording} title={l.blurb}>{l.label}</button>
            ))}
          </div>
        )}
        {recording && <div className="share-rec"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        {url && (moving && video
          ? <video className="share-preview" src={url} autoPlay loop muted playsInline />
          : <img className="share-preview" src={url} alt={`${cat.name || `Emogotchi #${cat.id}`} share card`} />)}
        <div className="share-actions">
          <button className="btn btn-pink" onClick={() => void post()}>Post on X</button>
          <button className="btn btn-ghost" onClick={() => void copy()}>Copy image</button>
          <button className="btn btn-ghost" onClick={save}>Download</button>
        </div>
        <p className="modal-fine">{note ?? (recording
          ? `Recording ${loop.label.toLowerCase()}… this takes about as long as the clip.`
          : moving
            ? 'Post on X saves the video and opens the composer. Attach the file from your downloads.'
            : 'Post on X copies the picture and opens the composer with the words ready. Press paste to attach it.')}</p>
      </div>
    </div>
  );
}
