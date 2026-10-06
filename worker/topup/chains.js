/**
 * "Add MON from another chain" (CROSSCHAIN.md): the chains and tokens a player may pay with, the one place both the
 * Worker and the site read them from (the site imports this file through apps/web/src/topup/chains.ts, the way the
 * social rules are shared).
 *
 * Every token here is one Relay takes straight into its depository on that chain (its `solverCurrencies`, read from
 * https://api.relay.link/chains on 2026-09-29). A token that Relay first swaps on the origin chain (WETH, and anything
 * else not listed) goes through a proxy contract instead, and the validator refuses any step that does not pay the
 * depository, so such a token must never be added here. Decimals are per chain: BNB Chain's USDC and USDT have 18.
 *
 * `relay` is the name the order Relay signs uses for the chain (`protocol.v2.chainId` in Relay's /chains: "base", "bnb",
 * "monad"...; NOT always the chain's `name`, which is "bsc" for BNB Chain). The Worker checks both against /chains.
 * `rpc` is the Worker's reads (balances, is the address a contract), tried in order: from Cloudflare's shared addresses
 * public endpoints often answer 429, and which ones do changes by the request (probed from the edge 2026-09-30), so each
 * chain has several; polygon-rpc.com is dead ("tenant disabled"). `walletRpc` is the chain's own endpoint, offered to a
 * wallet that has never seen the chain (wallet_addEthereumChain). Neither ever decides money.
 */
export const MONAD_ID = 143;
export const NATIVE = '0x0000000000000000000000000000000000000000';

/** Relay's depository: the same address on every chain (checked 2026-09-29). The Worker also reads it from Relay's
 *  /chains and refuses to quote if the two ever differ. */
export const DEPOSITORY = '0x4cd00e387622c35bddb9b4c962c136462338bc31';

/** Relay's deposit addresses (for a player with no wallet on the other chain: send the coin to an address, from anywhere).
 *  Each one is a CREATE2 address of this factory, salt keccak256(orderId ++ depositor), over a minimal proxy (Solady's
 *  LibClone) of this implementation, which sweeps whatever lands there into the DEPOSITORY for that order and depositor.
 *  So an address can be recomputed from the order alone (validate.js `depositAddressOf`), with no call to anyone.
 *  Both contracts are immutable and byte-identical on all seven chains, the depository baked into the implementation;
 *  their code hashes are pinned here and the Worker checks them on each chain before it shows an address there.
 *  (Found and checked 2026-09-29: the factory's `computeDepositAddress` gave every address Relay's API did.) */
export const DEPOSIT_FACTORY = '0x1df43ab501f8b0d604f9a58a41a51744f2f8cd22';
export const DEPOSIT_IMPLEMENTATION = '0x40b309095342d0823d6b9458ccc07ab170bc3e94';
export const DEPOSIT_FACTORY_CODEHASH = '0xfd35827b7e6d79cc34371cf4537ca56a12e62b6095c2f9c41a91c0b471f29fb4';
export const DEPOSIT_IMPLEMENTATION_CODEHASH = '0xc314ec1275ff1772e7aeee616d98d92e457f6f13e1b07021e212d3d307fe70dc';

/** What a player may add in one go (CROSSCHAIN.md "Decisions"): below 50 MON Relay's flat fee becomes a real share of
 *  the money; 10,000 MON (~$270 today) keeps a slip of the finger small. */
export const MIN_MON = 50;
export const MAX_MON = 10_000;

export const ORIGINS = [
  {
    id: 8453, relay: 'base', name: 'Base', explorer: 'https://basescan.org',
    native: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    walletRpc: 'https://mainnet.base.org',
    rpc: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org', 'https://developer-access-mainnet.base.org'],
    tokens: [
      { symbol: 'ETH', address: NATIVE, decimals: 18 },
      { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    ],
  },
  {
    id: 1, relay: 'ethereum', name: 'Ethereum', explorer: 'https://etherscan.io',
    native: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    walletRpc: 'https://ethereum-rpc.publicnode.com',
    rpc: ['https://ethereum.publicnode.com', 'https://eth.drpc.org', 'https://rpc.flashbots.net', 'https://ethereum-rpc.publicnode.com'],
    tokens: [
      { symbol: 'ETH', address: NATIVE, decimals: 18 },
      { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    ],
  },
  {
    id: 42161, relay: 'arbitrum', name: 'Arbitrum', explorer: 'https://arbiscan.io',
    native: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    walletRpc: 'https://arb1.arbitrum.io/rpc',
    rpc: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one.publicnode.com', 'https://arbitrum.drpc.org'],
    tokens: [
      { symbol: 'ETH', address: NATIVE, decimals: 18 },
      { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
    ],
  },
  {
    id: 10, relay: 'optimism', name: 'Optimism', explorer: 'https://optimistic.etherscan.io',
    native: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    walletRpc: 'https://mainnet.optimism.io',
    rpc: ['https://mainnet.optimism.io', 'https://optimism.publicnode.com', 'https://optimism.drpc.org'],
    tokens: [
      { symbol: 'ETH', address: NATIVE, decimals: 18 },
      { symbol: 'USDC', address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
    ],
  },
  {
    id: 4663, relay: 'robinhood', name: 'Robinhood Chain', explorer: 'https://robin.etherscan.io',
    native: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    walletRpc: 'https://rpc.mainnet.chain.robinhood.com',
    rpc: ['https://robinhood.drpc.org', 'https://rpc.mainnet.chain.robinhood.com'],
    tokens: [
      { symbol: 'ETH', address: NATIVE, decimals: 18 },
    ],
  },
  {
    id: 56, relay: 'bnb', name: 'BNB Chain', explorer: 'https://bscscan.com',
    native: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    walletRpc: 'https://bsc-dataseed.bnbchain.org',
    rpc: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org', 'https://bsc-dataseed1.binance.org'],
    tokens: [
      { symbol: 'BNB', address: NATIVE, decimals: 18 },
      { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
      { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
    ],
  },
  {
    // Relay does not take POL directly (not a solver currency), so Polygon is stablecoins only
    id: 137, relay: 'polygon', name: 'Polygon', explorer: 'https://polygonscan.com',
    native: { name: 'POL', symbol: 'POL', decimals: 18 },
    walletRpc: 'https://polygon-bor-rpc.publicnode.com',
    rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
    ],
  },
];

export const originById = (id) => ORIGINS.find((c) => c.id === Number(id)) ?? null;
export const tokenOf = (chain, address) => chain?.tokens.find((t) => t.address === String(address ?? '').toLowerCase()) ?? null;
/** Stablecoins are counted at a dollar when sorting a player's balances; everything else is priced by Relay. */
export const isStable = (symbol) => symbol === 'USDC' || symbol === 'USDT';
