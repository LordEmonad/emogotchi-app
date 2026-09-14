// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Base64} from "../src/Emogotchi.sol";

/// The block encoder must agree with the reference encoder on every length and content.
contract Base64Test is Test {
    function testFuzz_matchesReference(bytes memory data) public pure {
        assertEq(Base64.encode(data), vm.toBase64(data));
    }

    function test_lengthsAroundTheBlock() public pure {
        for (uint256 n = 0; n < 80; n++) {
            bytes memory d = new bytes(n);
            for (uint256 i = 0; i < n; i++) d[i] = bytes1(uint8(i * 37 + 11));
            assertEq(Base64.encode(d), vm.toBase64(d));
        }
    }

    function test_large() public pure {
        bytes memory d = new bytes(150_001);
        for (uint256 i = 0; i < d.length; i++) d[i] = bytes1(uint8(i * 7 + 3));
        assertEq(keccak256(bytes(Base64.encode(d))), keccak256(bytes(vm.toBase64(d))));
    }
}
