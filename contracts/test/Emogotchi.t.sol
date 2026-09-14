// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {MockEMO, MockWMON, MockNad, Refuser, MockArt} from "./mocks/Mocks.sol";

/// @dev Under via_ir the compiler memoises block.timestamp inside a test function; always read the
///      clock through vm.getBlockTimestamp() and move it with warp().
contract Base is Test {
    Emogotchi g;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    MockArt art;
    address pool = address(0x900D);
    address minter = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xB0B2);
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
        g = new Emogotchi(params(minter, 100_000));
        vm.prank(minter);
        g.mintMany(alice, 3);
        vm.deal(alice, 100_000 ether);
        vm.deal(bob, 100_000 ether);
    }

    function params(address m, uint256 supply) internal view returns (Emogotchi.Params memory p) {
        p.minter = m;
        p.maxSupply = supply;
        p.welcome = WELCOME;
        p.treasury = treasury;
        p.team = team;
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.reviveBurnBps = 5000;
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
        g.feed{value: 1 ether}(id);
    }

    function send(address from, uint256 value) internal returns (bool ok) {
        vm.prank(from);
        (ok,) = address(g).call{value: value}("");
    }

    function assertInvariant() internal view {
        assertEq(address(g).balance, g.pendingBurnMon() + g.treasuryOwed() + g.teamOwed(), "balance invariant");
    }
}

contract MintAndTokenTest is Base {
    function test_minterOnly() public {
        address[] memory to = new address[](1);
        to[0] = bob;
        vm.expectRevert(Emogotchi.NotMinter.selector);
        g.mint(to);
        vm.prank(minter);
        g.mint(to);
        assertEq(g.ownerOf(4), bob);
        assertEq(g.totalSupply(), 4);
    }

    function test_capAndBatches() public {
        Emogotchi c = new Emogotchi(params(minter, 5));
        vm.startPrank(minter);
        c.mintMany(alice, 2);
        warp(1 hours);
        address[] memory to = new address[](3);
        to[0] = alice;
        to[1] = bob;
        to[2] = bob;
        c.mint(to);
        vm.expectRevert(Emogotchi.SoldOut.selector);
        c.mintMany(alice, 1);
        vm.expectRevert(Emogotchi.SoldOut.selector);
        c.mintMany(alice, 0);
        vm.stopPrank();
        assertEq(c.mintedAt(1), T0);
        assertEq(c.mintedAt(2), T0);
        assertEq(c.mintedAt(3), T0 + 1 hours);
        assertEq(c.mintedAt(5), T0 + 1 hours);
        assertEq(c.balanceOf(bob), 2);
        assertEq(c.tokenOfOwnerByIndex(bob, 1), 5);
        assertEq(c.tokenByIndex(4), 5);
        vm.expectRevert(Emogotchi.InvalidToken.selector);
        c.tokenByIndex(5);
    }

    function test_manyBatchesBinarySearch() public {
        Emogotchi c = new Emogotchi(params(minter, 1000));
        for (uint256 i = 0; i < 37; i++) {
            vm.prank(minter);
            c.mintMany(alice, 7);
            warp(10 minutes);
        }
        for (uint256 id = 1; id <= 37 * 7; id++) {
            assertEq(c.mintedAt(id), T0 + ((id - 1) / 7) * 10 minutes);
        }
    }

    function test_transferUpdatesEnumeration() public {
        vm.prank(alice);
        g.transferFrom(alice, bob, 2);
        uint256[] memory a = g.tokensOfOwner(alice);
        assertEq(a.length, 2);
        assertEq(a[0], 1);
        assertEq(a[1], 3);
        assertEq(g.tokensOfOwner(bob)[0], 2);
        assertEq(g.ownerOf(2), bob);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.NotOwner.selector);
        g.feed{value: 1 ether}(2);
        vm.prank(bob);
        g.feed{value: 1 ether}(2);
    }

    function test_approvals() public {
        vm.prank(bob);
        vm.expectRevert(Emogotchi.Unauthorized.selector);
        g.transferFrom(alice, bob, 1);
        vm.prank(alice);
        g.approve(bob, 1);
        vm.prank(bob);
        g.transferFrom(alice, bob, 1);
        assertEq(g.getApproved(1), address(0));
        vm.prank(alice);
        g.setApprovalForAll(bob, true);
        vm.prank(bob);
        g.transferFrom(alice, bob, 2);
        assertEq(g.balanceOf(bob), 2);
    }

    function test_safeTransferToNonReceiverReverts() public {
        vm.prank(alice);
        vm.expectRevert(Emogotchi.UnsafeRecipient.selector);
        g.safeTransferFrom(alice, address(nad), 1);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.UnsafeRecipient.selector);
        g.safeTransferFrom(alice, address(emo), 1, "");
        vm.prank(alice);
        g.safeTransferFrom(alice, bob, 1);
        assertEq(g.ownerOf(1), bob);
    }

    function test_interfaces() public view {
        assertTrue(g.supportsInterface(0x80ac58cd));
        assertTrue(g.supportsInterface(0x5b5e139f));
        assertTrue(g.supportsInterface(0x780e9d63));
        assertTrue(g.supportsInterface(0x49064906));
        assertFalse(g.supportsInterface(0xffffffff));
    }

    function test_constructorGuards() public {
        Emogotchi.Params memory p = params(minter, 10);
        p.burnBps = 7000;
        vm.expectRevert(Emogotchi.BadSplit.selector);
        new Emogotchi(p);
        p = params(minter, 10);
        p.team = address(0);
        vm.expectRevert(Emogotchi.ZeroAddress.selector);
        new Emogotchi(p);
    }
}

