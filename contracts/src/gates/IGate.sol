// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice One question an item can ask before it lets someone claim it. Gates are small separate
///         contracts, so a new claim rule never touches EmogotchiItems. `data` is whatever hint the
///         claimer supplies (a cat id, a Merkle proof); a gate may ignore it.
///
///         `key` is what the item's per-key cap counts against: return the wallet (`bytes32` of `who`)
///         for a plain "one per wallet", or the thing that qualified (a cat id) so the cap cannot be
///         dodged by walking that thing through fresh wallets. It is only read when `ok` is true.
interface IGate {
    function eligible(address who, bytes calldata data) external view returns (bool ok, bytes32 key);
}
