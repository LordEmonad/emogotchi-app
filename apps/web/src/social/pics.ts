/**
 * Pictures people upload (worker/social/pics.js): a profile picture and a banner, as an option beside their pet's head
 * and Emotown's banners. The site crops the picture in the page (PicCropper) and sends that crop; the Worker has
 * Cloudflare remake it as a fresh WebP, screens it, and serves it from its own host, never this one. A picture still
 * waiting for a check is only ever fetched by its owner (or an admin) and shown through a blob: URL.
 */
import { useEffect, useState } from 'react';
import { ApiError } from './api';

/** Where uploaded pictures are served: a sibling of the site, never the site itself (see pics.js on the Worker). */
export const MEDIA_ORIGIN: string = (import.meta.env.VITE_MEDIA_ORIGIN as string | undefined) || 'https://emotown-media.emonad.lol';
export const picUrl = (id: string) => `${MEDIA_ORIGIN}/p/${id}.webp`;
/** a link card: a JPEG, because not every link-preview crawler takes WebP */
export const cardUrl = (id: string) => `${MEDIA_ORIGIN}/c/${id}.jpg`;

export type PicKind = 'avatar' | 'banner' | 'card';
export const PIC_SIZE: Record<PicKind, { w: number; h: number }> = { avatar: { w: 512, h: 512 }, banner: { w: 1500, h: 500 }, card: { w: 1200, h: 630 } };
export type Uploaded = { id: string; kind: PicKind; status: 'live' | 'held'; flagged?: boolean };

/** Send a cropped picture. The Worker answers live (up now) or held (waiting for a check). */
export async function uploadPic(kind: PicKind, blob: Blob): Promise<Uploaded> {
  let r: Response;
  try {
    r = await fetch(`/api/social/pic?kind=${kind}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': blob.type }, body: blob });
  } catch { throw new ApiError(0, 'Emotown could not be reached. Check your connection.'); }
  const j = await r.json().catch(() => null) as Record<string, unknown> | null;
  if (!r.ok) { const { error, ...extra } = j ?? {}; throw new ApiError(r.status, typeof error === 'string' ? error : 'That picture did not go up. Try again.', extra); }
  return j as Uploaded;
}

/** A held picture, for its owner or an admin: fetched with the session, shown as a blob: URL, freed when done. */
export function usePrivatePic(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let off = false, made: string | null = null;
    fetch(`/api/social/pic/view/${id}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (off || !b || !/^image\/(webp|jpeg)$/.test(b.type)) return; made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => {});
    return () => { off = true; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return url;
}

/**
 * Crop a picture the person picked: `img` drawn so the frame (w x h at `scale` of the output) shows the part they
 * chose, then encoded. WebP where the browser can make it, else JPEG (Safari's canvas cannot write WebP). The frame's
 * offset is in output pixels: the image's top-left sits at (x, y) and is drawn `zoom` times its fitted size.
 */
export async function cropTo(img: HTMLImageElement, kind: PicKind, view: { x: number; y: number; zoom: number }): Promise<Blob> {
  const { w, h } = PIC_SIZE[kind];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a0f2e'; g.fillRect(0, 0, w, h);   // under a transparent PNG
  g.imageSmoothingQuality = 'high';
  const fit = Math.max(w / img.naturalWidth, h / img.naturalHeight) * view.zoom;
  g.drawImage(img, view.x, view.y, img.naturalWidth * fit, img.naturalHeight * fit);
  const as = (type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
  const webp = await as('image/webp', 0.92);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await as('image/jpeg', 0.92);
  if (!jpeg) throw new Error('This browser could not prepare the picture.');
  return jpeg;
}
