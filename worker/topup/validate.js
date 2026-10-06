/**
 * Checking a Relay quote before anyone signs it (CROSSCHAIN.md "Validation"). The Worker runs this on every quote it
 * hands out, and the site runs it again before asking the wallet (it imports this file), so a bad answer from Relay, or
 * from anything between, is refused twice.
 *
 * Relay's own method (docs.relay.link input-validation): recompute the order id from the order Relay signed, then check
 * that the transactions the player will sign pay exactly that order into the depository, for the player, and nothing
 * else. The order id is the EIP-712 hashStruct of the Order below (addresses written as lowercase `bytes`), reproduced
 * here without Relay's SDK (which pulls in tronweb, Solana and TON); it matched Relay's own orderId on live quotes
 * (2026-09-29).
 *
 * What this refuses: a payment to anyone but the depository; a deposit address that is not the one Relay's factory
 * derives for this order and the player; an approval of anyone else, or for more than the order;
 * Relay's full-allowance deposit; a depositor, recipient or refund address that is not the player; any call made on
 * Monad; any fee inside the order; less MON than asked; an order that has expired; steps on another chain or from
 * another address.
 */
import { concat, decodeFunctionData, encodePacked, getContractAddress, hashStruct, keccak256, parseAbi } from 'viem';
import { DEPOSITORY, DEPOSIT_FACTORY, DEPOSIT_IMPLEMENTATION, MONAD_ID, NATIVE, originById, tokenOf } from './chains.js';

const ORDER_TYPES = {
  Order: [{ name: 'version', type: 'string' }, { name: 'solverChainId', type: 'string' }, { name: 'solver', type: 'address' }, { name: 'salt', type: 'uint256' }, { name: 'inputs', type: 'Input[]' }, { name: 'output', type: 'Output' }, { name: 'fees', type: 'Fee[]' }],
  Input: [{ name: 'payment', type: 'InputPayment' }, { name: 'refunds', type: 'InputRefund[]' }],
  InputPayment: [{ name: 'chainId', type: 'string' }, { name: 'currency', type: 'bytes' }, { name: 'amount', type: 'uint256' }, { name: 'weight', type: 'uint256' }],
  InputRefund: [{ name: 'chainId', type: 'string' }, { name: 'recipient', type: 'bytes' }, { name: 'currency', type: 'bytes' }, { name: 'minimumAmount', type: 'uint256' }, { name: 'deadline', type: 'uint32' }, { name: 'extraData', type: 'bytes' }],
  Output: [{ name: 'chainId', type: 'string' }, { name: 'payments', type: 'OutputPayment[]' }, { name: 'deadline', type: 'uint32' }, { name: 'calls', type: 'bytes[]' }, { name: 'extraData', type: 'bytes' }],
  OutputPayment: [{ name: 'recipient', type: 'bytes' }, { name: 'currency', type: 'bytes' }, { name: 'minimumAmount', type: 'uint256' }, { name: 'expectedAmount', type: 'uint256' }],
  Fee: [{ name: 'recipientChainId', type: 'string' }, { name: 'recipient', type: 'bytes' }, { name: 'currencyChainId', type: 'string' }, { name: 'currency', type: 'bytes' }, { name: 'amount', type: 'uint256' }],
};

/** The only deposit functions a player may sign (the 3-argument depositErc20 that pulls a whole allowance is not here,
 *  so its calldata fails to decode and is refused). */
const DEPOSITORY_ABI = parseAbi([
  'function depositNative(address depositor, bytes32 id)',
  'function depositErc20(address depositor, address token, uint256 amount, bytes32 id)',
]);
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
]);

export class TopupRefused extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const refuse = (code, detail = '') => { throw new TopupRefused(code, detail); };
const lc = (a) => String(a ?? '').toLowerCase();
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(lc(a));
const big = (v, what) => { try { return BigInt(v); } catch { return refuse('bad-number', what); } };