contract WelcomeAndDeathTest is Base {
    function test_freshCat() public view {
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.started);
        assertTrue(v.alive);
        assertEq(v.food, 100);
        assertEq(v.energy, 100);
        assertEq(v.score, 0);
        assertEq(v.mood, 1); // happy
        assertEq(v.startsAt, T0 + WELCOME);
        assertEq(v.day, 0);
    }

    function test_firstCareStartsClockNow() public {
        warp(2 days);
        feed(1);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.started);
        assertEq(v.bornAt, T0 + 2 days);
        assertEq(v.feeds, 1);
        assertEq(v.streak, 1);
        assertEq(v.day, 1);
        warp(12 hours);
        v = g.state(1);
        assertEq(v.food, 50);
        assertEq(v.fun, 50);
        assertEq(v.energy, 50);
        assertEq(v.clean, 0); // poop since 4h: 4h + 8h x 2.5 = 24h of dirt
        assertEq(v.mood, 7); // sad
    }

    function test_untouchedCatClockStartsAtWelcomeEnd() public {
        warp(WELCOME + 6 hours);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.started);
        assertEq(v.bornAt, T0 + WELCOME);
        assertEq(v.food, 75);
        assertEq(v.day, 1);
        // first care after the welcome ended keeps the implied history
        feed(1);
        v = g.state(1);
        assertEq(v.bornAt, T0 + WELCOME);
        assertEq(v.food, 100);
        assertEq(v.fun, 75);
    }

    function test_untouchedCatDiesNineDaysAfterMint() public {
        warp(WELCOME + 48 hours - 1);
        assertTrue(g.state(1).alive);
        warp(1);
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.alive);
        assertEq(v.deaths, 1);
        assertEq(v.deadAt, T0 + WELCOME + 48 hours);
        assertEq(v.mood, 8);
        assertEq(v.score, 0);
        // recorded on the first touch
        vm.expectEmit(true, false, false, true);
        emit Emogotchi.Died(1, T0 + WELCOME + 48 hours);
        g.poke(1);
        assertEq(g.state(1).deaths, 1);
        g.poke(1); // idempotent
        assertEq(g.state(1).deaths, 1);
    }

    function test_deathExactly48hAfterLastFeed() public {
        feed(1);
        warp(20 hours);
        feed(1);
        warp(48 hours - 1);
        assertTrue(g.state(1).alive);
        vm.prank(alice);
        g.play{value: 1 ether}(1); // still alive, playing does not feed
        warp(1);
        assertFalse(g.state(1).alive);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.NotAlive.selector);
        g.feed{value: 1 ether}(1);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.NotAlive.selector);
        g.pet(1, 1);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.NotAlive.selector);
        g.setName{value: 10 ether}(1, "ghost");
    }

    function test_deadMetersFreezeAtDeath() public {
        feed(1);
        warp(10 days);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.deadAt, T0 + 48 hours);
        assertEq(v.day, 3);
        assertFalse(v.asleep);
    }

    function test_reviveAndSplit() public {
        feed(1);
        warp(48 hours);
        uint256 burn0 = g.pendingBurnMon();
        uint256 team0 = g.teamOwed();
        uint256 tre0 = g.treasuryOwed();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Emogotchi.WrongValue.selector, 1000 ether, 1 ether));
        g.revive{value: 1 ether}(1);
        vm.prank(alice);
        g.revive{value: 1000 ether}(1);
        assertEq(g.pendingBurnMon() - burn0, 500 ether);
        assertEq(g.teamOwed() - team0, 500 ether);
        assertEq(g.treasuryOwed(), tre0);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.alive);
        assertEq(v.food, 60);
        assertEq(v.clean, 60);
        assertEq(v.fun, 60);
        assertEq(v.energy, 60);
        assertEq(v.deaths, 1);
        assertEq(v.revives, 1);
        assertEq(v.streak, 1);
        assertEq(v.score, 0);
        assertFalse(v.poop);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.Alive.selector);
        g.revive{value: 1000 ether}(1);
        assertInvariant();
    }

    function test_streak() public {
        feed(1);
        assertEq(g.state(1).streak, 1);
        warp(6 hours);
        feed(1);
        assertEq(g.state(1).streak, 1); // same UTC day
        uint256 nextDay = (now_() / 1 days + 1) * 1 days;
        vm.warp(nextDay + 1);
        feed(1);
        assertEq(g.state(1).streak, 2);
        vm.warp(nextDay + 1 days - 60); // same day, late
        feed(1);
        assertEq(g.state(1).streak, 2);
        vm.warp(nextDay + 2 days + 60); // skipped a whole UTC day, 24h02m later: still alive
        feed(1);
        assertEq(g.state(1).streak, 1);
    }
}

