/** Off-site links. The marketplace only exists for the mainnet collection, so it is hidden elsewhere. */
import { chainCfg } from './game/chain';

export const OPENSEA = 'https://opensea.io/collection/emogotchi';
/** The marketplace link, or null when this build is not pointed at Monad mainnet. */
export const marketplace = (): string | null => (chainCfg?.chain.id === 143 ? OPENSEA : null);

/** Every page on the site, in one place, so the header and the footer can never disagree. */
export function navLinks(): { href: string; label: string }[] {
  return [
    ...(chainCfg?.drop ? [{ href: '/claim', label: 'Claim' }] : []),
    ...(chainCfg ? [{ href: '/cats', label: 'Cats' }] : []),
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/nft', label: 'NFT' },
    { href: '/faq', label: 'FAQ' },
  ];
}
