/** Off-site links. The marketplace only exists for the mainnet collection, so it is hidden elsewhere. */
import { chainCfg } from './game/chain';

export const OPENSEA = 'https://opensea.io/collection/emogotchi';
/** The marketplace link, or null when this build is not pointed at Monad mainnet. */
export const marketplace = (): string | null => (chainCfg?.chain.id === 143 ? OPENSEA : null);

export type NavLink = { href: string; label: string; beta?: boolean; more?: boolean };

/**
 * Every page on the site, in one place, so the header and the footer can never disagree.
 * `more` marks the pages the header's row keeps under its "More" menu (since 2026-10-02: with ten links in the row the
 * nav only fit from 1460px, so a 1440 laptop, the common desktop, saw a hamburger and never saw Emotown or Fight Club);
 * the phone menu and the footer list all of them flat.
 */
export function navLinks(): NavLink[] {
  return [
    // one tab for all three pets since 2026-09-28 (operator: "combine the cat claim inversebrah and tung tung tung
    // tabs all into one page"); /claim, /mint and /tung keep their own pages and link cards
    { href: '/adopt', label: 'Get a pet' },
    { href: '/emotown', label: 'Emotown', beta: true },   // the town of the pets active today (in beta since 2026-09-27)
    { href: '/fightclub', label: 'Fight Club', beta: true },   // pets fight 1v1 for MON (in beta since 2026-09-30)
    ...(chainCfg?.items ? [{ href: '/shop', label: 'Item shop' }] : []),
    ...(chainCfg ? [{ href: '/pets', label: 'Pet gallery' }] : []),
    { href: '/leaderboard', label: 'Leaderboard', more: true },
    ...(chainCfg ? [{ href: '/nft', label: 'Art', more: true }] : []),   // the art, read from the contract
    { href: '/pfps', label: 'PFPs', more: true },   // free profile pictures of every pet (2026-09-25)
    ...(chainCfg ? [{ href: '/stats', label: 'Stats', more: true }] : []),
    { href: '/faq', label: 'FAQ', more: true },
  ];
}
