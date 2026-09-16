/** Off-site links. The marketplace only exists for the mainnet collection, so it is hidden elsewhere. */
import { chainCfg } from './game/chain';

export const OPENSEA = 'https://opensea.io/collection/emogotchi';
/** The marketplace link, or null when this build is not pointed at Monad mainnet. */
export const marketplace = (): string | null => (chainCfg?.chain.id === 143 ? OPENSEA : null);
