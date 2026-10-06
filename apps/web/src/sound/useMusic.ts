import { useEffect, useRef } from 'react';
import { wishMusic, type MusicWish } from './cue';

/** While this is mounted with a wish, that is the music the page asks for (the last page to ask is the one heard). */
export function useMusic(wish: MusicWish | null) {
  const held = useRef<ReturnType<typeof wishMusic> | null>(null);
  const key = wish ? JSON.stringify(wish) : '';
  useEffect(() => {
    if (!key) return;
    const w = JSON.parse(key) as MusicWish;
    if (held.current) held.current.set(w); else held.current = wishMusic(w);
  }, [key]);
  // taken back when the wish goes, or the page does
  useEffect(() => { if (!key && held.current) { held.current.drop(); held.current = null; } }, [key]);
  useEffect(() => () => { held.current?.drop(); held.current = null; }, []);
}
