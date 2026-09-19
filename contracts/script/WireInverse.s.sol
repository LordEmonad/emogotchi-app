// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {AnyPetGate} from "../src/gates/AnyPetGate.sol";

/**
 * After DeployInverse: from the shop's curator, in one run,
 *   1. allow the Inversegotchi collection in the item shop, so every item (the witch outfit, the Spooky theme,
 *      everything after) can be put on an inversebrah;
 *   2. deploy AnyPetGate over the shop, knowing the cat and inversebrah, so an item can ask "do you hold any pet
 *      the shop allows" (future pets qualify the moment they are allowed; nothing here changes);
 *   3. create the Emo hair: free, one per wallet, 1000 in all, cosmetic, gated on holding any pet. The cat has
 *      its own hair, so the site does not draw it on cats; on chain it is a pet item like every other.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 GAME=0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5 \
 *   INVERSE=0x… forge script script/WireInverse.s.sol --rpc-url https://rpc.monad.xyz --broadcast \
 *     --account emogotchi --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit \
 *     --gas-estimate-multiplier 130
 *
 * Give the small curator calls room: forge estimates at Ethereum prices and Monad's cold access costs more
 * (allowCollection ran out of gas at launch with the default estimate). The art is about 23 KB, so the create
 * is a few million gas. Dry-run first without --broadcast.
 */
contract WireInverse is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address game = vm.envAddress("GAME");
        address inverse = vm.envAddress("INVERSE");
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(items.collectionAllowed(game), "the cat is not allowed?");
        require(inverse.code.length > 0, "INVERSE has no code");
        bytes memory art = vm.readFileBinary("items/emohair.svg");
        require(art.length > 0 && art.length < 120_000, "art size");

        address[] memory known = new address[](2);
        known[0] = game;
        known[1] = inverse;

        EmogotchiItems.CreateParams memory c;
        c.name = "Emo hair";
        c.description =
            "A black emo fringe, swept down over one eye: the look the cat was born with, for the pets that were not. Free for anyone who holds a pet, one per wallet, 1,000 in all. Put it on a pet and it wears it; a crowned pet wears it gold.";
        c.svg = art;
        c.price = 0;
        c.maxSupply = 1000;
        c.perKey = 1; // one per wallet: the gate keys on the wallet
        c.opens = 0;
        c.closes = 0;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2; // head
        c.soulbound = false;

        console.log("shop        ", address(items));
        console.log("curator     ", items.curator());
        console.log("inversegotchi", inverse);
        console.log("next item id", items.itemCount() + 1);
        console.log("art bytes   ", art.length);

        vm.startBroadcast();
        if (!items.collectionAllowed(inverse)) items.allowCollection(inverse);
        AnyPetGate gate = new AnyPetGate(address(items), known);
        c.gate = address(gate);
        uint256 id = items.create(c);
        vm.stopBroadcast();
        console.log("AnyPetGate", address(gate));
        console.log("Emo hair id", id);
    }
}
