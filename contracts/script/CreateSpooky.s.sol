// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * Adds the second item to the live shop: the Spooky theme, a room for the cat (kind Scene). Anyone,
 * any wallet, no gate, no cap, no end: it is a theme for every pet there will ever be.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 PRICE=0 forge script script/CreateSpooky.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit --gas-estimate-multiplier 115
 *
 * PRICE is in wei (0 = free; 1 MON = 1000000000000000000). The broadcaster must be the curator. The art
 * is about 100 KB, so the create costs about 24.6M gas: a 1.15 multiplier stays under Monad's 30M cap per
 * transaction (1.3 does not), and Monad charges the limit, about 2.9 MON at 100 gwei. Art
 * comes from contracts/items/spooky.svg, built by `node tools/items/build-art.mjs`. Dry-run first
 * without --broadcast: it prints the item id it would get and the exact text that will be baked.
 */
contract CreateSpooky is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        uint128 price = uint128(vm.envOr("PRICE", uint256(0)));
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        bytes memory art = vm.readFileBinary("items/spooky.svg");
        require(art.length > 0 && art.length < 120_000, "art size");
        EmogotchiItems.CreateParams memory c;
        c.name = "Spooky theme";
        c.description =
            "A haunted room for your cat: a harvest moon, bats, cobwebs, a dead tree with a spider, a graveyard fence, a tombstone and jack-o'-lanterns lighting the ground. A room theme for any pet, now or later: put it on and the room changes. Anyone can claim one; there is no limit.";
        c.svg = art;
        c.price = price;
        c.maxSupply = 0; // unlimited
        c.perKey = 0; // no cap
        c.opens = 0;
        c.closes = 0;
        c.kind = EmogotchiItems.Kind.Scene;
        c.slot = 3; // background
        c.soulbound = false;
        c.gate = address(0);
        console.log("shop        ", address(items));
        console.log("curator     ", items.curator());
        console.log("next item id", items.itemCount() + 1);
        console.log("price (wei) ", price);
        console.log("art bytes   ", art.length);
        vm.startBroadcast();
        uint256 id = items.create(c);
        vm.stopBroadcast();
        console.log("Spooky theme id", id);
    }
}
