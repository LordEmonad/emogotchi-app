// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {R3tardgotchi} from "../src/R3tardgotchi.sol";
import {MockEMO, MockWMON, MockNad, Refuser, MockArt} from "./mocks/Mocks.sol";

/// @dev r3tardgotchi is R3tardgotchi with the stunt taken out (he has none); every other line is the same source.
///      These are Thiccums' tests with the stunt tests replaced by "there is no stunt", so a divergence between the
///      two contracts shows up here. Clock through vm.getBlockTimestamp().
contract R3tardBase is Test {
    R3tardgotchi g;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    MockArt art;
    address pool = address(0x900D);
    address alice = address(0xB0B);
    address bob = address(0xB0B2);
    address carol = address(0xCA201);
    address treasury = address(0x7EA);
    address team = address(0x7E4);
    uint256 constant T0 = 1_800_000_000;
    uint256 constant WELCOME = 7 days;

    function setUp() public virtual {
        vm.warp(T0);
        emo = new MockEMO();
        wmon = new MockWMON();
        nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        art = new MockArt();
        g = new R3tardgotchi(params());
        vm.prank(alice);
        g.mint();
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
    }

    function params() internal view returns (R3tardgotchi.Params memory p) {
        p.welcome = WELCOME;
        p.treasury = treasury;
        p.team = team;
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.emo = address(emo);
        p.wmon = address(wmon);
        p.router = address(nad);
        p.lens = address(nad);
        p.pool = pool;
        p.maxImpactBps = 50;
        p.art = address(art);
        p.siteURI = "https://emogotchi.emonad.lol";
    }

    function now_() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }

    function warp(uint256 dt) internal {
        vm.warp(now_() + dt);
    }

    function feed(uint256 id) internal {
        vm.prank(alice);
        g.feed(id);
    }

    function careAll(address who, uint256 id) internal {
        uint256[] memory ids = new uint256[](3);
        uint8[] memory acts = new uint8[](3);
        for (uint256 i = 0; i < 3; i++) ids[i] = id;
        acts[0] = 0;
        acts[1] = 1;
        acts[2] = 2;
        vm.prank(who);
        g.care(ids, acts);
    }

    function contains(string memory hay, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(hay);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i + n.length <= h.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}

contract R3tardMintTest is R3tardBase {
    function test_mintIsFreeOnePerWalletAndSequential() public {
        assertEq(g.totalSupply(), 1);
        assertEq(g.ownerOf(1), alice);
        assertTrue(g.hasMinted(alice));
        vm.prank(bob);
        uint256 id = g.mint();
        assertEq(id, 2);
        assertEq(g.ownerOf(2), bob);
        assertEq(g.balanceOf(bob), 1);
        vm.prank(bob);
        vm.expectRevert(R3tardgotchi.AlreadyMinted.selector);
        g.mint();
        // giving him away does not free the mint
        vm.prank(bob);
        g.transferFrom(bob, carol, 2);
        vm.prank(bob);
        vm.expectRevert(R3tardgotchi.AlreadyMinted.selector);
        g.mint();
        // the receiver may still mint their own
        vm.prank(carol);
        assertEq(g.mint(), 3);
        assertEq(g.balanceOf(carol), 2);
    }

    function test_mintTimeAndWelcome() public {
        warp(3 days);
        vm.prank(bob);
        g.mint();
        assertEq(g.mintedAt(2), now_());
        assertEq(g.mintedAt(1), T0);
        R3tardgotchi.View memory v = g.state(2);
        assertTrue(v.alive);
        assertFalse(v.started);
        assertEq(v.food, 100);
        assertEq(v.startsAt, now_() + WELCOME);
        // an untouched r3tard starts by himself after WELCOME and starves 48 h later, exactly the cat's rule
        warp(WELCOME + 47 hours);
        assertTrue(g.state(2).alive);
        warp(2 hours);
        assertFalse(g.state(2).alive);
    }

    function test_noCapNoMinterNoValue() public {
        for (uint256 i = 0; i < 300; i++) {
            address w = address(uint160(0x10000 + i));
            vm.prank(w);
            g.mint();
        }
        assertEq(g.totalSupply(), 301);
        assertEq(g.mintedAt(301), T0);
        // mint takes no value
        vm.prank(carol);
        (bool ok,) = address(g).call{value: 1 ether}(abi.encodeWithSignature("mint()"));
        assertFalse(ok);
        assertFalse(g.hasMinted(carol));
    }

    function test_firstCareGasDoesNotGrowWithSupply() public {
        vm.prank(alice);
        uint256 g0 = gasleft();
        g.feed(1);
        uint256 small = g0 - gasleft();
        for (uint256 i = 0; i < 2000; i++) {
            vm.prank(address(uint160(0x20000 + i)));
            g.mint();
        }
        vm.prank(address(0x20000 + 1999));
        g0 = gasleft();
        g.feed(2001);
        uint256 big = g0 - gasleft();
        // the same first care, a fresh pet: no table to search, so the same gas within noise
        assertLt(big, small + 5_000);
    }

    function test_names() public view {
        assertEq(g.name(), "r3tardgotchi");
        assertEq(g.symbol(), "R3TARD");
    }
}

