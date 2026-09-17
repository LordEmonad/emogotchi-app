// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedCatGate} from "../src/gates/NamedCatGate.sol";
import {HoldsGate} from "../src/gates/HoldsGate.sol";
import {MockEMO, MockWMON, MockNad, MockArt} from "./mocks/Mocks.sol";

contract Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}

contract NotAReceiver {}

/// @dev A gate with the old one-value ABI: answers, but in the wrong shape.
contract OldShapeGate {
    function eligible(address, bytes calldata) external pure returns (bool) {
        return true;
    }
}

/// @dev Well-formed on the empty probe, wrong shape once real data arrives.
contract ShapeShiftGate {
    function eligible(address, bytes calldata data) external pure returns (bool, bytes32) {
        if (data.length == 0) return (true, bytes32(uint256(1)));
        assembly {
            mstore(0, 1)
            return(0, 32)
        }
    }
}

/// @dev Answers with a bool word that is neither 0 nor 1: abi.decode would revert on it.
contract DirtyBoolGate {
    function eligible(address, bytes calldata) external pure returns (bool, bytes32) {
        assembly {
            mstore(0, 2)
            mstore(32, 1)
            return(0, 64)
        }
    }
}

contract ZeroKeyGate {
    function eligible(address, bytes calldata) external pure returns (bool, bytes32) {
        return (true, 0);
    }
}

contract Sink {
    address public lastFrom;
    uint256 public lastId;
    uint256 public lastQty;
    bytes public lastData;

    function onItemUsed(address from, uint256 id, uint256 qty, bytes calldata data) external returns (bytes4) {
        lastFrom = from;
        lastId = id;
        lastQty = qty;
        lastData = data;
        return this.onItemUsed.selector;
    }
}

contract BadSink {
    function onItemUsed(address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xdeadbeef;
    }
}

/// @dev Re-enters claim from the receive hook; the guard must stop it.
contract Reenterer {
    EmogotchiItems items;
    uint256 id;

    function go(EmogotchiItems i, uint256 itemId) external {
        items = i;
        id = itemId;
        items.claim(id, 1, "");
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        items.claim(id, 1, "");
        return this.onERC1155Received.selector;
    }
}

