import { buildTree, verify, leafOf } from './tree.mjs';
import assert from 'node:assert/strict';
const addrs = Array.from({ length: 1001 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0'));
const t = buildTree(addrs);
for (const a of addrs) assert.ok(verify(t.root, a, t.proofOf(a)), 'proof fails for ' + a);
assert.equal(t.proofOf('0x' + 'f'.repeat(40)), null);
assert.ok(!verify(t.root, addrs[0], t.proofOf(addrs[1])));
const one = buildTree([addrs[0]]); assert.equal(one.root, leafOf(addrs[0])); assert.deepEqual(one.proofOf(addrs[0]), []);
console.log('tree ok: root', t.root, 'leaves', t.leaves, 'proof length', t.proofOf(addrs[0]).length);
