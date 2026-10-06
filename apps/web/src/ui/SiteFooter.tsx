/**
 * One footer for every page. Each page used to carry its own hand-written set of links, so which
 * pages you could reach depended on which page you were standing on, and some routes appeared
 * nowhere at all.
 */
import { marketplace } from '../links';
import { chainCfg } from '../game/chain';

export function SiteFooter({ extra }: { extra?: React.ReactNode }) {
  const explorer = chainCfg?.explorer && chainCfg.contract ? `${chainCfg.explorer}/address/${chainCfg.contract}` : null;
  return (
    <footer className="foot">
      <span>An <a href="https://emonad.lol">Emonad</a> thing · $EMO on Monad</span>
      <nav className="foot-right" aria-label="Site">
        <a href="/">Home</a>
        <a href="/adopt">Get a pet</a>
        {chainCfg && <a href="/pets">Pet gallery</a>}
        <a href="/emotown">Emotown</a>
        {chainCfg && <a href="/nft">Art</a>}
        <a href="/leaderboard">Leaderboard</a>
        {chainCfg && <a href="/stats">Stats</a>}
        <a href="/faq">FAQ</a>
        {marketplace() && <a href={marketplace()!} target="_blank" rel="noreferrer">OpenSea</a>}
        {explorer && <a href={explorer} target="_blank" rel="noreferrer">Contract</a>}
        {extra}
      </nav>
    </footer>
  );
}
