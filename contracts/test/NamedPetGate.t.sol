// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedPetGate} from "../src/gates/NamedPetGate.sol";
import {MockEMO, MockWMON, MockNad, MockArt} from "./mocks/Mocks.sol";

/// A collection the shop could be told to allow that answers every question wrongly, one way per mode, to show
/// the gate reads "no" and never reverts whatever comes back.
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
        if (mode == 3) assembly { mstore(0, not(0)) return(0, 32) } // not an address
        return holder;
    }

    function nameOf(uint256) external view returns (string memory) {
        if (mode == 4) revert("no");
        if (mode == 5) assembly { mstore(0, 0x20) mstore(32, 1000) return(0, 64) } // a length past the end
        if (mode == 6) assembly { mstore(0, 999999) return(0, 64) } // an offset past the end
        return "Weird";
    }

    struct V {
        uint256 id;
        address owner;
        string name;
        bool started;
        uint256 alive; // a uint so a mode can answer 2
    }

    function state(uint256 id) external view returns (V memory v) {
        if (mode == 7) revert("no");
        if (mode == 11) assembly { mstore(0, 0x20) return(0, 96) } // too short to hold alive
        v = V(id, holder, "Weird", true, 1); // well formed, alive
        if (mode == 8) v.id = id + 1; // the wrong pet
        if (mode == 9) v.owner = address(0xBAD); // the wrong owner
        if (mode == 10) v.alive = 2; // alive is not a bool
        if (mode == 12) v.alive = 0; // dead
    }
}

