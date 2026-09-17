// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedCatGate} from "../src/gates/NamedCatGate.sol";

/**
 * Deploys the item shop and creates the first item, the witch outfit.
 *
 *   GAME=0x… TREASURY=0x… TEAM=0x… forge script script/DeployItems.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --verify --account emogotchi --sender 0x…
 *
 * The broadcaster becomes the curator (create() is curator-only and happens in this same run); hand the
 * role on afterwards with setCurator if it should live elsewhere. nad.fun addresses default to mainnet.
 * Art comes from contracts/items/*.svg, built by `node tools/items/build-art.mjs`.
 */
contract DeployItems is Script {
    function run() external {
        address game = vm.envAddress("GAME");
        address treasury = vm.envAddress("TREASURY");
        address team = vm.envAddress("TEAM");
        EmogotchiItems.Params memory p;
        p.curator = msg.sender;
        p.treasury = treasury;
        p.team = team;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.emo = vm.envOr("EMO", address(0x81A224F8A62f52BdE942dBF23A56df77A10b7777));
        p.wmon = vm.envOr("WMON", address(0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A));
        p.router = vm.envOr("ROUTER", address(0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137));
        p.lens = vm.envOr("LENS", address(0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea));
        p.pool = vm.envOr("POOL", address(0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D));
        p.maxImpactBps = 50;
        p.collectionSvg = vm.readFileBinary("items/collection.svg");
        bytes memory witch = vm.readFileBinary("items/witch.svg");

        vm.startBroadcast();
        NamedCatGate gate = new NamedCatGate(game);
        EmogotchiItems items = new EmogotchiItems(p);
        items.allowCollection(game, true);
        EmogotchiItems.CreateParams memory c;
        c.name = "Witch outfit";
        c.description =
            "A witch hat with the cat's own studded band and a ruby buckle, and a robe with a lining and stars. Any cat in the wallet that holds it can wear it. One per wallet, for anyone who has named an Emogotchi. 1,000 exist.";
        c.svg = witch;
        c.price = 0;
        c.maxSupply = 1000;
        c.perWallet = 1;
        c.opens = 0;
        c.closes = 0;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 1;
        c.soulbound = false;
        c.gate = address(gate);
        uint256 id = items.create(c);
        vm.stopBroadcast();

        console.log("EmogotchiItems", address(items));
        console.log("NamedCatGate  ", address(gate));
        console.log("Witch outfit id", id);
    }
}
