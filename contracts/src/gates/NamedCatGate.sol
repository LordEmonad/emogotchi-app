// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IGate} from "./IGate.sol";

interface IEmogotchiNames {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function nameOf(uint256 id) external view returns (string memory);
}

/// @notice Eligible if you own an Emogotchi you have named. Pass the cat's id as the hint and it is one
///         ownership check and one name check; pass nothing and the first `SCAN` of your cats are looked
///         at, which costs more gas the more cats you hold. The key is the cat: an item capped at one
///         per key is one per named cat, however many wallets the cat visits.
contract NamedCatGate is IGate {
    IEmogotchiNames public immutable GAME;
    uint256 public constant SCAN = 64;

    constructor(address game) {
        GAME = IEmogotchiNames(game);
    }

    function eligible(address who, bytes calldata data) external view returns (bool ok, bytes32 key) {
        if (data.length >= 32) {
            uint256 id = abi.decode(data, (uint256));
            try GAME.ownerOf(id) returns (address o) {
                ok = o == who && bytes(GAME.nameOf(id)).length > 0;
                return (ok, bytes32(id));
            } catch {
                return (false, 0);
            }
        }
        uint256 n = GAME.balanceOf(who);
        if (n > SCAN) n = SCAN;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = GAME.tokenOfOwnerByIndex(who, i);
            if (bytes(GAME.nameOf(id)).length > 0) return (true, bytes32(id));
        }
        return (false, 0);
    }
}
