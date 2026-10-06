/**
 * /pfps: profile pictures of every pet, over a hundred each in titled groups (moods, crowned, outfits, the emo hair,
 * the Jewish pack, the Habibi pack, ghosts, a second framing, in action), drawn by `node tools/pfps.mjs` from the live
 * rig and framed on the face. Nothing on chain, nothing to buy: pick one, save it, wear it (the operator, 2026-09-25:
 * "encouraging people to pfp them, just for fun"; revamped 2026-10-01 with Thiccums, the packs and their rooms). The
 * grid reads `pfp/index.json`; each tile previews the round crop every platform makes (a 384px WebP), and downloads
 * the 768px PNG.
 */
import { useEffect, useState } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { Icon } from './Icon';
import { EMPTY_WALLET } from '../wallet';

type Look = { file: string; label: string; bg: string; frame?: string };
type Pet = { label: string; frames?: { key: string; title: string }[]; looks: Look[] };
/** `version` changes with every generation (tools/pfps.mjs): it goes on every picture URL, because the files keep their
 *  names and are cached for hours, and a browser once paired an old thumbnail with a new full-size picture */
type Index = Record<string, Pet> & { version?: string };
const ORDER = ['cat', 'frog', 'sahur', 'thiccums', 'r3tards'];
const BLURB: Record<string, string> = {
  cat: 'The cat, in every mood it has, crowned or not, in every outfit from the shop, the kippah and the keffiyeh.',
  frog: 'inversebrah, moods and outfits, the emo hair he was not born with, and both packs from the shop.',
  sahur: 'Tung Tung Tung Sahur, straight-faced and otherwise, in the outfits, the emo hair and both packs.',
  thiccums: 'Thiccums the seal, bouncy butt and all: moods, outfits, the emo hair and both packs.',
  r3tards: 'The r3tard, a face on a stick: moods, outfits, the emo hair and both packs.',
};

export function Pfps() {
  const [index, setIndex] = useState<Index | null>(null);
  const [round, setRound] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    // the query steps past a stale edge copy
    fetch(`/pfp/index.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j: Index) => { if (!dead) setIndex(j); }).catch((e) => { if (!dead) setError((e as Error).message); });
    return () => { dead = true; };
  }, []);
  const chars = index ? ORDER.filter((k) => index[k]) : [];
  const v = index?.version ? `?v=${index.version}` : '';
  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing pfps">
        <div className="lb-head">
          <h1>Profile pictures</h1>
          <p>Every pet in every mood and outfit, and in the middle of things: dinner, bath time, the ball, the slap, the tung tung tung, the butt bounce, the dreidel, the darbuka, the falcon. On the site's colours and in its rooms (the plain room by day and by night, the Spooky theme, the Backrooms, the Western Wall, the Majlis). Free, not on chain, just for fun: pick one, save it, wear it. Tap a picture for the full size; the round preview is what most apps will show.</p>
        </div>
        <div className="pfps-bar">
          <div className="pet-switch" role="tablist" aria-label="Jump to a pet">
            {chars.map((k) => <a key={k} role="tab" className="chip-btn" href={`#pfp-${k}`}>{index![k]!.label}</a>)}
          </div>
          <div className="pfps-shape" role="group" aria-label="Preview shape">
            <button className={`chip-btn ${round ? 'is-on' : ''}`} onClick={() => setRound(true)} aria-pressed={round}>Round</button>
            <button className={`chip-btn ${!round ? 'is-on' : ''}`} onClick={() => setRound(false)} aria-pressed={!round}>Square</button>
          </div>
        </div>
        {error && <p className="lb-note">The pictures are not here yet ({error}).</p>}
        {chars.map((k) => (
          <section className="pfps-set" id={`pfp-${k}`} key={k} data-pet={k}>
            <div className="pfps-set-head">
              <h2>{index![k]!.label} <small>{index![k]!.looks.length} pictures</small></h2>
              <p>{BLURB[k]}</p>
            </div>
            {(index![k]!.frames ?? [{ key: '', title: '' }]).map((f) => (
              <div className="pfps-frame" key={f.key}>
                {f.title && <h3>{f.title}</h3>}
                <div className={`pfps-grid ${round ? 'is-round' : ''}`}>
                  {index![k]!.looks.filter((l) => (l.frame ?? '') === f.key).map((l) => (
                    <figure className="pfps-tile" key={l.file}>
                      <a href={`/pfp/${k}/${l.file}.png${v}`} target="_blank" rel="noreferrer" title="Open the full-size picture">
                        <img src={`/pfp/${k}/${l.file}-t.webp${v}`} alt={`${index![k]!.label}, ${l.label}`} loading="lazy" width={384} height={384} />
                      </a>
                      <figcaption>
                        <span title={l.label}>{l.label}</span>
                        <a className="pfps-save" href={`/pfp/${k}/${l.file}.png${v}`} download={`emogotchi-${k}-${l.file}.png`} title="Save the full-size picture (768px)"><Icon name="heart" size={12} /> Save</a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
