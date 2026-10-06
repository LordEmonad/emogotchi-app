/**
 * "Add MON from another chain" (CROSSCHAIN.md): the Worker's three routes. The page never talks to Relay; it asks
 * these, and they build every Relay request themselves (so the recipient, the refund address and the destination are
 * always the player's own), check every answer (./validate.js), and hand back only what may be signed.
 *
 *   POST /api/topup/quote     { player, chainId, currency, amountMon, mode: 'wallet' | 'address' }
 *   POST /api/topup/balances  { player }
 *   GET  /api/topup/status?id=<requestId>
 *
 * The drip's discipline (drip.js): JSON content-type required on POSTs (forces a CORS preflight that nothing answers,
 * so another site cannot use a visitor's browser), no access-control-allow-origin, never cached, per-/48 and site-wide
 * limits, Relay's errors never passed through verbatim. `RELAY_API_KEY` is a secret; deleting it switches the feature
 * off without a deploy (every route answers 503 `unconfigured` and the site falls back to "fund it yourself").
 */
import { formatUnits, keccak256, parseEther } from 'viem';
import { ipKey, limited } from '../social/http.js';
import { DEPOSITORY, DEPOSIT_FACTORY, DEPOSIT_FACTORY_CODEHASH, DEPOSIT_IMPLEMENTATION, DEPOSIT_IMPLEMENTATION_CODEHASH, MAX_MON, MIN_MON, MONAD_ID, NATIVE, ORIGINS, isStable, originById, tokenOf } from './chains.js';
import { TopupRefused, checkQuote } from './validate.js';

const MONAD_RPC = ['https://rpc.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc3.monad.xyz'];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' },
});
const lc = (a) => String(a ?? '').toLowerCase();
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(lc(a));

async function readJson(request) {
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') return null;
  try { return await request.json(); } catch { return null; }
}

function relayBase(env) { return String(env.RELAY_BASE ?? 'https://api.relay.link').replace(/\/$/, ''); }
async function relay(env, path, init = {}) {
  const r = await fetch(relayBase(env) + path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-api-key': String(env.RELAY_API_KEY ?? '').trim(), ...(init.headers ?? {}) },
  });
  let body = null; try { body = await r.json(); } catch { /* below */ }
  return { ok: r.ok, status: r.status, body };
}

/**
 * Relay's own chain list says where its depository is on each chain and what its orders call the chain. Both are
 * checked against chains.js once an hour (per Cloudflare location); if Relay ever changes either, nothing is quoted
 * until a person looks.
 */
let depositoryCheck = { at: 0, ok: false };
async function depositoryUnchanged(env) {
  // a yes holds an hour; a no (or Relay not answering) is asked again after a minute
  if (Date.now() - depositoryCheck.at < (depositoryCheck.ok ? 3_600_000 : 60_000)) return depositoryCheck.ok;
  const r = await relay(env, '/chains');
  const chains = r.ok ? r.body?.chains ?? [] : [];
  const want = [...ORIGINS.map((c) => [c.id, c.relay]), [MONAD_ID, 'monad']];
  const ok = chains.length > 0 && want.every(([id, name]) => {
    const v2 = chains.find((c) => c.id === id)?.protocol?.v2;
    return lc(v2?.depository) === DEPOSITORY && v2?.chainId === name;
  });
  depositoryCheck = { at: Date.now(), ok };
  return ok;
}

// ---------------------------------------------------------------- JSON-RPC reads on the origin chains
async function rpc(urls, method, params) {
  let last;
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { last = e; }
  }
  throw last ?? new Error('no rpc');
}
/** Code at an address that is not an EIP-7702 designator (0xef0100…): a smart-contract wallet. Its address on one chain
 *  says nothing about who holds it on another, so MON (or a refund) sent to "the same address" could reach nobody. */
const isContractCode = (code) => typeof code === 'string' && code !== '0x' && code !== '0x0' && !code.toLowerCase().startsWith('0xef0100');
/** Tests only, never set in wrangler.toml: `TOPUP_RPCS` = {"8453": "http://127.0.0.1:8547", "143": ...} sends this
 *  Worker's reads for those chains to local forks (tools/topup-e2e.mjs). */
function rpcsOf(env, id, urls) {
  try { const o = env.TOPUP_RPCS ? JSON.parse(env.TOPUP_RPCS) : null; if (o && typeof o[id] === 'string') return [o[id]]; } catch { /* ignored */ }
  return urls;
}
const balanceOfData = (who) => '0x70a08231' + lc(who).slice(2).padStart(64, '0');

/** USD prices for sorting a player's balances (stablecoins count as a dollar), cached five minutes per location. */
let prices = { at: 0, map: {} };
async function priceOf(env, chainId, address) {
  if (Date.now() - prices.at > 300_000) prices = { at: Date.now(), map: {} };
  const k = `${chainId}:${address}`;
  if (k in prices.map) return prices.map[k];
  const r = await relay(env, `/currencies/token/price?address=${address}&chainId=${chainId}`, { method: 'GET' });
  const p = r.ok && Number.isFinite(Number(r.body?.price)) ? Number(r.body.price) : null;
  prices.map[k] = p;
  return p;
}

