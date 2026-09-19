// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IGate} from "./IGate.sol";

interface IAllowed {
    function collectionAllowed(address collection) external view returns (bool);
}

interface IBalanceOf {
    function balanceOf(address who) external view returns (uint256);
}

/// @notice Eligible if you hold a pet of any collection the item shop allows to equip: the cat, inversebrah,
///         and whatever the curator allows after them, with nothing to change here. The hint is the collection
///         you hold (32 bytes, an address); with no hint the gate checks the collections it was born with. The
///         key is the wallet, so a per-key cap is "one per wallet". A collection that reverts on balanceOf reads
///         as not held.
contract AnyPetGate is IGate {
    error ZeroAddress();

    IAllowed public immutable SHOP;
    address[] private _known;

    constructor(address shop, address[] memory known) {
        if (shop == address(0)) revert ZeroAddress();
        SHOP = IAllowed(shop);
        for (uint256 i = 0; i < known.length; i++) {
            if (known[i] == address(0)) revert ZeroAddress();
            _known.push(known[i]);
        }
    }

    /// @notice The collections checked when the claimer gives no hint.
    function known() external view returns (address[] memory) {
        return _known;
    }

    function eligible(address who, bytes calldata data) external view returns (bool, bytes32) {
        bytes32 key = bytes32(uint256(uint160(who)));
        if (data.length == 32) {
            uint256 word = uint256(bytes32(data));
            if (word >> 160 != 0) return (false, key); // not an address
            return (_holds(who, address(uint160(word))), key);
        }
        for (uint256 i = 0; i < _known.length; i++) {
            if (_holds(who, _known[i])) return (true, key);
        }
        return (false, key);
    }

    function _holds(address who, address collection) private view returns (bool) {
        if (collection.code.length == 0 || !SHOP.collectionAllowed(collection)) return false;
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSelector(IBalanceOf.balanceOf.selector, who));
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (uint256)) > 0;
    }
}
