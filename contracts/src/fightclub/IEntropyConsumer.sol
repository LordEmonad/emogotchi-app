// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @notice Pyth's consumer base, vendored verbatim (code and comments unchanged; only the SPDX line
///         is normalised from Pyth's "Apache 2") from Pyth's published SDK
///         (github.com/pyth-network/pyth-crosschain, target_chains/ethereum/entropy_sdk/solidity/IEntropyConsumer.sol,
///         Apache-2.0). Entropy calls `_entropyCallback(uint64,address,bytes32)` (selector 0x52a5f1f8) on the contract
///         that made the request; the base checks the caller is the Entropy contract and hands on to `entropyCallback`.
abstract contract IEntropyConsumer {
    // This method is called by Entropy to provide the random number to the consumer.
    // It asserts that the msg.sender is the Entropy contract. It is not meant to be
    // override by the consumer.
    function _entropyCallback(
        uint64 sequence,
        address provider,
        bytes32 randomNumber
    ) external {
        address entropy = getEntropy();
        require(entropy != address(0), "Entropy address not set");
        require(msg.sender == entropy, "Only Entropy can call this function");

        entropyCallback(sequence, provider, randomNumber);
    }

    // getEntropy returns Entropy contract address. The method is being used to check that the
    // callback is indeed from Entropy contract. The consumer is expected to implement this method.
    // Entropy address can be found here - https://docs.pyth.network/entropy/contract-addresses
    function getEntropy() internal view virtual returns (address);

    // This method is expected to be implemented by the consumer to handle the random number.
    // It will be called by _entropyCallback after _entropyCallback ensures that the call is
    // indeed from Entropy contract.
    function entropyCallback(
        uint64 sequence,
        address provider,
        bytes32 randomNumber
    ) internal virtual;
}
