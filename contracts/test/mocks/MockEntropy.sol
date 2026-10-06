// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IEntropyConsumer} from "../../src/fightclub/IEntropyConsumer.sol";

/**
 * @title  MockEntropy
 * @notice FOR LOCAL FORKS AND TESTS ONLY. NEVER DEPLOY THIS TO A PUBLIC CHAIN: anyone may call `reveal` with any
 *         number they like, so on a real chain whoever calls it first picks every fight's winner.
 *
 *         It stands in for Pyth Entropy v2 where Pyth's keeper cannot reach (an anvil fork, forge tests), with the
 *         same functions Fight Club calls (`getDefaultProvider`, `getFeeV2`, `requestV2`) and the same way of
 *         answering: `reveal(seq, random)` runs the requester's `_entropyCallback` with the request's gas limit
 *         (rounded up to 10k and raised to the default, as Pyth does) through a call that catches a revert. A revert
 *         marks the request failed; revealing a failed request again calls straight through, uncapped, with the
 *         number first revealed (Pyth's recovery path). Like Pyth, it keeps the whole fee, excess included.
 *
 *         Sequence numbers are one counter for every provider, so `reveal` needs only the sequence. It emits Pyth's
 *         own `Requested` and `Revealed` events (EntropyEventsV2) so a local keeper can listen with Pyth's ABI.
 */
contract MockEntropy {
    uint8 public constant NONE = 0;
    uint8 public constant PENDING = 1;
    uint8 public constant FAILED = 2;
    uint8 public constant DONE = 3;

    struct Request {
        address requester;
        address provider;
        uint32 gasLimit; // the effective limit the callback gets
        uint8 status;
        bytes32 random; // what was revealed, once revealed
    }

    uint64 public nextSequence = 1;
    uint128 public fee = 1.4 ether;
    uint32 public defaultGasLimit = 1_000_000;
    address public defaultProvider = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506; // Pyth's default on Monad
    mapping(uint64 => Request) public requests;

    event Requested(
        address indexed provider,
        address indexed caller,
        uint64 indexed sequenceNumber,
        bytes32 userContribution,
        uint32 gasLimit,
        bytes extraArgs
    );
    event Revealed(
        address indexed provider,
        address indexed caller,
        uint64 indexed sequenceNumber,
        bytes32 randomNumber,
        bytes32 userContribution,
        bytes32 providerContribution,
        bool callbackFailed,
        bytes callbackReturnValue,
        uint32 callbackGasUsed,
        bytes extraArgs
    );

    error InsufficientFee();
    error NoSuchRequest();
    error InsufficientGas();

    // ---------------------------------------------------------------- local knobs (anyone: this is a mock)
    function setFee(uint128 f) external {
        fee = f;
    }

    function setDefaultProvider(address p) external {
        defaultProvider = p;
    }

    function setDefaultGasLimit(uint32 g) external {
        defaultGasLimit = g;
    }

    // ---------------------------------------------------------------- Pyth's interface
    function getDefaultProvider() external view returns (address) {
        return defaultProvider;
    }

    function getFeeV2() external view returns (uint128) {
        return _fee(0);
    }

    function getFeeV2(uint32 gasLimit) external view returns (uint128) {
        return _fee(gasLimit);
    }

    function getFeeV2(address, uint32 gasLimit) external view returns (uint128) {
        return _fee(gasLimit);
    }

    function requestV2(uint32 gasLimit) external payable returns (uint64) {
        return _request(defaultProvider, gasLimit);
    }

    function requestV2(address provider, uint32 gasLimit) external payable returns (uint64) {
        return _request(provider, gasLimit);
    }

    // ---------------------------------------------------------------- the keeper's side
    /// @notice Answer request `seq` with `random`. The first reveal runs the callback with the request's gas limit and
    ///         catches a revert (the request is then FAILED); revealing a FAILED request calls straight through with
    ///         the number first revealed, and a revert there reverts this call.
    function reveal(uint64 seq, bytes32 random) external returns (bool ok) {
        Request storage r = requests[seq];
        if (r.status == PENDING) {
            r.random = random;
            address requester = r.requester;
            uint256 limit = r.gasLimit;
            bytes memory data = abi.encodeCall(IEntropyConsumer._entropyCallback, (seq, r.provider, random));
            uint256 start = gasleft();
            if (requester.code.length == 0) {
                ok = true;
            } else {
                assembly ("memory-safe") {
                    ok := call(limit, requester, 0, add(data, 32), mload(data), 0, 0)
                }
            }
            uint256 used = start - gasleft();
            if (!ok && (start * 31) / 32 <= limit) revert InsufficientGas(); // as Pyth: the caller starved it
            r.status = ok ? DONE : FAILED;
            emit Revealed(r.provider, requester, seq, random, bytes32(0), bytes32(0), !ok, "", uint32(used), "");
        } else if (r.status == FAILED) {
            r.status = DONE;
            random = r.random;
            IEntropyConsumer(r.requester)._entropyCallback(seq, r.provider, random);
            emit Revealed(r.provider, r.requester, seq, random, bytes32(0), bytes32(0), false, "", 0, "");
            ok = true;
        } else {
            revert NoSuchRequest();
        }
    }

    /// @notice The status of a request: 0 none, 1 pending, 2 failed, 3 done.
    function statusOf(uint64 seq) external view returns (uint8) {
        return requests[seq].status;
    }

    // ---------------------------------------------------------------- internals
    function _effective(uint32 gasLimit) private view returns (uint32) {
        uint32 g = gasLimit < defaultGasLimit ? defaultGasLimit : gasLimit;
        return ((g + 9_999) / 10_000) * 10_000;
    }

    function _fee(uint32 gasLimit) private view returns (uint128) {
        uint32 g = _effective(gasLimit);
        if (defaultGasLimit == 0 || g <= defaultGasLimit) return fee;
        return uint128((uint256(fee) * g) / defaultGasLimit);
    }

    function _request(address provider, uint32 gasLimit) private returns (uint64 seq) {
        if (msg.value < _fee(gasLimit)) revert InsufficientFee();
        seq = nextSequence++;
        uint32 g = _effective(gasLimit);
        requests[seq] = Request(msg.sender, provider, g, PENDING, bytes32(0));
        emit Requested(provider, msg.sender, seq, bytes32(0), g, "");
    }
}
