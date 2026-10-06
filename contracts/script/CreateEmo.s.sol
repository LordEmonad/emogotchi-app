// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {HoldsGate} from "../src/gates/HoldsGate.sol";
import {AnyPetGate} from "../src/gates/AnyPetGate.sol";

/**
 * Adds the emo pack to the live shop: seven items, each in two editions, fourteen creates in all. The operator's terms
 * (2026-10-03), fixed for good once created:
 *
 *   ids 18-24, the PAID edition: 30 MON each, for a wallet holding a pet of any collection the shop allows (the live
 *     AnyPetGate 0x2CC30bc5d0470c8a9Df554204f2fb54174467AE5; its hint is abi.encode(collection)), unlimited supply, no
 *     limit per wallet, tradeable, open now and never closing. Paid claims split 80/10/10 like every paid item.
 *   ids 25-31, the HOLDERS' edition of the same seven: free, for a wallet holding at least 7,000 $EMO (a new
 *     HoldsGate(EMO, 7000e18): balance at claim time, keyed on the wallet), one of each per wallet, unlimited supply,
 *     soulbound (it never leaves the wallet that claimed it), open now and never closing.
 *
 *   18 / 25  Beanie             Cosmetic, slot 2 (head)        items/emo/beanie[-holder].svg
 *   19 / 26  Emo fit            Cosmetic, slot 1 (outfit)      items/emo/fit[-holder].svg
 *   20 / 27  Wristbands         Cosmetic, slot 4 (accessory)   items/emo/wristbands[-holder].svg
 *   21 / 28  Lip piercings      Cosmetic, slot 4 (accessory)   items/emo/piercings[-holder].svg
 *   22 / 29  Emo bedroom theme  Scene,    slot 3 (background)  items/emo/bedroom[-holder].svg
 *   23 / 30  Guitar             Passive,  slot 5 (action)      items/emo/guitar[-holder].svg   (the site: Play plays it)
 *   24 / 31  Flip phone         Passive,  slot 5 (action)      items/emo/selfie[-holder].svg   (the site: Pet takes a selfie)
 *
 *   Dry run (simulates everything against mainnet, sends nothing):
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 ~/.foundry/bin/forge script script/CreateEmo.s.sol \
 *     --rpc-url https://rpc.monad.xyz --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit \
 *     --gas-estimate-multiplier 115
 *
 *   For real: the same with --broadcast --slow --account emogotchi.
 *
 * The run deploys the HoldsGate first (one transaction), then the fourteen creates in id order, one transaction each.
 * `--slow` is required: it sends one transaction at a time and stops at the first failed receipt, so a create that fails
 * can never let the next one land at a shifted id (the site maps items by id, and ids are forever).
 *
 * A run that stopped half way is resumed by running it again with GATE=<the HoldsGate the first run deployed> (its
 * address is in the first run's log, "holders' gate", and in broadcast/CreateEmo.s.sol/143/run-latest.json). The script
 * then checks that GATE is exactly HoldsGate(EMO, 7,000 EMO) (its code compared to a fresh one, and both getters read),
 * that every pack item already in the shop is the one expected here, term for term and picture byte for byte, and
 * creates only the ones still missing, at the ids they were always meant to have. Once any pack item exists it refuses to
 * run without GATE, so a resume can never deploy a second gate by mistake. If the first run stopped after the gate was
 * deployed but before any item was created, pass GATE as well (without it the run would deploy a second, unused gate).
 *
 * It refuses unless the broadcaster is the shop's curator and the shop holds 17 items (or 17 plus pack items already
 * made by an earlier run of this script, each verified), the shop's EMO is the token the gate measures, and the paid
 * edition's gate is the live AnyPetGate for this shop. After each create it reads the item back and checks every stored
 * term and the stored picture byte for byte. The fourteen pictures come from `node tools/items/emo-cards.mjs`, about
 * 595 KB in all; the measured gas of each create is in contracts/README.md ("The emo pack").
 * Rehearsed on a mainnet fork by test/EmoFork.t.sol.
 */
