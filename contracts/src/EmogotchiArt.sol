// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title EmogotchiArt
 * @notice The wallet portraits, entirely on chain. The cat drawing is stored once as contract code
 *         (SSTORE2), with a 0x01 byte wherever a mood changes an attribute; each of the 18 variants
 *         (9 moods x crown) is a small list of values for those places; each mood has a scene
 *         (background, moon, props) split into the part before the cat and the part after.
 *         `image(mood, crowned)` splices them into one SVG. Immutable: no setters, no owner.
 *
 *         Blob order: 0 = base, 1..18 = variant patches (mood*2 + crown), 19..27 = scene pre per
 *         mood, 28..36 = scene post per mood. Every blob is one or more code chunks.
 */
contract EmogotchiArt {
    error BadLayout();
    error BadMood();

    uint256 public constant MOODS = 9;
    uint256 public constant BLOBS = 1 + 18 + 9 + 9;
    bytes1 private constant SENTINEL = 0x01;

    address[] private _chunks;
    /// @dev _starts[i] is the index in _chunks where blob i begins; _starts[BLOBS] == _chunks.length.
    uint32[BLOBS + 1] private _starts;
    /// @dev Positions of the sentinel bytes in the base, ascending. Computed at bake time; checked here.
    uint32[] private _offsets;

    constructor(address[] memory chunks, uint32[] memory starts, uint32[] memory offsets) {
        if (starts.length != BLOBS + 1 || starts[BLOBS] != chunks.length) revert BadLayout();
        for (uint256 i = 0; i < BLOBS; i++) {
            if (starts[i] >= starts[i + 1]) revert BadLayout();
        }
        _chunks = chunks;
        for (uint256 i = 0; i <= BLOBS; i++) {
            _starts[i] = starts[i];
        }
        _offsets = offsets;
        bytes memory base = _blobFrom(chunks, starts[0], starts[1]);
        for (uint256 i = 0; i < offsets.length; i++) {
            if (i > 0 && offsets[i] <= offsets[i - 1]) revert BadLayout();
            if (base[offsets[i]] != SENTINEL) revert BadLayout();
        }
    }

    /// @notice The finished SVG for a mood (0 content, 1 happy, 2 hungry, 3 grubby, 4 bored, 5 sleepy,
    ///         6 sleeping, 7 sad, 8 dead), crowned or not.
    function image(uint8 mood, bool crowned) external view returns (string memory) {
        if (mood >= MOODS) revert BadMood();
        bytes memory pre = _blob(19 + mood);
        bytes memory post = _blob(28 + mood);
        bytes memory base = _blob(0);
        bytes memory patch = _blob(1 + uint256(mood) * 2 + (crowned ? 1 : 0));
        bytes memory out = new bytes(pre.length + base.length + patch.length + post.length);
        uint256 n = _copy(out, 0, pre, 0, pre.length);
        n = _splice(out, n, base, patch);
        n = _copy(out, n, post, 0, post.length);
        assembly {
            mstore(out, n)
        }
        return string(out);
    }

    /// @notice Raw blob i, for inspection.
    function blob(uint256 i) external view returns (bytes memory) {
        return _blob(i);
    }

    function chunkCount() external view returns (uint256) {
        return _chunks.length;
    }

    // ---------------------------------------------------------------- internals

    /// @dev Copies base into out, replacing each sentinel (positions known) with the next 0x01-separated
    ///      value of patch. Patch values are short, so scanning them is cheap.
    function _splice(bytes memory out, uint256 n, bytes memory base, bytes memory patch) private view returns (uint256) {
        uint256 pi = 0; // read position in patch
        uint256 run = 0; // start of the current literal run in base
        uint256 count = _offsets.length;
        for (uint256 k = 0; k < count; k++) {
            uint256 i = _offsets[k];
            n = _copy(out, n, base, run, i - run);
            run = i + 1;
            uint256 vend = pi;
            while (vend < patch.length && patch[vend] != SENTINEL) vend++;
            n = _copy(out, n, patch, pi, vend - pi);
            pi = vend + 1;
        }
        return _copy(out, n, base, run, base.length - run);
    }

    function _copy(bytes memory dst, uint256 at, bytes memory src, uint256 from, uint256 count) private pure returns (uint256) {
        if (count == 0) return at;
        assembly {
            mcopy(add(add(dst, 32), at), add(add(src, 32), from), count)
        }
        return at + count;
    }

    function _blob(uint256 i) private view returns (bytes memory data) {
        uint256 from = _starts[i];
        uint256 to = _starts[i + 1];
        address[] memory chunks = new address[](to - from);
        for (uint256 c = from; c < to; c++) {
            chunks[c - from] = _chunks[c];
        }
        return _blobFrom(chunks, 0, chunks.length);
    }

    function _blobFrom(address[] memory chunks, uint256 from, uint256 to) private view returns (bytes memory data) {
        uint256 total;
        for (uint256 c = from; c < to; c++) {
            address p = chunks[c];
            uint256 size;
            assembly {
                size := extcodesize(p)
            }
            total += size - 1;
        }
        data = new bytes(total);
        uint256 at = 0;
        for (uint256 c = from; c < to; c++) {
            address p = chunks[c];
            uint256 size;
            assembly {
                size := sub(extcodesize(p), 1)
                extcodecopy(p, add(add(data, 32), at), 1, size)
            }
            at += size;
        }
    }
}

/// @dev SSTORE2: data stored as the code of a throwaway contract, behind a STOP byte so it can never run.
library SSTORE2 {
    error WriteFailed();

    function write(bytes memory data) internal returns (address pointer) {
        bytes memory code = abi.encodePacked(hex"600B5981380380925939F3", hex"00", data);
        assembly {
            pointer := create(0, add(code, 32), mload(code))
        }
        if (pointer == address(0)) revert WriteFailed();
    }
}
