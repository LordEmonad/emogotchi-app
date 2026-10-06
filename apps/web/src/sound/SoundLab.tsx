// The sound lab (/soundlab, dev builds only): every sound and every tune on a button, with the mixer, and a picture of
// each sound as it is made. `?sheet=sfx` and `?sheet=songs` draw them all at once for tools/sound-check.mjs.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MusicWish } from './cue';
import { audition, auditionMusic, getPrefs, playing, setPrefs, setRaw, subscribe } from './engine';
import { SONGS, songFor } from './music';
import { draw, renderSfx, renderSong, wav, type Rendered } from './render';
import { SFX } from './sfx';
import './sound.css';

const WHO = ['cat', 'frog', 'sahur', 'thiccums', 'r3tards'] as const;
const WHO_NAME: Record<string, string> = { cat: 'Cat', frog: 'inversebrah', sahur: 'Sahur', thiccums: 'Thiccums', r3tards: 'r3tard' };

const GROUPS: [string, (name: string) => boolean][] = [
  ['Voices (pick a pet)', (n) => n.startsWith('voice.')],
  ['Buttons and menus', (n) => n.startsWith('ui.')],
  ['Transactions and money', (n) => n.startsWith('tx.') || ['coin', 'burn', 'mint', 'crown'].includes(n)],
  ['Messages', (n) => n.startsWith('notify.')],
  ['Getting about', (n) => ['step', 'hop', 'land', 'jump', 'leap', 'whoosh', 'thud', 'boing', 'bonk', 'pop', 'squeak', 'puff', 'dust', 'slide', 'sparkle', 'heart', 'stars'].includes(n)],
  ['Dinner', (n) => ['bowl.drop', 'crumbs', 'bite', 'lick', 'gulp', 'flop', 'tummy'].includes(n)],
  ['Poop and cleaning up', (n) => ['strain', 'plop', 'phew', 'scoop'].includes(n)],
  ['Bath time', (n) => ['tub.land', 'splash', 'drops', 'bubbles', 'scrub', 'shake'].includes(n)],
  ['Play', (n) => ['roll', 'pat', 'kick', 'bounce', 'purr'].includes(n)],
  ['Sleep, death and coming back', (n) => ['sleep', 'snore', 'wake', 'die', 'grave', 'ghost', 'revive'].includes(n)],
  ['The dreidel', (n) => n.startsWith('dreidel.') || n === 'badge'],
  ['The darbuka', (n) => n.startsWith('drum.')],
  ['The hen and the falcon', (n) => ['cluck', 'squawk', 'flaps', 'wings', 'falcon.cry'].includes(n)],
  ['Stunts', (n) => ['catch', 'shutter', 'flash', 'slap.wind', 'slap.hit', 'servo', 'clank', 'squeeze', 'match', 'fire', 'gush', 'sizzle', 'chatter', 'tung'].includes(n)],
  ['Fight Club', (n) => n.startsWith('fight.')],
];
const ALL = Object.keys(SFX);
const grouped = GROUPS.map(([title, test]) => [title, ALL.filter(test)] as const);
const rest = ALL.filter((n) => !GROUPS.some(([, test]) => test(n)));
if (rest.length) grouped.push(['Other', rest]);

function Picture({ r, w = 320, h = 120, seconds }: { r: Rendered; w?: number; h?: number; seconds?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) draw(ref.current, r, w, h, seconds); }, [r, w, h, seconds]);
  return <canvas ref={ref} className="sl-pic" style={{ width: w, height: h }} />;
}
const stats = (r: Rendered) => `${r.len.toFixed(2)} s · peak ${r.peak.toFixed(1)} dB · loud ${r.loud.toFixed(1)} dB · ~${Math.round(r.centroid)} Hz`;

