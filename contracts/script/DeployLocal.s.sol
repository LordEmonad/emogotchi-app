// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {MockEMO, MockWMON, MockNad} from "../test/mocks/Mocks.sol";
import {ArtDeploy} from "./ArtDeploy.sol";
import {EmogotchiArt} from "../src/EmogotchiArt.sol";

/// Testnet / anvil: mock EMO, WMON and a nad.fun stand-in, then the game. Monad testnet (10143) has
/// neither EMO nor nad.fun, so the burn goes through the mock pool there.
///
///   forge script script/DeployLocal.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast \
///     --sender <deployer> --keystore ~/.monskills/keystore/<file> --password '' --disable-code-size-limit
///
/// `--sender` makes the broadcaster the default MINTER / TREASURY / TEAM (msg.sender is read before the
/// broadcast starts); `--disable-code-size-limit` because the game is 30.7 KB and forge simulates with
/// Ethereum's 24 KB limit while Monad allows 128 KB.
///
/// Env (all optional): TREASURY, TEAM, MINTER (defaults to the broadcaster), MAX_SUPPLY (1000),
/// WELCOME (7 days), SITE_URI, MINT_TO + MINT_COUNT to mint test cats right away. The art (contracts/art)
/// is deployed first, in chunks, then the game points at it.
contract DeployLocal is Script {
    function run() external {
        address broadcaster = msg.sender;
        vm.startBroadcast();
        MockEMO emo = new MockEMO();
        MockWMON wmon = new MockWMON();
        address pool = address(0x900D);
        MockNad nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        // ART=0x… reuses an art contract already on this chain (the portraits do not change between game deploys)
        address artAddr = vm.envOr("ART", address(0));
        EmogotchiArt art = artAddr == address(0) ? ArtDeploy.deploy(vm) : EmogotchiArt(artAddr);

        Emogotchi.Params memory p;
        p.minter = vm.envOr("MINTER", broadcaster);
        p.maxSupply = vm.envOr("MAX_SUPPLY", uint256(1000));
        p.welcome = vm.envOr("WELCOME", uint256(7 days));
        p.treasury = vm.envOr("TREASURY", broadcaster);
        p.team = vm.envOr("TEAM", broadcaster);
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.reviveBurnBps = 5000;
        p.emo = address(emo);
        p.wmon = address(wmon);
        p.router = address(nad);
        p.lens = address(nad);
        p.pool = pool;
        p.maxImpactBps = 50;
        p.art = address(art);
        p.siteURI = vm.envOr("SITE_URI", string("https://emogotchi.emonad.lol"));
        Emogotchi game = new Emogotchi(p);

        address mintTo = vm.envOr("MINT_TO", address(0));
        uint256 mintCount = vm.envOr("MINT_COUNT", uint256(0));
        if (mintTo != address(0) && mintCount > 0) game.mintMany(mintTo, mintCount);
        vm.stopBroadcast();

        console.log("EMOGOTCHI", address(game));
        console.log("EMO", address(emo));
        console.log("NAD", address(nad));
        console.log("ART", address(art));
        console.log("MINTER", p.minter);
        console.log("BLOCK", block.number);
    }
}
