// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {EmogotchiArt, SSTORE2} from "../src/EmogotchiArt.sol";

/// @dev Reads contracts/art/* (written by `node tools/bake-art.mjs`) and deploys the art: every blob in
///      chunks of at most CHUNK bytes (Monad allows 128 KB of code, Foundry's local EVM 24 KB), then the
///      EmogotchiArt contract over them. Used by the deploy scripts and the tests.
library ArtDeploy {
    uint256 internal constant CHUNK = 24_000;

    function deploy(Vm vm) internal returns (EmogotchiArt art) {
        string memory dir = string.concat(vm.projectRoot(), "/art/");
        bytes[] memory blobs = new bytes[](37);
        blobs[0] = vm.readFileBinary(string.concat(dir, "base.bin"));
        for (uint256 i = 0; i < 18; i++) {
            blobs[1 + i] = vm.readFileBinary(string.concat(dir, "patch-", vm.toString(i), ".bin"));
        }
        for (uint256 m = 0; m < 9; m++) {
            blobs[19 + m] = vm.readFileBinary(string.concat(dir, "scene-", vm.toString(m), "-pre.bin"));
            blobs[28 + m] = vm.readFileBinary(string.concat(dir, "scene-", vm.toString(m), "-post.bin"));
        }
        // count chunks
        uint256 count;
        for (uint256 b = 0; b < blobs.length; b++) {
            count += (blobs[b].length + CHUNK - 1) / CHUNK;
        }
        address[] memory chunks = new address[](count);
        uint32[] memory starts = new uint32[](blobs.length + 1);
        uint256 k;
        for (uint256 b = 0; b < blobs.length; b++) {
            starts[b] = uint32(k);
            bytes memory data = blobs[b];
            for (uint256 off = 0; off < data.length; off += CHUNK) {
                uint256 n = data.length - off < CHUNK ? data.length - off : CHUNK;
                bytes memory part = new bytes(n);
                for (uint256 i = 0; i < n; i++) {
                    part[i] = data[off + i];
                }
                chunks[k++] = SSTORE2.write(part);
            }
        }
        starts[blobs.length] = uint32(k);
        bytes memory offBytes = vm.readFileBinary(string.concat(dir, "offsets.bin"));
        uint32[] memory offsets = new uint32[](offBytes.length / 4);
        for (uint256 i = 0; i < offsets.length; i++) {
            offsets[i] = uint32(uint8(offBytes[i * 4])) << 24 | uint32(uint8(offBytes[i * 4 + 1])) << 16 | uint32(uint8(offBytes[i * 4 + 2])) << 8 | uint32(uint8(offBytes[i * 4 + 3]));
        }
        art = new EmogotchiArt(chunks, starts, offsets);
    }
}