/** The order id: EIP-712 hashStruct of Relay's Order, addresses as lowercase bytes. */
export function orderIdOf(o) {
  const data = {
    ...o,
    inputs: o.inputs.map((i) => ({
      payment: { ...i.payment, currency: lc(i.payment.currency) },
      refunds: i.refunds.map((r) => ({ ...r, recipient: lc(r.recipient), currency: lc(r.currency) })),
    })),
    output: { ...o.output, payments: o.output.payments.map((p) => ({ ...p, recipient: lc(p.recipient), currency: lc(p.currency) })) },
  };
  return hashStruct({ types: ORDER_TYPES, primaryType: 'Order', data });
}

/** Where a deposit address for this order and depositor must be (chains.js DEPOSIT_FACTORY): Solady's minimal-proxy
 *  init code around the implementation, CREATE2 from the factory, salt keccak256(orderId ++ depositor). */
const CLONE_INIT = concat(['0x602c3d8160093d39f33d3d3d3d363d3d37363d73', DEPOSIT_IMPLEMENTATION, '0x5af43d3d93803e602a57fd5bf3']);
export function depositAddressOf(orderId, depositor) {
  const salt = keccak256(encodePacked(['bytes32', 'address'], [orderId, depositor]));
  return getContractAddress({ opcode: 'CREATE2', from: DEPOSIT_FACTORY, salt, bytecode: CLONE_INIT }).toLowerCase();
}

/**
 * Check a quote against what we asked for. `want`: { player, originChainId, currency, amountWei (bigint: the MON we
 * asked for), mode: 'wallet' | 'address', maxIn? (bigint: the most the player may pay, in the origin token) }.
 * Returns the steps to sign (wallet mode: only to/data/value/chainId; the wallet estimates gas itself) or the deposit
 * address and amount (address mode). Throws TopupRefused.
 */