contract MetersTest is Base {
    function test_poopDirtAndCleanup() public {
        feed(1);
        warp(4 hours - 1);
        assertFalse(g.state(1).poop);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.NoPoop.selector);
        g.clean{value: 1 ether}(1);
        warp(1);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.poop);
        assertEq(v.clean, 84);
        assertEq(v.mood, 3); // grubby: poop on the floor
        warp(4 hours);
        v = g.state(1);
        assertEq(v.clean, 42); // 4h + 4h x 2.5 = 14h of 24
        vm.prank(alice);
        g.clean{value: 1 ether}(1);
        v = g.state(1);
        assertFalse(v.poop);
        assertEq(v.clean, 52);
        assertEq(v.cleanups, 1);
    }

    function test_feedWithPoopOnFloorKeepsIt() public {
        feed(1);
        warp(5 hours);
        feed(1);
        assertTrue(g.state(1).poop);
        vm.prank(alice);
        g.clean{value: 1 ether}(1);
        assertFalse(g.state(1).poop);
        assertEq(g.state(1).poopAt, 0); // no poop scheduled: the meal before the cleanup does not schedule another
        feed(1);
        assertEq(g.state(1).poopAt, now_() + 4 hours);
    }

    function test_washAndPlayFill() public {
        feed(1);
        warp(6 hours);
        vm.prank(alice);
        g.wash{value: 1 ether}(1);
        vm.prank(alice);
        g.play{value: 1 ether}(1);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.clean, 100);
        assertEq(v.fun, 100);
        assertEq(v.food, 75);
        assertEq(v.washes, 1);
        assertEq(v.plays, 1);
        warp(4 hours);
        assertEq(g.state(1).clean, 100 - 41); // poop present: 4h x 2.5
    }

    function test_wrongValue() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Emogotchi.WrongValue.selector, 1 ether, 2 ether));
        g.feed{value: 2 ether}(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Emogotchi.WrongValue.selector, 1 ether, 0));
        g.feed(1);
    }
}

contract SleepTest is Base {
    function test_paidSleepAndWake() public {
        feed(1);
        warp(12 hours);
        vm.prank(alice);
        g.sleep{value: 1 ether}(1);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.asleep);
        assertEq(v.energy, 50);
        assertEq(v.naps, 1);
        assertEq(v.mood, 6);
        assertEq(v.wakesAt, now_() + 4 hours);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.Asleep.selector);
        g.sleep{value: 1 ether}(1);
        warp(2 hours);
        v = g.state(1);
        assertEq(v.energy, 75);
        vm.prank(alice);
        g.wake(1);
        v = g.state(1);
        assertFalse(v.asleep);
        assertEq(v.energy, 75);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.Awake.selector);
        g.wake(1);
    }

    function test_autoSleepCycle() public {
        feed(1);
        warp(24 hours);
        Emogotchi.View memory v = g.state(1);
        assertTrue(v.asleep);
        assertEq(v.energy, 0);
        assertEq(v.wakesAt, now_() + 8 hours);
        warp(4 hours);
        assertEq(g.state(1).energy, 50);
        warp(4 hours);
        v = g.state(1);
        assertFalse(v.asleep);
        assertEq(v.energy, 100);
        warp(32 hours);
        assertFalse(g.state(1).asleep);
    }

    function test_wakeFromAutoSleepWithZeroEnergy() public {
        feed(1);
        warp(24 hours);
        vm.prank(alice);
        g.wake(1);
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.asleep);
        assertEq(v.energy, 1);
    }

    function test_feedWakesSleepingCat() public {
        feed(1);
        warp(12 hours);
        vm.prank(alice);
        g.sleep{value: 1 ether}(1);
        warp(1 hours);
        feed(1);
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.asleep);
        assertEq(v.energy, 63);
        assertEq(v.food, 100);
    }

    function test_paidSleepAtFullEnergyIsANoOpNap() public {
        feed(1);
        vm.prank(alice);
        g.sleep{value: 1 ether}(1);
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.asleep);
        assertEq(v.naps, 1);
    }
}

