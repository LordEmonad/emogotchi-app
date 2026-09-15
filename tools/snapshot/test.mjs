// balance and dedupe logic on synthetic transfers: node tools/snapshot/test.mjs
import { holders } from './snapshot.mjs';
import assert from 'node:assert/strict';
const Z = '0x0000000000000000000000000000000000000000', A = '0xa', B = '0xb', C = '0xc';
// ERC-721: mint 1,2 to A; A sends 2 to B; B sends 2 to C; mint 3 to B; burn 1
let h = holders([{ from: Z, to: A, id: 1n }, { from: Z, to: A, id: 2n }, { from: A, to: B, id: 2n }, { from: B, to: C, id: 2n }, { from: Z, to: B, id: 3n }, { from: A, to: Z, id: 1n }], 'erc721');
assert.deepEqual([...h.entries()].sort(), [[B, 1n], [C, 1n]]);
// ERC-20: mint 100 to A; A→B 30; B→C 30; C→A 5
h = holders([{ from: Z, to: A, amount: 100n }, { from: A, to: B, amount: 30n }, { from: B, to: C, amount: 30n }, { from: C, to: A, amount: 5n }], 'erc20');
assert.deepEqual([...h.entries()].sort(), [[A, 75n], [B, 0n], [C, 25n]]);
console.log('snapshot logic ok');
