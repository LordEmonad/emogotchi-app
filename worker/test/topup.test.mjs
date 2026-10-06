// "Add MON from another chain" (worker/topup/, CROSSCHAIN.md): the quote checker against real Relay quotes, and every
// way a quote could be bent that it must refuse.
//   cd worker && node --test test/topup.test.mjs
// The fixtures are real /quote/v2 answers for 50 MON to the deployer's address, captured 2026-09-29 (a test reads
// each at its own capture time, so the deadlines inside still hold).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeFunctionData, parseAbi, parseEther } from 'viem';
import { TopupRefused, checkQuote, depositAddressOf, orderIdOf } from '../topup/validate.js';
import { DEPOSITORY, NATIVE, ORIGINS, originById, tokenOf } from '../topup/chains.js';

const PLAYER = '0x40ad8cf176672efe12a0d7ac50fa5da2b0b64e74';
const OTHER = '0x000000000000000000000000000000000000dead';
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/topup/${name}.json`, import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const want = (chainId, currency, mode = 'wallet', extra = {}) => ({ player: PLAYER, originChainId: chainId, currency, amountWei: parseEther('50'), mode, ...extra });
const check = (q, w) => checkQuote(q, w, q.capturedAt);
const refused = (fn, code) => assert.throws(fn, (e) => e instanceof TopupRefused && e.code === code, `expected ${code}`);
/** Change the signed order, then re-sign it the way a forger would (a fresh, self-consistent order id). */
const reorder = (q, change) => { const r = clone(q); change(r.protocol.v2.orderData); r.protocol.v2.orderId = orderIdOf(r.protocol.v2.orderData); return r; };
const item = (q, id) => q.steps.find((s) => s.id === id).items[0].data;
const ABI = parseAbi([
  'function depositNative(address depositor, bytes32 id)',
  'function depositErc20(address depositor, address token, uint256 amount, bytes32 id)',
  'function depositErc20(address depositor, address token, bytes32 id)',
  'function approve(address spender, uint256 amount)',
]);

test('the chain list: every token is lowercase and priced per chain, one entry per chain', () => {
  assert.equal(new Set(ORIGINS.map((c) => c.id)).size, ORIGINS.length);
  for (const c of ORIGINS) for (const t of c.tokens) assert.equal(t.address, t.address.toLowerCase(), `${c.name} ${t.symbol}`);
  assert.equal(tokenOf(originById(56), '0x55D398326f99059fF775485246999027B3197955').decimals, 18); // BNB Chain's USDT
  assert.equal(tokenOf(originById(137), NATIVE), null); // no POL
  assert.equal(originById(999), null);
});

test('real quotes pass: Base ETH, Base USDC, BNB Chain USDT (wallet); Polygon USDC, Base ETH (deposit address)', () => {
  const a = check(fixture('base-eth-wallet'), want(8453, NATIVE));
  assert.deepEqual(a.steps.map((s) => s.kind), ['deposit']);
  assert.equal(a.steps[0].to, DEPOSITORY);
  assert.equal(a.steps[0].value, a.amountIn.toString());

  const b = check(fixture('base-usdc-wallet'), want(8453, BASE_USDC));
  assert.deepEqual(b.steps.map((s) => s.kind), ['approve', 'deposit']);
  assert.equal(b.steps[0].to, BASE_USDC);
  assert.equal(b.steps[1].value, '0');

  const c = check(fixture('bnb-usdt-wallet'), want(56, '0x55d398326f99059ff775485246999027b3197955'));
  assert.deepEqual(c.steps.map((s) => s.kind), ['approve', 'deposit']);

  const d = check(fixture('polygon-usdc-address'), want(137, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 'address'));
  assert.equal(d.depositAddress, depositAddressOf(d.orderId, PLAYER));
  const e = check(fixture('base-eth-address'), want(8453, NATIVE, 'address'));
  assert.equal(e.mode, 'address');
  assert.ok(e.outMin >= parseEther('50'));
});

test('the order id is recomputed, not trusted', () => {
  const q = clone(fixture('base-eth-wallet'));
  q.protocol.v2.orderData.output.payments[0].recipient = OTHER; // the order changed, the id left alone
  refused(() => check(q, want(8453, NATIVE)), 'order-id-mismatch');
  const r = clone(fixture('base-eth-wallet'));
  r.protocol.v2.orderId = '0x' + '11'.repeat(32);
  refused(() => check(r, want(8453, NATIVE)), 'order-id-mismatch');
  const s = clone(fixture('base-eth-wallet'));
  delete s.protocol;
  refused(() => check(s, want(8453, NATIVE)), 'no-protocol-data');
});

test('a re-signed order that pays or refunds anyone else, or does anything extra, is refused', () => {
  const q = fixture('base-eth-wallet');
  const w = want(8453, NATIVE);
  refused(() => check(reorder(q, (o) => { o.output.payments[0].recipient = OTHER; }), w), 'output-recipient');
  refused(() => check(reorder(q, (o) => { o.inputs[0].refunds[0].recipient = OTHER; }), w), 'refund-recipient');
  refused(() => check(reorder(q, (o) => { o.output.calls = ['0x1234']; }), w), 'output-calls');
  refused(() => check(reorder(q, (o) => { o.fees = [{ recipientChainId: 'base', recipient: OTHER, currencyChainId: 'base', currency: NATIVE, amount: '1' }]; }), w), 'order-fees');
  refused(() => check(reorder(q, (o) => { o.output.payments[0].minimumAmount = parseEther('49').toString(); }), w), 'output-short');
  refused(() => check(reorder(q, (o) => { o.output.payments[0].currency = '0x754704bc059f8c67012fed69bc8a327a5aafb603'; }), w), 'output-currency');
  refused(() => check(reorder(q, (o) => { o.output.chainId = 'base'; }), w), 'output-chain');
  refused(() => check(reorder(q, (o) => { o.output.payments.push({ ...o.output.payments[0], recipient: OTHER }); }), w), 'output-payments');
  refused(() => check(reorder(q, (o) => { o.inputs[0].payment.chainId = 'ethereum'; }), w), 'input-chain');
  refused(() => check(reorder(q, (o) => { o.inputs[0].payment.currency = BASE_USDC; }), w), 'input-currency');
  refused(() => check(reorder(q, (o) => { o.inputs.push(o.inputs[0]); }), w), 'inputs');
});

test('deadlines, the chain and token asked for, and the most the player agreed to pay', () => {
  const q = fixture('base-eth-wallet');
  const late = q.protocol.v2.orderData.output.deadline + 1;
  assert.throws(() => checkQuote(q, want(8453, NATIVE), late), TopupRefused);
  refused(() => check(q, want(8453, BASE_USDC)), 'input-currency');
  refused(() => check(q, want(1, NATIVE)), 'input-chain');
  refused(() => check(q, want(999, NATIVE)), 'chain-not-offered');
  refused(() => check(q, want(8453, '0x4200000000000000000000000000000000000006')), 'token-not-offered'); // WETH
  refused(() => check(q, want(8453, NATIVE, 'wallet', { amountWei: parseEther('60') })), 'output-short');
  refused(() => check(q, want(8453, NATIVE, 'wallet', { maxIn: BigInt(q.protocol.v2.orderData.inputs[0].payment.amount) - 1n })), 'costs-more-than-shown');
  refused(() => check(q, { ...want(8453, NATIVE), player: OTHER }), 'refund-recipient');
});

test('native deposit: only depositNative(player, this order) into the depository, with exactly the order amount', () => {
  const q = fixture('base-eth-wallet');
  const w = want(8453, NATIVE);
  const oid = q.protocol.v2.orderId;
  const bend = (f) => { const r = clone(q); f(item(r, 'deposit')); return r; };
  refused(() => check(bend((t) => { t.to = OTHER; }), w), 'deposit-target');
  refused(() => check(bend((t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositNative', args: [OTHER, oid] }); }), w), 'depositor');
  refused(() => check(bend((t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositNative', args: [PLAYER, '0x' + '22'.repeat(32)] }); }), w), 'deposit-order');
  refused(() => check(bend((t) => { t.value = (BigInt(t.value) + 1n).toString(); }), w), 'deposit-value');
  refused(() => check(bend((t) => { t.value = '0'; }), w), 'deposit-value');
  refused(() => check(bend((t) => { t.data = '0xdeadbeef'; }), w), 'deposit-calldata');
  refused(() => check(bend((t) => { t.from = OTHER; }), w), 'step-from');
  refused(() => check(bend((t) => { t.chainId = 1; }), w), 'step-chain');
  const extra = clone(q); extra.steps.push(clone(extra.steps.find((s) => s.id === 'deposit')));
  refused(() => check(extra, w), 'two-deposits');
  const odd = clone(q); odd.steps.push({ ...clone(odd.steps[0]), id: 'swap' });
  refused(() => check(odd, w), 'unexpected-step');
  const approve = clone(q); approve.steps.unshift({ id: 'approve', items: [{ data: { ...item(q, 'deposit'), to: BASE_USDC, value: '0' } }] });
  refused(() => check(approve, w), 'approve-out-of-place');
  const none = clone(q); none.steps = [];
  refused(() => check(none, w), 'no-steps');
});

test('token deposit: approve only the depository for only the order amount, then depositErc20 for the player', () => {
  const q = fixture('base-usdc-wallet');
  const w = want(8453, BASE_USDC);
  const oid = q.protocol.v2.orderId;
  const amt = BigInt(q.protocol.v2.orderData.inputs[0].payment.amount);
  const bend = (id, f) => { const r = clone(q); f(item(r, id)); return r; };
  refused(() => check(bend('approve', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'approve', args: [OTHER, amt] }); }), w), 'approve-spender');
  refused(() => check(bend('approve', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'approve', args: [DEPOSITORY, 2n ** 256n - 1n] }); }), w), 'approve-amount');
  refused(() => check(bend('approve', (t) => { t.to = OTHER; }), w), 'approve-target');
  refused(() => check(bend('approve', (t) => { t.value = '1'; }), w), 'approve-value');
  refused(() => check(bend('approve', (t) => { t.data = '0xa9059cbb' + '00'.repeat(64); }), w), 'approve-function'); // transfer
  // Relay's 3-argument deposit pulls the whole allowance: not a function the player may sign here
  refused(() => check(bend('deposit', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositErc20', args: [PLAYER, BASE_USDC, oid] }); }), w), 'deposit-calldata');
  refused(() => check(bend('deposit', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositErc20', args: [OTHER, BASE_USDC, amt, oid] }); }), w), 'depositor');
  refused(() => check(bend('deposit', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositErc20', args: [PLAYER, OTHER, amt, oid] }); }), w), 'deposit-token');
  refused(() => check(bend('deposit', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositErc20', args: [PLAYER, BASE_USDC, amt + 1n, oid] }); }), w), 'deposit-amount');
  refused(() => check(bend('deposit', (t) => { t.data = encodeFunctionData({ abi: ABI, functionName: 'depositNative', args: [PLAYER, oid] }); }), w), 'deposit-function');
  refused(() => check(bend('deposit', (t) => { t.value = '1'; }), w), 'deposit-value');
  const flipped = clone(q); flipped.steps.reverse();
  refused(() => check(flipped, w), 'approve-out-of-place');
});

test('deposit address: only the address Relay\'s factory derives for this order and the player', () => {
  const q = fixture('polygon-usdc-address');
  const w = want(137, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', 'address');
  const swap = clone(q);
  for (const s of swap.steps) if (s.depositAddress) s.depositAddress = OTHER;
  refused(() => check(swap, w), 'deposit-address');
  const none = clone(q);
  for (const s of none.steps) delete s.depositAddress;
  refused(() => check(none, w), 'no-deposit-address');
  // an address derived for someone else (a real one, for the same order) is still the wrong one
  const theirs = clone(q);
  for (const s of theirs.steps) if (s.depositAddress) s.depositAddress = depositAddressOf(q.protocol.v2.orderId, OTHER);
  refused(() => check(theirs, w), 'deposit-address');
  // and the order behind the address is held to every rule above
  refused(() => check(reorder(q, (o) => { o.output.payments[0].recipient = OTHER; }), w), 'output-recipient');
  // case does not matter; a checksummed address from the API is the same address
  const cs = clone(q);
  for (const s of cs.steps) if (s.depositAddress) s.depositAddress = s.depositAddress.toUpperCase().replace('0X', '0x');
  assert.equal(check(cs, w).mode, 'address');
});

// ---------------------------------------------------------------- the routes, with Relay and the chains stood in
import { topup } from '../topup/index.js';
import { DEPOSIT_FACTORY, DEPOSIT_IMPLEMENTATION } from '../topup/chains.js';

const chainsAnswer = { chains: [...ORIGINS.map((c) => ({ id: c.id, protocol: { v2: { chainId: c.relay, depository: DEPOSITORY } } })), { id: 143, protocol: { v2: { chainId: 'monad', depository: DEPOSITORY } } }] };
/** A fetch that answers Relay and the chains' RPCs from fixtures. `over` bends any answer by URL/method. */
function fakeFetch({ quote, code = '0x', over = () => null, seen = [] } = {}) {
  return async (url, init = {}) => {
    const u = String(url);
    seen.push(u);
    const body = init.body ? JSON.parse(init.body) : null;
    const o = over(u, body);
    if (o) return o;
    const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/chains')) return json(chainsAnswer);
    if (u.includes('/quote/v2')) return json(clone(quote));
    if (u.includes('/currencies/token/price')) return json({ price: 1 });
    if (u.includes('/intents/status/v3')) return json({ status: 'waiting' });
    if (body?.method === 'eth_getCode') return json({ jsonrpc: '2.0', id: 1, result: code });
    return json({ jsonrpc: '2.0', id: 1, result: '0x0' });
  };
}
const ENV = { RELAY_API_KEY: 'k' };
const post = (path, body, headers = { 'content-type': 'application/json' }) => new Request(`https://emogotchi.emonad.lol/api/topup/${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const hit = async (req, env = ENV) => { const r = await topup(req, env, new URL(req.url)); return { status: r.status, body: await r.json(), headers: r.headers }; };
const ask = { player: PLAYER, chainId: 8453, currency: NATIVE, amountMon: 50, mode: 'wallet' };