export function checkQuote(q, want, now = Math.floor(Date.now() / 1000)) {
  const player = lc(want.player);
  if (!isAddr(player)) refuse('bad-player');
  const chain = originById(want.originChainId);
  if (!chain) refuse('chain-not-offered', String(want.originChainId));
  const token = tokenOf(chain, want.currency);
  if (!token) refuse('token-not-offered', `${chain.name} ${want.currency}`);
  const wantMon = big(want.amountWei, 'amountWei');

  const v2 = q?.protocol?.v2;
  if (!v2?.orderData || !v2.orderId) refuse('no-protocol-data');
  const o = v2.orderData;
  const orderId = orderIdOf(o);
  if (orderId !== lc(v2.orderId)) refuse('order-id-mismatch');

  // what the player pays: one payment, on the chain and in the token they chose
  if (!Array.isArray(o.inputs) || o.inputs.length !== 1) refuse('inputs');
  const pay = o.inputs[0].payment;
  if (pay.chainId !== chain.relay) refuse('input-chain', pay.chainId);
  if (lc(pay.currency) !== token.address) refuse('input-currency', pay.currency);
  const amountIn = big(pay.amount, 'payment.amount');
  if (amountIn <= 0n) refuse('input-amount');
  if (want.maxIn !== undefined && amountIn > want.maxIn) refuse('costs-more-than-shown');
  for (const r of o.inputs[0].refunds ?? []) {
    if (lc(r.recipient) !== player) refuse('refund-recipient', r.recipient);
    if (Number(r.deadline) <= now) refuse('refund-expired');
  }

  // what the player gets: native MON on Monad, to them, at least what we asked for, and nothing else
  const out = o.output;
  if (out.chainId !== 'monad') refuse('output-chain', out.chainId);
  if (!Array.isArray(out.payments) || out.payments.length !== 1) refuse('output-payments');
  const p = out.payments[0];
  if (lc(p.recipient) !== player) refuse('output-recipient', p.recipient);
  if (lc(p.currency) !== NATIVE) refuse('output-currency', p.currency);
  if (big(p.minimumAmount, 'minimumAmount') < wantMon) refuse('output-short');
  if ((out.calls ?? []).length) refuse('output-calls');
  if ((o.fees ?? []).length) refuse('order-fees');
  if (Number(out.deadline) <= now) refuse('order-expired');

  const items = (q.steps ?? []).flatMap((s) => (s.items ?? []).map((it) => ({ step: s, data: it.data })));
  if (!items.length) refuse('no-steps');

  if (want.mode === 'address') {
    // a strict deposit address: the player sends the amount there from anywhere; nothing is signed on our site
    const dep = (q.steps ?? []).map((s) => s.depositAddress).find((a) => a);
    if (!isAddr(dep)) refuse('no-deposit-address');
    // the address must be the one that can only ever sweep into THIS order (checked above: MON to the player on Monad,
    // refunds to the player) credited to the player; any other address is refused, whatever the API says about it
    if (lc(dep) !== depositAddressOf(orderId, player)) refuse('deposit-address', dep);
    return { mode: 'address', requestId: q.requestId, orderId, chainId: chain.id, token, amountIn, depositAddress: lc(dep), outMin: big(p.minimumAmount, 'minimumAmount') };
  }

  // wallet mode: exactly [approve?, deposit], all on the origin chain, all from the player
  const steps = [];
  let sawDeposit = false;
  for (const { step, data: t } of items) {
    if (!t) refuse('step-without-transaction', step.id);
    if (Number(t.chainId) !== chain.id) refuse('step-chain', String(t.chainId));
    if (lc(t.from) !== player) refuse('step-from', t.from);
    const value = big(t.value ?? '0', 'value');
    if (step.id === 'approve') {
      if (sawDeposit || token.address === NATIVE) refuse('approve-out-of-place');
      if (lc(t.to) !== token.address) refuse('approve-target', t.to);
      if (value !== 0n) refuse('approve-value');
      let d; try { d = decodeFunctionData({ abi: ERC20_ABI, data: t.data }); } catch { refuse('approve-calldata'); }
      if (d.functionName !== 'approve') refuse('approve-function', d.functionName);
      if (lc(d.args[0]) !== DEPOSITORY) refuse('approve-spender', d.args[0]);
      if (d.args[1] !== amountIn) refuse('approve-amount');
      steps.push({ kind: 'approve', chainId: chain.id, to: lc(t.to), data: t.data, value: '0' });
    } else if (step.id === 'deposit') {
      if (sawDeposit) refuse('two-deposits');
      sawDeposit = true;
      if (lc(t.to) !== DEPOSITORY) refuse('deposit-target', t.to);
      let d; try { d = decodeFunctionData({ abi: DEPOSITORY_ABI, data: t.data }); } catch { refuse('deposit-calldata'); }
      if (token.address === NATIVE) {
        if (d.functionName !== 'depositNative') refuse('deposit-function', d.functionName);
        if (lc(d.args[0]) !== player) refuse('depositor', d.args[0]);
        if (lc(d.args[1]) !== orderId) refuse('deposit-order');
        if (value !== amountIn) refuse('deposit-value');
      } else {
        if (d.functionName !== 'depositErc20') refuse('deposit-function', d.functionName);
        if (lc(d.args[0]) !== player) refuse('depositor', d.args[0]);
        if (lc(d.args[1]) !== token.address) refuse('deposit-token', d.args[1]);
        if (d.args[2] !== amountIn) refuse('deposit-amount');
        if (lc(d.args[3]) !== orderId) refuse('deposit-order');
        if (value !== 0n) refuse('deposit-value');
      }
      steps.push({ kind: 'deposit', chainId: chain.id, to: DEPOSITORY, data: t.data, value: value.toString() });
    } else {
      refuse('unexpected-step', step.id);
    }
  }
  if (!sawDeposit) refuse('no-deposit');
  if (token.address !== NATIVE && steps[0]?.kind !== 'approve' && steps.length !== 1) refuse('step-order');
  return { mode: 'wallet', requestId: q.requestId, orderId, chainId: chain.id, token, amountIn, steps, outMin: big(p.minimumAmount, 'minimumAmount') };
}

/** Is this Monad fill really ours? (The status route checks the destination transaction's receipt separately.) */
export const isMonad = (id) => Number(id) === MONAD_ID;
