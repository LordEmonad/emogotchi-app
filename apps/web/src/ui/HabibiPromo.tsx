/**
 * The Habibi pack's promo picture, composed live (DEV ONLY, /habibi/promo; `node tools/habibi-promo.mjs` shoots it into
 * public/brand/habibi-pack.png and, with ?title=1, habibi-pack-title.png). One real Majlis stage, 1600 x 900, its own pet
 * hidden; the three live pets stand in it as posed rigs in the pack's items: the frok at the darbuka, the cat in the black
 * bisht (not crowned: the golden bisht read as the whole robe gone gold), Sahur watching the falcon glide in through the window. The seal is left out: it is
 * not live. Once posed, every animation on the page is paused and `window.__promo_ready` is set.
 */
import { useEffect, useMemo, useState } from 'react';
import { Stage } from '../scene/Stage';
import { Pet, type Costume, type Drawing, type PetRig } from '../pet/Pet';
import { PROPS, ASPECT, type PropName } from '../scene/props';
import { petBox, WORLD } from '../scene/world';

type Slot = { character: Drawing; x: number; crown?: boolean; pose: (r: PetRig) => void };
const WEAR: Costume[] = ['bisht', 'keffiyeh'];
const SLOTS: Slot[] = [
  { character: 'frog', x: 118, pose: (r) => { r.facing(1); r.face('happy', 'smile', 0); r.drumReady?.(1); } },
  { character: 'cat', x: 318, pose: (r) => { r.face('happy', 'smile', 0); r.look(0.5, -0.4); } },
  { character: 'sahur', x: 492, pose: (r) => { r.face('open', 'smile', 0); r.look(-0.3, -0.9); } },
];
/** A prop at world (x, bottom), w wide. */
function Piece({ name, x, bottom, w, rot = 0, flip = false, show = [], hide = [], head }: { name: PropName; x: number; bottom: number; w: number; rot?: number; flip?: boolean; show?: string[]; hide?: string[]; head?: string }) {
  const h = w / ASPECT[name];
  const html = useMemo(() => {
    let s = PROPS[name];
    for (const c of show) s = s.replace(new RegExp(`class="${c}" style="visibility:hidden"`), `class="${c}"`);
    for (const c of hide) s = s.replace(new RegExp(`class="${c}"(?! style)`), `class="${c}" style="visibility:hidden"`);
    // the falcon's head sits in a different place for each pose (its data-heads, as the director sets it): the flying body
    // with the perched head put the head beside the body
    if (head) { const m = /data-heads="([^"]*)"/.exec(s); const t = m ? (JSON.parse(m[1]!.replace(/'/g, '"')) as Record<string, string>)[head] : null; if (t) s = s.replace(/(class="fc-head" transform=")[^"]*"/, `$1${t}"`); }
    return s;
  }, [name, show, hide, head]);
  return <div style={{ position: 'absolute', left: x - w / 2, top: bottom - h, width: w, height: h, transform: `${flip ? 'scaleX(-1) ' : ''}rotate(${rot}deg)`, zIndex: 3 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function PetSlot({ slot, onRig }: { slot: Slot; onRig: (r: PetRig | null) => void }) {
  const B = petBox(slot.character);
  return (
    <div style={{ position: 'absolute', left: slot.x - B.w / 2, top: B.top, width: B.w, height: B.h, zIndex: 2 }}>
      <Pet character={slot.character} onRig={onRig} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/** The pack page's link card (1200 x 630, shot at 2x into brand/habibi-pack-og.png): the Jewish pack's layout in red and
 *  gold, the promo picture (brand/habibi-pack.png) on the right. `?og=1`. */
function HabibiOg() {
  useEffect(() => {
    const imgs = [...document.querySelectorAll('img')];
    void Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => document.fonts.ready).then(() => { (window as unknown as { __promo_ready?: boolean }).__promo_ready = true; });
  }, []);
  const cards = ['keffiyeh', 'bisht', 'majlis', 'darbuka', 'falcon'];
  return (
    <div className="habibi-og">
      <style>{`.habibi-og { position: relative; width: 1200px; height: 630px; overflow: hidden; color: #F8F8FF;
          background: radial-gradient(80% 120% at 100% 0%, rgba(200,16,46,.28), rgba(200,16,46,0) 60%), radial-gradient(70% 90% at 0% 100%, rgba(217,169,60,.12), rgba(217,169,60,0) 60%), linear-gradient(160deg, #2a1245 0%, #1c0d30 55%, #140922 100%); }
        .habibi-og::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle, rgba(234,198,234,.13) 1.6px, transparent 1.8px) 0 0 / 30px 30px; }
        .habibi-og .stripe { position: absolute; left: 0; right: 0; height: 12px; background: repeating-linear-gradient(90deg, #C8102E 0 30px, rgba(250,246,240,.85) 30px 40px); opacity: .8; }
        .habibi-og .copy { position: absolute; left: 52px; top: 54px; width: 360px; display: flex; flex-direction: column; gap: 14px; }
        .habibi-og .brand { display: flex; align-items: center; gap: 12px; font-size: 27px; font-weight: 600; }
        .habibi-og .brand svg { width: 28px; height: 28px; }
        .habibi-og h1 { margin: 8px 0 0; font-size: 70px; line-height: .98; letter-spacing: -0.035em; font-weight: 700; }
        .habibi-og p { margin: 4px 0 0; font-size: 21px; line-height: 1.4; color: rgba(248,248,255,.8); }
        .habibi-og .pills { display: flex; gap: 12px; margin-top: 8px; }
        .habibi-og .pill { padding: 9px 18px; border-radius: 999px; font-size: 21px; font-weight: 700; }
        .habibi-og .pill.gold { color: #2a1402; background: #F6DC8E; }
        .habibi-og .pill.red { color: #FFE3A3; border: 2px solid rgba(217,169,60,.75); background: rgba(200,16,46,.3); }
        .habibi-og .thumbs { display: flex; gap: 10px; margin-top: 14px; }
        .habibi-og .thumbs img { width: 58px; height: 58px; border-radius: 12px; border: 1.5px solid rgba(248,248,255,.18); }
        .habibi-og .art { position: absolute; right: 36px; top: 88px; width: 740px; height: 416px; border-radius: 22px; overflow: hidden; border: 2px solid rgba(217,169,60,.4); box-shadow: 0 18px 50px rgba(0,0,0,.5); }
        .habibi-og .art img { width: 100%; height: 100%; display: block; }`}</style>
      <span className="stripe" style={{ top: 22 }} /><span className="stripe" style={{ bottom: 22 }} />
      <div className="copy">
        <div className="brand"><svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.7 1.3 5.4 3.3 1.7-2 3.2-3.3 5.4-3.3 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" fill="#E84D7F"/></svg>Emogotchi</div>
        <h1>The Habibi pack</h1>
        <p>Keffiyeh, bisht, majlis, darbuka and a falcon, for every pet.</p>
        <div className="pills"><span className="pill gold">Free</span><span className="pill red">1,001 of each</span></div>
        <div className="thumbs">{cards.map((c) => <img key={c} src={`/brand/item-${c}.png`} alt="" />)}</div>
      </div>
      <div className="art"><img src="/brand/habibi-pack.png" alt="" /></div>
    </div>
  );
}

export function HabibiPromo() {
  if (new URLSearchParams(location.search).get('og') === '1') return <HabibiOg />;
  return <HabibiScene />;
}

function HabibiScene() {
  const title = new URLSearchParams(location.search).get('title') === '1';
  const [rigs, setRigs] = useState<(PetRig | null)[]>([]);
  useEffect(() => {
    if (rigs.filter(Boolean).length < SLOTS.length) return;
    rigs.forEach((r, i) => { const s = SLOTS[i]!; r!.setCostumes(WEAR, 0); r!.setCrown(!!s.crown, 0); s.pose(r!); });
    const t = setTimeout(() => {
      for (const a of document.getAnimations()) a.pause();
      document.documentElement.classList.add('promo-frozen');
      (window as unknown as { __promo_ready?: boolean }).__promo_ready = true;
    }, 1600);
    return () => clearTimeout(t);
  }, [rigs]);
  const F = WORLD.floor;
  // the frame shows world y 72..409.5 (16:9 of the 600-wide world), scaled to 1600 x 900
  const k = 1600 / WORLD.w;
  return (
    <div className="habibi-promo" style={{ width: 1600, height: 900, overflow: 'hidden', position: 'relative', background: '#000' }}>
      <style>{`.habibi-promo .cathost { opacity: 0; }   /* never visibility: every drawing shares its pattern and clip ids, the first one in the document is the one used, and a hidden donor's visibility is inherited into them (the cat's keffiyeh lost its check and her fringe) */ .promo-frozen *, .promo-frozen *::before, .promo-frozen *::after { animation-play-state: paused !important; }
        .habibi-promo .stage { border-radius: 0 !important; box-shadow: none !important; }
        .promo-title { position: absolute; left: 44px; top: 40px; padding: 26px 50px 34px 46px; border-radius: 24px; background: rgba(28,14,44,.93); border: 2px solid rgba(217,169,60,.45); box-shadow: 0 16px 50px rgba(0,0,0,.45); z-index: 10; font-family: inherit; }
        .promo-title .brand { display: flex; align-items: center; gap: 12px; color: #F8F8FF; font-size: 30px; font-weight: 600; }
        .promo-title .brand svg { width: 30px; height: 30px; }
        .promo-title h1 { margin: 8px 0 0; color: #F8F8FF; font-size: 76px; line-height: 1; letter-spacing: -0.03em; font-weight: 700; }
        .promo-title p { margin: 10px 0 0; color: #F6DC8E; font-size: 26px; font-weight: 600; letter-spacing: .01em; }`}</style>
      <div style={{ position: 'absolute', left: 0, top: -72 * k, width: 1600 }}>
        <Stage quiet onDirector={(d) => { if (d) d.wanderEnabled = false; }} night={false} thought={null} scene="majlis" character="cat">
          <Piece name="darbuka" x={214} bottom={F + 4} w={58} />
          {/* the notes rise from the drum's head into the gap between the frok's face and the cat */}
          <Piece name="darbukanote" x={238} bottom={304} w={22} rot={-10} />
          <Piece name="darbukanote" x={254} bottom={268} w={17} rot={12} />
          <Piece name="darbukanote" x={240} bottom={234} w={13} rot={-4} />
          <Piece name="falcon" x={386} bottom={196} w={80} rot={-6} show={['fc-fly', 'fc-legs-reach', 'fc-tail-fan']} hide={['fc-sit', 'fc-legs-grip', 'fc-tail-closed']} head="fly" />
          {SLOTS.map((s, i) => <PetSlot key={s.character} slot={s} onRig={(r) => setRigs((cur) => { const n = [...cur]; n[i] = r; return n; })} />)}
        </Stage>
      </div>
      {title && (
        <div className="promo-title">
          <div className="brand"><svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.7 1.3 5.4 3.3 1.7-2 3.2-3.3 5.4-3.3 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" fill="#E84D7F"/></svg>Emogotchi</div>
          <h1>The Habibi pack</h1>
          <p>Five items for every pet. All free.</p>
        </div>
      )}
    </div>
  );
}