test('routes: switched off without the key, JSON only, the right methods, sane input', async (t) => {
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = fakeFetch({ quote: fixture('base-eth-wallet') });
  assert.equal((await hit(post('quote', ask), {})).status, 503);
  assert.equal((await hit(post('quote', ask), {})).body.error, 'unconfigured');
  const r = await hit(post('quote', ask, { 'content-type': 'text/plain' }));
  assert.equal(r.status, 415);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await hit(new Request('https://emogotchi.emonad.lol/api/topup/quote'))).status, 405);
  assert.equal((await hit(post('status', {}))).status, 405);
  assert.equal((await hit(post('nope', {}))).status, 404);
  assert.equal((await hit(post('quote', { ...ask, player: 'bob' }))).status, 400);
  assert.equal((await hit(post('quote', { ...ask, amountMon: 49 }))).body.error, 'amount');
  assert.equal((await hit(post('quote', { ...ask, amountMon: 10_001 }))).body.error, 'amount');
  assert.equal((await hit(post('quote', { ...ask, amountMon: 'lots' }))).body.error, 'amount');
  assert.equal((await hit(post('quote', { ...ask, chainId: 999 }))).body.error, 'not-offered');
  assert.equal((await hit(post('quote', { ...ask, currency: '0x4200000000000000000000000000000000000006' }))).body.error, 'not-offered');
  assert.equal((await hit(new Request('https://emogotchi.emonad.lol/api/topup/status?id=0x12'))).status, 400);
});