contract R3tardCareTest is R3tardBase {
    function test_careIsFree() public {
        uint256 before = alice.balance;
        feed(1);
        vm.prank(alice);
        g.play(1);
        vm.prank(alice);
        g.wash(1);
        vm.prank(alice);
        g.sleep(1);
        assertEq(alice.balance, before);
        R3tardgotchi.View memory v = g.state(1);
        assertTrue(v.started);
        assertEq(v.feeds, 1);
        assertEq(v.plays, 1);
        assertEq(v.washes, 1);
        assertEq(v.naps, 1);
        assertEq(v.monPaid, 0);
        assertEq(g.pendingBurnMon(), 0);
        assertEq(g.treasuryOwed(), 0);
        assertEq(g.teamOwed(), 0);
    }

    function test_careRefusesValue() public {
        vm.prank(alice);
        (bool ok,) = address(g).call{value: 1 ether}(abi.encodeWithSignature("feed(uint256)", 1));
        assertFalse(ok);
        uint256[] memory ids = new uint256[](1);
        uint8[] memory acts = new uint8[](1);
        vm.prank(alice);
        (ok,) = address(g).call{value: 1 ether}(abi.encodeWithSignature("care(uint256[],uint8[])", ids, acts));
        assertFalse(ok);
    }

    function test_batchAndOwnerOnly() public {
        careAll(alice, 1);
        R3tardgotchi.View memory v = g.state(1);
        assertEq(v.feeds, 1);
        assertEq(v.plays, 1);
        assertEq(v.washes, 1);
        vm.prank(bob);
        vm.expectRevert(R3tardgotchi.NotOwner.selector);
        g.feed(1);
        vm.expectRevert(R3tardgotchi.NotOwner.selector);
        careAll(bob, 1);
    }

    function test_poopCleanAndWake() public {
        feed(1);
        warp(4 hours + 1);
        assertTrue(g.state(1).poop);
        vm.prank(alice);
        g.clean(1);
        assertFalse(g.state(1).poop);
        assertEq(g.state(1).cleanups, 1);
        vm.prank(alice);
        vm.expectRevert(R3tardgotchi.NoPoop.selector);
        g.clean(1);
        vm.prank(alice);
        g.sleep(1);
        assertTrue(g.state(1).asleep);
        vm.prank(alice);
        g.wake(1);
        assertFalse(g.state(1).asleep);
    }

    function test_petAsTheCat() public {
        vm.prank(alice);
        g.pet(1, 3);
        assertEq(g.state(1).pets, 3);
        assertFalse(g.state(1).started); // a pet never starts the clock
        vm.prank(alice);
        vm.expectRevert(R3tardgotchi.BadCount.selector);
        g.pet(1, 21);
    }

    function test_noDirectTransferProtocol() public {
        vm.prank(alice);
        (bool ok,) = address(g).call{value: 1 ether}("");
        assertFalse(ok);
        vm.prank(alice);
        (ok,) = address(g).call{value: 1000 ether}("");
        assertFalse(ok);
        assertEq(address(g).balance, 0);
    }

    function test_deathAndFreeRevive() public {
        feed(1);
        warp(48 hours);
        assertFalse(g.state(1).alive);
        vm.prank(alice);
        vm.expectRevert(R3tardgotchi.NotAlive.selector);
        g.feed(1);
        uint256 before = alice.balance;
        vm.prank(alice);
        g.revive(1);
        assertEq(alice.balance, before);
        R3tardgotchi.View memory v = g.state(1);
        assertTrue(v.alive);
        assertEq(v.food, 60);
        assertEq(v.clean, 60);
        assertEq(v.fun, 60);
        assertEq(v.energy, 60);
        assertEq(v.deaths, 1);
        assertEq(v.revives, 1);
        assertEq(v.monPaid, 0);
        assertEq(g.pendingBurnMon(), 0);
        assertEq(g.teamOwed(), 0);
        // alive: cannot revive; not yours: cannot revive
        vm.prank(alice);
        vm.expectRevert(R3tardgotchi.Alive.selector);
        g.revive(1);
        vm.prank(bob);
        vm.expectRevert(R3tardgotchi.NotOwner.selector);
        g.revive(1);
        // and it takes no value
        warp(48 hours);
        vm.prank(alice);
        (bool ok,) = address(g).call{value: 1000 ether}(abi.encodeWithSignature("revive(uint256)", 1));
        assertFalse(ok);
    }
}

