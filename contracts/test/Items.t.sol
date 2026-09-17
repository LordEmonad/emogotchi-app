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
        c.perWallet = 1;
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
        assertEq(it.perWallet, 1);
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
        vm.expectRevert(EmogotchiItems.WalletCapReached.selector);
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
        EmogotchiItems.CreateParams memory c = _params("Ticket");
        c.kind = EmogotchiItems.Kind.Passive;
        uint256 ticket = items.create(c);
        vm.startPrank(alice);
        items.claim(witch, 1, "");
        items.claim(ticket, 1, "");
        vm.expectRevert(EmogotchiItems.CollectionNotAllowed.selector);
        items.equip(address(0xBEEF), 1, witch);
        vm.expectRevert(EmogotchiItems.NotOwner.selector);
        items.equip(address(game), 4, witch); // bob's cat
        vm.expectRevert(EmogotchiItems.NotEquippable.selector);
        items.equip(address(game), 1, ticket);
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

    function test_crankFallback_onlyWhenTheSwapPathIsBroken() public {
        EmogotchiItems.CreateParams memory c = _params("Paid");
        c.price = 10 ether;
        uint256 id = items.create(c);
        vm.prank(alice);
        items.claim{value: 10 ether}(id, 1, "");
        assertEq(items.pendingBurnMon(), 8 ether);
        assertFalse(items.swapPathBroken());
        vm.expectRevert(EmogotchiItems.NothingToDo.selector);
        items.crankFallback(type(uint256).max);
        nad.setLensRouter(makeAddr("newRouter")); // nad.fun moved on
        assertTrue(items.swapPathBroken());
        items.crankBurn(type(uint256).max, 0); // queues, burns nothing
        assertEq(items.pendingBurnMon(), 8 ether);
        uint256 dead = items.BURN_ADDRESS().balance;
        items.crankFallback(type(uint256).max);
        assertEq(items.pendingBurnMon(), 0);
        assertEq(items.BURN_ADDRESS().balance, dead + 8 ether);
        assertEq(items.totalMonBurned(), 8 ether);
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
