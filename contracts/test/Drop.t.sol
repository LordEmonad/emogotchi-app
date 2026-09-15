// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {EmogotchiDrop} from "../src/EmogotchiDrop.sol";
import {MockEMO, MockWMON, MockNad, MockArt} from "./mocks/Mocks.sol";

/// @dev A tiny Merkle tree builder in the same shape as tools/claim/tree.mjs and the contract.
library Tree {
    function leaf(address a) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(a))));
    }

    function pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// Sorted leaves, pair-hashed level by level, odd node carried up. Returns root and the proof for `who`.
    function build(address[] memory who, address target) internal pure returns (bytes32 root, bytes32[] memory proof) {
        uint256 n = who.length;
        bytes32[] memory level = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) level[i] = leaf(who[i]);
        // insertion sort
        for (uint256 i = 1; i < n; i++) {
            bytes32 v = level[i];
            uint256 j = i;
            while (j > 0 && level[j - 1] > v) { level[j] = level[j - 1]; j--; }
            level[j] = v;
        }
        uint256 idx = type(uint256).max;
        bytes32 t = leaf(target);
        for (uint256 i = 0; i < n; i++) if (level[i] == t) idx = i;
        bytes32[] memory tmp = new bytes32[](64);
        uint256 plen = 0;
        while (level.length > 1) {
            uint256 m = (level.length + 1) / 2;
            bytes32[] memory next = new bytes32[](m);
            for (uint256 i = 0; i < level.length; i += 2) {
                if (i + 1 < level.length) {
                    next[i / 2] = pair(level[i], level[i + 1]);
                    if (idx == i) tmp[plen++] = level[i + 1];
                    else if (idx == i + 1) tmp[plen++] = level[i];
                } else {
                    next[i / 2] = level[i];
                }
            }
            if (idx != type(uint256).max) idx /= 2;
            level = next;
        }
        root = level[0];
        proof = new bytes32[](plen);
        for (uint256 i = 0; i < plen; i++) proof[i] = tmp[i];
    }
}