/** Before a deposit address is shown for a chain: Relay's deposit-address factory and implementation there are still
 *  the pinned code (chains.js). A yes holds an hour per chain; a no or an unreachable chain, a minute. */
const depositCode = new Map();
async function depositContractsUnchanged(env, chain) {
  const had = depositCode.get(chain.id);
  if (had && Date.now() - had.at < (had.ok ? 3_600_000 : 60_000)) return had.ok;
  let ok = false;
  try {
    const urls = rpcsOf(env, chain.id, chain.rpc);
    const [f, i] = await Promise.all([rpc(urls, 'eth_getCode', [DEPOSIT_FACTORY, 'latest']), rpc(urls, 'eth_getCode', [DEPOSIT_IMPLEMENTATION, 'latest'])]);
    ok = typeof f === 'string' && f.length > 2 && keccak256(f) === DEPOSIT_FACTORY_CODEHASH
      && typeof i === 'string' && i.length > 2 && keccak256(i) === DEPOSIT_IMPLEMENTATION_CODEHASH;
  } catch { ok = false; }
  depositCode.set(chain.id, { at: Date.now(), ok });
  return ok;
}

// ---------------------------------------------------------------- routes
async function balances(request, env) {
  const body = await readJson(request);
  const player = lc(body?.player);
  if (!isAddr(player)) return json({ error: 'bad-player' }, 400);
  const monUsd = await priceOf(env, MONAD_ID, NATIVE);
  const out = await Promise.all(ORIGINS.map(async (c) => {
    try {
      const [code, ...bals] = await Promise.all([
        rpc(rpcsOf(env, c.id, c.rpc), 'eth_getCode', [player, 'latest']),
        ...c.tokens.map((t) => (t.address === NATIVE ? rpc(rpcsOf(env, c.id, c.rpc), 'eth_getBalance', [player, 'latest']) : rpc(rpcsOf(env, c.id, c.rpc), 'eth_call', [{ to: t.address, data: balanceOfData(player) }, 'latest']))),
      ]);
      const contract = isContractCode(code);
      const tokens = await Promise.all(c.tokens.map(async (t, i) => {
        const raw = BigInt(bals[i] && bals[i] !== '0x' ? bals[i] : '0x0');
        const amount = Number(formatUnits(raw, t.decimals));
        const usd = isStable(t.symbol) ? amount : amount > 0 ? amount * ((await priceOf(env, c.id === 56 ? 56 : 1, NATIVE)) ?? 0) : 0;
        return { symbol: t.symbol, address: t.address, decimals: t.decimals, balance: raw.toString(), usd: Math.round(usd * 100) / 100 };
      }));
      return { chainId: c.id, name: c.name, contract, tokens };
    } catch { return { chainId: c.id, name: c.name, error: true, tokens: [] }; }
  }));
  return json({ player, monUsd, chains: out });
}

