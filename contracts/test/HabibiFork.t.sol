// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {Sahuragotchi} from "../src/Sahuragotchi.sol";
import {CreateHabibi} from "../script/CreateHabibi.s.sol";

/// The Habibi pack on the live shop, exactly as the script creates it, claimed like a new player would: a fresh wallet
/// mints a frok and a Sahur (free), names them (10 MON each), and claims all five for each pet, free, once. Runs only
/// against a fork:
///   forge test --match-contract HabibiFork --fork-url https://rpc.monad.xyz -vv
contract HabibiForkTest is Test {
    EmogotchiItems constant ITEMS = EmogotchiItems(payable(0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91));
    Inversegotchi constant BRAHS = Inversegotchi(payable(0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6));
    Sahuragotchi constant SAHURS = Sahuragotchi(payable(0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7));
    address constant GATE = 0x0f7f0AEA1A748f4e521eFC874FBa2e5Bd6F0B515;

    function test_fork_theHabibiPackOnTheLiveShop() public {
        if (block.chainid != 143) return;
        assertEq(ITEMS.itemCount(), 12, "the live shop should hold items 1-12");
        address curator = ITEMS.curator();

        // exactly what the script does
        CreateHabibi script = new CreateHabibi();
        EmogotchiItems.CreateParams[5] memory ps = script.params();
        uint256 artTotal;
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(curator);
            uint256 g0 = gasleft();
            uint256 id = ITEMS.create(ps[i]);
            console.log(ps[i].name, id);
            console.log("  create gas (EVM schedule)", g0 - gasleft(), " art bytes", ps[i].svg.length);
            artTotal += ps[i].svg.length;
            assertEq(id, 13 + i);
            EmogotchiItems.Item memory it = ITEMS.item(id);
            assertEq(it.price, 0);
            assertEq(it.maxSupply, 1001);
            assertEq(it.perKey, 1);
            assertEq(it.gate, GATE);
            assertFalse(it.soulbound);
            assertEq(uint8(it.kind), uint8(ps[i].kind));
            assertEq(keccak256(bytes(it.name)), keccak256(bytes(ps[i].name)));
            assertEq(keccak256(bytes(ITEMS.imageOf(id))), keccak256(ps[i].svg), "the stored picture is the card, byte for byte");
        }
        console.log("art bytes in all", artTotal);
        assertEq(ITEMS.itemCount(), 17);

        // a new player: a fresh wallet mints a frok and a Sahur and names them
        address who = makeAddr("habibi-player");
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        uint256 frok = BRAHS.mint();
        uint256 sahur = SAHURS.mint();
        vm.stopPrank();

        // unnamed, a pet cannot claim
        (bool ok, uint8 reason,,) = ITEMS.canClaim(13, who, 1, abi.encode(address(BRAHS), frok));
        assertFalse(ok, "an unnamed pet is refused");
        console.log("unnamed frok refused, reason", reason);
        vm.prank(who);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        ITEMS.claim(13, 1, abi.encode(address(BRAHS), frok));

        vm.startPrank(who);
        BRAHS.setName{value: 10 ether}(frok, "habibi");
        SAHURS.setName{value: 10 ether}(sahur, "tung");
        vm.stopPrank();

        // named: each pet claims each item once, free, and puts it on
        address[2] memory cols = [address(BRAHS), address(SAHURS)];
        uint256[2] memory pets = [frok, sahur];
        for (uint256 p = 0; p < 2; p++) {
            bytes memory hint = abi.encode(cols[p], pets[p]);
            for (uint256 i = 0; i < 5; i++) {
                uint256 id = 13 + i;
                (ok,,,) = ITEMS.canClaim(id, who, 1, hint);
                assertTrue(ok, "a living, named pet can claim");
                vm.prank(who);
                ITEMS.claim(id, 1, hint);   // free: no value
                vm.prank(who);
                vm.expectRevert(EmogotchiItems.CapReached.selector);
                ITEMS.claim(id, 1, hint);   // one per pet
                vm.prank(who);
                ITEMS.equip(cols[p], pets[p], id);
            }
            uint256[] memory on = ITEMS.equipped(cols[p], pets[p]);
            uint256 found;
            for (uint256 k = 0; k < on.length; k++) if (on[k] >= 13 && on[k] <= 17) found++;
            assertEq(found, 5, "all five on the pet");
        }
        for (uint256 i = 0; i < 5; i++) {
            assertEq(ITEMS.balanceOf(who, 13 + i), 2, "one per pet: two pets, two of each");
            assertEq(ITEMS.item(13 + i).minted, 2);
        }
        // paying for a free item is refused
        vm.prank(who);
        vm.expectRevert();
        ITEMS.claim{value: 1 ether}(13, 1, abi.encode(address(BRAHS), frok));
    }
}
