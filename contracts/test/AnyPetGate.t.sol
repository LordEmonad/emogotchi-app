// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {AnyPetGate} from "../src/gates/AnyPetGate.sol";
import {MockEMO, MockWMON, MockNad, MockArt} from "./mocks/Mocks.sol";

/// The emo hair's rule: hold a pet of any collection the shop allows, one per wallet, 1000 in all. The gate
/// follows the shop's allowed collections, so a pet allowed after the item was created qualifies too.
contract AnyPetGateTest is Test {
    Emogotchi cats;
    Inversegotchi brahs;
    EmogotchiItems items;
    AnyPetGate gate;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    address pool = address(0x900D);
    address treasury = makeAddr("treasury");
    address team = makeAddr("team");
    address alice = makeAddr("alice"); // a cat
    address bob = makeAddr("bob"); // an inversebrah
    address carol = makeAddr("carol"); // nothing
    address dave = makeAddr("dave"); // a future pet
    bytes svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');
    uint256 hair;

    function setUp() public {
        emo = new MockEMO();
        wmon = new MockWMON();
        nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        Emogotchi.Params memory p;
        p.minter = address(this);
        p.maxSupply = 1000;
        p.welcome = 7 days;
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
        p.art = address(new MockArt());
        p.siteURI = "https://emogotchi.emonad.lol";
        cats = new Emogotchi(p);
        Inversegotchi.Params memory ip;
        ip.welcome = 7 days;
        ip.treasury = treasury;
        ip.team = team;
        ip.burnBps = 8000;
        ip.treasuryBps = 1000;
        ip.teamBps = 1000;
        ip.emo = address(emo);
        ip.wmon = address(wmon);
        ip.router = address(nad);
        ip.lens = address(nad);
        ip.pool = pool;
        ip.maxImpactBps = 50;
        ip.art = address(new MockArt());
        ip.siteURI = "https://emogotchi.emonad.lol";
        brahs = new Inversegotchi(ip);

        EmogotchiItems.Params memory q;
        q.curator = address(this);
        q.treasury = treasury;
        q.team = team;
        q.treasuryBps = 1000;
        q.teamBps = 1000;
        q.emo = address(emo);
        q.wmon = address(wmon);
        q.router = address(nad);
        q.lens = address(nad);
        q.pool = pool;
        q.maxImpactBps = 50;
        q.collectionSvg = svg;
        items = new EmogotchiItems(q);
        items.allowCollection(address(cats));
        items.allowCollection(address(brahs));
        address[] memory known = new address[](2);
        known[0] = address(cats);
        known[1] = address(brahs);
        gate = new AnyPetGate(address(items), known);

        cats.mintMany(alice, 1);
        vm.prank(bob);
        brahs.mint();

        EmogotchiItems.CreateParams memory c;
        c.name = "Emo hair";
        c.description = "Hair.";
        c.svg = svg;
        c.price = 0;
        c.maxSupply = 1000;
        c.perKey = 1;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2;
        c.gate = address(gate);
        hair = items.create(c);
    }

    function test_anyPetHolderClaimsOnce() public {
        vm.prank(alice);
        items.claim(hair, 1, "");
        vm.prank(bob);
        items.claim(hair, 1, abi.encode(address(brahs)));
        assertEq(items.balanceOf(alice, hair), 1);
        assertEq(items.balanceOf(bob, hair), 1);
        // one per wallet
        vm.prank(bob);
        vm.expectRevert();
        items.claim(hair, 1, abi.encode(address(brahs)));
        vm.prank(alice);
        vm.expectRevert();
        items.claim(hair, 2, "");
        // nothing held: not eligible, with or without a hint
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, "");
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, abi.encode(address(cats)));
    }

    function test_hintMustBeAnAllowedCollection() public {
        // an ERC-721 the shop does not allow does not count, even if held
        Emogotchi.Params memory p;
        p.minter = address(this);
        p.maxSupply = 10;
        p.welcome = 7 days;
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
        p.art = address(new MockArt());
        p.siteURI = "x";
        Emogotchi other = new Emogotchi(p);
        other.mintMany(dave, 1);
        vm.prank(dave);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, abi.encode(address(other)));
        // a hint that is not a contract, or garbage, reads as not eligible rather than reverting the gate
        vm.prank(dave);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, abi.encode(address(0xBEEF)));
        vm.prank(dave);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, hex"01");
        // a 32-byte hint that is not an address (high bytes set) is not eligible, never truncated into one
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(hair, 1, abi.encode(uint256(uint160(address(brahs))) | (uint256(1) << 200)));
        // the moment the curator allows that collection, its holders qualify: a future pet, no change to the gate or the item
        items.allowCollection(address(other));
        vm.prank(dave);
        items.claim(hair, 1, abi.encode(address(other)));
        assertEq(items.balanceOf(dave, hair), 1);
    }

    function test_canClaimAgrees() public view {
        (bool ok,,,) = items.canClaim(hair, bob, 1, abi.encode(address(brahs)));
        assertTrue(ok);
        (bool ok2,,,) = items.canClaim(hair, carol, 1, "");
        assertFalse(ok2);
    }

    function test_hairEquipsOnAnInversebrah() public {
        vm.prank(bob);
        items.claim(hair, 1, abi.encode(address(brahs)));
        vm.prank(bob);
        items.equip(address(brahs), 1, hair);
        uint256[] memory worn = items.equipped(address(brahs), 1);
        assertEq(worn.length, 1);
        assertEq(worn[0], hair);
    }
}
