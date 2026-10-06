// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedPetGate} from "../src/gates/NamedPetGate.sol";
import {CreateHalloween} from "../script/CreateHalloween.s.sol";

/// The Halloween items on the live shop, exactly as the script creates them, claimed by real owners of real
/// named pets. Runs only against a fork:
///   forge test --match-contract HalloweenFork --fork-url https://rpc.monad.xyz -vv
/// Pets are picked from the site's public index (named, and alive or dead by the feed clock) and re-checked here.
contract HalloweenForkTest is Test {
    EmogotchiItems constant ITEMS = EmogotchiItems(payable(0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91));
    Emogotchi constant CATS = Emogotchi(payable(0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5));
    Inversegotchi constant BRAHS = Inversegotchi(payable(0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6));

    function _find(bool cat, uint256[] memory ids, bool wantAlive, bool wantNamed) internal view returns (uint256) {
        for (uint256 i = 0; i < ids.length; i++) {
            bool alive = cat ? CATS.state(ids[i]).alive : BRAHS.state(ids[i]).alive;
            bool named = bytes(cat ? CATS.nameOf(ids[i]) : BRAHS.nameOf(ids[i])).length > 0;
            if (alive == wantAlive && named == wantNamed) return ids[i];
        }
        return 0;
    }

    function test_fork_halloweenItemsOnTheLiveShop() public {
        if (block.chainid != 143) return;
        assertEq(ITEMS.itemCount(), 3, "the live shop should hold items 1-3");
        address curator = ITEMS.curator();

        // exactly what the script does: deploy the gate, create the three from the same params
        NamedPetGate gate = new NamedPetGate(address(ITEMS));
        CreateHalloween script = new CreateHalloween();
        EmogotchiItems.CreateParams[3] memory ps = script.params(address(gate));
        uint256[3] memory ids;
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(curator);
            uint256 g0 = gasleft();
            ids[i] = ITEMS.create(ps[i]);
            console.log(ps[i].name, "id", ids[i]);
            console.log("  create gas (EVM schedule)", g0 - gasleft());
            assertEq(ids[i], 4 + i);
            EmogotchiItems.Item memory it = ITEMS.item(ids[i]);
            assertEq(it.price, 0);
            assertEq(it.maxSupply, 100);
            assertEq(it.perKey, 1);
            assertEq(it.gate, address(gate));
            assertFalse(it.soulbound);
            assertEq(uint8(it.kind), uint8(EmogotchiItems.Kind.Cosmetic));
            assertEq(keccak256(bytes(ITEMS.imageOf(ids[i]))), keccak256(ps[i].svg), "the stored picture is the card, byte for byte");
            assertEq(keccak256(bytes(it.name)), keccak256(bytes(ps[i].name)));
            assertEq(keccak256(bytes(it.description)), keccak256(bytes(ps[i].description)));
        }

        // real pets, re-checked on chain
        uint256[] memory catIds = new uint256[](8);
        (catIds[0], catIds[1], catIds[2], catIds[3], catIds[4], catIds[5], catIds[6], catIds[7]) = (82533, 82526, 82524, 82523, 82515, 82505, 82504, 82502);
        uint256[] memory frokIds = new uint256[](8);
        (frokIds[0], frokIds[1], frokIds[2], frokIds[3], frokIds[4], frokIds[5], frokIds[6], frokIds[7]) = (371, 362, 340, 298, 297, 290, 136, 133);
        uint256[] memory deadCats = new uint256[](5);
        (deadCats[0], deadCats[1], deadCats[2], deadCats[3], deadCats[4]) = (82528, 82511, 82500, 82499, 82497);
        uint256[] memory deadFroks = new uint256[](5);
        (deadFroks[0], deadFroks[1], deadFroks[2], deadFroks[3], deadFroks[4]) = (296, 295, 119, 55, 48);
        uint256[] memory plainCats = new uint256[](5);
        (plainCats[0], plainCats[1], plainCats[2], plainCats[3], plainCats[4]) = (1000, 2000, 3000, 82400, 82530);

        uint256 cat = _find(true, catIds, true, true);
        uint256 frok = _find(false, frokIds, true, true);
        uint256 deadCat = _find(true, deadCats, false, true);
        uint256 deadFrok = _find(false, deadFroks, false, true);
        uint256 plainCat = _find(true, plainCats, true, false);
        assertTrue(cat != 0 && frok != 0, "need a living named cat and frok");
        console.log("living named cat", cat, "frok", frok);
        console.log("dead named cat", deadCat, "frok", deadFrok);
        console.log("living unnamed cat", plainCat);

        address catOwner = CATS.ownerOf(cat);
        address frokOwner = BRAHS.ownerOf(frok);
        bytes memory catHint = abi.encode(address(CATS), cat);
        bytes memory frokHint = abi.encode(address(BRAHS), frok);

        for (uint256 i = 0; i < 3; i++) {
            uint256 id = ids[i];
            (bool ok, uint8 reason,,) = ITEMS.canClaim(id, catOwner, 1, catHint);
            assertTrue(ok, "canClaim for the named cat");
            assertEq(reason, 0);
            vm.prank(catOwner);
            ITEMS.claim(id, 1, catHint);
            vm.prank(frokOwner);
            ITEMS.claim(id, 1, frokHint);
            assertEq(ITEMS.totalSupply(id), 2);
            // the same pets again: capped
            vm.prank(catOwner);
            vm.expectRevert(EmogotchiItems.CapReached.selector);
            ITEMS.claim(id, 1, catHint);
            vm.prank(frokOwner);
            vm.expectRevert(EmogotchiItems.CapReached.selector);
            ITEMS.claim(id, 1, frokHint);
            // someone else naming that cat: not eligible (not the owner)
            vm.prank(frokOwner);
            vm.expectRevert(EmogotchiItems.NotEligible.selector);
            ITEMS.claim(id, 1, catHint);
            // dead named pets and a living unnamed one are refused
            if (deadCat != 0) {
                vm.prank(CATS.ownerOf(deadCat));
                vm.expectRevert(EmogotchiItems.NotEligible.selector);
                ITEMS.claim(id, 1, abi.encode(address(CATS), deadCat));
            }
            if (deadFrok != 0) {
                vm.prank(BRAHS.ownerOf(deadFrok));
                vm.expectRevert(EmogotchiItems.NotEligible.selector);
                ITEMS.claim(id, 1, abi.encode(address(BRAHS), deadFrok));
            }
            if (plainCat != 0) {
                vm.prank(CATS.ownerOf(plainCat));
                vm.expectRevert(EmogotchiItems.NotEligible.selector);
                ITEMS.claim(id, 1, abi.encode(address(CATS), plainCat));
            }
        }
        // worn: the cat in all three, the frok in the pumpkin; tradeable: the frok's owner passes a mummy on
        vm.startPrank(catOwner);
        ITEMS.equip(address(CATS), cat, ids[0]);
        ITEMS.equip(address(CATS), cat, ids[1]);
        ITEMS.equip(address(CATS), cat, ids[2]);
        vm.stopPrank();
        assertEq(ITEMS.equipped(address(CATS), cat).length, 3);
        vm.prank(frokOwner);
        ITEMS.equip(address(BRAHS), frok, ids[0]);
        address friend = makeAddr("friend");
        vm.prank(frokOwner);
        ITEMS.safeTransferFrom(frokOwner, friend, ids[1], 1, "");
        assertEq(ITEMS.balanceOf(friend, ids[1]), 1);
        assertEq(ITEMS.itemCount(), 6);
    }
}