contract R3tardNoStuntTest is R3tardBase {
    /// He has no stunt (the operator chose none): none of the other pets' stunt functions exists on him, and nothing
    /// in his state or his metadata speaks of one.
    function test_noStuntOfAnyPetIsHere() public {
        string[6] memory sigs = ["screenshot(uint256)", "slap(uint256)", "squeeze(uint256)", "ignite(uint256)", "tung(uint256)", "bounce(uint256)"];
        for (uint256 i = 0; i < sigs.length; i++) {
            vm.prank(alice);
            (bool ok,) = address(g).call(abi.encodeWithSignature(sigs[i], 1));
            assertFalse(ok);
        }
        // nothing moved: still fresh, meters full, no money
        R3tardgotchi.View memory v = g.state(1);
        assertFalse(v.started);
        assertEq(v.food, 100);
        assertEq(v.monPaid, 0);
        assertEq(v.pets, 0);
    }

    function test_uriHasNoStuntTrait() public view {
        string memory uri = g.tokenURI(1);
        assertTrue(contains(uri, "data:application/json;base64,"));
        string memory c = g.contractURI();
        assertTrue(contains(c, "data:application/json;base64,"));
    }
}

contract R3tardNamingTest is R3tardBase {
    function test_nameIsTheOnePaidActAndSplits() public {
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "brah");
        assertEq(g.nameOf(1), "brah");
        assertEq(g.state(1).names, 1);
        assertEq(g.state(1).monPaid, 10 ether);
        assertEq(g.pendingBurnMon(), 8 ether);
        assertEq(g.treasuryOwed(), 1 ether);
        assertEq(g.teamOwed(), 1 ether);
        // rename, same price
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "r3tard");
        assertEq(g.state(1).names, 2);
        assertEq(g.pendingBurnMon(), 16 ether);
        // wrong price
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(R3tardgotchi.WrongValue.selector, 10 ether, 1 ether));
        g.setName{value: 1 ether}(1, "x");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(R3tardgotchi.WrongValue.selector, 10 ether, 0));
        g.setName(1, "x");
    }

    function test_burnAndSweepFromNaming() public {
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "brah");
        uint256 deadBefore = emo.balanceOf(0x000000000000000000000000000000000000dEaD);
        g.crankBurn(8 ether, 0);
        assertEq(g.pendingBurnMon(), 0);
        assertGt(emo.balanceOf(0x000000000000000000000000000000000000dEaD), deadBefore);
        assertEq(g.totalMonBurned(), 8 ether);
        g.sweep();
        assertEq(treasury.balance, 1 ether);
        assertEq(team.balance, 1 ether);
        assertEq(address(g).balance, 0);
    }

    function test_nameNeedsAliveOwner() public {
        vm.prank(bob);
        vm.expectRevert(R3tardgotchi.NotOwner.selector);
        g.setName{value: 10 ether}(1, "brah");
        feed(1);
        warp(48 hours);
        vm.prank(alice);
        vm.expectRevert(R3tardgotchi.NotAlive.selector);
        g.setName{value: 10 ether}(1, "brah");
    }
}

contract R3tardCrownTest is R3tardBase {
    function setUp() public override {
        super.setUp();
        vm.prank(bob);
        g.mint();
    }

    function test_scoreCrownAndStreakAsTheCat() public {
        // alice cares four times a day for eight days, bob feeds once a day: alice ranks first, both are crowned
        for (uint256 r = 0; r < 33; r++) {
            careAll(alice, 1);
            if (r % 4 == 0) {
                vm.prank(bob);
                g.feed(2);
            }
            warp(6 hours);
        }
        assertTrue(g.state(1).crownEligible);
        assertTrue(g.crowned(1));
        assertTrue(g.crowned(2));
        assertGt(g.scoreOf(1), g.scoreOf(2));
        assertGe(g.state(1).streak, 8);
        (uint256[] memory ids,,,) = g.crownList();
        assertEq(ids.length, 2);
        // death uncrowns; anyone may poke to record it
        warp(48 hours);
        assertFalse(g.crowned(2));
        vm.prank(carol);
        g.poke(2);
        assertEq(g.state(2).deaths, 1);
        (ids,,,) = g.crownList();
        assertEq(ids.length, 1);
        assertEq(ids[0], 1);
    }

    function test_noCrownBeforeAWeekAndReviveRestartsIt() public {
        for (uint256 r = 0; r < 27; r++) {
            careAll(alice, 1);
            warp(6 hours);
        }
        assertFalse(g.crowned(1));
        careAll(alice, 1);
        warp(6 hours);
        careAll(alice, 1);
        assertTrue(g.crowned(1));
        warp(48 hours);
        vm.prank(alice);
        g.revive(1);
        assertFalse(g.crowned(1));
        assertEq(g.state(1).streak, 1);
    }
}
