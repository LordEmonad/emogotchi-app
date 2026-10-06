// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {R3tardgotchi} from "../src/R3tardgotchi.sol";
import {ArtDeploy} from "./ArtDeploy.sol";
import {EmogotchiArt} from "../src/EmogotchiArt.sol";

/// R3tardgotchi on mainnet (Monad, chain id 143): his art from contracts/art-r3tards (written by
/// `node tools/bake-art.mjs r3tards`), then the game over it. Thiccums' deploy to the letter, his files and his path.
/// No minter, no drop: anyone mints.
///
///   TREASURY=0x18c13CAF92b3fC078156E411A87524D7EcC88aA2 TEAM=0xB7EEE0445afc7651025b06974F3BdeEdf8840439 \
///   SITE_URI=https://emogotchi.emonad.lol/r3tardgotchi \
///   forge script script/DeployR3tards.s.sol --rpc-url https://rpc.monad.xyz --broadcast --slow --verify --verifier sourcify \
///     --account emogotchi --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --disable-code-size-limit
///
/// SITE_URI is his own path on the site: tokenURI links to <siteURI>/pet/<id> (the cat owns /pet/<id>, inversebrah
/// /inversebrah/pet/<id>, Sahur /tung/pet/<id>, Thiccums /thiccums/pet/<id>). contractURI's banner and featured image are
/// <siteURI>/brand/r3tardgotchi-opensea-{banner,featured}.png, so those two files must be served under his path too. ART=<address> reuses an art contract already deployed from the same bake (a redeploy of
/// the game alone). `--slow` because a failed art chunk must stop the run before the game is created over it.
///
/// Afterwards, from the items curator: `WireR3tards.s.sol` allows the collection in the item shop (every item that
/// follows `collectionAllowed`, the hair and the Halloween three among them, is then his too).
contract DeployR3tards is Script {
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    address constant LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address constant POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;

    function run() external {
        require(block.chainid == 143, "not Monad mainnet");
        R3tardgotchi.Params memory p;
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
        require(bytes(p.siteURI).length > 0, "SITE_URI");

        address artAddr = vm.envOr("ART", address(0));
        vm.startBroadcast();
        if (artAddr == address(0)) {
            EmogotchiArt art = ArtDeploy.deployFrom(vm, "art-r3tards");
            artAddr = address(art);
        } else {
            require(artAddr.code.length > 0, "ART has no code");
            require(bytes(EmogotchiArt(artAddr).image(1, true)).length > 1000, "ART does not answer");
        }
        p.art = artAddr;
        R3tardgotchi game = new R3tardgotchi(p);
        vm.stopBroadcast();
        console.log("R3TARDGOTCHI", address(game));
        console.log("ART", artAddr);
        console.log("TREASURY", p.treasury);
        console.log("TEAM", p.team);
        console.log("BLOCK", block.number);
    }
}