contract PetAndNameTest is Base {
    function test_pet() public {
        feed(1);
        warp(12 hours);
        assertEq(g.state(1).fun, 50);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadCount.selector);
        g.pet(1, 0);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadCount.selector);
        g.pet(1, 21);
        vm.prank(alice);
        g.pet(1, 20);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.pets, 20);
        assertEq(v.fun, 55);
        vm.prank(alice);
        g.pet(1, 3);
        v = g.state(1);
        assertEq(v.pets, 23);
        assertEq(v.fun, 55); // bonus once a day
        vm.prank(bob);
        vm.expectRevert(Emogotchi.NotOwner.selector);
        g.pet(1, 1);
    }

    function test_petFreshCatDoesNotStartClock() public {
        vm.prank(alice);
        g.pet(1, 5);
        Emogotchi.View memory v = g.state(1);
        assertFalse(v.started);
        assertEq(v.pets, 5);
    }

    function test_petAfterWelcomeGetsBonus() public {
        warp(WELCOME + 12 hours);
        assertEq(g.state(1).fun, 50);
        vm.prank(alice);
        g.pet(1, 1);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.fun, 55);
        assertTrue(v.started);
        assertEq(v.bornAt, T0 + WELCOME);
        assertFalse(g.crowned(999));
    }

    function test_petBonusCappedAtFull() public {
        feed(1);
        warp(30 minutes);
        vm.prank(alice);
        g.pet(1, 1);
        assertEq(g.state(1).fun, 100);
    }

    function test_name() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Emogotchi.WrongValue.selector, 10 ether, 1 ether));
        g.setName{value: 1 ether}(1, "Tom");
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadName.selector);
        g.setName{value: 10 ether}(1, "");
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadName.selector);
        g.setName{value: 10 ether}(1, "123456789012345678901234567890123");
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "12345678901234567890123456789012");
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "Tom");
        Emogotchi.View memory v = g.state(1);
        assertEq(v.name, "Tom");
        assertEq(v.names, 2);
        assertEq(v.monPaid, 20 ether);
        assertFalse(v.started); // naming is not care
        assertEq(g.treasuryOwed(), 2 ether);
        assertEq(g.teamOwed(), 2 ether);
        assertEq(g.pendingBurnMon(), 16 ether);
        assertInvariant();
    }

    function test_nameSurvivesTransfer() public {
        vm.prank(alice);
        g.setName{value: 10 ether}(1, "Tom");
        vm.prank(alice);
        g.transferFrom(alice, bob, 1);
        assertEq(g.nameOf(1), "Tom");
    }
}

contract BatchTest is Base {
    function test_care() public {
        uint256[] memory ids = new uint256[](3);
        uint8[] memory acts = new uint8[](3);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        acts[0] = 0;
        acts[1] = 1;
        acts[2] = 2;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Emogotchi.WrongValue.selector, 3 ether, 1 ether));
        g.care{value: 1 ether}(ids, acts);
        vm.prank(alice);
        g.care{value: 3 ether}(ids, acts);
        assertEq(g.state(1).feeds, 1);
        assertEq(g.state(2).plays, 1);
        assertEq(g.state(3).washes, 1);
        assertEq(g.pendingBurnMon(), 2.4 ether);
        assertInvariant();
    }

    function test_careGuards() public {
        uint256[] memory ids = new uint256[](2);
        uint8[] memory acts = new uint8[](1);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.LengthMismatch.selector);
        g.care{value: 2 ether}(ids, acts);
        ids = new uint256[](1);
        acts[0] = 9;
        ids[0] = 1;
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadAction.selector);
        g.care{value: 1 ether}(ids, acts);
        ids = new uint256[](201);
        acts = new uint8[](201);
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadCount.selector);
        g.care{value: 201 ether}(ids, acts);
    }

    function test_fullCareSameCat() public {
        uint256[] memory ids = new uint256[](3);
        uint8[] memory acts = new uint8[](3);
        ids[0] = 1;
        ids[1] = 1;
        ids[2] = 1;
        acts[0] = 0;
        acts[1] = 1;
        acts[2] = 2;
        vm.prank(alice);
        g.care{value: 3 ether}(ids, acts);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.feeds + v.plays + v.washes, 3);
        assertEq(v.monPaid, 3 ether);
    }
}