contract DropTest is Test {
    Emogotchi g;
    EmogotchiDrop drop;
    MockEMO emo; MockWMON wmon; MockNad nad; MockArt art;
    address operator = address(0x0DE);
    address pool = address(0x900D);
    address[] list;
    uint256 constant T0 = 1_800_000_000;

    function setUp() public {
        vm.warp(T0);
        emo = new MockEMO(); wmon = new MockWMON(); nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether); art = new MockArt();
        // the drop is the game's minter, so its address is computed before the game exists
        address dropAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        Emogotchi.Params memory p;
        p.minter = dropAddr; p.maxSupply = 12; p.welcome = 7 days; p.treasury = address(0x7EA); p.team = address(0x7E4);
        p.burnBps = 8000; p.treasuryBps = 1000; p.teamBps = 1000; p.reviveBurnBps = 5000;
        p.emo = address(emo); p.wmon = address(wmon); p.router = address(nad); p.lens = address(nad); p.pool = pool; p.maxImpactBps = 50;
        p.art = address(art); p.siteURI = "https://emogotchi.emonad.lol";
        g = new Emogotchi(p);
        drop = new EmogotchiDrop(address(g), operator);
        assertEq(address(drop), dropAddr);
        for (uint160 i = 1; i <= 7; i++) list.push(address(0x1000 + i));
    }

    function open(uint256 cap) internal returns (bytes32 root) {
        (root,) = Tree.build(list, list[0]);
        vm.prank(operator);
        drop.openClaims(root, uint64(T0 + 1 days), uint64(T0 + 8 days), cap);
    }

    function proofFor(address a) internal view returns (bytes32[] memory proof) {
        (, proof) = Tree.build(list, a);
    }

    // ---- airdrop
    function test_airdrop_operatorOnly_andCounts() public {
        address[] memory to = new address[](3);
        to[0] = address(0xA1); to[1] = address(0xA2); to[2] = address(0xA1);
        vm.expectRevert(EmogotchiDrop.NotOperator.selector);
        drop.airdrop(to);
        vm.prank(operator);
        drop.airdrop(to);
        assertEq(g.totalSupply(), 3);
        assertEq(g.balanceOf(address(0xA1)), 2);
        assertEq(drop.airdropped(), 3);
    }

    function test_nobodyElseCanMint() public {
        vm.expectRevert(Emogotchi.NotMinter.selector);
        g.mintMany(address(this), 1);
    }

    // ---- claims
    function test_claim_happyPath_oneEach() public {
        open(10);
        vm.warp(T0 + 1 days);
        for (uint256 i = 0; i < list.length; i++) {
            bytes32[] memory proof = proofFor(list[i]);
            assertTrue(drop.eligible(list[i], proof));
            vm.prank(list[i]);
            uint256 id = drop.claim(proof);
            assertEq(g.ownerOf(id), list[i]);
        }
        assertEq(g.totalSupply(), 7);
        assertEq(drop.claimed(), 7);
        assertEq(drop.claimsLeft(), 3);
        // a second claim by anyone on the list fails
        vm.prank(list[2]);
        vm.expectRevert(EmogotchiDrop.AlreadyClaimed.selector);
        drop.claim(proofFor(list[2]));
    }

    function test_claim_notOnTheList() public {
        open(10);
        vm.warp(T0 + 1 days);
        address stranger = address(0xBEEF);
        bytes32[] memory proof = proofFor(list[0]); // someone else's proof
        assertFalse(drop.eligible(stranger, proof));
        vm.prank(stranger);
        vm.expectRevert(EmogotchiDrop.NotOnTheList.selector);
        drop.claim(proof);
    }

    function test_claim_windowEdges() public {
        vm.prank(list[0]);
        vm.expectRevert(EmogotchiDrop.ClaimsNotOpen.selector);
        drop.claim(new bytes32[](0));
        open(10);
        vm.warp(T0 + 1 days - 1);
        vm.prank(list[0]);
        vm.expectRevert(EmogotchiDrop.ClaimsNotOpen.selector);
        drop.claim(proofFor(list[0]));
        vm.warp(T0 + 8 days);
        vm.prank(list[0]);
        vm.expectRevert(EmogotchiDrop.ClaimsClosed.selector);
        drop.claim(proofFor(list[0]));
        vm.warp(T0 + 8 days - 1);
        vm.prank(list[0]);
        drop.claim(proofFor(list[0]));
    }

    function test_claim_capThenSupply() public {
        open(2);
        vm.warp(T0 + 1 days);
        vm.prank(list[0]); drop.claim(proofFor(list[0]));
        vm.prank(list[1]); drop.claim(proofFor(list[1]));
        assertEq(drop.claimsLeft(), 0);
        vm.prank(list[2]);
        vm.expectRevert(EmogotchiDrop.NoCatsLeft.selector);
        drop.claim(proofFor(list[2]));
    }

    function test_claim_gameSupplyBites() public {
        // 10 airdropped of 12; cap says 5 but only 2 are left in the game
        address[] memory to = new address[](10);
        for (uint256 i = 0; i < 10; i++) to[i] = address(uint160(0x2000 + i));
        vm.prank(operator); drop.airdrop(to);
        open(5);
        assertEq(drop.claimsLeft(), 2);
        vm.warp(T0 + 1 days);
        vm.prank(list[0]); drop.claim(proofFor(list[0]));
        vm.prank(list[1]); drop.claim(proofFor(list[1]));
        vm.prank(list[2]);
        vm.expectRevert(Emogotchi.SoldOut.selector);
        drop.claim(proofFor(list[2]));
    }

    function test_openClaims_onceAndSane() public {
        (bytes32 root,) = Tree.build(list, list[0]);
        vm.startPrank(operator);
        vm.expectRevert(EmogotchiDrop.BadWindow.selector);
        drop.openClaims(root, uint64(T0 + 2 days), uint64(T0 + 1 days), 10);
        vm.expectRevert(EmogotchiDrop.BadWindow.selector);
        drop.openClaims(bytes32(0), uint64(T0 + 1 days), uint64(T0 + 8 days), 10);
        drop.openClaims(root, uint64(T0 + 1 days), uint64(T0 + 8 days), 10);
        vm.expectRevert(EmogotchiDrop.AlreadyOpened.selector);
        drop.openClaims(root, uint64(T0 + 1 days), uint64(T0 + 8 days), 10);
        vm.stopPrank();
        vm.expectRevert(EmogotchiDrop.NotOperator.selector);
        drop.openClaims(root, uint64(T0 + 1 days), uint64(T0 + 8 days), 10);
    }

    // ---- seal
    function test_seal_anyoneAfterWindow_operatorAnytime() public {
        vm.expectRevert(EmogotchiDrop.TooEarlyToSeal.selector);
        drop.seal();
        open(10);
        vm.warp(T0 + 8 days - 1);
        vm.expectRevert(EmogotchiDrop.TooEarlyToSeal.selector);
        drop.seal();
        vm.warp(T0 + 8 days);
        drop.seal();
        assertTrue(drop.isSealed());
        assertEq(drop.claimsLeft(), 0);
        address[] memory to = new address[](1); to[0] = address(0xA1);
        vm.prank(operator);
        vm.expectRevert(EmogotchiDrop.IsSealed.selector);
        drop.airdrop(to);
        vm.prank(list[0]);
        vm.expectRevert(EmogotchiDrop.IsSealed.selector);
        drop.claim(proofFor(list[0]));
    }

    function test_seal_operatorEarly_endsClaims() public {
        open(10);
        vm.warp(T0 + 2 days);
        vm.prank(operator); drop.seal();
        vm.prank(list[0]);
        vm.expectRevert(EmogotchiDrop.IsSealed.selector);
        drop.claim(proofFor(list[0]));
        vm.prank(operator);
        vm.expectRevert(EmogotchiDrop.IsSealed.selector);
        drop.openClaims(bytes32(uint256(1)), uint64(T0 + 3 days), uint64(T0 + 9 days), 1);
    }

    // ---- the tree helper agrees with itself for every size up to 9 (odd levels included)
    function test_tree_everyLeafVerifies() public {
        for (uint256 n = 1; n <= 9; n++) {
            address[] memory who = new address[](n);
            for (uint256 i = 0; i < n; i++) who[i] = address(uint160(0x5000 + i * 7919));
            EmogotchiDrop d = new EmogotchiDrop(address(g), operator);
            (bytes32 root,) = Tree.build(who, who[0]);
            vm.prank(operator);
            d.openClaims(root, uint64(T0 + 1), uint64(T0 + 100), 100);
            for (uint256 i = 0; i < n; i++) {
                (, bytes32[] memory proof) = Tree.build(who, who[i]);
                assertTrue(d.eligible(who[i], proof));
            }
            assertFalse(d.eligible(address(0xDEAD), new bytes32[](0)));
        }
    }
}
