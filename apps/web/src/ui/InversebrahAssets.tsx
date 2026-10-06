import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { EMPTY_WALLET } from '../wallet';
import { NFT_STATES, NFT_STATE_LABEL } from './NftArt';

/**
 * Everything made for inversebrah, on one page, for review before anything goes on chain: the eighteen
 * on-chain portraits, the same in the witch outfit and the emo hair, the hair's shop card, the brand kit, and
 * the rules the contract will carry. Not linked from the nav.
 */
const PORTRAITS = (dir: string) => NFT_STATES.flatMap((s) => [false, true].map((crown) => ({ src: `/nft/inversebrah/${dir ? dir + '/' : ''}${s}${crown ? '-crown' : ''}-1024.png`, label: `${NFT_STATE_LABEL[s]}${crown ? ' · crown' : ''}` })));

const BRAND = [
  { src: '/brand/inversebrah-opensea-banner.png', label: 'OpenSea banner · 2400×900' },
  { src: '/brand/inversebrah-opensea-featured.png', label: 'OpenSea featured · 1200×800' },
  { src: '/brand/inversebrah-logo.png', label: 'Logo · 1024' },
  { src: '/brand/inversebrah-x-header.png', label: 'X header · 3000×1000' },
  { src: '/brand/inversebrah-hero-16x9.png', label: 'Hero 16:9' },
];

const RULES = [
  ['Collection', 'Inversegotchi (INVERSEBRAH). The pet is inversebrah.'],
  ['Mint', 'Free, public, one per wallet, no cap, no end. He arrives fresh with 7 days before his clock runs.'],
  ['Care', 'Feed, play, wash, sleep, clean, wake, pet: all free (gas only). Same meters, poop, sleep, death at 48 h and crown rules as the cat.'],
  ['Abuse', 'Screenshot, slap, squeeze, ignite: free, counted for life, visible as traits (Screenshots, Slaps, Squeezes, Burns). They touch no meter and no clock.'],
  ['Name', '10 MON, any time while alive. The one paid act: 80% buys EMO and burns it, 10% treasury, 10% team.'],
  ['Revive', 'Free. Every meter to 60, score to 0, streak to 1; deaths and revives stay on the record.'],
  ['Crown', 'His own top 100 by care score after a week of history, live, on chain, in the wallet picture.'],
  ['Items', 'Every shop item can be put on him (the witch outfit, the Spooky theme, whatever comes next). The emo hair is new: free, one per wallet, 1,000 in all, for anyone holding any pet the shop allows; the cat has its own hair. Crowned, he wears the hat or the hair gold.'],
  ['Money in', 'Nothing but names. No direct-transfer protocol: plain MON sent to the contract reverts.'],
];

function Grid({ items, wide = false }: { items: { src: string; label: string }[]; wide?: boolean }) {
  return (
    <div className={`assets-grid ${wide ? 'is-wide' : ''}`}>
      {items.map((it) => (
        <figure key={it.src}><a href={it.src} target="_blank" rel="noreferrer"><img src={it.src} alt={it.label} loading="lazy" /></a><figcaption>{it.label}</figcaption></figure>
      ))}
    </div>
  );
}

export function InversebrahAssets() {
  return (
    <div className="page">
      <Header wallet={EMPTY_WALLET} onConnect={() => { location.href = '/'; }} onDisconnect={() => {}} compact />
      <main className="landing assets-page">
        <h1>inversebrah</h1>
        <p className="lead">Everything made for him, before anything goes on chain. The rig with every animation is at <a href="/frog">/frog</a>.</p>

        <h2>On-chain portraits <small>what tokenURI composes, 9 moods × crown; verified byte for byte against the contract</small></h2>
        <Grid items={PORTRAITS('')} />

        <h2>Witch outfit <small>item 1, worn; crowned = the golden hat</small></h2>
        <Grid items={PORTRAITS('witch')} />

        <h2>Emo hair <small>the new item, worn; crowned = golden hair, no crown</small></h2>
        <Grid items={PORTRAITS('emohair')} />

        <h2>Shop cards <small>the item's own on-chain picture</small></h2>
        <Grid items={[{ src: '/brand/item-emohair.png', label: 'Emo hair' }, { src: '/brand/item-witch.png', label: 'Witch outfit (live)' }]} />

        <h2>Brand kit <small>generated from his on-chain art</small></h2>
        <Grid items={BRAND} wide />

        <h2>The rules the contract carries</h2>
        <dl className="assets-rules">
          {RULES.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
      </main>
      <SiteFooter />
    </div>
  );
}
