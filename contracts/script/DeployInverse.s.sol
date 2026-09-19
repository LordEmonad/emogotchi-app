// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {ArtDeploy} from "./ArtDeploy.sol";
import {EmogotchiArt} from "../src/EmogotchiArt.sol";

/// Inversegotchi on mainnet (Monad, chain id 143): the art from contracts/art-inversebrah (written by
/// `node tools/bake-art.mjs inversebrah`), then the game over it. No minter, no drop: anyone mints.
/// Every immutable comes from the environment; nothing is defaulted except the split and the nad.fun
/// addresses checked on chain on 2026-09-10 (see README).
///
///   TREASURY=0x… TEAM=0x… SITE_URI=https://emogotchi.emonad.lol/inversebrah \
///   forge script script/DeployInverse.s.sol --rpc-url https://rpc.monad.xyz --broadcast --verify
///
/// SITE_URI is his own path on the site: tokenURI links to <siteURI>/pet/<id>, and the cat already owns /pet/<id>.
/// ART=<address> reuses an art contract already deployed from the same bake (a redeploy of the game alone).
///
/// Afterwards, from the items curator: `WireInverse.s.sol` allows the collection in the item shop and
/// creates the emo hair item.
contract DeployInverse is Script {
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    address constant LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address constant POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;

    function run() external {
        require(block.chainid == 143, "not Monad mainnet");
        Inversegotchi.Params memory p;
        p.welcome = vm.envOr("WELCOME", uint256(7 days));
        p.treasury = vm.envAddress("TREASURY");
        p.team = vm.envAddress("TEAM");
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.emo = EMO;
        p.wmon = WMON;
        p.router = DEX_ROUTER;
        p.lens = LENS;
        p.pool = POOL;
        p.maxImpactBps = vm.envOr("MAX_IMPACT_BPS", uint256(50));
        p.siteURI = vm.envString("SITE_URI");

        // ART=<address> reuses an art contract already on chain (the same bake), so only the game is deployed
        address artAddr = vm.envOr("ART", address(0));
        vm.startBroadcast();
        if (artAddr == address(0)) {
            EmogotchiArt art = ArtDeploy.deployFrom(vm, "art-inversebrah");
            artAddr = address(art);
        } else {
            require(artAddr.code.length > 0, "ART has no code");
            require(bytes(EmogotchiArt(artAddr).image(1, true)).length > 1000, "ART does not answer");
        }
        p.art = artAddr;
        Inversegotchi game = new Inversegotchi(p);
        vm.stopBroadcast();
        console.log("INVERSEGOTCHI", address(game));
        console.log("ART", artAddr);
        console.log("TREASURY", p.treasury);
        console.log("TEAM", p.team);
        console.log("BLOCK", block.number);
    }
}
