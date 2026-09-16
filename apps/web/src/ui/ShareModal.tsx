/**
 * The share card, shown rather than silently downloaded: look at it, copy it, save it, post it.
 *
 * X has no way to accept an image from a link, so a post cannot carry the picture by itself. The
 * next best thing is one keystroke: the image goes to the clipboard, the composer opens with the
 * words already written, and the poster presses paste.
 */
import { useEffect, useState } from 'react';
import type { CatView } from '@emo-pets/chain';
import { shareText } from './shareCard';

type Props = { cat: CatView; blob: Blob; onClose: () => void };

export function ShareModal({ cat, blob, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const copy = async () => {
    try {
      if (!navigator.clipboard || !('ClipboardItem' in window)) throw new Error('no clipboard');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNote('Copied. Paste it into your post.');
    } catch {
      setNote('This browser will not copy images. Use Download, then attach it.');
    }
    setTimeout(() => setNote(null), 4000);
  };
  const save = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `emogotchi-${cat.name ? cat.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : cat.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setNote('Saved to your downloads.');
    setTimeout(() => setNote(null), 4000);
  };
  const post = async () => {
    await copy();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(cat))}`, '_blank', 'noopener');
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">{cat.name || `Emogotchi #${cat.id}`}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {url && <img className="share-preview" src={url} alt={`${cat.name || `Emogotchi #${cat.id}`} share card`} />}
        <div className="share-actions">
          <button className="btn btn-pink" onClick={() => void post()}>Post on X</button>
          <button className="btn btn-ghost" onClick={() => void copy()}>Copy image</button>
          <button className="btn btn-ghost" onClick={save}>Download</button>
        </div>
        <p className="modal-fine">{note ?? 'Post on X copies the picture and opens the composer with the words ready. Press paste to attach it.'}</p>
      </div>
    </div>
  );
}