/// The Halloween items' rule: hold a living, named pet of any collection the shop allows, one per pet, 100 in
/// all, free. The key is the pet, so walking a named pet through fresh wallets claims nothing new.
contract NamedPetGateTest is Test {
    Emogotchi cats;
    Inversegotchi brahs;
    EmogotchiItems items;
    NamedPetGate gate;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    address pool = address(0x900D);
    address treasury = makeAddr("treasury");
    address team = makeAddr("team");
    address alice = makeAddr("alice"); // cat #1, named; cat #2, named
    address bob = makeAddr("bob"); // inversebrah #1, named
    address carol = makeAddr("carol"); // cat #3, never named
    address erin = makeAddr("erin"); // nothing, to receive
    bytes svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');
    uint256 pumpkin;

    function _emogotchi(uint256 max) internal returns (Emogotchi) {
        Emogotchi.Params memory p;
        p.minter = address(this);
        p.maxSupply = max;
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
        return new Emogotchi(p);
    }

    function _create(uint32 maxSupply) internal returns (uint256) {
        EmogotchiItems.CreateParams memory c;
        c.name = "Pumpkin head";
        c.description = "A carved pumpkin your pet wears over its whole head.";
        c.svg = svg;
        c.price = 0;
        c.maxSupply = maxSupply;
        c.perKey = 1;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2;
        c.soulbound = false;
        c.gate = address(gate);
        return items.create(c);
    }

    function _catHint(uint256 id) internal view returns (bytes memory) {
        return abi.encode(address(cats), id);
    }

    function _brahHint(uint256 id) internal view returns (bytes memory) {
        return abi.encode(address(brahs), id);
    }

    function setUp() public {
        emo = new MockEMO();
        wmon = new MockWMON();
        nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        cats = _emogotchi(1000);
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
        gate = new NamedPetGate(address(items));

        cats.mintMany(alice, 2); // #1, #2
        cats.mintMany(carol, 1); // #3
        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
        vm.startPrank(alice);
        cats.setName{value: 10 ether}(1, "Kimi");
        cats.setName{value: 10 ether}(2, "Mochi");
        vm.stopPrank();
        vm.startPrank(bob);
        brahs.mint(); // #1
        brahs.setName{value: 10 ether}(1, "Frok");
        vm.stopPrank();

        pumpkin = _create(100); // the shop probes the gate with an empty hint here: it must answer
    }

    // ---------------------------------------------------------------- the rule

    function test_namedLivingCatAndFrokClaimOnceEach() public {
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(bob);
        items.claim(pumpkin, 1, _brahHint(1));
        assertEq(items.balanceOf(alice, pumpkin), 1);
        assertEq(items.balanceOf(bob, pumpkin), 1);
        // the same pet again: capped
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(pumpkin, 1, _brahHint(1));
        // more than one at a time: capped
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(pumpkin, 2, _catHint(2));
        // a second named pet in the same wallet: one more (one per pet, not per wallet)
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(2));
        assertEq(items.balanceOf(alice, pumpkin), 2);
        assertEq(items.totalSupply(pumpkin), 3);
    }

    function test_walkingAPetThroughWalletsClaimsNothingNew() public {
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(alice);
        cats.transferFrom(alice, erin, 1);
        vm.prank(erin);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(pumpkin, 1, _catHint(1));
        // and the old owner cannot use it any more either
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _catHint(1));
    }

    function test_catAndFrokWithTheSameIdAreDifferentPets() public {
        (bool okCat, bytes32 kCat) = gate.eligible(alice, _catHint(1));
        (bool okBrah, bytes32 kBrah) = gate.eligible(bob, _brahHint(1));
        assertTrue(okCat && okBrah);
        assertTrue(kCat != kBrah);
        assertEq(kCat, keccak256(abi.encode(address(cats), uint256(1))));
        assertTrue(kCat != bytes32(0) && kBrah != bytes32(0));
    }

    function test_unnamedRefused_thenNamedQualifies() public {
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _catHint(3));
        vm.deal(carol, 10 ether);
        vm.prank(carol);
        cats.setName{value: 10 ether}(3, "Late");
        vm.prank(carol);
        items.claim(pumpkin, 1, _catHint(3));
        assertEq(items.balanceOf(carol, pumpkin), 1);
    }

    function test_notTheOwnerRefused() public {
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _catHint(1)); // alice's cat
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _brahHint(1)); // bob's frok
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _catHint(999)); // no such cat
    }

    function test_deadRefused_revivedQualifies() public {
        // untouched pets starve 9 days after mint (a 7-day welcome, then 48 hours of food)
        vm.warp(block.timestamp + 10 days);
        assertFalse(cats.state(1).alive);
        assertFalse(brahs.state(1).alive);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, _brahHint(1));
        // revived: alive and still named
        vm.prank(alice);
        cats.revive{value: 1000 ether}(1);
        vm.prank(bob);
        brahs.revive(1);
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(bob);
        items.claim(pumpkin, 1, _brahHint(1));
        assertEq(items.totalSupply(pumpkin), 2);
    }

    function test_soldOutAtOneHundred() public {
        uint256 small = _create(100);
        for (uint256 i = 0; i < 100; i++) {
            address w = address(uint160(0x10000 + i));
            vm.deal(w, 10 ether);
            vm.startPrank(w);
            uint256 id = brahs.mint();
            brahs.setName{value: 10 ether}(id, "F");
            items.claim(small, 1, _brahHint(id));
            vm.stopPrank();
        }
        assertEq(items.totalSupply(small), 100);
        assertEq(items.remaining(small), 0);
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.SoldOut.selector);
        items.claim(small, 1, _brahHint(1));
        (bool ok, uint8 reason,,) = items.canClaim(small, bob, 1, _brahHint(1));
        assertFalse(ok);
        assertEq(reason, 5);
    }

    function test_freeAndTradeable() public {
        vm.prank(alice);
        vm.expectRevert();
        items.claim{value: 1}(pumpkin, 1, _catHint(1)); // free means exactly 0
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(alice);
        items.safeTransferFrom(alice, erin, pumpkin, 1, "");
        assertEq(items.balanceOf(erin, pumpkin), 1);
        assertEq(items.balanceOf(alice, pumpkin), 0);
    }

    function test_wornOnACatAndAFrok() public {
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        vm.prank(bob);
        items.claim(pumpkin, 1, _brahHint(1));
        vm.prank(alice);
        items.equip(address(cats), 1, pumpkin);
        vm.prank(bob);
        items.equip(address(brahs), 1, pumpkin);
        assertEq(items.equipped(address(cats), 1)[0], pumpkin);
        assertEq(items.equipped(address(brahs), 1)[0], pumpkin);
    }

    function test_canClaimAgreesWithClaim() public {
        (bool ok, uint8 reason, bytes32 key, uint256 due) = items.canClaim(pumpkin, alice, 1, _catHint(1));
        assertTrue(ok);
        assertEq(reason, 0);
        assertEq(key, keccak256(abi.encode(address(cats), uint256(1))));
        assertEq(due, 0);
        (bool no,, ,) = items.canClaim(pumpkin, carol, 1, _catHint(3));
        assertFalse(no);
        vm.prank(alice);
        items.claim(pumpkin, 1, _catHint(1));
        (bool again, uint8 r2,,) = items.canClaim(pumpkin, alice, 1, _catHint(1));
        assertFalse(again);
        assertEq(r2, 7);
    }

    // ---------------------------------------------------------------- hints and collections

    function test_hintShapesThatAreNotAPet() public {
        bytes[] memory bad = new bytes[](7);
        bad[0] = "";
        bad[1] = abi.encode(address(cats)); // the collection alone (the emo hair's hint)
        bad[2] = abi.encode(uint256(1)); // the id alone (the witch's hint)
        bad[3] = bytes.concat(_catHint(1), hex"00"); // 65 bytes
        bad[4] = abi.encode(uint256(uint160(address(cats))) | (uint256(1) << 200), uint256(1)); // high bits set
        bad[5] = abi.encode(address(0xBEEF), uint256(1)); // not a contract
        bad[6] = abi.encode(address(0), uint256(1));
        for (uint256 i = 0; i < bad.length; i++) {
            (bool ok, bytes32 key) = gate.eligible(alice, bad[i]);
            assertFalse(ok);
            assertEq(key, bytes32(0));
            vm.prank(alice);
            vm.expectRevert(EmogotchiItems.NotEligible.selector);
            items.claim(pumpkin, 1, bad[i]);
        }
    }

    function test_onlyCollectionsTheShopAllows_andFuturePetsJoinAutomatically() public {
        Emogotchi other = _emogotchi(10);
        other.mintMany(erin, 1);
        vm.deal(erin, 10 ether);
        vm.prank(erin);
        other.setName{value: 10 ether}(1, "Next");
        vm.prank(erin);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(pumpkin, 1, abi.encode(address(other), uint256(1)));
        items.allowCollection(address(other));
        vm.prank(erin);
        items.claim(pumpkin, 1, abi.encode(address(other), uint256(1)));
        assertEq(items.balanceOf(erin, pumpkin), 1);
    }

    function test_aCollectionThatAnswersWronglyReadsNo_neverReverts() public {
        WeirdPets weird = new WeirdPets(erin);
        items.allowCollection(address(weird));
        bytes memory hint = abi.encode(address(weird), uint256(5));
        // well formed: it qualifies (proves the modes below are what make it fail)
        (bool fine,) = gate.eligible(erin, hint);
        assertTrue(fine);
        for (uint256 m = 1; m <= 12; m++) {
            weird.setMode(m);
            (bool success, bytes memory ret) = address(gate).staticcall(abi.encodeCall(gate.eligible, (erin, hint)));
            assertTrue(success, "the gate reverted");
            (bool ok, bytes32 key) = abi.decode(ret, (bool, bytes32));
            assertFalse(ok);
            assertEq(key, bytes32(0));
        }
    }

    function test_theShopsProbeGetsACheapAnswer() public view {
        uint256 g = gasleft();
        (bool ok, bytes32 key) = gate.eligible(address(this), "");
        uint256 used = g - gasleft();
        assertFalse(ok);
        assertEq(key, bytes32(0));
        assertLt(used, 20_000);
    }

    function test_constructorRefusesNoShop() public {
        vm.expectRevert(NamedPetGate.ZeroAddress.selector);
        new NamedPetGate(address(0));
    }

    /// Whatever the hint, the gate answers in shape and never reverts.
    function testFuzz_neverReverts(address who, bytes calldata data) public view {
        (bool success, bytes memory ret) = address(gate).staticcall(abi.encodeCall(gate.eligible, (who, data)));
        assertTrue(success);
        assertEq(ret.length, 64);
    }

    function testFuzz_neverRevertsOnAPetShapedHint(address who, uint256 id, uint8 which) public view {
        address col = which % 3 == 0 ? address(cats) : which % 3 == 1 ? address(brahs) : address(items);
        (bool success, bytes memory ret) =
            address(gate).staticcall(abi.encodeCall(gate.eligible, (who, abi.encode(col, id))));
        assertTrue(success);
        (bool ok,) = abi.decode(ret, (bool, bytes32));
        if (ok) {
            assertTrue((col == address(cats) && who == alice && (id == 1 || id == 2)) || (col == address(brahs) && who == bob && id == 1));
        }
    }
}