contract ProtocolTest is Base {
    function test_table() public {
        // .4 with no poop anywhere reverts
        assertFalse(send(alice, 1.4 ether));
        // three cats, fed at different times: 2.0 feeds the two hungriest
        feed(1);
        warp(6 hours);
        feed(2);
        warp(6 hours);
        feed(3);
        warp(1 hours);
        assertTrue(send(alice, 2 ether));
        assertEq(g.state(1).food, 100);
        assertEq(g.state(2).food, 100);
        assertEq(g.state(3).food, 96);
        // .1 with tail: 1.1 plays the most bored, 0.1 to treasury on top of the split
        uint256 t0 = g.treasuryOwed();
        assertTrue(send(alice, 1.1 ether));
        assertEq(g.treasuryOwed() - t0, 0.1 ether + 0.1 ether);
        assertEq(g.state(1).plays, 1); // played least recently: fed first, never played
        // second decimal, d > 4, N > cats, zero
        assertFalse(send(alice, 1.05 ether));
        assertFalse(send(alice, 1.5 ether));
        assertFalse(send(alice, 4 ether));
        assertFalse(send(alice, 0.3 ether));
        // cat 3 was fed 1h ago: its poop is not there yet
        assertFalse(send(alice, 3.4 ether));
        warp(4 hours);
        assertTrue(send(alice, 3.4 ether));
        assertFalse(g.state(1).poop);
        assertFalse(g.state(3).poop);
        // 1000.0 without a dead cat reverts (n > MAX_BATCH), with one revives it
        assertFalse(send(alice, 1000 ether));
        warp(48 hours);
        assertFalse(g.state(1).alive);
        assertFalse(g.state(3).alive); // fed at 12h, an hour before cat 1: dead the longest
        assertFalse(g.state(3).crowned); // computed dead: no crown, even before it is recorded
        assertTrue(send(alice, 1000 ether));
        assertTrue(g.state(3).alive);
        assertFalse(g.state(1).alive);
        assertEq(g.state(3).revives, 1);
        assertInvariant();
    }

    function test_washDirtiestAndSleepAwakeOnly() public {
        feed(1);
        feed(2);
        feed(3);
        warp(3 hours);
        vm.prank(alice);
        g.wash{value: 1 ether}(2);
        warp(3 hours);
        assertTrue(send(alice, 1.2 ether)); // cat 1 or 3 (tied dirtiest); never cat 2
        assertEq(g.state(2).washes, 1);
        assertEq(g.state(1).washes + g.state(3).washes, 1);
        // put 1 and 3 to sleep by hand, then .3 must pick cat 2 only
        vm.prank(alice);
        g.sleep{value: 1 ether}(1);
        vm.prank(alice);
        g.sleep{value: 1 ether}(3);
        assertFalse(send(alice, 2.3 ether)); // only one awake
        assertTrue(send(alice, 1.3 ether));
        assertTrue(g.state(2).asleep);
    }

    function test_freshCatsComeLast() public {
        feed(1);
        warp(12 hours);
        assertTrue(send(alice, 1 ether)); // cat 1 (50 food) before fresh cats (full)
        assertEq(g.state(1).feeds, 2);
        assertFalse(g.state(2).started);
        assertTrue(send(alice, 3 ether)); // starts the fresh ones
        assertTrue(g.state(2).started);
        assertTrue(g.state(3).started);
    }

    function test_reviveLongestDead() public {
        feed(1);
        warp(1 hours);
        feed(2);
        warp(48 hours);
        assertFalse(g.state(1).alive);
        assertFalse(g.state(2).alive);
        assertTrue(send(alice, 1000 ether));
        assertTrue(g.state(1).alive);
        assertFalse(g.state(2).alive);
        assertTrue(send(alice, 1000 ether));
        assertTrue(g.state(2).alive);
        assertEq(g.teamOwed(), 1000 ether + 0.2 ether);
    }

    function test_deadCatsNotEligible() public {
        feed(1);
        warp(48 hours);
        assertFalse(send(alice, 3 ether)); // one dead, two fresh
        assertTrue(send(alice, 2 ether));
    }

    function test_strangerWithNoCats() public {
        assertFalse(send(bob, 1 ether));
    }
}

