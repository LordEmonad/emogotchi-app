// The real phone session's clips (tools/trailer/demo-live.mjs), cut from the takes' OWN record: where each press landed
// (meta.marks, in order) and when each transaction was sent and found in a block (meta.txs), so a session filmed again
// is cut the same way without retyping a second. Shared by the hackathon demo (demo-timeline.mjs) and the short
// (demo-short.mjs). Every caption is a draft for the operator.
//
// The session's presses, in order (demo-live.mjs):
//   live-signup  0 Connect and mint, 1 Passkey account, 2 Create an account, 3 the tick, 4 Create with passkey, 5 Done,
//                6 Mint Emonad, 7 the wallet menu, 8 Account: fund, 9 the sheet's close
//   live-shop    0 Free, 1 the Backrooms tile, 2 Claim, 3 Confirm with passkey, 4 the pet's tick, 5 Give this room
//   live-care    0 Feed, 1 Confirm with passkey, 2 Wash, 3 Play, 4 Sleep, 5 Wake
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = process.env.RAW ?? 'trailer/demo/raw';
const metaOf = (take) => { const p = join(RAW, take, 'meta.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
export const live = existsSync(join(RAW, 'live.json')) ? JSON.parse(readFileSync(join(RAW, 'live.json'), 'utf8')) : {};

/** seconds into `take` of its i-th press */
export const press = (take, i) => { const m = metaOf(take); const k = m?.marks?.[i]; if (!k) throw new Error(`${take} has no press ${i} (filmed?)`); return k.at / 1000; };
/** seconds into `take` when its n-th sent transaction was found in a block */
export const mined = (take, n) => {
  const txs = metaOf(take)?.txs ?? [];
  const s = txs.filter((e) => e.kind === 'sent')[n];
  const m = s && txs.find((e) => e.kind === 'mined' && e.hash === s.hash);
  if (!m) throw new Error(`${take} has no mined transaction ${n}`);
  return m.t / 1000;
};
export const hasPress = (take, i) => !!metaOf(take)?.marks?.[i];
export const takeEnd = (take) => { const m = metaOf(take); return m ? m.frames / (m.fps ?? 60) : 0; };
/** a stretch of a take from second a to second b: the clip's `from` and its length in beats (half seconds) */
// (whole beats: at 120 bpm a beat is half a second, so music laid under the cut lands on every edit)
export const span = (take, a, b) => ({ take, from: Math.max(0, a), beats: Math.max(1, Math.round((b - Math.max(0, a)) * 2)) });

// what the phone's side shows as the session's transactions
export const STARTER = { kind: 'drip', label: 'Starter · 0.5 MON', address: live.address ?? null };
export const tx = (n, label) => ({ kind: 'tx', n, label });
// consecutive phone clips: the picture runs on, the words change (they leave before the cut), the list carries over
export const P = { layout: 'phone', vis: 800, scale: 1.2, textOut: true };

// what the explorer stills point at (fractions of MonadScan's page at 1280x720 css px, the same layout for every
// transaction: checked on the session's own pages)
export const SCAN = {
  action: [0.066, 0.335, 0.37, 0.402],     // "Mint 1 of Emonadgotchi to 0x…"
  call: [0.066, 0.335, 0.5, 0.402],        // "0x… Call Feed Function on 0xcD4B…"
  status: [0.267, 0.5, 0.333, 0.545],      // Success
  token: [0.306, 0.855, 0.62, 0.928],      // ERC-721 Token ID [n] Emonadgotchi (the mint)
  fee: [0.267, 0.904, 0.47, 0.944],        // Transaction Fee (a care)
};
export const mark = (r, at) => ({ r, at });

/**
 * The session as clips. `say` swaps in other words per clip id ({ id: { title, sub } }), so the two films can word
 * the same pictures their own way.
 */
export function sessionClips(say = {}) {
  const S = 'live-signup', SH = 'live-shop', C = 'live-care';
  const w = (id, o) => ({ ...o, id, ...(say[id] ?? {}) });
  const signup = [
    // the mint page, then the connect sheet (WalletConnect, a passkey account, try without a wallet), then the passkey sheet
    w('pk', { ...P, ...span(S, press(S, 0) - 1.6, press(S, 2) + 0.5), title: ['No wallet?', '*Use a passkey.'], sub: ['Face ID, a fingerprint or a password', 'manager makes a real Monad account.'] }),
    // the two things to know, the tick, the passkey made
    w('pk2', { ...P, ...span(S, press(S, 2) + 0.5, press(S, 4) + 1.0), title: ['Two things,', '*then you\'re in.'], sub: ['Your passkey opens it.', 'Back it up later with 24 words.'] }),
    // the account, ready: its address, how to fund it
    w('pk3', { ...P, ...span(S, press(S, 4) + 1.0, press(S, 5) + 0.6), title: ['A Monad account,', '*made on the phone.'], sub: ['Built on mera by Category Labs.', 'No seed phrase, no extension.'] }),
    // back on the mint page: the mint, the starter that pays its gas, the pet
    w('starter', { ...P, ...span(S, press(S, 5) + 0.6, mined(S, 0) + 2.4), receipts: [STARTER, tx(0, 'Mint Emonad')], title: ['Your first gas', '*is on us.'], sub: ['0.5 MON lands in the account,', 'then the free mint goes through.'] }),
    // the account's balance: what the starter left after the mint's gas
    w('minted', { ...P, ...span(S, press(S, 7) - 0.5, press(S, 9) - 0.3), receipts: [STARTER, tx(0, 'Mint Emonad')], carry: true, textOut: false, title: ['A pet of their own,', '*on chain.'], sub: ['What the starter left', 'after the mint\'s gas.'] }),
  ];
  const shop = [
    // the shop, Free, the Backrooms theme's sheet, Claim, the passkey, claimed
    w('shop', { ...P, ...span(SH, press(SH, 0) - 0.9, press(SH, 4) - 0.5), receipts: [tx(0, 'Claim the Backrooms')], title: ['Items live', '*on chain too.'], sub: ['31 in the shop. The Backrooms theme', 'is free: only the gas.'] }),
    // ticked for him and given: his room changes
    w('shop2', { ...P, ...span(SH, press(SH, 4) - 0.5, takeEnd(SH) - 0.9), receipts: [tx(0, 'Claim the Backrooms'), tx(1, 'Give it to him')], carry: true, textOut: false, title: ['Give it to him.'], sub: ['One more transaction', 'and his room changes.'] }),
  ];
  const care = [
    w('feed', { ...P, ...span(C, press(C, 0) - 1.4, press(C, 0) + 8.6), receipts: [tx(0, 'Feed')], title: ['Every action', '*is a transaction.'], sub: ['The first asks for the passkey.', 'The rest sign by themselves.'] }),
    w('wash', { ...P, ...span(C, press(C, 2) - 0.9, press(C, 2) + 5.1), receipts: [tx(0, 'Feed'), tx(1, 'Wash')], carry: true, title: ['Wash him.'], sub: ['In a block in a fraction', 'of a second.'] }),
    w('play', { ...P, ...span(C, press(C, 3) - 0.8, press(C, 3) + 5.2), receipts: [tx(0, 'Feed'), tx(1, 'Wash'), tx(2, 'Play')], carry: true, title: ['Play with him.'], sub: ['Free for this pet:', 'only the gas.'] }),
  ];
  // bed is offered only once his energy has dropped below full: a session that did not get to it has no fifth press
  if (hasPress(C, 4)) care.push(w('sleep', { ...P, ...span(C, press(C, 4) - 0.7, press(C, 4) + 4.3), receipts: [tx(0, 'Feed'), tx(1, 'Wash'), tx(2, 'Play'), tx(3, 'Bedtime')], carry: true, title: ['Put him to bed.'], sub: ['Every one of these', 'is on Monad mainnet.'] }));
  care[care.length - 1].textOut = false;
  return { signup, shop, care };
}
