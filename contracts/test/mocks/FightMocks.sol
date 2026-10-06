// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FightClub} from "../../src/fightclub/FightClub.sol";

/// @dev A bare pet collection: ownerOf (reverting for a pet that does not exist, like the games), mint, transfer.
contract MockPets {
    mapping(uint256 => address) internal _owner;
    uint256 public totalSupply;

    function mint(address to) external returns (uint256 id) {
        id = ++totalSupply;
        _owner[id] = to;
    }

    function ownerOf(uint256 id) external view returns (address o) {
        o = _owner[id];
        require(o != address(0), "no such pet");
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(_owner[id] == from && msg.sender == from, "not yours");
        _owner[id] = to;
    }

    // the head of the games' View struct, as FightClub reads it: id, owner, name, started, alive
    struct View { uint256 id; address owner; string name; uint64 started; bool alive; }
    mapping(uint256 => bool) public dead;
    function kill(uint256 id) external { dead[id] = true; }
    function revive(uint256 id) external { dead[id] = false; }
    function state(uint256 id) external view returns (View memory v) {
        v.id = id; v.owner = _owner[id]; v.started = 1; v.alive = !dead[id];
    }
}

/// @dev A collection whose ownerOf answers badly in a chosen way.
contract WeirdPets {
    uint256 public mode;
    address public holder;

    constructor(address h) {
        holder = h;
    }

    function setMode(uint256 m) external {
        mode = m;
    }

    function ownerOf(uint256) external view returns (address) {
        if (mode == 1) revert("no");
        if (mode == 2) assembly { return(0, 4) } // too short
        if (mode == 3) {
            assembly {
                mstore(0, not(0))
                return(0, 32)
            } // not an address
        }
        return holder;
    }

    struct View { uint256 id; address owner; string name; uint64 started; bool alive; }
    function state(uint256 id) external view returns (View memory v) {
        v.id = id; v.owner = holder; v.started = 1; v.alive = true;
    }
}

/// @dev A fighter that is a contract: it challenges, accepts, cancels, aborts and withdraws on command, and can be
///      told to refuse MON, burn all the gas it is given, answer with a huge return, or re-enter Fight Club.
contract Fighter {
    FightClub public club;
    uint256 public mode; // 0 accept MON, 1 refuse, 2 burn all gas, 3 re-enter, 4 return a huge answer, 5 run a hook
    uint256 public reentryId;
    address public hookTarget;
    bytes public hookData;
    bool public hookOk;
    bool public reentered; // a re-entry that got through (must never happen)
    uint256 public reentryReverts;

    constructor(FightClub c) {
        club = c;
    }

    function setMode(uint256 m) external {
        mode = m;
    }

    function setReentryId(uint256 id) external {
        reentryId = id;
    }

    /// Mode 5: on receiving MON, call `target` with `data` (for instance Entropy's reveal, so the callback runs while
    /// Fight Club is in the middle of paying this contract), then accept the MON.
    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
    }

    /// The value comes out of this contract's own balance, so its wealth is its own.
    function doChallenge(uint256 value, address col, uint256 id, address opponent) external returns (uint256) {
        return club.challenge{value: value}(col, id, opponent);
    }

    function doAccept(uint256 value, uint256 fid, address col, uint256 id) external returns (uint64) {
        return club.accept{value: value}(fid, col, id);
    }

    function doCancel(uint256 fid) external {
        club.cancel(fid);
    }

    function doAbort(uint256 fid) external {
        club.abort(fid);
    }

    function doWithdraw() external {
        club.withdraw();
    }

    function doWithdrawTo(address to) external {
        club.withdrawTo(to);
    }

    receive() external payable {
        if (mode == 1) revert("no thanks");
        if (mode == 2) {
            while (true) {}
        }
        if (mode == 3) {
            // try every way back in; each must be refused while Fight Club holds its lock
            try club.withdraw() {
                reentered = true;
            } catch {
                reentryReverts++;
            }
            try club.cancel(reentryId) {
                reentered = true;
            } catch {
                reentryReverts++;
            }
            try club.abort(reentryId) {
                reentered = true;
            } catch {
                reentryReverts++;
            }
            try club.sweep() {
                reentered = true;
            } catch {
                reentryReverts++;
            }
            revert("reentry refused, so refuse the MON too");
        }
        if (mode == 4) {
            assembly { return(0, 100000) }
        }
        if (mode == 5) {
            mode = 0; // once
            (hookOk,) = hookTarget.call(hookData);
        }
    }
}

/// @dev A plain contract that takes MON and does nothing else.
contract Sink {
    receive() external payable {}
}

/// @dev Sends MON by selfdestruct (still a forced transfer under Cancun when created and destroyed in one call).
contract Forcer {
    constructor(address payable to) payable {
        selfdestruct(to);
    }
}