contract ItemsTest is Test {
    Emogotchi game;
    EmogotchiItems items;
    NamedCatGate named;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    address pool = address(0x900D);
    address treasury = makeAddr("treasury");
    address team = makeAddr("team");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    bytes svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');

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
        game = new Emogotchi(p);

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
        named = new NamedCatGate(address(game));
        items.allowCollection(address(game));

        game.mintMany(alice, 3); // cats 1, 2, 3
        game.mintMany(bob, 1); // cat 4
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
        vm.prank(alice);
        game.setName{value: 10 ether}(1, "Salem");
    }

    function _params(string memory name) internal view returns (EmogotchiItems.CreateParams memory c) {
        c.name = name;
        c.description = "A costume.";
        c.svg = svg;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 1;
    }

    function _witch() internal returns (uint256 id) {
        EmogotchiItems.CreateParams memory c = _params("Witch outfit");
        c.maxSupply = 1000;
        c.perKey = 1;
        c.gate = address(named);
        id = items.create(c);
    }

    // ---------------------------------------------------------------- creating
    function test_createOnlyCurator() public {
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotCurator.selector);
        items.create(_params("x"));
    }

    function test_createValidates() public {
        EmogotchiItems.CreateParams memory c = _params("");
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        c = _params("x");
        c.svg = "";
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        c = _params("x");
        c.kind = EmogotchiItems.Kind.None;
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        c = _params("x");
        c.opens = 100;
        c.closes = 100;
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
    }

    function test_createStoresRulesAndArt() public {
        uint256 id = _witch();
        assertEq(id, 1);
        EmogotchiItems.Item memory it = items.item(1);
        assertEq(it.maxSupply, 1000);
        assertEq(it.perKey, 1);
        assertEq(it.gate, address(named));
        assertEq(items.imageOf(1), string(svg));
        assertEq(items.remaining(1), 1000);
    }

    // ---------------------------------------------------------------- claiming
    function test_claimWitch_needsANamedCat() public {
        uint256 id = _witch();
        vm.prank(bob); // bob's cat 4 has no name
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, "");
        vm.prank(alice); // scan path
        items.claim(id, 1, "");
        assertEq(items.balanceOf(alice, id), 1);
        vm.prank(alice); // one per wallet
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(id, 1, "");
    }

    function test_claimWitch_hintPath() public {
        uint256 id = _witch();
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, abi.encode(uint256(2))); // cat 2 is alice's but unnamed
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, abi.encode(uint256(1))); // cat 1 is named, but not bob's
        vm.prank(alice);
        items.claim(id, 1, abi.encode(uint256(1)));
        assertEq(items.balanceOf(alice, id), 1);
    }

    function test_claimSupplyCapAndRemaining() public {
        EmogotchiItems.CreateParams memory c = _params("Two only");
        c.maxSupply = 2;
        uint256 id = items.create(c);
        vm.prank(alice);
        items.claim(id, 2, "");
        assertEq(items.remaining(id), 0);
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.SoldOut.selector);
        items.claim(id, 1, "");
    }

    function test_claimWindow() public {
        // vm.getBlockTimestamp, not block.timestamp: via_ir memoises the latter inside a test function
        uint256 t0 = vm.getBlockTimestamp();
        EmogotchiItems.CreateParams memory c = _params("Later");
        c.opens = uint64(t0 + 1 days);
        c.closes = uint64(t0 + 2 days);
        uint256 id = items.create(c);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotOpenYet.selector);
        items.claim(id, 1, "");
        vm.warp(t0 + 1 days);
        vm.prank(alice);
        items.claim(id, 1, "");
        vm.warp(t0 + 2 days);
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.Closed.selector);
        items.claim(id, 1, "");
    }

    function test_claimPaid_splitsLikeTheGame_andBurns() public {
        EmogotchiItems.CreateParams memory c = _params("Gold hat");
        c.price = 5 ether;
        uint256 id = items.create(c);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 5 ether, 1 ether));
        items.claim{value: 1 ether}(id, 1, "");
        vm.prank(alice);
        items.claim{value: 10 ether}(id, 2, "");
        assertEq(items.pendingBurnMon(), 8 ether);
        assertEq(items.treasuryOwed(), 1 ether);
        assertEq(items.teamOwed(), 1 ether);

        uint256 deadBefore = emo.balanceOf(items.BURN_ADDRESS());
        items.crankBurn(type(uint256).max, 0);
        assertGt(emo.balanceOf(items.BURN_ADDRESS()), deadBefore);
        assertEq(items.pendingBurnMon(), 0);
        assertEq(items.totalMonBurned(), 8 ether);

        items.sweep();
        assertEq(treasury.balance, 1 ether);
        assertEq(team.balance, 1 ether);
        assertEq(address(items).balance, 0);
    }

    function test_skimQueuesStrayMon() public {
        vm.prank(alice);
        (bool ok,) = address(items).call{value: 3 ether}("");
        assertTrue(ok);
        items.skim();
        assertEq(items.pendingBurnMon(), 3 ether);
    }

    // ---------------------------------------------------------------- seal and grant
    function test_sealStopsClaimsAndGrants() public {
        uint256 id = _witch();
        items.seal(id);
        assertEq(items.remaining(id), 0);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.IsSealed.selector);
        items.claim(id, 1, "");
        address[] memory to = new address[](1);
        to[0] = bob;
        vm.expectRevert(EmogotchiItems.IsSealed.selector);
        items.grant(id, to, 1);
        vm.expectRevert(EmogotchiItems.IsSealed.selector);
        items.seal(id);
    }

    function test_grantWithinSupply_ignoresRules() public {
        EmogotchiItems.CreateParams memory c = _params("Three");
        c.maxSupply = 3;
        c.gate = address(named);
        c.price = 1 ether;
        uint256 id = items.create(c);
        address[] memory to = new address[](2);
        to[0] = bob; // no named cat, no MON sent: grant does not care
        to[1] = carol;
        items.grant(id, to, 1);
        assertEq(items.balanceOf(bob, id), 1);
        assertEq(items.remaining(id), 1);
        vm.expectRevert(EmogotchiItems.SoldOut.selector);
        items.grant(id, to, 1);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotCurator.selector);
        items.grant(id, to, 1);
    }

    // ---------------------------------------------------------------- equipping
    function test_equipRules() public {
        uint256 witch = _witch();
        EmogotchiItems.CreateParams memory c = _params("Snack");
        c.kind = EmogotchiItems.Kind.Consumable;
        uint256 snack = items.create(c);
        vm.startPrank(alice);
        items.claim(witch, 1, "");
        items.claim(snack, 1, "");
        vm.expectRevert(EmogotchiItems.CollectionNotAllowed.selector);
        items.equip(address(0xBEEF), 1, witch);
        vm.expectRevert(EmogotchiItems.NotOwner.selector);
        items.equip(address(game), 4, witch); // bob's cat
        vm.expectRevert(EmogotchiItems.NotEquippable.selector);
        items.equip(address(game), 1, snack); // consumables are spent, not worn
        items.equip(address(game), 1, witch);
        items.equip(address(game), 1, witch); // twice is fine
        items.equip(address(game), 2, witch); // any cat in the wallet can wear it
        vm.stopPrank();
        assertEq(items.equipped(address(game), 1).length, 1);
        assertEq(items.equipped(address(game), 2)[0], witch);
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotHolder.selector);
        items.equip(address(game), 4, witch);
    }

    function test_equippedSelfHeals_whenTheItemOrTheCatMoves() public {
        uint256 witch = _witch();
        vm.startPrank(alice);
        items.claim(witch, 1, "");
        items.equip(address(game), 1, witch);
        items.safeTransferFrom(alice, bob, witch, 1, ""); // sold the outfit
        vm.stopPrank();
        assertEq(items.equipped(address(game), 1).length, 0);
        vm.prank(bob);
        items.safeTransferFrom(bob, alice, witch, 1, ""); // bought it back
        assertEq(items.equipped(address(game), 1).length, 1);
        vm.prank(alice);
        game.transferFrom(alice, carol, 1); // sold the cat, kept the outfit
        assertEq(items.equipped(address(game), 1).length, 0);
    }

    function test_unequip_andOrder() public {
        uint256 a = _witch();
        EmogotchiItems.CreateParams memory c = _params("Bat");
        c.kind = EmogotchiItems.Kind.Scene;
        uint256 b = items.create(c);
        c = _params("Moon");
        c.kind = EmogotchiItems.Kind.Scene;
        uint256 m = items.create(c);
        vm.startPrank(alice);
        items.claim(a, 1, "");
        items.claim(b, 1, "");
        items.claim(m, 1, "");
        items.equip(address(game), 1, a);
        items.equip(address(game), 1, b);
        items.equip(address(game), 1, m);
        assertEq(items.equipped(address(game), 1).length, 3);
        items.unequip(address(game), 1, a); // remove from the front; the set stays consistent
        uint256[] memory on = items.equipped(address(game), 1);
        assertEq(on.length, 2);
        assertTrue((on[0] == b && on[1] == m) || (on[0] == m && on[1] == b));
        vm.expectRevert(EmogotchiItems.NotEquipped.selector);
        items.unequip(address(game), 1, a);
        items.equip(address(game), 1, a);
        assertEq(items.equipped(address(game), 1).length, 3);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotOwner.selector);
        items.unequip(address(game), 1, b);
    }

    function test_tooManyEquipped() public {
        vm.startPrank(address(this));
        uint256[] memory ids = new uint256[](17);
        for (uint256 i = 0; i < 17; i++) {
            EmogotchiItems.CreateParams memory c = _params("Thing");
            c.kind = EmogotchiItems.Kind.Scene;
            ids[i] = items.create(c);
        }
        vm.stopPrank();
        vm.startPrank(alice);
        for (uint256 i = 0; i < 17; i++) {
            items.claim(ids[i], 1, "");
            if (i < 16) items.equip(address(game), 1, ids[i]);
        }
        vm.expectRevert(EmogotchiItems.TooManyEquipped.selector);
        items.equip(address(game), 1, ids[16]);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- transfers, soulbound, consuming
    function test_soulbound_blocksTransfer_allowsConsume() public {
        EmogotchiItems.CreateParams memory c = _params("Badge");
        c.soulbound = true;
        uint256 id = items.create(c);
        vm.startPrank(alice);
        items.claim(id, 1, "");
        vm.expectRevert(EmogotchiItems.Soulbound.selector);
        items.safeTransferFrom(alice, bob, id, 1, "");
        items.consume(alice, id, 1);
        vm.stopPrank();
        assertEq(items.balanceOf(alice, id), 0);
    }

    function test_consume_byHolderOrOperator() public {
        EmogotchiItems.CreateParams memory c = _params("Potion");
        c.kind = EmogotchiItems.Kind.Consumable;
        uint256 id = items.create(c);
        vm.prank(alice);
        items.claim(id, 3, "");
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotApproved.selector);
        items.consume(alice, id, 1);
        vm.prank(alice);
        items.setApprovalForAll(bob, true); // bob is the mechanics contract
        vm.prank(bob);
        items.consume(alice, id, 2);
        assertEq(items.balanceOf(alice, id), 1);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.Insufficient.selector);
        items.consume(alice, id, 2);
    }

    function test_transfers_andReceiverChecks() public {
        uint256 id = _witch();
        vm.prank(alice);
        items.claim(id, 1, "");
        Receiver r = new Receiver();
        NotAReceiver n = new NotAReceiver();
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.BadReceiver.selector);
        items.safeTransferFrom(alice, address(n), id, 1, "");
        vm.prank(alice);
        items.safeTransferFrom(alice, address(r), id, 1, "");
        assertEq(items.balanceOf(address(r), id), 1);
        vm.prank(bob);
        vm.expectRevert(EmogotchiItems.NotApproved.selector);
        items.safeTransferFrom(address(r), bob, id, 1, "");
    }

    function test_claimFromAContract_needsAReceiver_andNoReentry() public {
        EmogotchiItems.CreateParams memory c = _params("Open");
        uint256 id = items.create(c);
        NotAReceiver n = new NotAReceiver();
        vm.prank(address(n));
        vm.expectRevert(EmogotchiItems.BadReceiver.selector);
        items.claim(id, 1, "");
        Reenterer r = new Reenterer();
        vm.expectRevert(EmogotchiItems.BadReceiver.selector); // the inner claim hit the guard, so the hook reverted
        r.go(items, id);
        assertEq(items.balanceOf(address(r), id), 0);
    }

    function test_batchTransfer() public {
        uint256 a = _witch();
        EmogotchiItems.CreateParams memory c = _params("Bat");
        c.kind = EmogotchiItems.Kind.Scene;
        uint256 b = items.create(c);
        vm.startPrank(alice);
        items.claim(a, 1, "");
        items.claim(b, 2, "");
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256[] memory vals = new uint256[](2);
        vals[0] = 1;
        vals[1] = 2;
        items.safeBatchTransferFrom(alice, bob, ids, vals, "");
        vm.stopPrank();
        address[] memory who = new address[](2);
        who[0] = bob;
        who[1] = bob;
        uint256[] memory bal = items.balanceOfBatch(who, ids);
        assertEq(bal[0], 1);
        assertEq(bal[1], 2);
    }

    // ---------------------------------------------------------------- metadata, royalties, interfaces
    function test_metadataOnChain() public {
        uint256 id = _witch();
        string memory j = items.metadata(id);
        assertTrue(_has(j, '"name":"Witch outfit"'));
        assertTrue(_has(j, '"image":"data:image/svg+xml;base64,'));
        assertTrue(_has(j, '"trait_type":"kind","value":"cosmetic"'));
        assertTrue(_has(j, '"max supply","value":1000'));
        assertFalse(_has(j, '"minted"'));
        assertTrue(_has(items.uri(id), "data:application/json;base64,"));
        assertTrue(_has(items.contractURI(), "data:application/json;base64,"));
        assertEq(items.imageOf(id), string(svg));
    }

    function test_metadataEscapesQuotes() public {
        EmogotchiItems.CreateParams memory c = _params('Say "boo"');
        uint256 id = items.create(c);
        assertTrue(_has(items.metadata(id), '"name":"Say \\"boo\\""'));
    }

    function test_royaltyAndInterfaces() public view {
        (address to, uint256 amt) = items.royaltyInfo(1, 100 ether);
        assertEq(to, treasury);
        assertEq(amt, 5 ether);
        assertTrue(items.supportsInterface(0xd9b67a26));
        assertTrue(items.supportsInterface(0x0e89341c));
        assertTrue(items.supportsInterface(0x2a55205a));
        assertTrue(items.supportsInterface(0x01ffc9a7));
        assertFalse(items.supportsInterface(0xffffffff));
    }

    // ---------------------------------------------------------------- the curator
    function test_curatorTransferAndRenounce() public {
        items.setCurator(alice);
        vm.expectRevert(EmogotchiItems.NotCurator.selector);
        items.create(_params("x"));
        vm.prank(alice);
        items.create(_params("x"));
        vm.prank(alice);
        items.renounceCurator();
        assertEq(items.curator(), address(0));
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotCurator.selector);
        items.create(_params("y"));
    }

    function test_holdsGate() public {
        HoldsGate two = new HoldsGate(address(game), 2);
        EmogotchiItems.CreateParams memory c = _params("For two-cat households");
        c.gate = address(two);
        uint256 id = items.create(c);
        vm.prank(bob); // one cat
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, "");
        vm.prank(alice); // three
        items.claim(id, 1, "");
    }

    // ---------------------------------------------------------------- from the audit
    function test_hugeClaimCannotKillAnUnlimitedItem() public {
        EmogotchiItems.CreateParams memory c = _params("Free badge"); // unlimited, uncapped, free
        uint256 id = items.create(c);
        vm.prank(bob);
        items.claim(id, type(uint32).max, "");
        vm.prank(alice); // the counter is 64-bit now; the item lives on
        items.claim(id, 1, "");
        assertEq(items.balanceOf(alice, id), 1);
    }

    function test_grantRejectsZeroAndCountsRight() public {
        EmogotchiItems.CreateParams memory c = _params("Unlimited");
        uint256 id = items.create(c);
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = address(0);
        vm.expectRevert(EmogotchiItems.ZeroAddress.selector);
        items.grant(id, to, 1);
        to[1] = carol;
        items.grant(id, to, type(uint32).max);
        assertEq(items.item(id).minted, uint256(type(uint32).max) * 2);
    }

    function test_gateAndCollectionMustBeContracts() public {
        EmogotchiItems.CreateParams memory c = _params("x");
        c.gate = makeAddr("eoa");
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.allowCollection(makeAddr("eoa2"));
    }

    function test_namedGate_badHintIsNotEligible() public {
        uint256 id = _witch();
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, abi.encode(uint256(999_999)));
    }

    function test_metadataEscapesControlCharacters() public {
        EmogotchiItems.CreateParams memory c = _params("line\nbreak");
        uint256 id = items.create(c);
        assertTrue(_has(items.metadata(id), '"name":"line\\u000abreak"'));
    }

    function test_unequipLastElement() public {
        uint256 a = _witch();
        EmogotchiItems.CreateParams memory c = _params("Bat");
        c.kind = EmogotchiItems.Kind.Scene;
        uint256 b = items.create(c);
        vm.startPrank(alice);
        items.claim(a, 1, "");
        items.claim(b, 1, "");
        items.equip(address(game), 1, a);
        items.equip(address(game), 1, b);
        items.unequip(address(game), 1, b); // the last one
        uint256[] memory on = items.equipped(address(game), 1);
        assertEq(on.length, 1);
        assertEq(on[0], a);
        items.equip(address(game), 1, b);
        assertEq(items.equipped(address(game), 1).length, 2);
        vm.stopPrank();
    }

    function test_pruneClearsWhatTheNewOwnerDoesNotHold() public {
        uint256 a = _witch();
        vm.startPrank(alice);
        items.claim(a, 1, "");
        items.equip(address(game), 1, a);
        game.transferFrom(alice, carol, 1); // carol gets the cat, not the outfit
        vm.stopPrank();
        assertEq(items.equipped(address(game), 1).length, 0);
        vm.prank(bob); // anyone
        items.prune(address(game), 1);
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.NotEquipped.selector);
        items.unequip(address(game), 1, a); // it is really gone, not just hidden
    }

    function _paid8() internal returns (uint256 id) {
        EmogotchiItems.CreateParams memory c = _params("Paid");
        c.price = 10 ether;
        id = items.create(c);
        vm.prank(alice);
        items.claim{value: 10 ether}(id, 1, "");
        assertEq(items.pendingBurnMon(), 8 ether);
    }

    function test_crankFallback_onlyAfterTheSwapPathStayedBroken() public {
        _paid8();
        assertFalse(items.swapPathBroken());
        vm.expectRevert(EmogotchiItems.NothingToDo.selector);
        items.crankFallback(type(uint256).max);
        nad.setLensRouter(makeAddr("newRouter")); // nad.fun moved on
        assertTrue(items.swapPathBroken());
        items.crankBurn(type(uint256).max, 0); // queues, burns nothing
        assertEq(items.pendingBurnMon(), 8 ether);
        vm.expectRevert(EmogotchiItems.FallbackNotReady.selector); // nobody has noted it yet
        items.crankFallback(type(uint256).max);
        items.noteSwapPath();
        assertEq(items.brokenSince(), vm.getBlockTimestamp());
        vm.expectRevert(EmogotchiItems.FallbackNotReady.selector); // and the clock has not run
        items.crankFallback(type(uint256).max);
        vm.warp(vm.getBlockTimestamp() + items.FALLBACK_DELAY());
        uint256 dead = items.BURN_ADDRESS().balance;
        items.crankFallback(type(uint256).max);
        assertEq(items.pendingBurnMon(), 0);
        assertEq(items.BURN_ADDRESS().balance, dead + 8 ether);
        assertEq(items.totalMonBurned(), 8 ether);
    }

    /// @dev Audit: a one-block Lens outage used to let anyone send the whole queue to 0xdEaD as MON.
    function test_crankFallback_transientOutageCannotDivertTheBurn() public {
        _paid8();
        vm.mockCallRevert(address(nad), abi.encodeWithSelector(nad.getAmountOut.selector), "down");
        assertTrue(items.swapPathBroken());
        items.noteSwapPath();
        vm.expectRevert(EmogotchiItems.FallbackNotReady.selector);
        items.crankFallback(type(uint256).max);
        vm.clearMockedCalls(); // back next block
        vm.warp(vm.getBlockTimestamp() + items.FALLBACK_DELAY());
        vm.expectRevert(EmogotchiItems.NothingToDo.selector); // the path works, so no fallback
        items.crankFallback(type(uint256).max);
        items.noteSwapPath(); // anyone can clear the clock
        assertEq(items.brokenSince(), 0);
        // and a working burn clears it too
        items.noteSwapPath();
        vm.mockCallRevert(address(nad), abi.encodeWithSelector(nad.getAmountOut.selector), "down");
        items.noteSwapPath();
        assertGt(items.brokenSince(), 0);
        vm.clearMockedCalls();
        items.crankBurn(type(uint256).max, 0);
        assertEq(items.brokenSince(), 0);
        assertEq(items.pendingBurnMon(), 0);
    }

    /// @dev Audit: an emptied pool re-queued every crank and never counted as broken, locking the MON.
    function test_emptyPoolCountsAsBroken() public {
        _paid8();
        nad.setReserves(0, 0);
        assertTrue(items.swapPathBroken());
        vm.expectRevert(EmogotchiItems.NothingToDo.selector); // nothing can be pushed, so nothing to do
        items.crankBurn(type(uint256).max, 0);
        items.noteSwapPath();
        vm.warp(vm.getBlockTimestamp() + items.FALLBACK_DELAY());
        items.crankFallback(type(uint256).max);
        assertEq(items.pendingBurnMon(), 0);
    }

    /// @dev Audit: a backlog above the impact guard burned nothing with maxMon = max; now it burns a slice.
    function test_crankBurn_clampsToTheGuard() public {
        EmogotchiItems.CreateParams memory c = _params("Paid");
        c.price = 100 ether;
        uint256 id = items.create(c);
        vm.prank(alice);
        items.claim{value: 100 ether}(id, 1, "");
        assertEq(items.pendingBurnMon(), 80 ether);
        nad.setReserves(1000 ether, 42_000_000 ether); // guard: 0.5% of 1000 = 5 MON per crank
        items.crankBurn(type(uint256).max, 0);
        assertEq(items.pendingBurnMon(), 75 ether);
        assertEq(items.totalMonBurned(), 5 ether);
    }

    /// @dev Audit: the per-wallet cap was drainable by walking one named cat through fresh wallets.
    ///      The cap is per key now, and NamedCatGate keys on the cat.
    function test_perKey_oneWitchPerNamedCat_notPerWallet() public {
        uint256 witch = _witch();
        vm.prank(alice);
        items.claim(witch, 1, abi.encode(1));
        vm.prank(alice);
        game.transferFrom(alice, carol, 1); // cat 1 (named) moves to a fresh wallet
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.CapReached.selector); // the cat already claimed
        items.claim(witch, 1, abi.encode(1));
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.CapReached.selector); // the scan finds the same cat
        items.claim(witch, 1, "");
        assertEq(items.claimedBy(witch, bytes32(uint256(1))), 1);
        // naming a second cat (10 MON) earns a second one: the cap is one per named cat
        vm.prank(alice);
        game.setName{value: 10 ether}(2, "Binx");
        vm.prank(alice);
        items.claim(witch, 1, abi.encode(2));
        assertEq(items.balanceOf(alice, witch), 2);
        // a gate-less item keys on the wallet
        EmogotchiItems.CreateParams memory c = _params("Badge");
        c.perKey = 1;
        uint256 badge = items.create(c);
        vm.prank(alice);
        items.claim(badge, 1, "");
        assertEq(items.claimedBy(badge, bytes32(uint256(uint160(alice)))), 1);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.CapReached.selector);
        items.claim(badge, 1, "");
    }

    /// @dev Audit: a 32-bit per-wallet counter locked a wallet out of an unlimited item after 2^32-1 claims.
    function test_claimedByIs64Bit() public {
        EmogotchiItems.CreateParams memory c = _params("Free badge");
        uint256 id = items.create(c);
        vm.startPrank(bob);
        items.claim(id, type(uint32).max, "");
        items.claim(id, type(uint32).max, "");
        vm.stopPrank();
        assertEq(items.claimedBy(id, bytes32(uint256(uint160(bob)))), 2 * uint256(type(uint32).max));
    }

    /// @dev Audit: a gate that cannot answer made an item unclaimable for life with an empty revert.
    function test_gateMustAnswer_andARevertingGateIsNotEligible() public {
        EmogotchiItems.CreateParams memory c = _params("x");
        c.gate = address(items); // a contract with no eligible()
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        uint256 witch = _witch();
        vm.mockCallRevert(address(named), abi.encodeWithSelector(named.eligible.selector), "boom");
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(witch, 1, abi.encode(1));
    }

    /// @dev Audit: equipped() reverted for a collection without code or with a malformed ownerOf.
    function test_equippedNeverReverts() public {
        assertEq(items.equipped(makeAddr("nothing"), 1).length, 0);
        uint256 witch = _witch();
        vm.startPrank(alice);
        items.claim(witch, 1, "");
        items.equip(address(game), 1, witch);
        vm.stopPrank();
        assertEq(items.equipped(address(game), 1).length, 1);
        vm.mockCall(address(game), abi.encodeWithSelector(game.ownerOf.selector, 1), "");
        assertEq(items.equipped(address(game), 1).length, 0);
        vm.mockCall(address(game), abi.encodeWithSelector(game.ownerOf.selector, 1), abi.encode(type(uint256).max));
        assertEq(items.equipped(address(game), 1).length, 0);
        vm.clearMockedCalls();
        assertEq(items.equipped(address(game), 1).length, 1);
    }

    /// @dev Audit: equip state was keyed on the pet alone, so a stranger who bought the pet and later
    ///      any copy of the item found it dressed with no equip of their own. It is per owner now.
    function test_equipIsPerOwner() public {
        uint256 witch = _witch();
        vm.startPrank(alice);
        items.claim(witch, 1, "");
        items.equip(address(game), 1, witch);
        game.transferFrom(alice, carol, 1); // kept the outfit, sold the cat
        vm.stopPrank();
        address[] memory to = new address[](1);
        to[0] = carol;
        items.grant(witch, to, 1); // carol gets her own copy
        assertEq(items.equipped(address(game), 1).length, 0); // and the cat is still bare for her
        vm.prank(carol);
        vm.expectRevert(EmogotchiItems.NotEquipped.selector);
        items.unequip(address(game), 1, witch);
        vm.prank(carol);
        items.equip(address(game), 1, witch);
        assertEq(items.equipped(address(game), 1).length, 1);
        vm.prank(carol);
        game.transferFrom(carol, alice, 1); // alice buys the cat back: her outfit is still on
        assertEq(items.equipped(address(game), 1)[0], witch);
    }

    /// @dev Round 3: try/catch does not catch a malformed answer, so a gate with the wrong ABI shape
    ///      used to revert with nothing at create and at claim.
    function test_gateShapeIsChecked_atCreateAndAtClaim() public {
        EmogotchiItems.CreateParams memory c = _params("x");
        c.gate = address(new OldShapeGate());
        vm.expectRevert(EmogotchiItems.BadParams.selector);
        items.create(c);
        c.gate = address(new ShapeShiftGate());
        uint256 id = items.create(c); // passes the probe
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector); // but never an empty revert
        items.claim(id, 1, abi.encode(1));
        vm.prank(alice);
        items.claim(id, 1, ""); // the empty hint still answers in shape
        assertEq(items.balanceOf(alice, id), 1);
    }

    /// @dev Ultrafuzz (2026-09-17): a gate answering with a dirty bool word made abi.decode revert raw.
    function test_dirtyBoolGateIsNotEligible() public {
        EmogotchiItems.CreateParams memory c = _params("x");
        c.gate = address(new DirtyBoolGate());
        vm.expectRevert(EmogotchiItems.BadParams.selector); // the probe already refuses it
        items.create(c);
        uint256 witch = _witch();
        vm.mockCall(
            address(named), abi.encodeWithSelector(named.eligible.selector), abi.encode(uint256(2), bytes32(uint256(1)))
        );
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector); // and a live gate turning dirty reads as no
        items.claim(witch, 1, abi.encode(1));
        (bool ok, uint8 reason,,) = items.canClaim(witch, alice, 1, abi.encode(1));
        assertFalse(ok);
        assertEq(reason, 6);
    }

    /// @dev Round 3: a gate returning key 0 would have collapsed the per-key cap into one global cap.
    function test_zeroKeyIsNotEligible() public {
        EmogotchiItems.CreateParams memory c = _params("x");
        c.gate = address(new ZeroKeyGate());
        c.perKey = 1;
        uint256 id = items.create(c);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(id, 1, "");
        (bool ok, uint8 reason,,) = items.canClaim(id, alice, 1, "");
        assertFalse(ok);
        assertEq(reason, 6);
    }

    /// @dev Round 3: a recovery nobody cranked through did not stop the fallback clock; claims do now.
    function test_claimStopsTheFallbackClock() public {
        uint256 id = _paid8();
        vm.mockCallRevert(address(nad), abi.encodeWithSelector(nad.getAmountOut.selector), "down");
        items.noteSwapPath();
        assertGt(items.brokenSince(), 0);
        vm.clearMockedCalls();
        vm.prank(bob);
        items.claim{value: 10 ether}(id, 1, ""); // any claim while the path works
        assertEq(items.brokenSince(), 0);
        vm.warp(vm.getBlockTimestamp() + items.FALLBACK_DELAY());
        vm.mockCallRevert(address(nad), abi.encodeWithSelector(nad.getAmountOut.selector), "down");
        vm.expectRevert(EmogotchiItems.FallbackNotReady.selector);
        items.crankFallback(type(uint256).max);
    }

    function test_canClaimExplains() public {
        uint256 witch = _witch();
        (bool ok, uint8 reason, bytes32 key, uint256 due) = items.canClaim(witch, alice, 1, abi.encode(1));
        assertTrue(ok);
        assertEq(reason, 0);
        assertEq(key, bytes32(uint256(1)));
        assertEq(due, 0);
        (ok, reason,,) = items.canClaim(witch, bob, 1, abi.encode(4)); // unnamed
        assertEq(reason, 6);
        (ok, reason,,) = items.canClaim(99, alice, 1, "");
        assertEq(reason, 1);
        vm.prank(alice);
        items.claim(witch, 1, abi.encode(1));
        (ok, reason, key,) = items.canClaim(witch, alice, 1, abi.encode(1));
        assertEq(reason, 7);
        assertEq(key, bytes32(uint256(1)));
        items.seal(witch);
        (ok, reason,,) = items.canClaim(witch, alice, 1, abi.encode(1));
        assertEq(reason, 2);
        EmogotchiItems.CreateParams memory c = _params("Later");
        c.opens = uint64(vm.getBlockTimestamp() + 1 days);
        c.closes = uint64(vm.getBlockTimestamp() + 2 days);
        c.price = 1 ether;
        c.maxSupply = 1;
        uint256 later = items.create(c);
        (ok, reason,, due) = items.canClaim(later, alice, 1, "");
        assertEq(reason, 3);
        assertEq(due, 1 ether);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        (ok, reason,,) = items.canClaim(later, alice, 2, "");
        assertEq(reason, 5);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        (ok, reason,,) = items.canClaim(later, alice, 1, "");
        assertEq(reason, 4);
    }

    function test_equipMany_andPassiveBinds() public {
        EmogotchiItems.CreateParams memory c = _params("Autofeeder ticket");
        c.kind = EmogotchiItems.Kind.Passive;
        uint256 ticket = items.create(c);
        uint256 witch = _witch();
        vm.startPrank(alice);
        items.claim(witch, 1, abi.encode(1));
        items.claim(ticket, 1, "");
        uint256[] memory cats = new uint256[](3);
        cats[0] = 1;
        cats[1] = 2;
        cats[2] = 3;
        items.equipMany(address(game), cats, witch); // one copy, every cat
        items.equip(address(game), 1, ticket); // a passive item binds to a pet
        vm.stopPrank();
        uint256[][] memory many = items.equippedMany(address(game), cats);
        assertEq(many[0].length, 2);
        assertEq(many[1].length, 1);
        assertEq(many[2][0], witch);
        cats[2] = 4; // bob's cat in the list
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotOwner.selector);
        items.equipMany(address(game), cats, witch);
        c = _params("Snack");
        c.kind = EmogotchiItems.Kind.Consumable;
        uint256 snack = items.create(c);
        vm.startPrank(alice);
        items.claim(snack, 1, "");
        vm.expectRevert(EmogotchiItems.NotEquippable.selector);
        items.equip(address(game), 1, snack);
        vm.stopPrank();
    }

    function test_use_spendsOnASink_withoutApproval() public {
        EmogotchiItems.CreateParams memory c = _params("Snack");
        c.kind = EmogotchiItems.Kind.Consumable;
        c.soulbound = true;
        uint256 snack = items.create(c);
        Sink sink = new Sink();
        BadSink bad = new BadSink();
        vm.startPrank(alice);
        items.claim(snack, 3, "");
        items.use(snack, 2, address(sink), hex"c0ffee");
        assertEq(sink.lastFrom(), alice);
        assertEq(sink.lastId(), snack);
        assertEq(sink.lastQty(), 2);
        assertEq(sink.lastData(), hex"c0ffee");
        assertEq(items.balanceOf(alice, snack), 1);
        assertEq(items.burned(snack), 2);
        assertEq(items.totalSupply(snack), 1);
        assertTrue(items.exists(snack));
        assertFalse(items.exists(snack + 1));
        vm.expectRevert(EmogotchiItems.BadSink.selector);
        items.use(snack, 1, address(bad), "");
        vm.expectRevert(EmogotchiItems.BadSink.selector);
        items.use(snack, 1, bob, ""); // no code
        vm.expectRevert(EmogotchiItems.Insufficient.selector);
        items.use(snack, 2, address(sink), "");
        items.consume(alice, snack, 1);
        assertEq(items.totalSupply(snack), 0);
        vm.stopPrank();
    }

    function test_holdingsAndCatalogue() public {
        uint256 witch = _witch();
        EmogotchiItems.CreateParams memory c = _params("Badge");
        uint256 badge = items.create(c);
        vm.startPrank(alice);
        items.claim(witch, 1, abi.encode(1));
        items.claim(badge, 4, "");
        vm.stopPrank();
        (uint256[] memory ids, uint256[] memory bals) = items.holdings(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], witch);
        assertEq(bals[1], 4);
        (ids,) = items.holdings(bob);
        assertEq(ids.length, 0);
        EmogotchiItems.Item[] memory cat = items.catalogue(1, 2);
        assertEq(cat[0].name, "Witch outfit");
        assertEq(cat[1].minted, 4);
        vm.expectRevert(EmogotchiItems.NoItem.selector);
        items.catalogue(1, 3);
        vm.expectRevert(EmogotchiItems.NoItem.selector);
        items.catalogue(0, 1);
    }

    /// @dev Operator rule: only a living named cat qualifies; a dead one qualifies again once revived.
    function test_namedGate_needsALivingCat() public {
        uint256 witch = _witch();
        vm.warp(vm.getBlockTimestamp() + 60 days); // long past the welcome week: unfed, it died
        assertFalse(game.state(1).alive);
        (bool ok, uint8 reason,,) = items.canClaim(witch, alice, 1, abi.encode(1));
        assertFalse(ok);
        assertEq(reason, 6);
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        items.claim(witch, 1, abi.encode(1));
        vm.prank(alice);
        vm.expectRevert(EmogotchiItems.NotEligible.selector); // the scan skips it too
        items.claim(witch, 1, "");
        uint256 revivePrice = game.REVIVE_PRICE(); // read before the prank, or the read consumes it
        vm.deal(alice, revivePrice); // 1,000 MON, more than the test wallet holds
        vm.prank(alice);
        game.revive{value: revivePrice}(1);
        assertTrue(game.state(1).alive);
        vm.prank(alice);
        items.claim(witch, 1, abi.encode(1));
        assertEq(items.balanceOf(alice, witch), 1);
    }

    function test_itemCreatedCarriesEveryRule() public {
        EmogotchiItems.CreateParams memory c = _params("Loud");
        c.price = 1 ether;
        c.maxSupply = 7;
        c.perKey = 2;
        c.opens = 100;
        c.closes = 200;
        c.slot = 4;
        c.soulbound = true;
        c.gate = address(named);
        vm.expectEmit(true, false, false, false);
        emit EmogotchiItems.ItemCreated(
            1, "Loud", EmogotchiItems.Kind.Cosmetic, 1 ether, 7, 2, 100, 200, 4, true, address(named), address(0)
        );
        uint256 id = items.create(c);
        EmogotchiItems.Item memory it = items.item(id);
        assertEq(it.perKey, 2);
        assertEq(it.closes, 200);
    }

    function _has(string memory hay, string memory needle) internal pure returns (bool) {
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
