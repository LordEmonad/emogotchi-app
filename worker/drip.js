/**
 * The starter drip: a brand-new passkey account has no MON at all, and nothing on the chain will give it any.
 * This endpoint sends one small amount — enough to mint a frok and take a couple of care actions — so that a
 * stranger who has just made an account from a passkey can actually do something with it. After that they fund
 * themselves; this is a way in, not an allowance.
 *
 * WHY A DRIP AND NOT SPONSORSHIP. Both games hard-require `msg.sender` to be the player (Inversegotchi.mint is
 * `if (hasMinted[msg.sender]) revert`, every care path checks `_ownerOf[id] != msg.sender`) and both are
 * immutable, so the only two ways anyone else's money can move a player's pet are: put MON in their account, or
 * EIP-7702-delegate them. Delegation is worse here — it caps that account's VALUE spend at 10 MON for ever
 * (Monad's reserve floor is a value rule, not a gas rule), which would brick them for the cat's 1 MON care, and
 * it needs the most dangerous signature a wallet can make. A plain transfer keeps the account an ordinary EOA
 * whose mera phrase still imports into MetaMask.
 *
 * WHAT BOUNDS THE DAMAGE. The drip wallet's own balance is the cap: there is no counter to keep and nothing to
 * reset. When it runs dry the endpoint says so and the site carries on exactly as it does today — the player
 * funds themselves. Top it up by hand whenever. Keep only what you are willing to lose in it: a drip is
 * cash-recoverable (an attacker sweeps it for 21,000 gas and keeps ~89% of it), and a passkey is NOT a person —
 * tools/passkey-check.mjs drives a virtual authenticator, so "one per passkey account" means "one per free
 * address". The gates below are on-chain and stateless on purpose; they stop double-dipping, not a determined
 * farm. If it ever gets farmed, the answer is Cloudflare Turnstile in front of this route, at the cost of the
 * first third-party script on the origin that holds keys.
 */
import { createPublicClient, http, isAddress, keccak256, parseEther } from 'viem';
import { ipKey } from './social/http.js';
import { privateKeyToAccount } from 'viem/accounts';

const MONAD = { id: 143, name: 'Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } } };

/** A plain transfer is exactly this, and Monad charges the limit, so never estimate it. */
const TRANSFER_GAS = 21_000n;
const MAX_FEE = 2_000_000_000_000n; // 2,000 gwei a unit of gas (Monad charges ~100): at most 0.042 MON for the transfer
/** What a starter is worth when DRIP_MON (wrangler.toml) does not say: a mint and two care actions. Measured
 *  2026-10-02: the site sends a mint with 250,000 gas and a care action with 120,000, Monad charges the limit, the
 *  price is ~102 gwei: 0.0255 and 0.0122 MON. The live value is DRIP_MON = 0.5 (a mint and a week of full care). */
const DEFAULT_MON = '0.05';
/** Nonce collisions between Cloudflare isolates are the one real race here; re-read and retry rather than hold state. */
const SEND_ATTEMPTS = 3;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    // never cached, never shared: this is the only route on the Worker that spends money
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  },
});

/**
 * One rate-limit key per caller: an IPv6 /48, the block a free tunnel hands out (a /64 is one household, but anyone
 * can have 65,536 of them), written out in full first (the old split of the COMPRESSED address let one /64 be 65,536
 * keys: review 2026-09-27). IPv4 as it is.
 */
const callerKey = (request) => ipKey(request, 48);

/**
 * Send the starter. Returns a Response. Never throws, never logs the key, and never reports a chain error
 * verbatim to the caller — a failure here is the site's problem, not the visitor's.
 */
