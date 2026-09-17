// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IGate} from "./IGate.sol";

interface IBalance {
    function balanceOf(address who) external view returns (uint256);
}

/// @notice Eligible if you hold at least `MIN` of `TOKEN`. Works for any ERC-721 (a count of tokens) or
///         ERC-20 (an amount in its own units), since both answer balanceOf(address).
contract HoldsGate is IGate {
    IBalance public immutable TOKEN;
    uint256 public immutable MIN;

    constructor(address token, uint256 min) {
        TOKEN = IBalance(token);
        MIN = min;
    }

    function eligible(address who, bytes calldata) external view returns (bool) {
        return TOKEN.balanceOf(who) >= MIN;
    }
}
