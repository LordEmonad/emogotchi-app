// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * Adds the Backrooms theme to the live shop: a room for any pet (kind Scene), the Spooky theme's terms exactly.
 * Anyone, any wallet, no gate, no cap, no end: it is a theme for every pet there will ever be.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 PRICE=0 forge script script/CreateBackrooms.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --slow --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit --gas-estimate-multiplier 115
 *
 * PRICE is in wei (0 = free). The broadcaster must be the curator. The art is contracts/items/backrooms.svg
 * (about 21 KB, built by `node tools/items/build-art.mjs`), so the create is a few million gas. Dry-run first
 * without --broadcast: it prints the item id it would get. The site expects it to be item 7 (SCENE_ITEMS in
 * apps/web/src/items.ts); if the shop has moved on, change that mapping to whatever the dry run prints.
 */
contract CreateBackrooms is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        uint128 price = uint128(vm.envOr("PRICE", uint256(0)));
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        bytes memory art = vm.readFileBinary("items/backrooms.svg");
        require(art.length > 0 && art.length < 120_000, "art size");
        EmogotchiItems.CreateParams memory c;
        c.name = "Backrooms theme";
        c.description =
            "The Backrooms for your pet: mono-yellow wallpaper, damp carpet, a drop ceiling of humming fluorescent panels, walls going off at odd angles into more of the same. A room theme for any pet, now or later: put it on and the room changes. Anyone can claim one; there is no limit.";
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
        console.log("Backrooms theme id", id);
    }
}
