// Merkle tree over addresses, the same shape EmogotchiDrop verifies on chain:
//   leaf   = keccak256(bytes.concat(keccak256(abi.encode(address))))   (double hash, like OpenZeppelin's StandardMerkleTree)
//   node   = keccak256(sorted(a, b))                                   (pair sorted, so proofs carry no position bits)
//   leaves are sorted before building; a lone node at the end of a level is carried up unchanged
import { keccak256, encodeAbiParameters, concat, getAddress } from 'viem';

export const leafOf = (address) => keccak256(concat([keccak256(encodeAbiParameters([{ type: 'address' }], [getAddress(address)]))]));
const hashPair = (a, b) => (a.toLowerCase() < b.toLowerCase() ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

/** @returns {{ root: string, proofOf: (address) => string[] | null, leaves: number }} */
export function buildTree(addresses) {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const leaves = uniq.map((a) => ({ a, h: leafOf(a) })).sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0));
  const levels = [leaves.map((l) => l.h)];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1]; const next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    levels.push(next);
  }
  const index = new Map(leaves.map((l, i) => [l.a, i]));
  const proofOf = (address) => {
    let i = index.get(address.toLowerCase()); if (i === undefined) return null;
    const proof = [];
    for (let lv = 0; lv < levels.length - 1; lv++) { const sib = i ^ 1; if (sib < levels[lv].length) proof.push(levels[lv][sib]); i >>= 1; }
    return proof;
  };
  return { root: levels[levels.length - 1][0], proofOf, leaves: leaves.length };
}

/** Recompute the root from a leaf and its proof, exactly as the contract does. */
export function verify(root, address, proof) {
  let h = leafOf(address);
  for (const p of proof) h = hashPair(h, p);
  return h === root;
}