test('routes: a quote is built for the player, checked, and handed back with Relay\'s own answer', async (t) => {
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  const q = fixture('base-eth-wallet');
  let sent = null;
  globalThis.fetch = fakeFetch({ quote: q, over: (u, b) => { if (u.includes('/quote/v2')) sent = b; return null; } });
  // the deadlines inside the fixture are real; run the route at the fixture's own time
  const now = Date.now; Date.now = () => q.capturedAt * 1000; t.after(() => { Date.now = now; });
  const r = await hit(post('quote', ask));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(sent.user, PLAYER); assert.equal(sent.recipient, PLAYER); assert.equal(sent.refundTo, PLAYER);
  assert.equal(sent.destinationChainId, 143); assert.equal(sent.destinationCurrency, NATIVE); assert.equal(sent.tradeType, 'EXACT_OUTPUT');
  assert.equal(sent.amount, parseEther('50').toString());
  assert.deepEqual(r.body.steps.map((s) => s.kind), ['deposit']);
  assert.ok(r.body.quote?.protocol?.v2?.orderId, 'Relay\'s answer comes back for the page to check itself');
});

test('routes: a bent quote, a moved depository, a smart-contract wallet and Relay\'s own errors are all refused', async (t) => {
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  const q = fixture('base-eth-wallet');
  const now = Date.now; Date.now = () => q.capturedAt * 1000; t.after(() => { Date.now = now; });
  const bent = clone(q); item(bent, 'deposit').to = OTHER;
  globalThis.fetch = fakeFetch({ quote: bent });
  let r = await hit(post('quote', ask));
  assert.equal(r.status, 502); assert.equal(r.body.error, 'refused'); assert.equal(r.body.reason, 'deposit-target'); assert.equal(r.body.steps, undefined);

  globalThis.fetch = fakeFetch({ quote: q, code: '0x6080604052' });
  r = await hit(post('quote', ask));
  assert.equal(r.body.error, 'contract-wallet');
  globalThis.fetch = fakeFetch({ quote: q, code: '0xef0100' + '11'.repeat(20) });   // an EIP-7702 account is a person's key
  assert.equal((await hit(post('quote', ask))).status, 200);

  globalThis.fetch = fakeFetch({ quote: q, over: (u) => (u.includes('/quote/v2') ? new Response(JSON.stringify({ errorCode: 'INSUFFICIENT_FUNDS', message: 'raw words from Relay' }), { status: 400 }) : null) });
  r = await hit(post('quote', ask));
  assert.equal(r.status, 502); assert.match(r.body.message, /does not hold enough ETH on Base/); assert.doesNotMatch(JSON.stringify(r.body), /raw words/);
});

test('routes: a deposit address is shown only while Relay\'s factory there is still the pinned code', async (t) => {
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  const q = fixture('polygon-usdc-address');
  const now = Date.now; Date.now = () => q.capturedAt * 1000; t.after(() => { Date.now = now; });
  const polygonAsk = { ...ask, chainId: 137, currency: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', mode: 'address' };
  // the real bytecode is not in the repo: stand in with anything, and check that a mismatch refuses
  globalThis.fetch = fakeFetch({ quote: q, over: (u, b) => (b?.method === 'eth_getCode' && [DEPOSIT_FACTORY, DEPOSIT_IMPLEMENTATION].includes(String(b.params[0]).toLowerCase())
    ? new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x6001' }), { headers: { 'content-type': 'application/json' } }) : null) });
  const r = await hit(post('quote', polygonAsk));
  assert.equal(r.status, 503); assert.equal(r.body.error, 'relay-changed');
});
