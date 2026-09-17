// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {MockEMO, MockWMON, MockNad} from "./mocks/Mocks.sol";

/// @dev The real on-chain art round-trips, and what the first item costs to add.
///      Run with --disable-code-size-limit: the SVGs are over Ethereum's 24 KB, under Monad's 128 KB.
contract ItemsArtTest is Test {
    function test_realArtRoundTrips_andCosts() public {
        MockEMO emo = new MockEMO();
        MockWMON wmon = new MockWMON();
        MockNad nad = new MockNad(emo, wmon, address(0x900D), 10_000 ether, 42_000_000 ether);
        EmogotchiItems.Params memory q;
        q.curator = address(this);
        q.treasury = makeAddr("t");
        q.team = makeAddr("m");
        q.treasuryBps = 1000;
        q.teamBps = 1000;
        q.emo = address(emo);
        q.wmon = address(wmon);
        q.router = address(nad);
        q.lens = address(nad);
        q.pool = address(0x900D);
        q.maxImpactBps = 50;
        q.collectionSvg = vm.readFileBinary("items/collection.svg");
        uint256 g0 = gasleft();
        EmogotchiItems items = new EmogotchiItems(q);
        console.log("deploy gas (with collection art)", g0 - gasleft());

        bytes memory witch = vm.readFileBinary("items/witch.svg");
        EmogotchiItems.CreateParams memory c;
        c.name = "Witch outfit";
        c.description = "d";
        c.svg = witch;
        c.maxSupply = 200;
        c.perKey = 1;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 1;
        uint256 g1 = gasleft();
        uint256 id = items.create(c);
        console.log("create gas (witch, %d bytes of svg)", witch.length, g1 - gasleft());
        assertEq(keccak256(bytes(items.imageOf(id))), keccak256(witch));
        assertGt(bytes(items.uri(id)).length, witch.length);
        assertGt(bytes(items.contractURI()).length, 1000);
    }
}
