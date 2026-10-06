// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @notice The part of Pyth Entropy v2 that Fight Club calls, vendored from Pyth's published SDK
///         (github.com/pyth-network/pyth-crosschain, target_chains/ethereum/entropy_sdk/solidity/IEntropyV2.sol,
///         Apache-2.0). Only the functions used here are declared; their signatures are copied unchanged, and each
///         selector was checked against the live Entropy on Monad (0xD458261E832415CFd3BAE5E416FdF3230ce6F134) with
///         read-only calls on 2026-09-28:
///           getDefaultProvider()          0x82ee990c  -> 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506
///           getFeeV2(uint32)              0xca1642e1  -> 1.4 MON for any limit up to 1,000,000 (the provider's default)
///           getFeeV2(address,uint32)      0x7ab2ac36  -> the same
///           requestV2(uint32)             0x0bed189f  (an eth_call with 1.4 MON returns the next sequence number,
///           requestV2(address,uint32)     0x0e33da29   and with 1.3 MON reverts InsufficientFee 0x025dbdd4)
///
///         What the implementation does with a request (Entropy.sol, read 2026-09-28): the gas limit is rounded up to a
///         multiple of 10,000 and raised to the provider's default (1,000,000 on Monad); the callback is then run with
///         exactly that much gas through a call that catches reverts. If the consumer reverts, the request is marked
///         failed (the random number is published in the event) and anyone may retry it later, uncapped. Excess fee is
///         NOT refunded by Entropy, so callers must pay exactly getFeeV2.
interface IEntropyV2 {
    /// @notice Request a random number from the default provider; `entropyCallback` runs with `gasLimit`.
    function requestV2(uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber);

    /// @notice Request a random number from `provider`; `entropyCallback` runs with `gasLimit`.
    function requestV2(address provider, uint32 gasLimit) external payable returns (uint64 assignedSequenceNumber);

    /// @notice The address of the default provider.
    function getDefaultProvider() external view returns (address provider);

    /// @notice The fee of the default provider for a callback of `gasLimit`.
    function getFeeV2(uint32 gasLimit) external view returns (uint128 feeAmount);

    /// @notice The fee of `provider` for a callback of `gasLimit`.
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint128 feeAmount);
}
