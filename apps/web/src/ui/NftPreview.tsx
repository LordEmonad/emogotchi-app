import { useState } from 'react';
import { NFT_STATES, NFT_STATE_LABEL, NFT_STATE_RULE, NftArt, type NftState } from './NftArt';

/** /nft: every wallet image side by side with the metadata it ships with. */
export function NftPreview() {
  const [sel, setSel] = useState<NftState>('content');
  const [crown, setCrown] = useState(false);
  const meta = {
    name: 'Muffin',
    description: 'A cat that lives in your wallet. Feed it, wash it, play with it, put it to bed. Every interaction costs 1 MON, and 80% of every interaction buys EMO and burns it on the spot. Every feed, wash, play, nap, pet and death is counted on chain and stays with the cat forever. Go a day without food and it dies; 1,000 MON brings it back. Name it for 10 MON. Streaks are recorded on chain. The best kept cats each week wear the crown.',
    image: `https://emogotchi.emonad.lol/nft/${sel}${crown ? '-crown' : ''}-1024.png`,
    external_url: 'https://emogotchi.emonad.lol/pet/4021',
    animation_url: 'https://emogotchi.emonad.lol/pet/4021',
    background_color: '24123F',
    attributes: [
      { trait_type: 'Mood', value: NFT_STATE_LABEL[sel] },
      { trait_type: 'Alive', value: sel === 'dead' ? 'No' : 'Yes' },
      { trait_type: 'Crown', value: crown ? 'Wears the crown' : 'No' },
      { trait_type: 'Food', display_type: 'boost_percentage', value: sel === 'hungry' ? 12 : 72 },
      { trait_type: 'Clean', display_type: 'boost_percentage', value: sel === 'grubby' ? 18 : 80 },
      { trait_type: 'Fun', display_type: 'boost_percentage', value: sel === 'bored' ? 20 : 64 },
      { trait_type: 'Energy', display_type: 'boost_percentage', value: sel === 'sleepy' ? 14 : 85 },
      { trait_type: 'Day', display_type: 'number', value: 12 },
      { trait_type: 'Streak', display_type: 'number', value: 12 },
      { trait_type: 'Feeds', display_type: 'number', value: 14 },
      { trait_type: 'Washes', display_type: 'number', value: 9 },
      { trait_type: 'Plays', display_type: 'number', value: 11 },
      { trait_type: 'Naps', display_type: 'number', value: 12 },
      { trait_type: 'Cleanups', display_type: 'number', value: 13 },
      { trait_type: 'Pets', display_type: 'number', value: 326 },
      { trait_type: 'Deaths', display_type: 'number', value: sel === 'dead' ? 1 : 0 },
      { trait_type: 'Revives', display_type: 'number', value: 0 },
      { trait_type: 'EMO burned', display_type: 'number', value: 1_218_432 },
    ],
  };
  return (
    <main className="nftpage">
      <div className="nft-intro">
        <h1>What the NFT looks like</h1>
        <p>The picture in a wallet or marketplace is chosen by the contract from the cat's on-chain state. Nine states, one square image each, and a crowned version of each for the cats tied at the top of the leaderboard that week. Exact meters, the name, the day, and the lifetime record (every feed, wash, play, nap, cleanup, pet, death and revive) ship as attributes. Tap a state to see its metadata.</p>
        <label className="nft-toggle"><input type="checkbox" checked={crown} onChange={(e) => setCrown(e.target.checked)} /> <span>Wears the crown</span></label>
      </div>
      <div className="nft-grid">
        {NFT_STATES.map((s) => (
          <button key={s} className={`nft-card ${sel === s ? 'is-sel' : ''}`} onClick={() => setSel(s)}>
            <NftArt state={s} crown={crown} />
            <span className="nft-card-title">{NFT_STATE_LABEL[s]}</span>
            <span className="nft-card-rule">{NFT_STATE_RULE[s]}</span>
          </button>
        ))}
      </div>
      <div className="nft-meta">
        <div className="nft-meta-head"><span className="chip">tokenURI · {NFT_STATE_LABEL[sel]}</span><span className="nft-meta-note">name = the on-chain name, or "Emogotchi #id" until named</span></div>
        <pre>{JSON.stringify(meta, null, 2)}</pre>
      </div>
      <footer className="foot"><a href="/">← Back to Emogotchi</a><span className="foot-right">Renders: <code>node tools/portrait.mjs</code> → <code>public/nft/&lt;state&gt;[-crown]-1024.png</code></span></footer>
    </main>
  );
}
