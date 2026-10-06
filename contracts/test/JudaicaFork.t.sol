// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {CreateJudaica} from "../script/CreateJudaica.s.sol";

interface IOwnerOfJ {
    function ownerOf(uint256 id) external view returns (address);
}

/// The Jewish pack on the live shop, exactly as the script creates it, bought and worn by real owners of a real cat,
/// frok and Sahur. Runs only against a fork:
///   forge test --match-contract JudaicaFork --fork-url https://rpc.monad.xyz -vv
contract JudaicaForkTest is Test {
    EmogotchiItems constant ITEMS = EmogotchiItems(payable(0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91));
    address constant CATS = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant BRAHS = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHURS = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;

    function test_fork_theJewishPackOnTheLiveShop() public {
        if (block.chainid != 143) return;
        assertEq(ITEMS.itemCount(), 7, "the live shop should hold items 1-7");
        address curator = ITEMS.curator();

        // exactly what the script does
        CreateJudaica script = new CreateJudaica();
        EmogotchiItems.CreateParams[5] memory ps = script.params();
        uint256 artTotal;
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(curator);
            uint256 g0 = gasleft();
            uint256 id = ITEMS.create(ps[i]);
            console.log(ps[i].name, id);
            console.log("  create gas (EVM schedule)", g0 - gasleft(), " art bytes", ps[i].svg.length);
            artTotal += ps[i].svg.length;
            assertEq(id, 8 + i);
            EmogotchiItems.Item memory it = ITEMS.item(id);
            assertEq(it.price, 36 ether);
            assertEq(it.maxSupply, 613);
            assertEq(it.perKey, 0);
            assertEq(it.gate, address(0));
            assertFalse(it.soulbound);
            assertEq(uint8(it.kind), uint8(ps[i].kind));
            assertEq(keccak256(bytes(ITEMS.imageOf(id))), keccak256(ps[i].svg), "the stored picture is the card, byte for byte");
            assertEq(keccak256(bytes(it.description)), keccak256(bytes(ps[i].description)));
        }
        console.log("art bytes in all", artTotal);
        assertEq(ITEMS.itemCount(), 12);

        // real owners of a real cat, frok and Sahur buy all five and put them on their pet
        address[3] memory cols = [CATS, BRAHS, SAHURS];
        for (uint256 c = 0; c < 3; c++) {
            uint256 pet = 1;
            address who = IOwnerOfJ(cols[c]).ownerOf(pet);
            if (who.code.length > 0 && bytes3(who.code) != 0xef0100) { pet = 2; who = IOwnerOfJ(cols[c]).ownerOf(pet); }
            vm.deal(who, 500 ether);
            for (uint256 i = 0; i < 5; i++) {
                uint256 id = 8 + i;
                uint256 burn0 = ITEMS.pendingBurnMon();
                uint128 tr0 = ITEMS.treasuryOwed();
                uint128 tm0 = ITEMS.teamOwed();
                vm.prank(who);
                vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 36 ether, 0));
                ITEMS.claim(id, 1, "");   // it is not free
                vm.prank(who);
                ITEMS.claim{value: 36 ether}(id, 1, "");
                assertEq(ITEMS.balanceOf(who, id), 1);
                assertEq(ITEMS.pendingBurnMon() - burn0, 28.8 ether, "80% to the burn");
                assertEq(ITEMS.treasuryOwed() - tr0, 3.6 ether, "10% treasury");
                assertEq(ITEMS.teamOwed() - tm0, 3.6 ether, "10% team");
                vm.prank(who);
                ITEMS.equip(cols[c], pet, id);   // every one of them goes on a pet, the dreidel and the hen too
            }
            uint256[] memory on = ITEMS.equipped(cols[c], pet);
            uint256 found;
            for (uint256 k = 0; k < on.length; k++) if (on[k] >= 8 && on[k] <= 12) found++;
            assertEq(found, 5, "all five on the pet");
        }

        // no limit per wallet, but 613 in all
        address whale = makeAddr("whale");
        vm.deal(whale, 100_000 ether);
        vm.prank(whale);
        ITEMS.claim{value: 36 ether * 610}(8, 610, "");   // 3 already bought above
        vm.prank(whale);
        vm.expectRevert(EmogotchiItems.SoldOut.selector);
        ITEMS.claim{value: 36 ether}(8, 1, "");
        assertEq(ITEMS.item(8).minted, 613);
    }
}