contract CreateEmo is Script {
    address public constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777; // $EMO, 18 decimals
    address public constant ANY_PET = 0x2CC30bc5d0470c8a9Df554204f2fb54174467AE5; // the live "holds any pet" gate
    uint256 public constant MIN = 7_000 ether; // 7,000 EMO for the holders' edition, fixed for good once the gate exists
    uint128 public constant PRICE = 30 ether; // 30 MON a copy of the paid edition
    uint256 public constant BEFORE = 17; // items in the shop before the pack
    uint256 public constant FIRST = 18; // the first pack id: 18-24 paid, 25-31 holders'
    uint256 public constant N = 14;

    string constant PAID = " Part of the emo pack.";
    string constant HOLDERS =
        " Part of the emo pack. Holders' edition: free to a wallet holding 7,000 $EMO, one of each, and soulbound.";

    /// All fourteen, in id order (index i is id 18 + i): the seven paid, then the seven holders'. Public so the fork
    /// test creates exactly what this script creates. `gate` is the HoldsGate the holders' edition asks.
    function params(address gate) public view returns (EmogotchiItems.CreateParams[14] memory ps) {
        string[7] memory names = ["Beanie", "Emo fit", "Wristbands", "Lip piercings", "Emo bedroom theme", "Guitar", "Flip phone"];
        string[7] memory files = ["beanie", "fit", "wristbands", "piercings", "bedroom", "guitar", "selfie"];
        // as approved by the operator on 2026-10-03, word for word; the same text for both editions
        string[7] memory descriptions = [
            "A black slouch beanie with a ribbed cuff and a pink broken-heart patch, the black emo hair underneath. For any pet, now or later: put it on and your pet wears it, with any outfit. Crowned pets wear the crown on top.",
            "The emo fit, cut for each pet: stripes under a band tee, a zip hoodie, skinny jeans and a studded belt, checkered slip-ons. An outfit for any pet, now or later. Crowned pets wear it trimmed in gold.",
            "Purple sweatbands with a white stripe, on both wrists. For any pet, now or later, with any outfit. The cat already wears her own.",
            "Snakebites: two silver hoops through the lower lip, on every face your pet makes. For any pet, now or later, with any outfit. Crowned pets wear them in gold.",
            "An emo bedroom for your pet's room: fairy lights, rain on the window, posters of a broken heart and a cassette, a lava lamp, a candle on a skull, an old monitor with eight friends on it. A room theme for any pet, now or later, with its own tune.",
            "A black electric guitar with a lavender pickguard. Put it on a pet and Play brings it down from the sky: your pet picks it up, plays the riff with a band behind it, and throws it away.",
            "A pink flip phone. Put it on a pet and petting it becomes a mirror selfie: the phone falls in, three poses, a flash for each, and it goes flying."
        ];
        EmogotchiItems.Kind[7] memory kinds = [
            EmogotchiItems.Kind.Cosmetic,
            EmogotchiItems.Kind.Cosmetic,
            EmogotchiItems.Kind.Cosmetic,
            EmogotchiItems.Kind.Cosmetic,
            EmogotchiItems.Kind.Scene,
            EmogotchiItems.Kind.Passive,
            EmogotchiItems.Kind.Passive
        ];
        // head, outfit, accessory, accessory, background, action, action (hints for the site)
        uint8[7] memory slots = [uint8(2), uint8(1), uint8(4), uint8(4), uint8(3), uint8(5), uint8(5)];
        for (uint256 i = 0; i < N; i++) {
            bool holders = i >= 7;
            uint256 k = i % 7;
            bytes memory art = vm.readFileBinary(string.concat("items/emo/", files[k], holders ? "-holder.svg" : ".svg"));
            require(art.length > 0 && art.length < 120_000, "art size");
            EmogotchiItems.CreateParams memory c = ps[i];
            c.name = holders ? string.concat(names[k], " (Holders)") : names[k];
            c.description = string.concat(descriptions[k], holders ? HOLDERS : PAID);
            c.svg = art;
            c.price = holders ? 0 : PRICE; // the holders' edition is free
            c.maxSupply = 0; // unlimited, both editions
            c.perKey = holders ? 1 : 0; // holders': one per wallet (the HoldsGate keys on the wallet); paid: no limit
            c.opens = 0; // at once
            c.closes = 0; // never
            c.kind = kinds[k];
            c.slot = slots[k];
            c.soulbound = holders; // the holders' edition never leaves the wallet that claimed it
            c.gate = holders ? gate : ANY_PET;
        }
    }

    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address gate = vm.envOr("GATE", address(0));
        uint256 count = preflight(items, gate, msg.sender);

        console.log("shop          ", address(items));
        console.log("curator       ", items.curator());
        console.log("items now     ", count);
        console.log("paid gate     ", ANY_PET);

        vm.startBroadcast();
        if (gate == address(0)) gate = address(new HoldsGate(EMO, MIN));
        require(address(HoldsGate(gate).TOKEN()) == EMO && HoldsGate(gate).MIN() == MIN, "the holders' gate is not 7,000 EMO");
        EmogotchiItems.CreateParams[14] memory ps = params(gate);
        for (uint256 i = 0; i < N; i++) {
            uint256 want = FIRST + i;
            if (want <= count) {
                console.log("exists        ", want, ps[i].name); // verified term for term in preflight
                continue;
            }
            uint256 id = items.create(ps[i]);
            require(id == want, "created at an unexpected id");
            verify(items, id, ps[i]);
            console.log("created       ", id, ps[i].name);
        }
        vm.stopBroadcast();

        console.log("holders' gate ", gate, "(pass it as GATE= to resume a run that stopped)");
        for (uint256 i = 0; i < N; i++) {
            console.log(string.concat("  #", vm.toString(FIRST + i), " ", ps[i].name, " | ", ps[i].description));
            console.log("    art bytes", ps[i].svg.length, " slot", ps[i].slot);
        }
        console.log("18-24: 30 MON, any pet, unlimited, no limit per wallet, tradeable, 80/10/10");
        console.log("25-31: free, 7,000 EMO held, unlimited, one per wallet, soulbound");
    }

    /// Every check made before anything is sent; returns the shop's item count. Public so the fork test proves the
    /// refusals. Not a view: it compiles a fresh HoldsGate to compare a given GATE's code (this only ever runs in the
    /// local simulation, before the broadcast starts).
    function preflight(EmogotchiItems items, address gate, address sender) public returns (uint256 count) {
        require(items.curator() == sender, "the broadcaster is not the curator");
        require(items.EMO() == EMO, "the shop burns another EMO than the one the gate would measure");
        // the paid edition's gate: the live AnyPetGate, for this shop. Its only immutable is the shop, so its code is
        // exactly a fresh AnyPetGate's for this shop whatever list of collections it was born with.
        require(
            ANY_PET.codehash == address(new AnyPetGate(address(items), new address[](0))).codehash
                && address(AnyPetGate(ANY_PET).SHOP()) == address(items),
            "ANY_PET is not an AnyPetGate for this shop"
        );

        count = items.itemCount();
        require(count >= BEFORE && count <= BEFORE + N, "the shop does not hold 17 items (plus pack items): the ids would shift");
        if (count > BEFORE) {
            require(gate != address(0), "pack items already exist: pass GATE=<the HoldsGate the first run deployed>");
        }
        if (gate != address(0)) {
            // the code itself, not just the getters: TOKEN and MIN are immutables, part of the runtime code, so a match is
            // exactly "HoldsGate(EMO, 7,000 EMO)" compiled from this repo
            require(gate.codehash == address(new HoldsGate(EMO, MIN)).codehash, "GATE is not HoldsGate(EMO, 7,000 EMO)");
            require(address(HoldsGate(gate).TOKEN()) == EMO && HoldsGate(gate).MIN() == MIN, "GATE is not 7,000 EMO");
            // anything already created must be exactly one of ours, in its place
            EmogotchiItems.CreateParams[14] memory ps = params(gate);
            for (uint256 id = FIRST; id <= count; id++) {
                verify(items, id, ps[id - FIRST]);
            }
        }
    }

    /// The item at `id` is exactly `c`: every stored term, and the stored picture byte for byte. Reverts loudly otherwise.
    function verify(EmogotchiItems items, uint256 id, EmogotchiItems.CreateParams memory c) public view {
        EmogotchiItems.Item memory it = items.item(id);
        string memory at = string.concat("#", vm.toString(id), " ", c.name, ": ");
        require(keccak256(bytes(it.name)) == keccak256(bytes(c.name)), string.concat(at, "the name differs"));
        require(keccak256(bytes(it.description)) == keccak256(bytes(c.description)), string.concat(at, "the description differs"));
        require(it.price == c.price, string.concat(at, "the price differs"));
        require(it.maxSupply == c.maxSupply, string.concat(at, "the max supply differs"));
        require(it.perKey == c.perKey, string.concat(at, "the cap per key differs"));
        require(it.opens == c.opens && it.closes == c.closes, string.concat(at, "the window differs"));
        require(it.kind == c.kind, string.concat(at, "the kind differs"));
        require(it.slot == c.slot, string.concat(at, "the slot differs"));
        require(it.soulbound == c.soulbound, string.concat(at, "soulbound differs"));
        require(it.gate == c.gate, string.concat(at, "the gate differs"));
        require(!it.isSealed, string.concat(at, "it is sealed"));
        bytes memory stored = bytes(items.imageOf(id));
        require(stored.length == c.svg.length && keccak256(stored) == keccak256(c.svg), string.concat(at, "the stored picture is not the card"));
    }
}
