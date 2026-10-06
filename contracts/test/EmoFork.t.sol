// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console, stdStorage, StdStorage} from "forge-std/Test.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {HoldsGate} from "../src/gates/HoldsGate.sol";
import {CreateEmo} from "../script/CreateEmo.s.sol";

interface IERC20Emo {
    function balanceOf(address who) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// The emo pack on the live shop, exactly as the script creates it: the paid edition (18-24, 30 MON, any pet) bought by a
/// new player with a free frok, the holders' edition (25-31, free, 7,000 $EMO, one each, soulbound) claimed by a wallet
/// that holds the EMO and no pet at all, both worn by the same frok; and the script's refusals. Runs only against a fork:
///   ~/.foundry/bin/forge test --match-contract EmoFork --fork-url https://rpc.monad.xyz -vv
contract EmoForkTest is Test {
    using stdStorage for StdStorage;

    EmogotchiItems constant ITEMS = EmogotchiItems(payable(0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91));
    Inversegotchi constant BRAHS = Inversegotchi(payable(0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6));
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant ANY_PET = 0x2CC30bc5d0470c8a9Df554204f2fb54174467AE5;

    CreateEmo script;
    address curator;

    /// The fork test only means something on Monad mainnet with the shop as it stands before the pack.
    function _live() internal returns (bool) {
        if (block.chainid != 143) return false;
        assertEq(ITEMS.itemCount(), 17, "the live shop should hold items 1-17");
        script = new CreateEmo();
        curator = ITEMS.curator();
        return true;
    }

    /// Exactly what the script does: deploy HoldsGate(EMO, 7,000 EMO), then create the fourteen from its own params.
    function _createPack(bool log) internal returns (HoldsGate gate, EmogotchiItems.CreateParams[14] memory ps) {
        vm.prank(curator);
        gate = new HoldsGate(EMO, 7_000 ether);
        ps = script.params(address(gate));
        for (uint256 i = 0; i < 14; i++) {
            vm.prank(curator);
            uint256 g0 = gasleft();
            uint256 id = ITEMS.create(ps[i]);
            uint256 used = g0 - gasleft();
            assertEq(id, 18 + i, "each item at its id");
            if (log) {
                console.log(ps[i].name, id);
                console.log("  create gas (EVM schedule, no calldata)", used, " art bytes", ps[i].svg.length);
            }
        }
        assertEq(ITEMS.itemCount(), 31);
    }

    function _contains(bytes memory hay, bytes memory needle) internal pure returns (bool) {
        if (needle.length > hay.length) return false;
        for (uint256 i = 0; i + needle.length <= hay.length; i++) {
            bool same = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (hay[i + j] != needle[j]) {
                    same = false;
                    break;
                }
            }
            if (same) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ the fourteen, term for term
    function test_fork_createsTheFourteen() public {
        if (!_live()) return;
        (HoldsGate gate, EmogotchiItems.CreateParams[14] memory ps) = _createPack(true);
        assertEq(address(gate.TOKEN()), EMO);
        assertEq(gate.MIN(), 7_000 ether);

        string[7] memory names = ["Beanie", "Emo fit", "Wristbands", "Lip piercings", "Emo bedroom theme", "Guitar", "Flip phone"];
        string[7] memory files = ["beanie", "fit", "wristbands", "piercings", "bedroom", "guitar", "selfie"];
        uint8[7] memory kinds = [1, 1, 1, 1, 2, 3, 3]; // Cosmetic x4, Scene, Passive x2
        uint8[7] memory slots = [2, 1, 4, 4, 3, 5, 5];
        uint256 artTotal;
        for (uint256 i = 0; i < 14; i++) {
            uint256 id = 18 + i;
            bool holders = i >= 7;
            uint256 k = i % 7;
            EmogotchiItems.Item memory it = ITEMS.item(id);
            assertEq(it.name, holders ? string.concat(names[k], " (Holders)") : names[k]);
            assertTrue(
                _contains(
                    bytes(it.description),
                    holders
                        ? bytes(" Part of the emo pack. Holders' edition: free to a wallet holding 7,000 $EMO, one of each, and soulbound.")
                        : bytes(" Part of the emo pack.")
                ),
                "the pack line"
            );
            assertEq(keccak256(bytes(it.description)), keccak256(bytes(ps[i].description)));
            assertEq(it.price, holders ? 0 : 30 ether);
            assertEq(it.maxSupply, 0, "unlimited");
            assertEq(it.perKey, holders ? 1 : 0);
            assertEq(it.opens, 0);
            assertEq(it.closes, 0);
            assertEq(uint8(it.kind), kinds[k]);
            assertEq(it.slot, slots[k]);
            assertEq(it.soulbound, holders);
            assertFalse(it.isSealed);
            assertEq(it.gate, holders ? address(gate) : ANY_PET);
            assertEq(it.minted, 0);
            bytes memory file = vm.readFileBinary(string.concat("items/emo/", files[k], holders ? "-holder.svg" : ".svg"));
            assertEq(bytes(ITEMS.imageOf(id)), file, "the stored picture is the card, byte for byte");
            artTotal += file.length;
            // the script's own check passes on what the shop now holds
            script.verify(ITEMS, id, ps[i]);
            // what a marketplace reads: the attributes close the JSON, so look in its last bytes
            bytes memory meta = bytes(ITEMS.metadata(id));
            bytes memory tail = new bytes(200);
            for (uint256 j = 0; j < 200; j++) {
                tail[j] = meta[meta.length - 200 + j];
            }
            assertTrue(
                _contains(tail, holders ? bytes('"soulbound","value":"yes"') : bytes('"soulbound","value":"no"')),
                "the soulbound trait"
            );
            assertEq(ITEMS.remaining(id), type(uint256).max);
        }
        console.log("art bytes in all", artTotal);

        // the two editions' descriptions differ only by the pack line
        for (uint256 k = 0; k < 7; k++) {
            assertEq(
                keccak256(bytes(ps[k + 7].description)),
                keccak256(
                    bytes(
                        string.concat(
                            _strip(ps[k].description, bytes(" Part of the emo pack.").length),
                            " Part of the emo pack. Holders' edition: free to a wallet holding 7,000 $EMO, one of each, and soulbound."
                        )
                    )
                )
            );
        }
    }

    function _strip(string memory s, uint256 tail) internal pure returns (string memory out) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length - tail);
        for (uint256 i = 0; i < o.length; i++) {
            o[i] = b[i];
        }
        out = string(o);
    }

