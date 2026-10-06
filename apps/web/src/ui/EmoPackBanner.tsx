/**
 * The emo pack's banner at the top of the shop (items.ts EMO_ON): its picture, its terms, its seven cards (the holders'
 * edition's, in their foil), a way in to its page.
 */
import { EMO_HERO, EMO_ITEMS, EMO_HOLD, EMO_PRICE } from './emoPackData';
import './emopack.css';

export function EmoPackBanner({ live }: { live: boolean }) {
  return (
    <a className="pack-banner emo" href="/shop/emo">
      <div className="pack-banner-copy">
        <span className="pack-eyebrow">New pack <b>{live ? 'Live' : 'Coming soon'}</b></span>
        <h3>The <em>emo</em> pack</h3>
        <p>A beanie, the fit, wristbands, lip piercings, an emo bedroom, a guitar and a flip phone. Seven items for every pet. Hold $EMO and it is all free.</p>
        <div className="pack-facts">
          <div className="pack-fact"><strong>Free</strong><span>holding {EMO_HOLD.toLocaleString()} $EMO · soulbound</span></div>
          <div className="pack-fact"><strong>{EMO_PRICE} MON</strong><span>each, for anyone with a pet</span></div>
        </div>
        <div className="pack-banner-thumbs" aria-hidden>{EMO_ITEMS.map((i) => <img key={i.key} src={i.holder} alt="" loading="lazy" />)}</div>
        <span className="btn btn-pink">See the pack</span>
      </div>
      <figure className="pack-banner-art"><img src={EMO_HERO} alt="The pets playing guitars in the emo bedroom, in the pack's items" loading="lazy" /></figure>
    </a>
  );
}
