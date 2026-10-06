// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IGate} from "./IGate.sol";

interface IAllowedCollections {
    function collectionAllowed(address collection) external view returns (bool);
}

/// @notice Eligible if you hold a living pet that has a name, of any collection the item shop allows: the cat,
///         inversebrah, and whatever the curator allows after them, with nothing to change here.
///
///         The hint names the pet: `abi.encode(address collection, uint256 id)`, exactly 64 bytes. The key is the
///         pet itself, `keccak256(abi.encode(collection, id))`, so an item capped at one per key is one per named
///         pet however many wallets it visits (walking one named pet through fresh wallets gets nothing), and
///         cat #7 and inversebrah #7 are different pets.
///
///         Every pet contract here answers three views the same way, and those are all this reads:
///         `ownerOf(id)`, `nameOf(id)` (a name is 1..32 bytes, empty = never named) and `state(id)`, whose
///         returned struct begins `(id, owner, name, started, alive, ...)`; `alive` is computed live from the
///         feed clock, so a pet that has starved but not been touched since reads as dead. The struct is checked
///         as well as read: its `id` must be the pet asked about and its `owner` the claimer, or the answer is no.
///
///         It never reverts on what a collection returns: a revert, a short or malformed answer, or a bool that is
///         not 0 or 1 all read as "no". Without a valid hint the answer is a cheap "no", which is also what the
///         shop's probe at `create` gets.
contract NamedPetGate is IGate {
    error ZeroAddress();

    IAllowedCollections public immutable SHOP;

    constructor(address shop) {
        if (shop == address(0)) revert ZeroAddress();
        SHOP = IAllowedCollections(shop);
    }

    function eligible(address who, bytes calldata data) external view returns (bool, bytes32) {
        if (who == address(0) || data.length != 64) return (false, 0);
        (uint256 word, uint256 id) = abi.decode(data, (uint256, uint256));
        if (word >> 160 != 0) return (false, 0); // not an address: never truncated into one
        address collection = address(uint160(word));
        if (collection.code.length == 0 || !SHOP.collectionAllowed(collection)) return (false, 0);
        if (_owner(collection, id) != who) return (false, 0);
        if (!_named(collection, id) || !_alive(collection, id, who)) return (false, 0);
        return (true, keccak256(abi.encode(collection, id)));
    }

    /// @dev ownerOf(id), or 0 for a revert, a short answer or a word that is not an address.
    function _owner(address collection, uint256 id) private view returns (address) {
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("ownerOf(uint256)", id));
        if (!ok || ret.length < 32) return address(0);
        uint256 w = abi.decode(ret, (uint256));
        if (w >> 160 != 0) return address(0);
        return address(uint160(w));
    }

    /// @dev nameOf(id) is a non-empty string. Read by hand: an offset and a length that must both sit inside the answer.
    function _named(address collection, uint256 id) private view returns (bool) {
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("nameOf(uint256)", id));
        if (!ok || ret.length < 64) return false;
        uint256 offset = _word(ret, 0);
        if (offset > ret.length - 32) return false;
        uint256 len = _word(ret, offset);
        if (len > ret.length - offset - 32) return false;
        return len > 0;
    }

    /// @dev state(id).alive, read by hand from the returned struct: word 0 is the struct's offset, then its head
    ///      is id, owner, the name's offset, started, alive. The id and owner must match, and alive must be 0 or 1.
    function _alive(address collection, uint256 id, address who) private view returns (bool) {
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("state(uint256)", id));
        if (!ok || ret.length < 192) return false;
        uint256 head = _word(ret, 0);
        if (head > ret.length - 160) return false;
        if (_word(ret, head) != id || _word(ret, head + 32) != uint256(uint160(who))) return false;
        uint256 alive = _word(ret, head + 128);
        return alive == 1;
    }

    /// @dev The 32-byte word at `at` in `b` (the caller has checked it is in range).
    function _word(bytes memory b, uint256 at) private pure returns (uint256 w) {
        assembly {
            w := mload(add(add(b, 32), at))
        }
    }
}