contract AccountingTest is Base {
    function test_split() public {
        feed(1);
        assertEq(g.pendingBurnMon(), 0.8 ether);
        assertEq(g.treasuryOwed(), 0.1 ether);
        assertEq(g.teamOwed(), 0.1 ether);
        assertInvariant();
    }

    function test_crankBurn() public {
        feed(1);
        feed(2);
        vm.expectRevert(Emogotchi.NothingToDo.selector);
        g.crankBurn(0, 0);
        g.crankBurn(1 ether, 0);
        assertEq(g.pendingBurnMon(), 0.6 ether);
        assertGt(g.totalEmoBurned(), 0);
        assertEq(g.totalMonBurned(), 1 ether);
        assertEq(emo.balanceOf(g.BURN_ADDRESS()), g.totalEmoBurned());
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0);
        assertInvariant();
    }

    function test_crankQueuesOnRouterFailure() public {
        feed(1);
        nad.setFailNext(true);
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0.8 ether);
        assertEq(g.totalEmoBurned(), 0);
        nad.setFailNext(false);
        nad.setLensRouter(address(0xBAD));
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0.8 ether);
        nad.setLensRouter(address(nad));
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0);
        assertInvariant();
    }

    function test_impactGuard() public {
        nad.setReserves(100 ether, 420_000 ether); // guard = 0.5 MON
        feed(1);
        g.crankBurn(type(uint256).max, 0); // 0.8 > 0.5: queued
        assertEq(g.pendingBurnMon(), 0.8 ether);
        g.crankBurn(0.5 ether, 0);
        assertEq(g.pendingBurnMon(), 0.3 ether);
        assertGt(g.totalEmoBurned(), 0);
    }

    function test_skimForcedMon() public {
        feed(1);
        vm.expectRevert(Emogotchi.NothingToDo.selector);
        g.skim();
        vm.deal(address(g), address(g).balance + 3 ether); // forced MON (selfdestruct / coinbase)
        g.skim();
        assertEq(g.pendingBurnMon(), 3.8 ether);
        assertInvariant();
    }

    function test_callerMinOutQueuesInsteadOfBadFill() public {
        feed(1);
        g.crankBurn(type(uint256).max, type(uint256).max); // impossible floor: queued, nothing lost
        assertEq(g.pendingBurnMon(), 0.8 ether);
        assertEq(g.totalEmoBurned(), 0);
        g.crankBurn(type(uint256).max, 1);
        assertEq(g.pendingBurnMon(), 0);
        assertInvariant();
    }

    function test_wmonRevertQueues() public {
        feed(1);
        vm.mockCallRevert(address(wmon), abi.encodeWithSignature("balanceOf(address)", pool), "down");
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0.8 ether);
        vm.clearMockedCalls();
        g.crankBurn(type(uint256).max, 0);
        assertEq(g.pendingBurnMon(), 0);
    }

    function test_badGuardAndBadAction() public {
        Emogotchi.Params memory p = params(minter, 10);
        p.maxImpactBps = 0;
        vm.expectRevert(Emogotchi.BadGuard.selector);
        new Emogotchi(p);
        uint256[] memory ids = new uint256[](1);
        uint8[] memory acts = new uint8[](1);
        ids[0] = 1;
        acts[0] = 7;
        vm.prank(alice);
        vm.expectRevert(Emogotchi.BadAction.selector);
        g.care{value: 1 ether}(ids, acts);
    }

    function test_sweep() public {
        vm.expectRevert(Emogotchi.NothingToDo.selector);
        g.sweep();
        feed(1);
        g.sweep();
        assertEq(treasury.balance, 0.1 ether);
        assertEq(team.balance, 0.1 ether);
        assertEq(g.treasuryOwed(), 0);
        assertInvariant();
    }

    function test_sweepRefuserKeepsShareOwed() public {
        Emogotchi.Params memory p = params(minter, 10);
        p.treasury = address(new Refuser());
        Emogotchi c = new Emogotchi(p);
        vm.prank(minter);
        c.mintMany(alice, 1);
        vm.prank(alice);
        c.feed{value: 1 ether}(1);
        c.sweep();
        assertEq(team.balance, 0.1 ether);
        assertEq(c.treasuryOwed(), 0.1 ether);
        assertEq(address(c).balance, c.pendingBurnMon() + c.treasuryOwed() + c.teamOwed());
        vm.expectRevert(Emogotchi.NothingToDo.selector);
        c.sweep();
    }

    function testFuzz_invariant(uint8 a, uint8 b, uint8 c, uint16 hoursA, uint16 hoursB) public {
        feed(1);
        warp(uint256(hoursA % 30) * 1 hours);
        if (a % 2 == 0) vm.prank(alice);
        if (a % 2 == 0) g.play{value: 1 ether}(1);
        if (b % 3 == 0) send(alice, 2.1 ether);
        warp(uint256(hoursB % 60) * 1 hours);
        if (g.state(1).alive) {
            vm.prank(alice);
            g.wash{value: 1 ether}(1);
        } else {
            vm.prank(alice);
            g.revive{value: 1000 ether}(1);
        }
        if (c % 2 == 0) g.crankBurn(type(uint256).max, 0);
        if (c % 3 == 0) g.sweep();
        assertInvariant();
    }
}

contract ScoreTest is Base {
    function test_onceADayCareScoresAboutHalf() public {
        feed(1);
        for (uint256 d = 0; d < 14; d++) {
            warp(24 hours);
            uint256[] memory ids = new uint256[](4);
            uint8[] memory acts = new uint8[](4);
            for (uint256 i = 0; i < 4; i++) ids[i] = 1;
            acts[0] = 4;
            acts[1] = 0;
            acts[2] = 1;
            acts[3] = 2;
            vm.prank(alice);
            g.care{value: 4 ether}(ids, acts);
        }
        uint256 s = g.scoreOf(1);
        emit log_named_uint("once a day, 14 days", s);
        assertGt(s, 3000);
        assertLt(s, 5500);
    }

    function test_fourTimesADayScoresHigh() public {
        feed(1);
        for (uint256 d = 0; d < 14 * 4; d++) {
            warp(6 hours);
            uint256[] memory ids = new uint256[](3);
            uint8[] memory acts = new uint8[](3);
            for (uint256 i = 0; i < 3; i++) ids[i] = 1;
            acts[0] = 0;
            acts[1] = 1;
            acts[2] = 2;
            vm.prank(alice);
            g.care{value: 3 ether}(ids, acts);
            if (g.state(1).poop) {
                vm.prank(alice);
                g.clean{value: 1 ether}(1);
            }
            Emogotchi.View memory v = g.state(1);
            if (!v.asleep && v.energy <= 50) {
                vm.prank(alice);
                g.sleep{value: 1 ether}(1);
            }
        }
        uint256 s = g.scoreOf(1);
        emit log_named_uint("full care 4x a day, 14 days", s);
        assertGt(s, 6000);
    }

    function test_scoreDecaysWithoutCare() public {
        feed(1);
        for (uint256 d = 0; d < 20; d++) {
            warp(6 hours);
            feed(1);
            vm.prank(alice);
            g.play{value: 1 ether}(1);
            vm.prank(alice);
            g.wash{value: 1 ether}(1);
        }
        uint256 s0 = g.scoreOf(1);
        emit log_named_uint("feed/play/wash 4x a day, 5 days", s0);
        assertGt(s0, 5500);
        warp(24 hours);
        uint256 s1 = g.scoreOf(1);
        assertLt(s1, s0);
        warp(23 hours);
        assertLt(g.scoreOf(1), s1);
        warp(2 hours);
        assertEq(g.scoreOf(1), 0); // dead
        assertEq(g.state(1).score, 0);
    }

    function test_scoreNeverAbove10000() public {
        feed(1);
        for (uint256 i = 0; i < 50; i++) {
            warp(10 minutes);
            feed(1);
        }
        assertLe(g.scoreOf(1), 10_000);
        assertLe(g.state(1).score, 10_000);
    }
}

