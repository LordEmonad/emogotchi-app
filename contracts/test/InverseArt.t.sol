// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {EmogotchiArt} from "../src/EmogotchiArt.sol";
import {Inversegotchi} from "../src/Inversegotchi.sol";
import {ArtDeploy} from "../script/ArtDeploy.sol";
import {MockEMO, MockWMON, MockNad} from "./mocks/Mocks.sol";

/// inversebrah's on-chain portraits (contracts/art-inversebrah, from `node tools/bake-art.mjs inversebrah`) must
/// be, byte for byte, the pictures the bake previewed; and the game composes them into tokenURI and contractURI.
contract InverseArtTest is Test {
    EmogotchiArt art;

    function setUp() public {
        art = ArtDeploy.deployFrom(vm, "art-inversebrah");
    }

    function test_everyVariantMatchesThePreview() public view {
        string memory dir = string.concat(vm.projectRoot(), "/art-inversebrah/");
        for (uint8 mood = 0; mood < 9; mood++) {
            for (uint8 c = 0; c < 2; c++) {
                bytes memory got = bytes(art.image(mood, c == 1));
                bytes memory want = vm.readFileBinary(string.concat(dir, "expected-", vm.toString(uint256(mood) * 2 + c), ".svg"));
                assertEq(got.length, want.length, "length");
                assertEq(keccak256(got), keccak256(want), "bytes");
                assertEq(got[0], "<");
                assertEq(got[got.length - 1], ">");
            }
        }
    }

    function test_tokenURIWithRealArt() public {
        vm.warp(1_800_000_000);
        MockEMO emo = new MockEMO();
        MockWMON wmon = new MockWMON();
        address pool = address(0x900D);
        MockNad nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        Inversegotchi.Params memory p;
        p.welcome = 7 days;
        p.treasury = address(0x7EA);
        p.team = address(0x7E4);
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.emo = address(emo);
        p.wmon = address(wmon);
        p.router = address(nad);
        p.lens = address(nad);
        p.pool = pool;
        p.maxImpactBps = 50;
        p.art = address(art);
        p.siteURI = "https://emogotchi.emonad.lol";
        Inversegotchi g = new Inversegotchi(p);
        g.mint();
        uint256 g0 = gasleft();
        string memory uri = g.tokenURI(1);
        console.log("tokenURI gas", g0 - gasleft(), "bytes", bytes(uri).length);
        assertEq(bytes(uri).length > 80_000, true);
        // fresh: happy, no crown
        assertEq(keccak256(bytes(g.imageOf(1))), keccak256(bytes(art.image(1, false))));
        string memory cu = g.contractURI();
        assertEq(bytes(cu).length > 60_000, true);
        assertEq(bytes(cu)[0], "d");
    }
}
