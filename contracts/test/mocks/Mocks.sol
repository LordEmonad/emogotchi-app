// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MockEMO {
    string public name = "Emonad";
    string public symbol = "EMO";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}

contract MockWMON {
    mapping(address => uint256) public balanceOf;

    function setBalance(address who, uint256 amount) external {
        balanceOf[who] = amount;
    }
}

/// @dev Stands in for the nad.fun DEX pool plus lens plus router: a constant-product curve
///      with a 1% fee, quoted by the lens and filled by the router.
contract MockNad {
    MockEMO public emo;
    MockWMON public wmon;
    address public pool;
    uint256 public monReserve;
    uint256 public emoReserve;
    bool public failNext;
    address public lensRouter; // what the lens claims the router is
    uint256 public lastMinOut;

    constructor(MockEMO e, MockWMON w, address p, uint256 mon, uint256 emoAmt) {
        emo = e;
        wmon = w;
        pool = p;
        monReserve = mon;
        emoReserve = emoAmt;
        lensRouter = address(this);
        w.setBalance(p, mon);
    }

    function setFailNext(bool f) external {
        failNext = f;
    }

    function setLensRouter(address r) external {
        lensRouter = r;
    }

    function setReserves(uint256 mon, uint256 emoAmt) external {
        monReserve = mon;
        emoReserve = emoAmt;
        wmon.setBalance(pool, mon);
    }

    function quoteOut(uint256 amountIn) public view returns (uint256) {
        if (monReserve == 0 || emoReserve == 0) return 0;
        uint256 inWithFee = amountIn * 990;
        return (inWithFee * emoReserve) / (monReserve * 1000 + inWithFee);
    }

    // ---- lens ----
    function getAmountOut(address, uint256 amountIn, bool) external view returns (address, uint256) {
        return (lensRouter, quoteOut(amountIn));
    }

    // ---- router ----
    struct BuyParams {
        uint256 amountOutMin;
        address token;
        address to;
        uint256 deadline;
    }

    function buy(BuyParams calldata p) external payable returns (uint256 out) {
        if (failNext) revert("router down");
        require(p.token == address(emo), "bad token");
        out = quoteOut(msg.value);
        lastMinOut = p.amountOutMin;
        require(out >= p.amountOutMin, "slippage");
        monReserve += msg.value;
        emoReserve -= out;
        wmon.setBalance(pool, monReserve);
        emo.mint(p.to, out);
    }
}

/// @dev A receiver that refuses MON.
contract Refuser {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev A receiver that burns more gas than the payout stipend allows.
contract GasHog {
    mapping(uint256 => uint256) public sink;

    receive() external payable {
        // 8 fresh storage slots, about 160k gas: more than the payout stipend allows
        for (uint256 i = 1; i <= 8; i++) {
            sink[i] = block.timestamp + i;
        }
    }
}

/// @dev Stands in for EmogotchiArt in the game tests: a tiny SVG that names the mood and crown.
contract MockArt {
    function image(uint8 mood, bool crowned) external pure returns (string memory) {
        bytes memory m = new bytes(1);
        m[0] = bytes1(uint8(48 + mood));
        return string.concat("<svg xmlns=\"http://www.w3.org/2000/svg\"><text>", string(m), crowned ? "c" : "", "</text></svg>");
    }
}
