// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * Adds the Jewish pack to the live shop: five items, created in this order so they land at ids 8-12, which the site
 * expects (`JEWISH_PACK` in apps/web/src/items.ts). The operator's terms (2026-09-28): 36 MON each ("double chai"),
 * 613 of each (the commandments), no per-wallet or per-pet limit, no gate, tradeable, open now and never closing.
 *
 *   8  Kippah              Cosmetic, slot 2 (head)        items/kippah.svg
 *   9  Star of David       Cosmetic, slot 4 (accessory)   items/starofdavid.svg
 *   10 Western Wall theme  Scene,    slot 3 (background)  items/kotel.svg
 *   11 Dreidel             Passive,  slot 5 (action)      items/dreidel.svg    (the site: Play spins the dreidel)
 *   12 Kapparot hen        Passive,  slot 5 (action)      items/kapparot.svg   (the site: Pet becomes kapparot)
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 ~/.foundry/bin/forge script script/CreateJudaica.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --slow --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit --gas-estimate-multiplier 115
 *
 * Dry-run first without --broadcast. It refuses unless the broadcaster is the curator and the shop holds exactly 7
 * items (so the ids come out 8-12), and after each create it reads the item back and checks every term and the stored
 * picture byte for byte. `--slow` matters: without it forge sends every create before checking a receipt, so one failed
 * create would let the next land at a shifted id for ever. The pictures are ~222 KB together (built by
 * `node tools/items/build-art.mjs`); at the Spooky theme's measured rate (~245 gas a byte on Monad) that is about 62M gas in five transactions, the largest ~22M with the margin, roughly 6.5 MON at 102 gwei.
 * Rehearsed on a mainnet fork by test/JudaicaFork.t.sol.
 */
contract CreateJudaica is Script {
    uint128 constant PRICE = 36 ether; // 36 MON
    uint32 constant SUPPLY = 613;
    string constant PACK = " Part of the Jewish pack: 613 in all.";

    function params() public view returns (EmogotchiItems.CreateParams[5] memory ps) {
        string[5] memory names = ["Kippah", "Star of David", "Western Wall theme", "Dreidel", "Kapparot hen"];
        string[5] memory files = ["items/kippah.svg", "items/starofdavid.svg", "items/kotel.svg", "items/dreidel.svg", "items/kapparot.svg"];
        string[5] memory descriptions = [
            "A kippah in the blue and white of Israel's flag, a Star of David on top, with the payot, the curled side locks, that come with it. For any pet, now or later: put it on and your pet wears it, with other outfits too. Crowned pets wear it in gold.",
            "A silver Star of David on a chain, its two triangles woven over and under with the flag's blue inlaid. For any pet, now or later: put it on and your pet wears it, with any outfit. Crowned pets wear it in gold.",
            "The Western Wall for your pet's room: the great stones laid in Herod's time, prayer notes tucked in the cracks, capers growing from the joints, doves on the ledges, floodlit gold at night. A room theme for any pet, now or later: put it on and the room changes.",
            "A dreidel with nun, gimel, hei and shin, for Nes Gadol Haya Sham: a great miracle happened there. Put it on a pet and it plays with the dreidel instead of the ball of yarn: it spins it, sees where it falls, and takes the pot, half, nothing, or puts one in.",
            "The kapparot hen, from the custom before Yom Kippur of circling a hen over the head. Put it on a pet and petting it becomes kapparot: the hen circles its head three times, then flies off."
        ];
        EmogotchiItems.Kind[5] memory kinds = [
            EmogotchiItems.Kind.Cosmetic, EmogotchiItems.Kind.Cosmetic, EmogotchiItems.Kind.Scene, EmogotchiItems.Kind.Passive, EmogotchiItems.Kind.Passive
        ];
        uint8[5] memory slots = [uint8(2), uint8(4), uint8(3), uint8(5), uint8(5)]; // head, accessory, background, action, action (hints for the site)
        for (uint256 i = 0; i < 5; i++) {
            bytes memory art = vm.readFileBinary(files[i]);
            require(art.length > 0 && art.length < 120_000, "art size");
            ps[i].name = names[i];
            ps[i].description = string.concat(descriptions[i], PACK);
            ps[i].svg = art;
            ps[i].price = PRICE;
            ps[i].maxSupply = SUPPLY;
            ps[i].perKey = 0; // no limit per wallet
            ps[i].opens = 0; // open at once
            ps[i].closes = 0; // never closes
            ps[i].kind = kinds[i];
            ps[i].slot = slots[i];
            ps[i].soulbound = false;
            ps[i].gate = address(0); // anyone
        }
    }

    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(items.itemCount() == 7, "the shop does not hold exactly 7 items: the ids would not be 8-12");
        EmogotchiItems.CreateParams[5] memory ps = params();
        console.log("shop    ", address(items));
        console.log("curator ", items.curator());
        for (uint256 i = 0; i < 5; i++) {
            console.log(string.concat("  ", ps[i].name), 8 + i);
            console.log("    art bytes", ps[i].svg.length, " slot", ps[i].slot);
        }
        vm.startBroadcast();
        for (uint256 i = 0; i < 5; i++) {
            uint256 id = items.create(ps[i]);
            require(id == 8 + i, "an item landed at the wrong id");
            EmogotchiItems.Item memory it = items.item(id);
            require(it.price == PRICE && it.maxSupply == SUPPLY && it.perKey == 0 && it.gate == address(0) && !it.soulbound, "terms");
            require(uint8(it.kind) == uint8(ps[i].kind), "kind");
            require(keccak256(bytes(items.imageOf(id))) == keccak256(ps[i].svg), "the stored picture is not the card");
            console.log(string.concat("created ", ps[i].name), id);
        }
        vm.stopBroadcast();
    }
}
