/**
 * Choosing and framing a picture to upload: pick one (or drop it), drag to place it, pinch, scroll or slide to zoom.
 * The profile picture is framed in a circle, the banner in a 3:1 strip, exactly as they will show. Nothing is sent
 * from here: the crop goes back to the editor, and Save uploads it (pics.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PIC_SIZE, cropTo, type PicKind } from './pics';

type View = { x: number; y: number; zoom: number };
const MAX_FILE = 30 * 1024 * 1024;
const MAX_ZOOM = 5;

export function PicCropper({ kind, onDone, onClose }: { kind: PicKind; onDone: (blob: Blob) => void; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const out = PIC_SIZE[kind];

  // the frame's size on screen, kept current (a phone turning, a window resizing)
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; setFrame({ w, h: Math.round((w * out.h) / out.w) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [out.w, out.h, src]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [busy, onClose]);

  const base = nat && frame.w ? Math.max(frame.w / nat.w, frame.h / nat.h) : 1;
  /** keep the picture covering the whole frame */
  const clamp = useCallback((v: View): View => {
    if (!nat || !frame.w) return v;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const s = base * zoom, iw = nat.w * s, ih = nat.h * s;
    return { zoom, x: Math.min(0, Math.max(frame.w - iw, v.x)), y: Math.min(0, Math.max(frame.h - ih, v.y)) };
  }, [nat, frame.w, frame.h, base]);
  /** zoom to `zoom` keeping the point (px, py) of the frame where it is */
  const zoomAt = useCallback((zoom: number, px: number, py: number, from: View) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const r = z / from.zoom;
    return clamp({ zoom: z, x: px - (px - from.x) * r, y: py - (py - from.y) * r });
  }, [clamp]);
  // the wheel zooms, and must not scroll the sheet underneath: a native listener, since React's is passive
  useEffect(() => {
    const el = box.current; if (!el || !nat) return;
    const h = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; setView((v) => zoomAt(v.zoom * Math.exp(-e.deltaY / 400), px, py, v)); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [nat, zoomAt]);
  // centre the picture when it (or the frame) changes size
  useEffect(() => {
    if (!nat || !frame.w) return;
    const s = base; setView(clamp({ zoom: 1, x: (frame.w - nat.w * s) / 2, y: (frame.h - nat.h * s) / 2 }));
  }, [nat, frame.w, frame.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f: File | null | undefined) => {
    setErr(null);
    if (!f) return;
    if (!/^image\//.test(f.type) && f.type !== '') { setErr('That is not a picture. Pick a JPG or PNG.'); return; }
    if (f.size > MAX_FILE) { setErr('That picture is too big. Pick one under 30 MB.'); return; }
    setNat(null);
    setSrc(URL.createObjectURL(f));
  };
  const loaded = () => { const i = img.current; if (i && i.naturalWidth >= 32 && i.naturalHeight >= 32) setNat({ w: i.naturalWidth, h: i.naturalHeight }); else { setErr('That picture is too small.'); setSrc(null); } };
  const broken = () => { setErr('This browser cannot open that picture. Try a JPG or PNG.'); setSrc(null); };

  const local = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => { if (!nat) return; (e.target as Element).setPointerCapture?.(e.pointerId); pointers.current.set(e.pointerId, local(e)); };
  const onMove = (e: React.PointerEvent) => {
    const ps = pointers.current; const prev = ps.get(e.pointerId); if (!prev || !nat) return;
    const now = local(e);
    if (ps.size === 1) { setView((v) => clamp({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y })); }
    else if (ps.size === 2) {
      const other = [...ps.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(now.x - other.x, now.y - other.y);
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }, m1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
      if (d0 > 0) setView((v) => { const z = zoomAt(v.zoom * (d1 / d0), m0.x, m0.y, v); return clamp({ ...z, x: z.x + m1.x - m0.x, y: z.y + m1.y - m0.y }); });
    }
    ps.set(e.pointerId, now);
  };
  const onUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!nat) return;
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]!; setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy })); }
    if (e.key === '+' || e.key === '=') setView((v) => zoomAt(v.zoom * 1.15, frame.w / 2, frame.h / 2, v));
    if (e.key === '-') setView((v) => zoomAt(v.zoom / 1.15, frame.w / 2, frame.h / 2, v));
  };

  const use = async () => {
    if (!img.current || !nat) return;
    setBusy(true); setErr(null);
    try {
      const k = out.w / frame.w;
      onDone(await cropTo(img.current, kind, { x: view.x * k, y: view.y * k, zoom: view.zoom }));
    } catch (e) { setErr((e as Error).message || 'That did not work. Try another picture.'); setBusy(false); }
  };

  const s = base * view.zoom;
  const title = kind === 'avatar' ? 'Your picture' : 'Your banner';
  return (
    <div className="modal-back so-crop-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal so-crop" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="modal-x" onClick={onClose} aria-label="Close" disabled={busy}>✕</button></div>
        <p className="modal-sub">{kind === 'avatar' ? 'Shown next to your name everywhere in Emotown.' : 'Across the top of your profile.'} It is checked before others see it: nothing unkind, nothing explicit, no scams.</p>
        <div
          ref={box}
          className={`so-crop-frame ${kind}${nat ? ' ready' : ''}`}
          style={{ height: frame.h || undefined }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          tabIndex={nat ? 0 : -1} onKeyDown={onKey} aria-label={nat ? 'Drag to move the picture; pinch or scroll to zoom' : undefined}
        >
          {src && <img ref={img} src={src} alt="" draggable={false} onLoad={loaded} onError={broken} style={nat ? { width: nat.w * s, height: nat.h * s, transform: `translate(${view.x}px, ${view.y}px)` } : { opacity: 0 }} />}
          {nat && <div className="so-crop-mask" aria-hidden />}
          {!src && (
            <label className="so-crop-pick">
              <input type="file" accept="image/*" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              <b>Choose a picture</b>
              <span>JPG, PNG or WebP{kind === 'banner' ? '. A wide one works best' : ''}</span>
            </label>
          )}
        </div>
        {nat && (
          <div className="so-crop-zoom">
            <span aria-hidden>－</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} aria-label="Zoom" onChange={(e) => setView((v) => zoomAt(Number(e.target.value), frame.w / 2, frame.h / 2, v))} />
            <span aria-hidden>＋</span>
          </div>
        )}
        {err && <p className="modal-err" role="alert">{err}</p>}
        <div className="pk-actions">
          {src ? <label className="btn btn-ghost so-crop-again"><input type="file" accept="image/*" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} disabled={busy} />Choose another</label> : <button className="btn btn-ghost" onClick={onClose}>Cancel</button>}
          <button className="btn btn-pink" disabled={!nat || busy} onClick={() => void use()}>{busy ? 'One moment…' : 'Use this'}</button>
        </div>
      </div>
    </div>
  );
}