/** Every sound drawn at once, for the headless check. */
function Sheet({ kind }: { kind: string }) {
  const params = new URLSearchParams(location.search);
  const [rows, setRows] = useState<{ name: string; r: Rendered }[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      const out: { name: string; r: Rendered }[] = [];
      setRaw(params.get('raw') === '1');
      if (kind === 'songs') {
        const bars = Number(params.get('bars') ?? 8), from = Number(params.get('from') ?? 0);
        const only = params.get('only');
        const parts = params.get('parts') === '1';
        for (const s of SONGS) {
          if (only && !s.label.toLowerCase().includes(only.toLowerCase())) continue;
          out.push({ name: s.label, r: await renderSong(s.wish, bars, from) }); if (off) return;
          // each part by itself: how the mix is made up
          if (parts) for (const [i, p] of songFor(s.wish).parts.entries()) { out.push({ name: `${s.label} · ${i} ${p.inst}`, r: await renderSong(s.wish, bars, from, i) }); if (off) return; }
          setRows([...out]);
        }
      } else {
        const only = params.get('only')?.split(',');
        for (const name of ALL) {
          if (only && !only.some((o) => name.startsWith(o))) continue;
          for (const who of name.startsWith('voice.') ? WHO : [undefined]) {
            const r = await renderSfx(name, { who }); if (off) return;
            if (r) out.push({ name: who ? `${name} · ${who}` : name, r });
          }
          setRows([...out]);
        }
      }
      (window as unknown as { __sheet?: unknown }).__sheet = out.map(({ name, r }) => ({ name, len: +r.len.toFixed(3), peak: +r.peak.toFixed(1), loud: +r.loud.toFixed(1), hz: Math.round(r.centroid) }));
      (window as unknown as { __wav?: unknown }).__wav = async (i: number) => { const b = new Uint8Array(await wav(out[i]!.r).arrayBuffer()); let s = ''; for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000)); return btoa(s); };
      setDone(true);
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const wide = kind === 'songs';
  return (
    <div className="sl-sheet" data-done={done ? '1' : '0'}>
      {rows.map(({ name, r }) => (
        <figure key={name} className="sl-cell" style={{ width: wide ? 1180 : 286 }}>
          <Picture r={r} w={wide ? 1180 : 286} h={wide ? 200 : 96} />
          <figcaption><b>{name}</b><span>{stats(r)}</span></figcaption>
        </figure>
      ))}
    </div>
  );
}

export function SoundLab() {
  const sheet = new URLSearchParams(location.search).get('sheet');
  const prefs = useSyncExternalStore(subscribe, getPrefs);
  const now = useSyncExternalStore(subscribe, playing);
  const [who, setWho] = useState<string>('cat');
  const [asked, setAsked] = useState<MusicWish | null>(null);
  const [last, setLast] = useState<{ name: string; r: Rendered } | null>(null);
  useEffect(() => () => auditionMusic(null), []);
  if (sheet) return <Sheet kind={sheet} />;

  const hit = (name: string) => {
    const o = name.startsWith('voice.') ? { who } : {};
    audition(name, o);
    void renderSfx(name, o).then((r) => { if (r) setLast({ name: name.startsWith('voice.') ? `${name} · ${WHO_NAME[who]}` : name, r }); });
  };
  const tune = (w: MusicWish) => {
    const same = asked && songFor(asked).id === songFor(w).id;
    setAsked(same ? null : w); auditionMusic(same ? null : w);
  };

  return (
    <div className="page sl">
      <h1>Sound lab</h1>
      <p className="sl-note">Every sound on the site and every tune. Nothing here is a recording: it is all made in the browser as it plays. Press anything.</p>
      <p className="sl-note">To hear them where they belong: <a href="/?view=pet">a pet's room</a> (feed it, wash it, put it to bed), <a href="/r3tards">the r3tard's lab</a>, <a href="/habibi">every pet with the packs' toys</a>, <a href="/emotown">Emotown</a>, <a href="/fightlab">a fight</a>.</p>

      <div className="sl-mixer">
        <button className={`sl-btn ${prefs.on ? 'on' : ''}`} onClick={() => setPrefs({ on: !prefs.on })}>{prefs.on ? 'Sound on' : 'Sound off'}</button>
        <label>Music <input type="range" min={0} max={1} step={0.01} value={prefs.music} onChange={(e) => setPrefs({ music: Number(e.target.value) })} /> <span>{Math.round(prefs.music * 100)}</span></label>
        <label>Effects <input type="range" min={0} max={1} step={0.01} value={prefs.sfx} onChange={(e) => setPrefs({ sfx: Number(e.target.value) })} /> <span>{Math.round(prefs.sfx * 100)}</span></label>
      </div>

      <h2>Music</h2>
      <div className="sl-row">
        {SONGS.map((s) => {
          const id = songFor(s.wish).id;
          return <button key={s.label} className={`sl-btn ${now === id && asked ? 'on' : ''}`} onClick={() => tune(s.wish)}>{now === id && asked ? '■ ' : '▶ '}{s.label}</button>;
        })}
      </div>
      <p className="sl-note">{now ? `Playing: ${now}` : 'No music playing.'} Changing tune crossfades, as it does on the site when a pet falls asleep or a room theme goes on.</p>

      {grouped.map(([title, names]) => (
        <section key={title}>
          <h2>{title}</h2>
          {title.startsWith('Voices') && (
            <div className="sl-row">{WHO.map((w) => <button key={w} className={`sl-btn ${who === w ? 'on' : ''}`} onClick={() => setWho(w)}>{WHO_NAME[w]}</button>)}</div>
          )}
          <div className="sl-row">{names.map((n) => <button key={n} className="sl-btn" data-quiet onClick={() => hit(n)}>{n.replace(/^voice\./, '')}</button>)}</div>
        </section>
      ))}

      {last && (
        <div className="sl-last">
          <Picture r={last.r} />
          <div><b>{last.name}</b><br />{stats(last.r)}</div>
        </div>
      )}
    </div>
  );
}