async function quote(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Send JSON.' }, 415);
  const player = lc(body.player);
  const chain = originById(body.chainId);
  const token = tokenOf(chain, body.currency);
  const mode = body.mode === 'address' ? 'address' : 'wallet';
  const amountMon = Number(body.amountMon);
  if (!isAddr(player)) return json({ error: 'bad-player' }, 400);
  if (!chain || !token) return json({ error: 'not-offered' }, 400);
  if (!Number.isFinite(amountMon) || amountMon < MIN_MON || amountMon > MAX_MON) return json({ error: 'amount', min: MIN_MON, max: MAX_MON }, 400);
  if (await limited(env.TOPUP_ALL, 'all')) return json({ error: 'busy', message: 'Lots of people are adding MON right now. Try again in a minute.' }, 429);
  if (!(await depositoryUnchanged(env))) return json({ error: 'relay-changed', message: 'Adding MON is paused for a moment.' }, 503);
  // a smart-contract wallet (a Safe and the like) on either side: the MON, or a refund, would go to an address that may
  // belong to nobody there. Both lookups must answer; a chain that cannot be read is not guessed at.
  let codes;
  try { codes = await Promise.all([rpc(rpcsOf(env, chain.id, chain.rpc), 'eth_getCode', [player, 'latest']), rpc(rpcsOf(env, MONAD_ID, MONAD_RPC), 'eth_getCode', [player, 'latest'])]); }
  catch { return json({ error: 'rpc', message: `Could not reach ${chain.name} right now. Try again in a moment.` }, 502); }
  if (codes.some(isContractCode)) return json({ error: 'contract-wallet', message: 'This works from an ordinary wallet only, not a smart-contract wallet: send MON to your Monad address another way.' }, 400);
  const amountWei = parseEther(amountMon.toFixed(6));

  const req = {
    user: player, recipient: player, refundTo: player,
    originChainId: chain.id, destinationChainId: MONAD_ID,
    originCurrency: token.address, destinationCurrency: NATIVE,
    amount: amountWei.toString(), tradeType: 'EXACT_OUTPUT',
    includeProtocolData: true, referrer: 'emogotchi.emonad.lol',
    ...(mode === 'address' ? { useDepositAddress: true, strict: true } : {}),
  };
  const r = await relay(env, '/quote/v2', { method: 'POST', body: JSON.stringify(req) });
  if (!r.ok) {
    // the few answers worth putting into words; anything else is "try again"
    const code = String(r.body?.errorCode ?? '');
    const said = code === 'AMOUNT_TOO_HIGH' ? 'That is more than can be sent in one go right now. Try a smaller amount.'
      : code === 'INSUFFICIENT_FUNDS' ? `This wallet does not hold enough ${token.symbol} on ${chain.name} for that.`
      : ['INSUFFICIENT_LIQUIDITY', 'NO_SWAP_ROUTES_FOUND', 'NO_INTERNAL_SWAP_ROUTES_FOUND', 'NO_QUOTES', 'UNSUPPORTED_ROUTE', 'ROUTE_TEMPORARILY_RESTRICTED', 'CHAIN_DISABLED', 'SWAP_IMPACT_TOO_HIGH'].includes(code)
        ? `There is no way through from ${token.symbol} on ${chain.name} right now. Try another coin or chain.`
      : code.startsWith('SANCTIONED') ? 'This can not be done from this wallet.'
      : 'Could not get a price right now. Try again in a moment.';
    return json({ error: 'quote-failed', code, message: said }, 502);
  }
  let checked;
  try { checked = checkQuote(r.body, { player, originChainId: chain.id, currency: token.address, amountWei, mode }); }
  catch (e) { return json({ error: 'refused', reason: e instanceof TopupRefused ? e.code : 'check-failed', message: 'That price did not check out, so nothing was offered. Try again.' }, 502); }

  if (mode === 'address' && !(await depositContractsUnchanged(env, chain))) {
    return json({ error: 'relay-changed', message: `Adding MON from ${chain.name} this way is paused for a moment.` }, 503);
  }

  const det = r.body.details ?? {};
  return json({
    ok: true, mode, requestId: checked.requestId, chainId: chain.id, chainName: chain.name,
    token: { symbol: token.symbol, address: token.address, decimals: token.decimals },
    amountIn: checked.amountIn.toString(),
    amountInUsd: Number(det.currencyIn?.amountUsd ?? 0) || null,
    outMon: amountMon, outMin: checked.outMin.toString(),
    timeEstimate: Number(det.timeEstimate ?? 0) || null,
    ...(mode === 'wallet' ? { steps: checked.steps } : { depositAddress: checked.depositAddress }),
    // Relay's own answer, for the page to check again itself (validate.js, the same file) and to sign only what ITS
    // check returns: a Worker that went wrong still could not make the page pay anyone but Relay's depository for
    // an order that gives the player their MON
    quote: { requestId: r.body.requestId, steps: r.body.steps, protocol: r.body.protocol },
  });
}

async function status(url, env) {
  const id = lc(url.searchParams.get('id'));
  if (!/^0x[0-9a-f]{64}$/.test(id)) return json({ error: 'bad-id' }, 400);
  const r = await relay(env, `/intents/status/v3?requestId=${id}`, { method: 'GET' });
  if (!r.ok || !r.body) return json({ state: 'unknown' });
  const s = String(r.body.status ?? 'unknown');
  const reason = (v) => (v && v !== 'N/A' ? String(v) : null);
  const out = { state: s, failReason: reason(r.body.failReason), refundFailReason: reason(r.body.refundFailReason), updatedAt: r.body.updatedAt ?? null, inTx: (r.body.inTxHashes ?? [])[0] ?? null };
  if (s === 'success') {
    // Relay says it is done: see the MON arrive on Monad ourselves before telling the page to carry on
    const tx = (r.body.txHashes ?? []).find((h) => /^0x[0-9a-fA-F]{64}$/.test(String(h)));
    let landed = false;
    if (tx) { try { const rc = await rpc(rpcsOf(env, MONAD_ID, MONAD_RPC), 'eth_getTransactionReceipt', [tx]); landed = rc?.status === '0x1'; } catch { /* not yet */ } }
    out.state = landed ? 'success' : 'pending';
    out.monTx = tx ?? null;
  }
  return json(out);
}

/** The router's entry: every /api/topup/* request comes here. Returns a Response. */
export async function topup(request, env, url) {
  if (!String(env.RELAY_API_KEY ?? '').trim()) return json({ error: 'unconfigured', message: 'Adding MON from another chain is not available right now.' }, 503);
  if (await limited(env.TOPUP_LIMIT, ipKey(request, 48))) return json({ error: 'slow-down', message: 'Too many requests. Try again in a minute.' }, 429);
  const route = url.pathname.replace(/^\/api\/topup\/?/, '');
  try {
    if (route === 'quote') return request.method === 'POST' ? await quote(request, env) : json({ error: 'POST' }, 405);
    if (route === 'balances') return request.method === 'POST' ? await balances(request, env) : json({ error: 'POST' }, 405);
    if (route === 'status') return request.method === 'GET' ? await status(url, env) : json({ error: 'GET' }, 405);
    return json({ error: 'not-found' }, 404);
  } catch {
    return json({ error: 'failed', message: 'Something went wrong. Try again in a moment.' }, 502);
  }
}
