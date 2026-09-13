// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Emogotchi} from "../src/Emogotchi.sol";

/// Mainnet (Monad, chain id 143). Every immutable comes from the environment; nothing is defaulted
/// except the split and the nad.fun addresses checked on chain on 2026-09-10 (see README).
///
///   MINTER=0x… TREASURY=0x… TEAM=0x… BASE_URI=ipfs://<cid> SITE_URI=https://emogotchi.emonad.lol \
///   forge script script/Deploy.s.sol --rpc-url https://rpc.monad.xyz --broadcast --verify
contract Deploy is Script {
    address constant EMO = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    address constant LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address constant POOL = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;

    function run() external {
        require(block.chainid == 143, "not Monad mainnet");
        Emogotchi.Params memory p;
        p.minter = vm.envAddress("MINTER");
        p.maxSupply = vm.envOr("MAX_SUPPLY", uint256(100_000));
        p.welcome = vm.envOr("WELCOME", uint256(7 days));
        p.treasury = vm.envAddress("TREASURY");
        p.team = vm.envAddress("TEAM");
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.reviveBurnBps = 5000;
        p.emo = vm.envOr("EMO", EMO);
        p.wmon = vm.envOr("WMON", WMON);
        p.router = vm.envOr("ROUTER", DEX_ROUTER);
        p.lens = vm.envOr("LENS", LENS);
        p.pool = vm.envOr("POOL", POOL);
        p.maxImpactBps = vm.envOr("MAX_IMPACT_BPS", uint256(50));
        p.baseURI = vm.envString("BASE_URI");
        p.siteURI = vm.envString("SITE_URI");

        vm.startBroadcast();
        Emogotchi game = new Emogotchi(p);
        vm.stopBroadcast();
        console.log("EMOGOTCHI", address(game));
        console.log("MINTER", p.minter);
        console.log("TREASURY", p.treasury);
        console.log("TEAM", p.team);
        console.log("BLOCK", block.number);
    }
}
