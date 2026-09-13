import { Icon } from './Icon';
import { NftArt, type NftState } from './NftArt';

/**
 * /leaderboard. Ranked by care score: the average of the four meters over the last 7 days,
 * ties broken by the longer streak. Names are the cat's on-chain name if it has one, else the
 * owner's wallet name, else the short address. Data here is a mock until the indexer exists.
 */
type Row = { rank: number; name: string; named: boolean; owner: string; score: number; streak: number; burned: number; state: NftState };

const MOCK: Row[] = [
  { rank: 1, name: 'Muffin', named: true, owner: 'lordemo.mon', score: 97.4, streak: 41, burned: 2_418_000, state: 'happy' },
  { rank: 1, name: 'gmgm.mon', named: false, owner: '0x8D34…2EAb', score: 97.4, streak: 38, burned: 1_902_500, state: 'content' },
  { rank: 3, name: 'Sir Pounce', named: true, owner: '0x71C7…9A21', score: 94.8, streak: 29, burned: 1_711_200, state: 'happy' },
  { rank: 4, name: 'Nyx', named: true, owner: 'catmom.mon', score: 93.0, streak: 35, burned: 1_540_000, state: 'content' },
  { rank: 5, name: '0x3F0a…c1D9', named: false, owner: '0x3F0a…c1D9', score: 91.2, streak: 22, burned: 1_101_000, state: 'content' },
  { rank: 6, name: 'Bean', named: true, owner: 'monadmaxi.mon', score: 89.7, streak: 27, burned: 998_400, state: 'happy' },
  { rank: 7, name: 'Widow', named: true, owner: '0xA1b2…77E0', score: 88.3, streak: 19, burned: 876_000, state: 'content' },
  { rank: 8, name: 'degen.mon', named: false, owner: 'degen.mon', score: 84.9, streak: 14, burned: 812_300, state: 'bored' },
  { rank: 9, name: 'Pixel', named: true, owner: '0x5E2f…10bC', score: 82.1, streak: 16, burned: 640_000, state: 'content' },
  { rank: 10, name: 'Toast', named: true, owner: '0x99Aa…F00d', score: 79.6, streak: 11, burned: 590_100, state: 'hungry' },
  { rank: 11, name: '0xB0b1…e5e5', named: false, owner: '0xB0b1…e5e5', score: 74.0, streak: 9, burned: 402_000, state: 'grubby' },
  { rank: 12, name: 'Mochi', named: true, owner: 'emofan.mon', score: 70.2, streak: 12, burned: 388_000, state: 'sleepy' },
];

const fmt = (n: number) => n.toLocaleString();

export function Leaderboard({ me }: { me?: string | null }) {
  const top = MOCK.slice(0, 3); const rest = MOCK.slice(3);
  // the top 100 wear the crown; anyone tied with the 100th does too. The mock has fewer than 100, so all of them qualify
  const CROWN_SLOTS = 100;
  const cutoff = MOCK[Math.min(CROWN_SLOTS, MOCK.length) - 1]?.score ?? 0;
  const crowned = (r: Row) => r.score >= cutoff;
  return (
    <main className="lb">
      <div className="lb-head">
        <h1>Best kept cats</h1>
        <p>Care score is your cat's average meters over the last 7 days. The top 100 cats wear the crown that week; ties at the 100th place extend the list. The longer streak only decides the order they're listed in. Named cats show their name; the rest show their owner's wallet name.</p>
        <div className="lb-tabs" role="tablist"><button className="is-on" role="tab">This week</button><button role="tab">All time</button><button role="tab">Most burned</button></div>
      </div>

      <ol className="podium">
        {[top[1], top[0], top[2]].map((r, i) => r && (
          <li key={r.name} className={`podium-card place-${crowned(r) ? 1 : i === 0 ? 2 : 3}`}>
            <span className="podium-rank">{crowned(r) ? `#${r.rank} · wears the crown` : `#${r.rank}`}</span>
            {crowned(r) ? <div className="podium-img podium-live"><NftArt state={r.state} crown /></div> : <img className="podium-img" src={`/nft/${r.state}-1024.png`} alt="" width={512} height={512} />}
            <span className="podium-name">{r.name}</span>
            <span className="podium-owner tnum">{r.named ? r.owner : 'unnamed'}</span>
            <span className="podium-score tnum">{r.score.toFixed(1)}</span>
            <span className="podium-meta tnum"><Icon name="flame" size={12} /> {fmt(r.burned)} · {r.streak}d</span>
          </li>
        ))}
      </ol>

      <div className="lb-table" role="table">
        <div className="lb-row lb-th" role="row"><span>#</span><span>Cat</span><span className="hide-sm">Owner</span><span>Score</span><span className="hide-sm">Streak</span><span>Burned</span></div>
        {rest.map((r) => (
          <div key={r.name} className={`lb-row ${me && r.owner === me ? 'is-me' : ''}`} role="row">
            <span className="tnum lb-rank">{r.rank}{crowned(r) && <span className="lb-crown" title="Wears the crown">♛</span>}</span>
            <span className="lb-cat"><img src={`/nft/${r.state}-1024.png`} alt="" width={64} height={64} /><span className="lb-name">{r.name}{!r.named && <small>unnamed</small>}</span></span>
            <span className="tnum hide-sm lb-owner">{r.owner}</span>
            <span className="tnum lb-score">{r.score.toFixed(1)}</span>
            <span className="tnum hide-sm">{r.streak}d</span>
            <span className="tnum lb-burn"><Icon name="flame" size={12} /> {fmt(r.burned)}</span>
          </div>
        ))}
      </div>
      <p className="lb-note">Live once the contract and indexer are up. Numbers here are placeholders.</p>
    </main>
  );
}
