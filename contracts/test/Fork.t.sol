// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Emogotchi, IERC20Balance} from "../src/Emogotchi.sol";

/// Runs only with a fork: forge test --match-contract Fork --fork-url https://rpc.monad.xyz -vv
contract ForkTest is Test {
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    address constant LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address constant POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;

    function test_fork_crank_burns_real_emo() public {
        if (block.chainid != 143) return; // not a Monad fork
        Emogotchi.Params memory p;
        p.minter = address(this);
        p.maxSupply = 100_000;
        p.welcome = 7 days;
        p.treasury = makeAddr("treasury");
        p.team = makeAddr("team");
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.reviveBurnBps = 5000;
        p.emo = EMO;
        p.wmon = WMON;
        p.router = DEX_ROUTER;
        p.lens = LENS;
        p.pool = POOL;
        p.maxImpactBps = 50;
        p.baseURI = "ipfs://test";
        p.siteURI = "https://emogotchi.emonad.lol";
        Emogotchi g = new Emogotchi(p);

        address player = makeAddr("player");
        vm.deal(player, 2000 ether);
        g.mintMany(player, 2);
        uint256 depth = IERC20Balance(WMON).balanceOf(POOL);
        console.log("pool WMON depth (MON)", depth / 1e18);
        console.log("impact guard (MON)", (depth * 50) / 10_000 / 1e18);

        // a day of care for two cats plus a name
        vm.startPrank(player);
        g.feed{value: 1 ether}(1);
        g.play{value: 1 ether}(1);
        g.wash{value: 1 ether}(1);
        g.feed{value: 1 ether}(2);
        g.setName{value: 10 ether}(1, "Mainnet Cat");
        vm.stopPrank();
        assertEq(g.pendingBurnMon(), 11.2 ether);

        uint256 deadBefore = IERC20Balance(EMO).balanceOf(g.BURN_ADDRESS());
        g.crankBurn(type(uint256).max);
        uint256 burned = IERC20Balance(EMO).balanceOf(g.BURN_ADDRESS()) - deadBefore;
        console.log("EMO burned by 11.2 MON", burned / 1e18);
        assertGt(burned, 0, "no EMO burned");
        assertEq(g.totalEmoBurned(), burned);
        assertEq(g.totalMonBurned(), 11.2 ether);
        assertEq(g.pendingBurnMon(), 0);

        // revive on mainnet: 500 to the burn, 500 to the team
        vm.warp(block.timestamp + 48 hours);
        vm.prank(player);
        g.revive{value: 1000 ether}(2);
        assertEq(g.pendingBurnMon(), 500 ether);
        assertEq(g.teamOwed(), 1.4 ether + 500 ether);
        g.crankBurn(type(uint256).max);
        console.log("EMO burned by a revive", (g.totalEmoBurned() - burned) / 1e18);
        assertEq(g.pendingBurnMon(), 0);
        g.sweep();
        assertEq(p.team.balance, 501.4 ether);
        assertEq(p.treasury.balance, 1.4 ether);
        assertEq(address(g).balance, 0);
    }
}
