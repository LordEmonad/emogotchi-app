// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
/// A smart-contract wallet for tests: valid signatures are its owner's (EIP-1271).
contract Wallet1271 {
    address public immutable owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (sig.length != 65) return 0xffffffff;
        bytes32 r = bytes32(sig[0:32]); bytes32 s = bytes32(sig[32:64]); uint8 v = uint8(sig[64]);
        return ecrecover(hash, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
