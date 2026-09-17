// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {NamedCatGate} from "../src/gates/NamedCatGate.sol";

interface IName {
    function name() external view returns (string memory);
    function TREASURY() external view returns (address);
    function TEAM() external view returns (address);
}

/**
 * Deploys the item shop and creates the first item, the witch outfit.
 *
 *   GAME=0x… TREASURY=0x… TEAM=0x… forge script script/DeployItems.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --verify --verifier sourcify --account emogotchi \
 *     --sender 0x… --disable-code-size-limit
 *
 * The broadcaster becomes the curator (create() is curator-only and happens in this same run); hand the
 * role on afterwards with setCurator if it should live elsewhere. On Monad mainnet (chain 143) the nad.fun
 * addresses are pinned here and env overrides are refused, so a stale variable from a rehearsal cannot be
 * baked into an immutable; elsewhere EMO/WMON/ROUTER/LENS/POOL come from env. GAME must answer
 * name() == "Emogotchi". Every resolved address is printed before anything is broadcast. Needs
 * --disable-code-size-limit: both SVGs are over Ethereum's 24 KB as SSTORE2 pointers, under Monad's 128 KB.
 * Art comes from contracts/items/*.svg, built by `node tools/items/build-art.mjs`.
 */
contract DeployItems is Script {
    function run() external {
        address game = vm.envAddress("GAME");
        address treasury = vm.envAddress("TREASURY");
        address team = vm.envAddress("TEAM");
        require(game.code.length > 0, "GAME has no code");
        require(keccak256(bytes(IName(game).name())) == keccak256("Emogotchi"), "GAME is not the Emogotchi game");
        require(treasury != address(0) && team != address(0) && treasury != team, "TREASURY/TEAM");
        if (block.chainid == 143) {
            // the shop pays the same wallets as the game; refuse anything else on mainnet
            require(IName(game).TREASURY() == treasury, "TREASURY differs from the game's");
            require(IName(game).TEAM() == team, "TEAM differs from the game's");
        }
        EmogotchiItems.Params memory p;
        p.curator = msg.sender;
        p.treasury = treasury;
        p.team = team;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        if (block.chainid == 143) {
            require(
                !vm.envExists("EMO") && !vm.envExists("WMON") && !vm.envExists("ROUTER") && !vm.envExists("LENS")
                    && !vm.envExists("POOL"),
                "mainnet: unset EMO/WMON/ROUTER/LENS/POOL, they are pinned"
            );
            p.emo = 0x81A224F8A62f52BdE942dBF23A56df77A10b7777;
            p.wmon = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
            p.router = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
            p.lens = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
            p.pool = 0x714A2694C8d4f0B1bfbA0E5b76240E439df2182D;
        } else {
            p.emo = vm.envAddress("EMO");
            p.wmon = vm.envAddress("WMON");
            p.router = vm.envAddress("ROUTER");
            p.lens = vm.envAddress("LENS");
            p.pool = vm.envAddress("POOL");
        }
        p.maxImpactBps = 50;
        console.log("chain      ", block.chainid);
        console.log("curator    ", msg.sender);
        console.log("game       ", game);
        console.log("treasury   ", treasury);
        console.log("team       ", team);
        console.log("emo        ", p.emo);
        console.log("wmon       ", p.wmon);
        console.log("router     ", p.router);
        console.log("lens       ", p.lens);
        console.log("pool       ", p.pool);
        p.collectionSvg = vm.readFileBinary("items/collection.svg");
        bytes memory witch = vm.readFileBinary("items/witch.svg");

        vm.startBroadcast();
        NamedCatGate gate = new NamedCatGate(game);
        EmogotchiItems items = new EmogotchiItems(p);
        items.allowCollection(game);
        EmogotchiItems.CreateParams memory c;
        c.name = "Witch outfit";
        c.description =
            "A witch hat with the cat's own studded band and a ruby buckle; worn, it comes with a robe with a lining and stars. Any cat in the wallet that holds it can wear it. One per living named Emogotchi, claimed by the cat's owner. At most 200 will ever exist.";
        c.svg = witch;
        c.price = 0;
        c.maxSupply = 200;
        c.perKey = 1;
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
