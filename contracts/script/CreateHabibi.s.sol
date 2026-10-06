// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedPetGate} from "../src/gates/NamedPetGate.sol";

/**
 * Adds the Habibi pack to the live shop: five items, created in this order so they land at ids 13-17, which the site
 * expects (`HABIBI_PACK` in apps/web/src/items.ts). The operator's terms (2026-09-28): FREE, 1,001 of each (the Thousand
 * and One Nights), one of each per living, named pet: the Halloween items' rule, through the NamedPetGate already live at
 * 0x0f7f0AEA1A748f4e521eFC874FBa2e5Bd6F0B515 (it keys on the pet, so a pet claims each item once, and it follows the
 * shop's allowed collections: cats, inversebrahs and Sahurs). Tradeable, open now and never closing.
 *
 *   13 Keffiyeh      Cosmetic, slot 2 (head)        items/keffiyeh.svg
 *   14 Bisht         Cosmetic, slot 1 (outfit)      items/bisht.svg
 *   15 Majlis theme  Scene,    slot 3 (background)  items/majlis.svg
 *   16 Darbuka       Passive,  slot 5 (action)      items/darbuka.svg   (the site: Play plays the darbuka)
 *   17 Falcon        Passive,  slot 5 (action)      items/falcon.svg    (the site: Pet becomes the falcon)
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 ~/.foundry/bin/forge script script/CreateHabibi.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --slow --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit --gas-estimate-multiplier 115
 *
 * Dry-run first without --broadcast. It refuses unless the broadcaster is the curator, the shop holds exactly 12 items (so
 * the ids come out 13-17) and the gate is a NamedPetGate for this shop (its code compared, not a getter); after each
 * create it reads the item back and checks every term and the stored picture byte for byte. `--slow` matters: without
 * it forge sends every create before checking a receipt, so one failed create would let the next land at a shifted id for
 * ever. The pictures are ~270 KB together (`node tools/items/build-art.mjs`); at ~245 gas a byte on Monad that is about
 * 70M gas in five transactions, roughly 7-8 MON at 102 gwei (keep ~15 MON in the curator wallet).
 * Rehearsed on a mainnet fork by test/HabibiFork.t.sol.
 */
contract CreateHabibi is Script {
    address constant GATE = 0x0f7f0AEA1A748f4e521eFC874FBa2e5Bd6F0B515;   // NamedPetGate (the Halloween items')
    uint32 constant SUPPLY = 1001;
    string constant PACK = " Part of the Habibi pack: free, one for every living, named pet, 1,001 in all.";

    function params() public view returns (EmogotchiItems.CreateParams[5] memory ps) {
        string[5] memory names = ["Keffiyeh", "Bisht", "Majlis theme", "Darbuka", "Falcon"];
        string[5] memory files = ["items/keffiyeh.svg", "items/bisht.svg", "items/majlis.svg", "items/darbuka.svg", "items/falcon.svg"];
        string[5] memory descriptions = [
            "The red and white keffiyeh, the shemagh, held on by the black agal. For any pet, now or later: put it on and your pet wears it, with other outfits too. Crowned pets wear the golden agal of the old kings.",
            "The bisht, the cloak worn open over the thobe for weddings and great days, black wool edged with gold embroidery. An outfit for any pet, now or later. Crowned pets wear the golden bisht.",
            "A majlis for your pet's room: the room where guests are welcomed, cushions along the walls, lanterns, coffee in the dallah, and Dubai through the window by day and by night. A room theme for any pet, now or later.",
            "A darbuka, the goblet drum of weddings and parties. Put it on a pet and it plays the drum instead of the ball of yarn: doum, tek, tek, doum, tek, the maqsum.",
            "A falcon, the bird of the Gulf's oldest sport. Put it on a pet and petting it calls the falcon: it glides in, lands on your pet, gets a stroke and flies off."
        ];
        EmogotchiItems.Kind[5] memory kinds = [
            EmogotchiItems.Kind.Cosmetic, EmogotchiItems.Kind.Cosmetic, EmogotchiItems.Kind.Scene, EmogotchiItems.Kind.Passive, EmogotchiItems.Kind.Passive
        ];
        uint8[5] memory slots = [uint8(2), uint8(1), uint8(3), uint8(5), uint8(5)]; // head, outfit, background, action, action (hints for the site)
        for (uint256 i = 0; i < 5; i++) {
            bytes memory art = vm.readFileBinary(files[i]);
            require(art.length > 0 && art.length < 120_000, "art size");
            ps[i].name = names[i];
            ps[i].description = string.concat(descriptions[i], PACK);
            ps[i].svg = art;
            ps[i].price = 0; // free
            ps[i].maxSupply = SUPPLY;
            ps[i].perKey = 1; // one per pet: the gate's key is the pet
            ps[i].opens = 0; // open at once
            ps[i].closes = 0; // never closes
            ps[i].kind = kinds[i];
            ps[i].slot = slots[i];
            ps[i].soulbound = false; // tradeable
            ps[i].gate = GATE;
        }
    }

    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(items.itemCount() == 12, "the shop does not hold exactly 12 items: the ids would not be 13-17");
        require(GATE.codehash == address(new NamedPetGate(address(items))).codehash, "GATE is not a NamedPetGate for this shop");
        EmogotchiItems.CreateParams[5] memory ps = params();
        console.log("shop    ", address(items));
        console.log("curator ", items.curator());
        console.log("gate    ", GATE);
        for (uint256 i = 0; i < 5; i++) {
            console.log(string.concat("  ", ps[i].name), 13 + i);
            console.log("    art bytes", ps[i].svg.length, " slot", ps[i].slot);
        }
        vm.startBroadcast();
        for (uint256 i = 0; i < 5; i++) {
            uint256 id = items.create(ps[i]);
            require(id == 13 + i, "an item landed at the wrong id");
            EmogotchiItems.Item memory it = items.item(id);
            require(it.price == 0 && it.maxSupply == SUPPLY && it.perKey == 1 && it.gate == GATE && !it.soulbound, "terms");
            require(uint8(it.kind) == uint8(ps[i].kind), "kind");
            require(keccak256(bytes(items.imageOf(id))) == keccak256(ps[i].svg), "the stored picture is not the card");
            console.log(string.concat("created ", ps[i].name), id);
        }
        vm.stopBroadcast();
    }
}
