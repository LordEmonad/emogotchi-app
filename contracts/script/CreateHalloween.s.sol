// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedPetGate} from "../src/gates/NamedPetGate.sol";

/**
 * The three Halloween items: Pumpkin head (4), Mummy wraps (5), Zombie (6). Each is free, 100 in all, tradeable,
 * and claimed with a living, named pet of any collection the shop allows, one per pet (NamedPetGate keys on the
 * pet). Deploys the gate unless GATE names one already deployed, then creates whichever of the three do not
 * exist yet, in order, so a run that stopped half way can simply be run again.
 *
 *   Dry run (prints everything, sends nothing):
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 forge script script/CreateHalloween.s.sol \
 *     --rpc-url https://rpc.monad.xyz --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74
 *
 *   For real: the same with --broadcast --slow --account emogotchi --disable-code-size-limit --gas-estimate-multiplier 130
 *   (and GATE=<address> on a second run if the first deployed the gate and then stopped).
 *
 *   --slow is required: it sends one transaction at a time and stops at the first failed receipt, so a create that
 *   fails can never let the next one land at a shifted id (the site maps items by id, and ids are forever).
 *
 * The broadcaster must be the curator. The ids are fixed at 4, 5 and 6 because the site maps them by id: the
 * script refuses to run if the shop does not hold exactly items 1-3 plus any of these three already made. Art
 * comes from contracts/items/{pumpkin,mummy,zombie}.svg, built by `node tools/items/build-art.mjs`; at about 200
 * gas a byte the creates are roughly 11M, 10M and 6M gas, each well under Monad's 30M per transaction, and Monad
 * charges the gas limit. Item terms and art can never be changed after create: read the dry run before sending.
 */
contract CreateHalloween is Script {
    address constant GAME = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant INVERSE = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    uint256 constant FIRST_ID = 4;

    string constant RULE = " Free for a living, named pet of any kind: one per pet, 100 in all.";

    /// The three items' terms, in id order. Public so the fork test creates exactly what this script creates.
    function params(address gate) public view returns (EmogotchiItems.CreateParams[3] memory ps) {
        string[3] memory names = ["Pumpkin head", "Mummy wraps", "Zombie"];
        string[3] memory descriptions = [
            string.concat("A carved pumpkin your pet wears over its whole head. You can still see its eyes.", RULE),
            string.concat("Old bandages that wrap your pet from head to tail.", RULE),
            string.concat("Turns your pet into a zombie, stitches and brain included.", RULE)
        ];
        string[3] memory files = ["items/pumpkin.svg", "items/mummy.svg", "items/zombie.svg"];
        uint8[3] memory slots = [uint8(2), uint8(1), uint8(1)]; // head, outfit, outfit (a hint for the site)
        for (uint256 i = 0; i < 3; i++) {
            bytes memory art = vm.readFileBinary(files[i]);
            require(art.length > 0 && art.length < 120_000, "art size");
            EmogotchiItems.CreateParams memory c = ps[i];
            c.name = names[i];
            c.description = descriptions[i];
            c.svg = art;
            c.price = 0; // free
            c.maxSupply = 100;
            c.perKey = 1; // one per pet: the gate's key is the pet
            c.opens = 0; // at once
            c.closes = 0; // never
            c.kind = EmogotchiItems.Kind.Cosmetic;
            c.slot = slots[i];
            c.soulbound = false; // tradeable
            c.gate = gate;
        }
    }

    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address gate = vm.envOr("GATE", address(0));
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(items.collectionAllowed(GAME) && items.collectionAllowed(INVERSE), "the shop does not allow both pets");
        uint256 count = items.itemCount();
        require(count >= FIRST_ID - 1 && count <= FIRST_ID + 2, "the shop must hold items 1-3 (plus any of these three)");
        if (gate != address(0)) {
            // the code itself, not one getter (another gate for this shop, e.g. the emo hair's, also answers SHOP()); the
            // immutable SHOP is part of the runtime code, so a match is exactly "a NamedPetGate for this shop". This
            // `new` is outside the broadcast: it only runs in the local simulation.
            require(gate.codehash == address(new NamedPetGate(address(items))).codehash, "GATE is not a NamedPetGate for this shop");
        }
        // anything already created must be exactly one of ours, with our gate
        for (uint256 id = FIRST_ID; id <= count; id++) {
            EmogotchiItems.Item memory it = items.item(id);
            require(gate != address(0) && it.gate == gate, "an existing item uses another gate: pass GATE");
        }

        console.log("shop        ", address(items));
        console.log("curator     ", items.curator());
        console.log("items now   ", count);

        vm.startBroadcast();
        if (gate == address(0)) gate = address(new NamedPetGate(address(items)));
        EmogotchiItems.CreateParams[3] memory ps = params(gate);
        for (uint256 i = 0; i < 3; i++) {
            uint256 want = FIRST_ID + i;
            if (want <= count) {
                require(keccak256(bytes(items.item(want).name)) == keccak256(bytes(ps[i].name)), "an existing item is not the one expected");
                console.log("exists      ", want, ps[i].name);
                continue;
            }
            uint256 id = items.create(ps[i]);
            require(id == want, "created at an unexpected id");
            console.log("created     ", id, ps[i].name);
        }
        vm.stopBroadcast();

        console.log("gate        ", gate);
        for (uint256 i = 0; i < 3; i++) {
            console.log(string.concat("  #", vm.toString(FIRST_ID + i), " ", ps[i].name, " | ", ps[i].description));
            console.log("    art bytes", ps[i].svg.length, " slot", ps[i].slot);
        }
        console.log("each: free, 100 in all, one per pet, tradeable, opens now, never closes");
    }
}
