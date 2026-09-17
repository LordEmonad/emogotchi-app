// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice One question an item can ask before it lets someone claim it. Gates are small separate
///         contracts, so a new claim rule never touches EmogotchiItems. `data` is whatever hint the
///         claimer supplies (a cat id, a Merkle proof); a gate may ignore it.
interface IGate {
    function eligible(address who, bytes calldata data) external view returns (bool);
}
