// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Emogotchi, IERC20Balance} from "../src/Emogotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedCatGate} from "../src/gates/NamedCatGate.sol";

/// The shop against the live chain: the real game, the real nad.fun. Runs only with a fork:
///   forge test --match-contract ItemsFork --fork-url https://rpc.monad.xyz -vv
contract ItemsForkTest is Test {
    address constant GAME = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    address constant LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address constant POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;

    function test_fork_witchOnTheLiveGame_andRealBurn() public {
        if (block.chainid != 143) return;
        Emogotchi game = Emogotchi(payable(GAME));
        assertEq(keccak256(bytes(game.name())), keccak256("Emogotchi"));

        // exactly what DeployItems.s.sol does
        EmogotchiItems.Params memory p;
        p.curator = address(this);
        p.treasury = makeAddr("treasury");
        p.team = makeAddr("team");
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.emo = EMO;
        p.wmon = WMON;
        p.router = DEX_ROUTER;
        p.lens = LENS;
        p.pool = POOL;
        p.maxImpactBps = 50;
        p.collectionSvg = vm.readFileBinary("items/collection.svg");
        NamedCatGate gate = new NamedCatGate(GAME);
        EmogotchiItems items = new EmogotchiItems(p);
        items.allowCollection(GAME);
        EmogotchiItems.CreateParams memory c;
        c.name = "Witch outfit";
        c.description = "test";
        c.svg = vm.readFileBinary("items/witch.svg");
        c.maxSupply = 200;
        c.perKey = 1;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 1;
        c.gate = address(gate);
        uint256 witch = items.create(c);
        assertFalse(items.swapPathBroken(), "live path must read as working");

        // a living cat on mainnet, named by its real owner (pranked), claims through the real game
        uint256 cat;
        for (uint256 id = 1; id <= 200; id++) {
            if (game.state(id).alive) {
                cat = id;
                break;
            }
        }
        assertGt(cat, 0, "no living cat in the first 200");
        address owner = game.ownerOf(cat);
        console.log("cat", cat, "owner", owner);
        vm.deal(owner, 100 ether);
        (bool ok, uint8 reason,,) = items.canClaim(witch, owner, 1, abi.encode(cat));
        if (bytes(game.nameOf(cat)).length == 0) {
            assertFalse(ok);
            assertEq(reason, 6, "unnamed cat must not qualify");
            vm.prank(owner);
            game.setName{value: 10 ether}(cat, "Fork Witch");
        }
        (ok, reason,,) = items.canClaim(witch, owner, 1, abi.encode(cat));
        assertTrue(ok, "named living cat qualifies");
        uint256 g0 = gasleft();
        vm.prank(owner);
        items.claim(witch, 1, abi.encode(cat));
        console.log("claim gas (hint path, real game)", g0 - gasleft());
        assertEq(items.balanceOf(owner, witch), 1);
        vm.prank(owner);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(witch, 1, abi.encode(cat));
        vm.prank(owner);
        items.equip(GAME, cat, witch);
        assertEq(items.equipped(GAME, cat)[0], witch);
        assertEq(items.remaining(witch), 199);

        // a paid item burns real EMO through the real router
        c = EmogotchiItems.CreateParams({
            name: "Paid",
            description: "test",
            svg: bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"),
            price: 10 ether,
            maxSupply: 0,
            perKey: 0,
            opens: 0,
            closes: 0,
            kind: EmogotchiItems.Kind.Scene,
            slot: 3,
            soulbound: false,
            gate: address(0)
        });
        uint256 paid = items.create(c);
        vm.prank(owner);
        items.claim{value: 10 ether}(paid, 1, "");
        assertEq(items.pendingBurnMon(), 8 ether);
        assertEq(items.treasuryOwed(), 1 ether);
        uint256 depth = IERC20Balance(WMON).balanceOf(POOL);
        console.log("pool WMON depth (MON)", depth / 1e18, "guard (MON)", (depth * 50) / 10_000 / 1e18);
        uint256 deadBefore = IERC20Balance(EMO).balanceOf(items.BURN_ADDRESS());
        g0 = gasleft();
        items.crankBurn(type(uint256).max, 0);
        console.log("crankBurn gas (real nad.fun)", g0 - gasleft());
        uint256 burned = IERC20Balance(EMO).balanceOf(items.BURN_ADDRESS()) - deadBefore;
        console.log("EMO burned by 8 MON", burned / 1e18);
        assertGt(burned, 0, "no EMO burned");
        assertEq(items.pendingBurnMon(), 0);
        assertEq(items.totalMonBurned(), 8 ether);
        assertEq(items.totalEmoBurned(), burned);
        assertEq(items.brokenSince(), 0);
        items.sweep();
        assertEq(p.treasury.balance, 1 ether);
        assertEq(p.team.balance, 1 ether);
        // metadata renders
        assertGt(bytes(items.uri(witch)).length, 30_000);
        assertGt(bytes(items.contractURI()).length, 20_000);
    }
}