export async function drip(request, env) {
  // Same-origin only. Requiring a JSON content-type forces a CORS preflight for any cross-origin caller, and no
  // preflight is answered anywhere on this Worker, so another site cannot spend the float through a visitor's
  // browser. There is deliberately no access-control-allow-origin header on this route.
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') {
    return json({ error: 'Send JSON.' }, 415);
  }

  // The key is typed into a terminal prompt by a human, so accept the two ways that goes wrong and are not
  // ambiguous: surrounding whitespace (a paste that caught a newline) and a missing 0x (viem requires it, and
  // plenty of tools print a bare 64-hex key). Anything else is rejected below rather than guessed at.
  const raw = String(env.DRIP_KEY ?? '').trim();
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? `0x${raw}` : raw;
  // Not configured is a normal state, not an error: the site falls back to "fund yourself", exactly as today.
  if (!key) return json({ ok: false, reason: 'unconfigured', message: 'Starters are not being handed out right now.' }, 503);

  let address;
  try {
    const body = await request.json();
    address = String(body?.address ?? '');
  } catch { return json({ error: 'Send JSON.' }, 400); }
  // strict:false checks the shape only. viem's default also enforces EIP-55 checksum case, which would reject a
  // perfectly good lowercase address — the site happens to send a checksummed one, so this never bit, but it
  // would have the first time any other caller asked.
  if (!isAddress(address, { strict: false })) return json({ error: 'That is not an address.' }, 400);

  // The limiter is a binding, so there is no state here to keep or to get wrong. Absent (local dev), carry on:
  // the on-chain gates below are what actually stop double-dipping.
  if (env.DRIP_LIMIT) {
    const k = callerKey(request);
    if (k) {
      const { success } = await env.DRIP_LIMIT.limit({ key: k });
      if (!success) return json({ ok: false, reason: 'rate', message: 'Too many starters from here. Try again in a few minutes.' }, 429);
    }
  }
  // and the whole site's pace, so spreading requests over many addresses does not multiply the float's drain
  if (env.DRIP_ALL) {
    const { success } = await env.DRIP_ALL.limit({ key: 'all' });
    if (!success) return json({ ok: false, reason: 'rate', message: 'A lot of new players right now. Try again in a minute.' }, 429);
  }

  const rpc = env.RPC_URL || 'https://rpc.monad.xyz';
  const pub = createPublicClient({ chain: MONAD, transport: http(rpc) });
  const amount = parseEther(env.DRIP_MON || DEFAULT_MON);

  let account;
  try { account = privateKeyToAccount(key); }
  catch {
    // Never log the key. Its shape is enough to say what went wrong, and a wrong shape is the whole problem:
    // a private key is 0x + 64 hex characters.
    console.error(`[drip] DRIP_KEY is not a usable private key: ${key.length} chars, 0x-prefixed=${key.startsWith('0x')}, hex-body=${/^0x[0-9a-fA-F]*$/.test(key)}`);
    return json({ ok: false, reason: 'unconfigured', message: 'Starters are not being handed out right now.' }, 503);
  }
  // The key is a secret and the address is not, so the address is the one part of it that can be checked in the
  // open. A key pasted into the wrong secret, or a secret overwritten by mistake, would otherwise quietly start
  // spending out of whatever wallet it does belong to.
  if (env.DRIP_ADDRESS && account.address.toLowerCase() !== env.DRIP_ADDRESS.toLowerCase()) {
    console.error('[drip] DRIP_KEY does not belong to DRIP_ADDRESS; refusing to send');
    return json({ ok: false, reason: 'unconfigured', message: 'Starters are not being handed out right now.' }, 503);
  }

  try {
    const [nonce, balance, float] = await Promise.all([
      // 'latest', not 'pending': a pending transaction of their own still means they have been funded before
      pub.getTransactionCount({ address, blockTag: 'latest' }),
      pub.getBalance({ address }),
      pub.getBalance({ address: account.address }),
    ]);

    // Two stateless gates, both authoritative because they read the chain rather than something we remember.
    // A fresh passkey account is the only thing that passes: nonce 0 and nothing in it.
    if (nonce > 0) return json({ ok: false, reason: 'used', message: 'This account has already been started. Add MON to keep playing.' }, 409);
    if (balance >= amount) return json({ ok: false, reason: 'funded', message: 'This account already has MON.' }, 409);

    const cost = amount + TRANSFER_GAS * parseEther('0.0000002'); // 200 gwei of headroom over the 100 gwei floor
    if (float < cost) {
      console.error('[drip] float exhausted', account.address, float.toString());
      return json({ ok: false, reason: 'empty', message: 'All the starters have been handed out for now.' }, 503);
    }

    // no transport-level retries: a timed-out send retried by the library, answered "already known", read as a nonce
    // collision and sent a SECOND starter to the same address (review 2026-09-27). The transaction is built here field
    // by field and signed by the account itself: viem's prepareTransactionRequest asks the node to fill it
    // (eth_fillTransaction) and takes the node's gas, fees and chain id over ours, so the RPC would choose what the
    // drip wallet signs. The fee is capped: a node quoting more than MAX_FEE gets no transaction at all.
    const send = createPublicClient({ chain: MONAD, transport: http(rpc, { retryCount: 0 }) });
    let last;
    for (let i = 0; i < SEND_ATTEMPTS; i++) {
      let hash = null;
      try {
        if (i > 0) {
          // before any second try: if the first one did land after all, this address is funded and that is the answer
          const now = await pub.getBalance({ address, blockTag: 'pending' });
          if (now >= amount) return json({ ok: true, amount: amount.toString() });
        }
        // Cloudflare runs many isolates and they share one wallet, so two requests can read the same pending
        // count. Re-reading on each attempt is cheaper and simpler than leasing a nonce in a Durable Object,
        // and a lost race costs one retry. Signed here first, so its hash is known whatever the node answers.
        const n = await pub.getTransactionCount({ address: account.address, blockTag: 'pending' });
        const fees = await pub.estimateFeesPerGas();
        if (fees.maxFeePerGas > MAX_FEE || fees.maxPriorityFeePerGas > fees.maxFeePerGas) throw new Error(`fee out of range: ${fees.maxFeePerGas}`);
        const signed = await account.signTransaction({ chainId: MONAD.id, type: 'eip1559', to: address, value: amount, gas: TRANSFER_GAS, nonce: n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
        hash = keccak256(signed);
        await send.sendRawTransaction({ serializedTransaction: signed });
        console.log('[drip]', address, hash);
        return json({ ok: true, hash, amount: amount.toString() });
      } catch (e) {
        last = e;
        const m = String(e?.shortMessage ?? e?.message ?? e);
        // "already known": this very transaction is in the pool already. That is a success, not a reason to send again
        if (hash && /already known/i.test(m)) { console.log('[drip]', address, hash, '(already known)'); return json({ ok: true, hash, amount: amount.toString() }); }
        // anything that is not a nonce collision will not fix itself on a retry
        if (!/nonce|replacement/i.test(m)) break;
      }
    }
    console.error('[drip] send failed', String(last?.shortMessage ?? last).slice(0, 200));
    return json({ ok: false, reason: 'failed', message: 'The starter could not be sent. Try again in a moment.' }, 502);
  } catch (e) {
    console.error('[drip]', String(e?.shortMessage ?? e).slice(0, 200));
    return json({ ok: false, reason: 'failed', message: 'The starter could not be sent. Try again in a moment.' }, 502);
  }
}