    // ------------------------------------------------------------------ the paid edition
    function test_fork_paidEdition() public {
        if (!_live()) return;
        _createPack(false);
        bytes memory hint = abi.encode(address(BRAHS));

        // a fresh wallet with no pet is refused, hint or not
        address who = makeAddr("emo-paid-player");
        vm.deal(who, 1_000 ether);
        (bool ok, uint8 reason,, uint256 due) = ITEMS.canClaim(18, who, 1, hint);
        assertFalse(ok);
        assertEq(reason, 6, "not eligible");
        assertEq(due, 30 ether);
        vm.prank(who);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        ITEMS.claim{value: 30 ether}(18, 1, hint);
        vm.prank(who);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        ITEMS.claim{value: 30 ether}(18, 1, "");

        // a free frok makes it eligible (with the collection as the hint: the site always passes it)
        vm.prank(who);
        uint256 frok = BRAHS.mint();
        (ok,,,) = ITEMS.canClaim(18, who, 1, hint);
        assertTrue(ok);
        // the gate's no-hint scan only knows the cat and the first frok deploy, so a frok holder needs the hint
        vm.prank(who);
        vm.expectRevert(EmogotchiItems.NotEligible.selector);
        ITEMS.claim{value: 30 ether}(18, 1, "");

        // every one of the seven, bought for 30 MON, split 80/10/10
        for (uint256 i = 0; i < 7; i++) {
            uint256 id = 18 + i;
            vm.prank(who);
            vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 30 ether, 0));
            ITEMS.claim(id, 1, hint); // it is not free
            vm.prank(who);
            vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 30 ether, 29 ether));
            ITEMS.claim{value: 29 ether}(id, 1, hint);
            vm.prank(who);
            vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 30 ether, 31 ether));
            ITEMS.claim{value: 31 ether}(id, 1, hint);

            uint256 burn0 = ITEMS.pendingBurnMon();
            uint128 tr0 = ITEMS.treasuryOwed();
            uint128 tm0 = ITEMS.teamOwed();
            uint256 bal0 = address(ITEMS).balance;
            vm.prank(who);
            ITEMS.claim{value: 30 ether}(id, 1, hint);
            assertEq(ITEMS.balanceOf(who, id), 1);
            assertEq(ITEMS.pendingBurnMon() - burn0, 24 ether, "80% to the burn");
            assertEq(ITEMS.treasuryOwed() - tr0, 3 ether, "10% treasury");
            assertEq(ITEMS.teamOwed() - tm0, 3 ether, "10% team");
            assertEq(address(ITEMS).balance - bal0, 30 ether);

            // and again: no limit per wallet, no supply cap
            vm.prank(who);
            ITEMS.claim{value: 30 ether}(id, 1, hint);
            assertEq(ITEMS.balanceOf(who, id), 2);
        }
        // several in one go
        vm.prank(who);
        ITEMS.claim{value: 90 ether}(23, 3, hint);
        assertEq(ITEMS.balanceOf(who, 23), 5);
        assertEq(ITEMS.item(23).minted, 5);

        // the paid edition is tradeable: one copy goes to a friend, who can wear it on their own pet
        address friend = makeAddr("emo-paid-friend");
        vm.prank(who);
        ITEMS.safeTransferFrom(who, friend, 18, 1, "");
        assertEq(ITEMS.balanceOf(friend, 18), 1);
        assertEq(ITEMS.balanceOf(who, 18), 1);
        vm.prank(friend);
        uint256 friendsFrok = BRAHS.mint();
        vm.prank(friend);
        ITEMS.equip(address(BRAHS), friendsFrok, 18);
        uint256[] memory on = ITEMS.equipped(address(BRAHS), friendsFrok);
        assertEq(on.length, 1);
        assertEq(on[0], 18);
        // and the holder still wears what they kept
        vm.prank(who);
        ITEMS.equip(address(BRAHS), frok, 18);
        assertEq(ITEMS.equipped(address(BRAHS), frok).length, 1);
    }

    // ------------------------------------------------------------------ the holders' edition
    function test_fork_holdersEdition() public {
        if (!_live()) return;
        _createPack(false);

        // exactly 7,000 EMO and no pet at all: the gate asks only for the EMO
        address holder = makeAddr("emo-holder");
        deal(EMO, holder, 7_000 ether);
        assertEq(IERC20Emo(EMO).balanceOf(holder), 7_000 ether);
        assertEq(BRAHS.balanceOf(holder), 0);

        // one wei short is refused
        address almost = makeAddr("emo-almost");
        deal(EMO, almost, 7_000 ether - 1);
        for (uint256 i = 0; i < 7; i++) {
            uint256 id = 25 + i;
            (bool ok, uint8 reason,,) = ITEMS.canClaim(id, almost, 1, "");
            assertFalse(ok);
            assertEq(reason, 6, "not eligible");
            vm.prank(almost);
            vm.expectRevert(EmogotchiItems.NotEligible.selector);
            ITEMS.claim(id, 1, "");
        }

        for (uint256 i = 0; i < 7; i++) {
            uint256 id = 25 + i;
            (bool ok,, bytes32 key, uint256 due) = ITEMS.canClaim(id, holder, 1, "");
            assertTrue(ok);
            assertEq(due, 0, "free");
            assertEq(key, bytes32(uint256(uint160(holder))), "keyed on the wallet");
            // paying for a free item is refused
            vm.deal(holder, 1 ether);
            vm.prank(holder);
            vm.expectRevert(abi.encodeWithSelector(EmogotchiItems.WrongValue.selector, 0, 1 ether));
            ITEMS.claim{value: 1 ether}(id, 1, "");
            // two at once is over the cap
            vm.prank(holder);
            vm.expectRevert(EmogotchiItems.CapReached.selector);
            ITEMS.claim(id, 2, "");

            uint256 burn0 = ITEMS.pendingBurnMon();
            vm.prank(holder);
            ITEMS.claim(id, 1, "");
            assertEq(ITEMS.balanceOf(holder, id), 1);
            assertEq(ITEMS.pendingBurnMon(), burn0, "nothing paid, nothing queued");
            // one of each per wallet
            vm.prank(holder);
            vm.expectRevert(EmogotchiItems.CapReached.selector);
            ITEMS.claim(id, 1, "");
            (, uint8 reason,,) = ITEMS.canClaim(id, holder, 1, "");
            assertEq(reason, 7, "cap reached");
        }

        // soulbound: a holders' copy never leaves the wallet, by either transfer
        address friend = makeAddr("emo-holder-friend");
        for (uint256 i = 0; i < 7; i++) {
            uint256 id = 25 + i;
            vm.prank(holder);
            vm.expectRevert(EmogotchiItems.Soulbound.selector);
            ITEMS.safeTransferFrom(holder, friend, id, 1, "");
        }
        uint256[] memory ids = new uint256[](1);
        uint256[] memory qty = new uint256[](1);
        ids[0] = 25;
        qty[0] = 1;
        vm.prank(holder);
        vm.expectRevert(EmogotchiItems.Soulbound.selector);
        ITEMS.safeBatchTransferFrom(holder, friend, ids, qty, "");
        // nor through an approved operator
        vm.prank(holder);
        ITEMS.setApprovalForAll(friend, true);
        vm.prank(friend);
        vm.expectRevert(EmogotchiItems.Soulbound.selector);
        ITEMS.safeTransferFrom(holder, friend, 25, 1, "");

        // what was claimed stays claimed whatever the wallet holds later (no "wear it while you hold" on chain)
        vm.prank(holder);
        IERC20Emo(EMO).transfer(friend, 7_000 ether);
        assertEq(IERC20Emo(EMO).balanceOf(holder), 0);
        assertEq(ITEMS.balanceOf(holder, 25), 1);
        // and the bar is a balance at claim time, keyed on the wallet: the same EMO lets a second wallet claim (as decided)
        (bool okFriend,,,) = ITEMS.canClaim(25, friend, 1, "");
        assertTrue(okFriend);
        // while the first, now holding none, could not claim a second copy anyway
        (bool okHolder,,,) = ITEMS.canClaim(25, holder, 1, "");
        assertFalse(okHolder);

        for (uint256 i = 0; i < 7; i++) {
            assertEq(ITEMS.item(25 + i).minted, 1);
        }
    }

    // ------------------------------------------------------------------ both editions on one frok
    function test_fork_bothEditionsOnTheFrok() public {
        if (!_live()) return;
        _createPack(false);
        address who = makeAddr("emo-both");
        vm.deal(who, 1_000 ether);
        deal(EMO, who, 7_000 ether);
        vm.prank(who);
        uint256 frok = BRAHS.mint();
        bytes memory hint = abi.encode(address(BRAHS));
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(who);
            ITEMS.claim{value: 30 ether}(18 + i, 1, hint);
            vm.prank(who);
            ITEMS.claim(25 + i, 1, "");
        }
        for (uint256 id = 18; id <= 31; id++) {
            vm.prank(who);
            ITEMS.equip(address(BRAHS), frok, id);
        }
        uint256[] memory on = ITEMS.equipped(address(BRAHS), frok);
        assertEq(on.length, 14, "fourteen on the frok (the shop allows 16)");
        for (uint256 id = 18; id <= 31; id++) {
            bool found;
            for (uint256 k = 0; k < on.length; k++) {
                if (on[k] == id) found = true;
            }
            assertTrue(found, "each item shows in equipped()");
        }
        // take one off and it is gone from the list
        vm.prank(who);
        ITEMS.unequip(address(BRAHS), frok, 29);
        assertEq(ITEMS.equipped(address(BRAHS), frok).length, 13);
    }

    // ------------------------------------------------------------------ the script's refusals and its resume
    function test_fork_scriptRefuses() public {
        if (!_live()) return;
        vm.setEnv("ITEMS", vm.toString(address(ITEMS)));

        // run() from anyone but the curator
        vm.expectRevert(bytes("the broadcaster is not the curator"));
        script.run();
        vm.expectRevert(bytes("the broadcaster is not the curator"));
        script.preflight(ITEMS, address(0), makeAddr("stranger"));

        // the curator, as things stand: it would go ahead
        assertEq(script.preflight(ITEMS, address(0), curator), 17);

        // a gate that is not HoldsGate(EMO, 7,000 EMO)
        HoldsGate cheap = new HoldsGate(EMO, 1 ether);
        vm.expectRevert(bytes("GATE is not HoldsGate(EMO, 7,000 EMO)"));
        script.preflight(ITEMS, address(cheap), curator);
        HoldsGate otherToken = new HoldsGate(address(BRAHS), 7_000 ether);
        vm.expectRevert(bytes("GATE is not HoldsGate(EMO, 7,000 EMO)"));
        script.preflight(ITEMS, address(otherToken), curator);
        vm.expectRevert(bytes("GATE is not HoldsGate(EMO, 7,000 EMO)"));
        script.preflight(ITEMS, ANY_PET, curator);
        vm.expectRevert(bytes("GATE is not HoldsGate(EMO, 7,000 EMO)"));
        script.preflight(ITEMS, makeAddr("no code"), curator);

        // one item fewer than 17: the ids would shift
        uint256 slot = stdstore.target(address(ITEMS)).sig("itemCount()").find();
        vm.store(address(ITEMS), bytes32(slot), bytes32(uint256(16)));
        vm.prank(curator);
        vm.expectRevert(bytes("the shop does not hold 17 items (plus pack items): the ids would shift"));
        script.run();
        vm.store(address(ITEMS), bytes32(slot), bytes32(uint256(17)));

        // the curator made something else first: item 18 is not the beanie
        HoldsGate good = new HoldsGate(EMO, 7_000 ether);
        EmogotchiItems.CreateParams[14] memory ps = script.params(address(good));
        uint256 snap = vm.snapshotState();
        EmogotchiItems.CreateParams memory other = script.params(address(good))[0];
        other.name = "Something else";
        vm.prank(curator);
        ITEMS.create(other);
        vm.prank(curator);
        vm.expectRevert(bytes("pack items already exist: pass GATE=<the HoldsGate the first run deployed>"));
        script.run();
        vm.expectRevert(bytes("#18 Beanie: the name differs"));
        script.preflight(ITEMS, address(good), curator);
        vm.revertToState(snap);

        // a run that stopped after three creates: refused without GATE, resumed with it
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(curator);
            ITEMS.create(ps[i]);
        }
        vm.expectRevert(bytes("pack items already exist: pass GATE=<the HoldsGate the first run deployed>"));
        script.preflight(ITEMS, address(0), curator);
        assertEq(script.preflight(ITEMS, address(good), curator), 20, "resumes at 21");
        // while only paid items exist, any HoldsGate(EMO, 7,000 EMO) passes: none of them names it yet, and every such
        // gate is the same code with the same two numbers
        HoldsGate another = new HoldsGate(EMO, 7_000 ether);
        assertEq(script.preflight(ITEMS, address(another), curator), 20);

        // a created holders' item names its gate: a resume with another gate is refused
        for (uint256 i = 3; i < 8; i++) {
            vm.prank(curator);
            ITEMS.create(ps[i]);
        }
        assertEq(script.preflight(ITEMS, address(good), curator), 25);
        vm.expectRevert(bytes("#25 Beanie (Holders): the gate differs"));
        script.preflight(ITEMS, address(another), curator);

        // all fourteen made: a rerun verifies them and has nothing to do; a fifteenth item and it refuses
        for (uint256 i = 8; i < 14; i++) {
            vm.prank(curator);
            ITEMS.create(ps[i]);
        }
        assertEq(script.preflight(ITEMS, address(good), curator), 31);
        vm.prank(curator);
        ITEMS.create(ps[0]);
        vm.expectRevert(bytes("the shop does not hold 17 items (plus pack items): the ids would shift"));
        script.preflight(ITEMS, address(good), curator);
    }
}