contract CrownTest is Base {
    Emogotchi c;

    function setUp() public override {
        super.setUp();
        c = new Emogotchi(params(minter, 1000));
        vm.prank(minter);
        c.mintMany(alice, 130);
    }

    function careAll(uint256 id) internal {
        uint256[] memory ids = new uint256[](3);
        uint8[] memory acts = new uint8[](3);
        for (uint256 i = 0; i < 3; i++) ids[i] = id;
        acts[0] = 0;
        acts[1] = 1;
        acts[2] = 2;
        vm.prank(alice);
        c.care{value: 3 ether}(ids, acts);
    }

    function feedAll(uint256 n) internal {
        uint256[] memory ids = new uint256[](n);
        uint8[] memory acts = new uint8[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = i + 1;
        vm.prank(alice);
        c.care{value: n * 1 ether}(ids, acts);
    }

    /// @dev Give cats 1..n a day of good care so they have a real score, one care per cat per 6 h.
    function buildScores(uint256 n, uint256 rounds) internal {
        for (uint256 r = 0; r < rounds; r++) {
            warp(6 hours);
            for (uint256 id = 1; id <= n; id++) careAll(id);
        }
    }

    /// @dev A week of once-every-6h care for cats 1..n, then one more care: the first care after 7 full
    ///      days of history is the first one that can rank the cat (the clock starts at the first care).
    function week(uint256 n) internal {
        buildScores(n, 29);
    }

    function test_noCrownBeforeAWeek() public {
        buildScores(3, 28); // the 28th care is 6h short of a week since the first one
        assertFalse(c.crowned(1));
        assertFalse(c.state(1).crownEligible);
        assertGt(c.scoreOf(1), 0);
        buildScores(3, 1);
        assertTrue(c.state(1).crownEligible);
        assertTrue(c.crowned(1));
        // revive resets the week
        warp(48 hours);
        vm.prank(alice);
        c.revive{value: 1000 ether}(1);
        assertFalse(c.crowned(1));
        buildScores(1, 27);
        assertFalse(c.crowned(1));
        buildScores(1, 1);
        assertTrue(c.crowned(1));
    }

    function test_fillAndEvict() public {
        week(100);
        (uint256[] memory ids,,,) = c.crownList();
        assertEq(ids.length, 100);
        assertTrue(c.crowned(1));
        assertTrue(c.crowned(100));
        assertFalse(c.crowned(101));
        // cat 101 with a lower score cannot enter; nobody is evicted
        careAll(101);
        assertFalse(c.crowned(101));
        // cat 101 cared for 4x a day while the rest only get fed once a day: it outscores the lowest and takes a crown
        for (uint256 r = 0; r < 28; r++) {
            warp(6 hours);
            careAll(101);
            if (r % 4 == 3) feedAll(100);
        }
        assertTrue(c.crowned(101));
        (ids,,,) = c.crownList();
        assertEq(ids.length, 100);
        uint256 crownedCount;
        for (uint256 id = 1; id <= 101; id++) if (c.crowned(id)) crownedCount++;
        assertEq(crownedCount, 100);
    }

    function test_tieKeepsIncumbent() public {
        // all 100 cats end with identical stored scores and streaks; cat 101 matches exactly and stays out
        week(101);
        assertTrue(c.crowned(1));
        assertTrue(c.crowned(100));
        assertFalse(c.crowned(101));
        assertGt(c.scoreOf(101), 0);
        assertEq(c.scoreOf(101), c.scoreOf(100));
    }

    function test_staleMinIsRefreshedAndEvicted() public {
        week(100);
        // the list is full and equal; the 100 drop to a feed a day (stored scores stay stale-high), cat 101 keeps going
        for (uint256 r = 0; r < 28; r++) {
            warp(6 hours);
            careAll(101);
            if (r % 4 == 3) feedAll(100);
        }
        assertTrue(c.crowned(101));
        // a newly minted cat arrives later (the untouched ones from setUp died of old age by now):
        // another stale entry is refreshed and goes
        vm.prank(minter);
        c.mintMany(alice, 1);
        uint256 newcomer = c.totalSupply();
        for (uint256 r = 0; r < 30; r++) {
            warp(6 hours);
            careAll(newcomer);
            careAll(101);
            if (r % 4 == 3) feedAll(100);
        }
        assertTrue(c.crowned(newcomer));
        assertTrue(c.crowned(101));
        (uint256[] memory ids,,,) = c.crownList();
        assertEq(ids.length, 100);
        uint256 alive;
        for (uint256 id = 1; id <= 101; id++) if (c.state(id).alive) alive++;
        assertEq(alive, 101);
        assertTrue(c.state(newcomer).alive);
    }

    function test_zeroScoreNeverCrowned() public {
        buildScores(3, 1); // first care: score 0
        (uint256[] memory ids,,,) = c.crownList();
        assertEq(ids.length, 0);
        assertFalse(c.crowned(1));
    }

    function test_deathUncrowns() public {
        week(5);
        assertTrue(c.crowned(3));
        warp(48 hours);
        c.poke(3);
        assertFalse(c.crowned(3));
        (uint256[] memory ids,,,) = c.crownList();
        assertEq(ids.length, 4);
        for (uint256 i = 0; i < ids.length; i++) assertTrue(ids[i] != 3);
        assertFalse(c.state(3).crowned);
    }

    function test_crownListIsLive() public {
        week(3);
        (, uint256[] memory s0,, bool[] memory alive0) = c.crownList();
        assertTrue(alive0[0]);
        warp(3 days);
        (uint256[] memory ids, uint256[] memory s1,, bool[] memory alive1) = c.crownList();
        assertEq(ids.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertFalse(alive1[i]);
            assertEq(s1[i], 0);
            assertGt(s0[i], 0);
        }
        Emogotchi.View[] memory page = c.catsOfRange(alice, 1, 2);
        assertEq(page.length, 2);
        assertEq(page[0].id, 2);
        assertEq(c.catsOfRange(alice, 999, 5).length, 0);
    }

    function test_pokeRefreshesRank() public {
        week(3);
        (, uint256[] memory scores0,,) = c.crownList();
        warp(3 days);
        c.poke(1);
        (uint256[] memory ids, uint256[] memory scores,,) = c.crownList();
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == 1) assertLt(scores[i], scores0[i]);
        }
    }

    function test_uriShowsCrown() public {
        week(1);
        string memory u = c.tokenURI(1);
        assertTrue(bytes(u).length > 0);
        assertTrue(c.state(1).crowned);
    }

    function test_gasOfCrownedFeed() public {
        week(100);
        warp(6 hours);
        vm.prank(alice);
        uint256 g0 = gasleft();
        c.feed{value: 1 ether}(50);
        uint256 used = g0 - gasleft();
        emit log_named_uint("feed gas (in list)", used);
        vm.prank(alice);
        g0 = gasleft();
        c.feed{value: 1 ether}(120);
        emit log_named_uint("feed gas (fresh, out of list)", g0 - gasleft());
        assertLt(used, 400_000);
    }
}

contract MetadataTest is Base {
    function test_uriJson() public {
        vm.prank(alice);
        g.setName{value: 10 ether}(1, unicode"Mr \"Whiskers\" 🐱");
        feed(1);
        string memory u = g.tokenURI(1);
        bytes memory b = bytes(u);
        assertEq(string(slice(b, 0, 29)), "data:application/json;base64,");
        emit log_string(u);
    }

    function test_uriMoods() public {
        // fresh: happy
        assertEq(g.state(1).mood, 1);
        feed(1);
        assertEq(g.state(1).mood, 1); // just cared, everything above 78
        warp(6 hours);
        assertEq(g.state(1).mood, 3); // poop on the floor: grubby
        vm.prank(alice);
        g.clean{value: 1 ether}(1);
        assertEq(g.state(1).mood, 0); // content: 75 food, 85 clean
        warp(10 hours);
        Emogotchi.View memory v = g.state(1);
        assertEq(v.food, 34);
        assertEq(v.clean, 32);
        assertEq(v.mood, 3); // grubby: clean is the lowest
        vm.prank(alice);
        g.wash{value: 1 ether}(1);
        assertEq(g.state(1).mood, 2); // hungry: food 34, fun 34 -> food first
        vm.prank(alice);
        g.play{value: 1 ether}(1);
        feed(1);
        warp(10 hours); // 26h since the clock started: asleep by itself since 24h
        v = g.state(1);
        assertTrue(v.asleep);
        assertEq(v.energy, 25);
        assertEq(v.mood, 6); // sleeping wins over everything but death
        warp(4 hours);
        vm.prank(alice);
        g.wake(1);
        v = g.state(1);
        assertEq(v.energy, 75);
        assertEq(v.clean, 0); // poop since 20h, never cleaned
        assertEq(v.mood, 7); // sad
    }

    function test_uriInvalidToken() public {
        vm.expectRevert(Emogotchi.InvalidToken.selector);
        g.tokenURI(99);
    }

    function slice(bytes memory b, uint256 from, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i = 0; i < len; i++) out[i] = b[from + i];
    }
}
